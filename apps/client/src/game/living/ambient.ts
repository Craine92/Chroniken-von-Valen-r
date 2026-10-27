import type { GameState } from "@valenor/shared";

/** Die Felder, über denen Rauch aufsteigt: die höchsten Bauten zuerst, höchstens `limit`. */
export function chooseChimneyTiles(state: Pick<GameState, "propertyOwnerships">, limit: number): number[] {
  return state.propertyOwnerships
    .filter(ownership => ownership.buildingLevel > 0)
    .sort((a, b) => b.buildingLevel - a.buildingLevel || a.tileIndex - b.tileIndex)
    .slice(0, Math.max(0, limit))
    .map(ownership => ownership.tileIndex);
}
