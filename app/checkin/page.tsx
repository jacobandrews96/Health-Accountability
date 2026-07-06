"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { formatDay, todayNY } from "@/lib/dates";
import { useTodayNY } from "@/lib/useTodayNY";
import type {
  Checkin,
  DailyLog,
  Metric,
  Workout,
  WorkoutExercise,
} from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  Label,
  PageHeader,
  SectionTitle,
  Spinner,
  Textarea,
} from "@/components/ui";

const WORKOUT_KINDS = ["Lifting", "Cardio", "Sports", "Walk", "Yoga"];

export default function CheckinPage() {
  const { userId } = useApp();
  // Reactive: rolls over at midnight NY, which refetches the whole form for
  // the new day (the effect below depends on `day`).
  const day = useTodayNY();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<Metric[]>([]);
  /**
   * Text state per metric id. "" = no value (skipped; deletes an existing log
   * on save). Yes/no metrics use "1" / "0" ("" until first touched).
   */
  const [values, setValues] = useState<Record<string, string>>({});
  /** Metric ids that currently have a daily_logs row for today. */
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set());
  /** Metric ids whose current input isn't a number (blocks save). */
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());

  const [mood, setMood] = useState<number | null>(null);
  const [moodNote, setMoodNote] = useState("");
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [wKind, setWKind] = useState("");
  const [wDuration, setWDuration] = useState("");
  const [wNote, setWNote] = useState("");
  /** Optional detailed mode: exercises with sets/reps/weight (strings while editing). */
  const [wDetails, setWDetails] = useState<
    { name: string; sets: { reps: string; weight: string }[] }[]
  >([]);
  const [showDetails, setShowDetails] = useState(false);
  const [addingWorkout, setAddingWorkout] = useState(false);
  const [workoutError, setWorkoutError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  /** Bump to refetch. Callers set loading=true first (it starts true for mount). */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [metricsRes, logsRes, checkinRes, workoutsRes] = await Promise.all([
        supabase
          .from("metrics")
          .select("*")
          .eq("user_id", userId)
          .eq("cadence", "daily")
          .eq("archived", false)
          .order("sort"),
        supabase
          .from("daily_logs")
          .select("*")
          .eq("user_id", userId)
          .eq("day", day),
        supabase
          .from("checkins")
          .select("*")
          .eq("user_id", userId)
          .eq("day", day)
          .maybeSingle(),
        supabase
          .from("workouts")
          .select("*")
          .eq("user_id", userId)
          .eq("day", day)
          .order("created_at"),
      ]);

      if (cancelled) return;

      const firstError =
        metricsRes.error ??
        logsRes.error ??
        checkinRes.error ??
        workoutsRes.error;
      if (firstError) {
        setLoadError(firstError.message);
        setLoading(false);
        return;
      }

      const loadedMetrics = (metricsRes.data ?? []) as Metric[];
      const logs = (logsRes.data ?? []) as DailyLog[];
      const checkin = (checkinRes.data ?? null) as Checkin | null;

      const prefill: Record<string, string> = {};
      const logged = new Set<string>();
      for (const log of logs) {
        logged.add(log.metric_id);
        const metric = loadedMetrics.find((m) => m.id === log.metric_id);
        if (!metric) continue;
        prefill[log.metric_id] =
          metric.type === "yesno"
            ? Number(log.value) !== 0
              ? "1"
              : "0"
            : String(log.value);
      }

      setMetrics(loadedMetrics);
      setValues(prefill);
      setLoggedIds(logged);
      setMood(checkin?.mood ?? null);
      setMoodNote(checkin?.mood_note ?? "");
      setSleepQuality(checkin?.sleep_quality ?? null);
      setWorkouts((workoutsRes.data ?? []) as Workout[]);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, day, reloadKey]);

  function setMetricValue(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }));
    setInvalidIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function save() {
    if (saving) return;

    // Never write onto a stale day (tab restored after midnight before the
    // rollover hook fires). The form refetches for the new day on its own.
    if (todayNY() !== day) {
      setSaveError(
        "It's a new day. The form is reloading for today — check your numbers and save again.",
      );
      return;
    }

    // Validate everything before writing anything.
    const upserts: {
      user_id: string;
      metric_id: string;
      day: string;
      value: number;
    }[] = [];
    const clears: string[] = [];
    const invalid = new Set<string>();
    for (const m of metrics) {
      const raw = (values[m.id] ?? "").trim();
      if (raw === "") {
        if (loggedIds.has(m.id)) clears.push(m.id);
        continue;
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        invalid.add(m.id);
        continue;
      }
      upserts.push({ user_id: userId, metric_id: m.id, day, value: num });
    }
    if (invalid.size > 0) {
      setInvalidIds(invalid);
      const names = metrics
        .filter((m) => invalid.has(m.id))
        .map((m) => m.name)
        .join(", ");
      setSaveError(`Not a number: ${names}. Plain digits only — fix it and save again.`);
      return;
    }

    setSaving(true);
    setSaveError(null);

    let errMsg: string | null = null;

    // Metric values first; the checkins row last, since that's what flips
    // "Logged today ✓" for your partner — don't flip it on a partial write.
    if (upserts.length > 0) {
      const res = await supabase
        .from("daily_logs")
        .upsert(upserts, { onConflict: "user_id,metric_id,day" });
      if (res.error) errMsg = res.error.message;
    }

    if (!errMsg && clears.length > 0) {
      const res = await supabase
        .from("daily_logs")
        .delete()
        .eq("user_id", userId)
        .eq("day", day)
        .in("metric_id", clears);
      if (res.error) errMsg = res.error.message;
    }

    if (!errMsg) {
      const checkinRes = await supabase.from("checkins").upsert(
        {
          user_id: userId,
          day,
          mood,
          mood_note: moodNote.trim() === "" ? null : moodNote.trim(),
          sleep_quality: sleepQuality,
        },
        { onConflict: "user_id,day" },
      );
      if (checkinRes.error) errMsg = checkinRes.error.message;
    }

    if (errMsg) {
      // Part of the save may have landed. Resync which metrics actually have
      // rows so a retry (or a later clear) works against reality — without
      // touching what the user typed.
      const resync = await supabase
        .from("daily_logs")
        .select("metric_id")
        .eq("user_id", userId)
        .eq("day", day);
      if (!resync.error && resync.data) {
        setLoggedIds(new Set(resync.data.map((r) => r.metric_id as string)));
      }
      setSaving(false);
      setSaveError(errMsg);
      return;
    }

    setSaving(false);
    setLoggedIds((prev) => {
      const next = new Set(prev);
      for (const id of clears) next.delete(id);
      for (const u of upserts) next.add(u.metric_id);
      return next;
    });
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2500);
  }

  async function addWorkout() {
    const kind = wKind.trim();
    if (!kind || addingWorkout) return;
    const rawDuration = wDuration.trim();
    const durationNum = rawDuration === "" ? null : Number(rawDuration);
    if (durationNum !== null && (!Number.isFinite(durationNum) || durationNum < 0)) {
      setWorkoutError("Minutes has to be a number.");
      return;
    }

    // Detailed mode: keep exercises with a name; keep sets with any value.
    const exercises: WorkoutExercise[] = wDetails
      .filter((ex) => ex.name.trim() !== "")
      .map((ex) => ({
        name: ex.name.trim(),
        sets: ex.sets
          .filter((s) => s.reps.trim() !== "" || s.weight.trim() !== "")
          .map((s) => ({
            reps: s.reps.trim() === "" ? null : Number(s.reps),
            weight: s.weight.trim() === "" ? null : Number(s.weight),
          }))
          .filter(
            (s) =>
              (s.reps === null || Number.isFinite(s.reps)) &&
              (s.weight === null || Number.isFinite(s.weight)),
          ),
      }));

    setAddingWorkout(true);
    setWorkoutError(null);
    const { data, error } = await supabase
      .from("workouts")
      .insert({
        user_id: userId,
        day,
        kind,
        duration_min: durationNum === null ? null : Math.round(durationNum),
        note: wNote.trim() === "" ? null : wNote.trim(),
        details: exercises.length > 0 ? { exercises } : null,
      })
      .select()
      .single();
    setAddingWorkout(false);

    if (error) {
      setWorkoutError(error.message);
      return;
    }
    setWorkouts((prev) => [...prev, data as Workout]);
    setWKind("");
    setWDuration("");
    setWNote("");
    setWDetails([]);
    setShowDetails(false);
    setShowWorkoutForm(false);
  }

  async function deleteWorkout(id: string) {
    const target = workouts.find((w) => w.id === id);
    if (!confirm(`Delete ${target?.kind ?? "this workout"}? No undo.`)) return;
    const prev = workouts;
    setWorkouts((list) => list.filter((w) => w.id !== id));
    const { error } = await supabase.from("workouts").delete().eq("id", id);
    if (error) {
      setWorkoutError(error.message);
      setWorkouts(prev);
    }
  }

  return (
    <>
      <PageHeader
        title="Daily check-in"
        subtitle={`${formatDay(day)} — under a minute. Go.`}
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : loadError ? (
        <>
          <ErrorBanner message={loadError} />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setLoadError(null);
              setLoading(true);
              setReloadKey((k) => k + 1);
            }}
          >
            Retry
          </Button>
        </>
      ) : (
        <>
          <SectionTitle>Numbers</SectionTitle>
          {metrics.length === 0 ? (
            <EmptyState>
              No daily metrics. Set them up in the Metrics tab.
            </EmptyState>
          ) : (
            <Card className="py-1">
              <div className="divide-y divide-soft">
                {metrics.map((m) => (
                  <MetricRow
                    key={m.id}
                    metric={m}
                    value={values[m.id] ?? ""}
                    invalid={invalidIds.has(m.id)}
                    onChange={(v) => setMetricValue(m.id, v)}
                  />
                ))}
              </div>
            </Card>
          )}

          <SectionTitle>Sleep quality</SectionTitle>
          <Card>
            <SliderRow
              value={sleepQuality}
              onChange={setSleepQuality}
              onClear={() => setSleepQuality(null)}
              ariaLabel="Sleep quality"
            />
            {sleepQuality === null && (
              <p className="mt-1 text-[12px] text-dim">
                Optional. Untouched = skipped.
              </p>
            )}
          </Card>

          <SectionTitle>Mood</SectionTitle>
          <Card>
            <Label>How do you feel about today?</Label>
            <SliderRow
              value={mood}
              onChange={setMood}
              onClear={() => setMood(null)}
              ariaLabel="Mood"
            />
            <Textarea
              className="mt-3"
              value={moodNote}
              onChange={(e) => setMoodNote(e.target.value)}
              placeholder="Optional note. Be honest."
              aria-label="Mood note"
            />
          </Card>

          <SectionTitle>Workouts</SectionTitle>
          {workoutError && <ErrorBanner message={workoutError} />}
          {workouts.length === 0 && !showWorkoutForm && (
            <EmptyState>No workouts logged today.</EmptyState>
          )}
          {workouts.length > 0 && (
            <Card className="py-1">
              <div className="divide-y divide-soft">
                {workouts.map((w) => (
                  <div key={w.id} className="flex items-center gap-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">
                        {w.kind}
                        {w.duration_min != null && (
                          <span className="font-normal text-dim">
                            {" "}
                            · {w.duration_min} min
                          </span>
                        )}
                      </p>
                      {w.note && (
                        <p className="truncate text-[13px] text-dim">{w.note}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteWorkout(w.id)}
                      aria-label={`Delete ${w.kind}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl leading-none text-dim active:text-danger"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {showWorkoutForm ? (
            <Card className="mt-3">
              <Label>Kind</Label>
              <div className="mb-2 flex flex-wrap gap-2">
                {WORKOUT_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setWKind(k)}
                    className={`min-h-11 rounded-full px-4 text-[13px] font-semibold transition-colors ${
                      wKind === k
                        ? "bg-accent-deep/25 text-accent"
                        : "bg-soft text-ink active:bg-soft/70"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <Input
                value={wKind}
                onChange={(e) => setWKind(e.target.value)}
                placeholder="Or type your own"
                aria-label="Workout kind"
              />
              <div className="mt-3">
                <Label>Minutes</Label>
                <div className="relative">
                  <Input
                    value={wDuration}
                    onChange={(e) => setWDuration(e.target.value)}
                    inputMode="numeric"
                    placeholder="—"
                    className="pr-16"
                    aria-label="Workout minutes"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] font-semibold text-dim">
                    min
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <Label>Note — optional</Label>
                <Input
                  value={wNote}
                  onChange={(e) => setWNote(e.target.value)}
                  placeholder="PRs, excuses, whatever"
                  aria-label="Workout note"
                />
              </div>

              {!showDetails ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowDetails(true);
                    if (wDetails.length === 0) {
                      setWDetails([
                        { name: "", sets: [{ reps: "", weight: "" }] },
                      ]);
                    }
                  }}
                  className="mt-3 min-h-11 text-[13px] font-semibold text-dim underline underline-offset-2"
                >
                  + Add details (exercises, sets, weight) — optional
                </button>
              ) : (
                <div className="mt-4 border-t border-soft pt-3">
                  <Label>Details</Label>
                  {wDetails.map((ex, i) => (
                    <div key={i} className="mb-3 rounded-xl bg-bg p-3">
                      <Input
                        value={ex.name}
                        onChange={(e) =>
                          setWDetails((prev) =>
                            prev.map((x, xi) =>
                              xi === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="Exercise, e.g. Bench press"
                        aria-label={`Exercise ${i + 1} name`}
                      />
                      {ex.sets.map((s, j) => (
                        <div key={j} className="mt-2 flex items-center gap-2">
                          <span className="w-10 shrink-0 text-[12px] text-dim">
                            Set {j + 1}
                          </span>
                          <Input
                            value={s.reps}
                            onChange={(e) =>
                              setWDetails((prev) =>
                                prev.map((x, xi) =>
                                  xi === i
                                    ? {
                                        ...x,
                                        sets: x.sets.map((y, yj) =>
                                          yj === j
                                            ? { ...y, reps: e.target.value }
                                            : y,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                            inputMode="numeric"
                            placeholder="reps"
                            aria-label={`Exercise ${i + 1} set ${j + 1} reps`}
                          />
                          <Input
                            value={s.weight}
                            onChange={(e) =>
                              setWDetails((prev) =>
                                prev.map((x, xi) =>
                                  xi === i
                                    ? {
                                        ...x,
                                        sets: x.sets.map((y, yj) =>
                                          yj === j
                                            ? { ...y, weight: e.target.value }
                                            : y,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                            inputMode="decimal"
                            placeholder="lbs"
                            aria-label={`Exercise ${i + 1} set ${j + 1} weight`}
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setWDetails((prev) =>
                            prev.map((x, xi) =>
                              xi === i
                                ? {
                                    ...x,
                                    sets: [...x.sets, { reps: "", weight: "" }],
                                  }
                                : x,
                            ),
                          )
                        }
                        className="mt-2 min-h-10 text-[13px] font-semibold text-dim underline underline-offset-2"
                      >
                        + set
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setWDetails((prev) => [
                        ...prev,
                        { name: "", sets: [{ reps: "", weight: "" }] },
                      ])
                    }
                    className="min-h-10 text-[13px] font-semibold text-dim underline underline-offset-2"
                  >
                    + exercise
                  </button>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Button
                  onClick={addWorkout}
                  disabled={addingWorkout || wKind.trim() === ""}
                  className="flex-1"
                >
                  {addingWorkout ? "Adding…" : "Add workout"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowWorkoutForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          ) : (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => {
                setWorkoutError(null);
                setShowWorkoutForm(true);
              }}
            >
              + Log a workout
            </Button>
          )}

          <div className="mt-8">
            {saveError && <ErrorBanner message={saveError} />}
            {saved && (
              <p className="mb-2 text-center text-sm font-bold text-accent">
                Logged. Day done.
              </p>
            )}
            <Button
              onClick={save}
              disabled={saving}
              className="w-full py-4 text-base"
            >
              {saving ? "Saving…" : saved ? "Logged ✓" : "Save check-in"}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/** One input row inside the metrics card, shaped by the metric's type. */
function MetricRow({
  metric,
  value,
  invalid = false,
  onChange,
}: {
  metric: Metric;
  value: string;
  invalid?: boolean;
  onChange: (v: string) => void;
}) {
  if (metric.type === "yesno") {
    const on = value === "1";
    return (
      <div className="flex min-h-14 w-full items-center gap-1 py-2">
        <button
          type="button"
          onClick={() => onChange(on ? "0" : "1")}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="text-[15px] font-semibold text-ink">
            {metric.name}
            {value === "0" && (
              <span className="ml-2 text-[12px] font-semibold text-dim">
                (no)
              </span>
            )}
          </span>
          <span
            aria-hidden
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
              on
                ? "border-accent-deep bg-accent-deep text-bg"
                : "border-soft bg-bg text-transparent"
            }`}
          >
            ✓
          </span>
        </button>
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={`Clear ${metric.name}`}
            className="min-h-11 shrink-0 px-2 text-[13px] font-semibold text-dim underline underline-offset-2"
          >
            clear
          </button>
        )}
      </div>
    );
  }

  if (metric.type === "scale") {
    const parsed = value === "" ? NaN : Number(value);
    return (
      <div className="py-3.5">
        <Label>{metric.name}</Label>
        <SliderRow
          value={Number.isFinite(parsed) ? parsed : null}
          onChange={(v) => onChange(String(v))}
          onClear={() => onChange("")}
          ariaLabel={metric.name}
        />
      </div>
    );
  }

  if (metric.type === "count") {
    return (
      <div className="py-3.5">
        <Label>
          {metric.name}
          {metric.unit ? ` (${metric.unit})` : ""}
        </Label>
        <CountStepper
          name={metric.name}
          value={value}
          invalid={invalid}
          onChange={onChange}
        />
      </div>
    );
  }

  // number | duration
  return (
    <div className="py-3.5">
      <Label>{metric.name}</Label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder="—"
          aria-label={metric.name}
          className={`${metric.unit ? "pr-16" : ""} ${invalid ? "border-danger" : ""}`}
        />
        {metric.unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] font-semibold text-dim">
            {metric.unit}
          </span>
        )}
      </div>
      {invalid && (
        <p className="mt-1 text-[12px] font-semibold text-danger">
          Not a number. Plain digits only, e.g. 1200 or 7.5.
        </p>
      )}
    </div>
  );
}

/** 1–10 slider with a large readout and an unset ("—") state. */
function SliderRow({
  value,
  onChange,
  onClear,
  ariaLabel,
}: {
  value: number | null;
  onChange: (n: number) => void;
  onClear: () => void;
  ariaLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span
          className={`text-3xl font-bold tabular-nums ${
            value === null ? "text-dim/50" : "text-accent"
          }`}
        >
          {value ?? "—"}
        </span>
        {value !== null && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 px-3 text-[13px] font-semibold text-dim underline underline-offset-2"
          >
            clear
          </button>
        )}
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value ?? 5}
        onChange={(e) => onChange(Number(e.target.value))}
        // Seed on click, not pointerdown: a touch-scroll that starts on the
        // slider fires pointerdown (then pointercancel) and must NOT record
        // a value. A deliberate tap always ends in a click.
        onClick={(e) => {
          if (value === null) onChange(Number(e.currentTarget.value));
        }}
        aria-label={ariaLabel}
        className={`h-11 w-full ${value === null ? "opacity-40" : ""}`}
      />
      <div className="flex justify-between text-[11px] text-dim">
        <span>1</span>
        <span>10</span>
      </div>
    </div>
  );
}

/** Count input: big − / + buttons around a directly editable value. */
function CountStepper({
  name,
  value,
  invalid = false,
  onChange,
}: {
  name: string;
  value: string;
  invalid?: boolean;
  onChange: (v: string) => void;
}) {
  function step(delta: number) {
    const parsed = value.trim() === "" ? NaN : Number(value);
    // "−" on an unset value stays unset — it must not log an explicit 0.
    if (!Number.isFinite(parsed) && delta < 0) return;
    const base = Number.isFinite(parsed) ? parsed : 0;
    onChange(String(Math.max(0, base + delta)));
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label={`Decrease ${name}`}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-soft text-2xl font-bold text-ink active:bg-soft/70"
      >
        −
      </button>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="—"
        aria-label={name}
        className={`text-center ${invalid ? "border-danger" : ""}`}
      />
      <button
        type="button"
        onClick={() => step(1)}
        aria-label={`Increase ${name}`}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-soft text-2xl font-bold text-ink active:bg-soft/70"
      >
        +
      </button>
    </div>
  );
}
