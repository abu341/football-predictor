import { NextResponse } from "next/server";
import { hasApiKey } from "../../../lib/apiFootball";
import { buildPredictionsForDate } from "../../../lib/predictions";
import { todayInUK } from "../../../lib/date";
import { archiveDate, hasBlobStore } from "../../../lib/history";

// Fixture discovery now scans every fixture worldwide for the date and
// filters by real bookmaker odds (see lib/predictions.js) rather than a
// curated league list — that's ~180 API-Football requests, throttled to
// stay under the Pro plan's 5 req/sec cap (lib/apiFootball.js). Typical
// runs took 54-70s in testing, but confirmed live in production that 60s
// isn't always enough (a 504 "Task timed out after 60 seconds" — likely
// occasional rate-limit retries pushing it over). 300s is the actual ceiling
// on Vercel Hobby with Fluid Compute (confirmed via Vercel's docs — Hobby
// without Fluid Compute caps lower), which is the default on newer
// projects; check Project Settings → Functions → "Fluid Compute" if this
// still times out. Using the max here costs nothing extra when the run
// finishes early — Fluid Compute bills actual usage, not the ceiling.
export const maxDuration = 300;

// Triggered daily by Vercel Cron (see vercel.json — scheduled for just
// after UK midnight, 00:20 UTC) to precompute that day's predictions once —
// the live homepage (app/page.js) reads this same archive instead of
// recomputing on every request, since the discovery above is too slow to
// run inline on a page load. Deliberately early rather than late in the
// day: the archive needs to exist for as much of the day as possible so
// the live page's fast path applies to normal daytime traffic, not just
// the last hour before rollover — the trade-off is that odds/injury data
// gets locked in near the start of the day rather than closer to kickoff.
// Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron-triggered
// requests when a CRON_SECRET env var is set — checked here so this route
// can't be used by anyone else to burn your API quota on demand.
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!hasBlobStore) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not set — connect a Vercel Blob store first." },
      { status: 501 }
    );
  }
  if (!hasApiKey) {
    return NextResponse.json(
      { error: "API_FOOTBALL_KEY is not set — nothing real to archive yet." },
      { status: 501 }
    );
  }

  // Optional ?date=YYYY-MM-DD override for manual backfill/testing; defaults
  // to today (UK) so the plain cron-triggered call needs no arguments.
  const date = request.nextUrl.searchParams.get("date") || todayInUK();

  try {
    const predictions = await buildPredictionsForDate(date);
    await archiveDate(date, predictions);
    return NextResponse.json({ ok: true, date, count: predictions.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
