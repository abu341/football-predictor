// Prediction model. This is a transparent, explainable heuristic — NOT a
// black box. It's deliberately simple to start: form + goal record + home
// advantage + head-to-head, converted into win/draw/loss probabilities,
// then compared against bookmaker odds to look for value.
//
// It is a starting point, not a finished quant model. Track its real
// hit rate before trusting it with real money (see /methodology on the site).

const HOME_ADVANTAGE = 0.25; // goals-equivalent bump for the home side
const BASE_DRAW_RATE = 0.26; // long-run average draw rate in football

// --- Form summary -----------------------------------------------------

export function summarizeForm(fixtures, teamId) {
  if (!fixtures || fixtures.length === 0) {
    return { games: 0, ppg: 1.2, gfAvg: 1.2, gaAvg: 1.2, winRate: 0.33 };
  }

  let points = 0;
  let gf = 0;
  let ga = 0;
  let wins = 0;

  for (const f of fixtures) {
    const isHome = f.teams.home.id === teamId;
    const teamGoals = isHome ? f.goals.home : f.goals.away;
    const oppGoals = isHome ? f.goals.away : f.goals.home;
    if (teamGoals == null || oppGoals == null) continue;

    gf += teamGoals;
    ga += oppGoals;
    if (teamGoals > oppGoals) {
      points += 3;
      wins += 1;
    } else if (teamGoals === oppGoals) {
      points += 1;
    }
  }

  const games = fixtures.length;
  return {
    games,
    ppg: points / games,
    gfAvg: gf / games,
    gaAvg: ga / games,
    winRate: wins / games,
  };
}

// --- Head-to-head nudge -------------------------------------------------

export function h2hEdge(h2hFixtures, homeTeamId, awayTeamId) {
  if (!h2hFixtures || h2hFixtures.length === 0) return 0;

  let homeWins = 0;
  let awayWins = 0;
  for (const f of h2hFixtures) {
    const hg = f.goals.home;
    const ag = f.goals.away;
    if (hg == null || ag == null) continue;
    const homeWasHomeTeam = f.teams.home.id === homeTeamId;
    const homeTeamGoals = homeWasHomeTeam ? hg : ag;
    const awayTeamGoals = homeWasHomeTeam ? ag : hg;
    if (homeTeamGoals > awayTeamGoals) homeWins += 1;
    else if (awayTeamGoals > homeTeamGoals) awayWins += 1;
  }
  const total = homeWins + awayWins;
  if (total === 0) return 0;
  // Small nudge only, capped, so H2H can't dominate current form.
  return Math.max(-0.15, Math.min(0.15, (homeWins - awayWins) / total * 0.15));
}

// --- Core probability model ---------------------------------------------

function strengthDiff(home, away, h2h) {
  const formDiff = (home.ppg - away.ppg) / 3; // normalize to roughly [-1, 1]
  const goalDiff = (home.gfAvg - home.gaAvg) - (away.gfAvg - away.gaAvg);
  return formDiff * 0.6 + goalDiff * 0.4 + HOME_ADVANTAGE * 0.3 + h2h;
}

function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

export function predictOutcome({ homeForm, awayForm, h2h = 0 }) {
  const diff = strengthDiff(homeForm, awayForm, h2h);

  // Base "home doesn't lose" style win expectancy from the strength diff.
  const homeWinExpectancy = logistic(diff * 2.2);

  // Draw probability shrinks as the mismatch grows (blowouts draw less).
  const mismatch = Math.abs(homeWinExpectancy - 0.5) * 2; // 0 (even) .. 1 (lopsided)
  const drawProb = BASE_DRAW_RATE * (1 - 0.6 * mismatch);

  const remaining = 1 - drawProb;
  const homeProb = homeWinExpectancy * remaining;
  const awayProb = (1 - homeWinExpectancy) * remaining;

  return {
    home: round(homeProb),
    draw: round(drawProb),
    away: round(awayProb),
  };
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}

// --- Odds comparison / value detection -----------------------------------

export function impliedProbsFromOdds({ home, draw, away }) {
  const rawHome = 1 / home;
  const rawDraw = 1 / draw;
  const rawAway = 1 / away;
  const overround = rawHome + rawDraw + rawAway; // >1 due to bookmaker margin
  return {
    home: round(rawHome / overround),
    draw: round(rawDraw / overround),
    away: round(rawAway / overround),
    overround: round(overround),
  };
}

export function findValue(modelProbs, impliedProbs, threshold = 0.05) {
  const edges = {
    home: round(modelProbs.home - impliedProbs.home),
    draw: round(modelProbs.draw - impliedProbs.draw),
    away: round(modelProbs.away - impliedProbs.away),
  };
  const best = Object.entries(edges).sort((a, b) => b[1] - a[1])[0];
  return {
    edges,
    hasValue: best[1] >= threshold,
    bestSide: best[0],
    bestEdge: best[1],
  };
}

export function confidenceLabel(modelProbs) {
  const top = Math.max(modelProbs.home, modelProbs.draw, modelProbs.away);
  if (top >= 0.55) return "High";
  if (top >= 0.42) return "Medium";
  return "Low";
}
