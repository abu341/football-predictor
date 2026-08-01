// Fixture discovery (lib/predictions.js) finds matches globally by date and
// keeps whatever bookmakers have actually priced — that alone does NOT
// reliably filter out youth/reserve leagues, confirmed live: on a slow day
// for the "big" leagues, this list ended up entirely full of Australian
// regional divisions, an MLS reserve league, and a youth tournament, all of
// which some bookmaker prices anyway. Selection also ranks by bookmaker
// count (a proxy for how mainstream a match is) to push exactly this kind
// of thing down naturally, but these specific ones were common enough to
// just exclude outright.
export const EXCLUDED_LEAGUE_IDS = [
  189, // Capital Territory NPL (Australia)
  192, // New South Wales NPL (Australia)
  194, // South Australia NPL (Australia)
  195, // Victoria NPL (Australia)
  481, // Northern NSW NPL (Australia)
  482, // Queensland NPL (Australia)
  537, // CONCACAF U20 (youth)
  648, // Tasmania NPL (Australia)
  834, // South Australia State League 1 (Australia)
  836, // Victoria NPL 2 (Australia)
  909, // MLS Next Pro (USA reserve league)
  1226, // Victoria Premier League 2 (Australia)
  1230, // NPL NSW U20 (youth)
];
