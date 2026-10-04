import type { GameState } from "@valenor/shared";

export function GameResultPanel({ gameState, viewerId, onNewChronicle }: {
  gameState: GameState;
  viewerId?: string;
  onNewChronicle?: (() => void) | undefined;
}) {
  const result = gameState.gameResult;
  const winnerIds = result?.winnerIds ?? gameState.winnerIds ?? (gameState.winnerId ? [gameState.winnerId] : []);
  const winners = winnerIds.map((id) => gameState.players.find((player) => player.id === id)).filter(Boolean);
  const shared = winners.length > 1;
  const scores = gameState.finalScores ?? result?.scores ?? [];
  const ownScore = scores.find((score) => score.playerId === viewerId);
  const ownRank = ownScore ? scores.findIndex((score) => score.playerId === viewerId) + 1 : undefined;
  const eliminatedPlayers = gameState.players.filter((player) => player.isBankrupt);

  return (
    <div className="game-result-panel">
      <p className="eyebrow">{result?.finishReason === "quickGameTimeExpired" ? "Das schnelle Abenteuer endet" : "Die Chronik ist entschieden"}</p>
      <div className="result-miniature" aria-hidden="true"><i>♞</i><span>✦</span></div>
      <h1>{shared ? "Geteilter Sieg" : winners[0]?.name ?? "Valenør"}</h1>
      <strong>{shared ? winners.map((winner) => winner!.name).join(" · ") : "Herrscher von Valenør"}</strong>
      {scores.length > 0 && (
        <>
          <h2>Vermögensabrechnung</h2>
          <div className="score-table" role="table" aria-label="Endwertung">
            {scores.map((score, index) => {
              const player = gameState.players.find((candidate) => candidate.id === score.playerId);
              return (
                <div key={score.playerId} className={viewerId === score.playerId ? "is-own-score" : ""} role="row">
                  <b>{index + 1}. {player?.name}</b>
                  <span>{score.goldValue} Gold</span>
                  <span>{score.propertyCount} {score.propertyCount === 1 ? "Grundstück" : "Grundstücke"} · {score.propertyValue} Wert</span>
                  <span>{score.completeGroupCount} {score.completeGroupCount === 1 ? "Gruppe" : "Gruppen"}</span>
                  <span>{score.developedPropertyCount} Gebäude · {score.buildingCount} Stufen · L{score.highestBuildingLevel}</span>
                  <strong>{score.totalNetWorth} Gesamt</strong>
                </div>
              );
            })}
          </div>
        </>
      )}
      {eliminatedPlayers.length > 0 && <div className="eliminated-players"><b>Ausgeschieden</b>{eliminatedPlayers.map((player) => <span key={player.id}>{player.name}</span>)}</div>}
      {ownScore && <div className="own-result"><b>Dein Ergebnis · Rang {ownRank}</b><span>{ownScore.goldValue} Gold</span><span>{ownScore.propertyCount} Grundstücke</span><span>{ownScore.completeGroupCount} Baugruppen</span><span>{ownScore.developedPropertyCount} Gebäude · {ownScore.buildingCount} Baustufen · höchste Stufe L{ownScore.highestBuildingLevel}</span><span>−{ownScore.mortgageLiability} Hypotheken</span><strong>{ownScore.totalNetWorth} Gesamtvermögen</strong><small>{ownScore.heldCardCount} gehaltene Karten (ohne Wert)</small></div>}
      {!scores.length && <div className="result-summary"><span>{winners[0]?.gold ?? 0} Gold</span><span>{gameState.currentRound} Runden</span></div>}
      {onNewChronicle && <button type="button" data-audio-cue="UI_CONFIRM" onClick={onNewChronicle}>Neue Chronik</button>}
    </div>
  );
}
