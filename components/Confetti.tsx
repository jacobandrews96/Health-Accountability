"use client";

import { useEffect, useMemo, useRef } from "react";
import { HABIT_COLORS } from "@/lib/habits";

/** Total show length: max piece duration + delay, plus a beat. */
const CONFETTI_MS = 1650;
const PIECE_COUNT = 28;
/* Habit colors plus the app accent — via the theme token, not a new hex. */
const PIECE_COLORS = [...HABIT_COLORS, "var(--color-accent-deep)"];

interface Piece {
  left: number; // % across the container
  size: number; // px
  round: boolean; // circle vs. square
  color: string;
  dx: number; // horizontal drift, px
  dy: number; // fall distance, px
  rot: number; // total rotation, deg
  duration: number; // ms
  delay: number; // ms
}

/* Seeded once per page load — render itself must stay pure (no Math.random
 * during render), and one confetti burst per day doesn't need more entropy. */
const SEED = Math.random() * 1000;

/** Deterministic pseudo-random in [0, 1) — a pure function of (i, k). */
function rnd(i: number, k: number): number {
  const x = Math.sin(SEED + i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A ~1.6s burst of small colored squares and circles falling from the top of
 * the nearest positioned ancestor (render inside a `relative` container).
 * Pure CSS animation, no dependencies. It plays once on mount; the parent
 * controls mounting and should unmount it when `onDone` fires.
 */
export default function Confetti({ onDone }: { onDone?: () => void }) {
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        left: 2 + rnd(i, 1) * 96,
        size: 6 + rnd(i, 2) * 4,
        round: i % 2 === 0,
        color: PIECE_COLORS[i % PIECE_COLORS.length],
        dx: -44 + rnd(i, 3) * 88,
        dy: 240 + rnd(i, 4) * 180,
        rot: (rnd(i, 5) < 0.5 ? -1 : 1) * (300 + rnd(i, 6) * 420),
        duration: 950 + rnd(i, 7) * 450,
        delay: rnd(i, 8) * 200,
      })),
    [],
  );

  // Keep the latest onDone without restarting the timer if the prop changes.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current?.(), CONFETTI_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      <style>{`
        @keyframes ha-confetti-fall {
          0% { transform: translate3d(0, -12px, 0) rotate(0deg); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translate3d(var(--ha-dx), var(--ha-dy), 0) rotate(var(--ha-rot)); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ha-confetti-piece { display: none; }
        }
      `}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="ha-confetti-piece absolute top-0"
          style={
            {
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              borderRadius: p.round ? "50%" : "2px",
              animation: `ha-confetti-fall ${p.duration}ms cubic-bezier(0.25, 0.6, 0.35, 1) ${p.delay}ms both`,
              "--ha-dx": `${p.dx}px`,
              "--ha-dy": `${p.dy}px`,
              "--ha-rot": `${p.rot}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
