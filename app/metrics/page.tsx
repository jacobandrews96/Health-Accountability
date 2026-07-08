"use client";

import { useEffect, useState } from "react";
import { useVisibilityRefresh } from "@/lib/useVisibilityRefresh";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { MAX_FEATURED } from "@/lib/habits";
import type {
  Metric,
  MetricAgg,
  MetricCadence,
  MetricDirection,
  MetricType,
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
  Select,
  Spinner,
} from "@/components/ui";

const TYPE_OPTIONS: { value: MetricType; label: string }[] = [
  { value: "number", label: "Number" },
  { value: "yesno", label: "Yes / no" },
  { value: "duration", label: "Duration" },
  { value: "count", label: "Count" },
  { value: "scale", label: "Scale 1–10" },
];

// "Weekly" is deliberately not offered yet: nothing can log a weekly-cadence
// metric until the weekly-goals dashboard ships, so offering it here would
// create metrics whose data silently goes nowhere. Re-add with Phase 2.
const CADENCE_OPTIONS: { value: MetricCadence; label: string }[] = [
  { value: "daily", label: "Daily" },
];

const DIRECTION_OPTIONS: { value: MetricDirection; label: string }[] = [
  { value: "higher", label: "Higher is better" },
  { value: "lower", label: "Lower is better" },
  { value: "cap", label: "Target is a cap" },
];

const AGG_OPTIONS: { value: MetricAgg; label: string }[] = [
  { value: "sum", label: "Total for the week" },
  { value: "avg", label: "Daily average" },
  { value: "count_days", label: "Days logged" },
  { value: "last", label: "Latest value" },
];

const TYPE_SUMMARY: Record<MetricType, string> = {
  number: "number",
  yesno: "yes/no",
  duration: "duration",
  count: "count",
  scale: "scale 1–10",
};

function label<T extends string>(
  options: { value: T; label: string }[],
  value: T,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** "number · kcal · daily · target is a cap · daily average" */
function summarize(m: Metric): string {
  const parts = [
    TYPE_SUMMARY[m.type],
    ...(m.unit ? [m.unit] : []),
    m.cadence,
    label(DIRECTION_OPTIONS, m.direction).toLowerCase(),
    label(AGG_OPTIONS, m.agg).toLowerCase(),
  ];
  return parts.join(" · ");
}

/** Kept in sort order (then created_at) to match the initial query. */
function upsertSorted(rows: Metric[], saved: Metric): Metric[] {
  return [...rows.filter((m) => m.id !== saved.id), saved].sort(
    (a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at),
  );
}

export default function MetricsPage() {
  const { userId } = useApp();

  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // "new" = create form open; a metric id = that row is being edited.
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Archive / unarchive / delete state.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // Star toggle state: one write in flight at a time, and the row (if any)
  // currently showing the featured-cap error.
  const [starBusyId, setStarBusyId] = useState<string | null>(null);
  const [capErrorId, setCapErrorId] = useState<string | null>(null);
  // Refetch on focus so this tab's featured counts track the other phone.
  const refreshTick = useVisibilityRefresh();

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

  const active = (metrics ?? []).filter((m) => !m.archived);
  const archived = (metrics ?? []).filter((m) => m.archived);
  const featuredCount = active.filter(
    (m) => m.type === "yesno" && m.featured,
  ).length;
  const nextSort =
    (metrics ?? []).reduce((mx, m) => Math.max(mx, m.sort), 0) + 1;

  function onSaved(saved: Metric) {
    setMetrics((prev) => upsertSorted(prev ?? [], saved));
    setEditing(null);
    setCapErrorId(null);
  }

  async function toggleFeatured(m: Metric) {
    if (starBusyId) return;
    setRowError(null);
    const next = !m.featured;
    if (next && featuredCount >= MAX_FEATURED) {
      setCapErrorId(m.id);
      return;
    }
    setCapErrorId(null);
    setStarBusyId(m.id);
    // The cap must hold against the DATABASE, not this tab's snapshot —
    // the other phone (or an open form) may have featured one meanwhile.
    if (next) {
      const fresh = await supabase
        .from("metrics")
        .select("id")
        .eq("user_id", userId)
        .eq("featured", true)
        .eq("archived", false)
        .neq("id", m.id);
      if (!fresh.error && (fresh.data?.length ?? 0) >= MAX_FEATURED) {
        setStarBusyId(null);
        setCapErrorId(m.id);
        return;
      }
    }
    // Optimistic: flip immediately, revert if the write fails.
    setMetrics((prev) =>
      (prev ?? []).map((x) => (x.id === m.id ? { ...x, featured: next } : x)),
    );
    const { error } = await supabase
      .from("metrics")
      .update({ featured: next })
      .eq("id", m.id);
    setStarBusyId(null);
    if (error) {
      setMetrics((prev) =>
        (prev ?? []).map((x) =>
          x.id === m.id ? { ...x, featured: m.featured } : x,
        ),
      );
      setRowError(error.message);
    }
  }

  async function setArchivedFlag(m: Metric, flag: boolean) {
    if (busyId) return;
    setBusyId(m.id);
    setRowError(null);
    setCapErrorId(null);
    // Archiving a featured habit pulls it off Home too — one write.
    const payload =
      flag && m.featured
        ? { archived: true, featured: false }
        : { archived: flag };
    const { data, error } = await supabase
      .from("metrics")
      .update(payload)
      .eq("id", m.id)
      .select()
      .single();
    setBusyId(null);
    if (error) {
      setRowError(error.message);
      return;
    }
    setMetrics((prev) => upsertSorted(prev ?? [], data as Metric));
  }

  async function destroy(m: Metric) {
    if (busyId) return;
    if (
      !confirm(
        `Delete "${m.name}" for good? Every value ever logged for it gets deleted too. No undo.`,
      )
    )
      return;
    setBusyId(m.id);
    setRowError(null);
    setCapErrorId(null);
    const { error } = await supabase.from("metrics").delete().eq("id", m.id);
    setBusyId(null);
    if (error) {
      setRowError(error.message);
      return;
    }
    setMetrics((prev) => (prev ?? []).filter((x) => x.id !== m.id));
  }

  if (loadError) {
    return (
      <>
        <PageHeader title="Metrics" subtitle="What you track." />
        <ErrorBanner message={loadError} />
      </>
    );
  }

  if (!metrics) {
    return (
      <>
        <PageHeader title="Metrics" subtitle="What you track." />
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Metrics"
        subtitle="What you track. Define it here, log it every day."
      />

      <ErrorBanner message={rowError} />

      {editing === "new" ? (
        <Card className="mb-4">
          <MetricForm
            metric={null}
            userId={userId}
            nextSort={nextSort}
            featuredElsewhere={featuredCount}
            onDone={onSaved}
            onCancel={() => setEditing(null)}
          />
        </Card>
      ) : (
        <Button className="mb-4 w-full" onClick={() => setEditing("new")}>
          New metric
        </Button>
      )}

      <SectionTitle>Active</SectionTitle>
      {active.length === 0 ? (
        <EmptyState>Nothing tracked. That says plenty. Add a metric.</EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-soft">
            {active.map((m) => (
              <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                {editing === m.id ? (
                  <MetricForm
                    key={m.id}
                    metric={m}
                    userId={userId}
                    nextSort={nextSort}
                    featuredElsewhere={featuredCount - (m.featured ? 1 : 0)}
                    onDone={onSaved}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <MetricRow metric={m}>
                      {m.type === "yesno" && (
                        <button
                          type="button"
                          aria-pressed={m.featured}
                          disabled={busyId !== null}
                          onClick={() => toggleFeatured(m)}
                          className={`min-h-11 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                            m.featured
                              ? "bg-accent-deep/10 text-accent"
                              : "bg-soft text-dim"
                          }`}
                        >
                          {m.featured ? "★ Featured" : "☆ Feature"}
                        </button>
                      )}
                      <Button
                        variant="secondary"
                        className="min-h-11 px-3 py-2 text-[13px]"
                        disabled={busyId !== null}
                        onClick={() => setEditing(m.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        className="min-h-11 px-3 py-2 text-[13px]"
                        disabled={busyId !== null}
                        onClick={() => setArchivedFlag(m, true)}
                      >
                        {busyId === m.id ? "…" : "Archive"}
                      </Button>
                    </MetricRow>
                    {capErrorId === m.id && (
                      <p className="mt-1.5 text-xs font-semibold text-danger">
                        Max {MAX_FEATURED} headline habits. Unfeature one
                        first.
                      </p>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((o) => !o)}
            className="flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-sm font-semibold text-dim"
          >
            <span>Archived ({archived.length})</span>
            <span
              aria-hidden
              className={`text-base transition-transform ${
                showArchived ? "rotate-90" : ""
              }`}
            >
              ›
            </span>
          </button>
          {showArchived && (
            <Card>
              <ul className="divide-y divide-soft">
                {archived.map((m) => (
                  <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                    <MetricRow metric={m}>
                      <Button
                        variant="secondary"
                        className="min-h-11 px-3 py-2 text-[13px]"
                        disabled={busyId !== null}
                        onClick={() => setArchivedFlag(m, false)}
                      >
                        {busyId === m.id ? "…" : "Unarchive"}
                      </Button>
                      <Button
                        variant="danger"
                        className="min-h-11 px-3 py-2 text-[13px]"
                        disabled={busyId !== null}
                        onClick={() => destroy(m)}
                      >
                        Delete
                      </Button>
                    </MetricRow>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function MetricRow({
  metric,
  children,
}: {
  metric: Metric;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0 grow basis-40">
        <p className="font-semibold">{metric.name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-dim">
          {metric.featured && (
            <span aria-hidden className="text-accent">
              ★{" "}
            </span>
          )}
          {summarize(metric)}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 gap-2">{children}</div>
    </div>
  );
}

/** One form for create (metric = null) and edit. Inline, never a modal. */
function MetricForm({
  metric,
  userId,
  nextSort,
  featuredElsewhere,
  onDone,
  onCancel,
}: {
  metric: Metric | null;
  userId: string;
  nextSort: number;
  /** How many OTHER active yes/no habits are already featured. */
  featuredElsewhere: number;
  onDone: (saved: Metric) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(metric?.name ?? "");
  const [type, setType] = useState<MetricType>(metric?.type ?? "number");
  const [featured, setFeatured] = useState(metric?.featured ?? false);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const [unit, setUnit] = useState(metric?.unit ?? "");
  const [cadence, setCadence] = useState<MetricCadence>(
    metric?.cadence ?? "daily",
  );
  const [direction, setDirection] = useState<MetricDirection>(
    metric?.direction ?? "higher",
  );
  const [agg, setAgg] = useState<MetricAgg>(metric?.agg ?? "sum");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Yes/no and scale have no meaningful unit.
  const unitless = type === "yesno" || type === "scale";

  function toggleFeature() {
    if (featured) {
      setFeatured(false);
      setFeatureError(null);
      return;
    }
    if (featuredElsewhere >= MAX_FEATURED) {
      setFeatureError(
        `Max ${MAX_FEATURED} headline habits. Unfeature one first.`,
      );
      return;
    }
    setFeatured(true);
    setFeatureError(null);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    const wantsFeatured = type === "yesno" && featured;
    if (wantsFeatured) {
      // Re-check the cap against the database at write time — the star
      // buttons (or the other phone) may have changed the count since
      // this form was opened.
      const fresh = await supabase
        .from("metrics")
        .select("id")
        .eq("user_id", userId)
        .eq("featured", true)
        .eq("archived", false);
      const others = (fresh.data ?? []).filter((r) => r.id !== metric?.id);
      if (!fresh.error && others.length >= MAX_FEATURED) {
        setSaving(false);
        setError(
          `Max ${MAX_FEATURED} headline habits. Unfeature one first — this saves without featuring.`,
        );
        return;
      }
    }
    const payload = {
      name: trimmed,
      type,
      unit: unitless ? null : unit.trim() || null,
      cadence,
      direction,
      agg,
      // Only yes/no habits can headline Home.
      featured: type === "yesno" ? featured : false,
    };
    const query = metric
      ? supabase
          .from("metrics")
          .update(payload)
          .eq("id", metric.id)
          .select()
          .single()
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
        <Label>Name</Label>
        <Input
          placeholder="e.g. Calories"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <Label>Type</Label>
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as MetricType)}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      {type === "yesno" && (
        <div>
          <button
            type="button"
            role="checkbox"
            aria-checked={featured}
            onClick={toggleFeature}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-soft bg-bg px-3.5 py-3 text-left"
          >
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
                featured
                  ? "bg-accent-deep text-white"
                  : "border border-dim/40 bg-card text-transparent"
              }`}
            >
              ✓
            </span>
            <span className="text-[15px] font-semibold text-ink">
              Feature on Home
            </span>
            <span
              aria-hidden
              className={`ml-auto text-base ${
                featured ? "text-accent" : "text-dim"
              }`}
            >
              {featured ? "★" : "☆"}
            </span>
          </button>
          {featureError && (
            <p className="mt-1.5 text-xs font-semibold text-danger">
              {featureError}
            </p>
          )}
          <p className="mt-1.5 text-xs text-dim">
            Featured habits become one-tap tiles on Home.
          </p>
        </div>
      )}
      {!unitless && (
        <div>
          <Label>Unit (optional)</Label>
          <Input
            placeholder="e.g. lbs, kcal, hours"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
      )}
      <div>
        <Label>Cadence</Label>
        <Select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as MetricCadence)}
        >
          {CADENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Direction</Label>
        <Select
          value={direction}
          onChange={(e) => setDirection(e.target.value as MetricDirection)}
        >
          {DIRECTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <p className="mt-1.5 text-xs text-dim">
          Used to judge whether you beat your weekly goal.
        </p>
      </div>
      <div>
        <Label>Weekly roll-up</Label>
        <Select
          value={agg}
          onChange={(e) => setAgg(e.target.value as MetricAgg)}
        >
          {AGG_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <p className="mt-1.5 text-xs text-dim">
          How a week of daily values becomes one number.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={save}
          disabled={!name.trim() || saving}
        >
          {saving ? "Saving…" : metric ? "Save" : "Add metric"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
