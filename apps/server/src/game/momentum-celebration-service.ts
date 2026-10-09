import { randomUUID } from "node:crypto";
import { BOARD_TILES, getPropertyGroup, getPropertyGroupTiles, type GameState, type TradeOffer } from "@valenor/shared";

export function recordNewCompleteGroups(state: GameState, playerId: string): void {
  const player = state.players.find(entry => entry.id === playerId);
  if (!player) return;
  const celebrated = state.celebratedPropertyGroups ??= [];
  const groupIds = new Set(state.propertyOwnerships
    .filter(entry => entry.ownerId === playerId)
    .map(entry => BOARD_TILES[entry.tileIndex]?.propertyGroup)
    .filter((id): id is NonNullable<typeof id> => Boolean(id)));
  for (const groupId of groupIds) {
    const group = getPropertyGroup(groupId);
    if (!group) continue;
    const key = `${playerId}:${group.id}`;
    if (celebrated.includes(key) || !getPropertyGroupTiles(groupId).every(tile =>
      state.propertyOwnerships.some(entry => entry.tileIndex === tile.index && entry.ownerId === playerId))) continue;
    celebrated.push(key);
    state.lastMomentumCelebration = {
      id: randomUUID(), type: "completeGroup", playerId, groupId: group.id,
      title: `${player.name} vereint ${group.displayName}`,
      subtitle: "Die Baugruppe ist vollständig.", createdAt: Date.now()
    };
  }
}

export function recordMaxBuilding(state: GameState, playerId: string, tileIndex: number): void {
  const tile = BOARD_TILES[tileIndex];
  state.lastMomentumCelebration = {
    id: randomUUID(), type: "maxBuilding", playerId, tileIndex,
    title: "Großes Bauwerk", subtitle: tile?.name ?? "Stufe 5", createdAt: Date.now()
  };
}

export function recordLargeTrade(state: GameState, trade: TradeOffer): void {
  const propertyCount = trade.offer.propertyTileIndices.length + trade.request.propertyTileIndices.length;
  const isLarge = propertyCount >= 2 || trade.offer.gold >= 500 || trade.request.gold >= 500
    || Boolean(trade.offer.relicIds?.length || trade.request.relicIds?.length);
  if (!isLarge) return;
  const proposer = state.players.find(player => player.id === trade.proposerId);
  const recipient = state.players.find(player => player.id === trade.recipientId);
  state.lastMomentumCelebration = {
    id: randomUUID(), type: "largeTrade", playerId: trade.proposerId, otherPlayerId: trade.recipientId,
    title: "Handel besiegelt", subtitle: `${proposer?.name ?? "Gefährte"} ↔ ${recipient?.name ?? "Gefährte"}`, createdAt: Date.now()
  };
}

export function recordPotThreshold(state: GameState, previousPot: number, nextPot: number): void {
  const threshold = previousPot < 1000 && nextPot >= 1000 ? 1000 : previousPot < 500 && nextPot >= 500 ? 500 : undefined;
  if (!threshold) return;
  state.lastMomentumCelebration = {
    id: randomUUID(), type: "largePot", threshold,
    title: threshold === 1000 ? "Legendärer Weltenweg-Pott" : "Großer Weltenweg-Pott",
    subtitle: `${nextPot} Gold warten in der Taverne.`, createdAt: Date.now()
  };
}
