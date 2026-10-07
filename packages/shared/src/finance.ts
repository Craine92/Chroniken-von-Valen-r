import { BOARD_TILES, getPropertyGroupTiles, type BoardTile } from "./board";
import type { GameState, PropertyOwnership } from "./game";
import { getActiveChronicleEvent, isChronicleTileAffected } from "./chronicle-events";

export interface FinanceEligibility { allowed: boolean; reason?: string }
const FINANCE_SAFE_PHASES = ["waitingForRoll", "waitingForEndTurn"] as const;
const getPropertyOwnership = (state: Pick<GameState, "propertyOwnerships">, tileIndex: number) => state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex);

export const MORTGAGE_INTEREST_RATE = 0.1;

export function getMortgageValue(tile: BoardTile): number {
  return tile.economy ? Math.floor(tile.economy.purchasePrice / 2) : 0;
}

export function getMortgageRedemptionCost(tile: BoardTile): number {
  return Math.ceil((getMortgageValue(tile) * 110) / 100);
}

export function getEffectiveMortgageRedemptionCost(state: GameState, tile: BoardTile): number {
  const event = getActiveChronicleEvent(state);
  return Math.round(getMortgageRedemptionCost(tile) * (event?.effectType === "mortgageDiscount" && isChronicleTileAffected(event, tile) ? .75 : 1));
}

export function isGroupEconomicallyActive(ownerships: readonly PropertyOwnership[], ownerId: string, propertyGroup: string): boolean {
  const groupTiles = getPropertyGroupTiles(propertyGroup);
  return groupTiles.length > 0 && groupTiles.every((tile) => {
    const ownership = ownerships.find((entry) => entry.tileIndex === tile.index);
    return ownership?.ownerId === ownerId && !ownership.mortgaged;
  });
}

function isMortgagePhaseAllowed(state: GameState, playerId: string): boolean {
  return (FINANCE_SAFE_PHASES as readonly string[]).includes(state.turnPhase)
    || (state.turnPhase === "paymentRequired" && state.pendingPayment?.payerId === playerId);
}

export function canMortgageProperty(state: GameState, playerId: string, tileIndex: number): FinanceEligibility {
  if (state.status !== "playing") return { allowed: false, reason: "Die Partie läuft nicht." };
  if (!isMortgagePhaseAllowed(state, playerId) || state.auction) return { allowed: false, reason: "Beleihen ist nur in einer ruhigen Spielphase möglich." };
  if (state.players.some((player) => player.type === "human" && player.connectionState === "disconnected") && state.turnPhase !== "paymentRequired") {
    return { allowed: false, reason: "Die Partie wartet auf eine Wiederverbindung." };
  }
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || player.isBankrupt) return { allowed: false, reason: "Dieser Gefährte ist nicht aktiv." };
  const tile = BOARD_TILES[tileIndex];
  if (!tile?.economy || !["property", "harbor", "utility"].includes(tile.type)) return { allowed: false, reason: "Dieses Feld kann nicht beliehen werden." };
  const ownership = getPropertyOwnership(state, tileIndex);
  if (!ownership || ownership.ownerId !== playerId) return { allowed: false, reason: "Dieses Feld gehört dir nicht." };
  if (ownership.mortgaged) return { allowed: false, reason: "Dieses Feld ist bereits verpfändet." };
  if (tile.type === "property" && tile.propertyGroup) {
    const hasBuildings = getPropertyGroupTiles(tile.propertyGroup).some((groupTile) => (getPropertyOwnership(state, groupTile.index)?.buildingLevel ?? 0) > 0);
    if (hasBuildings) return { allowed: false, reason: "Zuerst müssen alle Bauwerke dieser Region verkauft werden." };
  }
  return { allowed: true };
}

export function canRedeemMortgage(state: GameState, playerId: string, tileIndex: number): FinanceEligibility {
  if (state.status !== "playing" || !isMortgagePhaseAllowed(state, playerId) || state.auction) return { allowed: false, reason: "Die Hypothek kann gerade nicht ausgelöst werden." };
  const player = state.players.find((entry) => entry.id === playerId);
  const tile = BOARD_TILES[tileIndex];
  const ownership = getPropertyOwnership(state, tileIndex);
  if (!player || player.isBankrupt || !tile?.economy || !ownership || ownership.ownerId !== playerId) return { allowed: false, reason: "Dieses Feld gehört dir nicht." };
  if (!ownership.mortgaged) return { allowed: false, reason: "Dieses Feld ist nicht verpfändet." };
  if (player.gold < getEffectiveMortgageRedemptionCost(state, tile)) return { allowed: false, reason: "Nicht genügend Gold." };
  return { allowed: true };
}
