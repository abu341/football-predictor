import Link from "next/link";
import { notFound } from "next/navigation";
import { getArchivedPredictions, hasBlobStore } from "../../../lib/history";
import { MatchCard } from "../../../components/MatchCard";

export const revalidate = 3600;

export default async function HistoryDay({ params }) {
  if (!hasBlobStore) notFound();

  const archive = await getArchivedPredictions(params.date);
  if (!archive) notFound();

  return (
    <div className="wrap">
      <header className="top">
        <h1>Predictions for {archive.date}</h1>
        <nav className="nav">
          <Link href="/history">All history</Link>
          <Link href="/">Today</Link>
        </nav>
      </header>

      {archive.predictions.length === 0 && (
        <div className="empty">No tracked-league fixtures were found for this date.</div>
      )}

      <div className="grid">
        {archive.predictions.map((p) => (
          <MatchCard key={p.fixtureId} p={p} />
        ))}
      </div>
    </div>
  );
}
