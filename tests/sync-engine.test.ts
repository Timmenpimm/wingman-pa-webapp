import { describe, expect, it, vi } from "vitest";
import {
  applySyncedItems,
  classifySyncError,
  emailRow,
  eventRow,
  fetchConnectorDelta,
  isSyncable,
  recordSyncFailure,
  SYNCABLE_PROVIDERS,
  syncConnector,
  type SyncConnector,
  type SyncTx,
} from "@/lib/sync/engine";
import type { AdapterContext, ConnectorAdapter, NormalizedEvent, NormalizedEmail } from "@/lib/types";

/**
 * De engine met gemockte adapters en een neppe tx — geen database nodig, net
 * als tests/google-token.test.ts voor de pure kant van tokenverversing.
 */

const connector: SyncConnector = {
  id: "conn_1",
  user_id: "user_1",
  provider: "google",
  type: "calendar",
  account_id: "primary",
  access_token: "plaintext-token", // niet versleuteld: decryptOptional geeft 'm ongewijzigd terug
  refresh_token: null,
  expires_at: null,
  last_sync_at: null,
};

function fakeTx(): SyncTx & {
  event: { upsert: ReturnType<typeof vi.fn> };
  email: { upsert: ReturnType<typeof vi.fn> };
  connector: { update: ReturnType<typeof vi.fn> };
} {
  return {
    event: { upsert: vi.fn().mockResolvedValue({}) },
    email: { upsert: vi.fn().mockResolvedValue({}) },
    connector: { update: vi.fn().mockResolvedValue({}) },
  };
}

function normalizedEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: "google:evt1",
    provider: "google",
    calendar_id: "primary",
    title: "Overleg",
    start: new Date("2026-08-10T09:00:00Z"),
    end: new Date("2026-08-10T09:30:00Z"),
    timezone: "Europe/Amsterdam",
    status: "confirmed",
    transparency: "opaque",
    raw: {},
    synced_at: new Date(),
    ...overrides,
  };
}

function normalizedEmail(overrides: Partial<NormalizedEmail> = {}): NormalizedEmail {
  return {
    id: "gmail:msg1",
    provider: "gmail",
    account_id: "primary",
    thread_id: "thread1",
    subject: "Hoi",
    from: { email: "a@example.com" },
    to: [{ email: "b@example.com" }],
    sent_at: new Date("2026-08-10T09:00:00Z"),
    received_at: new Date("2026-08-10T09:00:00Z"),
    body_text: "tekst",
    is_sent: false,
    is_unread: true,
    raw: {},
    synced_at: new Date(),
    ...overrides,
  };
}

describe("SYNCABLE_PROVIDERS", () => {
  it("kent alleen google en gmail — de rest heeft geen werkende adapter", () => {
    expect(SYNCABLE_PROVIDERS).toEqual(["google", "gmail"]);
    expect(isSyncable("google")).toBe(true);
    expect(isSyncable("gmail")).toBe(true);
    expect(isSyncable("ponto")).toBe(false);
    expect(isSyncable("caldav")).toBe(false);
    expect(isSyncable("imap")).toBe(false);
  });
});

describe("classifySyncError", () => {
  it("herkent ReauthRequiredError op naam, niet op instanceof", () => {
    const err = new Error("token ingetrokken");
    err.name = "ReauthRequiredError";
    expect(classifySyncError(err)).toEqual({ authProblem: true, message: "token ingetrokken" });
  });

  it("herkent een 401 of invalid_grant in een gewone fout", () => {
    expect(classifySyncError(new Error("Gmail HTTP 401")).authProblem).toBe(true);
    expect(classifySyncError(new Error("invalid_grant")).authProblem).toBe(true);
  });

  it("behandelt andere fouten als niet-auth", () => {
    const result = classifySyncError(new Error("Google Calendar 500"));
    expect(result.authProblem).toBe(false);
    expect(result.message).toBe("Google Calendar 500");
  });

  it("werkt ook met iets dat geen Error is", () => {
    expect(classifySyncError("kapot")).toEqual({ authProblem: false, message: "kapot" });
  });
});

describe("eventRow / emailRow", () => {
  it("neemt het genormaliseerde id over als external_id (bevat al de provider-prefix)", () => {
    const row = eventRow(normalizedEvent(), "user_1", "conn_1");
    expect(row.external_id).toBe("google:evt1");
    expect(row.user_id).toBe("user_1");
    expect(row.connector_id).toBe("conn_1");
  });

  it("zet attendees als JSON-string, niet als array", () => {
    const row = eventRow(
      normalizedEvent({ attendees: [{ email: "x@example.com", status: "accepted" }] }),
      "user_1",
      "conn_1",
    );
    expect(row.attendees).toBe(JSON.stringify([{ email: "x@example.com", status: "accepted" }]));
  });

  it("mailt from_addr uit from.email en to_addrs als JSON-array van adressen", () => {
    const row = emailRow(
      normalizedEmail({ to: [{ email: "b@example.com" }, { email: "c@example.com" }] }),
      "user_1",
      "conn_2",
    );
    expect(row.from_addr).toBe("a@example.com");
    expect(row.to_addrs).toBe(JSON.stringify(["b@example.com", "c@example.com"]));
    expect(row.external_id).toBe("gmail:msg1");
  });
});

describe("fetchConnectorDelta — since-logica en tokenkeuze", () => {
  it("geeft undefined mee als since wanneer last_sync_at leeg is", async () => {
    const fetchDelta = vi.fn().mockResolvedValue([]);
    const adapter = { fetchDelta, health: vi.fn() } as unknown as ConnectorAdapter<unknown>;

    await fetchConnectorDelta(adapter, connector);

    expect(fetchDelta).toHaveBeenCalledWith(expect.any(Object), undefined);
  });

  it("geeft last_sync_at mee als since wanneer die er is", async () => {
    const sinds = new Date("2026-08-01T00:00:00Z");
    const fetchDelta = vi.fn().mockResolvedValue([]);
    const adapter = { fetchDelta, health: vi.fn() } as unknown as ConnectorAdapter<unknown>;

    await fetchConnectorDelta(adapter, { ...connector, last_sync_at: sinds });

    expect(fetchDelta).toHaveBeenCalledWith(expect.any(Object), sinds);
  });

  it("gebruikt ensureAccessToken als de adapter die heeft, niet het opgeslagen token", async () => {
    const fetchDelta = vi.fn().mockResolvedValue([]);
    const ensureAccessToken = vi.fn().mockResolvedValue("vers-token");
    const adapter = {
      fetchDelta,
      health: vi.fn(),
      ensureAccessToken,
    } as unknown as ConnectorAdapter<unknown>;

    await fetchConnectorDelta(adapter, connector);

    expect(ensureAccessToken).toHaveBeenCalledWith(connector);
    const ctx = fetchDelta.mock.calls[0][0] as AdapterContext;
    expect(ctx.accessToken).toBe("vers-token");
    expect(ctx.userId).toBe(connector.user_id);
    expect(ctx.connectorId).toBe(connector.id);
    expect(ctx.accountId).toBe(connector.account_id);
  });

  it("valt terug op het opgeslagen access_token zonder ensureAccessToken (CalDAV/IMAP-stijl)", async () => {
    const fetchDelta = vi.fn().mockResolvedValue([]);
    const adapter = { fetchDelta, health: vi.fn() } as unknown as ConnectorAdapter<unknown>;

    await fetchConnectorDelta(adapter, connector);

    const ctx = fetchDelta.mock.calls[0][0] as AdapterContext;
    expect(ctx.accessToken).toBe("plaintext-token");
  });
});

describe("applySyncedItems — dedupe op external_id", () => {
  it("upsert events op {user_id, external_id} voor een calendar-connector", async () => {
    const tx = fakeTx();
    const items = [normalizedEvent(), normalizedEvent({ id: "google:evt2" })];

    await applySyncedItems(tx, connector, items, new Date("2026-08-10T10:00:00Z"));

    expect(tx.event.upsert).toHaveBeenCalledTimes(2);
    expect(tx.email.upsert).not.toHaveBeenCalled();
    expect(tx.event.upsert.mock.calls[0][0]).toMatchObject({
      where: { user_id_external_id: { user_id: "user_1", external_id: "google:evt1" } },
    });
    expect(tx.event.upsert.mock.calls[0][0].create).toMatchObject({ external_id: "google:evt1" });
    expect(tx.event.upsert.mock.calls[0][0].update).toMatchObject({ external_id: "google:evt1" });
  });

  it("upsert mails op {user_id, external_id} voor een mail-connector", async () => {
    const tx = fakeTx();
    const mailConnector: SyncConnector = { ...connector, provider: "gmail", type: "mail" };

    await applySyncedItems(tx, mailConnector, [normalizedEmail()], new Date());

    expect(tx.email.upsert).toHaveBeenCalledTimes(1);
    expect(tx.event.upsert).not.toHaveBeenCalled();
    expect(tx.email.upsert.mock.calls[0][0]).toMatchObject({
      where: { user_id_external_id: { user_id: "user_1", external_id: "gmail:msg1" } },
    });
  });

  it("zet de connector op active en werkt last_sync_at bij, ook zonder items", async () => {
    const tx = fakeTx();
    const now = new Date("2026-08-10T11:00:00Z");

    await applySyncedItems(tx, connector, [], now);

    expect(tx.connector.update).toHaveBeenCalledWith({
      where: { id: connector.id },
      data: { status: "active", error_message: null, last_sync_at: now },
    });
  });
});

describe("recordSyncFailure", () => {
  it("zet reauth_required bij een auth-fout", async () => {
    const tx = fakeTx();
    const err = new Error("Gmail HTTP 401");

    const classified = await recordSyncFailure(tx, connector, err);

    expect(classified.authProblem).toBe(true);
    expect(tx.connector.update).toHaveBeenCalledWith({
      where: { id: connector.id },
      data: { status: "reauth_required", error_message: "Gmail HTTP 401" },
    });
  });

  it("zet error bij een gewone fout, zodat de volgende tick het opnieuw probeert", async () => {
    const tx = fakeTx();
    const err = new Error("Google Calendar 503");

    await recordSyncFailure(tx, connector, err);

    expect(tx.connector.update).toHaveBeenCalledWith({
      where: { id: connector.id },
      data: { status: "error", error_message: "Google Calendar 503" },
    });
  });

  it("kapt een lange foutmelding af op het connectorStatus-budget", async () => {
    const tx = fakeTx();
    const lang = "x".repeat(500);

    await recordSyncFailure(tx, connector, new Error(lang));

    const data = tx.connector.update.mock.calls[0][0].data;
    expect((data.error_message as string).length).toBeLessThanOrEqual(120);
  });
});

describe("syncConnector — samenspel", () => {
  it("upsert bij succes en geeft de teller terug", async () => {
    const tx = fakeTx();
    const adapter = {
      fetchDelta: vi.fn().mockResolvedValue([normalizedEvent()]),
      health: vi.fn(),
    } as unknown as ConnectorAdapter<unknown>;

    const outcome = await syncConnector({
      adapter,
      connector,
      withTx: (fn) => fn(tx),
      now: new Date("2026-08-10T12:00:00Z"),
    });

    expect(outcome).toMatchObject({ status: "synced", count: 1, provider: "google" });
    expect(tx.event.upsert).toHaveBeenCalledTimes(1);
    expect(tx.connector.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "active" }) }),
    );
  });

  it("schrijft reauth_required weg en raakt de tx voor items niet aan bij een auth-fout", async () => {
    const tx = fakeTx();
    const err = new Error("invalid_grant");
    const adapter = {
      fetchDelta: vi.fn().mockRejectedValue(err),
      health: vi.fn(),
    } as unknown as ConnectorAdapter<unknown>;

    const outcome = await syncConnector({ adapter, connector, withTx: (fn) => fn(tx) });

    expect(outcome.status).toBe("reauth_required");
    expect(outcome.count).toBe(0);
    expect(tx.event.upsert).not.toHaveBeenCalled();
    expect(tx.connector.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "reauth_required" }) }),
    );
  });

  it("schrijft error weg bij een gewone fout — geen reauth", async () => {
    const tx = fakeTx();
    const adapter = {
      fetchDelta: vi.fn().mockRejectedValue(new Error("Google Calendar 500")),
      health: vi.fn(),
    } as unknown as ConnectorAdapter<unknown>;

    const outcome = await syncConnector({ adapter, connector, withTx: (fn) => fn(tx) });

    expect(outcome.status).toBe("error");
    expect(tx.connector.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "error" }) }),
    );
  });
});
