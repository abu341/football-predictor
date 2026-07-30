// API-Football league IDs we track by default. Kept short on purpose so a
// free-tier API key (limited daily requests) doesn't get burned through in
// one page load. Add/remove as your plan's quota allows.
//
// Full ID list: https://www.api-football.com/documentation-v3#tag/Leagues

export const TRACKED_LEAGUES = [
  { id: 39, name: "Premier League", country: "England" },
  { id: 140, name: "La Liga", country: "Spain" },
  { id: 135, name: "Serie A", country: "Italy" },
  { id: 78, name: "Bundesliga", country: "Germany" },
  { id: 61, name: "Ligue 1", country: "France" },
  { id: 253, name: "MLS", country: "USA" },
  { id: 71, name: "Serie A", country: "Brazil" },
  { id: 3, name: "Europa League", country: "Europe" },
  { id: 848, name: "Conference League", country: "Europe" },
  { id: 2, name: "Champions League", country: "Europe" },
];

export function leagueLabel(id) {
  const l = TRACKED_LEAGUES.find((x) => x.id === id);
  return l ? `${l.name} (${l.country})` : `League ${id}`;
}
