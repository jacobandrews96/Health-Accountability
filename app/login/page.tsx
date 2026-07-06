"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button, ErrorBanner, Input, Label } from "@/components/ui";

type Mode = "signin" | "signup";

const MODES: { key: Mode; label: string }[] = [
  { key: "signin", label: "Sign in" },
  { key: "signup", label: "Create account" },
];

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    if (next === mode || busy) return;
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function forgotPassword() {
    if (busy) return;
    const target = email.trim();
    if (!target) {
      setError("Type your email above first, then hit forgot password.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    // Come back to this exact page; AppShell routes the recovery session
    // to /reset-password.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      target,
      { redirectTo: window.location.href },
    );
    setBusy(false);
    if (resetError) setError(resetError.message);
    else setNotice("Reset link sent. Check your email, then set a new password.");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "signup") {
      if (!displayName.trim()) {
        setError("Pick a display name.");
        return;
      }
      if (password.length < 8) {
        setError("Password needs at least 8 characters.");
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) setError(authError.message);
        // On success, AppShell's onAuthStateChange handles the redirect.
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (authError) {
          setError(authError.message);
        } else if (data.user && !data.session) {
          // Email confirmation is on — no session until they confirm.
          setMode("signin");
          setPassword("");
          setNotice("Check your email to confirm your account, then sign in.");
        }
        // If a session came back, AppShell redirects home.
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Health Accountability
        </h1>
        <p className="mt-1.5 text-sm text-dim">
          The shared journal that doesn&apos;t let you lie to yourself.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-card p-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            disabled={busy}
            onClick={() => switchMode(m.key)}
            className={`min-h-11 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              mode === m.key
                ? "bg-soft font-bold text-ink"
                : "font-semibold text-dim"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="mb-4 rounded-xl bg-accent/10 px-3.5 py-3 text-sm font-medium text-accent">
          {notice}
        </div>
      )}
      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "signup" && (
          <div>
            <Label>Display name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What your friend calls you"
              autoComplete="name"
              autoCapitalize="words"
              required
            />
          </div>
        )}

        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            required
          />
        </div>

        <div>
          <Label>Password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 8 characters" : "Password"}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            required
          />
        </div>

        <Button type="submit" disabled={busy} className="mt-2 min-h-12">
          {busy
            ? mode === "signin"
              ? "Signing in…"
              : "Creating account…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>

      {mode === "signin" && (
        <button
          type="button"
          onClick={forgotPassword}
          disabled={busy}
          className="mx-auto mt-5 min-h-11 px-3 text-[13px] font-semibold text-dim underline underline-offset-2"
        >
          Forgot password?
        </button>
      )}
    </div>
  );
}
