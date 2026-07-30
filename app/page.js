import { hasApiKey } from "../lib/apiFootball";
import { buildPredictionsForDate } from "../lib/predictions";
import { DEMO_PREDICTIONS } from "../lib/demoData";

// Re-run this page's data fetch at most once an hour on reload, instead of
// on every single request — keeps API usage sane on a free-tier key.
export const revalidate = 3600;

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

function MatchCard({ p }) {
  const best = p.modelProbs
    ? Object.entries(p.modelProbs).sort((a, b) => b[1] - a[1])[0]
    : null;
  const sideLabel = { home: p.homeTeam, draw: "Draw", away: p.awayTeam };

  return (
    <div className="card">
      <div className="row1">
        <span className="league">{p.league}</span>
        <span className="kickoff">{p.kickoff}</span>
      </div>
      <div className="matchup">
        {p.homeTeam} vs {p.awayTeam}
      </div>

      <div className="probs">
        <div className="p">
          <div className="label">{p.homeTeam}</div>
          <div className="val">{pct(p.modelProbs.home)}</div>
        </div>
        <div className="p">
          <div className="label">Draw</div>
          <div className="val">{pct(p.modelProbs.draw)}</div>
        </div>
        <div className="p">
          <div className="label">{p.awayTeam}</div>
          <div className="val">{pct(p.modelProbs.away)}</div>
        </div>
      </div>

      <div className="badges">
        <span
          className={`badge ${p.confidence.toLowerCase()}`}
        >
          {p.confidence} confidence
        </span>
        {p.value?.hasValue && (
          <span className="badge value">
            Value: {sideLabel[p.value.bestSide]} (+{pct(p.value.bestEdge)} edge)
          </span>
        )}
        {best && (
          <span className="badge medium">Lean: {sideLabel[best[0]]}</span>
        )}
      </div>

      {p.notes && <div className="notes">{p.notes}</div>}

      {p.odds && (
        <div className="odds-line">
          Odds — {p.homeTeam} {p.odds.home} · Draw {p.odds.draw} · {p.awayTeam} {p.odds.away}
        </div>
      )}
    </div>
  );
}

export default async function Home() {
  const today = new Date().toISOString().slice(0, 10);
  const demoMode = !hasApiKey;

  let predictions = [];
  let loadError = null;

  if (demoMode) {
    predictions = DEMO_PREDICTIONS;
  } else {
    try {
      predictions = await buildPredictionsForDate(today);
    } catch (err) {
      loadError = err.message;
    }
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>Today&apos;s Football Predictions</h1>
        <span className="date">{today}</span>
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
        <div className="empty">No tracked-league fixtures found for today.</div>
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
          home advantage, and head-to-head history, converted into win/draw/loss
          probabilities. Where odds are available, those probabilities are compared
          against the bookmaker&apos;s implied probability (with their margin removed)
          — a &quot;value&quot; badge means the model thinks a side is more likely
          than the market price suggests, which is the only kind of edge that
          matters long-run. This is a heuristic model, not a guarantee: track its
          real hit rate over time before sizing any bet on it, and treat every
          confidence label as a probability, not a certainty.
        </p>
      </footer>
    </div>
  );
}
