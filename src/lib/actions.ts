"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/db/client";
import { withUser, type Tx } from "@/lib/db/with-user";
// Het adres moet uniek zijn over álle gebruikers heen; die controle kan per
// definitie niet achter RLS langs.
import { ownerPrisma } from "@/lib/db/owner-prisma";
import { localDayStart } from "@/lib/day";
import { clamp } from "@/lib/text";
import { decideToolCall, requestTool } from "@/lib/tools/execute";
import {
  FINISHED_KEY,
  FINISH_PATH,
  isStepId,
  markKey,
  nextStep,
  stepDefinition,
  stepPath,
  type StepId,
} from "@/lib/onboarding/steps";
import { PERMISSION_LABELS } from "@/lib/types";
import { signIn } from "../../auth";

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

/**
 * Google koppelen vanuit de onboarding.
 *
 * Niet via /api/v1/connect/google: die route gaat over Nango, en agenda + mail
 * lopen sinds de Google-provider in auth.ts juist niet meer via Nango. Hij gaf
 * daar 501 terug, wat in de onboarding een knop opleverde die alleen een
 * foutmelding in beeld zette. Dit is dezelfde flow als "Inloggen met Google"
 * op /inloggen: één consentscherm voor agenda én mail, en de signIn-callback
 * schrijft beide Connector-rijen weg.
 *
 * `redirectTo` komt niet rechtstreeks uit de aanroep maar uit stepPath() na
 * een controle op een bekende stap-id — een pad dat van buiten komt zou hier
 * anders een open redirect zijn.
 *
 * Wie zich met een ánder Google-account aanmeldt dan waarmee hij is ingelogd,
 * komt in dat andere account terecht. Dat is bestaand gedrag van de
 * signIn-callback (koppelen op e-mailadres), niet iets dat hier ontstaat.
 */
export async function connectGoogle(vanaf: string) {
  await signIn("google", { redirectTo: terugPad(vanaf) });
}

/**
 * Waar de gebruiker na het consentscherm terugkomt: de stap waar hij stond, of
 * Instellingen — sinds "Bron toevoegen" kun je daar ook koppelen, en dan in de
 * wizard belanden is een verdwaling.
 *
 * Alleen bekende namen worden een pad. Een pad dat van buiten komt zou hier
 * anders een open redirect zijn.
 */
function terugPad(vanaf: string): string {
  if (isStepId(vanaf)) return stepPath(vanaf);
  return vanaf === "instellingen" ? "/instellingen" : "/onboarding";
}

/**
 * Eén stap van de onboarding afronden: permissie vastleggen als die gevraagd
 * is, de stap markeren als hij overgeslagen of met de hand afgevinkt wordt, en
 * doorlopen naar de volgende.
 *
 * Drie knoppen ("Volgende", "Overslaan", "Staat erop") delen deze ene actie —
 * ze verschillen alleen in het verborgen veld `markeer`. Dat scheelt drie
 * bijna-identieke server actions die uit elkaar kunnen gaan lopen.
 *
 * De permissie gaat naar álle connectors van deze stap tegelijk. Een inlog met
 * Google levert twee rijen op (agenda + gmail) en die vallen in verschillende
 * stappen; binnen één stap is het altijd dezelfde bron, dus dezelfde vraag.
 */
export async function continueOnboarding(step: StepId, data: FormData) {
  const userId = await currentUserId();
  const mark = String(data.get("markeer") ?? "");
  const permission = String(data.get("permission") ?? "");
  const providers = stepDefinition(step).providers;

  await withUser(userId, async (tx) => {
    if (mark === "skipped" || mark === "done") {
      const key = markKey(step);
      await tx.userSetting.upsert({
        where: { user_id_key: { user_id: userId, key } },
        create: { user_id: userId, key, value: mark },
        update: { value: mark },
      });
    }

    if (permission in PERMISSION_LABELS && providers.length > 0) {
      await tx.connector.updateMany({
        where: { user_id: userId, provider: { in: providers } },
        data: { permission },
      });
    }
  });

  revalidatePath("/onboarding", "layout");
  revalidatePath("/instellingen");

  const next = nextStep(step);
  redirect(next ? stepPath(next) : FINISH_PATH);
}

/**
 * De onboarding uitlopen. Zet alleen een tijdstempel: wélke stappen je
 * oversloeg blijft leesbaar in dezelfde tabel, zodat Instellingen later kan
 * laten zien wat er nog open ligt zonder opnieuw te gaan zeuren.
 */
export async function finishOnboarding() {
  const userId = await currentUserId();
  await withUser(userId, (tx) =>
    tx.userSetting.upsert({
      where: { user_id_key: { user_id: userId, key: FINISHED_KEY } },
      create: { user_id: userId, key: FINISHED_KEY, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    }),
  );
  revalidatePath("/onboarding", "layout");
  revalidatePath("/");
  redirect("/");
}

/**
 * Een tool aanroepen. Of het ook echt gebeurt, beslist de permissiepoort in
 * src/lib/tools/permission.ts — deze functie is alleen de ingang die de UI, de
 * REST-laag en straks de nachtelijke run delen.
 */
export async function runTool(name: string, params: unknown) {
  const userId = await currentUserId();
  const outcome = await requestTool(userId, name, params);
  revalidatePath("/instellingen");
  return outcome;
}

/** Het antwoord op een openstaande vraag. Beide knoppen even makkelijk (regel 4). */
export async function decideTool(id: string, decision: "approve" | "reject") {
  const userId = await currentUserId();
  const outcome = await decideToolCall(userId, id, decision);
  revalidatePath("/instellingen");
  revalidatePath("/");
  return outcome;
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

/**
 * Een moment verzetten of uitzetten.
 *
 * Alleen tijdstip en aan/uit: de soorten liggen vast. Een scherm waarin je zelf
 * schema's samenklikt levert acht runs per dag op, en dan is er een
 * meldingenfabriek gebouwd in een app die rust belooft (§3).
 */
export async function updateRun(kind: string, data: FormData) {
  const userId = await currentUserId();
  const at = String(data.get("at") ?? "").trim();
  const enabled = data.get("enabled") === "on";

  // Tijd valideren vóór opslag: een onleesbaar tijdstip zou de planner elke
  // vijftien minuten laten struikelen op een fout die niemand ziet.
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) return;

  await withUser(userId, (tx) =>
    tx.scheduledRun.updateMany({
      where: { user_id: userId, kind },
      // last_run_on wissen: zet je het moment naar later vandaag, dan hoort hij
      // vandaag nog te kunnen draaien.
      data: { at, enabled, last_run_on: null },
    }),
  );
  revalidatePath("/instellingen");
}

/**
 * Je eigen e-mailadres wijzigen.
 *
 * Dit bestond niet, en dat was een echt gat: het adres bepaalt waar de
 * geplande momenten heen gaan én waarmee je inlogt. Zonder dit scherm kon
 * alleen iemand met databasetoegang het veranderen — voor een app die om
 * 08:00 een briefing stuurt is dat geen randgeval maar de eerste stap.
 *
 * De sessie blijft geldig: die hangt aan het gebruikers-id, niet aan het
 * adres. Je hoeft dus niet opnieuw in te loggen, maar de volgende keer doe je
 * dat wel met het nieuwe adres.
 */
export async function updateEmail(data: FormData): Promise<{ fout?: string }> {
  const userId = await currentUserId();
  const nieuw = String(data.get("email") ?? "").trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nieuw)) {
    return { fout: "Dat ziet er niet uit als een e-mailadres." };
  }

  const bezet = await ownerPrisma.user.findUnique({ where: { email: nieuw } });
  if (bezet && bezet.id !== userId) {
    // Niet verklappen van wie: dat zou een manier zijn om te achterhalen wie
    // er een account heeft.
    return { fout: "Dit adres kan niet gebruikt worden." };
  }

  await withUser(userId, (tx) => tx.user.update({ where: { id: userId }, data: { email: nieuw } }));

  revalidatePath("/instellingen");
  return {};
}

/**
 * Account definitief verwijderen ("Je gegevens" in Instellingen).
 *
 * Eén DELETE op de User-rij: elke andere tabel heeft ON DELETE CASCADE naar
 * User.id (zie prisma/schema.prisma en de migraties eronder — GraphNode en
 * GraphEdge kregen die pas in 20260807170000_graph_cascade_delete), dus die
 * rijen verdwijnen in dezelfde transactie mee. Geen tabel-voor-tabel
 * opruimlijst die uit de pas kan lopen met een nieuw model.
 *
 * Loopt via ownerPrisma, niet withUser(): net als het inlogpad
 * (src/lib/db/owner-prisma.ts) is hier geen sessie/RLS-omweg nodig voor een
 * verwijdering die toch al alleen de eigen rij raakt — de eigenaarsrol is
 * het minimale pad voor een enkele DELETE die op databaseniveau cascadeert.
 *
 * Roept zelf geen signOut aan: de aanroeper in Instellingen doet dat pas na
 * een geslaagde delete, zodat de sessie pas verdwijnt als de data er
 * werkelijk niet meer is.
 */
export async function deleteAccount(): Promise<void> {
  const userId = await currentUserId();
  await ownerPrisma.user.delete({ where: { id: userId } });
}
