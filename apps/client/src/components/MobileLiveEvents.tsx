import { BOARD_TILES, type GameState } from "@valenor/shared";
import { useCurrentBoardContext } from "../game/board-context";
import { RecentActions } from "./RecentActions";
import { WorldStatus } from "./WorldStatus";

export function MobileLiveEvents({ state, playerId }: { state: GameState; playerId: string }) {
  const context = useCurrentBoardContext(state);
  const current = state.players.find(player => player.id === state.currentPlayerId);
  if (state.status !== "playing" || !current || current.id === playerId) return null;
  const roll = !["waitingForRoll", "dungeonDecision", "turnTransition", "determiningOrder"].includes(state.turnPhase) ? state.lastDiceRoll : undefined;
  const movement = state.lastMovement?.playerId === current.id ? state.lastMovement : undefined;
  const landing = movement && !["rolling", "dungeonRolling", "moving", "cardMoving"].includes(state.turnPhase) ? BOARD_TILES[movement.to] : undefined;
  return <section className="mobile-live" aria-label="Live-Geschehen">
    <h2>LIVE-GESCHEHEN</h2>
    <div className={`mobile-live__turn player-theme--${current.color}`}>
      <small>{["rolling", "dungeonRolling"].includes(state.turnPhase) ? "WÜRFELT" : "AM ZUG"}</small>
      <strong>{current.name} · {current.type === "computer" ? "NPC" : "MENSCH"}</strong>
      {roll && <p>Wurf: {roll.die1} + {roll.die2} = <b>{roll.total}</b>{roll.isDouble && " · PASCH!"}</p>}
      {landing && <p>Landet auf: <b>{landing.name}</b></p>}
      {context.kind !== "neutral" && <div className="mobile-live__context" data-context-kind={context.kind}>
        <small>{context.eyebrow}</small><strong>{context.title}</strong>
        {context.lines.filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
        {context.gold !== undefined && <p>{context.goldLabel}: <b>{context.gold.toLocaleString("de-DE")} GOLD</b></p>}
      </div>}
    </div>
    <div className="mobile-live__world"><WorldStatus state={state} /></div>
    <RecentActions state={state} className="mobile-live__actions" />
  </section>;
}
