// "Today" is calculated in UK time, not the server's UTC clock. Without
// this, the site can show yesterday's fixtures for a few hours around
// midnight — the server's UTC date rolls over later than the UK's local
// date does (UK is UTC+0 or UTC+1 depending on the time of year), so a
// plain new Date() reflects the wrong day during that gap.
export function todayInUK() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}
