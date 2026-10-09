export const ECONOMY_CONFIG = {
  startingGold: 1500,
  passStartGold: 200,
  harborPrice: 200,
  utilityPrice: 150,
  crownTax: 200,
  dragonTithe: 100,
  dungeonReleaseCost: 50,
  auctionMinIncrement: 10,
  harborRents: [25, 50, 100, 200] as const,
  utilityMultipliers: [4, 10] as const
} as const;

export const STARTING_GOLD = ECONOMY_CONFIG.startingGold;
export const PASS_START_GOLD = ECONOMY_CONFIG.passStartGold;
export const HARBOR_PRICE = ECONOMY_CONFIG.harborPrice;
export const UTILITY_PRICE = ECONOMY_CONFIG.utilityPrice;
export const CROWN_TAX = ECONOMY_CONFIG.crownTax;
export const DRAGON_TITHE = ECONOMY_CONFIG.dragonTithe;
export const DUNGEON_RELEASE_COST = ECONOMY_CONFIG.dungeonReleaseCost;
export const AUCTION_MIN_INCREMENT = ECONOMY_CONFIG.auctionMinIncrement;

export const AUCTION_BID_INCREMENTS = [10, 50, 100] as const;
export type AuctionBidIncrement = (typeof AUCTION_BID_INCREMENTS)[number];

export function ownsCompletePropertyGroup(
  ownerships: readonly PropertyOwnership[],
  ownerId: string,
  propertyGroup: string
): boolean {
  const groupTiles = getPropertyGroupTiles(propertyGroup);
  return groupTiles.length > 0 && groupTiles.every((tile) => ownerships.some((entry) => entry.tileIndex === tile.index && entry.ownerId === ownerId));
}

export function calculatePropertyRent(
  ownerships: readonly PropertyOwnership[],
  tile: BoardTile,
  ownerId: string
): number {
  if (tile.type !== "property" || !tile.economy?.rentSchedule) return 0;
  const ownership = ownerships.find((entry) => entry.tileIndex === tile.index && entry.ownerId === ownerId);
  if (!ownership || ownership.mortgaged) return 0;
  if (ownership.buildingLevel > 0) return tile.economy.rentSchedule[ownership.buildingLevel];
  const baseRent = tile.economy.rentSchedule[0];
  return tile.propertyGroup
    && ownsCompletePropertyGroup(ownerships, ownerId, tile.propertyGroup)
    && isGroupEconomicallyActive(ownerships, ownerId, tile.propertyGroup)
    ? baseRent * 2
    : baseRent;
}
import { BOARD_TILES, getPropertyGroupTiles } from "./board";
import type { BoardTile } from "./board";
import type { GameState, PropertyOwnership } from "./game";
import { isGroupEconomicallyActive } from "./finance";
import { getActiveChronicleEvent, isChronicleTileAffected } from "./chronicle-events";
import { isRelicArmed } from "./relics";

export function getEffectivePurchasePrice(state: GameState, tile: BoardTile, buyerId = state.currentPlayerId): number {
  const price = tile.economy?.purchasePrice ?? 0;
  const unsold = !state.propertyOwnerships.some((entry) => entry.tileIndex === tile.index);
  if (!unsold) return price;
  const event = getActiveChronicleEvent(state);
  const directPurchase = !state.auction && state.turnPhase !== "auction";
  let effective = price;
  if (directPurchase && event?.effectType === "purchaseDiscount" && isChronicleTileAffected(event, tile)) effective = Math.round(effective * .8);
  if (directPurchase && isRelicArmed(state.players.find(player => player.id === buyerId), "merchant-seal")) effective = Math.round(effective * .75);
  if (directPurchase && state.worldImpulseEffects?.merchantLuck) effective = Math.round(effective * .85);
  return effective;
}

export function applyChronicleRentModifier(state: GameState, tile: BoardTile, rent: number): number {
  const event = getActiveChronicleEvent(state);
  if (!isChronicleTileAffected(event, tile)) return rent;
  if (event?.effectType === "rentDiscount") return Math.round(rent * .75);
  if (event?.effectType === "regionalRentBonus") return Math.round(rent * 1.25);
  return rent;
}

export function getEffectiveRent(state: GameState, tile: BoardTile, ownerId: string): number {
  const ownership = state.propertyOwnerships.find((entry) => entry.tileIndex === tile.index && entry.ownerId === ownerId);
  if (!ownership || ownership.mortgaged) return 0;
  let rent = 0;
  if (tile.type === "property") rent = calculatePropertyRent(state.propertyOwnerships, tile, ownerId);
  else {
    const count = state.propertyOwnerships.filter((entry) => entry.ownerId === ownerId && !entry.mortgaged && BOARD_TILES[entry.tileIndex]?.type === tile.type).length;
    if (tile.type === "harbor") rent = ECONOMY_CONFIG.harborRents[Math.max(0, count - 1)] ?? 0;
    if (tile.type === "utility") rent = ECONOMY_CONFIG.utilityMultipliers[count >= 2 ? 1 : 0] * (state.lastDiceRoll?.total ?? 0);
  }
  rent = applyChronicleRentModifier(state, tile, rent);
  if (tile.type === "harbor" && state.worldImpulseEffects?.harborWindUntilRound === state.currentRound) rent = Math.round(rent * 1.5);
  return rent;
}

export function getStartPassReward(state: GameState, playerId = state.currentPlayerId): number {
  const base = getActiveChronicleEvent(state)?.effectType === "startPassBonus" ? 300 : PASS_START_GOLD;
  return base + (isRelicArmed(state.players.find(player => player.id === playerId), "golden-feather") ? 100 : 0);
}
