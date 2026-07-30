# Football Predictor

A small website that shows today's football matches with win/draw/loss
probabilities (based on recent form, home advantage, and head-to-head
history) and flags where the model thinks the bookmaker's odds might be
mispriced. Ships in **demo mode** with sample matches until you add a real
data API key — that part takes about 5 minutes.

**Read the full disclaimer in the site's footer before betting on anything
this produces.** It's a starting heuristic model, not a proven system.

---

## 1. Get a free data API key (~5 minutes)

This site pulls fixtures, form, head-to-head, and odds from **API-Football**.

1. Go to https://dashboard.api-football.com/register and create a free account
   (email + password, no card required for the free tier).
2. After confirming your email, go to your dashboard — you'll see your API key
   right there.
3. The free tier gives you 100 requests/day, which is enough for a handful of
   matches a day (this site is capped at 15 fixtures per load to stay within
   that).

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

Open http://localhost:3000 — you should see today's real fixtures instead of
the demo banner (on days with matches in one of the tracked leagues; see
`lib/leagues.js` to add/remove leagues).

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
   (something like `football-predictor-yourname.vercel.app`) that you can
   open on your phone any day and reload for that day's picks.

The page re-fetches fresh data at most once an hour, so reloading during the
same hour won't waste your API quota — reload the next hour (or next day)
for updated picks.

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
