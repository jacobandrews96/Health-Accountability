# Health Accountability

A shared, brutally honest fitness journal for two friends. Both of you see
everything the other logs — the social pressure **is** the product.

**Live app:** https://jacobandrews96.github.io/Health-Accountability/

## What's built (Phase 1)

- **Accounts** — email + password, one account each. The database supports
  more members later; the UI renders a card per member.
- **User-defined metrics** — nothing hardcoded. Each metric has a type
  (number / yes-no / duration / count / scale 1–10), optional unit, cadence,
  direction (higher-better / lower-better / cap), and a weekly roll-up rule.
  New accounts are seeded with Weight, Calories, Steps, Gym session, Meals
  ordered in, and Sleep — all fully editable or deletable.
- **Daily check-in** — one screen, under a minute: today's metrics, sleep
  quality, mood + note, quick-add workouts. Reopening it edits the same day.
- **Baseline** — "where we are today": weight + what needs fixing + where
  you're falling short. Every save is a new snapshot; history is kept.
- **Home** — both members side by side: logged-today status (with a blunt
  callout when someone hasn't), streaks, today's numbers.

Coming next: weekly goals + shared dashboard (Phase 2), confessions / urge
log / vices + reactions (Phase 3), workout detail mode + trends + weekly
recap (Phase 4).

## One-time setup (owner)

1. **Database** — Supabase dashboard → your project → **SQL Editor** → paste
   the entire contents of [`supabase/setup.sql`](supabase/setup.sql) → **Run**.
   Safe to re-run; it never drops app data.
2. **Smooth signups (recommended)** — Supabase dashboard → **Authentication →
   Sign In / Providers → Email** → turn **off** "Confirm email". Otherwise you
   each have to click a confirmation link before the first sign-in.
3. **Hosting** — GitHub repo → **Settings → Pages → Build and deployment →
   Source: "GitHub Actions"**. Every push then auto-deploys; the workflow can
   also be run manually from the Actions tab.
4. Open the live URL on your phone, **Create account**, and have your friend
   do the same. Add it to your home screen for an app-like feel.
5. **Lock the door** — once you've both registered: Supabase dashboard →
   **Authentication → Sign In / Providers** → turn **off** "Allow new users
   to sign up". (Flip it back on if a third person ever joins.)

## How it works

Static Next.js export served by GitHub Pages (no server); all data and auth
live in Supabase. The browser talks to Supabase directly with the public
publishable key — Row Level Security enforces that signed-in members can
read everything but write only their own rows, and anonymous visitors get
nothing. All day/week boundaries are pinned to America/New_York, and weeks
start Monday.

## Development

```bash
npm install
npm run dev        # local dev server
npm run lint       # eslint
npm run build      # static export to out/
```

| Path | Purpose |
| --- | --- |
| `app/` | Screens (App Router, all client components) |
| `components/AppShell.tsx` | Auth gate, member context, tab navigation |
| `components/ui.tsx` | Shared UI primitives |
| `lib/dates.ts` | America/New_York day + Monday-week helpers |
| `lib/types.ts` | Database row types (mirror of setup.sql) |
| `supabase/setup.sql` | Full schema, RLS policies, signup seeding |
| `.github/workflows/deploy.yml` | Build + deploy to GitHub Pages |
