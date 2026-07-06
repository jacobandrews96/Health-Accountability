"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { Spinner } from "@/components/ui";

interface AppContextValue {
  session: Session;
  /** The signed-in user's id. */
  userId: string;
  /** The signed-in user's profile. */
  me: Profile;
  /** Every member, signed-in user first. */
  profiles: Profile[];
  /** Everyone except me (normally exactly one person). */
  others: Profile[];
  refreshProfiles: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Session + member context. Only usable inside pages (AppShell guarantees auth). */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppShell");
  return ctx;
}

const NAV = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/checkin", label: "Check-in", icon: "✅" },
  { href: "/baseline", label: "Baseline", icon: "📍" },
  { href: "/metrics", label: "Metrics", icon: "📏" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [profilesRetry, setProfilesRetry] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setSessionLoaded(true);
      // Arriving from a password-reset email link: let them set a new one.
      if (event === "PASSWORD_RECOVERY") router.replace("/reset-password");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const refreshProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at");
    if (!error && data) setProfiles(data);
  }, []);

  // Refetched on every route change so a member who joins after you
  // signed in still shows up without a hard reload (it's a tiny table).
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at");
      if (cancelled) return;
      if (error) {
        // Recorded always, but only *rendered* when there's no member list
        // at all — a failed background refresh shouldn't nuke a working app.
        setProfilesError(error.message);
        return;
      }
      if (data) {
        setProfiles(data);
        setProfilesError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, pathname, profilesRetry]);

  // Redirects between login and the app.
  const onLogin = pathname === "/login" || pathname === "/login/";
  useEffect(() => {
    if (!sessionLoaded) return;
    if (!session && !onLogin) router.replace("/login");
    if (session && onLogin) router.replace("/");
  }, [sessionLoaded, session, onLogin, router]);

  if (!sessionLoaded) return <CenteredSpinner />;

  if (!session) {
    // Only the login page renders without a session.
    return onLogin ? <>{children}</> : <CenteredSpinner />;
  }

  if (onLogin) return <CenteredSpinner />; // redirecting to home

  const me = profiles?.find((p) => p.id === session.user.id);
  if (!profiles || !me) {
    // Couldn't load who's who — dead in the water without it, so say so
    // instead of spinning forever.
    if (profilesError) {
      return (
        <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-5 text-center">
          <p className="text-sm font-semibold text-danger">
            Couldn&apos;t load the app: {profilesError}
          </p>
          <button
            type="button"
            onClick={() => {
              setProfilesError(null);
              setProfilesRetry((k) => k + 1);
            }}
            className="rounded-xl bg-soft px-5 py-3 text-[15px] font-semibold text-ink"
          >
            Retry
          </button>
        </div>
      );
    }
    return <CenteredSpinner />;
  }

  const ordered = [me, ...profiles.filter((p) => p.id !== me.id)];

  return (
    <AppContext.Provider
      value={{
        session,
        userId: me.id,
        me,
        profiles: ordered,
        others: ordered.slice(1),
        refreshProfiles,
      }}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
        <main className="flex-1 px-4 pb-28 pt-4">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-soft bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-xl">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/" || pathname === ""
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${
                    active ? "text-accent" : "text-dim"
                  }`}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </AppContext.Provider>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner />
    </div>
  );
}
