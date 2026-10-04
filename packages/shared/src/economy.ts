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
import { getPropertyGroupTiles } from "./board";
import type { BoardTile } from "./board";
import type { PropertyOwnership } from "./game";
import { isGroupEconomicallyActive } from "./finance";
