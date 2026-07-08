"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { useVisibilityRefresh } from "@/lib/useVisibilityRefresh";
import { MAX_FEATURED } from "@/lib/habits";
import { GOOD_WEEK_OPTIONS, goodWeekKeyFor, goodWeekShort } from "@/lib/goals";
import type { Metric } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  Label,
  PageHeader,
  SectionTitle,
  Select,
  Spinner,
} from "@/components/ui";

/**
 * Habits & Numbers — what you track, in two plain buckets.
 * Habits are yes/no things that become one-tap tiles on Home.
 * Numbers are everything you measure; one human question ("what counts as
 * a good week?") replaces the old direction/roll-up config.
 */
export default function TrackingPage() {
  const { userId } = useApp();
  const refreshTick = useVisibilityRefresh();

  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [capErrorId, setCapErrorId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** "new-habit" | "new-number" | a metric id being edited | null. */
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("metrics")
        .select("*")
        .eq("user_id", userId)
        .order("sort")
        .order("created_at");
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      setMetrics((data ?? []) as Metric[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshTick]);

  const all = metrics ?? [];
  const habits = all.filter((m) => m.type === "yesno" && !m.archived);
  const numbers = all.filter((m) => m.type !== "yesno" && !m.archived);
  const archived = all.filter((m) => m.archived);
  const featuredCount = habits.filter((m) => m.featured).length;
  const nextSort = all.reduce((max, m) => Math.max(max, m.sort), 0) + 1;

  function upsertLocal(saved: Metric) {
    setMetrics((prev) => {
      const list = prev ?? [];
      const next = list.some((m) => m.id === saved.id)
        ? list.map((m) => (m.id === saved.id ? saved : m))
        : [...list, saved];
      return next.sort(
        (a, b) => a.sort - b.sort || (a.created_at < b.created_at ? -1 : 1),
      );
    });
    setEditing(null);
  }

  /** Star toggle with a fresh-count cap check at write time. */
  async function toggleFeatured(m: Metric) {
    if (busyId) return;
    setRowError(null);
    const next = !m.featured;
    if (next && featuredCount >= MAX_FEATURED) {
      setCapErrorId(m.id);
      return;
    }
    setCapErrorId(null);
    setBusyId(m.id);
    if (next) {
      const fresh = await supabase
        .from("metrics")
        .select("id")
        .eq("user_id", userId)
        .eq("featured", true)
        .eq("archived", false)
        .neq("id", m.id);
      if (!fresh.error && (fresh.data?.length ?? 0) >= MAX_FEATURED) {
        setBusyId(null);
        setCapErrorId(m.id);
        return;
      }
    }
    const { error } = await supabase
      .from("metrics")
      .update({ featured: next })
      .eq("id", m.id);
    setBusyId(null);
    if (error) {
      setRowError(error.message);
      return;
    }
    upsertLocal({ ...m, featured: next });
  }

  async function setArchivedFlag(m: Metric, flag: boolean) {
    if (busyId) return;
    setBusyId(m.id);
    setRowError(null);
    setCapErrorId(null);
    const payload =
      flag && m.featured ? { archived: true, featured: false } : { archived: flag };
    const { error } = await supabase.from("metrics").update(payload).eq("id", m.id);
    setBusyId(null);
    if (error) {
      setRowError(error.message);
      return;
    }
    upsertLocal({ ...m, ...payload });
  }

  async function hardDelete(m: Metric) {
    if (busyId) return;
    if (
      !confirm(
        `Delete "${m.name}" for good? Every value ever logged for it gets deleted too. No undo.`,
      )
    )
      return;
    setBusyId(m.id);
    setRowError(null);
    const { error } = await supabase.from("metrics").delete().eq("id", m.id);
    setBusyId(null);
    if (error) {
      setRowError(error.message);
      return;
    }
    setMetrics((prev) => (prev ?? []).filter((x) => x.id !== m.id));
  }

  if (!metrics && !loadError) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Habits & Numbers"
        subtitle="What you track. Habits become tiles on Home."
      />
      <ErrorBanner message={loadError ?? rowError} />

      <SectionTitle>Habits — yes or no, every day</SectionTitle>
      {editing === "new-habit" ? (
        <Card className="mb-3">
          <HabitForm
            userId={userId}
            metric={null}
            nextSort={nextSort}
            featuredElsewhere={featuredCount}
            onDone={upsertLocal}
            onCancel={() => setEditing(null)}
          />
        </Card>
      ) : (
        <Button
          variant="secondary"
          className="mb-3 w-full"
          onClick={() => setEditing("new-habit")}
        >
          + New habit
        </Button>
      )}
      {habits.length === 0 && editing !== "new-habit" ? (
        <EmptyState>No habits yet. They&apos;re the tiles on Home — add some.</EmptyState>
      ) : (
        habits.length > 0 && (
          <Card className="py-1">
            <div className="divide-y divide-soft">
              {habits.map((m) =>
                editing === m.id ? (
                  <div key={m.id} className="py-3">
                    <HabitForm
                      userId={userId}
                      metric={m}
                      nextSort={nextSort}
                      featuredElsewhere={featuredCount - (m.featured ? 1 : 0)}
                      onDone={upsertLocal}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : (
                  <div key={m.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 grow basis-40 text-[15px] font-semibold">
                        {m.name}
                      </span>
                      <div className="ml-auto flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleFeatured(m)}
                          aria-pressed={m.featured}
                          className={`min-h-11 rounded-xl px-3 text-[13px] font-semibold ${
                            m.featured
                              ? "bg-accent-deep/10 text-accent"
                              : "bg-soft text-dim"
                          }`}
                        >
                          {m.featured ? "★ On Home" : "☆ Put on Home"}
                        </button>
                        <Button
                          variant="ghost"
                          className="min-h-11"
                          onClick={() => {
                            setCapErrorId(null);
                            setEditing(m.id);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-h-11"
                          onClick={() => setArchivedFlag(m, true)}
                        >
                          {busyId === m.id ? "…" : "Retire"}
                        </Button>
                      </div>
                    </div>
                    {capErrorId === m.id && (
                      <p className="mt-1 text-[13px] font-semibold text-danger">
                        Max {MAX_FEATURED} habits on Home. Take one off first.
                      </p>
                    )}
                  </div>
                ),
              )}
            </div>
          </Card>
        )
      )}

      <SectionTitle>Numbers — things you measure</SectionTitle>
      {editing === "new-number" ? (
        <Card className="mb-3">
          <NumberForm
            userId={userId}
            metric={null}
            nextSort={nextSort}
            onDone={upsertLocal}
            onCancel={() => setEditing(null)}
          />
        </Card>
      ) : (
        <Button
          variant="secondary"
          className="mb-3 w-full"
          onClick={() => setEditing("new-number")}
        >
          + New number
        </Button>
      )}
      {numbers.length === 0 && editing !== "new-number" ? (
        <EmptyState>Nothing measured yet.</EmptyState>
      ) : (
        numbers.length > 0 && (
          <Card className="py-1">
            <div className="divide-y divide-soft">
              {numbers.map((m) =>
                editing === m.id ? (
                  <div key={m.id} className="py-3">
                    <NumberForm
                      userId={userId}
                      metric={m}
                      nextSort={nextSort}
                      onDone={upsertLocal}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 py-2.5"
                  >
                    <span className="min-w-0 grow basis-40">
                      <span className="block text-[15px] font-semibold">
                        {m.name}
                        {m.unit && (
                          <span className="font-normal text-dim"> ({m.unit})</span>
                        )}
                      </span>
                      <span className="block text-[12px] text-dim">
                        {goodWeekShort(m)}
                      </span>
                    </span>
                    <div className="ml-auto flex shrink-0 gap-1.5">
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => setEditing(m.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => setArchivedFlag(m, true)}
                      >
                        {busyId === m.id ? "…" : "Retire"}
                      </Button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </Card>
        )
      )}

      {archived.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            aria-expanded={showArchived}
            className="mt-6 flex min-h-11 w-full items-center justify-between text-left text-[14px] font-semibold text-dim"
          >
            <span>Retired ({archived.length})</span>
            <span className={`transition-transform ${showArchived ? "rotate-90" : ""}`}>
              ›
            </span>
          </button>
          {showArchived && (
            <Card className="py-1">
              <div className="divide-y divide-soft">
                {archived.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 py-2.5 text-dim"
                  >
                    <span className="min-w-0 grow basis-40 text-[14px]">
                      {m.name}
                    </span>
                    <div className="ml-auto flex shrink-0 gap-1.5">
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => setArchivedFlag(m, false)}
                      >
                        Bring back
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-11 text-danger"
                        onClick={() => hardDelete(m)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

/** Two questions: what's it called, does it go on Home. */
function HabitForm({
  userId,
  metric,
  nextSort,
  featuredElsewhere,
  onDone,
  onCancel,
}: {
  userId: string;
  metric: Metric | null;
  nextSort: number;
  featuredElsewhere: number;
  onDone: (m: Metric) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(metric?.name ?? "");
  const [featured, setFeatured] = useState(
    metric?.featured ?? featuredElsewhere < MAX_FEATURED,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFeature() {
    if (!featured && featuredElsewhere >= MAX_FEATURED) {
      setError(`Max ${MAX_FEATURED} habits on Home. Take one off first.`);
      return;
    }
    setError(null);
    setFeatured((f) => !f);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    if (featured) {
      // Cap must hold against the database at write time.
      const fresh = await supabase
        .from("metrics")
        .select("id")
        .eq("user_id", userId)
        .eq("featured", true)
        .eq("archived", false);
      const others = (fresh.data ?? []).filter((r) => r.id !== metric?.id);
      if (!fresh.error && others.length >= MAX_FEATURED) {
        setSaving(false);
        setError(`Max ${MAX_FEATURED} habits on Home — saving without the tile.`);
        setFeatured(false);
        return;
      }
    }
    const payload = {
      name: trimmed,
      type: "yesno" as const,
      unit: null,
      cadence: "daily" as const,
      direction: "higher" as const,
      agg: "sum" as const,
      featured,
    };
    const query = metric
      ? supabase.from("metrics").update({ name: trimmed, featured }).eq("id", metric.id).select().single()
      : supabase
          .from("metrics")
          .insert({ ...payload, user_id: userId, sort: nextSort })
          .select()
          .single();
    const { data, error: saveError } = await query;
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    onDone(data as Metric);
  }

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />
      <div>
        <Label>Habit</Label>
        <Input
          placeholder="e.g. No ordering in"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <button
        type="button"
        role="checkbox"
        aria-checked={featured}
        onClick={toggleFeature}
        className="flex min-h-11 w-full items-center gap-2.5 text-left"
      >
        <span
          aria-hidden
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${
            featured
              ? "border-accent-deep bg-accent-deep text-white"
              : "border-soft bg-bg text-transparent"
          }`}
        >
          ✓
        </span>
        <span className="text-[14px] font-semibold">Show as tile on Home</span>
      </button>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={save} disabled={!name.trim() || saving}>
          {saving ? "Saving…" : metric ? "Save" : "Add habit"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Three questions: name, unit, what counts as a good week. */
function NumberForm({
  userId,
  metric,
  nextSort,
  onDone,
  onCancel,
}: {
  userId: string;
  metric: Metric | null;
  nextSort: number;
  onDone: (m: Metric) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(metric?.name ?? "");
  const [unit, setUnit] = useState(metric?.unit ?? "");
  const existingKey = metric ? goodWeekKeyFor(metric) : null;
  const [goodWeek, setGoodWeek] = useState(
    existingKey ?? (metric ? "custom" : "total_up"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    const opt = GOOD_WEEK_OPTIONS.find((o) => o.key === goodWeek);
    const judged = opt
      ? { direction: opt.direction, agg: opt.agg }
      : {}; // "custom": keep the metric's existing legacy config
    const query = metric
      ? supabase
          .from("metrics")
          .update({ name: trimmed, unit: unit.trim() || null, ...judged })
          .eq("id", metric.id)
          .select()
          .single()
      : supabase
          .from("metrics")
          .insert({
            name: trimmed,
            unit: unit.trim() || null,
            type: "number",
            cadence: "daily",
            featured: false,
            user_id: userId,
            sort: nextSort,
            ...(opt ? judged : { direction: "higher", agg: "sum" }),
          })
          .select()
          .single();
    const { data, error: saveError } = await query;
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    onDone(data as Metric);
  }

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />
      <div>
        <Label>Name</Label>
        <Input
          placeholder="e.g. Calories"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <Label>Unit — optional</Label>
        <Input
          placeholder="e.g. lbs, kcal, hours"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
      </div>
      <div>
        <Label>What counts as a good week?</Label>
        <Select value={goodWeek} onChange={(e) => setGoodWeek(e.target.value)}>
          {existingKey === null && metric && (
            <option value="custom">Keep current setup</option>
          )}
          {GOOD_WEEK_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </Select>
        <p className="mt-1.5 text-xs text-dim">
          Used when you set a weekly target for this on the Week tab.
        </p>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={save} disabled={!name.trim() || saving}>
          {saving ? "Saving…" : metric ? "Save" : "Add number"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
