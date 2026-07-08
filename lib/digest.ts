import type { DailyLog, Metric, Workout } from "@/lib/types";
import { doneDays, featuredHabits, ordinal, streakEndingAt } from "@/lib/habits";

/**
 * Rule-based digest for a member's day — the "AI-optimized" summary, computed
 * deterministically from the data. Composes lines like:
 *   "Gym ✓ — 3rd day straight · No ordering in ✓ · weight ↓ 0.5 · 1 slip"
 * Upgradeable to a real model later without changing any callers.
 */
export function dayDigest(input: {
  userId: string;
  day: string;
  /** That member's metrics (any set that includes their featured + weight). */
  metrics: Metric[];
  /** Daily logs for that member covering the streak window (~60 days). */
  logs: DailyLog[];
  /** That member's workouts on `day`. */
  workouts: Workout[];
  /** That member's vice slips on `day`. */
  slips: number;
  mood: number | null;
}): string[] {
  const { userId, day, metrics, logs, workouts, slips, mood } = input;
  const mine = logs.filter((l) => l.user_id === userId);
  const parts: string[] = [];

  if (mood !== null) parts.push(`Mood ${mood}/10`);

  // Headline habits, with streak callouts when they're on a run.
  for (const habit of featuredHabits(metrics, userId)) {
    const days = doneDays(mine, habit.id);
    if (!days.has(day)) continue;
    const streak = streakEndingAt(days, day);
    parts.push(
      streak >= 2
        ? `${habit.name} ✓ — ${ordinal(streak)} day straight`
        : `${habit.name} ✓`,
    );
  }

  // Weight trend vs. the previous weigh-in.
  const weightMetric = metrics.find(
    (m) => m.user_id === userId && m.name.toLowerCase() === "weight",
  );
  if (weightMetric) {
    const weighIns = mine
      .filter((l) => l.metric_id === weightMetric.id && l.day <= day)
      .sort((a, b) => (a.day < b.day ? -1 : 1));
    const todayIdx = weighIns.findIndex((l) => l.day === day);
    if (todayIdx > 0) {
      const delta =
        Math.round((Number(weighIns[todayIdx].value) - Number(weighIns[todayIdx - 1].value)) * 10) / 10;
      if (delta !== 0) {
        parts.push(`weight ${delta < 0 ? "↓" : "↑"} ${Math.abs(delta)}`);
      }
    }
  }

  for (const w of workouts) {
    parts.push(w.duration_min != null ? `${w.kind} (${w.duration_min} min)` : w.kind);
  }

  if (slips > 0) parts.push(`${slips} slip${slips === 1 ? "" : "s"}`);

  return parts;
}
