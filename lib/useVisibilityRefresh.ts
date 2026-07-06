"use client";

import { useEffect, useState } from "react";

/**
 * A counter that bumps whenever the tab becomes visible or regains focus —
 * put it in a fetch effect's deps so data refreshes when the user reopens
 * the app and expects to see their partner's latest activity.
 */
export function useVisibilityRefresh(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const onVisible = () => {
      if (!document.hidden) bump();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", bump);
    window.addEventListener("pageshow", bump);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", bump);
      window.removeEventListener("pageshow", bump);
    };
  }, []);

  return tick;
}
