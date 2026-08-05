import { NextResponse } from "next/server";
import { ToolError } from "./types";

/**
 * Eén foutvorm, één statuscode-tabel. Beide tool-endpoints gebruiken hem, zodat
 * een aanroeper niet hoeft te leren dat de ene route 500 zegt waar de andere
 * 409 zegt voor hetzelfde probleem.
 *
 * Staat los van de route-bestanden omdat Next.js daar alleen handlers als
 * export accepteert — een gedeelde helper ernaast breekt de build.
 */
const STATUS: Record<ToolError["code"], number> = {
  ToolNotFound: 404,
  InvalidParams: 400,
  Permission: 403,
  // Niet 401: de gebruiker is prima ingelogd, de kóppeling is verlopen. Een 401
  // hier zou de client naar het inlogscherm sturen voor het verkeerde probleem.
  Authentication: 409,
  ConnectorOffline: 409,
  RateLimit: 429,
  Timeout: 504,
  ToolFailed: 502,
};

export function toolErrorResponse(e: unknown) {
  if (!(e instanceof ToolError)) throw e;
  return NextResponse.json(
    { error: e.message, code: e.code, remedy: e.remedy },
    { status: STATUS[e.code] },
  );
}
