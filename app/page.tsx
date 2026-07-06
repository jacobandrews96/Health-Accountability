"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { addDays, formatDay } from "@/lib/dates";
import { useTodayNY } from "@/lib/useTodayNY";
import type { Checkin, DailyLog, Profile, Workout } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
} from "@/components/ui";

interface HomeData {
  /** Checkins for all members, full history (tiny table — powers streaks). */
  checkins: Checkin[];
  /** Today's daily_logs for all members. */
  todayLogs: DailyLog[];
  /** Today's workouts for all members. */
  todayWorkouts: Workout[];
}

/**
 * Consecutive days with a checkin, counting back from `today`. If today has
 * no row yet, counting starts at yesterday — today doesn't break the streak
 * until it's over.
 */
function streakFrom(days: Set<string>, today: string): number {
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

export default function HomePage() {
  const { me, profiles } = useApp();
  // Reactive: rolls past midnight NY and refetches, so the page never shows
  // yesterday as "today" or falsely accuses anyone of not logging.
  const day = useTodayNY();

  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [checkinsRes, logsRes, workoutsRes] = await Promise.all([
        // No date window: streaks walk arbitrarily far back, and two
        // people logging daily is a few KB per year.
        supabase.from("checkins").select("*"),
        supabase.from("daily_logs").select("*").eq("day", day),
        supabase.from("workouts").select("*").eq("day", day).order("created_at"),
      ]);

      if (cancelled) return;

      const firstError =
        checkinsRes.error ?? logsRes.error ?? workoutsRes.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }

      setData({
        checkins: (checkinsRes.data ?? []) as Checkin[],
        todayLogs: (logsRes.data ?? []) as DailyLog[],
        todayWorkouts: (workoutsRes.data ?? []) as Workout[],
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [day]);

  async function handleSignOut() {
    setSigningOut(true);
    // Local scope: signing out on your phone must not kill your partner's
    // (or your other device's) session.
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    // AppShell redirects to /login when the session goes away.
    if (signOutError) {
      setError(signOutError.message);
      setSigningOut(false);
    }
  }

  const iLogged =
    data?.checkins.some((c) => c.user_id === me.id && c.day === day) ?? false;

  return (
    <>
      <PageHeader title="Health Accountability" subtitle={formatDay(day)} />

      <ErrorBanner message={error} />

      {!data && !error && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-3">
          {profiles.map((p) => (
            <MemberCard
              key={p.id}
              profile={p}
              isMe={p.id === me.id}
              iLogged={iLogged}
              day={day}
              data={data}
            />
          ))}
          {profiles.length < 2 && (
            <EmptyState>
              No one else has joined yet. Accountability needs a witness.
            </EmptyState>
          )}
        </div>
      )}

      <footer className="mt-10 flex items-center justify-between">
        <span className="text-xs text-dim">
          Signed in as {me.display_name}
        </span>
        <Button
          variant="ghost"
          className="text-xs"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          Sign out
        </Button>
      </footer>
    </>
  );
}

function MemberCard({
  profile,
  isMe,
  iLogged,
  day,
  data,
}: {
  profile: Profile;
  isMe: boolean;
  iLogged: boolean;
  day: string;
  data: HomeData;
}) {
  const checkin =
    data.checkins.find((c) => c.user_id === profile.id && c.day === day) ??
    null;
  const checkinDays = new Set(
    data.checkins.filter((c) => c.user_id === profile.id).map((c) => c.day),
  );
  const streak = streakFrom(checkinDays, day);
  const metricCount = data.todayLogs.filter(
    (l) => l.user_id === profile.id,
  ).length;
  const workouts = data.todayWorkouts.filter((w) => w.user_id === profile.id);

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          {profile.display_name}
          {isMe && <span className="font-normal text-dim"> (you)</span>}
        </h2>
        {streak > 0 ? (
          <span className="shrink-0 text-sm font-semibold text-accent">
            🔥 {streak}-day streak
          </span>
        ) : (
          <span className="shrink-0 text-sm text-dim">No streak</span>
        )}
      </div>

      {checkin ? (
        <>
          <p className="mt-2 text-sm font-semibold text-accent">
            Logged today ✓
          </p>
          <p className="mt-1 text-sm text-dim">
            {checkin.mood !== null && `Mood ${checkin.mood}/10 · `}
            {metricCount} {metricCount === 1 ? "metric" : "metrics"}
          </p>
          {workouts.map((w) => (
            <p key={w.id} className="mt-1 text-sm text-dim">
              + workout: {w.kind}
            </p>
          ))}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-dim">Nothing logged yet today.</p>
          {isMe && (
            <Link href="/checkin" className="mt-3 block">
              <Button className="pointer-events-none w-full" tabIndex={-1}>
                Log today. It takes a minute.
              </Button>
            </Link>
          )}
          {!isMe && iLogged && (
            <p className="mt-2 text-sm font-semibold text-warn">
              {`${profile.display_name} hasn't logged anything today.`}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
