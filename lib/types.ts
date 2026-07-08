/** Database row types — must stay in sync with supabase/setup.sql. */

export type MetricType = "number" | "yesno" | "duration" | "count" | "scale";
export type MetricCadence = "daily" | "weekly";
/** higher = higher is better, lower = lower is better, cap = target is a ceiling */
export type MetricDirection = "higher" | "lower" | "cap";
/** How a week of daily values rolls up against a weekly goal. */
export type MetricAgg = "sum" | "avg" | "count_days" | "last";

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
}

export interface Metric {
  id: string;
  user_id: string;
  name: string;
  type: MetricType;
  unit: string | null;
  cadence: MetricCadence;
  direction: MetricDirection;
  agg: MetricAgg;
  sort: number;
  archived: boolean;
  /** Featured yes/no habits render as one-tap arcade tiles on Home. */
  featured: boolean;
  created_at: string;
}

export interface DailyLog {
  id: string;
  user_id: string;
  metric_id: string;
  day: string; // YYYY-MM-DD
  value: number; // yes/no stored as 1/0
  created_at: string;
}

export interface WeeklyGoal {
  id: string;
  user_id: string;
  metric_id: string;
  week_start: string; // Monday, YYYY-MM-DD
  target: number;
  created_at: string;
}

export interface Checkin {
  id: string;
  user_id: string;
  day: string;
  mood: number | null; // 1–10
  mood_note: string | null;
  sleep_quality: number | null; // 1–10
  created_at: string;
}

export interface WorkoutSet {
  reps: number | null;
  weight: number | null;
}

export interface WorkoutExercise {
  name: string;
  sets: WorkoutSet[];
}

export interface WorkoutDetails {
  exercises: WorkoutExercise[];
}

export interface Workout {
  id: string;
  user_id: string;
  day: string;
  kind: string;
  duration_min: number | null;
  note: string | null;
  details: WorkoutDetails | null;
  created_at: string;
}

export interface Baseline {
  id: string;
  user_id: string;
  weight: number | null;
  fixing: string; // "things I need to fix"
  falling_short: string; // "where I'm falling short"
  created_at: string;
}

export interface Vice {
  id: string;
  user_id: string;
  name: string;
  archived: boolean;
  created_at: string;
}

export interface ViceEvent {
  id: string;
  vice_id: string;
  user_id: string;
  occurred_at: string;
  note: string | null;
  created_at: string;
}

export type EntryKind = "confession" | "urge";

export interface Entry {
  id: string;
  user_id: string;
  kind: EntryKind;
  body: string;
  created_at: string;
}

export type ReactionTarget = "entry" | "vice_event" | "workout" | "checkin";

export interface Reaction {
  id: string;
  user_id: string;
  target_type: ReactionTarget;
  target_id: string;
  emoji: string | null;
  body: string | null;
  created_at: string;
}
