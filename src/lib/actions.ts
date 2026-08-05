"use server";

import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/db/client";
import { withUser, type Tx } from "@/lib/db/with-user";
import { localDayStart } from "@/lib/day";
import { clamp } from "@/lib/text";

/**
 * Alle mutaties op één plek. De REST-routes onder /api/v1 roepen dezelfde
 * functies aan als de knoppen in de UI — één gedrag, twee ingangen. Zo kan de
 * PWA-notificatie ("afvinken" vanuit de push) niet uit de pas lopen met het
 * scherm.
 *
 * Elke exportfunctie hieronder haalt zelf de userId op en wikkelt zijn eigen
 * body in withUser() — de handtekeningen blijven ongewijzigd (form actions
 * binden er direct op via .bind(null, ...) en kunnen geen tx doorgeven), dus
 * verandert er voor de aanroepers niets. RLS zit onzichtbaar achter elke call.
 */

async function briefingToday(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  // Zelfde dagbepaling als het scherm: anders vinkt een knop een briefing af
  // die niet degene is die je voor je ziet.
  const briefing = await tx.dailyBriefing.findFirst({
    where: { user_id: userId, date: localDayStart(user?.timezone ?? "Europe/Amsterdam") },
  });
  return { userId, briefing };
}

export async function setFrogStatus(status: "open" | "done" | "deferred") {
  const userId = await currentUserId();
  await withUser(userId, async (tx) => {
    const { briefing } = await briefingToday(tx, userId);
    if (!briefing) return;
    await tx.dailyBriefing.update({
      where: { id: briefing.id },
      data: { frog_status: status },
    });
  });
  revalidatePath("/");
}

export async function togglePriority(id: string) {
  const userId = await currentUserId();
  await withUser(userId, async (tx) => {
    const { briefing } = await briefingToday(tx, userId);
    if (!briefing) return;
    const items = JSON.parse(briefing.priorities) as Array<{
      id: string;
      text: string;
      done: boolean;
    }>;
    const next = items.map((p) => (p.id === id ? { ...p, done: !p.done } : p));
    await tx.dailyBriefing.update({
      where: { id: briefing.id },
      data: { priorities: JSON.stringify(next) },
    });
  });
  revalidatePath("/");
}

/**
 * "Nog te bevestigen" leegmaken is de belangrijkste interactie in de app (§6.1).
 * Ja én nee sluiten het item allebei af — een nee mag geen extra scherm of
 * vervolgvraag opleveren, anders blijft de lijst staan.
 */
export async function answerConfirmation(id: string, _answer: "yes" | "no") {
  const userId = await currentUserId();
  await withUser(userId, async (tx) => {
    const { briefing } = await briefingToday(tx, userId);
    if (!briefing) return;
    const items = JSON.parse(briefing.confirmations) as Array<{
      id: string;
      text: string;
      answered: boolean;
    }>;
    const next = items.map((c) => (c.id === id ? { ...c, answered: true } : c));
    await tx.dailyBriefing.update({
      where: { id: briefing.id },
      data: { confirmations: JSON.stringify(next) },
    });
  });
  revalidatePath("/");
}

/**
 * "Laat vallen" is net zo makkelijk als "afgehandeld" (§6.2). Geen bevestiging,
 * geen prullenbak-metafoor: een lijst die alleen kan groeien wordt genegeerd.
 */
export async function resolveCommitment(
  id: string,
  action: "done" | "dismissed" | "snoozed",
  days = 3,
) {
  const userId = await currentUserId();
  await withUser(userId, (tx) =>
    tx.commitment.updateMany({
      where: { id, user_id: userId },
      data: {
        status: action,
        snooze_until: action === "snoozed" ? new Date(Date.now() + days * 86_400_000) : null,
        last_nudge_at: action === "snoozed" ? new Date() : undefined,
      },
    }),
  );
  revalidatePath("/open-eindjes");
  revalidatePath("/");
}

export async function reopenCommitment(id: string) {
  const userId = await currentUserId();
  await withUser(userId, (tx) =>
    tx.commitment.updateMany({
      where: { id, user_id: userId },
      data: { status: "open", snooze_until: null },
    }),
  );
  revalidatePath("/open-eindjes");
}

export async function captureInbox(text: string, source = "capture") {
  const userId = await currentUserId();
  const clean = clamp(text, "inboxItem");
  if (!clean) return;
  await withUser(userId, (tx) =>
    tx.inboxItem.create({
      data: { user_id: userId, text: clean, source },
    }),
  );
  revalidatePath("/inbox");
  revalidatePath("/");
}

export async function triageInbox(
  id: string,
  route: "frog" | "priority" | "commitment" | "dropped",
) {
  const userId = await currentUserId();

  // Eén transactie voor de hele triage: item opzoeken, eventueel een
  // commitment/briefing bijwerken, en het item zelf afsluiten hoort atomisch
  // te gebeuren — anders kan een halve triage blijven hangen (item nog "new"
  // maar de commitment al aangemaakt, of andersom).
  await withUser(userId, async (tx) => {
    const item = await tx.inboxItem.findFirst({ where: { id, user_id: userId } });
    if (!item) return;

    if (route === "commitment") {
      await tx.commitment.create({
        data: {
          user_id: userId,
          source: "manual",
          source_ref: item.id,
          source_label: "capture",
          direction: "i_owe",
          party: "Jezelf",
          what: clamp(item.text, "looseEndTitle"),
          confidence: 1,
        },
      });
    }

    if (route === "priority") {
      const { briefing } = await briefingToday(tx, userId);
      if (briefing) {
        const items = JSON.parse(briefing.priorities) as Array<{
          id: string;
          text: string;
          done: boolean;
        }>;
        // Max 3 blijft max 3, ook via de inbox: de oudste afgevinkte gaat eruit.
        const kept = items.filter((p) => !p.done).slice(0, 2);
        await tx.dailyBriefing.update({
          where: { id: briefing.id },
          data: {
            priorities: JSON.stringify([
              ...kept,
              { id: item.id, text: clamp(item.text, "priority"), done: false },
            ]),
          },
        });
      }
    }

    if (route === "frog") {
      const { briefing } = await briefingToday(tx, userId);
      if (briefing) {
        await tx.dailyBriefing.update({
          where: { id: briefing.id },
          data: { frog_title: clamp(item.text, "frogTitle"), frog_status: "open" },
        });
      }
    }

    await tx.inboxItem.update({
      where: { id: item.id },
      data: { status: route === "dropped" ? "dropped" : "triaged", routed_to: route },
    });
  });

  revalidatePath("/inbox");
  revalidatePath("/");
}

export async function setConnectorPermission(id: string, permission: string) {
  const userId = await currentUserId();
  await withUser(userId, (tx) =>
    tx.connector.updateMany({
      where: { id, user_id: userId },
      data: { permission },
    }),
  );
  revalidatePath("/instellingen");
}

export async function updateStyleCard(
  register: string,
  data: { greeting: string; signoff: string },
) {
  const userId = await currentUserId();
  await withUser(userId, (tx) =>
    tx.styleCard.updateMany({
      where: { user_id: userId, register },
      data: { ...data, edited_by_user: true, updated_at: new Date() },
    }),
  );
  revalidatePath("/stijlkaart");
}
