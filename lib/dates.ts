/**
 * All day/week math is pinned to America/New_York so a 1 a.m. log still
 * counts for the right day regardless of the phone's timezone.
 *
 * "Day strings" are YYYY-MM-DD. Weeks start Monday.
 */

const TZ = "America/New_York";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The current date in New York, as YYYY-MM-DD. */
export function todayNY(): string {
  return dayFormatter.format(new Date());
}

/** Parse a YYYY-MM-DD day string to a Date pinned to UTC noon (DST-safe for day math). */
function toUtcNoon(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** day + n days, as YYYY-MM-DD. n may be negative. */
export function addDays(day: string, n: number): string {
  const d = toUtcNoon(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday, for a day string. */
export function mondayIndex(day: string): number {
  return (toUtcNoon(day).getUTCDay() + 6) % 7;
}

/** The Monday of the week containing `day`, as YYYY-MM-DD. */
export function weekStart(day: string): string {
  return addDays(day, -mondayIndex(day));
}

/** All 7 day strings of the week starting at `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "Mon, Jul 6" style label for a day string. */
export function formatDay(day: string): string {
  return toUtcNoon(day).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Jul 6" style short label. */
export function formatDayShort(day: string): string {
  return toUtcNoon(day).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/** "Week of Jul 6" label for a Monday day string. */
export function formatWeek(monday: string): string {
  return `Week of ${formatDayShort(monday)}`;
}

/** The day string (NY timezone) for an ISO timestamp, e.g. created_at values. */
export function timestampToDayNY(iso: string): string {
  const d = new Date(iso);
  // A malformed timestamp must never crash a whole page render.
  if (Number.isNaN(d.getTime())) return "";
  return dayFormatter.format(d);
}

/** "3:41 PM" NY-local time label for an ISO timestamp. */
export function formatTimeNY(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}
