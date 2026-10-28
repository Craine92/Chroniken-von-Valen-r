import type { GameState } from "./game";

/** Der große Spielstart auf dem TV lässt sich nur in den ersten Sekunden einer neuen Partie überspringen. */
export const GRAND_START_SKIP_WINDOW_MS = 20_000;

export interface GrandStartSkipSignal {
  playerId: string;
  sentAt: number;
}

/** Wer den Spielstart überspringen darf: der Spieler am Zug, vor der Reihenfolge der erste Mensch der Runde. */
export function getGrandStartLeadPlayerId(state: GameState): string | undefined {
  if (state.currentPlayerId) return state.currentPlayerId;
  return state.turnOrder.find(id => state.players.find(player => player.id === id)?.type === "human");
}

export function canSkipGrandStart(state: GameState, playerId: string, now: number): boolean {
  return state.status === "playing"
    && state.currentRound <= 1 && state.turnNumber <= 1
    && now - state.startedAt <= GRAND_START_SKIP_WINDOW_MS
    && getGrandStartLeadPlayerId(state) === playerId;
}
