import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/db/client";
import { queryGraph } from "@/lib/graphify/query";
import { badRequest, readJson } from "@/lib/api";

// POST /api/v1/graph/query  { query: "open betalingen", lang: "nl" }
// Antwoord = nodes + edges als kaartjes, niet als ruwe graafdump.
export async function POST(req: Request) {
  const body = await readJson<{ query?: string }>(req);
  if (!body) return badRequest("Verwacht een JSON-body.");
  if (!body.query?.trim()) return badRequest("query is verplicht.");
  const query = body.query;
  const userId = await currentUserId();
  return NextResponse.json(await queryGraph(userId, query));
}
