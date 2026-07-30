// Prediction model. This is a transparent, explainable heuristic — NOT a
// black box. It's deliberately simple to start: form + goal record + home
// advantage + head-to-head, converted into win/draw/loss probabilities,
// then blended with the bookmaker's own implied probability (the market is
// usually sharper than a simple form-based model), and finally compared
// against the raw odds to look for value.
//
// It is a starting point, not a finished quant model. Track its real
// hit rate before trusting it with real money (see /methodology on the site).

const HOME_ADVANTAGE = 0.25; // goals-equivalent bump for the home side
const BASE_DRAW_RATE = 0.26; // long-run average draw rate in football
const MIN_VENUE_SAMPLE = 3; // need at least this many home/away-only games
                            // before trusting a venue-specific form read

// --- Form summary -----------------------------------------------------

// venue: "home" | "away" | undefined. When set, only fixtures where the
// team played that side count — a team's home form and away form can be
// very different, and blending them together hides that. Falls back to
// using every fixture if there aren't enough venue-specific games yet.
export function summarizeForm(fixtures, teamId, venue) {
  const all = fixtures || [];
  const venueFiltered = venue
    ? all.filter((f) =>
        venue === "home" ? f.teams.home.id === teamId : f.teams.away.id === teamId
      )
    : all;

  const usable = venueFiltered.length >= MIN_VENUE_SAMPLE ? venueFiltered : all;

  if (usable.length === 0) {
    return { games: 0, ppg: 1.2, gfAvg: 1.2, gaAvg: 1.2, winRate: 0.33 };
  }

  let points = 0;
  let gf = 0;
  let ga = 0;
  let wins = 0;
  let counted = 0;

  for (const f of usable) {
    const isHome = f.teams.home.id === teamId;
    const teamGoals = isHome ? f.goals.home : f.goals.away;
    const oppGoals = isHome ? f.goals.away : f.goals.home;
    if (teamGoals == null || oppGoals == null) continue;

    counted += 1;
    gf += teamGoals;
    ga += oppGoals;
    if (teamGoals > oppGoals) {
      points += 3;
      wins += 1;
    } else if (teamGoals === oppGoals) {
      points += 1;
    }
  }

  if (counted === 0) {
    return { games: 0, ppg: 1.2, gfAvg: 1.2, gaAvg: 1.2, winRate: 0.33 };
  }

  return {
    games: counted,
    ppg: points / counted,
    gfAvg: gf / counted,
    gaAvg: ga / counted,
    winRate: wins / counted,
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

// eloDiff: real, opponent-adjusted club Elo rating gap (scaled to roughly
// the same range as the form numbers). When available it's given much more
// weight than raw recent-form stats, since Elo already accounts for the
// quality of opposition a team has faced — the thing plain form ignores.
// injuryDiff: small nudge for key absences (positive favors home).
function strengthDiff(home, away, h2h, eloDiff = 0, injuryDiff = 0) {
  const formDiff = (home.ppg - away.ppg) / 3; // normalize to roughly [-1, 1]
  const goalDiff = (home.gfAvg - home.gaAvg) - (away.gfAvg - away.gaAvg);
  const formComponent = formDiff * 0.6 + goalDiff * 0.4;
  const skillComponent = eloDiff !== 0 ? formComponent * 0.35 + eloDiff * 0.65 : formComponent;
  return skillComponent + HOME_ADVANTAGE * 0.3 + h2h + injuryDiff;
}

function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

export function predictOutcome({ homeForm, awayForm, h2h = 0, eloDiff = 0, injuryDiff = 0 }) {
  const diff = strengthDiff(homeForm, awayForm, h2h, eloDiff, injuryDiff);

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

// Blend the model's own read with the bookmaker's implied probability.
// The market is, on average, sharper than a simple form-based heuristic —
// this pulls wild disagreements back toward reality instead of trusting
// the model at face value. marketWeight of 0.55 means the market counts
// for slightly more than the model when they disagree.
export function blendWithMarket(modelProbs, impliedProbs, marketWeight = 0.55) {
  if (!impliedProbs) return modelProbs;
  const w = marketWeight;
  const blended = {
    home: modelProbs.home * (1 - w) + impliedProbs.home * w,
    draw: modelProbs.draw * (1 - w) + impliedProbs.draw * w,
    away: modelProbs.away * (1 - w) + impliedProbs.away * w,
  };
  const total = blended.home + blended.draw + blended.away;
  return {
    home: round(blended.home / total),
    draw: round(blended.draw / total),
    away: round(blended.away / total),
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

// minThreshold / maxPlausible: real value in an efficiently-priced 3-way
// football market is usually a handful of percentage points. An "edge"
// bigger than maxPlausible is much more likely a modeling error than a
// genuine mispricing, so it's flagged separately instead of shown as a
// confident value bet.
export function findValue(modelProbs, impliedProbs, minThreshold = 0.05, maxPlausible = 0.15) {
  const edges = {
    home: round(modelProbs.home - impliedProbs.home),
    draw: round(modelProbs.draw - impliedProbs.draw),
    away: round(modelProbs.away - impliedProbs.away),
  };
  const best = Object.entries(edges).sort((a, b) => b[1] - a[1])[0];
  const bestEdge = best[1];
  return {
    edges,
    hasValue: bestEdge >= minThreshold && bestEdge <= maxPlausible,
    tooLargeToTrust: bestEdge > maxPlausible,
    bestSide: best[0],
    bestEdge,
  };
}

export function confidenceLabel(modelProbs) {
  const top = Math.max(modelProbs.home, modelProbs.draw, modelProbs.away);
  if (top >= 0.55) return "High";
  if (top >= 0.42) return "Medium";
  return "Low";
}
