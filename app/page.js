import { hasApiKey } from "../lib/apiFootball";
import { buildPredictionsForDate, debugLeagueCoverage } from "../lib/predictions";
import { DEMO_PREDICTIONS } from "../lib/demoData";

// Re-run this page's data fetch at most once an hour on reload, instead of
// on every single request — keeps API usage sane on a free-tier key.
export const revalidate = 3600;

// "Today" is calculated in UK time, not the server's UTC clock. Without
// this, the site can show yesterday's fixtures for a few hours around
// midnight — the server's UTC date rolls over later than the UK's local
// date does (UK is UTC+0 or UTC+1 depending on the time of year), so a
// plain new Date() reflects the wrong day during that gap.
function todayInUK() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

function MatchCard({ p }) {
  const best = p.modelProbs
    ? Object.entries(p.modelProbs).sort((a, b) => b[1] - a[1])[0]
    : null;
  const sideLabel = { home: p.homeTeam, draw: "Draw", away: p.awayTeam };
  const g = p.goals;

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

      {g && (
        <div className="goals-block">
          <div className="goals-row">
            <span>Expected goals: {p.homeTeam} {g.xgHome} – {g.xgAway} {p.awayTeam}</span>
          </div>
          <div className="goals-row">
            <span>Over 2.5 goals: <b>{pct(g.over25)}</b> (Under {pct(g.under25)})</span>
            {g.overValue?.hasValue && (
              <span className="badge value small">Value: Over 2.5 (+{pct(g.overValue.edge)})</span>
            )}
          </div>
          <div className="goals-row">
            <span>Both teams to score: <b>{pct(g.bttsYes)}</b> (No {pct(g.bttsNo)})</span>
            {g.bttsValue?.hasValue && (
              <span className="badge value small">Value: BTTS Yes (+{pct(g.bttsValue.edge)})</span>
            )}
          </div>
          {g.overUnderOdds && (
            <div className="odds-line">
              O/U 2.5 odds — Over {g.overUnderOdds.over} · Under {g.overUnderOdds.under}
            </div>
          )}
          {g.bttsOdds && (
            <div className="odds-line">
              BTTS odds — Yes {g.bttsOdds.yes} · No {g.bttsOdds.no}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default async function Home() {
  const today = todayInUK();
  const demoMode = !hasApiKey;

  let predictions = [];
  let loadError = null;
  let leagueDebug = [];

  if (demoMode) {
    predictions = DEMO_PREDICTIONS;
  } else {
    try {
      predictions = await buildPredictionsForDate(today);
    } catch (err) {
      loadError = err.message;
    }
    leagueDebug = await debugLeagueCoverage(today).catch(() => []);
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

      {leagueDebug.length > 0 && (
        <div className="debug-panel">
          <h3>Debug: league coverage for {today}</h3>
          <p>Temporary — shows why some leagues aren&apos;t appearing above. Remove once done diagnosing.</p>
          <table>
            <thead>
              <tr>
                <th>League</th>
                <th>ID</th>
                <th>Fixtures found</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {leagueDebug.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{row.id}</td>
                  <td>{row.count}</td>
                  <td>{row.error || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
