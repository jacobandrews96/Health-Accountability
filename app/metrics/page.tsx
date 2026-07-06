"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
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
  }, [userId]);

  const active = (metrics ?? []).filter((m) => !m.archived);
  const archived = (metrics ?? []).filter((m) => m.archived);
  const nextSort =
    (metrics ?? []).reduce((mx, m) => Math.max(mx, m.sort), 0) + 1;

  function onSaved(saved: Metric) {
    setMetrics((prev) => upsertSorted(prev ?? [], saved));
    setEditing(null);
  }

  async function setArchivedFlag(m: Metric, flag: boolean) {
    if (busyId) return;
    setBusyId(m.id);
    setRowError(null);
    const { data, error } = await supabase
      .from("metrics")
      .update({ archived: flag })
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
                    onDone={onSaved}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <MetricRow metric={m}>
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
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{metric.name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-dim">
          {summarize(metric)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  );
}

/** One form for create (metric = null) and edit. Inline, never a modal. */
function MetricForm({
  metric,
  userId,
  nextSort,
  onDone,
  onCancel,
}: {
  metric: Metric | null;
  userId: string;
  nextSort: number;
  onDone: (saved: Metric) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(metric?.name ?? "");
  const [type, setType] = useState<MetricType>(metric?.type ?? "number");
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

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: trimmed,
      type,
      unit: unitless ? null : unit.trim() || null,
      cadence,
      direction,
      agg,
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
