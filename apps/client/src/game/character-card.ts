import { PROPERTY_GROUPS, getPropertyGroupTiles, type GameState, type PropertyGroupId } from "@valenor/shared";

/** Ein Punkt je Gruppe, in der ein Spieler Felder besitzt: gefüllt, wenn ihm die ganze Gruppe gehört. */
export interface GroupDot {
  groupId: PropertyGroupId;
  name: string;
  color: string;
  owned: number;
  total: number;
  complete: boolean;
}

/** Gruppen in Brettreihenfolge; nur die, in denen der Spieler mindestens ein Feld hat. */
export function getPlayerGroupDots(state: Pick<GameState, "propertyOwnerships">, playerId: string): GroupDot[] {
  return PROPERTY_GROUPS.flatMap(group => {
    const tiles = getPropertyGroupTiles(group.id);
    const owned = tiles.filter(tile => state.propertyOwnerships.some(entry => entry.tileIndex === tile.index && entry.ownerId === playerId)).length;
    return owned ? [{ groupId: group.id, name: group.displayName, color: group.accent, owned, total: tiles.length, complete: owned === tiles.length }] : [];
  });
}

/** Dauer, in der eine Goldänderung sichtbar hoch- oder herunterzählt. */
export const GOLD_COUNT_MS = 900;

/** Zwischenwert beim Zählen (t von 0 bis 1): zügig los, sanft auslaufend, immer ganze Goldstücke. */
export function countValue(from: number, to: number, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const eased = 1 - (1 - clamped) ** 3;
  return Math.round(from + (to - from) * eased);
}
