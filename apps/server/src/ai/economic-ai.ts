import {
  BOARD_TILES,
  canBuildOnProperty,
  canSellBuilding,
  getEffectivePurchasePrice,
  type AuctionBidIncrement,
  type GameState
} from "@valenor/shared";

export const AI_ECONOMY_CONFIG = {
  purchaseGoldReserve: 200,
  buildingGoldReserve: 250,
  maxBuildingActionsPerPhase: 2
} as const;

export type AuctionDecision = { type: "bid"; increment: AuctionBidIncrement } | { type: "withdraw" };

export class EconomicAi {
  shouldBuy(state: GameState, playerId: string): boolean {
    const player = state.players.find((candidate) => candidate.id === playerId);
    const tile = state.lastMovement ? BOARD_TILES[state.lastMovement.to] : undefined;
    if (!player || !tile?.economy) return false;
    const groupCount = tile.propertyGroup
      ? state.propertyOwnerships.filter((ownership) => ownership.ownerId === playerId && BOARD_TILES[ownership.tileIndex]?.propertyGroup === tile.propertyGroup).length
      : 0;
    const reserve = groupCount > 0 ? Math.floor(AI_ECONOMY_CONFIG.purchaseGoldReserve / 2) : AI_ECONOMY_CONFIG.purchaseGoldReserve;
    return player.gold - getEffectivePurchasePrice(state, tile, playerId) >= reserve;
  }

  decideAuction(state: GameState, playerId: string): AuctionDecision {
    const player = state.players.find((candidate) => candidate.id === playerId);
    const auction = state.auction;
    const tile = auction ? BOARD_TILES[auction.tileIndex] : undefined;
    if (!player || !auction || !tile?.economy) return { type: "withdraw" };
    const limit = Math.min(player.gold - AI_ECONOMY_CONFIG.purchaseGoldReserve, Math.round(tile.economy.purchasePrice * 1.25));
    const remaining = limit - auction.currentBid;
    if (remaining < 10) return { type: "withdraw" };
    return { type: "bid", increment: remaining >= 100 ? 100 : remaining >= 50 ? 50 : 10 };
  }

  decideBuildingAction(state: GameState, playerId: string): number | undefined {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) return undefined;
    const candidates = state.propertyOwnerships
      .filter((ownership) => ownership.ownerId === playerId)
      .map((ownership) => ({ ownership, tile: BOARD_TILES[ownership.tileIndex]! }))
      .filter(({ tile }) => tile.type === "property" && canBuildOnProperty(state, playerId, tile.index).allowed)
      .filter(({ tile }) => player.gold - tile.economy!.buildCost! >= AI_ECONOMY_CONFIG.buildingGoldReserve)
      .sort((left, right) => {
        const leftStarted = state.propertyOwnerships.some((entry) => entry.ownerId === playerId && entry.buildingLevel > 0 && BOARD_TILES[entry.tileIndex]?.propertyGroup === left.tile.propertyGroup);
        const rightStarted = state.propertyOwnerships.some((entry) => entry.ownerId === playerId && entry.buildingLevel > 0 && BOARD_TILES[entry.tileIndex]?.propertyGroup === right.tile.propertyGroup);
        if (leftStarted !== rightStarted) return leftStarted ? -1 : 1;
        if (left.ownership.buildingLevel !== right.ownership.buildingLevel) return left.ownership.buildingLevel - right.ownership.buildingLevel;
        return left.tile.economy!.buildCost! - right.tile.economy!.buildCost!;
      });
    return candidates[0]?.tile.index;
  }

  decideEmergencySale(state: GameState, playerId: string): number | undefined {
    return state.propertyOwnerships
      .filter((ownership) => ownership.ownerId === playerId && canSellBuilding(state, playerId, ownership.tileIndex).allowed)
      .sort((left, right) => {
        const leftCost = BOARD_TILES[left.tileIndex]?.economy?.buildCost ?? 0;
        const rightCost = BOARD_TILES[right.tileIndex]?.economy?.buildCost ?? 0;
        return rightCost - leftCost || right.buildingLevel - left.buildingLevel;
      })[0]?.tileIndex;
  }
}
