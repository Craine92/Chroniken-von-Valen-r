import type { GameState } from "@valenor/shared";
import { ControllerQuestLog } from "./ControllerQuestLog";

export function ControllerJournal({ state, playerId }: { state: GameState; playerId: string }) {
  const completedTrades = state.trades.filter(trade => trade.status !== "pending" && (trade.proposerId === playerId || trade.recipientId === playerId));
  return <section id="controller-journal">
    <h2>Journal</h2>
    <ControllerQuestLog state={state} playerId={playerId} />
    <section className="controller-journal-section">
      <h3>Weltimpulse</h3>
      {state.worldImpulseHistory?.length ? state.worldImpulseHistory.slice(-5).reverse().map((impulse, index) => <article key={`${impulse.id}-${impulse.startedAt}-${index}`}><strong>{impulse.title}</strong><span>{impulse.resultText ?? impulse.effectSummary}</span></article>) : <p>Noch keine Weltimpulse.</p>}
    </section>
    <section className="controller-journal-section">
      <h3>Ereignisse</h3>
      {state.economyLog.length ? state.economyLog.slice(-8).reverse().map(entry => <article key={entry.id}><span>{entry.message}</span></article>) : <p>Noch keine Einträge.</p>}
    </section>
    <details className="controller-journal-section controller-journal-trades">
      <summary>Abgeschlossene Angebote ({completedTrades.length})</summary>
      {completedTrades.slice().reverse().map(trade => {
        const partnerId = trade.proposerId === playerId ? trade.recipientId : trade.proposerId;
        const partner = state.players.find(entry => entry.id === partnerId)?.name ?? "Unbekannt";
        const labels = { accepted: "Angenommen", rejected: "Abgelehnt", cancelled: "Zurückgezogen", countered: "Gegenangebot" } as const;
        return <article key={trade.id}><strong>{labels[trade.status as keyof typeof labels]} · {partner}</strong><span>{trade.offer.gold} Gold + {trade.offer.propertyTileIndices.length} Besitz gegen {trade.request.gold} Gold + {trade.request.propertyTileIndices.length} Besitz</span></article>;
      })}
    </details>
  </section>;
}
