import { BOARD_TILES, getPropertyGroupTiles, type RegionType } from "./board";
import { ownsCompletePropertyGroup } from "./economy";
import type { BuildingLevel, GameState, PropertyOwnership } from "./game";
import { getActiveChronicleEvent, isChronicleTileAffected } from "./chronicle-events";
import type { BoardTile } from "./board";

// Legacy snapshot fields only; construction and sales have no global stock limit.
export const BUILDING_BANK_CAPACITY = {
  settlementUnits: 32,
  grandStructures: 12
} as const;

export const BUILDING_SAFE_PHASES = ["waitingForRoll", "waitingForEndTurn"] as const;

export interface RealmBuildingTheme {
  region: RegionType;
  names: readonly [string, string, string, string, string];
}

export const REALM_BUILDING_THEMES: Readonly<Record<RegionType, RealmBuildingTheme>> = {
  elves: { region: "elves", names: ["Wurzelhütte", "Baumhaus", "Hainheiligtum", "Baumhalle", "Sternenzitadelle"] },
  humans: { region: "humans", names: ["Hütte", "Gehöft", "Herrenhaus", "Wehrturm", "Königsburg"] },
  orcs: { region: "orcs", names: ["Kriegshütte", "Raiderlager", "Kriegslager", "Bollwerk", "Eisenfestung"] },
  steppe: { region: "steppe", names: ["Wanderzelt", "Clanlager", "Totemsiedlung", "Große Halle", "Himmelsfeste"] }
};

export interface BuildingEligibility {
  allowed: boolean;
  reason?: string;
}

export function getBuildingName(region: RegionType, level: BuildingLevel): string {
  return level === 0 ? "Unbebaut" : REALM_BUILDING_THEMES[region].names[level - 1]!;
}

export function getEffectiveBuildCost(state: GameState, tile: BoardTile): number {
  const base = tile.economy?.buildCost ?? 0, event = getActiveChronicleEvent(state);
  const factor = isChronicleTileAffected(event, tile) ? event?.effectType === "buildDiscount" ? .75 : event?.effectType === "buildSurcharge" ? 1.25 : 1 : 1;
  return Math.round(base * factor);
}

export function getEffectiveBuildingSaleValue(state: GameState, tile: BoardTile): number {
  const event = getActiveChronicleEvent(state);
  const factor = event?.effectType === "buildingSaleBonus" && isChronicleTileAffected(event, tile) ? .75 : .5;
  return Math.round((tile.economy?.buildCost ?? 0) * factor);
}

export function getPropertyOwnership(state: Pick<GameState, "propertyOwnerships">, tileIndex: number): PropertyOwnership | undefined {
  return state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex);
}

function connectedGameIsStable(state: GameState): BuildingEligibility {
  if (state.status !== "playing") return { allowed: false, reason: "Die Partie läuft noch nicht." };
  if (state.auction || state.turnPhase === "auction") return { allowed: false, reason: "Während einer Auktion kann nicht gebaut werden." };
  if (state.players.some((player) => player.type === "human" && player.connectionState === "disconnected")) {
    return { allowed: false, reason: "Die Partie wartet auf eine Wiederverbindung." };
  }
  return { allowed: true };
}

export function canBuildOnProperty(state: GameState, playerId: string, tileIndex: number): BuildingEligibility {
  const stable = connectedGameIsStable(state);
  if (!stable.allowed) return stable;
  if (!(BUILDING_SAFE_PHASES as readonly string[]).includes(state.turnPhase)) {
    return { allowed: false, reason: state.turnPhase === "paymentRequired" ? "Während einer offenen Forderung kann nicht gebaut werden." : "Bauen ist erst in einer ruhigen Spielphase möglich." };
  }
  if (state.pendingPayment) return { allowed: false, reason: "Zuerst muss die offene Forderung beglichen werden." };
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return { allowed: false, reason: "Dieser Gefährte wurde nicht gefunden." };
  const tile = BOARD_TILES[tileIndex];
  if (!tile || tile.type !== "property" || !tile.propertyGroup || !tile.economy?.buildCost) {
    return { allowed: false, reason: "Auf diesem Feld können keine Bauwerke errichtet werden." };
  }
  const ownership = getPropertyOwnership(state, tileIndex);
  if (!ownership || ownership.ownerId !== playerId) return { allowed: false, reason: "Dieses Grundstück gehört dir nicht." };
  if (!ownsCompletePropertyGroup(state.propertyOwnerships, playerId, tile.propertyGroup)) {
    return { allowed: false, reason: "Du besitzt nicht die gesamte Baugruppe." };
  }
  if (getPropertyGroupTiles(tile.propertyGroup).some((groupTile) => getPropertyOwnership(state, groupTile.index)?.mortgaged)) {
    return { allowed: false, reason: "Zuerst müssen alle Hypotheken dieser Baugruppe ausgelöst werden." };
  }
  if (ownership.buildingLevel >= 5) return { allowed: false, reason: "Hier steht bereits die größte Festung." };

  const groupOwnerships = getPropertyGroupTiles(tile.propertyGroup).map((groupTile) => getPropertyOwnership(state, groupTile.index)!);
  const minimum = Math.min(...groupOwnerships.map((entry) => entry.buildingLevel));
  if (ownership.buildingLevel !== minimum) {
    const nextTile = getPropertyGroupTiles(tile.propertyGroup).find((groupTile) => getPropertyOwnership(state, groupTile.index)?.buildingLevel === minimum);
    return { allowed: false, reason: `Du musst zuerst ${nextTile?.name ?? "ein anderes Grundstück"} ausbauen.` };
  }
  if (player.gold < getEffectiveBuildCost(state, tile)) return { allowed: false, reason: "Nicht genügend Gold." };
  return { allowed: true };
}

export function canSellBuilding(state: GameState, playerId: string, tileIndex: number): BuildingEligibility {
  if (state.status !== "playing") return { allowed: false, reason: "Die Partie läuft noch nicht." };
  if (state.auction || state.turnPhase === "auction") return { allowed: false, reason: "Während einer Auktion können keine Bauwerke verkauft werden." };
  const isPaymentSale = state.turnPhase === "paymentRequired" && state.pendingPayment?.payerId === playerId;
  if (!isPaymentSale) {
    const stable = connectedGameIsStable(state);
    if (!stable.allowed) return stable;
    if (!(BUILDING_SAFE_PHASES as readonly string[]).includes(state.turnPhase)) {
      return { allowed: false, reason: "Verkaufen ist erst in einer ruhigen Spielphase möglich." };
    }
  }
  const tile = BOARD_TILES[tileIndex];
  if (!tile || tile.type !== "property" || !tile.propertyGroup || !tile.economy?.buildCost) {
    return { allowed: false, reason: "Auf diesem Feld gibt es keine verkaufbare Baustufe." };
  }
  const ownership = getPropertyOwnership(state, tileIndex);
  if (!ownership || ownership.ownerId !== playerId) return { allowed: false, reason: "Dieses Grundstück gehört dir nicht." };
  if (ownership.buildingLevel === 0) return { allowed: false, reason: "Auf diesem Grundstück steht noch kein Bauwerk." };

  const groupOwnerships = getPropertyGroupTiles(tile.propertyGroup)
    .map((groupTile) => getPropertyOwnership(state, groupTile.index))
    .filter((entry): entry is PropertyOwnership => Boolean(entry?.ownerId === playerId));
  const maximum = Math.max(...groupOwnerships.map((entry) => entry.buildingLevel));
  if (ownership.buildingLevel !== maximum) {
    const nextTile = getPropertyGroupTiles(tile.propertyGroup).find((groupTile) => getPropertyOwnership(state, groupTile.index)?.buildingLevel === maximum);
    return { allowed: false, reason: `Du musst zuerst eine höhere Baustufe auf ${nextTile?.name ?? "einem anderen Grundstück"} verkaufen.` };
  }
  return { allowed: true };
}
