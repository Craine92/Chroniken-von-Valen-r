import { BOARD_TILES, type BoardTile } from "./board";
import type { GameState } from "./game";
import { ECONOMY_CONFIG, getBaseRent, getEffectivePurchasePrice, getEffectiveRent, ownsCompletePropertyGroup } from "./economy";
import { getBuildingName, getEffectiveBuildCost, getEffectiveBuildingSaleValue } from "./building";
import { getEffectiveMortgageRedemptionCost, getMortgageRedemptionCost, isGroupEconomicallyActive } from "./finance";
import { getActiveChronicleEvent, isChronicleTileAffected } from "./chronicle-events";
import { RELIC_DEFINITIONS, isRelicArmed } from "./relics";
import { WORLD_IMPULSE_DEFINITIONS } from "./world-impulses";

/**
 * Preise, die Ereignisse, Weltimpulse oder Relikte verändern – mit Grundpreis und Grund. Der tatsächliche Preis kommt
 * immer aus denselben Funktionen, mit denen auch der Server abrechnet; hier wird nur erklärt, warum er abweicht.
 */
export type PriceKind = "purchase" | "build" | "rent" | "mortgageRedemption" | "buildingSale";

export interface PriceModifier {
  /** Zum Beispiel „Segen der Baumeister“. */
  label: string;
  /** Kurz: „−25 %“, „+50 %“ oder „75 % statt 50 %“. */
  effect: string;
  source: "chronicle" | "worldImpulse" | "relic";
}

export interface PriceInfo {
  base: number;
  effective: number;
  modifiers: PriceModifier[];
  /** Weicht der tatsächliche Preis vom Grundpreis ab? */
  changed: boolean;
}

const impulseTitle = (id: (typeof WORLD_IMPULSE_DEFINITIONS)[number]["id"]) => WORLD_IMPULSE_DEFINITIONS.find(impulse => impulse.id === id)!.title;

/** Wirkung des Chronik-Ereignisses auf diese Preisart, falls es das Feld betrifft. */
function chronicleModifier(state: GameState, tile: BoardTile, kind: PriceKind): PriceModifier | undefined {
  const event = getActiveChronicleEvent(state);
  if (!event || !isChronicleTileAffected(event, tile)) return undefined;
  const effect = ({
    purchase: { purchaseDiscount: "−20 %" },
    build: { buildDiscount: "−25 %", buildSurcharge: "+25 %" },
    rent: { rentDiscount: "−25 %", regionalRentBonus: "+25 %" },
    mortgageRedemption: { mortgageDiscount: "−25 %" },
    buildingSale: { buildingSaleBonus: "75 % statt 50 %" }
  } as Record<PriceKind, Partial<Record<string, string>>>)[kind][event.effectType];
  return effect ? { label: event.title, effect, source: "chronicle" } : undefined;
}

export function getPriceInfo(state: GameState, tile: BoardTile, kind: PriceKind, playerId = state.currentPlayerId): PriceInfo {
  const modifiers: PriceModifier[] = [];
  let base = 0, effective = 0;
  const chronicle = chronicleModifier(state, tile, kind);
  switch (kind) {
    case "purchase": {
      base = tile.economy?.purchasePrice ?? 0;
      effective = getEffectivePurchasePrice(state, tile, playerId);
      const unsold = !state.propertyOwnerships.some(entry => entry.tileIndex === tile.index);
      const direct = !state.auction && state.turnPhase !== "auction";
      if (unsold && direct) {
        if (chronicle) modifiers.push(chronicle);
        if (isRelicArmed(state.players.find(player => player.id === playerId), "merchant-seal")) modifiers.push({ label: RELIC_DEFINITIONS["merchant-seal"].name, effect: "−25 %", source: "relic" });
        if (state.worldImpulseEffects?.merchantLuck) modifiers.push({ label: impulseTitle("merchantLuck"), effect: "−15 %", source: "worldImpulse" });
      }
      break;
    }
    case "build":
      base = tile.economy?.buildCost ?? 0;
      effective = getEffectiveBuildCost(state, tile);
      if (chronicle) modifiers.push(chronicle);
      if (state.worldImpulseEffects?.buildingFervor) modifiers.push({ label: impulseTitle("buildingFervor"), effect: "−20 %", source: "worldImpulse" });
      break;
    case "rent": {
      const ownerId = state.propertyOwnerships.find(entry => entry.tileIndex === tile.index)?.ownerId;
      base = ownerId ? getBaseRent(state, tile, ownerId) : tile.economy?.baseRent ?? 0;
      effective = ownerId ? getEffectiveRent(state, tile, ownerId) : base;
      if (ownerId && base > 0) {
        if (chronicle) modifiers.push(chronicle);
        if (tile.type === "harbor" && state.worldImpulseEffects?.harborWindUntilRound === state.currentRound) modifiers.push({ label: impulseTitle("harborWind"), effect: "+50 %", source: "worldImpulse" });
      }
      break;
    }
    case "mortgageRedemption":
      base = getMortgageRedemptionCost(tile);
      effective = getEffectiveMortgageRedemptionCost(state, tile);
      if (chronicle) modifiers.push(chronicle);
      break;
    case "buildingSale":
      base = Math.round((tile.economy?.buildCost ?? 0) * .5);
      effective = getEffectiveBuildingSaleValue(state, tile);
      if (chronicle) modifiers.push(chronicle);
      break;
  }
  return { base, effective, modifiers, changed: effective !== base };
}

/** Woraus sich die Miete eines besessenen Feldes zusammensetzt (ohne Ereignisse, die zeigt getPriceInfo). */
export function describeRent(state: GameState, tile: BoardTile): string[] {
  const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === tile.index);
  if (!ownership) return [];
  if (ownership.mortgaged) return ["Belehnt – keine Miete"];
  if (tile.type === "property") {
    if (ownership.buildingLevel > 0 && tile.region) return [`${getBuildingName(tile.region, ownership.buildingLevel)} (Stufe ${ownership.buildingLevel})`];
    const complete = tile.propertyGroup && ownsCompletePropertyGroup(state.propertyOwnerships, ownership.ownerId, tile.propertyGroup)
      && isGroupEconomicallyActive(state.propertyOwnerships, ownership.ownerId, tile.propertyGroup);
    return complete ? ["Gruppe komplett – doppelte Miete"] : ["Grundmiete"];
  }
  const count = state.propertyOwnerships.filter(entry => entry.ownerId === ownership.ownerId && !entry.mortgaged && BOARD_TILES[entry.tileIndex]?.type === tile.type).length;
  if (tile.type === "harbor") return [count === 1 ? "1 Hafen" : `${count} Häfen`];
  if (tile.type === "utility") {
    const factor = ECONOMY_CONFIG.utilityMultipliers[count >= 2 ? 1 : 0];
    return [`Wurf ${state.lastDiceRoll?.total ?? 0} × ${factor}`];
  }
  return [];
}
