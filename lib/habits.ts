import type { DailyLog, Metric } from "@/lib/types";
import { addDays } from "@/lib/dates";

/** Max featured habits per member — keeps the tiles big and the focus tight. */
export const MAX_FEATURED = 4;

/**
 * Tile colors, validated (dataviz palette checks) on the white surface:
 * lightness band, chroma, CVD separation, and ≥3:1 contrast all pass.
 * Assigned by the habit's position in the member's featured list (sort
 * order), so a habit keeps its color on every device.
 */
export const HABIT_COLORS = ["#059669", "#2a78d6", "#7c3aed", "#ea580c"];

/** A member's featured habits, in tile order. */
export function featuredHabits(metrics: Metric[], userId: string): Metric[] {
  return metrics
    .filter(
      (m) =>
        m.user_id === userId &&
        m.type === "yesno" &&
        m.featured &&
        !m.archived,
    )
    .sort((a, b) => a.sort - b.sort || (a.created_at < b.created_at ? -1 : 1))
    .slice(0, MAX_FEATURED);
}

/** The set of days a habit was done (value != 0). */
export function doneDays(logs: DailyLog[], metricId: string): Set<string> {
  return new Set(
    logs
      .filter((l) => l.metric_id === metricId && Number(l.value) !== 0)
      .map((l) => l.day),
  );
}

/**
 * Consecutive done-days ending at `day` (inclusive). 0 if `day` itself
 * isn't done — used for "3rd day straight" callouts.
 */
export function streakEndingAt(days: Set<string>, day: string): number {
  let d = day;
  let n = 0;
  while (days.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

/**
 * Streak with today-grace: if `today` isn't done yet, count from yesterday —
 * today doesn't break a habit streak until it's over.
 */
export function streakWithGrace(days: Set<string>, today: string): number {
  return streakEndingAt(days, days.has(today) ? today : addDays(today, -1));
}

/** "2nd", "3rd", "11th"… */
export function ordinal(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
