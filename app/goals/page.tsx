"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { addDays, formatWeek, todayNY, weekStart } from "@/lib/dates";
import { useTodayNY } from "@/lib/useTodayNY";
import { computeProgress, formatValue } from "@/lib/goals";
import type { DailyLog, Metric, WeeklyGoal } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  SectionTitle,
  Spinner,
} from "@/components/ui";

export default function GoalsPage() {
  const { userId } = useApp();
  const day = useTodayNY();
  const thisWeek = weekStart(day);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [allGoals, setAllGoals] = useState<WeeklyGoal[]>([]);
  const [myLogs, setMyLogs] = useState<DailyLog[]>([]);

  /** Target inputs for this week, keyed by metric id ("" = no goal). */
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const [carriedFrom, setCarriedFrom] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [metricsRes, goalsRes, logsRes] = await Promise.all([
        supabase
          .from("metrics")
          .select("*")
          .eq("user_id", userId)
          .eq("archived", false)
          .order("sort"),
        supabase
          .from("weekly_goals")
          .select("*")
          .eq("user_id", userId)
          .order("week_start", { ascending: false }),
        supabase.from("daily_logs").select("*").eq("user_id", userId),
      ]);

      if (cancelled) return;

      const firstError = metricsRes.error ?? goalsRes.error ?? logsRes.error;
      if (firstError) {
        setLoadError(firstError.message);
        setLoading(false);
        return;
      }

      const loadedMetrics = (metricsRes.data ?? []) as Metric[];
      const goals = (goalsRes.data ?? []) as WeeklyGoal[];

      // Prefill: this week's goals, else carry forward the most recent week
      // that had any — 30-second goal setting.
      const current = goals.filter((g) => g.week_start === thisWeek);
      let source = current;
      let carried: string | null = null;
      if (current.length === 0) {
        const lastWeekWithGoals = goals.find((g) => g.week_start < thisWeek);
        if (lastWeekWithGoals) {
          source = goals.filter(
            (g) => g.week_start === lastWeekWithGoals.week_start,
          );
          carried = lastWeekWithGoals.week_start;
        }
      }
      const prefill: Record<string, string> = {};
      for (const g of source) prefill[g.metric_id] = formatValue(Number(g.target));

      setMetrics(loadedMetrics);
      setAllGoals(goals);
      setMyLogs((logsRes.data ?? []) as DailyLog[]);
      setTargets(prefill);
      setCarriedFrom(carried);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, thisWeek]);

  function setTarget(id: string, v: string) {
    setTargets((prev) => ({ ...prev, [id]: v }));
    setSaved(false);
    setInvalidIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function save() {
    if (saving) return;
    if (todayNY() !== day) {
      setSaveError("It's a new day — the page reloaded. Check the week and save again.");
      return;
    }

    const existing = new Map(
      allGoals
        .filter((g) => g.week_start === thisWeek)
        .map((g) => [g.metric_id, g]),
    );
    const upserts: {
      user_id: string;
      metric_id: string;
      week_start: string;
      target: number;
    }[] = [];
    const deletes: string[] = [];
    const invalid = new Set<string>();

    for (const m of metrics) {
      const raw = (targets[m.id] ?? "").trim();
      if (raw === "") {
        if (existing.has(m.id)) deletes.push(m.id);
        continue;
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        invalid.add(m.id);
        continue;
      }
      upserts.push({
        user_id: userId,
        metric_id: m.id,
        week_start: thisWeek,
        target: num,
      });
    }

    if (invalid.size > 0) {
      setInvalidIds(invalid);
      const names = metrics
        .filter((m) => invalid.has(m.id))
        .map((m) => m.name)
        .join(", ");
      setSaveError(`Not a number: ${names}. Fix it and save again.`);
      return;
    }

    setSaving(true);
    setSaveError(null);

    let errMsg: string | null = null;
    if (upserts.length > 0) {
      const res = await supabase
        .from("weekly_goals")
        .upsert(upserts, { onConflict: "user_id,metric_id,week_start" });
      if (res.error) errMsg = res.error.message;
    }
    if (!errMsg && deletes.length > 0) {
      const res = await supabase
        .from("weekly_goals")
        .delete()
        .eq("user_id", userId)
        .eq("week_start", thisWeek)
        .in("metric_id", deletes);
      if (res.error) errMsg = res.error.message;
    }

    // Resync local goal state from what we know landed.
    const refreshed = await supabase
      .from("weekly_goals")
      .select("*")
      .eq("user_id", userId)
      .order("week_start", { ascending: false });
    if (!refreshed.error && refreshed.data) {
      setAllGoals(refreshed.data as WeeklyGoal[]);
    }

    setSaving(false);
    if (errMsg) {
      setSaveError(errMsg);
      return;
    }
    setCarriedFrom(null);
    setSaved(true);
  }

  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const pastWeeks = [
    ...new Set(
      allGoals.map((g) => g.week_start).filter((w) => w < thisWeek),
    ),
  ].sort((a, b) => (a < b ? 1 : -1));

  return (
    <>
      <PageHeader
        title="Weekly goals"
        subtitle={`${formatWeek(thisWeek)}. Set the bar — then clear it.`}
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : loadError ? (
        <ErrorBanner message={loadError} />
      ) : (
        <>
          {carriedFrom && (
            <p className="mb-3 rounded-xl bg-soft/50 px-3.5 py-2.5 text-[13px] text-dim">
              Pre-filled from {formatWeek(carriedFrom).toLowerCase()}. Adjust
              and save — takes 30 seconds.
            </p>
          )}

          {metrics.length === 0 ? (
            <EmptyState>No metrics yet. Set them up in the Metrics tab.</EmptyState>
          ) : (
            <Card className="py-1">
              <div className="divide-y divide-soft">
                {metrics.map((m) => (
                  <div key={m.id} className="py-3.5">
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-[14px] font-semibold">{m.name}</span>
                      <span className="text-[12px] text-dim">
                        {m.direction === "higher"
                          ? "at least"
                          : m.direction === "cap"
                            ? "cap at"
                            : "at most"}
                        {" · "}
                        {aggLabel(m)}
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        value={targets[m.id] ?? ""}
                        onChange={(e) => setTarget(m.id, e.target.value)}
                        inputMode="decimal"
                        placeholder="No goal this week"
                        aria-label={`${m.name} target`}
                        className={`${m.unit ? "pr-16" : ""} ${
                          invalidIds.has(m.id) ? "border-danger" : ""
                        }`}
                      />
                      {m.unit && (
                        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] font-semibold text-dim">
                          {m.unit}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="mt-6">
            {saveError && <ErrorBanner message={saveError} />}
            {saved && (
              <p className="mb-2 text-center text-sm font-bold text-accent">
                Goals locked in. Now go earn them.
              </p>
            )}
            <Button
              onClick={save}
              disabled={saving || metrics.length === 0}
              className="w-full py-4 text-base"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save this week's goals"}
            </Button>
          </div>

          {pastWeeks.length > 0 && (
            <>
              <SectionTitle>History</SectionTitle>
              <button
                type="button"
                onClick={() => setShowHistory((s) => !s)}
                aria-expanded={showHistory}
                className="mb-2 flex min-h-11 w-full items-center justify-between text-left text-[14px] font-semibold text-dim"
              >
                <span>Past weeks ({pastWeeks.length})</span>
                <span
                  className={`transition-transform ${showHistory ? "rotate-90" : ""}`}
                >
                  ›
                </span>
              </button>
              {showHistory && (
                <div className="flex flex-col gap-3">
                  {pastWeeks.map((week) => (
                    <Card key={week}>
                      <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-dim">
                        {formatWeek(week)}
                      </p>
                      <div className="divide-y divide-soft">
                        {allGoals
                          .filter((g) => g.week_start === week)
                          .map((g) => {
                            const metric = metricById.get(g.metric_id);
                            if (!metric) return null;
                            const weekLogs = myLogs.filter(
                              (l) =>
                                l.day >= week && l.day <= addDays(week, 6),
                            );
                            const p = computeProgress(metric, g, weekLogs, true);
                            const hit = p.status === "hit";
                            return (
                              <div
                                key={g.id}
                                className="flex items-center justify-between gap-2 py-2 text-[14px]"
                              >
                                <span>{metric.name}</span>
                                <span
                                  className={
                                    hit
                                      ? "font-semibold text-accent"
                                      : "font-semibold text-danger"
                                  }
                                >
                                  {formatValue(p.value)} / {formatValue(Number(g.target))}
                                  {metric.unit ? ` ${metric.unit}` : ""}{" "}
                                  {hit ? "✓" : "✗"}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

function aggLabel(m: Metric): string {
  switch (m.agg) {
    case "sum":
      return "week total";
    case "avg":
      return "daily average";
    case "count_days":
      return "days logged";
    case "last":
      return "latest value";
  }
}
