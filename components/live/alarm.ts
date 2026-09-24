"use client";

/**
 * The alarm: a two-tone siren made in the browser, so there is no sound file
 * to fetch and nothing to fail to load at 03:00.
 *
 * Browsers only let a page make a sound after the person has touched it once.
 * So the sound is unlocked on the first click or tap anywhere — which on a
 * Control desk is signing in — and until then the bar says so.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** Call from any click or tap: after that, the alarm can sound. */
export function unlockAlarm() {
  const c = context();
  if (c && c.state === "suspended") void c.resume();
}

export function alarmReady(): boolean {
  return !!ctx && ctx.state === "running";
}

/**
 * One burst of the siren: three rising and falling sweeps, loud enough to be
 * heard across a control room. Urgent is longer and higher.
 */
export function soundAlarm(urgent = true) {
  const c = context();
  if (!c || c.state !== "running") return false;
  const t0 = c.currentTime + 0.02;
  const gain = c.createGain();
  gain.connect(c.destination);
  const sweeps = urgent ? 3 : 2;
  const each = 0.55;
  for (let i = 0; i < sweeps; i++) {
    const osc = c.createOscillator();
    osc.type = "square";
    const start = t0 + i * each;
    osc.frequency.setValueAtTime(urgent ? 880 : 660, start);
    osc.frequency.linearRampToValueAtTime(urgent ? 1320 : 990, start + each / 2);
    osc.frequency.linearRampToValueAtTime(urgent ? 880 : 660, start + each);
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + each);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03);
  gain.gain.setValueAtTime(0.25, t0 + sweeps * each - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + sweeps * each);
  // A phone in a pocket buzzes as well, where it can.
  try {
    navigator.vibrate?.(urgent ? [400, 150, 400, 150, 800] : [200, 100, 200]);
  } catch {}
  return true;
}
