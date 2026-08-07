// Service worker voor Wingman-pushmeldingen.
//
// Klein en saai, met opzet: geen caching-strategie, geen offline-modus, geen
// precache-manifest. Dit bestand doet precies twee dingen — een melding tonen
// bij een push, en de app openen bij een klik erop — en niets meer. Alles
// wat hier níét staat is bewust weggelaten: een service worker die ook gaat
// cachen introduceert een hele klasse "waarom zie ik de oude versie"-bugs die
// deze app niet nodig heeft om web-push te laten werken.

self.addEventListener("push", (event) => {
  let data = { title: "Wingman", body: "Er is iets nieuws." };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      const text = event.data.text();
      if (text) data.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
      return undefined;
    }),
  );
});
