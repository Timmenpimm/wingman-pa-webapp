import { NextResponse } from "next/server";
import { prisma, currentUserId } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// GET /api/v1/connectors — status + gezondheid per connector.
// Tokens gaan hier nooit overheen.
export async function GET() {
  const userId = await currentUserId();
  const rows = await prisma.connector.findMany({
    where: { user_id: userId },
    orderBy: { type: "asc" },
  });
  return NextResponse.json(
    rows.map((c) => ({
      id: c.id,
      provider: c.provider,
      type: c.type,
      label: c.label,
      status: c.status,
      permission: c.permission,
      last_sync_at: c.last_sync_at,
      consent_expires_at: c.consent_expires_at,
      error_message: c.error_message,
    })),
  );
}
