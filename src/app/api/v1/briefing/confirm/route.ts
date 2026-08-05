import { NextResponse } from "next/server";
import { answerConfirmation, setFrogStatus, togglePriority } from "@/lib/actions";
import { badRequest, readJson } from "@/lib/api";

// POST /api/v1/briefing/confirm
// { block_id: "c1", decision: "yes" | "no" }        → bevestiging afsluiten
// { block_id: "frog", decision: "done"|"deferred" } → frog afvinken/uitstellen
// { block_id: "p1", decision: "toggle" }            → prioriteit omzetten
export async function POST(req: Request) {
  const body = await readJson<{ block_id?: string; decision?: string }>(req);
  if (!body) return badRequest("Verwacht een JSON-body.");
  const { block_id, decision } = body;
  if (!block_id || !decision) return badRequest("block_id en decision zijn verplicht.");

  if (block_id === "frog") {
    if (decision !== "done" && decision !== "deferred" && decision !== "open") {
      return badRequest("onbekende beslissing voor frog.");
    }
    await setFrogStatus(decision);
  } else if (decision === "toggle") {
    await togglePriority(block_id);
  } else if (decision === "yes" || decision === "no") {
    await answerConfirmation(block_id, decision);
  } else {
    return badRequest("onbekende beslissing.");
  }

  return NextResponse.json({ ok: true });
}
