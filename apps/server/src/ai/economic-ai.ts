import {
  BOARD_TILES,
  canBuildOnProperty,
  canSellBuilding,
  getEffectivePurchasePrice,
  getEffectiveBuildCost,
  getEffectiveBuildingSaleValue,
  getEffectiveMortgageRedemptionCost,
  getPropertyGroupTiles,
  PROPERTY_GROUPS,
  type CreateTradeOfferRequest,
  type PropertyOwnership,
  type TradeAssets,
  type TradeOffer,
  type AuctionBidIncrement,
  type GameState
} from "@valenor/shared";
import { NPC_TRADE_GOLD_RESERVE, TradeService } from "../game/trade-service";

export const AI_ECONOMY_CONFIG = {
  purchaseGoldReserve: 200,
  buildingGoldReserve: 250,
  maxBuildingActionsPerPhase: 2,
  tradeGoldReserve: NPC_TRADE_GOLD_RESERVE,
  tradeProposalCooldownRounds: 3
} as const;

export const AI_RELIC_TRADE_VALUES = { runestone: 150, "merchant-seal": 175, "dungeon-amulet": 140, "golden-feather": 125 } as const;
export const AI_DUNGEON_CARD_TRADE_VALUE = 110;
export type TradeDecision = { type: "accept" | "reject" } | { type: "counter"; request: CreateTradeOfferRequest };
export interface TradeEvaluation { receivedValue: number; givenValue: number; goldAfterTrade: number; breaksCompleteGroup: boolean }

export type AuctionDecision = { type: "bid"; increment: AuctionBidIncrement } | { type: "withdraw" };

export class EconomicAi {
  private readonly tradeValidator = new TradeService();

  evaluatePropertyForPlayer(state: GameState, playerId: string, tileIndex: number, ownerships: readonly PropertyOwnership[] = state.propertyOwnerships): number {
    const tile = BOARD_TILES[tileIndex];
    if (!tile?.economy) return 0;
    let multiplier = 1;
    if (tile.type === "property" && tile.propertyGroup) {
      const others = getPropertyGroupTiles(tile.propertyGroup).filter(field => field.index !== tileIndex);
      const owned = others.filter(field => ownerships.some(entry => entry.tileIndex === field.index && entry.ownerId === playerId)).length;
      multiplier = owned === others.length ? 1.9 : owned > 0 ? 1.35 : 1;
    } else if (tile.type === "harbor" || tile.type === "utility") {
      const others = ownerships.filter(entry => entry.ownerId === playerId && entry.tileIndex !== tileIndex && BOARD_TILES[entry.tileIndex]?.type === tile.type).length;
      multiplier += .18 * others;
    }
    const mortgaged = state.propertyOwnerships.find(entry => entry.tileIndex === tileIndex)?.mortgaged;
    const base = Math.max(0, tile.economy.purchasePrice - (mortgaged ? getEffectiveMortgageRedemptionCost(state, tile) : 0));
    return Math.round(base * multiplier);
  }

  evaluateTradeAssets(state: GameState, playerId: string, assets: TradeAssets, ownerships: readonly PropertyOwnership[] = state.propertyOwnerships): number {
    return assets.gold + assets.propertyTileIndices.reduce((value, index) => value + this.evaluatePropertyForPlayer(state, playerId, index, ownerships), 0)
      + (assets.cardIds?.length ?? 0) * AI_DUNGEON_CARD_TRADE_VALUE
      + (assets.relicIds ?? []).reduce((value, id) => value + AI_RELIC_TRADE_VALUES[id], 0);
  }

  evaluateTrade(state: GameState, playerId: string, trade: TradeOffer): TradeEvaluation {
    const incoming = trade.recipientId === playerId ? trade.offer : trade.request;
    const outgoing = trade.recipientId === playerId ? trade.request : trade.offer;
    const otherId = trade.recipientId === playerId ? trade.proposerId : trade.recipientId;
    const finalOwnerships = state.propertyOwnerships.map(entry => ({ ...entry, ownerId: incoming.propertyTileIndices.includes(entry.tileIndex) ? playerId : outgoing.propertyTileIndices.includes(entry.tileIndex) ? otherId : entry.ownerId }));
    const complete = (group: string, ownerId: string, ownerships: readonly PropertyOwnership[]) => getPropertyGroupTiles(group).every(tile => ownerships.some(entry => entry.tileIndex === tile.index && entry.ownerId === ownerId));
    const breaksCompleteGroup = this.tradeValidator.wouldBreakCompleteGroup(state, playerId, outgoing.propertyTileIndices);
    let givenValue = this.evaluateTradeAssets(state, playerId, outgoing);
    for (const index of outgoing.propertyTileIndices) {
      const group = BOARD_TILES[index]?.propertyGroup;
      if (group && complete(group, otherId, finalOwnerships)) givenValue += Math.round(this.evaluatePropertyForPlayer(state, playerId, index) * .65);
    }
    return { receivedValue: this.evaluateTradeAssets(state, playerId, incoming, finalOwnerships), givenValue,
      goldAfterTrade: (state.players.find(player => player.id === playerId)?.gold ?? 0) + incoming.gold - outgoing.gold, breaksCompleteGroup };
  }

  decideTradeResponse(state: GameState, playerId: string, trade: TradeOffer): TradeDecision {
    const player = state.players.find(entry => entry.id === playerId);
    if (player?.type !== "computer" || trade.recipientId !== playerId || !this.tradeValidator.isValid(state, trade)) return { type: "reject" };
    const value = this.evaluateTrade(state, playerId, trade);
    if (value.breaksCompleteGroup || value.goldAfterTrade < AI_ECONOMY_CONFIG.tradeGoldReserve) return { type: "reject" };
    if (value.receivedValue >= value.givenValue * .95) return { type: "accept" };
    if (value.receivedValue < value.givenValue * .70 || trade.counterToTradeId) return { type: "reject" };
    const request = this.createCounterOffer(state, playerId, trade);
    return request ? { type: "counter", request } : { type: "reject" };
  }

  createCounterOffer(state: GameState, playerId: string, trade: TradeOffer): CreateTradeOfferRequest | undefined {
    if (trade.counterToTradeId || trade.recipientId !== playerId || !this.tradeValidator.isValid(state, trade)
      || state.trades.some(entry => entry.proposerId === playerId && entry.status === "pending")) return undefined;
    const value = this.evaluateTrade(state, playerId, trade);
    if (value.breaksCompleteGroup || value.goldAfterTrade < AI_ECONOMY_CONFIG.tradeGoldReserve || value.receivedValue < value.givenValue * .70) return undefined;
    const copy = (assets: TradeAssets): TradeAssets => ({ ...assets, propertyTileIndices: [...assets.propertyTileIndices], cardIds: [...(assets.cardIds ?? [])], relicIds: [...(assets.relicIds ?? [])] });
    const request: CreateTradeOfferRequest = { recipientId: trade.proposerId, counterToTradeId: trade.id, offer: copy(trade.request), request: copy(trade.offer) };
    const gap = Math.max(0, Math.ceil(value.givenValue - value.receivedValue));
    const reduction = Math.min(gap, request.offer.gold);
    request.offer.gold -= reduction; request.request.gold += gap - reduction;
    const candidate: TradeOffer = { ...request, id: "ai-counter-preview", proposerId: playerId, status: "pending", createdAt: 0 };
    if (!this.tradeValidator.isValid(state, candidate)) return undefined;
    const counterValue = this.evaluateTrade(state, playerId, candidate);
    return counterValue.goldAfterTrade >= AI_ECONOMY_CONFIG.tradeGoldReserve && counterValue.receivedValue >= counterValue.givenValue * .95 ? request : undefined;
  }

  findTradeProposal(state: GameState, playerId: string, lastProposalRound?: number): CreateTradeOfferRequest | undefined {
    const player = state.players.find(entry => entry.id === playerId);
    if (player?.type !== "computer" || player.isBankrupt || state.currentPlayerId !== playerId || state.turnPhase !== "waitingForEndTurn"
      || (lastProposalRound !== undefined && state.currentRound - lastProposalRound < AI_ECONOMY_CONFIG.tradeProposalCooldownRounds)
      || state.trades.some(trade => trade.proposerId === playerId && trade.status === "pending")) return undefined;
    const candidates = PROPERTY_GROUPS.flatMap(group => {
      const tiles = getPropertyGroupTiles(group.id);
      const owned = tiles.filter(tile => state.propertyOwnerships.some(entry => entry.tileIndex === tile.index && entry.ownerId === playerId));
      if (owned.length !== tiles.length - 1 || tiles.some(tile => (state.propertyOwnerships.find(entry => entry.tileIndex === tile.index)?.buildingLevel ?? 0) > 0)) return [];
      const tile = tiles.find(field => !owned.includes(field))!;
      const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === tile.index);
      const human = state.players.find(entry => entry.id === ownership?.ownerId);
      if (human?.type !== "human" || human.isBankrupt || human.connectionState !== "connected") return [];
      const normalValue = Math.max(0, tile.economy!.purchasePrice - (ownership?.mortgaged ? getEffectiveMortgageRedemptionCost(state, tile) : 0));
      const gold = Math.round(normalValue * 1.1 / 10) * 10;
      if (gold <= 0 || player.gold - gold < AI_ECONOMY_CONFIG.tradeGoldReserve) return [];
      const request: CreateTradeOfferRequest = { recipientId: human.id, offer: { gold, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [tile.index] } };
      const candidate: TradeOffer = { ...request, id: "ai-proposal-preview", proposerId: playerId, status: "pending", createdAt: 0 };
      return this.tradeValidator.isValid(state, candidate) ? [{ request, potential: tiles.reduce((sum, field) => sum + field.economy!.purchasePrice, 0) }] : [];
    });
    return candidates.sort((a, b) => b.potential - a.potential)[0]?.request;
  }

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
      .filter(({ tile }) => player.gold - getEffectiveBuildCost(state, tile) >= AI_ECONOMY_CONFIG.buildingGoldReserve)
      .sort((left, right) => {
        const leftStarted = state.propertyOwnerships.some((entry) => entry.ownerId === playerId && entry.buildingLevel > 0 && BOARD_TILES[entry.tileIndex]?.propertyGroup === left.tile.propertyGroup);
        const rightStarted = state.propertyOwnerships.some((entry) => entry.ownerId === playerId && entry.buildingLevel > 0 && BOARD_TILES[entry.tileIndex]?.propertyGroup === right.tile.propertyGroup);
        if (leftStarted !== rightStarted) return leftStarted ? -1 : 1;
        if (left.ownership.buildingLevel !== right.ownership.buildingLevel) return left.ownership.buildingLevel - right.ownership.buildingLevel;
        return getEffectiveBuildCost(state, left.tile) - getEffectiveBuildCost(state, right.tile);
      });
    return candidates[0]?.tile.index;
  }

  decideEmergencySale(state: GameState, playerId: string): number | undefined {
    return state.propertyOwnerships
      .filter((ownership) => ownership.ownerId === playerId && canSellBuilding(state, playerId, ownership.tileIndex).allowed)
      .sort((left, right) => {
        const leftCost = getEffectiveBuildingSaleValue(state, BOARD_TILES[left.tileIndex]!);
        const rightCost = getEffectiveBuildingSaleValue(state, BOARD_TILES[right.tileIndex]!);
        return rightCost - leftCost || right.buildingLevel - left.buildingLevel;
      })[0]?.tileIndex;
  }
}
