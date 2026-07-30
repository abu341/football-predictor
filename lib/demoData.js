// Sample data shown when no API key is configured yet, so the site renders
// something sensible out of the box instead of a blank page. Clearly
// labeled as demo in the UI (see app/page.js). Shape matches exactly what
// the real pipeline (lib/predictions.js) produces from live API data.

export const DEMO_PREDICTIONS = [
  {
    fixtureId: "demo-1",
    league: "Premier League (England)",
    kickoff: "Sat 15:00",
    homeTeam: "Riverside FC",
    awayTeam: "Harbor City",
    modelProbs: { home: 0.58, draw: 0.24, away: 0.18 },
    impliedProbs: { home: 0.5, draw: 0.27, away: 0.23 },
    odds: { home: 1.85, draw: 3.4, away: 3.9 },
    value: { hasValue: true, bestSide: "home", bestEdge: 0.08 },
    confidence: "High",
    notes: "Strong recent form gap plus home advantage; model sees more edge than the market price.",
  },
  {
    fixtureId: "demo-2",
    league: "La Liga (Spain)",
    kickoff: "Sat 18:30",
    homeTeam: "Costa Real",
    awayTeam: "Union Norte",
    modelProbs: { home: 0.4, draw: 0.29, away: 0.31 },
    impliedProbs: { home: 0.42, draw: 0.28, away: 0.3 },
    odds: { home: 2.3, draw: 3.35, away: 3.1 },
    value: { hasValue: false, bestSide: "away", bestEdge: 0.01 },
    confidence: "Medium",
    notes: "Close on paper, model roughly agrees with market — no real edge here.",
  },
  {
    fixtureId: "demo-3",
    league: "MLS (USA)",
    kickoff: "Sun 20:00",
    homeTeam: "Lakeside SC",
    awayTeam: "Metro United",
    modelProbs: { home: 0.34, draw: 0.32, away: 0.34 },
    impliedProbs: { home: 0.36, draw: 0.29, away: 0.35 },
    odds: { home: 2.6, draw: 3.3, away: 2.75 },
    value: { hasValue: false, bestSide: "draw", bestEdge: 0.03 },
    confidence: "Low",
    notes: "Genuine coin flip — low confidence, size down or skip.",
  },
];
