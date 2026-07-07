"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { addDays, formatDay, formatTimeNY } from "@/lib/dates";
import { useTodayNY } from "@/lib/useTodayNY";
import type { Checkin, DailyLog, Metric, Workout } from "@/lib/types";
import {
  Card,
  EmptyState,
  ErrorBanner,
  SectionTitle,
  Spinner,
} from "@/components/ui";

/** A member's full inputs for one day — the "click into their profile" view. */
export default function MemberPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      }
    >
      <MemberDay />
    </Suspense>
  );
}

interface DayData {
  /** Cache key: whose day and which day this data belongs to. */
  key: string;
  metrics: Metric[];
  logs: DailyLog[];
  checkin: Checkin | null;
  workouts: Workout[];
}

function MemberDay() {
  const { profiles } = useApp();
  const params = useSearchParams();
  const today = useTodayNY();

  const memberId = params.get("id") ?? "";
  const profile = profiles.find((p) => p.id === memberId) ?? null;

  const initialDay = params.get("day");
  const [day, setDay] = useState(
    initialDay && /^\d{4}-\d{2}-\d{2}$/.test(initialDay) ? initialDay : today,
  );

  const [data, setData] = useState<DayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = `${memberId}:${day}`;
  const current = data && data.key === key ? data : null;

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;

    async function load() {
      const [metricsRes, logsRes, checkinRes, workoutsRes] = await Promise.all([
        supabase.from("metrics").select("*").eq("user_id", memberId).order("sort"),
        supabase
          .from("daily_logs")
          .select("*")
          .eq("user_id", memberId)
          .eq("day", day),
        supabase
          .from("checkins")
          .select("*")
          .eq("user_id", memberId)
          .eq("day", day)
          .maybeSingle(),
        supabase
          .from("workouts")
          .select("*")
          .eq("user_id", memberId)
          .eq("day", day)
          .order("created_at"),
      ]);

      if (cancelled) return;

      const firstError =
        metricsRes.error ?? logsRes.error ?? checkinRes.error ?? workoutsRes.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }
      setData({
        key: `${memberId}:${day}`,
        metrics: (metricsRes.data ?? []) as Metric[],
        logs: (logsRes.data ?? []) as DailyLog[],
        checkin: (checkinRes.data ?? null) as Checkin | null,
        workouts: (workoutsRes.data ?? []) as Workout[],
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [memberId, day]);

  if (!profile) {
    return <EmptyState>Who? That member doesn&apos;t exist.</EmptyState>;
  }

  return (
    <>
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">
          {profile.display_name}&apos;s day
        </h1>
      </header>

      <div className="mb-4 flex items-center justify-between rounded-2xl bg-card px-2 py-1 shadow-card">
        <button
          type="button"
          onClick={() => setDay((d) => addDays(d, -1))}
          aria-label="Previous day"
          className="flex h-11 w-11 items-center justify-center text-xl text-dim"
        >
          ‹
        </button>
        <span className="text-[14px] font-bold">
          {formatDay(day)}
          {day === today && <span className="font-normal text-dim"> (today)</span>}
        </span>
        <button
          type="button"
          onClick={() => setDay((d) => addDays(d, 1))}
          disabled={day >= today}
          aria-label="Next day"
          className="flex h-11 w-11 items-center justify-center text-xl text-dim disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <ErrorBanner message={error} />

      {!current && !error && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {current && (
        <DayDetail data={current} name={profile.display_name} day={day} today={today} />
      )}
    </>
  );
}

function DayDetail({
  data,
  name,
  day,
  today,
}: {
  data: DayData;
  name: string;
  day: string;
  today: string;
}) {
  const { metrics, logs, checkin, workouts } = data;
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const loggedRows = logs
    .map((l) => ({ log: l, metric: metricById.get(l.metric_id) }))
    .filter((r): r is { log: DailyLog; metric: Metric } => !!r.metric)
    .sort((a, b) => a.metric.sort - b.metric.sort);

  if (!checkin && loggedRows.length === 0 && workouts.length === 0) {
    return (
      <EmptyState>
        {day === today
          ? `${name} hasn't logged anything today. Yet.`
          : `${name} logged nothing on this day.`}
      </EmptyState>
    );
  }

  const displayValue = (metric: Metric, value: number) => {
    if (metric.type === "yesno") return Number(value) !== 0 ? "Yes" : "No";
    const rounded = Math.round(Number(value) * 10) / 10;
    return `${rounded}${metric.unit ? ` ${metric.unit}` : ""}${
      metric.type === "scale" ? "/10" : ""
    }`;
  };

  return (
    <>
      {checkin && (
        <p className="mb-3 text-sm font-semibold text-accent">
          Checked in ✓{" "}
          <span className="font-normal text-dim">
            at {formatTimeNY(checkin.created_at)}
          </span>
        </p>
      )}

      {loggedRows.length > 0 && (
        <>
          <SectionTitle>Numbers</SectionTitle>
          <Card className="py-1">
            <div className="divide-y divide-soft">
              {loggedRows.map(({ log, metric }) => (
                <div
                  key={log.id}
                  className="flex items-baseline justify-between gap-2 py-2.5 text-[14px]"
                >
                  <span className="min-w-0 truncate">
                    {metric.name}
                    {metric.archived && (
                      <span className="text-[11px] text-dim"> (retired)</span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold">
                    {displayValue(metric, log.value)}
                  </span>
                </div>
              ))}
              {checkin?.sleep_quality != null && (
                <div className="flex items-baseline justify-between gap-2 py-2.5 text-[14px]">
                  <span>Sleep quality</span>
                  <span className="shrink-0 font-semibold">
                    {checkin.sleep_quality}/10
                  </span>
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {checkin && (checkin.mood !== null || checkin.mood_note) && (
        <>
          <SectionTitle>Mood</SectionTitle>
          <Card>
            {checkin.mood !== null && (
              <p className="text-2xl font-bold text-accent">{checkin.mood}/10</p>
            )}
            {checkin.mood_note && (
              <p className="mt-1 text-[14px] text-dim">“{checkin.mood_note}”</p>
            )}
          </Card>
        </>
      )}

      {workouts.length > 0 && (
        <>
          <SectionTitle>Workouts</SectionTitle>
          <Card className="py-1">
            <div className="divide-y divide-soft">
              {workouts.map((w) => (
                <div key={w.id} className="py-2.5">
                  <p className="text-[15px] font-semibold">
                    {w.kind}
                    {w.duration_min != null && (
                      <span className="font-normal text-dim">
                        {" "}
                        · {w.duration_min} min
                      </span>
                    )}
                  </p>
                  {w.note && <p className="text-[13px] text-dim">{w.note}</p>}
                  {w.details?.exercises?.map((ex, i) => (
                    <p key={i} className="mt-1 text-[13px]">
                      <span className="font-semibold">{ex.name}</span>{" "}
                      <span className="text-dim">
                        {ex.sets
                          .map((s) =>
                            s.weight != null
                              ? `${s.reps ?? "?"}×${s.weight}`
                              : `${s.reps ?? "?"} reps`,
                          )
                          .join(", ")}
                      </span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
