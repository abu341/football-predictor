// Pulls real, opponent-adjusted Elo club ratings from clubelo.com (a free,
// long-running community project — not an official/paid API, so it can be
// flaky or occasionally unavailable). This replaces guessing team strength
// from raw recent-form stats with a rating that already accounts for who a
// team has actually been beating, which is the main weakness of a simple
// points-per-game model.
//
// If this fails or a team's name doesn't match anything in ClubElo's list,
// callers fall back to the form-based estimate instead — this is a bonus
// signal, not a hard dependency.

const CLUBELO_HOST = "https://api.clubelo.com";

function normalizeName(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (á, č, ř, ş, etc.)
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|sk|ac|as|us|cd|ca|sad|cfr|hnk|msk|gks|nk|fk|ks)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Fetches every club's current Elo rating in one request (ClubElo returns
// the whole list for a given date as CSV) and returns a lookup map keyed
// by a normalized club name.
export async function fetchEloRatingsForDate(date) {
  const res = await fetch(`${CLUBELO_HOST}/${date}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`ClubElo request failed: ${res.status}`);
  }
  const text = await res.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return new Map();

  const header = lines[0].split(",");
  const clubIdx = header.indexOf("Club");
  const eloIdx = header.indexOf("Elo");
  if (clubIdx === -1 || eloIdx === -1) return new Map();

  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const club = cols[clubIdx];
    const elo = parseFloat(cols[eloIdx]);
    if (!club || Number.isNaN(elo)) continue;
    map.set(normalizeName(club), elo);
  }
  return map;
}

export function lookupElo(eloMap, teamName) {
  if (!eloMap) return null;
  const key = normalizeName(teamName);
  return eloMap.has(key) ? eloMap.get(key) : null;
}

// Standard Elo win-expectancy scaling: a 400-point gap is a big favorite.
// Returned as a diff comparable in size to the existing form-based diff.
export function eloDiffScaled(homeElo, awayElo) {
  if (homeElo == null || awayElo == null) return 0;
  return (homeElo - awayElo) / 400;
}
