# 💪 Health Accountability

A tiny web app for two friends to keep each other honest about daily health
habits. Check off your habits each day, see what your friend did, keep your
streak alive, and compare your last 7 days.

**Live app:** https://jacobandrews96.github.io/Health-Accountability/

## How it works

- Static site (plain HTML/CSS/JS) hosted for free on **GitHub Pages** —
  every push to this repo automatically redeploys it.
- Shared data lives in a free **Supabase** database, so both phones see the
  same check-ins in near-real-time (the app refreshes every minute and
  whenever you reopen it).
- No accounts or passwords: the first time you open the app you pick a name
  and an emoji, and your phone remembers who you are.

## One-time setup

1. **Database** — in the [Supabase dashboard](https://supabase.com/dashboard),
   open your project → **SQL Editor**, paste in the contents of
   [`supabase/setup.sql`](supabase/setup.sql), and click **Run**.
2. **Hosting** — the GitHub Actions workflow in this repo deploys the site
   automatically. If the first run fails, go to the repo's
   **Settings → Pages** and set **Source** to **GitHub Actions**, then re-run
   the workflow from the **Actions** tab.
3. Open the live URL on your phone, create your profile, and send the same
   URL to your friend so they can create theirs.

Tip: on iPhone/Android you can "Add to Home Screen" from the browser share
menu so it feels like a real app.

## Changing the habits

The habit list lives in the database, shared by everyone. In Supabase, open
**Table Editor → habits** to rename, reorder (via `sort`), add, or retire
(set `active` to false) habits. The app picks up changes on its next refresh.

## A note on privacy

There are no logins — anyone who has the app's URL can read and write the
check-in data. That's a deliberate simplicity trade-off for a
private-between-friends app. Just don't post the URL somewhere public.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, loads the Supabase client and the app |
| `app.js` | All app logic: profiles, check-ins, streaks, weekly grid |
| `style.css` | Styling (mobile-first, dark theme) |
| `config.js` | Supabase URL + publishable API key |
| `supabase/setup.sql` | One-time database setup script |
| `.github/workflows/deploy.yml` | Auto-deploy to GitHub Pages on every push |
