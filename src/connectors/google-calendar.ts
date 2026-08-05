import type {
  AdapterContext,
  ConnectorAdapter,
  ConnectorHealth,
  NormalizedEvent,
} from "@/lib/types";

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
export const googleCalendar: ConnectorAdapter<NormalizedEvent> = {
  provider: "google",
  type: "calendar",

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
