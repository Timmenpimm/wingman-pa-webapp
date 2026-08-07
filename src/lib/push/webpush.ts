import webpush from "web-push";

/**
 * Dunne laag om de `web-push`-package (VAPID + aes128gcm-encryptie van de
 * payload) — dat protocol zelf bouwen is geen redelijke optie, vandaar de
 * enige nieuwe dependency in deze PR. Deze module isoleert 'm zodat de rest
 * van de app (notify.ts, de escalatie-engine) niet rechtstreeks tegen de
 * package-API praat en tests 'm kunnen mocken zonder een echte pushdienst
 * aan te roepen.
 */

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** `null` = niet geconfigureerd — de aanroeper slaat push dan stil over. */
export function vapidConfigFromEnv(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
}

export interface PushSendResult {
  ok: boolean;
  /** 404/410 van de pushdienst: het abonnement bestaat niet meer, opruimen. */
  expired: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Verstuurt één push-melding naar één abonnement. Geen throw bij een
 * mislukte aanroep — de aanroeper beslist per abonnement wat er met het
 * resultaat gebeurt (opruimen bij expired, gewoon doortellen bij een andere
 * fout), dus een gefaalde push bij het ene toestel mag de andere niet raken.
 */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: PushPayload,
  vapid: VapidConfig,
): Promise<PushSendResult> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    return { ok: true, expired: false };
  } catch (err) {
    const statusCode = isStatusCodeError(err) ? err.statusCode : undefined;
    const expired = statusCode === 404 || statusCode === 410;
    return {
      ok: false,
      expired,
      statusCode,
      error: err instanceof Error ? err.message : "onbekende fout",
    };
  }
}

function isStatusCodeError(err: unknown): err is { statusCode: number } {
  return typeof err === "object" && err !== null && typeof (err as { statusCode?: unknown }).statusCode === "number";
}
