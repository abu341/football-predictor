import Link from "next/link";
import { hasApiKey } from "../lib/apiFootball";
import { buildPredictionsForDate } from "../lib/predictions";
import { DEMO_PREDICTIONS } from "../lib/demoData";
import { todayInUK } from "../lib/date";
import { MatchCard } from "../components/MatchCard";
import { getArchivedPredictions, hasBlobStore } from "../lib/history";

// Re-run this page's data fetch at most once an hour on reload, instead of
// on every single request — keeps API usage sane on a free-tier key.
export const revalidate = 3600;

// Fixture discovery (lib/predictions.js) now scans every fixture worldwide
// and filters by real bookmaker odds, which takes on the order of a minute
// throttled under API-Football's rate limit — too slow for a normal page
// render. The daily cron (app/api/archive/route.js) precomputes it once and
// this page just reads that archive. maxDuration here only matters for the
// live-compute fallback below (no archive yet — first deploy, or Blob not
// connected); matches the archive route's 300s ceiling (Vercel Hobby's max
// with Fluid Compute) for the same reason — 60s wasn't enough in practice.
export const maxDuration = 300;

export default async function Home() {
  const today = todayInUK();
  const demoMode = !hasApiKey;

  let predictions = [];
  let loadError = null;

  if (demoMode) {
    predictions = DEMO_PREDICTIONS;
  } else {
    try {
      const archived = hasBlobStore ? await getArchivedPredictions(today) : null;
      // No archive yet for today (cron hasn't run since midnight, or Blob
      // isn't connected) — fall back to computing live so the page still
      // works, just slower than usual for this one load.
      predictions = archived ? archived.predictions : await buildPredictionsForDate(today);
    } catch (err) {
      loadError = err.message;
    }
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>Today&apos;s Football Predictions</h1>
        <nav className="nav">
          <Link href="/history">History</Link>
          <span className="date">{today}</span>
        </nav>
      </header>

      {demoMode && (
        <div className="banner">
          Demo mode — showing sample matches. Add your API_FOOTBALL_KEY in
          .env.local (see .env.example) to see live predictions for today&apos;s
          real fixtures.
        </div>
      )}

      {loadError && (
        <div className="banner">
          Couldn&apos;t load live data: {loadError}
        </div>
      )}

      {!demoMode && !loadError && predictions.length === 0 && (
        <div className="empty">No fixtures with bookmaker odds found for today.</div>
      )}

      <div className="grid">
        {predictions.map((p) => (
          <MatchCard key={p.fixtureId} p={p} />
        ))}
      </div>

      <footer className="methodology">
        <h2>How this works</h2>
        <p>
          Each match is scored from recent form (points per game, goals for/against),
          real Elo club ratings when available, home advantage, head-to-head history,
          and reported injuries/suspensions, converted into win/draw/loss
          probabilities. Where odds are available, those probabilities are compared
          against the bookmaker&apos;s implied probability (with their margin removed)
          — a &quot;value&quot; badge means the model thinks a side is more likely
          than the market price suggests, which is the only kind of edge that
          matters long-run. Expected goals, Over/Under 2.5, and Both Teams to Score
          come from a simple Poisson goal model using each team&apos;s own scoring
          and conceding record. This is a heuristic model, not a guarantee: track its
          real hit rate over time before sizing any bet on it, and treat every
          confidence label as a probability, not a certainty.
        </p>
      </footer>
    </div>
  );
}
