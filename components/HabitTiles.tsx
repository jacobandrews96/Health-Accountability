"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { addDays, todayNY } from "@/lib/dates";
import {
  HABIT_COLORS,
  MAX_FEATURED,
  doneDays,
  featuredHabits,
  streakWithGrace,
} from "@/lib/habits";
import type { DailyLog, Metric, Profile } from "@/lib/types";
import { ErrorBanner } from "@/components/ui";

/**
 * Arcade habit tiles — a member's featured yes/no habits as big tappable
 * blocks. My tiles toggle today's log in one tap (optimistic, then upsert);
 * my partner's tiles are the read-only social mirror in the same color
 * language. Each tile carries its 🔥 streak and a 7-day dot row.
 */
export default function HabitTiles({
  profile,
  isMe,
  day,
  metrics,
  logs,
  onLogged,
  onPerfectDay,
}: {
  profile: Profile;
  isMe: boolean;
  day: string;
  /** Every member's metric definitions (filtered to this member here). */
  metrics: Metric[];
  /** THIS member's daily_logs (full history — streaks walk all the way back). */
  logs: DailyLog[];
  /** Called after a successful toggle so the parent can refetch. */
  onLogged?: () => void;
  /** Called when a tap flips the LAST of ≥2 featured habits to done for today. */
  onPerfectDay?: () => void;
}) {
  const habits = featuredHabits(metrics, profile.id);

  /**
   * Optimistic value of today's tap, keyed `${metricId}|${day}` so a tab left
   * open past midnight can't leak yesterday's flip into the new day.
   */
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  /** Metric ids with a write in flight — repeat taps wait for it to land. */
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // When fresh logs arrive, drop overrides with no write in flight — the
  // server is the truth, and a kept override would forever mask changes
  // made elsewhere (e.g. the check-in form on another tab). Render-phase
  // state adjustment, keyed on the logs prop identity.
  const [seenLogs, setSeenLogs] = useState<DailyLog[]>(logs);
  if (logs !== seenLogs) {
    setSeenLogs(logs);
    const inFlight = busyIds;
    const pruned = Object.fromEntries(
      Object.entries(overrides).filter(([key]) =>
        inFlight.has(key.split("|")[0]),
      ),
    );
    if (Object.keys(pruned).length !== Object.keys(overrides).length) {
      setOverrides(pruned);
    }
  }

  if (habits.length === 0) {
    return isMe ? (
      <Link
        href="/metrics"
        className="block rounded-2xl border-2 border-dashed border-soft bg-card px-4 py-5 text-center shadow-card active:opacity-70"
      >
        <span className="block text-[15px] font-bold text-accent">
          Pick up to {MAX_FEATURED} headline habits
        </span>
        <span className="mt-1 block text-[13px] text-dim">
          They go big up here — one tap a day.
        </span>
      </Link>
    ) : (
      <p className="text-[13px] text-dim">
        {profile.display_name} hasn&apos;t picked headline habits yet.
      </p>
    );
  }

  // Effective done-day sets: server truth plus today's optimistic flips.
  const habitDays = habits.map((h) => {
    const days = doneDays(logs, h.id);
    const override = overrides[`${h.id}|${day}`];
    if (override !== undefined) {
      if (override !== 0) days.add(day);
      else days.delete(day);
    }
    return days;
  });

  // Last 7 days, today rightmost.
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6));

  async function toggle(index: number) {
    const habit = habits[index];
    if (!isMe || busyIds.has(habit.id)) return;
    // Never write onto a stale day (tab restored across midnight) — the page
    // rolls to the new day on its own within a minute.
    if (todayNY() !== day) return;

    const key = `${habit.id}|${day}`;
    const wasDone = habitDays[index].has(day);
    const newValue = wasDone ? 0 : 1;
    // Does this tap complete the whole featured set for today?
    const completesSet =
      newValue === 1 &&
      habits.length >= 2 &&
      habitDays.every((days, i) => i === index || days.has(day));
    const prevOverride = overrides[key];

    setError(null);
    setOverrides((prev) => ({ ...prev, [key]: newValue }));
    setBusyIds((prev) => new Set(prev).add(habit.id));

    // Toggling off writes an explicit 0 — "didn't do it" — not a delete.
    // Fixing a mis-tap shouldn't erase the honest answer.
    const { error: writeError } = await supabase.from("daily_logs").upsert(
      { user_id: profile.id, metric_id: habit.id, day, value: newValue },
      { onConflict: "user_id,metric_id,day" },
    );

    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(habit.id);
      return next;
    });

    if (writeError) {
      setOverrides((prev) => {
        const next = { ...prev };
        if (prevOverride === undefined) delete next[key];
        else next[key] = prevOverride;
        return next;
      });
      setError(writeError.message);
      return;
    }

    if (completesSet) onPerfectDay?.();
    onLogged?.();
  }

  return (
    <div>
      {isMe && <ErrorBanner message={error} />}
      <div className={`grid grid-cols-2 ${isMe ? "gap-3" : "gap-2"}`}>
        {habits.map((habit, i) => {
          const color = HABIT_COLORS[i];
          const days = habitDays[i];
          const done = days.has(day);
          const streak = streakWithGrace(days, day);
          const style = done
            ? { backgroundColor: color, borderColor: color }
            : { borderColor: color, color };

          if (!isMe) {
            // Partner tiles: same color language, compact, not tappable.
            return (
              <div
                key={habit.id}
                className={`flex min-h-16 flex-col justify-between rounded-2xl border-2 px-2.5 py-2 ${
                  done ? "text-white" : "bg-card"
                }`}
                style={style}
              >
                <div className="flex w-full items-start justify-between gap-1.5">
                  <span className="min-w-0 truncate text-[13px] font-bold">
                    {habit.name}
                  </span>
                  {done && (
                    <span aria-hidden className="shrink-0 text-base font-bold leading-none">
                      ✓
                    </span>
                  )}
                  <span className="sr-only">
                    {done ? "done today" : "not done today"}
                  </span>
                </div>
                <div className="mt-1 flex w-full items-end justify-between gap-1.5">
                  <span className="text-[11px] font-bold tabular-nums">
                    🔥 {streak}
                  </span>
                  <DotRow days={last7} doneSet={days} color={color} onSolid={done} small />
                </div>
              </div>
            );
          }

          return (
            <button
              key={habit.id}
              type="button"
              onClick={() => toggle(i)}
              aria-pressed={done}
              aria-label={`${habit.name}: ${
                done ? "done today — tap to undo" : "tap to mark done for today"
              }`}
              className={`flex min-h-[92px] flex-col justify-between rounded-2xl border-2 p-3 text-left shadow-card transition-transform active:scale-[0.96] ${
                done ? "text-white" : "bg-card"
              }`}
              style={style}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span className="min-w-0 truncate text-[15px] font-bold">
                  {habit.name}
                </span>
                <span
                  aria-hidden
                  className={`shrink-0 text-2xl font-bold leading-none ${
                    done ? "" : "opacity-0"
                  }`}
                >
                  ✓
                </span>
              </div>
              <div className="mt-2 flex w-full items-end justify-between gap-2">
                <span className="text-[13px] font-bold tabular-nums">
                  🔥 {streak}
                </span>
                <DotRow days={last7} doneSet={days} color={color} onSolid={done} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Last-7-days dots, today rightmost. On a solid (done) tile the dots go white. */
function DotRow({
  days,
  doneSet,
  color,
  onSolid,
  small = false,
}: {
  days: string[];
  doneSet: Set<string>;
  color: string;
  onSolid: boolean;
  small?: boolean;
}) {
  const size = small ? "h-1 w-1" : "h-1.5 w-1.5";
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center ${small ? "gap-0.5" : "gap-1"}`}
    >
      {days.map((d) => {
        const hit = doneSet.has(d);
        if (onSolid) {
          return (
            <span
              key={d}
              className={`${size} rounded-full ${hit ? "bg-white" : "bg-white/35"}`}
            />
          );
        }
        return hit ? (
          <span
            key={d}
            className={`${size} rounded-full`}
            style={{ backgroundColor: color }}
          />
        ) : (
          <span key={d} className={`${size} rounded-full bg-soft`} />
        );
      })}
    </div>
  );
}
