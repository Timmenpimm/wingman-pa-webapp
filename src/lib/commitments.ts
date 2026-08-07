import { withUser } from "@/lib/db/with-user";
import { clamp } from "@/lib/text";

/**
 * Open eindjes, gegroepeerd zoals §6.2 het scherm beschrijft: "ik moet iets"
 * naast "ik wacht op iemand". Die scheiding is het hele punt van het scherm —
 * de twee vragen een ander soort actie.
 *
 * Gesnoozde items komen terug zodra hun datum verstreken is; ze verdwijnen dus
 * niet stil uit het systeem.
 *
 * getOpenCommitments() wikkelt zichzelf in withUser() — de handtekening blijft
 * (userId) zodat aanroepers (o.a. open-eindjes/page.tsx) ongewijzigd blijven
 * werken; RLS zit hier verder onzichtbaar achter.
 */

export interface LooseEnd {
  id: string;
  what: string;
  context?: string;
  party: string;
  source: string;
  source_label: string;
  opened_at: string;
  due_date?: string;
  direction: string;
  project?: string;
}

export interface LooseEnds {
  i_owe: LooseEnd[];
  they_owe: LooseEnd[];
  total: number;
}

export async function getOpenCommitments(userId: string): Promise<LooseEnds> {
  return withUser(userId, async (tx) => {
    const now = new Date();
    const rows = await tx.commitment.findMany({
      where: {
        user_id: userId,
        OR: [{ status: "open" }, { status: "snoozed", snooze_until: { lte: now } }],
      },
      orderBy: { opened_at: "asc" },
    });

    const projects = await tx.project.findMany({
      where: { user_id: userId },
      select: { id: true, name: true },
    });
    const projectName = new Map(projects.map((p) => [p.id, p.name]));

    const map = (r: (typeof rows)[number]): LooseEnd => ({
      id: r.id,
      what: clamp(r.what, "looseEndTitle"),
      context: r.context ? clamp(r.context, "looseEndDescription") : undefined,
      party: r.party,
      source: r.source,
      source_label: r.source_label ?? r.source,
      opened_at: r.opened_at.toISOString(),
      due_date: r.due_date?.toISOString(),
      direction: r.direction,
      project: r.project_id ? projectName.get(r.project_id) : undefined,
    });

    return {
      i_owe: rows.filter((r) => r.direction === "i_owe").map(map),
      they_owe: rows.filter((r) => r.direction === "they_owe").map(map),
      total: rows.length,
    };
  });
}
