"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import type { Baseline, Profile } from "@/lib/types";
import { formatDay, formatDayShort, timestampToDayNY } from "@/lib/dates";
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

export default function BaselinePage() {
  const { userId, others } = useApp();

  const [baselines, setBaselines] = useState<Baseline[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // My form.
  const [weight, setWeight] = useState("");
  const [fixing, setFixing] = useState("");
  const [fallingShort, setFallingShort] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // One query for everyone's snapshots, newest first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("baselines")
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      const rows = (data ?? []) as Baseline[];
      setBaselines(rows);
      const latest = rows.find((b) => b.user_id === userId);
      if (latest) {
        setWeight(latest.weight != null ? String(latest.weight) : "");
        setFixing(latest.fixing);
        setFallingShort(latest.falling_short);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const mine = useMemo(
    () => (baselines ?? []).filter((b) => b.user_id === userId),
    [baselines, userId],
  );
  const latestMine = mine[0] ?? null;

  const weightTrimmed = weight.trim();
  const weightValue = weightTrimmed === "" ? null : Number(weightTrimmed);
  const weightInvalid = weightValue !== null && Number.isNaN(weightValue);

  const dirty =
    weightValue !== (latestMine?.weight ?? null) ||
    fixing.trim() !== (latestMine?.fixing ?? "") ||
    fallingShort.trim() !== (latestMine?.falling_short ?? "");

  async function save() {
    if (!dirty || weightInvalid || saving) return;
    setSaving(true);
    setSaveError(null);
    const { data, error } = await supabase
      .from("baselines")
      .insert({
        user_id: userId,
        weight: weightValue,
        fixing: fixing.trim(),
        falling_short: fallingShort.trim(),
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    const row = data as Baseline;
    setBaselines((prev) => [row, ...(prev ?? [])]);
    setWeight(row.weight != null ? String(row.weight) : "");
    setFixing(row.fixing);
    setFallingShort(row.falling_short);
    setJustSaved(true);
  }

  function edit(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      setJustSaved(false);
    };
  }

  if (loadError) {
    return (
      <>
        <PageHeader title="Baseline" subtitle="Where we are today." />
        <ErrorBanner message={loadError} />
      </>
    );
  }

  if (!baselines) {
    return (
      <>
        <PageHeader title="Baseline" subtitle="Where we are today." />
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Baseline"
        subtitle="Where we are today. Every save is a new snapshot — nothing gets rewritten."
      />

      <SectionTitle>My baseline</SectionTitle>
      <Card>
        {latestMine ? (
          <p className="mb-4 text-xs text-dim">
            since {formatDayShort(timestampToDayNY(mine[mine.length - 1].created_at))} · updated{" "}
            {formatDayShort(timestampToDayNY(latestMine.created_at))}
          </p>
        ) : (
          <p className="mb-4 text-sm text-dim">
            Set your starting point. Be honest — this is the &ldquo;before&rdquo; picture.
          </p>
        )}

        <ErrorBanner message={saveError} />

        <div className="space-y-4">
          <div>
            <Label>Weight (lbs)</Label>
            <Input
              inputMode="decimal"
              placeholder="0"
              value={weight}
              onChange={(e) => edit(setWeight)(e.target.value)}
            />
            {weightInvalid && (
              <p className="mt-1.5 text-[13px] font-medium text-danger">
                That&apos;s not a number.
              </p>
            )}
          </div>
          <div>
            <Label>Things I need to fix</Label>
            <Textarea
              placeholder="Name them. All of them."
              value={fixing}
              onChange={(e) => edit(setFixing)(e.target.value)}
            />
          </div>
          <div>
            <Label>Where I&apos;m falling short</Label>
            <Textarea
              placeholder="Where you're actually failing, not where it's comfortable to admit."
              value={fallingShort}
              onChange={(e) => edit(setFallingShort)(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={save}
            disabled={!dirty || weightInvalid || saving}
          >
            {saving ? "Saving…" : "Save new snapshot"}
          </Button>
          {justSaved ? (
            <p className="text-center text-sm font-semibold text-accent">
              Saved as a new snapshot. The old one is in history.
            </p>
          ) : (
            <p className="text-center text-xs text-dim">
              Saving adds a snapshot. Old ones stay on the record.
            </p>
          )}
        </div>
      </Card>
      <History rows={mine.slice(1)} />

      {others.map((p) => (
        <MemberSection
          key={p.id}
          profile={p}
          rows={baselines.filter((b) => b.user_id === p.id)}
        />
      ))}
    </>
  );
}

/** Another member's latest snapshot (read-only) plus their history. */
function MemberSection({ profile, rows }: { profile: Profile; rows: Baseline[] }) {
  const latest = rows[0];
  const first = rows[rows.length - 1];

  return (
    <>
      <SectionTitle>{profile.display_name}</SectionTitle>
      {!latest ? (
        <EmptyState>Nothing yet.</EmptyState>
      ) : (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            {latest.weight != null ? (
              <p>
                <span className="text-2xl font-bold">{latest.weight}</span>
                <span className="ml-1 text-sm text-dim">lbs</span>
              </p>
            ) : (
              <p className="text-sm text-dim">No weight logged</p>
            )}
          </div>
          <p className="mt-1 text-xs text-dim">
            since {formatDayShort(timestampToDayNY(first.created_at))} · updated{" "}
            {formatDayShort(timestampToDayNY(latest.created_at))}
          </p>
          <TextBlock label="Things to fix" text={latest.fixing} />
          <TextBlock label="Falling short" text={latest.falling_short} />
        </Card>
      )}
      <History rows={rows.slice(1)} />
    </>
  );
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-dim">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
        {text || "—"}
      </p>
    </div>
  );
}

/** Collapsible list of older snapshots, newest first. Hidden when empty. */
function History({ rows }: { rows: Baseline[] }) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-sm font-semibold text-dim"
      >
        <span>History ({rows.length})</span>
        <span
          aria-hidden
          className={`text-base transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>
      {open && (
        <Card>
          <ul className="divide-y divide-soft">
            {rows.map((b) => (
              <li key={b.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-dim">
                    {formatDay(timestampToDayNY(b.created_at))}
                  </span>
                  <span className="text-sm font-semibold">
                    {b.weight != null ? `${b.weight} lbs` : "—"}
                  </span>
                </div>
                {b.fixing && (
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-dim">
                    <span className="font-semibold text-ink">Fix:</span>{" "}
                    {b.fixing}
                  </p>
                )}
                {b.falling_short && (
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-dim">
                    <span className="font-semibold text-ink">Short:</span>{" "}
                    {b.falling_short}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
