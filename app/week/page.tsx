"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { addDays, formatWeek, todayNY, weekStart } from "@/lib/dates";
import { useTodayNY } from "@/lib/useTodayNY";
import {
  STATUS_LABEL,
  computeProgress,
  formatValue,
  goodWeekShort,
} from "@/lib/goals";
import { timestampToDayNY } from "@/lib/dates";
import type {
  DailyLog,
  Metric,
  Profile,
  Vice,
  ViceEvent,
  WeeklyGoal,
} from "@/lib/types";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  PageHeader,
  Spinner,
} from "@/components/ui";

/**
 * The Week tab: targets and results in one place. This week shows live
 * progress bars (edit your targets inline); swipe back and the same layout
 * is the recap, judged final.
 */
interface WeekData {
  week: string;
  goals: WeeklyGoal[]; // ALL weeks (tiny table) — powers carry-forward defaults
  logs: DailyLog[]; // selected week's logs
  metrics: Metric[];
  vices: Vice[];
  viceEvents: ViceEvent[];
}

export default function WeekPage() {
  const { userId, profiles } = useApp();
  const today = useTodayNY();
  const thisWeek = weekStart(today);

  const [week, setWeek] = useState(thisWeek);
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState<{ week: string; message: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const current = data && data.week === week ? data : null;
  const currentError = error && error.week === week ? error.message : null;
  const weekOver = week < thisWeek;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const weekEnd = addDays(week, 6);
      const [goalsRes, logsRes, metricsRes, vicesRes, eventsRes] =
        await Promise.all([
          supabase.from("weekly_goals").select("*"),
          supabase.from("daily_logs").select("*").gte("day", week).lte("day", weekEnd),
          supabase.from("metrics").select("*"),
          supabase.from("vices").select("*"),
          supabase
            .from("vice_events")
            .select("*")
            .gte("occurred_at", `${week}T00:00:00Z`),
        ]);

      if (cancelled) return;

      const firstError =
        goalsRes.error ?? logsRes.error ?? metricsRes.error ?? vicesRes.error ?? eventsRes.error;
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
          return d >= week && d <= addDays(week, 6);
        }),
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [week, reloadKey]);

  return (
    <>
      <PageHeader title="The week" subtitle="Targets on one side, truth on the other." />

      <div className="mb-4 flex items-center justify-between rounded-2xl bg-card px-2 py-1 shadow-card">
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
            <MemberWeek
              key={p.id}
              profile={p}
              isMe={p.id === userId}
              data={current}
              weekOver={weekOver}
              editable={p.id === userId && week === thisWeek}
              thisWeek={thisWeek}
              onSaved={() => setReloadKey((k) => k + 1)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function MemberWeek({
  profile,
  isMe,
  data,
  weekOver,
  editable,
  thisWeek,
  onSaved,
}: {
  profile: Profile;
  isMe: boolean;
  data: WeekData;
  weekOver: boolean;
  editable: boolean;
  thisWeek: string;
  onSaved: () => void;
}) {
  const [editingTargets, setEditingTargets] = useState(false);

  const weekGoals = data.goals.filter(
    (g) => g.user_id === profile.id && g.week_start === data.week,
  );
  const metricById = new Map(data.metrics.map((m) => [m.id, m]));
  const progress = weekGoals
    .map((g) => {
      const metric = metricById.get(g.metric_id);
      return metric ? computeProgress(metric, g, data.logs, weekOver) : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const hits = progress.filter((p) => p.status === "hit").length;

  // Vice slips for the selected week.
  const viceById = new Map(data.vices.map((v) => [v.id, v]));
  const slipCounts = new Map<string, number>();
  for (const e of data.viceEvents) {
    if (e.user_id !== profile.id) continue;
    const name = viceById.get(e.vice_id)?.name ?? "vice";
    slipCounts.set(name, (slipCounts.get(name) ?? 0) + 1);
  }
  const slipParts = [...slipCounts.entries()].map(([name, n]) => `${name} ×${n}`);

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          {profile.display_name}
          {isMe && <span className="font-normal text-dim"> (you)</span>}
        </h2>
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

      <p className="mt-1.5 text-[13px]">
        <span className="text-dim">Slips: </span>
        {slipParts.length === 0 ? (
          <span className="font-semibold text-accent">none — clean week</span>
        ) : (
          <span className="font-semibold text-danger">{slipParts.join(" · ")}</span>
        )}
      </p>

      {editingTargets && editable ? (
        <TargetEditor
          userId={profile.id}
          data={data}
          thisWeek={thisWeek}
          onDone={() => {
            setEditingTargets(false);
            onSaved();
          }}
          onCancel={() => setEditingTargets(false)}
        />
      ) : progress.length === 0 ? (
        <p className="mt-3 text-sm text-dim">
          No targets this week.{" "}
          {editable ? (
            <button
              type="button"
              onClick={() => setEditingTargets(true)}
              className="font-semibold text-accent underline underline-offset-2"
            >
              Set them — takes 30 seconds.
            </button>
          ) : isMe ? (
            <Link href="/week" className="underline underline-offset-2">
              That&apos;s its own kind of failure.
            </Link>
          ) : (
            "That's its own kind of failure."
          )}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2.5">
            {progress.map((p) => {
              const barColor =
                p.status === "hit"
                  ? "bg-accent-deep"
                  : p.status === "over" || p.status === "miss"
                    ? "bg-danger"
                    : "bg-accent-deep/50";
              return (
                <div key={p.goal.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate">{p.metric.name}</span>
                    <span
                      className={`shrink-0 font-semibold ${
                        p.status === "hit"
                          ? "text-accent"
                          : p.status === "over" || p.status === "miss"
                            ? "text-danger"
                            : p.status === "pending"
                              ? "text-dim"
                              : "text-ink"
                      }`}
                    >
                      {formatValue(p.value)} / {formatValue(Number(p.goal.target))}
                      {p.metric.unit ? ` ${p.metric.unit}` : ""}
                      {weekOver
                        ? ` · ${STATUS_LABEL[p.status]}${
                            p.status === "hit" ? " ✓" : p.status === "miss" ? " ✗" : ""
                          }`
                        : p.status === "hit"
                          ? " ✓"
                          : ""}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.round(p.ratio * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {editable && (
            <Button
              variant="ghost"
              className="mt-3 min-h-11 text-[13px]"
              onClick={() => setEditingTargets(true)}
            >
              Edit targets
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

/** Inline weekly-target editor: one input per active metric, carry-forward defaults. */
function TargetEditor({
  userId,
  data,
  thisWeek,
  onDone,
  onCancel,
}: {
  userId: string;
  data: WeekData;
  thisWeek: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const myMetrics = data.metrics
    .filter((m) => m.user_id === userId && !m.archived)
    .sort((a, b) => a.sort - b.sort);
  const myGoals = data.goals.filter((g) => g.user_id === userId);

  // Prefill: this week's targets, else carry the most recent week that had any.
  const currentGoals = myGoals.filter((g) => g.week_start === thisWeek);
  let source = currentGoals;
  let carried: string | null = null;
  if (currentGoals.length === 0) {
    const past = myGoals
      .filter((g) => g.week_start < thisWeek)
      .sort((a, b) => (a.week_start < b.week_start ? 1 : -1));
    if (past.length > 0) {
      carried = past[0].week_start;
      source = myGoals.filter((g) => g.week_start === carried);
    }
  }
  const prefill: Record<string, string> = {};
  for (const g of source) prefill[g.metric_id] = formatValue(Number(g.target));

  const [targets, setTargets] = useState<Record<string, string>>(prefill);
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setTarget(id: string, v: string) {
    setTargets((prev) => ({ ...prev, [id]: v }));
    setInvalidIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function save() {
    if (saving) return;
    if (weekStart(todayNY()) !== thisWeek) {
      setError("A new week started — reload and set targets fresh.");
      return;
    }
    const existing = new Map(currentGoals.map((g) => [g.metric_id, g]));
    const upserts: { user_id: string; metric_id: string; week_start: string; target: number }[] = [];
    const deletes: string[] = [];
    const invalid = new Set<string>();

    for (const m of myMetrics) {
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
      upserts.push({ user_id: userId, metric_id: m.id, week_start: thisWeek, target: num });
    }
    if (invalid.size > 0) {
      setInvalidIds(invalid);
      const names = myMetrics.filter((m) => invalid.has(m.id)).map((m) => m.name).join(", ");
      setError(`Not a number: ${names}. Fix it and save again.`);
      return;
    }

    setSaving(true);
    setError(null);
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
    setSaving(false);
    if (errMsg) {
      setError(errMsg);
      return;
    }
    onDone();
  }

  return (
    <div className="mt-3 border-t border-soft pt-3">
      <ErrorBanner message={error} />
      {carried && (
        <p className="mb-3 rounded-xl bg-soft/50 px-3.5 py-2.5 text-[13px] text-dim">
          Pre-filled from {formatWeek(carried).toLowerCase()}. Adjust and save.
        </p>
      )}
      <div className="divide-y divide-soft">
        {myMetrics.map((m) => (
          <div key={m.id} className="py-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[14px] font-semibold">{m.name}</span>
              <span className="text-[12px] text-dim">
                {m.type === "yesno" ? "days done" : goodWeekShort(m)}
              </span>
            </div>
            <div className="relative">
              <Input
                value={targets[m.id] ?? ""}
                onChange={(e) => setTarget(m.id, e.target.value)}
                inputMode="decimal"
                placeholder="No target"
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
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save targets"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
