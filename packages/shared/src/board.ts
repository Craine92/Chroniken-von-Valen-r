import { PROPERTY_GROUPS, getPropertyGroup, getPropertyGroupForProperty, type PropertyGroupId } from "./property-groups";

export type RegionType = "elves" | "humans" | "orcs" | "steppe";
export type PropertyRentSchedule = readonly [number, number, number, number, number, number];

export type BoardTileType =
  | "start"
  | "property"
  | "adventure"
  | "fate"
  | "tax"
  | "harbor"
  | "utility"
  | "dungeon"
  | "rest"
  | "goToDungeon";

export interface BoardTile {
  id: string;
  index: number;
  name: string;
  type: BoardTileType;
  region?: RegionType;
  propertyGroupId?: PropertyGroupId;
  propertyGroup?: string;
  economy?: {
    purchasePrice: number;
    baseRent?: number;
    rentSchedule?: PropertyRentSchedule;
    buildCost?: number;
  };
}

export function isBuyableTile(tile: BoardTile): boolean {
  return tile.type === "property" || tile.type === "harbor" || tile.type === "utility";
}

const PROPERTY_ECONOMY: Readonly<Record<number, { purchasePrice: number; rentSchedule: PropertyRentSchedule }>> = {
  1: { purchasePrice: 60, rentSchedule: [2, 10, 30, 90, 160, 250] },
  3: { purchasePrice: 60, rentSchedule: [4, 20, 60, 180, 320, 450] },
  6: { purchasePrice: 100, rentSchedule: [6, 30, 90, 270, 400, 550] },
  8: { purchasePrice: 100, rentSchedule: [6, 30, 90, 270, 400, 550] },
  9: { purchasePrice: 120, rentSchedule: [8, 40, 100, 300, 450, 600] },
  11: { purchasePrice: 140, rentSchedule: [10, 50, 150, 450, 625, 750] },
  13: { purchasePrice: 140, rentSchedule: [10, 50, 150, 450, 625, 750] },
  14: { purchasePrice: 160, rentSchedule: [12, 60, 180, 500, 700, 900] },
  16: { purchasePrice: 180, rentSchedule: [14, 70, 200, 550, 750, 950] },
  18: { purchasePrice: 180, rentSchedule: [14, 70, 200, 550, 750, 950] },
  19: { purchasePrice: 200, rentSchedule: [16, 80, 220, 600, 800, 1000] },
  21: { purchasePrice: 220, rentSchedule: [18, 90, 250, 700, 875, 1050] },
  23: { purchasePrice: 220, rentSchedule: [18, 90, 250, 700, 875, 1050] },
  24: { purchasePrice: 240, rentSchedule: [20, 100, 300, 750, 925, 1100] },
  26: { purchasePrice: 260, rentSchedule: [22, 110, 330, 800, 975, 1150] },
  27: { purchasePrice: 260, rentSchedule: [22, 110, 330, 800, 975, 1150] },
  29: { purchasePrice: 280, rentSchedule: [24, 120, 360, 850, 1025, 1200] },
  31: { purchasePrice: 300, rentSchedule: [26, 130, 390, 900, 1100, 1275] },
  32: { purchasePrice: 300, rentSchedule: [26, 130, 390, 900, 1100, 1275] },
  34: { purchasePrice: 320, rentSchedule: [28, 150, 450, 1000, 1200, 1400] },
  37: { purchasePrice: 350, rentSchedule: [35, 175, 500, 1100, 1300, 1500] },
  39: { purchasePrice: 400, rentSchedule: [50, 200, 600, 1400, 1700, 2000] }
};

const SPECIAL_ECONOMY: Readonly<Record<number, { purchasePrice: number }>> = {
  5: { purchasePrice: 200 }, 15: { purchasePrice: 200 },
  25: { purchasePrice: 200 }, 35: { purchasePrice: 200 },
  12: { purchasePrice: 150 }, 28: { purchasePrice: 150 }
};

function withEconomy(tile: BoardTile, economyIndex = tile.index): BoardTile {
  const propertyEconomy = PROPERTY_ECONOMY[economyIndex];
  const propertyGroup = getPropertyGroup(tile.propertyGroupId);
  if (propertyEconomy && propertyGroup) {
    return {
      ...tile,
      propertyGroup: propertyGroup.displayName,
      economy: {
        ...propertyEconomy,
        baseRent: propertyEconomy.rentSchedule[0],
        buildCost: propertyGroup.buildCost
      }
    };
  }
  const economy = SPECIAL_ECONOMY[economyIndex];
  return economy ? { ...tile, economy } : tile;
}

type BoardTileDefinition = Omit<BoardTile, "id">;
const BOARD_DEFINITIONS: readonly BoardTileDefinition[] = [
  { index: 0, name: "Runentor", type: "start" },
  { index: 1, name: "Mondpfad", type: "property", region: "elves", propertyGroupId: "group_mondhain" },
  { index: 2, name: "Schicksal", type: "fate", region: "elves" },
  { index: 3, name: "Sternenlichtung", type: "property", region: "elves", propertyGroupId: "group_mondhain" },
  { index: 4, name: "Kronenzoll", type: "tax", region: "elves" },
  { index: 5, name: "Nordhafen", type: "harbor", region: "elves" },
  { index: 6, name: "Flüsterhain", type: "property", region: "elves", propertyGroupId: "group_amethystwald" },
  { index: 7, name: "Abenteuer", type: "adventure", region: "elves" },
  { index: 8, name: "Silberblatt", type: "property", region: "elves", propertyGroupId: "group_amethystwald" },
  { index: 9, name: "Amethystkrone", type: "property", region: "elves", propertyGroupId: "group_amethystwald" },
  { index: 10, name: "Dunkler Kerker", type: "dungeon" },
  { index: 11, name: "Mühlenweg", type: "property", region: "humans", propertyGroupId: "group_silberbach" },
  { index: 12, name: "Windmühle", type: "utility", region: "humans" },
  { index: 13, name: "Königsfurt", type: "property", region: "humans", propertyGroupId: "group_silberbach" },
  { index: 14, name: "Rosenhain", type: "property", region: "humans", propertyGroupId: "group_silberbach" },
  { index: 15, name: "Nebelbucht", type: "harbor", region: "humans" },
  { index: 16, name: "Falkenruh", type: "property", region: "humans", propertyGroupId: "group_kronenwald" },
  { index: 17, name: "Schicksal", type: "fate", region: "humans" },
  { index: 18, name: "Grünwacht", type: "property", region: "humans", propertyGroupId: "group_kronenwald" },
  { index: 19, name: "Königsforst", type: "property", region: "humans", propertyGroupId: "group_kronenwald" },
  { index: 20, name: "Taverne am Weltenweg", type: "rest" },
  { index: 21, name: "Staubkamm", type: "property", region: "orcs", propertyGroupId: "group_aschelande" },
  { index: 22, name: "Abenteuer", type: "adventure", region: "orcs" },
  { index: 23, name: "Knochenpass", type: "property", region: "orcs", propertyGroupId: "group_aschelande" },
  { index: 24, name: "Rotfels", type: "property", region: "orcs", propertyGroupId: "group_aschelande" },
  { index: 25, name: "Sonnenhafen", type: "harbor", region: "orcs" },
  { index: 26, name: "Eisenklamm", type: "property", region: "orcs", propertyGroupId: "group_eisenoede" },
  { index: 27, name: "Kriegsgrund", type: "property", region: "orcs", propertyGroupId: "group_eisenoede" },
  { index: 28, name: "Alter Brunnen", type: "utility", region: "orcs" },
  { index: 29, name: "Schwarzgrat", type: "property", region: "orcs", propertyGroupId: "group_eisenoede" },
  { index: 30, name: "In den Kerker", type: "goToDungeon" },
  { index: 31, name: "Windgras", type: "property", region: "steppe", propertyGroupId: "group_sonnensteppe" },
  { index: 32, name: "Adlerhöhe", type: "property", region: "steppe", propertyGroupId: "group_sonnensteppe" },
  { index: 33, name: "Schicksal", type: "fate", region: "steppe" },
  { index: 34, name: "Donnerpfad", type: "property", region: "steppe", propertyGroupId: "group_sonnensteppe" },
  { index: 35, name: "Sturmkai", type: "harbor", region: "steppe" },
  { index: 36, name: "Abenteuer", type: "adventure", region: "steppe" },
  { index: 37, name: "Geistertal", type: "property", region: "steppe", propertyGroupId: "group_himmelsweite" },
  { index: 38, name: "Drachenzehnt", type: "tax", region: "steppe" },
  { index: 39, name: "Himmelsgrat", type: "property", region: "steppe", propertyGroupId: "group_himmelsweite" }
];

const BOARD_TILE_IDS = [
  "runentor", "mondpfad", "schicksal-mondhain", "sternenlichtung", "kronenzoll", "nordhafen", "fluesterhain", "abenteuer-mondhain", "silberblatt", "amethystkrone",
  "dunkler-kerker", "muehlenweg", "windmuehle", "koenigsfurt", "rosenhain", "nebelbucht", "falkenruh", "schicksal-kronenwald", "gruenwacht", "koenigsforst",
  "taverne-weltenweg", "staubkamm", "abenteuer-aschelande", "knochenpass", "rotfels", "sonnenhafen", "eisenklamm", "kriegsgrund", "alter-brunnen", "schwarzgrat",
  "in-den-kerker", "windgras", "adlerhoehe", "schicksal-sonnensteppe", "donnerpfad", "sturmkai", "abenteuer-himmelsweite", "geistertal", "drachenzehnt", "himmelsgrat"
] as const;

// 14 / 6 / 14 / 6 widescreen route. Stable IDs and economy values are read
// from the original definitions; only their position in the 40-field loop changes.
const BOARD_TILE_SOURCE_ORDER = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 10,
  14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 30,
  34, 35, 36, 37, 38, 39
] as const;

export const START_TILE_INDEX = 0;
export const DUNGEON_TILE_INDEX = 13;
export const REST_TILE_INDEX = 20;
export const GO_TO_DUNGEON_TILE_INDEX = 33;
export const BOARD_CORNER_TILE_INDICES = [START_TILE_INDEX, DUNGEON_TILE_INDEX, REST_TILE_INDEX, GO_TO_DUNGEON_TILE_INDEX] as const;

export const BOARD_TILES: readonly BoardTile[] = BOARD_TILE_SOURCE_ORDER.map((sourceIndex, index) =>
  withEconomy({ ...BOARD_DEFINITIONS[sourceIndex]!, id: BOARD_TILE_IDS[sourceIndex]!, index }, sourceIndex)
);

export function getPropertyGroupTiles(groupReference: PropertyGroupId | string): readonly BoardTile[] {
  const group = getPropertyGroup(groupReference);
  if (!group) return [];
  return group.propertyIds.map((propertyId) => BOARD_TILES.find((tile) => tile.id === propertyId)).filter((tile): tile is BoardTile => Boolean(tile));
}

export function validateBoardTiles(tiles: readonly BoardTile[] = BOARD_TILES): void {
  if (tiles.length !== 40) throw new Error(`Valenør benötigt genau 40 Brettfelder, erhalten: ${tiles.length}.`);
  const indices = tiles.map((tile) => tile.index);
  const uniqueIndices = new Set(indices);
  if (uniqueIndices.size !== 40 || indices.some((index) => index < 0 || index > 39)) {
    throw new Error("Valenørs Brettfelder müssen die eindeutigen Indizes 0 bis 39 besitzen.");
  }
  for (let index = 0; index < 40; index += 1) {
    if (!uniqueIndices.has(index)) throw new Error(`Valenørs Brettfeld ${index} fehlt.`);
  }
  const ids = tiles.map((tile) => tile.id);
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== 40) throw new Error("Valenørs Brettfelder benötigen 40 eindeutige IDs.");
  const propertyIds = tiles.filter((tile) => tile.type === "property").map((tile) => tile.id);
  const configuredPropertyIds = PROPERTY_GROUPS.flatMap((group) => {
    if (group.propertyIds.length !== group.size) throw new Error(`${group.displayName} muss exakt ${group.size} Straßen enthalten.`);
    return [...group.propertyIds];
  });
  if (new Set(configuredPropertyIds).size !== configuredPropertyIds.length) throw new Error("Eine Straße darf nur einer Baugruppe angehören.");
  if (propertyIds.some((id) => !getPropertyGroupForProperty(id)) || configuredPropertyIds.some((id) => !propertyIds.includes(id))) {
    throw new Error("Jede kaufbare Straße muss explizit genau einer Baugruppe zugeordnet sein.");
  }
}
