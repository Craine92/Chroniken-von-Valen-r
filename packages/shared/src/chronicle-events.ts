import type { GameState } from "./game";
import type { BoardTile, BoardTileType, RegionType } from "./board";

export const CHRONICLE_REGIONS = {
  elves: { name: "Amethystwald" }, humans: { name: "Kronenwald" },
  orcs: { name: "Eisenöde" }, steppe: { name: "Sonnensteppe" }
} as const;
export const BLOOD_MOON_REGIONS = CHRONICLE_REGIONS;

export interface ChronicleEvent {
  id: string;
  title: string;
  description: string;
  effectSummary: string;
  durationRounds: number;
  effectType: "purchaseDiscount" | "regionalRentBonus" | "startPassBonus" | "rentDiscount" | "buildDiscount" | "buildSurcharge" | "mortgageDiscount" | "buildingSaleBonus";
  targetRegion?: RegionType;
  targetRegions?: RegionType[];
  affectedTileTypes?: readonly BoardTileType[];
}

export interface ActiveChronicleEvent extends ChronicleEvent {
  startedAfterRound: number;
  startedAtRound: number;
  expiresAtRound: number;
  startedAt: number;
}

export const CHRONICLE_EVENTS: readonly ChronicleEvent[] = [
  { id: "traders-festival", title: "Fest der Händler", description: "Unverkaufte Grundstücke in den betroffenen Reichen kosten 20 % weniger.", effectSummary: "Kaufpreise: −20 %", durationRounds: 2, effectType: "purchaseDiscount", affectedTileTypes: ["property", "harbor", "utility"] },
  { id: "blood-moon", title: "Blutmond", description: "Grundstücksmieten in den betroffenen Reichen sind 25 % höher.", effectSummary: "Mieten: +25 %", durationRounds: 2, effectType: "regionalRentBonus", affectedTileTypes: ["property"] },
  { id: "runegate-blessing", title: "Segen des Runentors", description: "Beim Passieren des Runentors erhältst du insgesamt 300 Gold.", effectSummary: "Runentor: 300 statt 200 Gold", durationRounds: 2, effectType: "startPassBonus" },
  { id: "four-realms-peace", title: "Frieden der vier Reiche", description: "Mieten in den betroffenen Reichen sind 25 % niedriger.", effectSummary: "Mieten: −25 %", durationRounds: 2, effectType: "rentDiscount", affectedTileTypes: ["property", "harbor", "utility"] },
  { id: "builders-blessing", title: "Segen der Baumeister", description: "Bauwerke in den betroffenen Reichen kosten 25 % weniger.", effectSummary: "Baukosten: −25 %", durationRounds: 2, effectType: "buildDiscount", affectedTileTypes: ["property"] },
  { id: "resource-shortage", title: "Rohstoffknappheit", description: "Bauwerke in den betroffenen Reichen kosten 25 % mehr.", effectSummary: "Baukosten: +25 %", durationRounds: 2, effectType: "buildSurcharge", affectedTileTypes: ["property"] },
  { id: "crown-decree", title: "Erlass der Krone", description: "Hypotheken in den betroffenen Reichen können 25 % günstiger ausgelöst werden.", effectSummary: "Hypotheken-Auslösung: −25 %", durationRounds: 2, effectType: "mortgageDiscount", affectedTileTypes: ["property", "harbor", "utility"] },
  { id: "golden-building-boom", title: "Goldene Baukonjunktur", description: "Beim Verkauf von Baustufen in den betroffenen Reichen erhältst du 75 % der ursprünglichen Baukosten.", effectSummary: "Gebäudeverkauf: 75 % Baukosten", durationRounds: 2, effectType: "buildingSaleBonus", affectedTileTypes: ["property"] }
];

export function getBloodMoonDefinition(targetRegion: RegionType): ChronicleEvent {
  return getRegionalChronicleDefinition(CHRONICLE_EVENTS[1]!, [targetRegion]);
}

/** Single-region snapshots remain readable; newly created events use targetRegions. */
export function getChronicleTargetRegions(event: ChronicleEvent | undefined): RegionType[] {
  if (!event || event.effectType === "startPassBonus") return [];
  return [...new Set(event.targetRegions ?? (event.targetRegion ? [event.targetRegion] : []))];
}

export function getChronicleRegionLabel(event: ChronicleEvent): string {
  const regions = getChronicleTargetRegions(event);
  return regions.length === 4 ? "ALLE VIER REICHE" : regions.length === 3 ? "3 Reiche betroffen" : regions.map(region => CHRONICLE_REGIONS[region].name).join(" · ");
}

export function getRegionalChronicleDefinition(definition: ChronicleEvent, regions: readonly RegionType[]): ChronicleEvent {
  const { targetRegion: _legacy, targetRegions: _targets, ...base } = definition;
  if (base.effectType === "startPassBonus") return base;
  const targetRegions = [...new Set(regions)];
  const names = targetRegions.map(region => CHRONICLE_REGIONS[region].name).join(" · ");
  return { ...base, targetRegions, description: `${names}: ${base.description}` };
}

export function isChronicleTileAffected(event: ChronicleEvent | undefined, tile: BoardTile): boolean {
  if (!event || !tile.region || !getChronicleTargetRegions(event).includes(tile.region)) return false;
  // Older blood-moon snapshots affected property rents only.
  const types = event.affectedTileTypes ?? (event.effectType === "regionalRentBonus" ? ["property"] : ["property", "harbor", "utility"]);
  return types.includes(tile.type);
}

export function getActiveChronicleEvent(state: Pick<GameState, "activeChronicleEvent" | "currentRound">): ActiveChronicleEvent | undefined {
  const event = state.activeChronicleEvent;
  return event && state.currentRound >= event.startedAtRound && state.currentRound < event.expiresAtRound ? event : undefined;
}

export function getChronicleRoundsRemaining(state: Pick<GameState, "activeChronicleEvent" | "currentRound">): number {
  const event = getActiveChronicleEvent(state);
  return event ? event.expiresAtRound - state.currentRound : 0;
}
