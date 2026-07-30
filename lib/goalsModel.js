// Goals-based markets: Over/Under total goals and Both Teams to Score.
// Uses a Poisson goal model — a well-established, simple way to turn each
// team's own average goals scored/conceded into a probability distribution
// over how many goals a match produces. It reuses the same home/away form
// numbers already computed for the match-winner prediction, so it needs no
// extra data-fetching.
//
// Simplification worth being upfront about: this treats home and away goals
// as independent of each other, which isn't perfectly true in a real match
// (a team leading tends to sit back, changing the away team's own scoring
// chances) but is a standard, reasonable starting approximation.

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}

// Expected goals for each side: blends the attacking team's own scoring
// rate with the opponent's own conceding rate, with a floor so a team with
// almost no data doesn't get an unrealistic near-zero expectation.
export function expectedGoals(homeForm, awayForm) {
  const xgHome = Math.max(0.3, (homeForm.gfAvg + awayForm.gaAvg) / 2);
  const xgAway = Math.max(0.3, (awayForm.gfAvg + homeForm.gaAvg) / 2);
  return { xgHome: round(xgHome), xgAway: round(xgAway) };
}

// Sum of two independent Poisson variables is itself Poisson with the
// combined rate — that's what makes this an easy calculation.
export function overUnderProb(xgHome, xgAway, line = 2.5) {
  const combined = xgHome + xgAway;
  const maxWholeGoals = Math.floor(line); // e.g. line 2.5 -> covers 0,1,2
  let underOrEqual = 0;
  for (let k = 0; k <= maxWholeGoals; k++) {
    underOrEqual += poissonPmf(k, combined);
  }
  return {
    under: round(underOrEqual),
    over: round(1 - underOrEqual),
  };
}

export function bttsProb(xgHome, xgAway) {
  const homeScores = 1 - poissonPmf(0, xgHome);
  const awayScores = 1 - poissonPmf(0, xgAway);
  const yes = homeScores * awayScores;
  return {
    yes: round(yes),
    no: round(1 - yes),
  };
}

// Same idea as the match-winner value check, but for a plain two-way market
// (Over/Under, BTTS Yes/No) instead of three-way.
export function findTwoWayValue(modelProb, impliedProb, minThreshold = 0.05, maxPlausible = 0.15) {
  const edge = round(modelProb - impliedProb);
  return {
    edge,
    hasValue: edge >= minThreshold && edge <= maxPlausible,
    tooLargeToTrust: edge > maxPlausible,
  };
}

// Pulls "Over 2.5 / Under 2.5" odds out of the same odds response already
// fetched for the match-winner market — no extra API request needed.
// API-Football's bet name for this varies slightly by competition; a couple
// of common variants are tried.
export function extractOverUnderOdds(oddsResponse, line = "2.5") {
  try {
    const bookmakers = oddsResponse?.[0]?.bookmakers || [];
    for (const bm of bookmakers) {
      const bet = bm.bets.find(
        (b) => b.name === "Goals Over/Under" || b.name === "Over/Under"
      );
      if (bet) {
        const over = bet.values.find((v) => v.value === `Over ${line}`);
        const under = bet.values.find((v) => v.value === `Under ${line}`);
        if (over && under) {
          return { over: parseFloat(over.odd), under: parseFloat(under.odd) };
        }
      }
    }
  } catch {
    // fall through
  }
  return null;
}

export function extractBttsOdds(oddsResponse) {
  try {
    const bookmakers = oddsResponse?.[0]?.bookmakers || [];
    for (const bm of bookmakers) {
      const bet = bm.bets.find(
        (b) => b.name === "Both Teams Score" || b.name === "Both Teams To Score"
      );
      if (bet) {
        const yes = bet.values.find((v) => v.value === "Yes");
        const no = bet.values.find((v) => v.value === "No");
        if (yes && no) {
          return { yes: parseFloat(yes.odd), no: parseFloat(no.odd) };
        }
      }
    }
  } catch {
    // fall through
  }
  return null;
}

function impliedTwoWay(oddsA, oddsB) {
  const rawA = 1 / oddsA;
  const rawB = 1 / oddsB;
  const overround = rawA + rawB;
  return { a: round(rawA / overround), b: round(rawB / overround) };
}

export function impliedOverUnder(odds) {
  if (!odds) return null;
  const { a, b } = impliedTwoWay(odds.over, odds.under);
  return { over: a, under: b };
}

export function impliedBtts(odds) {
  if (!odds) return null;
  const { a, b } = impliedTwoWay(odds.yes, odds.no);
  return { yes: a, no: b };
}
