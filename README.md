# Football Predictor

A small website that shows today's football matches with win/draw/loss
probabilities (based on recent form, home advantage, and head-to-head
history) and flags where the model thinks the bookmaker's odds might be
mispriced. Ships in **demo mode** with sample matches until you add a real
data API key — that part takes about 5 minutes.

**Read the full disclaimer in the site's footer before betting on anything
this produces.** It's a starting heuristic model, not a proven system.

---

## 1. Get an API-Football key — you'll need the Pro plan

This site pulls fixtures, form, head-to-head, and odds from **API-Football**.
Sign up at https://dashboard.api-football.com/register.

Fixture discovery scans every fixture worldwide for the day and keeps
whichever ones bookmakers have actually priced (see "How fixtures are
found" below) — that's roughly 150-200 requests per day. **The free tier
(100 requests/day, 10/minute) can't cover this**; you need the **Pro plan**
(7,500 requests/day, 5 requests/second), which is also what the code's rate
throttling in `lib/apiFootball.js` is tuned for.

(If you'd rather go through RapidAPI instead, that works too — see the notes
in `.env.example`.)

## 2. Add your key locally

In this folder, copy `.env.example` to a new file named `.env.local`, and
paste your real key in:

```
API_FOOTBALL_HOST=v3.football.api-sports.io
API_FOOTBALL_KEY=paste-your-real-key-here
```

`.env.local` is already git-ignored, so your key never gets committed or
shown to anyone else.

## 3. Run it locally to check it works

```
npm install
npm run dev
```

Open http://localhost:3000 — the first real (non-demo) load takes roughly a
minute, since it's scanning the whole day's worldwide fixture list and
paging through odds before settling on today's matches (see below). That's
expected, not a bug — normal usage doesn't hit this path live (step 5).

## How fixtures are found

There's no hand-picked list of leagues. Every fixture worldwide for the day
is fetched in one request, then only fixtures that bookmakers have actually
priced are kept — that alone filters out friendlies and most obscure/youth
leagues, since bookmakers don't bother pricing those. The remaining
fixtures are ranked by how many bookmakers price them (a proxy for how
mainstream the match is) and the top ones are fully processed, capped by
`MAX_FIXTURES_TO_PROCESS` in `lib/predictions.js`.

Odds availability isn't a perfect filter on its own — some bookmakers do
price reserve/youth leagues occasionally. `lib/leagues.js` holds a small,
manually-curated `EXCLUDED_LEAGUE_IDS` list as a backstop for exactly that;
add a league's id there if you spot one that shouldn't be showing up.

## 4. Make it live (deploy to Vercel — free, no card needed)

1. Push this folder to a new GitHub repository (Claude can walk you through
   this step by step if you're not familiar with git/GitHub).
2. Go to https://vercel.com and sign up (free — "Hobby" plan, GitHub login
   works).
3. Click **Add New Project**, pick the repo you just pushed.
4. Before deploying, add your environment variables under **Settings →
   Environment Variables**:
   - `API_FOOTBALL_HOST` = `v3.football.api-sports.io`
   - `API_FOOTBALL_KEY` = your real key
5. Click **Deploy**. A few minutes later you'll have a real URL
   (something like `football-predictor-yourname.vercel.app`).

## 5. Turn on the daily archive — needed for normal day-to-day use

Fixture discovery takes on the order of a minute, which is too slow to run
on every page load. In normal operation, a **daily cron job precomputes
that day's predictions once** and the live homepage just reads the result
— instant loads, and it's also what powers `/history`. Skipping this step
doesn't break the site, but every single page load will fall back to
computing everything live (~60+ seconds, and it doesn't cache between
requests), so it's worth doing:

1. In your Vercel project, go to **Storage → Create Database → Blob** and
   connect it to the project. Vercel automatically adds a
   `BLOB_READ_WRITE_TOKEN` environment variable for you — no manual copying
   needed.
2. Add a `CRON_SECRET` environment variable (any random string — e.g.
   generate one with `openssl rand -hex 32`). This stops anyone else from
   calling the archive endpoint and burning your API quota; Vercel
   automatically sends it back as a Bearer token when *it* triggers the cron.
3. Check **Project Settings → Functions → Fluid Compute** is enabled (it's
   the default on newer Vercel projects). The archive route needs up to 60
   seconds to run, well past Vercel Hobby's normal 10-second limit — Fluid
   Compute is what allows that on the free plan.
4. Redeploy. `vercel.json` already defines a daily cron job (00:20 UTC —
   just after UK midnight in both GMT and BST) that hits `/api/archive` and
   precomputes that day's predictions. It's scheduled early deliberately:
   the archive needs to exist for as much of the day as possible so normal
   daytime traffic gets the fast cached path, not just the last hour before
   rollover. The trade-off is that odds/injury data is locked in near the
   start of the day rather than closer to kickoff.
5. Vercel Hobby (free) plans support one daily cron job, which is exactly
   what this needs.

Want to test it immediately rather than waiting for the next cron run?
Visit `/api/archive?date=2026-07-31` yourself (swap in today's date) —
without `CRON_SECRET` set this works from a browser; with it set you'll need
to pass the header yourself, e.g.
`curl -H "Authorization: Bearer <secret>" https://your-site/api/archive`.

## How the model works (short version)

For each match: recent form (points per game, goals scored/conceded), home
advantage, and head-to-head record are combined into a win/draw/loss
probability. Where odds are available, those are compared against the
bookmaker's *implied* probability (with their margin stripped out) — a
"value" badge shows up only when the model's probability is meaningfully
higher than the market's, since matching the favorite isn't enough to make
money against a bookmaker long-run.

This is a transparent starting model (`lib/model.js`), not a finished
predictive system. Track its actual results over a few weeks before trusting
it with real stakes, and treat every number here as a probability, not a
promise.
