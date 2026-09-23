/**
 * Where uploaded document copies live.
 *
 * One small interface — put, get, delete by key — so the backend can change
 * without anything else changing. In development the copies are files under
 * DOCUMENT_STORAGE_DIR (default ./storage/documents, git-ignored), written
 * readable by this process only. Production should point this at encrypted
 * object storage instead: these are passports and bank statements.
 *
 * Nothing here is served directly. Every read goes through the permission-
 * checked route at app/documents/[id]/route.ts.
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.env.DOCUMENT_STORAGE_DIR ?? "storage/documents");

/** A key resolves inside the storage root, or it is refused. */
function resolveKey(key: string): string {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Refused: storage key outside the storage root.");
  return full;
}

export async function putObject(key: string, bytes: Uint8Array): Promise<void> {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  // "wx": never overwrite. A key is written once.
  await writeFile(full, bytes, { flag: "wx", mode: 0o600 });
}

export async function getObject(key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveKey(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await unlink(resolveKey(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
