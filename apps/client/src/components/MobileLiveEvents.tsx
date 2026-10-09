import { BOARD_TILES, type GameState } from "@valenor/shared";

export function MobileLiveEvents({ state, playerId }: { state: GameState; playerId: string }) {
  const current = state.players.find(player => player.id === state.currentPlayerId);
  if (state.status !== "playing" || !current || current.id === playerId) return null;
  const roll = !["waitingForRoll", "dungeonDecision", "turnTransition", "determiningOrder"].includes(state.turnPhase) ? state.lastDiceRoll : undefined;
  const movement = state.lastMovement?.playerId === current.id ? state.lastMovement : undefined;
  const landing = movement && !["rolling", "dungeonRolling", "moving", "cardMoving"].includes(state.turnPhase) ? BOARD_TILES[movement.to] : undefined;
  return <section className="mobile-live" aria-label="Live-Geschehen">
    <h2>LIVE</h2>
    <div className={`mobile-live__turn player-theme--${current.color}`}>
      <strong>{current.name} ist am Zug</strong>
      {(roll || landing) && <p>🎲 {roll ? `${roll.die1} + ${roll.die2} = ${roll.total}` : "–"}{landing && <> → <b>{landing.name}</b></>}</p>}
    </div>
    <dl className="mobile-live__facts">
      <div><dt>Weltimpuls</dt><dd>{state.activeWorldImpulse?.title ?? "–"}</dd></div>
      <div><dt>Pott</dt><dd>{state.weltenwegPot ?? 0} Gold</dd></div>
    </dl>
  </section>;
}
