/**
 * Selfie proof on book-ons and check calls — the rules, with no database.
 *
 * An officer booking on or making a check call in their portal takes a selfie
 * through the live camera (Control, 25 September 2026). The phone stamps the
 * photo itself with who, where, when and a QR code; the server keeps its own
 * clock and the location it was sent beside the photo, and judges here whether
 * it was taken at the site. So a book-on from home is visible as one, and an
 * edited stamp disagrees with the record its QR code opens.
 */

import type { Severity } from "@/lib/types";

/** The phone's own estimate of how far out its fix is, beyond which nothing is judged. */
export const MAX_USEFUL_ACCURACY_METRES = 500;
/** However vague the fix, the allowance for it stops here. */
export const MAX_ACCURACY_ALLOWANCE_METRES = 150;
/** A phone clock this far from the server's is worth showing. */
export const CLOCK_SKEW_MINUTES = 5;
/** The largest photo accepted. The page sends about 150 KB. */
export const MAX_PROOF_BYTES = 3 * 1024 * 1024;

/** Metres between two points on the Earth, by the haversine formula. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

export interface Fix {
  lat: number;
  lng: number;
  /** The phone's stated accuracy, in metres. */
  accuracy: number;
}

export interface SitePlace {
  lat: number;
  lng: number;
  radiusMetres: number;
}

/**
 * Whether a photo was taken at the site: within the radius, allowing for the
 * phone's own stated accuracy up to a limit. Null where it cannot be judged —
 * no location from the phone, a fix too vague to mean anything, or a site
 * whose location nobody has set.
 */
export function judgeLocation(fix: Fix | null, site: SitePlace | null): { distance: number | null; atSite: boolean | null } {
  if (!fix || !site) return { distance: fix && site ? distanceMetres(fix, site) : null, atSite: null };
  const distance = distanceMetres(fix, site);
  if (fix.accuracy > MAX_USEFUL_ACCURACY_METRES) return { distance, atSite: null };
  return { distance, atSite: distance <= site.radiusMetres + Math.min(fix.accuracy, MAX_ACCURACY_ALLOWANCE_METRES) };
}

/** Why a location sent with a photo is not one, or null. */
export function fixProblem(lat: number, lng: number, accuracy: number): string | null {
  if (![lat, lng, accuracy].every(Number.isFinite)) return "The location did not come through.";
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "The location is not a place on Earth.";
  if (accuracy < 0 || accuracy > 100_000) return "The location's accuracy is not believable.";
  return null;
}

// ---------------------------------------------------------------------------
// The code printed on the photo
// ---------------------------------------------------------------------------

/** No 0/O or 1/I/L, so it can be read off a photo and typed. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A new code, from any source of random bytes: "K7QM-2XRD-9T". */
export function newProofCode(random: (n: number) => Uint8Array): string {
  const bytes = random(10);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 10)}`;
}

export const isProofCode = (v: string) => /^[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{2}$/.test(v);

/** The address the QR code on the photo opens. */
export const verifyPath = (code: string) => `/duty/verify/${code}`;

// ---------------------------------------------------------------------------
// What Control reads
// ---------------------------------------------------------------------------

export interface ProofFacts {
  atSite: boolean | null;
  distanceMetres: number | null;
  accuracyMetres: number | null;
  liveCamera: boolean;
  hasLocation: boolean;
  siteHasLocation: boolean;
}

/** "1.2 km", "340 m". */
export function metres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${m} m`;
}

/**
 * The evidence a selfie is, in words and a severity: at the site, away from
 * it, or not judged and why. A photo from the phone's gallery rather than the
 * live camera is weaker whatever it shows.
 */
export function proofVerdict(p: ProofFacts): { label: string; severity: Severity } {
  const camera = p.liveCamera ? "" : " — from the phone's photos, not the live camera";
  if (!p.hasLocation) return { label: `Selfie, no location${camera}`, severity: "warning" };
  if (!p.siteHasLocation) return { label: `Selfie — the site's location is not set, so it cannot be checked${camera}`, severity: "neutral" };
  if (p.atSite === null) return { label: `Selfie — location too vague to judge (±${metres(p.accuracyMetres ?? 0)})${camera}`, severity: "warning" };
  if (p.atSite) return { label: `Selfie at the site · ${metres(p.distanceMetres ?? 0)}${camera}`, severity: p.liveCamera ? "good" : "warning" };
  return { label: `Selfie ${metres(p.distanceMetres ?? 0)} from the site${camera}`, severity: "critical" };
}

/** Whether a selfie is worth an alert to Control on its own. */
export function proofNeedsAttention(p: ProofFacts): "away" | "no_photo" | null {
  if (p.hasLocation && p.siteHasLocation && p.atSite === false) return "away";
  return null;
}

/**
 * Read a location typed or pasted by Control: "51.5074, -0.1278", or a Google
 * Maps link with "@51.5074,-0.1278" or "?q=51.5074,-0.1278" in it.
 */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const t = text.trim();
  if (!t) return null;
  const m =
    t.match(/@(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/) ??
    t.match(/[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/) ??
    t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** A map link for a place — an address, or a pair of coordinates. */
export function mapLink(place: { lat?: number | null; lng?: number | null; address?: string | null }): string | null {
  if (place.lat != null && place.lng != null) return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  if (place.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`;
  return null;
}
