"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui";

const LINKS = [
  { href: "/recap", icon: "🗓️", label: "Weekly recap", sub: "Who did what they said they would" },
  { href: "/workouts", icon: "🏋️", label: "Workouts", sub: "Every session, with the details" },
  { href: "/trends", icon: "📈", label: "Trends", sub: "Weight, hit-rate, sleep, slips" },
  { href: "/baseline", icon: "📍", label: "Baseline", sub: "Where you started, honestly" },
  { href: "/metrics", icon: "📏", label: "Metrics", sub: "What you track and how it's judged" },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      <div className="flex flex-col gap-2.5">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-3.5 rounded-2xl bg-card p-4 active:bg-soft"
          >
            <span className="text-2xl">{l.icon}</span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold">{l.label}</span>
              <span className="block truncate text-[13px] text-dim">{l.sub}</span>
            </span>
            <span className="ml-auto text-dim">›</span>
          </Link>
        ))}
      </div>
    </>
  );
}
