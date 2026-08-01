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

// API-Football's Pro plan hard-caps requests at 5/second — confirmed live
// (a burst of ~20 requests tripped it, and every subsequent call failed for
// the rest of that run, so it's not a soft/averaged limit). This app can
// otherwise burst well past that: paging through /odds for a whole day's
// fixtures, or several concurrent per-fixture calls via Promise.all. A
// single shared queue spaces every outgoing request by a minimum interval
// so the real limit is never tripped, regardless of how many calls the
// caller intends as "concurrent" — Promise.all callers just queue here
// instead. Padded to 4/sec (not exactly 5) to leave headroom for timing
// jitter, since tripping the limit fails everything until it resets.
const MIN_REQUEST_INTERVAL_MS = 250;
let throttleQueue = Promise.resolve();

function throttle() {
  const wait = throttleQueue.then(
    () => new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS))
  );
  throttleQueue = wait;
  return wait;
}

// Returns the full envelope (response + paging + errors). Most callers only
// need the response array (see callApi below) — paginated endpoints (only
// /odds by date, here) also need .paging to know how many pages remain.
//
// API-Football also enforces a separate per-minute ceiling on top of the
// 5/sec one — confirmed live: even fully respecting the 4/sec throttle
// above, a handful of calls still came back with a rateLimit error under
// sustained load. Unlike hitting the 5/sec cap (which used to fail every
// subsequent call for the rest of the run), this one is transient enough
// that a short backoff-and-retry clears it, so it's worth retrying rather
// than silently dropping whatever fixture this call was for.
async function callApiRaw(path, params = {}, attempt = 0) {
  if (!KEY) {
    throw new Error(
      "API_FOOTBALL_KEY is not set. Add it to .env.local (see .env.example)."
    );
  }
  await throttle();
  const qs = new URLSearchParams(params).toString();
  const url = `https://${HOST}${path}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: headersFor(HOST),
    // Deliberately NOT using Next's fetch cache (next: {revalidate}) here.
    // API-Football returns its own rate-limit error as a normal HTTP 200
    // with an `errors.rateLimit` field — confirmed live that Next's cache
    // doesn't know that's a business-logic failure, so it happily caches
    // that "successful" response for the full revalidate window. The retry
    // logic below then keeps retrying into the SAME cached failure and
    // never actually reaches the network again. Caching per-call also
    // matters much less now than when this ran on every page load: the
    // expensive discovery in lib/predictions.js normally runs once/day via
    // the cron in app/api/archive/route.js, with the live page just reading
    // that result (see lib/history.js) rather than re-fetching hourly.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`API-Football request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    if (json.errors.rateLimit && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      return callApiRaw(path, params, attempt + 1);
    }
    throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

async function callApi(path, params = {}) {
  const json = await callApiRaw(path, params);
  return json.response;
}

// Every fixture worldwide for a date, across every league/competition
// API-Football covers — confirmed via a live call that this is a single,
// unpaginated request no matter how many matches that is (~1000 on a busy
// day). Which of these are worth showing is decided afterwards by whether
// bookmakers have actually priced them (see getOddsForDate), not by league.
export function getFixturesByDate(date) {
  return callApi("/fixtures", { date });
}

export function getTeamForm(teamId, last = 8) {
  return callApi("/fixtures", { team: teamId, last });
}

export function getH2H(teamAId, teamBId, last = 10) {
  return callApi("/fixtures/headtohead", { h2h: `${teamAId}-${teamBId}`, last });
}

// Bet id 1 = "Match Winner" (API-Football's bet-type ids are global, not
// per-bookmaker). Filtering the bulk date query to just this one market
// keeps every bookmaker's entry (unlike filtering by a single bookmaker,
// this preserves each fixture's real bookmaker COUNT — used in
// lib/predictions.js as a proxy for how mainstream a match is, so obscure
// leagues that happen to have odds don't crowd out prominent ones) while
// shrinking payload from ~2.5MB/page down to ~25KB/page — confirmed live.
// Without this, pages are over Next.js's 2MB fetch-cache limit (irrelevant
// now that these calls use cache: "no-store", but still wasteful to fetch
// and parse when we only need this one market's numbers plus the
// bookmaker count, not every market from every bookmaker).
const DISCOVERY_BET_ID = 1;

// Unlike /fixtures, /odds is paginated at 10 fixtures per page — confirmed
// live at ~55-60 pages for a single date (the bet filter above shrinks
// payload per page, not the page count, since pagination is by fixture
// count). maxPages is a hard safety ceiling for a pathological outlier day,
// not a normal limit; it doesn't cap how many matches end up shown, since
// that's applied separately afterwards (MAX_FIXTURES_TO_PROCESS in
// lib/predictions.js) once odds are matched back up against the fixture
// list. A page failing partway through (network blip) stops the loop but
// keeps whatever pages already succeeded, rather than discarding a day's
// worth of odds over one bad request.
export async function getOddsForDate(date, { maxPages = 100, bet = DISCOVERY_BET_ID } = {}) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    let json;
    try {
      json = await callApiRaw("/odds", { date, page, bet });
    } catch (err) {
      console.error(`Failed odds page ${page} for ${date}:`, err.message);
      break;
    }
    all.push(...json.response);
    totalPages = Math.min(json.paging?.total || 1, maxPages);
    page += 1;
  } while (page <= totalPages);
  return all;
}

// Full odds (every market, every bookmaker) for one fixture — used only for
// the small number of fixtures that actually make the final cut, since the
// bulk discovery above deliberately only fetches the Match Winner market to
// stay lightweight. A single fixture's worth is small regardless of market
// count, so there's no payload concern here.
export function getOddsForFixture(fixtureId) {
  return callApi("/odds", { fixture: fixtureId });
}

export function getInjuriesForFixture(fixtureId) {
  return callApi("/injuries", { fixture: fixtureId });
}
