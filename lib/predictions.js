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
import {
  expectedGoals,
  overUnderProb,
  bttsProb,
  extractOverUnderOdds,
  extractBttsOdds,
  impliedOverUnder,
  impliedBtts,
  findTwoWayValue,
} from "./goalsModel";

// Each fixture we fully process costs ~5 requests (home form, away form,
// h2h, odds, injuries). This cap keeps a single page load from blowing
// through your day's quota. Raised to 25 now that more leagues are tracked
// and the account is on the Pro plan (7,500 requests/day).
const MAX_FIXTURES_TO_PROCESS = 25;

// Caps how much a handful of missing players can swing the prediction —
// this is a nudge, not the main signal.
const MAX_INJURY_SWING = 0.12;
const INJURY_WEIGHT_PER_PLAYER = 0.03;

// Some competitions' injury data isn't cleanly scoped to a single fixture
// and can return an implausibly long list (a whole squad's injury history
// rather than just this match's absentees). Cap the count so a data quirk
// doesn't make the note say something like "missing 14 players".
const MAX_PLAUSIBLE_INJURIES = 6;

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

// Raw (uncapped) count — used to judge whether this fixture's injury data
// looks trustworthy at all, before any capping happens.
function rawInjuryCount(injuriesResponse, teamId) {
  if (!injuriesResponse) return 0;
  return injuriesResponse.filter((i) => i.team?.id === teamId).length;
}

// Capped count — used only for the small prediction nudge, so a data quirk
// can never swing the model by more than a couple of players' worth.
function cappedInjuryCount(rawCount) {
  return Math.min(rawCount, MAX_PLAUSIBLE_INJURIES);
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
        const homeInjuriesRaw = rawInjuryCount(injuriesRaw, homeTeam.id);
        const awayInjuriesRaw = rawInjuryCount(injuriesRaw, awayTeam.id);
        const homeInjuries = cappedInjuryCount(homeInjuriesRaw);
        const awayInjuries = cappedInjuryCount(awayInjuriesRaw);
        const injuryDiff = Math.max(
          -MAX_INJURY_SWING,
          Math.min(MAX_INJURY_SWING, (awayInjuries - homeInjuries) * INJURY_WEIGHT_PER_PLAYER)
        );
        // If either side's raw count is above the plausible cap, this
        // fixture's injury data likely isn't properly scoped to just this
        // match (a known API-Football quirk for some competitions) — too
        // unreliable to show as a real number, so the note below is skipped
        // for this match rather than displaying a misleading capped figure.
        const injuryDataTrustworthy =
          homeInjuriesRaw <= MAX_PLAUSIBLE_INJURIES && awayInjuriesRaw <= MAX_PLAUSIBLE_INJURIES;

        const rawModelProbs = predictOutcome({ homeForm, awayForm, h2h, eloDiff, injuryDiff });
        const odds = oddsRaw ? extractMatchWinnerOdds(oddsRaw) : null;
        const impliedProbs = odds ? impliedProbsFromOdds(odds) : null;

        // Pull the model's read back toward the market's — the market is
        // usually sharper than a simple form-based heuristic, especially
        // for one-off cup/qualifier ties recent league form doesn't capture.
        const modelProbs = blendWithMarket(rawModelProbs, impliedProbs, 0.75);
        const value = impliedProbs ? findValue(modelProbs, impliedProbs) : null;

        // --- Goals markets: Over/Under 2.5 and Both Teams to Score ---
        // Reuses the same home/away form already computed above — no extra
        // API calls needed for the model side of this.
        const { xgHome, xgAway } = expectedGoals(homeForm, awayForm);
        const goalsProb = overUnderProb(xgHome, xgAway, 2.5);
        const bttsProbability = bttsProb(xgHome, xgAway);

        const overUnderOdds = oddsRaw ? extractOverUnderOdds(oddsRaw, "2.5") : null;
        const bttsOdds = oddsRaw ? extractBttsOdds(oddsRaw) : null;
        const overUnderImplied = impliedOverUnder(overUnderOdds);
        const bttsImplied = impliedBtts(bttsOdds);

        const overValue = overUnderImplied
          ? findTwoWayValue(goalsProb.over, overUnderImplied.over)
          : null;
        const bttsValue = bttsImplied
          ? findTwoWayValue(bttsProbability.yes, bttsImplied.yes)
          : null;

        const extraNotes = [];
        if (value?.tooLargeToTrust) {
          extraNotes.push(
            "Large gap vs. the market on this one — likely a data/model quirk, not real value. Worth a manual look before trusting it."
          );
        }
        if (injuryDataTrustworthy && homeInjuries + awayInjuries > 0) {
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
          goals: {
            xgHome,
            xgAway,
            over25: goalsProb.over,
            under25: goalsProb.under,
            bttsYes: bttsProbability.yes,
            bttsNo: bttsProbability.no,
            overUnderOdds,
            bttsOdds,
            overValue,
            bttsValue,
          },
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
