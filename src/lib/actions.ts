"use server";

import { revalidatePath } from "next/cache";
import { prisma, currentUserId } from "@/lib/db/client";
import { startOfDay } from "@/brain/briefing-engine";
import { clamp } from "@/lib/text";

/**
 * Alle mutaties op één plek. De REST-routes onder /api/v1 roepen dezelfde
 * functies aan als de knoppen in de UI — één gedrag, twee ingangen. Zo kan de
 * PWA-notificatie ("afvinken" vanuit de push) niet uit de pas lopen met het
 * scherm.
 */

async function briefingToday() {
  const userId = await currentUserId();
  const briefing = await prisma.dailyBriefing.findFirst({
    where: { user_id: userId, date: startOfDay(new Date()) },
  });
  return { userId, briefing };
}

export async function setFrogStatus(status: "open" | "done" | "deferred") {
  const { briefing } = await briefingToday();
  if (!briefing) return;
  await prisma.dailyBriefing.update({
    where: { id: briefing.id },
    data: { frog_status: status },
  });
  revalidatePath("/");
}

export async function togglePriority(id: string) {
  const { briefing } = await briefingToday();
  if (!briefing) return;
  const items = JSON.parse(briefing.priorities) as Array<{
    id: string;
    text: string;
    done: boolean;
  }>;
  const next = items.map((p) => (p.id === id ? { ...p, done: !p.done } : p));
  await prisma.dailyBriefing.update({
    where: { id: briefing.id },
    data: { priorities: JSON.stringify(next) },
  });
  revalidatePath("/");
}

/**
 * "Nog te bevestigen" leegmaken is de belangrijkste interactie in de app (§6.1).
 * Ja én nee sluiten het item allebei af — een nee mag geen extra scherm of
 * vervolgvraag opleveren, anders blijft de lijst staan.
 */
export async function answerConfirmation(id: string, _answer: "yes" | "no") {
  const { briefing } = await briefingToday();
  if (!briefing) return;
  const items = JSON.parse(briefing.confirmations) as Array<{
    id: string;
    text: string;
    answered: boolean;
  }>;
  const next = items.map((c) => (c.id === id ? { ...c, answered: true } : c));
  await prisma.dailyBriefing.update({
    where: { id: briefing.id },
    data: { confirmations: JSON.stringify(next) },
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
  await prisma.commitment.updateMany({
    where: { id, user_id: userId },
    data: {
      status: action,
      snooze_until: action === "snoozed" ? new Date(Date.now() + days * 86_400_000) : null,
      last_nudge_at: action === "snoozed" ? new Date() : undefined,
    },
  });
  revalidatePath("/open-eindjes");
  revalidatePath("/");
}

export async function reopenCommitment(id: string) {
  const userId = await currentUserId();
  await prisma.commitment.updateMany({
    where: { id, user_id: userId },
    data: { status: "open", snooze_until: null },
  });
  revalidatePath("/open-eindjes");
}

export async function captureInbox(text: string, source = "capture") {
  const userId = await currentUserId();
  const clean = clamp(text, "inboxItem");
  if (!clean) return;
  await prisma.inboxItem.create({
    data: { user_id: userId, text: clean, source },
  });
  revalidatePath("/inbox");
  revalidatePath("/");
}

export async function triageInbox(
  id: string,
  route: "frog" | "priority" | "commitment" | "dropped",
) {
  const userId = await currentUserId();
  const item = await prisma.inboxItem.findFirst({ where: { id, user_id: userId } });
  if (!item) return;

  if (route === "commitment") {
    await prisma.commitment.create({
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
    const { briefing } = await briefingToday();
    if (briefing) {
      const items = JSON.parse(briefing.priorities) as Array<{
        id: string;
        text: string;
        done: boolean;
      }>;
      // Max 3 blijft max 3, ook via de inbox: de oudste afgevinkte gaat eruit.
      const kept = items.filter((p) => !p.done).slice(0, 2);
      await prisma.dailyBriefing.update({
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
    const { briefing } = await briefingToday();
    if (briefing) {
      await prisma.dailyBriefing.update({
        where: { id: briefing.id },
        data: { frog_title: clamp(item.text, "frogTitle"), frog_status: "open" },
      });
    }
  }

  await prisma.inboxItem.update({
    where: { id: item.id },
    data: { status: route === "dropped" ? "dropped" : "triaged", routed_to: route },
  });

  revalidatePath("/inbox");
  revalidatePath("/");
}

export async function setConnectorPermission(id: string, permission: string) {
  const userId = await currentUserId();
  await prisma.connector.updateMany({
    where: { id, user_id: userId },
    data: { permission },
  });
  revalidatePath("/instellingen");
}

export async function updateStyleCard(
  register: string,
  data: { greeting: string; signoff: string },
) {
  const userId = await currentUserId();
  await prisma.styleCard.updateMany({
    where: { user_id: userId, register },
    data: { ...data, edited_by_user: true, updated_at: new Date() },
  });
  revalidatePath("/stijlkaart");
}
