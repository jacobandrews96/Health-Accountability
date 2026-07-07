"use client";

/** Small shared UI primitives so every screen looks like one app. */

export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-4">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-dim">{subtitle}</p>}
    </header>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-widest text-dim">
      {children}
    </h2>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-card p-4 shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const styles = {
    primary:
      "bg-accent-deep text-white font-bold active:bg-accent disabled:opacity-50",
    secondary: "bg-soft text-ink font-semibold active:bg-soft/70",
    danger: "bg-danger/10 text-danger font-semibold active:bg-danger/20",
    ghost: "text-dim underline underline-offset-2",
  }[variant];
  return (
    <button
      className={`rounded-xl px-4 py-3 text-[15px] transition-colors disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[13px] font-semibold text-dim">
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-soft bg-bg px-3.5 py-3 text-[16px] text-ink placeholder:text-dim/60 focus:border-accent-deep focus:outline-none";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${inputClass} ${className}`} {...rest} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      className={`${inputClass} min-h-20 resize-none ${className}`}
      {...rest}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return <select className={`${inputClass} appearance-none ${className}`} {...rest} />;
}

export function Spinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="h-8 w-8 animate-spin rounded-full border-[3px] border-soft border-t-accent"
    />
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-xl bg-danger/15 px-3.5 py-3 text-sm font-medium text-danger">
      {message}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-soft px-4 py-8 text-center text-sm text-dim">
      {children}
    </div>
  );
}
