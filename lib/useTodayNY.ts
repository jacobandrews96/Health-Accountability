"use client";

import { useEffect, useState } from "react";
import { todayNY } from "@/lib/dates";

/**
 * The current New York day as reactive state. Re-checks when the tab regains
 * visibility/focus (phones restoring a backgrounded tab) and every minute,
 * so a page left open across midnight rolls over to the new day instead of
 * silently writing onto — and overwriting — yesterday.
 */
export function useTodayNY(): string {
  const [day, setDay] = useState(todayNY);

  useEffect(() => {
    const check = () =>
      setDay((prev) => {
        const now = todayNY();
        return now === prev ? prev : now;
      });
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    const timer = setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      clearInterval(timer);
    };
  }, []);

  return day;
}
