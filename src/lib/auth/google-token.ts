import { decryptOptional, encryptSecret } from "@/lib/crypto/secrets";
import { withUser } from "@/lib/db/with-user";

/**
 * Token-refresh voor Google-connectors (agenda + gmail delen één
 * refresh_token, want het is dezelfde OAuth-grant — zie google-connectors.ts).
 *
 * De logica staat in kleine, pure functies (needsRefresh, parseRefreshResponse)
 * zodat ze zonder database of netwerk te testen zijn; getValidGoogleAccessToken()
 * is de dunne, onzuivere laag eromheen die fetch en withUser() aanroept.
 */

/** Gooi je als refresh_token door Google geweigerd is (invalid_grant) — de aanroeper moet de connector op reauth_required zetten. */
export class ReauthRequiredError extends Error {
  constructor(message = "Refresh_token is ongeldig of ingetrokken — connector moet opnieuw gekoppeld worden.") {
    super(message);
    this.name = "ReauthRequiredError";
  }
}

export interface GoogleConnectorTokenState {
  id: string;
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: Date | null;
}

const REFRESH_MARGIN_MS = 60_000; // ververs iets vóór het echte verlooptijdstip

/** Pure functie: heeft dit token verversing nodig op tijdstip `now`? */
export function needsRefresh(expiresAt: Date | null, now: Date = new Date()): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - REFRESH_MARGIN_MS <= now.getTime();
}

interface GoogleTokenSuccessBody {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

/**
 * Pure functie: vertaalt het HTTP-antwoord van Google's token-endpoint naar
 * ofwel een geldig nieuw token, ofwel een gooit een specifieke fout.
 * Geen fetch hierin — dat maakt 'm zonder netwerk testbaar.
 */
export function parseRefreshResponse(
  status: number,
  body: unknown,
  now: Date = new Date(),
): { access_token: string; expires_at: Date } {
  if (status < 200 || status >= 300) {
    const errorCode = isRecord(body) && typeof body.error === "string" ? body.error : undefined;
    if (errorCode === "invalid_grant") {
      throw new ReauthRequiredError();
    }
    throw new Error(`Google token-refresh mislukt (HTTP ${status}${errorCode ? `, ${errorCode}` : ""})`);
  }

  if (!isRecord(body) || typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new Error("Onverwacht antwoord van Google's token-endpoint.");
  }
  const data = body as unknown as GoogleTokenSuccessBody;
  return {
    access_token: data.access_token,
    expires_at: new Date(now.getTime() + data.expires_in * 1000),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Onzuiver: praat echt met Google om een nieuw access_token te krijgen. */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  now: Date = new Date(),
): Promise<{ access_token: string; expires_at: Date }> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET ontbreken — kan geen token verversen.");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return parseRefreshResponse(res.status, body, now);
}

/**
 * Geeft een geldig access_token terug voor deze connector: het bestaande als
 * dat nog niet (bijna) verlopen is, anders een net ververst token — dat wordt
 * meteen weggeschreven zodat de volgende aanroep het cachen kan hergebruiken.
 * Weigert Google het refresh_token (ingetrokken toegang), dan gaat de
 * connector op `reauth_required` en gooit deze functie ReauthRequiredError.
 */
export async function getValidGoogleAccessToken(
  connector: GoogleConnectorTokenState,
  now: Date = new Date(),
): Promise<string> {
  // De kolommen bevatten versleutelde waarden; hier is het enige punt waar ze
  // weer leesbaar worden, en ze verlaten deze functie alleen als access_token
  // richting Google. Het refresh_token gaat nooit verder dan deze regel.
  const huidigAccessToken = decryptOptional(connector.access_token);
  const refreshToken = decryptOptional(connector.refresh_token);

  if (huidigAccessToken && !needsRefresh(connector.expires_at, now)) {
    return huidigAccessToken;
  }

  if (!refreshToken) {
    await markReauthRequired(connector);
    throw new ReauthRequiredError("Geen refresh_token beschikbaar — connector moet opnieuw gekoppeld worden.");
  }

  try {
    const refreshed = await refreshGoogleAccessToken(refreshToken, now);
    await persistRefreshedToken(connector, refreshed);
    return refreshed.access_token;
  } catch (err) {
    if (err instanceof ReauthRequiredError) {
      await markReauthRequired(connector);
    }
    throw err;
  }
}

async function persistRefreshedToken(
  connector: GoogleConnectorTokenState,
  refreshed: { access_token: string; expires_at: Date },
): Promise<void> {
  await withUser(connector.user_id, (tx) =>
    tx.connector.update({
      where: { id: connector.id },
      data: {
        access_token: encryptSecret(refreshed.access_token),
        expires_at: refreshed.expires_at,
        status: "active",
        error_message: null,
      },
    }),
  );
}

async function markReauthRequired(connector: GoogleConnectorTokenState): Promise<void> {
  await withUser(connector.user_id, (tx) =>
    tx.connector.update({
      where: { id: connector.id },
      data: { status: "reauth_required" },
    }),
  );
}
