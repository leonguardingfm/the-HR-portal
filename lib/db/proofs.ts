/**
 * Selfie proofs on book-ons and check calls: reading one from the officer's
 * form, keeping the photo, and writing the record beside the book-on or call
 * it proves. The rules are lib/core/proof.ts.
 *
 * The photo is kept in the same private store as documents, never served
 * directly: Control sees it through app/duty/proof/[id], which checks the
 * role first.
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { CLOCK_SKEW_MINUTES, MAX_PROOF_BYTES, fixProblem, isProofCode, judgeLocation, proofVerdict, type Fix } from "@/lib/core/proof";
import { sniffMime } from "@/lib/core/screening-documents";
import { deleteObject, putObject } from "@/lib/storage";

export interface ProofInput {
  code: string;
  bytes: Uint8Array;
  mimeType: string;
  sha256: string;
  fix: Fix | null;
  deviceAt: Date | null;
  liveCamera: boolean;
  distance: number | null;
  atSite: boolean | null;
  verdict: { label: string; severity: string };
  clockSkewMinutes: number | null;
}

/** The site's place, from its row, or null where nobody has set it. */
export function sitePlace(site: { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null; radiusMetres: number }) {
  return site.latitude == null || site.longitude == null ? null : { lat: Number(site.latitude), lng: Number(site.longitude), radiusMetres: site.radiusMetres };
}

/** What the officer's form sent, checked — or why it cannot be accepted. */
export async function readProof(formData: FormData, site: ReturnType<typeof sitePlace>, now: Date): Promise<{ proof: ProofInput } | { problem: string }> {
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { problem: "Take your selfie first." };
  if (photo.size > MAX_PROOF_BYTES) return { problem: "That photo is too large. Take it again in the portal." };
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (mimeType !== "image/jpeg" && mimeType !== "image/png") return { problem: "That is not a photo. Take your selfie in the portal." };

  const code = String(formData.get("code") ?? "");
  if (!isProofCode(code)) return { problem: "The photo's code is missing. Take the selfie again." };

  let fix: Fix | null = null;
  const lat = formData.get("lat");
  if (lat !== null && String(lat) !== "") {
    const f = { lat: Number(lat), lng: Number(formData.get("lng")), accuracy: Number(formData.get("accuracy")) };
    const problem = fixProblem(f.lat, f.lng, f.accuracy);
    if (problem) return { problem };
    fix = f;
  }
  const device = Number(formData.get("deviceAt"));
  const deviceAt = Number.isFinite(device) && device > 0 ? new Date(device) : null;
  const clockSkewMinutes = deviceAt ? Math.round((deviceAt.getTime() - now.getTime()) / 60_000) : null;
  // A photo "taken" long before it was sent is an old photo.
  if (deviceAt && now.getTime() - deviceAt.getTime() > 15 * 60_000) return { problem: "That photo was taken too long ago. Take a new one now." };

  const liveCamera = formData.get("live") === "1";
  const { distance, atSite } = judgeLocation(fix, site);
  const verdict = proofVerdict({ atSite, distanceMetres: distance, accuracyMetres: fix ? Math.round(fix.accuracy) : null, liveCamera, hasLocation: !!fix, siteHasLocation: !!site });
  return {
    proof: {
      code,
      bytes,
      mimeType,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      fix,
      deviceAt,
      liveCamera,
      distance,
      atSite,
      verdict,
      clockSkewMinutes: clockSkewMinutes !== null && Math.abs(clockSkewMinutes) >= CLOCK_SKEW_MINUTES ? clockSkewMinutes : null,
    },
  };
}

/** Where a proof's photo is kept. Written once, never overwritten. */
export const proofKey = (p: { code: string; mimeType: string }, now: Date) =>
  `proofs/${now.toISOString().slice(0, 10)}/${p.code}.${p.mimeType === "image/png" ? "png" : "jpg"}`;

/**
 * Keep the photo, then run the writes; if the writes fail, the photo goes
 * too, so there is never a photo without its record.
 */
export async function withStoredProof<T>(proof: ProofInput, now: Date, write: (storageKey: string) => Promise<T>): Promise<T> {
  const key = proofKey(proof, now);
  await putObject(key, proof.bytes);
  try {
    return await write(key);
  } catch (e) {
    await deleteObject(key).catch(() => {});
    throw e;
  }
}

/** The proof row's data, for a create inside the caller's transaction. */
export function proofData(proof: ProofInput, storageKey: string, assignmentId: string, link: { bookOnId: string } | { checkCallId: string }) {
  return {
    code: proof.code,
    assignmentId,
    kind: "bookOnId" in link ? ("book_on" as const) : ("check_call" as const),
    deviceAt: proof.deviceAt,
    latitude: proof.fix?.lat ?? null,
    longitude: proof.fix?.lng ?? null,
    accuracyMetres: proof.fix ? Math.round(proof.fix.accuracy) : null,
    distanceMetres: proof.distance,
    atSite: proof.atSite,
    liveCamera: proof.liveCamera,
    storageKey,
    mimeType: proof.mimeType,
    bytes: proof.bytes.length,
    sha256: proof.sha256,
    ...link,
  };
}
