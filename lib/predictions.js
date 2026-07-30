import { TRACKED_LEAGUES, leagueLabel } from "./leagues";
import {
  getFixturesByDateAndLeague,
  getTeamForm,
  getH2H,
  getOddsForFixture,
} from "./apiFootball";
import {
  summarizeForm,
  h2hEdge,
  predictOutcome,
  blendWithMarket,
  impliedProbsFromOdds,
  findValue,
  confidenceLabel,
} from "./model";

// Free-tier API keys have small daily quotas. Each fixture we fully process
// costs ~4 requests (home form, away form, h2h, odds). This cap keeps a
// single page load from blowing through your day's quota. Raise it if
// you're on a paid plan.
const MAX_FIXTURES_TO_PROCESS = 15;

function extractMatchWinnerOdds(oddsResponse) {
  try {
    const bookmakers = oddsResponse[0]?.bookmakers || [];
    for (const bm of bookmakers) {
      const bet = bm.bets.find((b) => b.name === "Match Winner");
      if (bet) {
        const home = bet.values.find((v) => v.value === "Home");
        const draw = bet.values.find((v) => v.value === "Draw");
        const away = bet.values.find((v) => v.value === "Away");
        if (home && draw && away) {
          return {
            home: parseFloat(home.odd),
            draw: parseFloat(draw.odd),
            away: parseFloat(away.odd),
          };
        }
      }
    }
  } catch {
    // fall through
  }
  return null;
}

export async function buildPredictionsForDate(date) {
  const results = [];

  for (const league of TRACKED_LEAGUES) {
    if (results.length >= MAX_FIXTURES_TO_PROCESS) break;

    let fixtures;
    try {
      fixtures = await getFixturesByDateAndLeague(date, league.id);
    } catch (err) {
      console.error(`Failed fixtures for league ${league.id}:`, err.message);
      continue;
    }
    if (!fixtures || fixtures.length === 0) continue;

    for (const fixture of fixtures) {
      if (results.length >= MAX_FIXTURES_TO_PROCESS) break;

      const homeTeam = fixture.teams.home;
      const awayTeam = fixture.teams.away;

      try {
        const [homeFormRaw, awayFormRaw, h2hRaw, oddsRaw] = await Promise.all([
          getTeamForm(homeTeam.id, 12),
          getTeamForm(awayTeam.id, 12),
          getH2H(homeTeam.id, awayTeam.id, 10),
          getOddsForFixture(fixture.fixture.id).catch(() => null),
        ]);

        // Home form is judged from the team's OWN home games, away form from
        // the other team's OWN away games (falls back to all games if there
        // aren't enough venue-specific ones yet) — blending them together
        // hides a real home/away split that often matters a lot.
        const homeForm = summarizeForm(homeFormRaw, homeTeam.id, "home");
        const awayForm = summarizeForm(awayFormRaw, awayTeam.id, "away");
        const h2h = h2hEdge(h2hRaw, homeTeam.id, awayTeam.id);

        const rawModelProbs = predictOutcome({ homeForm, awayForm, h2h });
        const odds = oddsRaw ? extractMatchWinnerOdds(oddsRaw) : null;
        const impliedProbs = odds ? impliedProbsFromOdds(odds) : null;

        // Pull the model's read back toward the market's — the market is
        // usually sharper than a simple form-based heuristic, especially
        // for one-off cup/qualifier ties recent league form doesn't capture.
        const modelProbs = blendWithMarket(rawModelProbs, impliedProbs);
        const value = impliedProbs ? findValue(modelProbs, impliedProbs) : null;

        results.push({
          fixtureId: fixture.fixture.id,
          league: leagueLabel(league.id),
          kickoff: new Date(fixture.fixture.date).toLocaleString("en-GB", {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
          homeTeam: homeTeam.name,
          awayTeam: awayTeam.name,
          modelProbs,
          impliedProbs,
          odds,
          value,
          confidence: confidenceLabel(modelProbs),
          notes: value?.tooLargeToTrust
            ? "Large gap vs. the market on this one — likely a data/model quirk, not real value. Worth a manual look before trusting it."
            : null,
        });
      } catch (err) {
        console.error(
          `Failed processing fixture ${fixture.fixture.id}:`,
          err.message
        );
      }
    }
  }

  // Highest-confidence / clearest-value picks first.
  results.sort((a, b) => {
    const aEdge = a.value?.bestEdge ?? 0;
    const bEdge = b.value?.bestEdge ?? 0;
    return bEdge - aEdge;
  });

  return results;
}
