/*
 * Leon portal service worker: alerts on phones and desks.
 *
 * Only notifications — no caching, no offline copy. A push arrives with the
 * alert; it is shown on screen and buzzes the phone, and tapping it opens the
 * page where it is dealt with. If a portal window is already in front, that
 * window is told instead and sounds its own alarm.
 *
 * And the officer's outbox (26 September 2026): book-ons and check calls made
 * with no signal wait in IndexedDB (lib/offline/queue.ts); where the phone
 * supports background sync, they are sent from here when signal returns, even
 * with the portal closed. Same store, same order, same rules as the page.
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

// --- The officer's outbox --------------------------------------------------

function outbox() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("leon-offline", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("queue", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function inStore(db, mode, run) {
  return new Promise((resolve, reject) => {
    const t = db.transaction("queue", mode);
    const req = run(t.objectStore("queue"));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

async function sendOutbox() {
  const db = await outbox();
  const items = ((await inStore(db, "readonly", (s) => s.getAll())) || []).filter((i) => i.status === "waiting").sort((a, b) => a.madeAt - b.madeAt);
  let sent = 0;
  let stopped = false;
  for (const item of items) {
    const fd = new FormData();
    fd.set("kind", item.kind);
    fd.set("assignmentId", item.assignmentId);
    fd.set("clientRef", item.id);
    fd.set("madeAt", String(item.madeAt));
    fd.set("deviceNow", String(Date.now()));
    for (const [k, v] of Object.entries(item.fields || {})) fd.set(k, v);
    if (item.photo) fd.set("photo", new File([item.photo], (item.fields && item.fields.code ? item.fields.code : item.id) + ".jpg", { type: "image/jpeg" }));
    let res;
    try {
      res = await fetch("/api/me/queue", { method: "POST", body: fd, credentials: "same-origin" });
    } catch {
      stopped = true;
      break;
    }
    if (res.status === 401 || res.status >= 500) {
      stopped = true;
      break;
    }
    const r = await res.json().catch(() => ({ ok: false, message: "The reply could not be read." }));
    if (r.ok) {
      await inStore(db, "readwrite", (s) => s.delete(item.id));
      sent++;
    } else {
      await inStore(db, "readwrite", (s) => s.put(Object.assign({}, item, { status: "refused", message: r.message || "Not accepted.", tries: (item.tries || 0) + 1 })));
    }
  }
  db.close();
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach((w) => w.postMessage({ type: "leon-queue-sent", sent }));
  // Throwing tells the browser to try the sync again later.
  if (stopped) throw new Error("Still no signal");
}

self.addEventListener("sync", (event) => {
  if (event.tag === "leon-queue") event.waitUntil(sendOutbox());
});
