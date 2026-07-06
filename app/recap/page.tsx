"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { addDays, formatWeek, weekStart } from "@/lib/dates";
import { useTodayNY } from "@/lib/useTodayNY";
import { computeProgress, formatValue, STATUS_LABEL } from "@/lib/goals";
import type { DailyLog, Metric, Profile, WeeklyGoal } from "@/lib/types";
import { Card, ErrorBanner, PageHeader, Spinner } from "@/components/ui";

interface WeekData {
  /** Which week this data belongs to — stale data for another week renders as loading. */
  week: string;
  goals: WeeklyGoal[];
  logs: DailyLog[];
  metrics: Metric[];
}

export default function RecapPage() {
  const { profiles } = useApp();
  const today = useTodayNY();
  const thisWeek = weekStart(today);

  const [week, setWeek] = useState(thisWeek);
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState<{ week: string; message: string } | null>(
    null,
  );

  // Data/error for a different week than the one selected = still loading.
  const current = data && data.week === week ? data : null;
  const currentError = error && error.week === week ? error.message : null;

  const weekOver = week < thisWeek;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const weekEnd = addDays(week, 6);
      const [goalsRes, logsRes, metricsRes] = await Promise.all([
        supabase.from("weekly_goals").select("*").eq("week_start", week),
        supabase
          .from("daily_logs")
          .select("*")
          .gte("day", week)
          .lte("day", weekEnd),
        supabase.from("metrics").select("*"),
      ]);

      if (cancelled) return;

      const firstError = goalsRes.error ?? logsRes.error ?? metricsRes.error;
      if (firstError) {
        setError({ week, message: firstError.message });
        return;
      }
      setData({
        week,
        goals: (goalsRes.data ?? []) as WeeklyGoal[],
        logs: (logsRes.data ?? []) as DailyLog[],
        metrics: (metricsRes.data ?? []) as Metric[],
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [week]);

  return (
    <>
      <PageHeader
        title="Weekly recap"
        subtitle="Who actually did what they said they would."
      />

      <div className="mb-4 flex items-center justify-between rounded-2xl bg-card px-2 py-1">
        <button
          type="button"
          onClick={() => setWeek((w) => addDays(w, -7))}
          aria-label="Previous week"
          className="flex h-11 w-11 items-center justify-center text-xl text-dim"
        >
          ‹
        </button>
        <span className="text-[14px] font-bold">
          {formatWeek(week)}
          {week === thisWeek && (
            <span className="font-normal text-dim"> (in progress)</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setWeek((w) => addDays(w, 7))}
          disabled={week >= thisWeek}
          aria-label="Next week"
          className="flex h-11 w-11 items-center justify-center text-xl text-dim disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <ErrorBanner message={currentError} />

      {!current && !currentError && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {current && (
        <div className="flex flex-col gap-3">
          {profiles.map((p) => (
            <MemberRecap
              key={p.id}
              profile={p}
              data={current}
              weekOver={weekOver}
            />
          ))}
        </div>
      )}
    </>
  );
}

function MemberRecap({
  profile,
  data,
  weekOver,
}: {
  profile: Profile;
  data: WeekData;
  weekOver: boolean;
}) {
  const goals = data.goals.filter((g) => g.user_id === profile.id);
  const metricById = new Map(data.metrics.map((m) => [m.id, m]));
  const progress = goals
    .map((g) => {
      const metric = metricById.get(g.metric_id);
      return metric ? computeProgress(metric, g, data.logs, weekOver) : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const hits = progress.filter((p) => p.status === "hit").length;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">{profile.display_name}</h2>
        {progress.length > 0 && (
          <span
            className={`text-sm font-bold ${
              weekOver && hits < progress.length ? "text-warn" : "text-accent"
            }`}
          >
            {hits}/{progress.length} {weekOver ? "hit" : "hit so far"}
          </span>
        )}
      </div>

      {progress.length === 0 ? (
        <p className="mt-2 text-sm text-dim">
          No goals set this week.{" "}
          <Link href="/goals" className="underline underline-offset-2">
            That&apos;s its own kind of failure.
          </Link>
        </p>
      ) : (
        <div className="mt-2 divide-y divide-soft">
          {progress.map((p) => (
            <div
              key={p.goal.id}
              className="flex items-center justify-between gap-2 py-2 text-[14px]"
            >
              <span className="min-w-0 truncate">{p.metric.name}</span>
              <span
                className={`shrink-0 font-semibold ${
                  p.status === "hit"
                    ? "text-accent"
                    : p.status === "on_track"
                      ? "text-ink"
                      : p.status === "pending"
                        ? "text-dim"
                        : "text-danger"
                }`}
              >
                {formatValue(p.value)} / {formatValue(Number(p.goal.target))}
                {p.metric.unit ? ` ${p.metric.unit}` : ""} ·{" "}
                {STATUS_LABEL[p.status]}
                {p.status === "hit" ? " ✓" : p.status === "miss" ? " ✗" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
