// Archives each day's predictions to Vercel Blob. One JSON file per date,
// named so a plain list() call comes back already sorted. Dual purpose:
// the live homepage (app/page.js) reads today's entry as its primary data
// source (fixture discovery is too slow to run inline on a page request —
// see app/api/archive/route.js), and past entries stay browsable at
// /history after the live page has moved on to the next day.

import { put, list } from "@vercel/blob";

const PREFIX = "predictions/";

export const hasBlobStore = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function pathnameFor(date) {
  return `${PREFIX}${date}.json`;
}

// allowOverwrite so re-running the archive for a date already saved (a
// retried cron invocation, or a manual backfill) replaces it rather than
// erroring — deterministic pathname (addRandomSuffix: false) is what makes
// that overwrite land on the exact same file instead of piling up copies.
export async function archiveDate(date, predictions) {
  const body = JSON.stringify({
    date,
    generatedAt: new Date().toISOString(),
    predictions,
  });
  await put(pathnameFor(date), body, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// Newest first — this is a small hobby archive, not a paginated dataset, so
// a single list() call (default page size 1000) is assumed to cover every
// archived day for the foreseeable future.
export async function listArchivedDates() {
  const { blobs } = await list({ prefix: PREFIX });
  return blobs
    .map((b) => b.pathname.slice(PREFIX.length, -".json".length))
    .sort()
    .reverse();
}

export async function getArchivedPredictions(date) {
  const { blobs } = await list({ prefix: pathnameFor(date) });
  const blob = blobs[0];
  if (!blob) return null;
  const res = await fetch(blob.url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}
