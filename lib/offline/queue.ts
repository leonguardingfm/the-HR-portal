/**
 * The officer's outbox (26 September 2026): a book-on or check call made with
 * no signal is kept on the phone — photo and all — and sent the moment signal
 * returns, in the order it was made. It counts from when it was made; Control
 * sees that it arrived late, and why.
 *
 * Browser only. IndexedDB, so it survives the page being closed or the phone
 * restarting. The service worker (public/sw.js) reads the same store, so on
 * phones that allow it the queue is sent even with the portal closed.
 */

export type QueueKind = "book_on" | "check_call";
export interface QueueItem {
  /** Also the record's reference on the server, so it is never counted twice. */
  id: string;
  kind: QueueKind;
  assignmentId: string;
  /** The phone's clock when it was made. */
  madeAt: number;
  fields: Record<string, string>;
  photo?: Blob;
  /** What the officer sees: "Check call — all well". */
  label: string;
  status: "waiting" | "refused";
  message?: string;
  tries: number;
}

const DB = "leon-offline";
const STORE = "queue";
export const QUEUE_EVENT = "leon-queue-changed";
export const SYNC_TAG = "leon-queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req ? req.result : undefined);
    };
    t.onerror = () => reject(t.error);
  });
}

const changed = () => window.dispatchEvent(new Event(QUEUE_EVENT));

export async function queued(): Promise<QueueItem[]> {
  if (typeof indexedDB === "undefined") return [];
  const all = ((await tx("readonly", (s) => s.getAll())) as QueueItem[] | undefined) ?? [];
  return all.sort((a, b) => a.madeAt - b.madeAt);
}

export async function enqueue(item: Omit<QueueItem, "status" | "tries">) {
  await tx("readwrite", (s) => s.put({ ...item, status: "waiting", tries: 0 }));
  changed();
  // Where the phone allows it, the service worker sends it even if the portal is closed.
  try {
    const reg = await navigator.serviceWorker?.ready;
    await (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })?.sync?.register(SYNC_TAG);
  } catch {
    // No background sync here (iPhones): the page sends it when it is next open.
  }
}

export async function forget(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  changed();
}

/** Something that could not be sent now: the network, not the portal saying no. */
export const isOffline = (e: unknown) => (typeof navigator !== "undefined" && !navigator.onLine) || e instanceof TypeError || /fetch|network|load failed/i.test(String((e as Error)?.message ?? e));

let flushing: Promise<number> | null = null;

/** Sends what is waiting, oldest first. Stops at the first sign of no signal. Returns how many went. */
export function flushQueue(): Promise<number> {
  if (!flushing) flushing = send().finally(() => (flushing = null));
  return flushing;
}

async function send(): Promise<number> {
  let sent = 0;
  for (const item of await queued()) {
    if (item.status !== "waiting") continue;
    const fd = new FormData();
    fd.set("kind", item.kind);
    fd.set("assignmentId", item.assignmentId);
    fd.set("clientRef", item.id);
    fd.set("madeAt", String(item.madeAt));
    fd.set("deviceNow", String(Date.now()));
    for (const [k, v] of Object.entries(item.fields)) fd.set(k, v);
    if (item.photo) fd.set("photo", new File([item.photo], `${item.fields.code ?? item.id}.jpg`, { type: "image/jpeg" }));
    let res: Response;
    try {
      res = await fetch("/api/me/queue", { method: "POST", body: fd, credentials: "same-origin" });
    } catch {
      break; // Still no signal.
    }
    if (res.status === 401 || res.status >= 500) break; // Signed out, or the server is busy: try again later.
    const r = (await res.json().catch(() => ({ ok: false, message: "The reply could not be read." }))) as { ok: boolean; message?: string };
    if (r.ok) {
      await tx("readwrite", (s) => s.delete(item.id));
      sent++;
    } else {
      // The portal said no, and saying it again will not change that: show the officer.
      await tx("readwrite", (s) => s.put({ ...item, status: "refused", message: r.message ?? "Not accepted.", tries: item.tries + 1 }));
    }
  }
  changed();
  return sent;
}
