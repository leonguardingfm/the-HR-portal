"use client";

import { useEffect, useState } from "react";

/**
 * The browser's clock, not the build's.
 *
 * The demonstration data is expressed as offsets from "now", which on a
 * prerendered page means the build time. Anything that counts minutes or days
 * has to wait for the client, or the server and browser renders disagree and
 * React complains. Returns null until mounted.
 */
export function useNow(refreshMs?: number): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    if (!refreshMs) return;
    const id = setInterval(() => setNow(new Date()), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return now;
}
