"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { weekStart } from "@/lib/dates";
import { timestampToDayNY } from "@/lib/dates";
import { useTodayNY } from "@/lib/useTodayNY";
import type { Entry, Vice, ViceEvent } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  SectionTitle,
  Spinner,
  Textarea,
} from "@/components/ui";

export default function AccountabilityPage() {
  const { userId, others } = useApp();
  const day = useTodayNY();
  const thisWeek = weekStart(day);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vices, setVices] = useState<Vice[]>([]);
  const [weekEvents, setWeekEvents] = useState<ViceEvent[]>([]);
  const [weekUrges, setWeekUrges] = useState<Entry[]>([]);

  const [confession, setConfession] = useState("");
  const [urge, setUrge] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /** Vice id whose "It happened" note form is open. */
  const [slipOpen, setSlipOpen] = useState<string | null>(null);
  const [slipNote, setSlipNote] = useState("");

  const [showManage, setShowManage] = useState(false);
  const [newVice, setNewVice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const weekStartIso = `${thisWeek}T00:00:00-05:00`; // generous bound; filtered per-day below
      const [vicesRes, eventsRes, urgesRes] = await Promise.all([
        supabase.from("vices").select("*").order("created_at"),
        supabase.from("vice_events").select("*").gte("occurred_at", weekStartIso),
        supabase
          .from("entries")
          .select("*")
          .eq("kind", "urge")
          .gte("created_at", weekStartIso),
      ]);

      if (cancelled) return;

      const firstError = vicesRes.error ?? eventsRes.error ?? urgesRes.error;
      if (firstError) {
        setLoadError(firstError.message);
        setLoading(false);
        return;
      }
      setVices((vicesRes.data ?? []) as Vice[]);
      setWeekEvents(
        ((eventsRes.data ?? []) as ViceEvent[]).filter(
          (e) => timestampToDayNY(e.occurred_at) >= thisWeek,
        ),
      );
      setWeekUrges(
        ((urgesRes.data ?? []) as Entry[]).filter(
          (e) => timestampToDayNY(e.created_at) >= thisWeek,
        ),
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [thisWeek]);

  function flash(msg: string) {
    setDone(msg);
    setTimeout(() => setDone(null), 3000);
  }

  async function confess() {
    const body = confession.trim();
    if (!body || busyAction) return;
    setBusyAction("confess");
    setActionError(null);
    const { error } = await supabase
      .from("entries")
      .insert({ user_id: userId, kind: "confession", body });
    setBusyAction(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setConfession("");
    flash("Confessed. It's on the feed now — no taking it back.");
  }

  async function resistUrge() {
    const body = urge.trim();
    if (!body || busyAction) return;
    setBusyAction("urge");
    setActionError(null);
    const { data, error } = await supabase
      .from("entries")
      .insert({ user_id: userId, kind: "urge", body })
      .select()
      .single();
    setBusyAction(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setWeekUrges((prev) => [...prev, data as Entry]);
    setUrge("");
    flash("Logged as a win. That's the whole point.");
  }

  async function logSlip(vice: Vice) {
    if (busyAction) return;
    setBusyAction(`slip-${vice.id}`);
    setActionError(null);
    const { data, error } = await supabase
      .from("vice_events")
      .insert({
        vice_id: vice.id,
        user_id: userId,
        note: slipNote.trim() === "" ? null : slipNote.trim(),
      })
      .select()
      .single();
    setBusyAction(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setWeekEvents((prev) => [...prev, data as ViceEvent]);
    setSlipOpen(null);
    setSlipNote("");
    flash(`${vice.name} logged. Owning it beats hiding it.`);
  }

  async function addVice() {
    const name = newVice.trim();
    if (!name || busyAction) return;
    setBusyAction("add-vice");
    setActionError(null);
    const { data, error } = await supabase
      .from("vices")
      .insert({ user_id: userId, name })
      .select()
      .single();
    setBusyAction(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setVices((prev) => [...prev, data as Vice]);
    setNewVice("");
  }

  async function setViceArchived(vice: Vice, archived: boolean) {
    if (busyAction) return;
    setBusyAction(`arch-${vice.id}`);
    setActionError(null);
    const { error } = await supabase
      .from("vices")
      .update({ archived })
      .eq("id", vice.id);
    setBusyAction(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setVices((prev) =>
      prev.map((v) => (v.id === vice.id ? { ...v, archived } : v)),
    );
  }

  const myVices = vices.filter((v) => v.user_id === userId && !v.archived);
  const myArchivedVices = vices.filter((v) => v.user_id === userId && v.archived);
  const myUrgeCount = weekUrges.filter((e) => e.user_id === userId).length;

  const weekCount = (viceId: string) =>
    weekEvents.filter((e) => e.vice_id === viceId).length;

  const otherSummaries = others.map((o) => {
    const theirVices = vices.filter((v) => v.user_id === o.id && !v.archived);
    const parts = theirVices
      .map((v) => ({ name: v.name, n: weekCount(v.id) }))
      .filter((p) => p.n > 0)
      .map((p) => `${p.name} ×${p.n}`);
    const urges = weekUrges.filter((e) => e.user_id === o.id).length;
    return { name: o.display_name, slips: parts, urges };
  });

  return (
    <>
      <PageHeader
        title="Accountability"
        subtitle="Own it here, or explain it later."
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : loadError ? (
        <ErrorBanner message={loadError} />
      ) : (
        <>
          {actionError && <ErrorBanner message={actionError} />}
          {done && (
            <p className="mb-3 rounded-xl bg-accent-deep/15 px-3.5 py-2.5 text-sm font-semibold text-accent">
              {done}
            </p>
          )}

          <SectionTitle>Confess</SectionTitle>
          <Card>
            <Textarea
              value={confession}
              onChange={(e) => setConfession(e.target.value)}
              placeholder="What did you screw up? Say it straight."
              aria-label="Confession"
            />
            <Button
              onClick={confess}
              disabled={busyAction !== null || confession.trim() === ""}
              className="mt-3 w-full"
              variant="danger"
            >
              {busyAction === "confess" ? "Posting…" : "Confess it"}
            </Button>
          </Card>

          <SectionTitle>Urge beaten</SectionTitle>
          <Card>
            <p className="mb-2 text-[13px] text-dim">
              Wanted to break and didn&apos;t? That&apos;s a win. Log it like one.
            </p>
            <Textarea
              value={urge}
              onChange={(e) => setUrge(e.target.value)}
              placeholder="What did you almost do?"
              aria-label="Urge"
            />
            <Button
              onClick={resistUrge}
              disabled={busyAction !== null || urge.trim() === ""}
              className="mt-3 w-full"
            >
              {busyAction === "urge" ? "Logging…" : "I resisted 💪"}
            </Button>
            <p className="mt-2 text-center text-[13px] font-semibold text-accent">
              {myUrgeCount} urge{myUrgeCount === 1 ? "" : "s"} beaten this week
            </p>
          </Card>

          <SectionTitle>Vices</SectionTitle>
          {myVices.length === 0 ? (
            <EmptyState>No vices defined. Lucky you — or add them below.</EmptyState>
          ) : (
            <Card className="py-1">
              <div className="divide-y divide-soft">
                {myVices.map((v) => {
                  const n = weekCount(v.id);
                  const open = slipOpen === v.id;
                  return (
                    <div key={v.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold">
                          {v.name}
                          <span
                            className={`ml-2 text-[13px] font-semibold ${
                              n === 0 ? "text-accent" : "text-danger"
                            }`}
                          >
                            {n === 0 ? "clean this week" : `×${n} this week`}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSlipOpen(open ? null : v.id);
                            setSlipNote("");
                          }}
                          className="min-h-11 shrink-0 rounded-xl bg-soft px-3.5 text-[13px] font-semibold text-ink active:bg-soft/70"
                        >
                          {open ? "Cancel" : "It happened"}
                        </button>
                      </div>
                      {open && (
                        <div className="mt-2.5">
                          <Input
                            value={slipNote}
                            onChange={(e) => setSlipNote(e.target.value)}
                            placeholder="Details — optional"
                            aria-label={`${v.name} note`}
                          />
                          <Button
                            onClick={() => logSlip(v)}
                            disabled={busyAction !== null}
                            variant="danger"
                            className="mt-2 w-full"
                          >
                            {busyAction === `slip-${v.id}`
                              ? "Logging…"
                              : `Log ${v.name.toLowerCase()}`}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {otherSummaries.map((o) => (
            <p key={o.name} className="mt-3 text-[13px] text-dim">
              {o.name} this week:{" "}
              {o.slips.length === 0 ? (
                <span className="font-semibold text-accent">clean</span>
              ) : (
                <span className="font-semibold text-danger">
                  {o.slips.join(" · ")}
                </span>
              )}
              {" · "}
              <span className="font-semibold text-accent">
                {o.urges} urge{o.urges === 1 ? "" : "s"} beaten
              </span>
            </p>
          ))}

          <button
            type="button"
            onClick={() => setShowManage((s) => !s)}
            aria-expanded={showManage}
            className="mt-6 flex min-h-11 w-full items-center justify-between text-left text-[14px] font-semibold text-dim"
          >
            <span>Manage vices</span>
            <span className={`transition-transform ${showManage ? "rotate-90" : ""}`}>
              ›
            </span>
          </button>
          {showManage && (
            <Card className="mt-2">
              <div className="flex gap-2">
                <Input
                  value={newVice}
                  onChange={(e) => setNewVice(e.target.value)}
                  placeholder="New vice, e.g. Doomscrolling"
                  aria-label="New vice"
                />
                <Button
                  onClick={addVice}
                  disabled={busyAction !== null || newVice.trim() === ""}
                  variant="secondary"
                >
                  Add
                </Button>
              </div>
              {myVices.map((v) => (
                <div
                  key={v.id}
                  className="mt-2 flex items-center justify-between gap-2 text-[14px]"
                >
                  <span>{v.name}</span>
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setViceArchived(v, true)}
                  >
                    Retire
                  </Button>
                </div>
              ))}
              {myArchivedVices.map((v) => (
                <div
                  key={v.id}
                  className="mt-2 flex items-center justify-between gap-2 text-[14px] text-dim"
                >
                  <span>{v.name} (retired)</span>
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setViceArchived(v, false)}
                  >
                    Bring back
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  );
}
