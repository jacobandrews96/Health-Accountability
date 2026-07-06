"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button, ErrorBanner, Input, Label, PageHeader } from "@/components/ui";

/**
 * Landing page for password-reset email links. AppShell routes here on the
 * PASSWORD_RECOVERY auth event; the recovery session is already active, so
 * this just sets the new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.replace("/");
  }

  return (
    <div className="mx-auto max-w-sm">
      <PageHeader
        title="Set a new password"
        subtitle="Pick something you'll actually remember this time."
      />
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label>New password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <Label>Repeat it</Label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Same thing again"
            autoComplete="new-password"
            required
          />
        </div>
        <Button type="submit" disabled={busy} className="mt-2 min-h-12">
          {busy ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </div>
  );
}
