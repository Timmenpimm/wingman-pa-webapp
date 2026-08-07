"use client";

import { useEffect, useState } from "react";

/**
 * Opt-in voor pushmeldingen. Registreert de service worker, vraagt
 * toestemming, abonneert met de publieke VAPID-sleutel en stuurt het
 * abonnement naar /api/v1/push/subscribe.
 *
 * Klein en op zichzelf staand met opzet: twee plekken (de onboarding-stap
 * "meldingen" en de sectie "Meldingen" op /instellingen) tonen 'm zonder
 * verder iets te hoeven weten van web-push. `publicKey` komt van de server
 * (VAPID_PUBLIC_KEY, zie .env.example) — ontbreekt hij, dan is push nog niet
 * geconfigureerd en toont dit component niets, net zoals de bank- en
 * Google-koppelingen elders in de onboarding zichzelf verbergen als de
 * bijbehorende sleutel er niet is.
 */

type Stand =
  | "niet_geconfigureerd"
  | "niet_ondersteund"
  | "onbekend"
  | "uit"
  | "bezig"
  | "aan"
  | "fout";

export function PushOptIn({ publicKey }: { publicKey: string | null }) {
  const [stand, setStand] = useState<Stand>(publicKey ? "onbekend" : "niet_geconfigureerd");

  useEffect(() => {
    if (!publicKey) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStand("niet_ondersteund");
      return;
    }

    let geannuleerd = false;
    navigator.serviceWorker.ready
      .then((registratie) => registratie.pushManager.getSubscription())
      .then((abonnement) => {
        if (!geannuleerd) setStand(abonnement ? "aan" : "uit");
      })
      .catch(() => {
        if (!geannuleerd) setStand("uit");
      });

    return () => {
      geannuleerd = true;
    };
  }, [publicKey]);

  async function inschakelen() {
    if (!publicKey) return;
    setStand("bezig");
    try {
      await navigator.serviceWorker.register("/sw.js");
      const registratie = await navigator.serviceWorker.ready;

      const toestemming = await Notification.requestPermission();
      if (toestemming !== "granted") {
        setStand("uit");
        return;
      }

      const abonnement = await registratie.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch("/api/v1/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(abonnement.toJSON()),
      });

      setStand(res.ok ? "aan" : "fout");
    } catch {
      setStand("fout");
    }
  }

  if (stand === "niet_geconfigureerd" || stand === "niet_ondersteund") return null;

  if (stand === "aan") {
    return <p className="meta" style={{ marginTop: "var(--s-3)" }}>Pushmeldingen staan aan op dit toestel.</p>;
  }

  return (
    <div className="btn-row" style={{ marginTop: "var(--s-3)" }}>
      <button className="btn btn--quiet" type="button" onClick={inschakelen} disabled={stand === "bezig"}>
        {stand === "bezig" ? "Bezig…" : stand === "fout" ? "Nog eens proberen" : "Pushmeldingen inschakelen"}
      </button>
    </div>
  );
}

/** VAPID-sleutels komen als URL-safe base64 — PushManager wil een Uint8Array. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(safe);
  return Uint8Array.from(raw.split("").map((char) => char.charCodeAt(0)));
}
