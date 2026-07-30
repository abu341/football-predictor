// Thin wrapper around API-Football (v3). Works whether you signed up
// directly at api-football.com or via the RapidAPI marketplace — see
// .env.example for which host/key combo to use.

const HOST = process.env.API_FOOTBALL_HOST || "v3.football.api-sports.io";
const KEY = process.env.API_FOOTBALL_KEY;

export const hasApiKey = Boolean(KEY);

function headersFor(host) {
  if (host.includes("rapidapi.com")) {
    return {
      "x-rapidapi-host": host,
      "x-rapidapi-key": KEY,
    };
  }
  // Direct api-sports.io hosting uses a single header.
  return {
    "x-apisports-key": KEY,
  };
}

async function callApi(path, params = {}) {
  if (!KEY) {
    throw new Error(
      "API_FOOTBALL_KEY is not set. Add it to .env.local (see .env.example)."
    );
  }
  const qs = new URLSearchParams(params).toString();
  const url = `https://${HOST}${path}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: headersFor(HOST),
    // Cache fixtures/odds for an hour so a page reload doesn't burn a fresh
    // API call every single time — free-tier quotas are small.
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`API-Football request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`);
  }
  return json.response;
}

export function getFixturesByDateAndLeague(date, leagueId) {
  const season = new Date(date).getMonth() >= 6 // Jul+ = new season year
    ? new Date(date).getFullYear()
    : new Date(date).getFullYear() - 1;
  return callApi("/fixtures", { date, league: leagueId, season });
}

export function getTeamForm(teamId, last = 8) {
  return callApi("/fixtures", { team: teamId, last });
}

export function getH2H(teamAId, teamBId, last = 10) {
  return callApi("/fixtures/headtohead", { h2h: `${teamAId}-${teamBId}`, last });
}

export function getOddsForFixture(fixtureId) {
  return callApi("/odds", { fixture: fixtureId });
}

export function getInjuriesForFixture(fixtureId) {
  return callApi("/injuries", { fixture: fixtureId });
}
