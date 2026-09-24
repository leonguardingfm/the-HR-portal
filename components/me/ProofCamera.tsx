"use client";

import qrcode from "qrcode-generator";
import { useCallback, useEffect, useRef, useState } from "react";
import { newProofCode, verifyPath } from "@/lib/core/proof";

/**
 * The selfie an officer books on and makes check calls with (Control, 25
 * September 2026).
 *
 * The live front camera, not the phone's photos: an old picture cannot be
 * sent as a new one. The phone's location is read at the same time. When the
 * picture is taken, the portal stamps it — who, which post, the date and time,
 * the location and its accuracy, a reference, and a QR code — onto the photo
 * itself, so the picture carries its own details wherever it is looked at.
 * The QR code opens the record the server kept when it arrived, with the
 * server's own clock and the location it was sent; a stamp edited afterwards
 * no longer matches it.
 */

export interface ProofShot {
  photo: Blob;
  code: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  deviceAt: number;
  live: boolean;
}

type Fix = { lat: number; lng: number; accuracy: number; at: number };

const UK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function randomBytes(n: number) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** The photo with its stamp: the details in a band along the bottom, the QR code at its right. */
function stamp(source: CanvasImageSource, width: number, height: number, lines: string[], url: string): HTMLCanvasElement {
  const W = Math.min(960, width);
  const H = Math.round((height / width) * W);
  const band = Math.max(170, Math.round(H * 0.26));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H + band;
  const g = canvas.getContext("2d")!;
  g.drawImage(source, 0, 0, W, H);
  g.fillStyle = "#101820";
  g.fillRect(0, H, W, band);

  // QR code, on white with its quiet zone, as tall as the band allows.
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const count = qr.getModuleCount();
  const size = band - 20;
  const cell = Math.floor(size / (count + 4));
  const qrSize = cell * (count + 4);
  const qx = W - qrSize - 10;
  const qy = H + Math.round((band - qrSize) / 2);
  g.fillStyle = "#fff";
  g.fillRect(qx, qy, qrSize, qrSize);
  g.fillStyle = "#000";
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) g.fillRect(qx + (c + 2) * cell, qy + (r + 2) * cell, cell, cell);

  // The details, sized to the band.
  const textWidth = qx - 24;
  const lineHeight = Math.floor((band - 20) / lines.length);
  let y = H + 10 + lineHeight * 0.8;
  lines.forEach((line, i) => {
    g.fillStyle = i === 0 ? "#f5b82e" : "#fff";
    g.font = `${i === 0 ? "700" : i === 1 ? "600" : "400"} ${Math.round(lineHeight * 0.7)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    let t = line;
    while (g.measureText(t).width > textWidth && t.length > 4) t = `${t.slice(0, -2)}…`;
    g.fillText(t, 14, y);
    y += lineHeight;
  });
  return canvas;
}

export function ProofCamera({
  kind,
  officer,
  place,
  onUse,
  onCancel,
  sending,
}: {
  kind: "book_on" | "check_call";
  officer: { name: string; pin: string | null };
  place: { post: string; site: string };
  onUse: (shot: ProofShot) => void;
  onCancel: () => void;
  sending: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "failed">("starting");
  const [fix, setFix] = useState<Fix | null>(null);
  const [where, setWhere] = useState<"finding" | "found" | "denied" | "unavailable">("finding");
  const [shot, setShot] = useState<{ url: string; data: ProofShot } | null>(null);

  // The camera, and the location, from the moment the panel opens.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
        setCamera("on");
      })
      .catch(() => setCamera("failed")) ?? setCamera("failed");
    let watch: number | null = null;
    if ("geolocation" in navigator) {
      watch = navigator.geolocation.watchPosition(
        (p) => {
          setWhere("found");
          // Keep the best recent fix: a phone's first guess is often its worst.
          setFix((prev) => {
            const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() };
            return !prev || next.accuracy <= prev.accuracy || Date.now() - prev.at > 60_000 ? next : prev;
          });
        },
        (e) => setWhere(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
      );
    } else setWhere("unavailable");
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      if (watch !== null) navigator.geolocation.clearWatch(watch);
    };
  }, []);

  const make = useCallback(
    (source: CanvasImageSource, width: number, height: number, live: boolean) => {
      const code = newProofCode(randomBytes);
      const at = Date.now();
      const lines = [
        `LEON GUARDING · ${kind === "book_on" ? "BOOK-ON" : "CHECK CALL"}`,
        `${officer.name}${officer.pin ? ` · PIN ${officer.pin}` : ""}`,
        `${place.post} — ${place.site}`,
        `${UK.format(new Date(at))} UK time`,
        fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} · ±${Math.round(fix.accuracy)} m` : "Location not available",
        `Ref ${code}${live ? "" : " · from phone photos"}`,
      ];
      const canvas = stamp(source, width, height, lines, `${window.location.origin}${verifyPath(code)}`);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          setShot({
            url: URL.createObjectURL(blob),
            data: { photo: blob, code, lat: fix?.lat ?? null, lng: fix?.lng ?? null, accuracy: fix ? Math.round(fix.accuracy) : null, deviceAt: at, live },
          });
        },
        "image/jpeg",
        0.8,
      );
    },
    [fix, kind, officer, place],
  );

  const take = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    make(v, v.videoWidth, v.videoHeight, true);
  };

  // No live camera: a picture from the phone, marked as such.
  const fromFile = (file: File | undefined) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => make(img, img.naturalWidth, img.naturalHeight, false);
    img.src = URL.createObjectURL(file);
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#000", color: "#fff" }} role="dialog" aria-modal="true" aria-label="Take your selfie">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-[15px] font-semibold">{kind === "book_on" ? "Book-on selfie" : "Check-call selfie"}</p>
        <button type="button" onClick={onCancel} className="h-9 rounded-md border border-white/40 px-3 text-[13px]">
          Cancel
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt="Your selfie, with its details stamped on it" className="max-h-full max-w-full object-contain" />
        ) : camera === "failed" ? (
          <div className="max-w-sm space-y-3 px-6 text-center">
            <p className="text-[15px]">The camera did not start. Allow the camera for this site in your phone&apos;s settings, then open this again.</p>
            <label className="inline-flex h-11 cursor-pointer items-center rounded-lg bg-white px-4 text-[14px] font-semibold text-black">
              Use the phone&apos;s camera instead
              <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => fromFile(e.target.files?.[0])} />
            </label>
            <p className="text-[12px] text-white/70">A photo that does not come through the live camera is marked as such for Control.</p>
          </div>
        ) : (
          // Mirrored on screen, as a selfie is expected to look; the photo itself is not.
          <video ref={video} playsInline muted autoPlay className="max-h-full max-w-full object-contain" style={{ transform: "scaleX(-1)" }} />
        )}
      </div>

      <footer className="space-y-3 px-4 pt-3 pb-6">
        <p className="text-center text-[13px]" style={{ color: where === "found" ? "#9be39b" : "#f5b82e" }}>
          {where === "found" && fix
            ? `Location found · ±${Math.round(fix.accuracy)} m`
            : where === "finding"
              ? "Finding your location…"
              : where === "denied"
                ? "Location is blocked — allow it for this site, or Control will ring you to confirm where you are"
                : "Location not available — Control will ring you to confirm where you are"}
        </p>
        {shot ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={retake} disabled={sending} className="h-12 rounded-lg border border-white/50 text-[15px] font-semibold disabled:opacity-60">
              Retake
            </button>
            <button type="button" onClick={() => onUse(shot.data)} disabled={sending} className="h-12 rounded-lg text-[15px] font-semibold text-white disabled:opacity-60" style={{ background: "#0ca30c" }}>
              {sending ? "Sending…" : "Use this photo"}
            </button>
          </div>
        ) : camera === "on" ? (
          <button type="button" onClick={take} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-white" aria-label="Take the photo">
            <span className="h-12 w-12 rounded-full bg-white" />
          </button>
        ) : null}
      </footer>
    </div>
  );
}
