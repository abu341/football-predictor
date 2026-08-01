import Link from "next/link";
import { hasBlobStore, listArchivedDates } from "../../lib/history";

export const revalidate = 3600;

export default async function History() {
  if (!hasBlobStore) {
    return (
      <div className="wrap">
        <header className="top">
          <h1>Prediction History</h1>
          <nav className="nav">
            <Link href="/">Today</Link>
          </nav>
        </header>
        <div className="banner">
          History isn&apos;t set up yet — connect a Vercel Blob store and add
          a daily cron job (see vercel.json) to start archiving each day&apos;s
          predictions.
        </div>
      </div>
    );
  }

  let dates = [];
  let loadError = null;
  try {
    dates = await listArchivedDates();
  } catch (err) {
    loadError = err.message;
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>Prediction History</h1>
        <nav className="nav">
          <Link href="/">Today</Link>
        </nav>
      </header>

      {loadError && (
        <div className="banner">Couldn&apos;t load history: {loadError}</div>
      )}

      {!loadError && dates.length === 0 && (
        <div className="empty">
          No archived days yet — check back after the first daily archive runs.
        </div>
      )}

      {dates.length > 0 && (
        <ul className="history-list">
          {dates.map((date) => (
            <li key={date}>
              <Link href={`/history/${date}`}>{date}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
