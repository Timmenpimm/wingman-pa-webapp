import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tick } from "@/lib/runs/execute";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/v1/runs/tick — het touwtje waar de planner aan trekt.
 *
 * Dit endpoint hoort niet bij een ingelogde gebruiker: het draait werk uit
 * voor iedereen die aan de beurt is. Daarom een gedeeld geheim in plaats van
 * een sessie, en daarom staat het onder /api/v1 waar de middleware standaard
 * 401 geeft — de uitzondering wordt hier expliciet verdiend.
 *
 * Wie eraan trekt is inwisselbaar: nu een GitHub Actions-cron, later Inngest.
 * Wat aan de beurt is, wordt hier bepaald en niet in de planner — anders
 * verhuist de tijdzone-logica naar een cron-expressie en klopt hij twee keer
 * per jaar niet meer.
 */
export async function POST(req: Request) {
  const verwacht = process.env.RUNS_SECRET;
  if (!verwacht) {
    return NextResponse.json(
      { error: "Geplande runs zijn niet geconfigureerd", detail: "Zet RUNS_SECRET." },
      { status: 501 },
    );
  }

  const gegeven = req.headers.get("x-runs-secret") ?? "";
  if (!veiligGelijk(gegeven, verwacht)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const uitslag = await tick();
  return NextResponse.json(uitslag, { headers: { "cache-control": "no-store" } });
}

function veiligGelijk(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // Lengteverschil lekt via de vergelijking zelf niet meer dan de lengte, en
  // timingSafeEqual eist gelijke lengte.
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
