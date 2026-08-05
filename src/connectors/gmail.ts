import type {
  AdapterContext,
  ConnectorAdapter,
  ConnectorHealth,
  NormalizedEmail,
} from "@/lib/types";

/**
 * Gmail → NormalizedEmail.
 *
 * Twee dingen die het ontwerp raken:
 *  - Verzonden mail is even belangrijk als ontvangen mail: de stijlkaart (§6.6)
 *    wordt eruit gebouwd. Daarom `is_sent` als eersteklas veld, niet een label.
 *  - v1 verstuurt niets (§2B). Deze adapter heeft bewust geen send().
 *
 * Delta gaat in productie via historyId; hieronder de simpele q-variant.
 */
export const gmail: ConnectorAdapter<NormalizedEmail> = {
  provider: "gmail",
  type: "mail",

  async fetchDelta(ctx: AdapterContext, since?: Date): Promise<NormalizedEmail[]> {
    if (!ctx.accessToken) return [];
    const after = Math.floor((since ?? new Date(Date.now() - 14 * 86_400_000)).getTime() / 1000);
    const list = await gapi<{ messages?: Array<{ id: string }> }>(
      `messages?maxResults=100&q=after:${after}`,
      ctx,
    );

    const out: NormalizedEmail[] = [];
    for (const { id } of list.messages ?? []) {
      const m = await gapi<GmailMessage>(`messages/${id}?format=full`, ctx);
      out.push(toNormalized(m, ctx));
    }
    return out;
  },

  async health(ctx: AdapterContext): Promise<ConnectorHealth> {
    if (!ctx.accessToken) return { status: "not_connected" };
    try {
      await gapi("profile", ctx);
      return { status: "active", last_sync_at: new Date() };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "onbekend";
      return {
        status: msg.includes("401") ? "reauth_required" : "error",
        error_message: msg,
      };
    }
  },
};

async function gapi<T>(path: string, ctx: AdapterContext): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail HTTP ${res.status}`);
  return (await res.json()) as T;
}

function toNormalized(m: GmailMessage, ctx: AdapterContext): NormalizedEmail {
  const h = (name: string) =>
    m.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? "";
  const labels = m.labelIds ?? [];
  const sentAt = new Date(Number(m.internalDate ?? Date.now()));

  return {
    id: `gmail:${m.id}`,
    provider: "gmail",
    account_id: ctx.accountId,
    thread_id: m.threadId,
    subject: h("subject") || "(geen onderwerp)",
    from: parseAddress(h("from")),
    to: h("to").split(",").filter(Boolean).map(parseAddress),
    cc: h("cc").split(",").filter(Boolean).map(parseAddress),
    sent_at: sentAt,
    received_at: sentAt,
    body_text: extractText(m.payload),
    in_reply_to: h("in-reply-to") || undefined,
    labels,
    is_sent: labels.includes("SENT"),
    is_unread: labels.includes("UNREAD"),
    raw: m,
    synced_at: new Date(),
  };
}

function parseAddress(raw: string): { email: string; name?: string } {
  const match = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) return { email: match[2].trim(), name: match[1].trim() || undefined };
  return { email: raw.trim() };
}

function extractText(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const child of part.parts ?? []) {
    const text = extractText(child);
    if (text) return text;
  }
  return "";
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
}

interface GmailPart {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailPart[];
}
