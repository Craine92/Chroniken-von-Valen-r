import type { GameRoom, GameState } from "@valenor/shared";

export function shouldApplyAuthoritativeGameState(latestAppliedRevision: number, nextState: GameState): boolean {
  return (nextState.stateRevision ?? 0) >= latestAppliedRevision;
}

export function resolveRoomGameState(current: GameState | undefined, updatedRoom: GameRoom): GameState | undefined {
  if (updatedRoom.phase === "lobby") return updatedRoom.gameState;
  const candidate = updatedRoom.gameState;
  if (!candidate) return current;
  if (!current || shouldApplyAuthoritativeGameState(current.stateRevision ?? 0, candidate)) return candidate;
  return current;
}
