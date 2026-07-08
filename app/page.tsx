"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import Feed from "@/components/Feed";
import Confetti from "@/components/Confetti";
import HabitTiles from "@/components/HabitTiles";
import { addDays, formatDay } from "@/lib/dates";
import { useTodayNY } from "@/lib/useTodayNY";
import { useVisibilityRefresh } from "@/lib/useVisibilityRefresh";
import { doneDays, featuredHabits } from "@/lib/habits";
import type { Checkin, DailyLog, Metric, Profile } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
} from "@/components/ui";

// No daily_logs window: tile streaks walk arbitrarily far back (same
// rationale as the unbounded checkins query below), and two people logging
// a handful of metrics is a few hundred KB per year at worst.

interface HomeData {
  /** Checkins for all members, full history (tiny table — powers streaks). */
  checkins: Checkin[];
  /** daily_logs for all members (tiles + streaks). */
  logs: DailyLog[];
  /** Everyone's metric definitions (tiles). */
  metrics: Metric[];
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
  // Refetch when the app is reopened — your partner may have logged since.
  const refreshTick = useVisibilityRefresh();

  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  /** Bumped after a tile write so everything resyncs with the database. */
  const [reloadKey, setReloadKey] = useState(0);
  /** Day made perfect via tile taps — shows "Perfect day ✓" before the refetch lands. */
  const [tapPerfectDay, setTapPerfectDay] = useState<string | null>(null);
  /** Day the confetti is currently bursting for; null = unmounted. */
  const [confettiDay, setConfettiDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [checkinsRes, logsRes, metricsRes] = await Promise.all([
        // No date window on either: streaks walk arbitrarily far back, and
        // two people logging a handful of things is tiny data.
        supabase.from("checkins").select("*"),
        supabase.from("daily_logs").select("*"),
        supabase.from("metrics").select("*"),
      ]);

      if (cancelled) return;

      const firstError = checkinsRes.error ?? logsRes.error ?? metricsRes.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }

      setData({
        checkins: (checkinsRes.data ?? []) as Checkin[],
        logs: (logsRes.data ?? []) as DailyLog[],
        metrics: (metricsRes.data ?? []) as Metric[],
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [day, refreshTick, reloadKey]);

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

  const myLogs = data ? data.logs.filter((l) => l.user_id === me.id) : [];
  const myFeatured = data ? featuredHabits(data.metrics, me.id) : [];
  // Perfect day straight from the data — habits logged via check-in count too.
  const perfectFromData =
    myFeatured.length >= 2 &&
    myFeatured.every((h) => doneDays(myLogs, h.id).has(day));

  // When fresh data arrives and says the set is NOT complete (a habit was
  // toggled back off), clear the tap-path banner — it must not stick.
  const [seenData, setSeenData] = useState<HomeData | null>(null);
  if (data !== seenData) {
    setSeenData(data);
    if (data && !perfectFromData && tapPerfectDay !== null) {
      setTapPerfectDay(null);
    }
  }

  const perfectDay = perfectFromData || tapPerfectDay === day;

  /** The tap that completed the set: banner now, confetti once per day. */
  function celebrate() {
    setTapPerfectDay(day);
    const key = `ha-perfect-${day}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable (private mode) — celebrate anyway.
    }
    setConfettiDay(day);
  }

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
          {/* My arcade tiles — the first thing on the page. */}
          <section className="relative">
            <HabitTiles
              profile={me}
              isMe
              day={day}
              metrics={data.metrics}
              logs={myLogs}
              onLogged={() => setReloadKey((k) => k + 1)}
              onPerfectDay={celebrate}
            />
            {perfectDay && (
              <p className="mt-2 text-center text-[15px] font-bold text-accent">
                Perfect day ✓
              </p>
            )}
            {confettiDay === day && (
              <Confetti onDone={() => setConfettiDay(null)} />
            )}
          </section>

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

      {data && <Feed />}

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

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`/member?id=${profile.id}`}
          className="min-w-0 active:opacity-60"
        >
          <h2 className="text-base font-bold">
            {profile.display_name}
            {isMe && <span className="font-normal text-dim"> (you)</span>}
            <span className="ml-1 font-normal text-dim">›</span>
          </h2>
        </Link>
        {streak > 0 ? (
          <span className="shrink-0 text-sm font-semibold text-accent">
            🔥 {streak}-day streak
          </span>
        ) : (
          <span className="shrink-0 text-sm text-dim">No streak</span>
        )}
      </div>

      {/* Partner's habit tiles — the social mirror, right under their name.
          My own tiles already run big at the top of the page. */}
      {!isMe && (
        <div className="mt-3">
          <HabitTiles
            profile={profile}
            isMe={false}
            day={day}
            metrics={data.metrics}
            logs={data.logs.filter((l) => l.user_id === profile.id)}
          />
        </div>
      )}

      {checkin ? (
        <p className="mt-2 text-sm font-semibold text-accent">
          Logged today ✓{" "}
          <Link
            href={`/member?id=${profile.id}`}
            className="font-normal text-dim underline underline-offset-2"
          >
            see the day ›
          </Link>
        </p>
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
