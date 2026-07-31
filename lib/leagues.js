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
  // Added so there's more to show while the "big 5" European leagues above
  // are on their summer break (they don't restart until mid-August) — these
  // are all leagues actively playing through July/August.
  { id: 72, name: "Serie B", country: "Brazil" },
  { id: 128, name: "Liga Profesional", country: "Argentina" },
  { id: 262, name: "Liga MX", country: "Mexico" },
  { id: 98, name: "J1 League", country: "Japan" },
  { id: 292, name: "K League 1", country: "South Korea" },
  { id: 103, name: "Eliteserien", country: "Norway" },
  { id: 113, name: "Allsvenskan", country: "Sweden" },
  { id: 119, name: "Superliga", country: "Denmark" },
  { id: 169, name: "Super League", country: "China" },
  // These two haven't started their new season yet as of late July, but are
  // left in so matches appear automatically once they kick off in August
  // without needing another code change.
  { id: 88, name: "Eredivisie", country: "Netherlands" },
  { id: 94, name: "Primeira Liga", country: "Portugal" },
];

export function leagueLabel(id) {
  const l = TRACKED_LEAGUES.find((x) => x.id === id);
  return l ? `${l.name} (${l.country})` : `League ${id}`;
}
