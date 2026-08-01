import { NextResponse } from "next/server";
import { hasApiKey } from "../../../lib/apiFootball";
import { buildPredictionsForDate } from "../../../lib/predictions";
import { todayInUK } from "../../../lib/date";
import { archiveDate, hasBlobStore } from "../../../lib/history";

// Fixture discovery now scans every fixture worldwide for the date and
// filters by real bookmaker odds (see lib/predictions.js) rather than a
// curated league list — that's ~150 API-Football requests, throttled to
// stay under the Pro plan's 5 req/sec cap (lib/apiFootball.js), so a full
// run takes on the order of a minute. 60s here needs Fluid Compute, which
// is the default on newer Vercel projects (Project Settings → Functions →
// "Fluid Compute" if it isn't already on) — without it, Hobby's hard 10s
// cap would kill this run partway through.
export const maxDuration = 60;

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
