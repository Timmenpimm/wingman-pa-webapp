import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * sendWebPush praat tegen de `web-push`-package — die zelf mocken houdt dit
 * een eenheidstest in plaats van een aanroep naar een echte pushdienst.
 */

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  },
}));

const vapid = { publicKey: "pub", privateKey: "priv", subject: "mailto:a@b.nl" };
const subscription = { endpoint: "https://push.example/abc", p256dh: "key", auth: "secret" };

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
});

describe("sendWebPush", () => {
  it("stuurt de payload als JSON en zet vooraf de VAPID-details", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { sendWebPush } = await import("@/lib/push/webpush");

    const result = await sendWebPush(subscription, { title: "T", body: "B" }, vapid);

    expect(result).toEqual({ ok: true, expired: false });
    expect(setVapidDetails).toHaveBeenCalledWith(vapid.subject, vapid.publicKey, vapid.privateKey);
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: { p256dh: "key", auth: "secret" } },
      JSON.stringify({ title: "T", body: "B" }),
    );
  });

  it("herkent een verlopen abonnement op statusCode 404/410", async () => {
    const { sendWebPush } = await import("@/lib/push/webpush");

    sendNotification.mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }));
    expect(await sendWebPush(subscription, { title: "T", body: "B" }, vapid)).toMatchObject({
      ok: false,
      expired: true,
      statusCode: 410,
    });

    sendNotification.mockRejectedValueOnce(Object.assign(new Error("Not found"), { statusCode: 404 }));
    expect(await sendWebPush(subscription, { title: "T", body: "B" }, vapid)).toMatchObject({
      ok: false,
      expired: true,
      statusCode: 404,
    });
  });

  it("behandelt een andere fout als niet-verlopen", async () => {
    const { sendWebPush } = await import("@/lib/push/webpush");
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("Server error"), { statusCode: 500 }));

    const result = await sendWebPush(subscription, { title: "T", body: "B" }, vapid);

    expect(result).toMatchObject({ ok: false, expired: false, statusCode: 500 });
  });
});

describe("vapidConfigFromEnv", () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("geeft null terug als een van de drie ontbreekt", async () => {
    const { vapidConfigFromEnv } = await import("@/lib/push/webpush");
    delete process.env.VAPID_PUBLIC_KEY;
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:a@b.nl";
    expect(vapidConfigFromEnv()).toBeNull();
  });

  it("geeft de config terug als alle drie gezet zijn", async () => {
    const { vapidConfigFromEnv } = await import("@/lib/push/webpush");
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:a@b.nl";
    expect(vapidConfigFromEnv()).toEqual({ publicKey: "pub", privateKey: "priv", subject: "mailto:a@b.nl" });
  });
});
