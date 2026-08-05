import { z } from "zod";
import type {
  AdapterContext,
  ConnectorAdapter,
  ConnectorHealth,
  NormalizedEvent,
} from "@/lib/types";
import type { ConnectorTool } from "@/lib/tools/types";
import { formatDayLong, formatTime } from "@/lib/text";

/**
 * Google Calendar → NormalizedEvent.
 *
 * Delta-sync gaat in productie via syncToken (events.list met syncToken uit de
 * vorige run); bij 410 GONE volgt een volledige resync. Restricted scope
 * (calendar.readonly) vereist een CASA-assessment vóór productie — tot die tijd
 * draait dit op maximaal 100 testgebruikers. Dat is precies waarom §6.7 een
 * "connector niet geverifieerd"-staat kent.
 *
 * Zonder token is dit een no-op: de app draait in dev volledig op seed-data.
 */
/* ---------- Tools ------------------------------------------------------- */

const isoDateTime = z.string().datetime({ offset: true });

const listDayParams = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "verwacht jjjj-mm-dd"),
});

/**
 * Lezen zonder op de nachtelijke sync te wachten. Nodig omdat "zet dit erin"
 * bijna altijd voorafgegaan wordt door "is er dan al iets?" — en een antwoord
 * uit een sync van vanochtend is precies het antwoord dat een dubbele afspraak
 * oplevert.
 */
const listDay: ConnectorTool<z.infer<typeof listDayParams>> = {
  name: "calendar.list_day",
  label: "Agenda van één dag ophalen",
  effect: "read",
  params: listDayParams,
  describe: (p) => `Agenda van ${formatDayLong(`${p.date}T12:00:00`)} bekijken`,

  async run(ctx, p) {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: `${p.date}T00:00:00Z`,
      timeMax: `${p.date}T23:59:59Z`,
      maxResults: "50",
    });
    const data = await gcal<{ items?: GoogleEvent[] }>(ctx, `events?${params}`);
    return (data.items ?? []).map((e) => ({
      id: e.id,
      title: e.summary ?? "(geen titel)",
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
    }));
  },
};

const createEventParams = z.object({
  title: z.string().min(1).max(200),
  start: isoDateTime,
  end: isoDateTime,
  description: z.string().max(2_000).optional(),
  location: z.string().max(200).optional(),
  /**
   * Genodigden maken van dit een tool met publiek gevolg: een uitnodiging komt
   * bij anderen binnen en is niet stil terug te draaien. Vandaar effect "write"
   * en niet "draft", ook als de afspraak zelf onschuldig lijkt.
   */
  attendees: z.array(z.string().email()).max(20).optional(),
});

const createEvent: ConnectorTool<z.infer<typeof createEventParams>> = {
  name: "calendar.create_event",
  label: "Afspraak in de agenda zetten",
  effect: "write",
  params: createEventParams,
  describe: (p) =>
    `"${p.title}" op ${formatDayLong(p.start)} ${formatTime(p.start)}–${formatTime(p.end)}` +
    (p.attendees?.length ? ` met ${p.attendees.length} genodigde(n)` : ""),

  async run(ctx, p) {
    if (new Date(p.end) <= new Date(p.start)) {
      throw new Error("Einde ligt niet na de start.");
    }
    const event = await gcal<{ id: string; htmlLink?: string }>(ctx, "events", {
      method: "POST",
      body: JSON.stringify({
        summary: p.title,
        description: p.description,
        location: p.location,
        start: { dateTime: p.start, timeZone: "Europe/Amsterdam" },
        end: { dateTime: p.end, timeZone: "Europe/Amsterdam" },
        attendees: p.attendees?.map((email) => ({ email })),
      }),
    });
    return { event_id: event.id, link: event.htmlLink };
  },
};

async function gcal<T>(ctx: AdapterContext, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ctx.accountId)}/${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    },
  );
  if (!res.ok) throw new Error(`Google Calendar ${res.status}`);
  return (await res.json()) as T;
}

export const googleCalendar: ConnectorAdapter<NormalizedEvent> = {
  provider: "google",
  type: "calendar",
  tools: [listDay, createEvent],

  async fetchDelta(ctx: AdapterContext, since?: Date): Promise<NormalizedEvent[]> {
    if (!ctx.accessToken) return [];

    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeMin: (since ?? new Date(Date.now() - 7 * 86_400_000)).toISOString(),
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        ctx.accountId,
      )}/events?${params}`,
      { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
    );
    if (!res.ok) throw new Error(`Google Calendar ${res.status}`);

    const data = (await res.json()) as { items?: GoogleEvent[] };
    const now = new Date();

    return (data.items ?? [])
      .filter((e) => e.start?.dateTime || e.start?.date)
      .map((e) => ({
        id: `google:${e.id}`,
        provider: "google" as const,
        calendar_id: ctx.accountId,
        title: e.summary ?? "(geen titel)",
        description: e.description,
        start: new Date(e.start!.dateTime ?? `${e.start!.date}T00:00:00`),
        end: new Date(e.end?.dateTime ?? `${e.end?.date ?? e.start!.date}T23:59:59`),
        timezone: e.start?.timeZone ?? "Europe/Amsterdam",
        attendees: e.attendees?.map((a) => ({
          email: a.email,
          name: a.displayName,
          status:
            a.responseStatus === "accepted"
              ? ("accepted" as const)
              : a.responseStatus === "declined"
                ? ("declined" as const)
                : ("tentative" as const),
        })),
        location: e.location,
        meeting_url: e.hangoutLink,
        recurring: e.recurrence?.[0],
        status: (e.status ?? "confirmed") as NormalizedEvent["status"],
        transparency: e.transparency === "transparent" ? "transparent" : "opaque",
        is_private: e.visibility === "private",
        raw: e,
        synced_at: now,
      }));
  },

  async health(ctx: AdapterContext): Promise<ConnectorHealth> {
    if (!ctx.accessToken) return { status: "not_connected" };
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    });
    if (res.status === 401) return { status: "reauth_required" };
    if (!res.ok) return { status: "error", error_message: `HTTP ${res.status}` };
    return { status: "active", last_sync_at: new Date() };
  },
};

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  status?: string;
  visibility?: string;
  transparency?: string;
  recurrence?: string[];
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
}
