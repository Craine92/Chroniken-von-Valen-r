import { getPropertyGroup, type BoardTile, type BoardTileType, type RegionType } from "@valenor/shared";

export type TileVisualVariant = BoardTileType;

export interface TilePalette {
  surfaceTop: number;
  surfaceBottom: number;
  panel: number;
  header: number;
  accent: number;
  rim: number;
  highlight: number;
  text: string;
  mutedText: string;
  specialFrame: boolean;
}

export interface PropertyGroupVisual {
  accent: number;
  cssAccent: string;
  sigil: string;
  size: 2 | 3;
}

const FALLBACK_GROUP_VISUAL: PropertyGroupVisual = {
  accent: 0xd6bd78,
  cssAccent: "#d6bd78",
  sigil: "◇",
  size: 3
};

const REGION_PALETTES: Record<RegionType, TilePalette> = {
  elves: {
    surfaceTop: 0x241832, surfaceBottom: 0x100d18, panel: 0x171020, header: 0x5e3d78,
    accent: 0xc49af2, rim: 0x8f7444, highlight: 0xf1d9a2, text: "#fff4dc", mutedText: "#cdb8df", specialFrame: false
  },
  humans: {
    surfaceTop: 0x17271f, surfaceBottom: 0x0b1511, panel: 0x102019, header: 0x315f46,
    accent: 0x91d49d, rim: 0xa1844b, highlight: 0xf2d99d, text: "#fff4dc", mutedText: "#bcd2bd", specialFrame: false
  },
  orcs: {
    surfaceTop: 0x301815, surfaceBottom: 0x160b0a, panel: 0x21100e, header: 0x713328,
    accent: 0xe37b55, rim: 0x8a6845, highlight: 0xf0cf91, text: "#fff0dc", mutedText: "#d5b1a0", specialFrame: false
  },
  steppe: {
    surfaceTop: 0x29301b, surfaceBottom: 0x12170d, panel: 0x1d2414, header: 0x68733a,
    accent: 0xe0bd68, rim: 0x9b7843, highlight: 0xf3d99a, text: "#fff3d6", mutedText: "#d5ca9c", specialFrame: false
  }
};

const SPECIAL_PALETTES: Partial<Record<BoardTileType, TilePalette>> = {
  start: {
    surfaceTop: 0x21183d, surfaceBottom: 0x0c1027, panel: 0x121531, header: 0x3f326a,
    accent: 0xbca2ff, rim: 0xb99755, highlight: 0xf7dfa2, text: "#fff6df", mutedText: "#c9c2ec", specialFrame: true
  },
  dungeon: {
    surfaceTop: 0x242329, surfaceBottom: 0x09090c, panel: 0x121116, header: 0x353039,
    accent: 0xcf5f5f, rim: 0x77634b, highlight: 0xdabf8a, text: "#f5e8d8", mutedText: "#b8a9a4", specialFrame: true
  },
  goToDungeon: {
    surfaceTop: 0x2b171b, surfaceBottom: 0x0d080a, panel: 0x1a0d11, header: 0x5d252c,
    accent: 0xe06b70, rim: 0x866744, highlight: 0xe4c58c, text: "#ffede0", mutedText: "#cda5a6", specialFrame: true
  },
  rest: {
    surfaceTop: 0x3a2516, surfaceBottom: 0x17100b, panel: 0x28190f, header: 0x724526,
    accent: 0xf0b55d, rim: 0xb08a4d, highlight: 0xf7dda4, text: "#fff1d6", mutedText: "#d9ba91", specialFrame: true
  },
  adventure: {
    surfaceTop: 0x372414, surfaceBottom: 0x171009, panel: 0x25170d, header: 0x6f451f,
    accent: 0xe0a249, rim: 0xa8864c, highlight: 0xf3d698, text: "#fff1d3", mutedText: "#d9bc8a", specialFrame: true
  },
  fate: {
    surfaceTop: 0x202044, surfaceBottom: 0x0d0d21, panel: 0x151531, header: 0x3d3c72,
    accent: 0xbdb9ff, rim: 0x8c7a55, highlight: 0xe1d9b2, text: "#f3efff", mutedText: "#b9b7da", specialFrame: true
  },
  harbor: {
    surfaceTop: 0x17303a, surfaceBottom: 0x09171d, panel: 0x10242c, header: 0x28586a,
    accent: 0x76c8d6, rim: 0x9a794a, highlight: 0xe7d29c, text: "#ecf8f8", mutedText: "#a9ced2", specialFrame: true
  },
  utility: {
    surfaceTop: 0x302c25, surfaceBottom: 0x14120f, panel: 0x211e19, header: 0x5d5544,
    accent: 0xd6bd78, rim: 0x937747, highlight: 0xead7a4, text: "#f5eddc", mutedText: "#c7bda6", specialFrame: true
  },
  tax: {
    surfaceTop: 0x382018, surfaceBottom: 0x160c0a, panel: 0x28140f, header: 0x743b29,
    accent: 0xe1b25b, rim: 0xa27c45, highlight: 0xf0d493, text: "#fff0d7", mutedText: "#d6b590", specialFrame: true
  }
};

const REGION_LABELS: Record<RegionType, string> = {
  elves: "ELBENREICH",
  humans: "MENSCHENREICH",
  orcs: "ORKLANDE",
  steppe: "STEPPENREICH"
};

const TITLE_SINGLE_LINE_LIMIT = 8;
const TITLE_UNBROKEN_FALLBACK_LIMIT = 10;
const TITLE_COMPOUND_SUFFIXES = [
  "LICHTUNG", "BRUNNEN", "WELTENWEG", "KERKER", "KRONE", "HAFEN", "GRUND",
  "ZEHNT", "BLATT", "FORST", "BUCHT", "KLAMM", "WACHT", "HÖHE", "GRAT",
  "PASS", "HAIN", "PFAD", "ZOLL", "MÜHLE", "FURT", "KAMM", "FELS", "GRAS",
  "WEG", "RUH", "TAL", "KAI", "TOR"
] as const;

function balanceTitleWords(words: readonly string[]): string {
  if (words.length < 2) return words[0] ?? "";
  let best = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(" ");
    const second = words.slice(index).join(" ");
    const score = Math.max(first.length, second.length) * 2 + Math.abs(first.length - second.length);
    if (score < bestScore) {
      best = index;
      bestScore = score;
    }
  }
  return `${words.slice(0, best).join(" ")}\n${words.slice(best).join(" ")}`;
}

function breakCompoundTitle(word: string): string {
  const candidates = TITLE_COMPOUND_SUFFIXES
    .map((suffix) => ({ suffix, index: word.lastIndexOf(suffix) }))
    .filter(({ index }) => index >= 4 && word.length - index >= 3)
    .sort((a, b) => Math.abs(word.length / 2 - a.index) - Math.abs(word.length / 2 - b.index));
  const split = candidates[0]?.index;
  if (split !== undefined) return `${word.slice(0, split)}\n${word.slice(split)}`;
  if (word.length <= TITLE_UNBROKEN_FALLBACK_LIMIT) return word;

  const center = Math.round(word.length / 2);
  const splitCandidates = Array.from({ length: word.length - 7 }, (_, index) => index + 4);
  const boundary = splitCandidates.sort((a, b) => {
    const boundaryPenalty = (position: number) => /[AEIOUÄÖÜ]/.test(word[position - 1] ?? "") === /[AEIOUÄÖÜ]/.test(word[position] ?? "") ? 1 : 0;
    return Math.abs(center - a) * 2 + boundaryPenalty(a) - Math.abs(center - b) * 2 - boundaryPenalty(b);
  })[0] ?? center;
  return `${word.slice(0, boundary)}\n${word.slice(boundary)}`;
}

export function getTilePalette(tile: BoardTile): TilePalette {
  const palette = SPECIAL_PALETTES[tile.type] ?? REGION_PALETTES[tile.region ?? "humans"];
  if (tile.type !== "property") return palette;
  return { ...palette, accent: getPropertyGroupVisual(tile.propertyGroup).accent };
}

export function getTileVariant(tile: BoardTile): TileVisualVariant {
  return tile.type;
}

export function getTileTitle(name: string): string {
  const upper = name.trim().replace(/\s+/g, " ").toUpperCase();
  const words = upper.split(" ");
  if (words.length > 1) return upper.length > TITLE_SINGLE_LINE_LIMIT ? balanceTitleWords(words) : upper;
  return upper.length > TITLE_SINGLE_LINE_LIMIT ? breakCompoundTitle(upper) : upper;
}

export function getTileFooter(tile: BoardTile): string {
  if (tile.type === "property") {
    return tile.propertyGroup?.toUpperCase() ?? "GRUNDSTÜCK";
  }
  if (tile.type === "adventure" || tile.type === "fate" || tile.type === "tax") return "";
  if (tile.type === "harbor") return "ÜBERFAHRT";
  if (tile.type === "utility") return "VERSORGUNG";
  if (tile.type === "start") return "BEGINN · 200 GOLD";
  if (tile.type === "dungeon") return "NUR ZU BESUCH";
  if (tile.type === "goToDungeon") return "SOFORT WEITER";
  if (tile.type === "rest") return "SICHERER HAFEN";
  return tile.region ? REGION_LABELS[tile.region] : "VALENØR";
}

export function getTilePrimaryAction(tile: BoardTile): string {
  if (tile.economy) return `${tile.economy.purchasePrice} GOLD`;
  if (tile.type === "adventure" || tile.type === "fate") return "KARTE ZIEHEN";
  if (tile.type === "tax") return tile.index === 38 ? "TRIBUT" : "ABGABE";
  return "";
}

export function getRegionAccent(region: RegionType | undefined): number {
  return region ? REGION_PALETTES[region].accent : 0xd6bd78;
}

export function getPropertyGroupVisual(propertyGroup: string | undefined): PropertyGroupVisual {
  const definition = getPropertyGroup(propertyGroup);
  if (!definition) return FALLBACK_GROUP_VISUAL;
  return {
    accent: Number.parseInt(definition.accent.slice(1), 16),
    cssAccent: definition.accent,
    sigil: definition.sigil,
    size: definition.size
  };
}
