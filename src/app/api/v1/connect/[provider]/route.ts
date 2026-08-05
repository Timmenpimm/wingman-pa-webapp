import { NextResponse } from "next/server";
import { authUrlFor } from "@/connectors";
import type { Provider } from "@/lib/types";

// GET /api/v1/connect/{provider} — redirect naar de OAuth-flow (Nango).
// Zonder Nango-config draait de app op seed-data; dan zegt hij dat eerlijk in
// plaats van een kapotte redirect te doen.
export async function GET(_req: Request, { params }: { params: { provider: string } }) {
  const url = authUrlFor(params.provider as Provider);
  if (!url) {
    return NextResponse.json(
      {
        error: "Geen OAuth geconfigureerd",
        detail: "Zet NANGO_HOST en NANGO_PUBLIC_KEY in .env. Dev draait op seed-data.",
      },
      { status: 501 },
    );
  }
  return NextResponse.redirect(url);
}
