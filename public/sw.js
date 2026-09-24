/*
 * Leon portal service worker: alerts on phones and desks.
 *
 * Only notifications — no caching, no offline copy. A push arrives with the
 * alert; it is shown on screen and buzzes the phone, and tapping it opens the
 * page where it is dealt with. If a portal window is already in front, that
 * window is told instead and sounds its own alarm.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Leon portal", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Leon portal";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || "leon-alert",
    // A repeat of the same alert buzzes again rather than updating silently.
    renotify: true,
    // Urgent alerts stay on screen until somebody deals with them.
    requireInteraction: !!data.urgent,
    vibrate: data.urgent ? [400, 150, 400, 150, 800, 150, 400] : [200, 100, 200],
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      windows.forEach((w) => w.postMessage({ type: "leon-alert", title, body: options.body, url: options.data.url }));
      return self.registration.showNotification(title, options);
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ("focus" in w) {
          w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
