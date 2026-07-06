"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import {
  addDays,
  formatDayShort,
  timestampToDayNY,
  weekStart,
} from "@/lib/dates";
import { useTodayNY } from "@/lib/useTodayNY";
import { computeProgress } from "@/lib/goals";
import type {
  DailyLog,
  Metric,
  Profile,
  ViceEvent,
  WeeklyGoal,
} from "@/lib/types";
import {
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
} from "@/components/ui";

/* Categorical palette validated for the dark card surface (#151e2e):
 * lightness band, chroma, CVD separation, and 3:1 contrast all pass.
 * Colors follow the member (join order), never the viewer. */
const SERIES = ["#199e70", "#3987e5", "#d55181", "#c98500"];

const INK = "#eef2f7";
const DIM = "#8ca0b3";
const GRID = "#22304a";

interface TrendsData {
  metrics: Metric[];
  logs: DailyLog[];
  goals: WeeklyGoal[];
  viceEvents: ViceEvent[];
}

export default function TrendsPage() {
  const { profiles } = useApp();
  const today = useTodayNY();

  const [data, setData] = useState<TrendsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const since = addDays(today, -365);
      const [metricsRes, logsRes, goalsRes, eventsRes] = await Promise.all([
        supabase.from("metrics").select("*"),
        supabase.from("daily_logs").select("*").gte("day", since),
        supabase.from("weekly_goals").select("*").gte("week_start", since),
        supabase
          .from("vice_events")
          .select("*")
          .gte("occurred_at", `${since}T00:00:00Z`),
      ]);
      if (cancelled) return;
      const firstError =
        metricsRes.error ?? logsRes.error ?? goalsRes.error ?? eventsRes.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }
      setData({
        metrics: (metricsRes.data ?? []) as Metric[],
        logs: (logsRes.data ?? []) as DailyLog[],
        goals: (goalsRes.data ?? []) as WeeklyGoal[],
        viceEvents: (eventsRes.data ?? []) as ViceEvent[],
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [today]);

  // Stable color assignment: join order, not viewer order.
  const byJoin = [...profiles].sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1,
  );
  const colorOf = new Map(byJoin.map((p, i) => [p.id, SERIES[i % SERIES.length]]));

  return (
    <>
      <PageHeader title="Trends" subtitle="The numbers don't care how you feel." />
      <ErrorBanner message={error} />

      {!data && !error && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-4">
          <LegendChips profiles={byJoin} colorOf={colorOf} />
          <MetricLineChart
            title="Weight"
            metricName="weight"
            data={data}
            profiles={byJoin}
            colorOf={colorOf}
            today={today}
          />
          <HitRateChart data={data} profiles={byJoin} colorOf={colorOf} today={today} />
          <MetricLineChart
            title="Sleep (hours)"
            metricName="sleep"
            data={data}
            profiles={byJoin}
            colorOf={colorOf}
            today={today}
          />
          <SlipsChart data={data} profiles={byJoin} colorOf={colorOf} today={today} />
        </div>
      )}
    </>
  );
}

function LegendChips({
  profiles,
  colorOf,
}: {
  profiles: Profile[];
  colorOf: Map<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {profiles.map((p) => (
        <span key={p.id} className="flex items-center gap-1.5 text-[13px] text-dim">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: colorOf.get(p.id) }}
          />
          {p.display_name}
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  profiles,
  unit,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color?: string }[];
  label?: string;
  profiles: Profile[];
  unit?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const nameOf = (id: string) =>
    profiles.find((p) => p.id === id)?.display_name ?? id;
  return (
    <div
      className="rounded-xl border border-soft bg-card px-3 py-2 text-[12px]"
      style={{ color: INK }}
    >
      <p style={{ color: DIM }}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="mt-0.5 flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {nameOf(entry.dataKey)}: {Math.round(entry.value * 10) / 10}
          {unit ? ` ${unit}` : ""}
        </p>
      ))}
    </div>
  );
}

/** Shared card with a chart and a data-table toggle (accessibility fallback). */
function ChartCard({
  title,
  empty,
  table,
  children,
}: {
  title: string;
  empty: boolean;
  table: { headers: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[14px] font-bold">{title}</h2>
        {!empty && (
          <button
            type="button"
            onClick={() => setShowTable((s) => !s)}
            className="min-h-9 text-[12px] font-semibold text-dim underline underline-offset-2"
          >
            {showTable ? "chart" : "table"}
          </button>
        )}
      </div>
      {empty ? (
        <EmptyState>Not enough data yet. Keep logging.</EmptyState>
      ) : showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-dim">
                {table.headers.map((h) => (
                  <th key={h} className="py-1 pr-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className="border-t border-soft">
                  {row.map((cell, j) => (
                    <td key={j} className="py-1 pr-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </Card>
  );
}

const axisProps = {
  stroke: DIM,
  tick: { fill: DIM, fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
};

/** Line chart of a daily metric matched by (case-insensitive) name, per member. */
function MetricLineChart({
  title,
  metricName,
  data,
  profiles,
  colorOf,
  today,
}: {
  title: string;
  metricName: string;
  data: TrendsData;
  profiles: Profile[];
  colorOf: Map<string, string>;
  today: string;
}) {
  const since = addDays(today, -90);
  const metricIdByUser = new Map<string, string>();
  for (const p of profiles) {
    const m = data.metrics.find(
      (x) => x.user_id === p.id && x.name.toLowerCase() === metricName,
    );
    if (m) metricIdByUser.set(p.id, m.id);
  }

  const byDay = new Map<string, Record<string, number | string>>();
  for (const log of data.logs) {
    if (log.day < since) continue;
    const forUser = [...metricIdByUser.entries()].find(
      ([, mid]) => mid === log.metric_id,
    );
    if (!forUser) continue;
    const row = byDay.get(log.day) ?? { day: log.day };
    row[forUser[0]] = Number(log.value);
    byDay.set(log.day, row);
  }
  const chartData = [...byDay.values()].sort((a, b) =>
    (a.day as string) < (b.day as string) ? -1 : 1,
  );

  const empty = chartData.length < 2;
  const table = {
    headers: ["Day", ...profiles.map((p) => p.display_name)],
    rows: chartData.map((r) => [
      formatDayShort(r.day as string),
      ...profiles.map((p) => (r[p.id] as number) ?? "—"),
    ]),
  };

  return (
    <ChartCard title={title} empty={empty} table={table}>
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={chartData} margin={{ top: 6, right: 42, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => formatDayShort(d)}
            {...axisProps}
          />
          <YAxis domain={["auto", "auto"]} {...axisProps} />
          <Tooltip
            content={<ChartTooltip profiles={profiles} />}
            labelFormatter={(d) => formatDayShort(String(d))}
          />
          {profiles.map(
            (p) =>
              metricIdByUser.has(p.id) && (
                <Line
                  key={p.id}
                  dataKey={p.id}
                  stroke={colorOf.get(p.id)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#151e2e" }}
                  connectNulls
                  isAnimationActive={false}
                  label={(props: {
                    index?: number;
                    x?: number | string;
                    y?: number | string;
                  }) =>
                    props.index === chartData.length - 1 ? (
                      <text
                        x={Number(props.x ?? 0) + 6}
                        y={Number(props.y ?? 0)}
                        dy={4}
                        fill={DIM}
                        fontSize={11}
                        fontWeight={600}
                      >
                        {p.display_name.slice(0, 6)}
                      </text>
                    ) : (
                      <text />
                    )
                  }
                />
              ),
          )}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Weeks (Mondays) for the last n weeks, oldest first. */
function lastWeeks(today: string, n: number): string[] {
  const thisWeek = weekStart(today);
  return Array.from({ length: n }, (_, i) => addDays(thisWeek, -7 * (n - 1 - i)));
}

function HitRateChart({
  data,
  profiles,
  colorOf,
  today,
}: {
  data: TrendsData;
  profiles: Profile[];
  colorOf: Map<string, string>;
  today: string;
}) {
  const thisWeek = weekStart(today);
  const metricById = new Map(data.metrics.map((m) => [m.id, m]));
  const weeks = lastWeeks(today, 13).filter((w) => w < thisWeek);

  const chartData = weeks
    .map((week) => {
      const row: Record<string, number | string> = {
        week: formatDayShort(week),
      };
      let any = false;
      for (const p of profiles) {
        const goals = data.goals.filter(
          (g) => g.user_id === p.id && g.week_start === week,
        );
        if (goals.length === 0) continue;
        const weekLogs = data.logs.filter(
          (l) => l.day >= week && l.day <= addDays(week, 6),
        );
        const hits = goals.filter((g) => {
          const m = metricById.get(g.metric_id);
          return m && computeProgress(m, g, weekLogs, true).status === "hit";
        }).length;
        row[p.id] = Math.round((hits / goals.length) * 100);
        any = true;
      }
      return any ? row : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const table = {
    headers: ["Week", ...profiles.map((p) => `${p.display_name} %`)],
    rows: chartData.map((r) => [
      r.week,
      ...profiles.map((p) => (r[p.id] as number) ?? "—"),
    ]),
  };

  return (
    <ChartCard
      title="Goal hit-rate by week (%)"
      empty={chartData.length === 0}
      table={table}
    >
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={chartData} barGap={2} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="week" {...axisProps} />
          <YAxis domain={[0, 100]} {...axisProps} />
          <Tooltip
            content={<ChartTooltip profiles={profiles} unit="%" />}
            cursor={{ fill: GRID, opacity: 0.4 }}
          />
          {profiles.map((p) => (
            <Bar
              key={p.id}
              dataKey={p.id}
              fill={colorOf.get(p.id)}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function SlipsChart({
  data,
  profiles,
  colorOf,
  today,
}: {
  data: TrendsData;
  profiles: Profile[];
  colorOf: Map<string, string>;
  today: string;
}) {
  const weeks = lastWeeks(today, 12);

  const chartData = weeks.map((week) => {
    const weekEnd = addDays(week, 6);
    const row: Record<string, number | string> = { week: formatDayShort(week) };
    for (const p of profiles) {
      row[p.id] = data.viceEvents.filter((e) => {
        const d = timestampToDayNY(e.occurred_at);
        return e.user_id === p.id && d >= week && d <= weekEnd;
      }).length;
    }
    return row;
  });

  const anySlips = chartData.some((r) =>
    profiles.some((p) => (r[p.id] as number) > 0),
  );
  const table = {
    headers: ["Week", ...profiles.map((p) => p.display_name)],
    rows: chartData.map((r) => [r.week, ...profiles.map((p) => r[p.id] as number)]),
  };

  return (
    <ChartCard title="Vice slips per week" empty={!anySlips} table={table}>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={chartData} barGap={2} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="week" {...axisProps} />
          <YAxis allowDecimals={false} {...axisProps} />
          <Tooltip
            content={<ChartTooltip profiles={profiles} />}
            cursor={{ fill: GRID, opacity: 0.4 }}
          />
          {profiles.map((p) => (
            <Bar
              key={p.id}
              dataKey={p.id}
              fill={colorOf.get(p.id)}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
