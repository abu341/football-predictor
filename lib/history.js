// Archives each day's predictions to Vercel Blob. One JSON file per date,
// named so a plain list() call comes back already sorted. Dual purpose:
// the live homepage (app/page.js) reads today's entry as its primary data
// source (fixture discovery is too slow to run inline on a page request —
// see app/api/archive/route.js), and past entries stay browsable at
// /history after the live page has moved on to the next day.

import { put, list, get } from "@vercel/blob";

const PREFIX = "predictions/";

export const hasBlobStore = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function pathnameFor(date) {
  return `${PREFIX}${date}.json`;
}

// access: "private" — confirmed live that this project's Blob store is
// configured for private access only; put()ing with access: "public" fails
// outright ("Cannot use public access on a private store"). Private blobs
// aren't fetchable by plain URL, hence get() (not a bare fetch) in
// getArchivedPredictions below. allowOverwrite so re-running the archive
// for a date already saved (a retried cron invocation, or a manual
// backfill) replaces it rather than erroring — deterministic pathname
// (addRandomSuffix: false) is what makes that overwrite land on the exact
// same file instead of piling up copies.
export async function archiveDate(date, predictions) {
  const body = JSON.stringify({
    date,
    generatedAt: new Date().toISOString(),
    predictions,
  });
  await put(pathnameFor(date), body, {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// Newest first — this is a small hobby archive, not a paginated dataset, so
// a single list() call (default page size 1000) is assumed to cover every
// archived day for the foreseeable future. list() itself doesn't care
// about a blob's access level, so this needs no changes for a private store.
export async function listArchivedDates() {
  const { blobs } = await list({ prefix: PREFIX });
  return blobs
    .map((b) => b.pathname.slice(PREFIX.length, -".json".length))
    .sort()
    .reverse();
}

// get() (not a bare fetch) — private blobs require the read-write token to
// access at all, which get() handles using BLOB_READ_WRITE_TOKEN from the
// environment automatically. Returns a raw stream, hence Response(...) to
// consume it as JSON rather than the plain res.json() a public-URL fetch
// would have used.
export async function getArchivedPredictions(date) {
  const result = await get(pathnameFor(date), { access: "private" });
  if (!result) return null;
  return new Response(result.stream).json();
}
