export function pct(x) {
  return `${Math.round(x * 100)}%`;
}

export function MatchCard({ p }) {
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
