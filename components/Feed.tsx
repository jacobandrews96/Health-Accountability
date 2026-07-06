"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import {
  addDays,
  formatDayShort,
  formatTimeNY,
  timestampToDayNY,
  todayNY,
} from "@/lib/dates";
import { useVisibilityRefresh } from "@/lib/useVisibilityRefresh";
import type { Entry, Reaction, Vice, ViceEvent } from "@/lib/types";
import { Card, EmptyState, ErrorBanner, Input, SectionTitle, Spinner } from "@/components/ui";

const FEED_DAYS = 14;
const QUICK_EMOJI = ["👊", "🔥", "😂", "💀"];

interface FeedItem {
  key: string; // `${targetType}:${id}`
  targetType: "entry" | "vice_event";
  id: string;
  userId: string;
  ts: string;
  kind: "confession" | "urge" | "slip";
  body: string | null;
  viceName?: string;
}

export default function Feed() {
  const { userId, profiles } = useApp();
  const refreshTick = useVisibilityRefresh();

  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** Item key whose comment box is open. */
  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const since = `${addDays(todayNY(), -FEED_DAYS)}T00:00:00Z`;
      const [entriesRes, eventsRes, vicesRes, reactionsRes] = await Promise.all([
        supabase.from("entries").select("*").gte("created_at", since),
        supabase.from("vice_events").select("*").gte("occurred_at", since),
        supabase.from("vices").select("*"),
        supabase.from("reactions").select("*").gte("created_at", since),
      ]);

      if (cancelled) return;

      const firstError =
        entriesRes.error ?? eventsRes.error ?? vicesRes.error ?? reactionsRes.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }

      const viceById = new Map(
        ((vicesRes.data ?? []) as Vice[]).map((v) => [v.id, v]),
      );
      const feed: FeedItem[] = [
        ...((entriesRes.data ?? []) as Entry[]).map(
          (e): FeedItem => ({
            key: `entry:${e.id}`,
            targetType: "entry",
            id: e.id,
            userId: e.user_id,
            ts: e.created_at,
            kind: e.kind === "confession" ? "confession" : "urge",
            body: e.body,
          }),
        ),
        ...((eventsRes.data ?? []) as ViceEvent[]).map(
          (e): FeedItem => ({
            key: `vice_event:${e.id}`,
            targetType: "vice_event",
            id: e.id,
            userId: e.user_id,
            ts: e.occurred_at,
            kind: "slip",
            body: e.note,
            viceName: viceById.get(e.vice_id)?.name ?? "vice",
          }),
        ),
      ].sort((a, b) => (a.ts < b.ts ? 1 : -1));

      setItems(feed.slice(0, 30));
      setReactions((reactionsRes.data ?? []) as Reaction[]);
      setError(null);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  async function toggleEmoji(item: FeedItem, emoji: string) {
    if (busy) return;
    setBusy(true);
    const mine = reactions.find(
      (r) =>
        r.user_id === userId &&
        r.target_type === item.targetType &&
        r.target_id === item.id &&
        r.emoji === emoji,
    );
    if (mine) {
      const { error: e } = await supabase.from("reactions").delete().eq("id", mine.id);
      if (!e) setReactions((prev) => prev.filter((r) => r.id !== mine.id));
      else setError(e.message);
    } else {
      const { data, error: e } = await supabase
        .from("reactions")
        .insert({
          user_id: userId,
          target_type: item.targetType,
          target_id: item.id,
          emoji,
        })
        .select()
        .single();
      if (!e && data) setReactions((prev) => [...prev, data as Reaction]);
      else if (e) setError(e.message);
    }
    setBusy(false);
  }

  async function addComment(item: FeedItem) {
    const body = commentText.trim();
    if (!body || busy) return;
    setBusy(true);
    const { data, error: e } = await supabase
      .from("reactions")
      .insert({
        user_id: userId,
        target_type: item.targetType,
        target_id: item.id,
        body,
      })
      .select()
      .single();
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setReactions((prev) => [...prev, data as Reaction]);
    setCommentText("");
    setCommentOpen(null);
  }

  const nameOf = (id: string) =>
    profiles.find((p) => p.id === id)?.display_name ?? "?";

  const today = todayNY();
  const timeLabel = (ts: string) => {
    const d = timestampToDayNY(ts);
    return d === today ? formatTimeNY(ts) : formatDayShort(d);
  };

  return (
    <>
      <SectionTitle>The feed</SectionTitle>
      <ErrorBanner message={error} />

      {!items && !error && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {items && items.length === 0 && (
        <EmptyState>
          Nothing confessed, resisted, or slipped in the last two weeks.
          Suspiciously quiet.
        </EmptyState>
      )}

      {items && items.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => {
            const itemReactions = reactions.filter(
              (r) => r.target_type === item.targetType && r.target_id === item.id,
            );
            const emojiCounts = new Map<string, { n: number; mine: boolean }>();
            for (const r of itemReactions) {
              if (!r.emoji) continue;
              const cur = emojiCounts.get(r.emoji) ?? { n: 0, mine: false };
              emojiCounts.set(r.emoji, {
                n: cur.n + 1,
                mine: cur.mine || r.user_id === userId,
              });
            }
            const comments = itemReactions.filter((r) => r.body);

            return (
              <Card key={item.key} className="p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 text-[14px]">
                    <span className="font-bold">{nameOf(item.userId)}</span>{" "}
                    {item.kind === "confession" && (
                      <span className="font-semibold text-danger">confessed</span>
                    )}
                    {item.kind === "urge" && (
                      <span className="font-semibold text-accent">
                        beat an urge 💪
                      </span>
                    )}
                    {item.kind === "slip" && (
                      <span className="font-semibold text-warn">
                        slipped: {item.viceName}
                      </span>
                    )}
                  </p>
                  <span className="shrink-0 text-[12px] text-dim">
                    {timeLabel(item.ts)}
                  </span>
                </div>

                {item.body && (
                  <p className="mt-1 text-[14px] text-ink">{item.body}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {QUICK_EMOJI.map((e) => {
                    const c = emojiCounts.get(e);
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => toggleEmoji(item, e)}
                        aria-label={`React ${e}`}
                        className={`flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[14px] transition-colors ${
                          c?.mine
                            ? "bg-accent-deep/25"
                            : c
                              ? "bg-soft"
                              : "bg-soft/40 opacity-70"
                        }`}
                      >
                        {e}
                        {c && <span className="text-[12px] font-bold">{c.n}</span>}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setCommentOpen(commentOpen === item.key ? null : item.key);
                      setCommentText("");
                    }}
                    aria-label="Comment"
                    className="flex min-h-9 items-center rounded-full bg-soft/40 px-2.5 text-[14px] opacity-70"
                  >
                    💬
                  </button>
                </div>

                {comments.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 border-t border-soft pt-2">
                    {comments.map((c) => (
                      <p key={c.id} className="text-[13px] text-dim">
                        <span className="font-bold text-ink">
                          {nameOf(c.user_id)}:
                        </span>{" "}
                        {c.body}
                      </p>
                    ))}
                  </div>
                )}

                {commentOpen === item.key && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Say it to their face"
                      aria-label="Comment text"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addComment(item);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => addComment(item)}
                      disabled={busy || commentText.trim() === ""}
                      className="shrink-0 rounded-xl bg-accent-deep px-4 text-[14px] font-bold text-[#052e1f] disabled:opacity-50"
                    >
                      Post
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
