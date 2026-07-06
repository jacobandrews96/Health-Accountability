"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { addDays, formatWeek, weekStart } from "@/lib/dates";
import { useTodayNY } from "@/lib/useTodayNY";
import { computeProgress, formatValue, STATUS_LABEL } from "@/lib/goals";
import { timestampToDayNY } from "@/lib/dates";
import type { DailyLog, Metric, Profile, Vice, ViceEvent, WeeklyGoal } from "@/lib/types";
import { Card, ErrorBanner, PageHeader, Spinner } from "@/components/ui";

interface WeekData {
  /** Which week this data belongs to — stale data for another week renders as loading. */
  week: string;
  goals: WeeklyGoal[];
  logs: DailyLog[];
  metrics: Metric[];
  vices: Vice[];
  viceEvents: ViceEvent[];
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
      const [goalsRes, logsRes, metricsRes, vicesRes, eventsRes] =
        await Promise.all([
          supabase.from("weekly_goals").select("*").eq("week_start", week),
          supabase
            .from("daily_logs")
            .select("*")
            .gte("day", week)
            .lte("day", weekEnd),
          supabase.from("metrics").select("*"),
          supabase.from("vices").select("*"),
          supabase
            .from("vice_events")
            .select("*")
            .gte("occurred_at", `${week}T00:00:00Z`),
        ]);

      if (cancelled) return;

      const firstError =
        goalsRes.error ??
        logsRes.error ??
        metricsRes.error ??
        vicesRes.error ??
        eventsRes.error;
      if (firstError) {
        setError({ week, message: firstError.message });
        return;
      }
      setData({
        week,
        goals: (goalsRes.data ?? []) as WeeklyGoal[],
        logs: (logsRes.data ?? []) as DailyLog[],
        metrics: (metricsRes.data ?? []) as Metric[],
        vices: (vicesRes.data ?? []) as Vice[],
        viceEvents: ((eventsRes.data ?? []) as ViceEvent[]).filter((e) => {
          const d = timestampToDayNY(e.occurred_at);
          return d >= week && d <= weekEnd;
        }),
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

function SlipsLine({
  profile,
  data,
}: {
  profile: Profile;
  data: WeekData;
}) {
  const viceById = new Map(data.vices.map((v) => [v.id, v]));
  const counts = new Map<string, number>();
  for (const e of data.viceEvents) {
    if (e.user_id !== profile.id) continue;
    const name = viceById.get(e.vice_id)?.name ?? "vice";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([name, n]) => `${name} ×${n}`);
  return (
    <p className="mt-1.5 text-[13px]">
      <span className="text-dim">Slips: </span>
      {parts.length === 0 ? (
        <span className="font-semibold text-accent">none — clean week</span>
      ) : (
        <span className="font-semibold text-danger">{parts.join(" · ")}</span>
      )}
    </p>
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

      <SlipsLine profile={profile} data={data} />

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
