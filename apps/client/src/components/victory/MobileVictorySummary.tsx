import { emptyPlayerStats, getMatchAwards, getMatchRanking, getNetWorth, type GameState } from "@valenor/shared";
import { Icon } from "../icons/Icon";

/** Persönliche Zusammenfassung auf dem Handy: Platz, eigene Auszeichnungen, eigene Zahlen und der eigene Verlauf. */
export function MobileVictorySummary({ gameState, playerId }: { gameState: GameState; playerId: string }) {
  const ranking = getMatchRanking(gameState);
  const place = ranking.indexOf(playerId) + 1;
  if (!place) return null;
  const awards = getMatchAwards(gameState)[playerId] ?? [];
  const stats = gameState.matchStats?.players[playerId] ?? emptyPlayerStats();
  const history = (gameState.matchStats?.wealthByRound ?? []).map(snapshot => snapshot.values[playerId] ?? 0);
  const peak = Math.max(1, ...history);
  const facts: [string, string][] = [
    ["Vermögen am Ende", `${getNetWorth(gameState, playerId).toLocaleString("de-DE")} Gold`],
    ["Miete gezahlt", `${stats.rentPaid.toLocaleString("de-DE")} Gold`],
    ["Miete kassiert", `${stats.rentReceived.toLocaleString("de-DE")} Gold`],
    ["Käufe", String(stats.purchases)],
    ["Bauwerke", String(stats.buildingsBuilt)],
    ["Handel", String(stats.tradesCompleted)],
    ["Züge im Kerker", String(stats.dungeonTurns)]
  ];
  return <section className="mobile-victory" aria-label="Deine Chronik">
    <p className="mobile-victory__place"><Icon name={place === 1 ? "crown" : "seal"} /><b>{place === 1 ? "Du hast gewonnen!" : `Platz ${place} von ${ranking.length}`}</b></p>
    <ul className="mobile-victory__awards">
      {awards.map(award => <li key={award.id}><b>{award.title}</b><span>{award.reason}</span></li>)}
    </ul>
    {history.length > 1 && <figure className="mobile-victory__sparkline">
      <figcaption>Dein Vermögen je Runde · höchstens {peak.toLocaleString("de-DE")} Gold</figcaption>
      <svg viewBox={`0 0 ${(history.length - 1) * 20} 60`} preserveAspectRatio="none" role="img" aria-label={`Vermögen von ${history[0]} bis ${history.at(-1)} Gold`}>
        <polyline points={history.map((value, index) => `${index * 20},${(58 - (value / peak) * 54).toFixed(1)}`).join(" ")} />
      </svg>
    </figure>}
    <dl className="mobile-victory__facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}
