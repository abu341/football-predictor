import { TRACKED_LEAGUES, leagueLabel } from "./leagues";
import {
  getFixturesByDateAndLeague,
  getTeamForm,
  getH2H,
  getOddsForFixture,
  getInjuriesForFixture,
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
import { fetchEloRatingsForDate, lookupElo, eloDiffScaled } from "./clubElo";

// Free-tier API keys have small daily quotas. Each fixture we fully process
// costs ~5 requests (home form, away form, h2h, odds, injuries). This cap
// keeps a single page load from blowing through your day's quota. Raise it
// if you're on a paid plan.
const MAX_FIXTURES_TO_PROCESS = 15;

// Caps how much a handful of missing players can swing the prediction —
// this is a nudge, not the main signal.
const MAX_INJURY_SWING = 0.12;
const INJURY_WEIGHT_PER_PLAYER = 0.03;

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

function countInjuries(injuriesResponse, teamId) {
  if (!injuriesResponse) return 0;
  return injuriesResponse.filter((i) => i.team?.id === teamId).length;
}

export async function buildPredictionsForDate(date) {
  const results = [];

  // Fetched once for the whole run (ClubElo returns every club's rating for
  // a date in a single request) rather than per fixture. If this fails —
  // it's a free community project, not a guaranteed-uptime API — every
  // match just falls back to the form-based estimate instead of breaking.
  const eloMap = await fetchEloRatingsForDate(date).catch((err) => {
    console.error("ClubElo fetch failed, continuing without it:", err.message);
    return null;
  });

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
        const [homeFormRaw, awayFormRaw, h2hRaw, oddsRaw, injuriesRaw] = await Promise.all([
          getTeamForm(homeTeam.id, 12),
          getTeamForm(awayTeam.id, 12),
          getH2H(homeTeam.id, awayTeam.id, 10),
          getOddsForFixture(fixture.fixture.id).catch(() => null),
          getInjuriesForFixture(fixture.fixture.id).catch(() => null),
        ]);

        // Home form is judged from the team's OWN home games, away form from
        // the other team's OWN away games (falls back to all games if there
        // aren't enough venue-specific ones yet) — blending them together
        // hides a real home/away split that often matters a lot.
        const homeForm = summarizeForm(homeFormRaw, homeTeam.id, "home");
        const awayForm = summarizeForm(awayFormRaw, awayTeam.id, "away");
        const h2h = h2hEdge(h2hRaw, homeTeam.id, awayTeam.id);

        // Real, opponent-adjusted Elo ratings when both teams can be matched
        // by name in ClubElo's list — falls back to 0 (no effect) otherwise,
        // which just means the form-based estimate is used on its own like
        // before. Smaller/lower-profile clubs often won't match; that's fine.
        const homeElo = lookupElo(eloMap, homeTeam.name);
        const awayElo = lookupElo(eloMap, awayTeam.name);
        const eloDiff = eloDiffScaled(homeElo, awayElo);

        // Missing players nudge — capped so a couple of absences can't
        // dominate the read the way a real quality gap should.
        const homeInjuries = countInjuries(injuriesRaw, homeTeam.id);
        const awayInjuries = countInjuries(injuriesRaw, awayTeam.id);
        const injuryDiff = Math.max(
          -MAX_INJURY_SWING,
          Math.min(MAX_INJURY_SWING, (awayInjuries - homeInjuries) * INJURY_WEIGHT_PER_PLAYER)
        );

        const rawModelProbs = predictOutcome({ homeForm, awayForm, h2h, eloDiff, injuryDiff });
        const odds = oddsRaw ? extractMatchWinnerOdds(oddsRaw) : null;
        const impliedProbs = odds ? impliedProbsFromOdds(odds) : null;

        // Pull the model's read back toward the market's — the market is
        // usually sharper than a simple form-based heuristic, especially
        // for one-off cup/qualifier ties recent league form doesn't capture.
        const modelProbs = blendWithMarket(rawModelProbs, impliedProbs, 0.75);
        const value = impliedProbs ? findValue(modelProbs, impliedProbs) : null;

        const extraNotes = [];
        if (value?.tooLargeToTrust) {
          extraNotes.push(
            "Large gap vs. the market on this one — likely a data/model quirk, not real value. Worth a manual look before trusting it."
          );
        }
        if (homeInjuries + awayInjuries > 0) {
          extraNotes.push(
            `${homeTeam.name} missing ${homeInjuries}, ${awayTeam.name} missing ${awayInjuries} (injury/suspension).`
          );
        }
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
          notes: extraNotes.length > 0 ? extraNotes.join(" ") : null,
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
