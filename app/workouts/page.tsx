"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { formatDay } from "@/lib/dates";
import { useVisibilityRefresh } from "@/lib/useVisibilityRefresh";
import type { Profile, Workout } from "@/lib/types";
import {
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  SectionTitle,
  Spinner,
} from "@/components/ui";

export default function WorkoutsPage() {
  const { profiles } = useApp();
  const refreshTick = useVisibilityRefresh();

  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error: e } = await supabase
        .from("workouts")
        .select("*")
        .order("day", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (e) {
        setError(e.message);
        return;
      }
      setWorkouts((data ?? []) as Workout[]);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return (
    <>
      <PageHeader
        title="Workouts"
        subtitle="Every session. The details don't lie."
      />
      <ErrorBanner message={error} />

      {!workouts && !error && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {workouts &&
        profiles.map((p) => (
          <MemberWorkouts
            key={p.id}
            profile={p}
            workouts={workouts.filter((w) => w.user_id === p.id)}
            expanded={expanded}
            onToggle={(id) => setExpanded((cur) => (cur === id ? null : id))}
          />
        ))}
    </>
  );
}

function MemberWorkouts({
  profile,
  workouts,
  expanded,
  onToggle,
}: {
  profile: Profile;
  workouts: Workout[];
  expanded: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <SectionTitle>{profile.display_name}</SectionTitle>
      {workouts.length === 0 ? (
        <EmptyState>No workouts logged. The iron misses them.</EmptyState>
      ) : (
        <Card className="py-1">
          <div className="divide-y divide-soft">
            {workouts.map((w) => {
              const hasDetails =
                w.details && w.details.exercises && w.details.exercises.length > 0;
              const open = expanded === w.id;
              return (
                <div key={w.id} className="py-2.5">
                  <button
                    type="button"
                    onClick={() => hasDetails && onToggle(w.id)}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 text-left ${
                      hasDetails ? "" : "cursor-default"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold">
                        {w.kind}
                        {w.duration_min != null && (
                          <span className="font-normal text-dim">
                            {" "}
                            · {w.duration_min} min
                          </span>
                        )}
                      </span>
                      <span className="block text-[12px] text-dim">
                        {formatDay(w.day)}
                        {w.note ? ` — ${w.note}` : ""}
                      </span>
                    </span>
                    {hasDetails && (
                      <span
                        className={`shrink-0 text-dim transition-transform ${
                          open ? "rotate-90" : ""
                        }`}
                      >
                        ›
                      </span>
                    )}
                  </button>
                  {open && hasDetails && (
                    <div className="mt-1.5 rounded-xl bg-bg px-3 py-2">
                      {w.details!.exercises.map((ex, i) => (
                        <p key={i} className="py-1 text-[13px]">
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
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}
