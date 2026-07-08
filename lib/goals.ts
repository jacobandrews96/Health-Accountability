import type { DailyLog, Metric, WeeklyGoal } from "@/lib/types";

/**
 * Weekly-goal math shared by the goals editor, the dashboard, and the recap.
 * A week of daily values rolls up per the metric's `agg`, then the roll-up is
 * judged against the target per the metric's `direction`.
 */

export type GoalStatus =
  | "hit" // target met (final for higher-is-better; end-of-week otherwise)
  | "on_track" // within budget / progressing, week still open
  | "over" // blown past a cap/lower target, week still open
  | "miss" // week over, target not met
  | "pending"; // nothing logged yet

export interface GoalProgress {
  metric: Metric;
  goal: WeeklyGoal;
  /** The week's rolled-up value so far; null when nothing is logged. */
  value: number | null;
  /** Days in the week with a logged value for this metric. */
  daysLogged: number;
  /** 0..1 fill for progress bars (capped at 1). */
  ratio: number;
  status: GoalStatus;
}

/** Roll a week of logs (already filtered to one member + metric + week) into one number. */
export function rollupWeek(metric: Metric, logs: DailyLog[]): number | null {
  if (logs.length === 0) return null;
  const values = logs.map((l) => Number(l.value));
  switch (metric.agg) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "count_days":
      return logs.length;
    case "last": {
      const latest = [...logs].sort((a, b) => (a.day < b.day ? -1 : 1)).at(-1);
      return latest ? Number(latest.value) : null;
    }
  }
}

export function judgeGoal(
  metric: Metric,
  target: number,
  value: number | null,
  weekOver: boolean,
): GoalStatus {
  if (value === null) return weekOver ? "miss" : "pending";
  if (metric.direction === "higher") {
    // A hit can't be un-hit; mid-week shortfall is just "not there yet".
    if (value >= target) return "hit";
    return weekOver ? "miss" : "on_track";
  }
  // lower / cap: staying at-or-under only becomes a hit when the week ends.
  if (value <= target) return weekOver ? "hit" : "on_track";
  return weekOver ? "miss" : "over";
}

export function progressRatio(
  metric: Metric,
  target: number,
  value: number | null,
): number {
  if (value === null) return 0;
  if (target <= 0) {
    // e.g. "0 meals ordered in": clean = full bar, any slip = full bar (red).
    return metric.direction === "higher" ? (value > 0 ? 1 : 0) : 1;
  }
  return Math.min(1, value / target);
}

export function computeProgress(
  metric: Metric,
  goal: WeeklyGoal,
  weekLogs: DailyLog[],
  weekOver: boolean,
): GoalProgress {
  const mine = weekLogs.filter(
    (l) => l.metric_id === metric.id && l.user_id === goal.user_id,
  );
  const value = rollupWeek(metric, mine);
  const target = Number(goal.target);
  return {
    metric,
    goal,
    value,
    daysLogged: mine.length,
    ratio: progressRatio(metric, target, value),
    status: judgeGoal(metric, target, value, weekOver),
  };
}

/** Round to at most 1 decimal for display ("7.5", "2200", "3"). */
export function formatValue(n: number | null): string {
  if (n === null) return "—";
  return String(Math.round(n * 10) / 10);
}

/**
 * The one human question that replaces the direction/roll-up config jargon:
 * "What counts as a good week?" Each answer maps to a (direction, agg) pair.
 */
export interface GoodWeekOption {
  key: string;
  /** Dropdown label, with an example. */
  label: string;
  /** Short plain-words summary for list rows. */
  short: string;
  direction: Metric["direction"];
  agg: Metric["agg"];
}

export const GOOD_WEEK_OPTIONS: GoodWeekOption[] = [
  { key: "total_up", label: "Hit a weekly total — like 4 gym sessions", short: "weekly total", direction: "higher", agg: "sum" },
  { key: "avg_up", label: "Daily average, more is better — like 8,000 steps", short: "daily average", direction: "higher", agg: "avg" },
  { key: "avg_under", label: "Stay under a daily average — like 2,200 kcal", short: "stay under (daily avg)", direction: "cap", agg: "avg" },
  { key: "total_under", label: "Stay under a weekly total — like 2 meals ordered in", short: "stay under (weekly total)", direction: "cap", agg: "sum" },
  { key: "latest", label: "Just track the latest — like weight", short: "latest value", direction: "lower", agg: "last" },
];

/** The option matching a metric's stored config, or null for legacy combos. */
export function goodWeekKeyFor(m: Pick<Metric, "direction" | "agg">): string | null {
  // Lower and cap judge identically; treat them as the same bucket here.
  const dir = m.direction === "lower" ? "cap" : m.direction;
  if (m.agg === "last") return "latest";
  const hit = GOOD_WEEK_OPTIONS.find((o) => {
    const oDir = o.direction === "lower" ? "cap" : o.direction;
    return oDir === dir && o.agg === m.agg;
  });
  return hit?.key ?? null;
}

/** Plain-words summary of how a metric's week is judged. */
export function goodWeekShort(m: Pick<Metric, "direction" | "agg">): string {
  const key = goodWeekKeyFor(m);
  const opt = GOOD_WEEK_OPTIONS.find((o) => o.key === key);
  return opt?.short ?? `${m.agg}, ${m.direction}`;
}

export const STATUS_LABEL: Record<GoalStatus, string> = {
  hit: "hit",
  on_track: "on track",
  over: "over",
  miss: "missed",
  pending: "nothing logged",
};
