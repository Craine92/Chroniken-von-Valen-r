import { getPropertyGroupTiles, type GameState, type PlayerColor, type PropertyGroupId } from "@valenor/shared";

/** Wem gehört eine Gruppe ganz? Liefert die Spieler-ID oder nichts. */
export function getCompleteGroupOwner(state: GameState, groupId: PropertyGroupId): string | undefined {
  const tiles = getPropertyGroupTiles(groupId);
  const owners = tiles.map(tile => state.propertyOwnerships.find(entry => entry.tileIndex === tile.index)?.ownerId);
  return owners.length && owners.every(owner => owner && owner === owners[0]) ? owners[0] : undefined;
}

/** Besitzpunkte einer Gruppe in Brettreihenfolge: Spielerfarbe des Besitzers oder leer. */
export function getGroupOwnershipDots(state: GameState, groupId: PropertyGroupId): Array<PlayerColor | undefined> {
  return getPropertyGroupTiles(groupId).map(tile => {
    const ownerId = state.propertyOwnerships.find(entry => entry.tileIndex === tile.index)?.ownerId;
    return state.players.find(player => player.id === ownerId)?.color;
  });
}
