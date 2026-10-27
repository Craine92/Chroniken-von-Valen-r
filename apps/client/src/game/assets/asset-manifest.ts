import { BOARD_TILES, PLAYER_CHARACTERS, type BoardTile, type PlayerCharacterId, type BuildingLevel, type RegionType, type RelicId } from "@valenor/shared";

export type AssetAvailability = "slot" | "ready";

interface AssetBase {
  key: string;
  availability: AssetAvailability;
  fallback: "procedural";
  intendedPixelSize: readonly [number, number];
}

export interface ImageAssetDefinition extends AssetBase {
  kind: "image";
  path: string;
}

export interface AtlasAssetDefinition extends AssetBase {
  kind: "atlas";
  texturePath: string;
  atlasPath: string;
  animation: {
    key: string;
    prefix: string;
    start: number;
    end: number;
    zeroPad: number;
    frameRate: number;
  };
}

export type ValenorAssetDefinition = ImageAssetDefinition | AtlasAssetDefinition;

const imageSlot = (key: string, path: string, width: number, height: number, availability: AssetAvailability = "slot"): ImageAssetDefinition => ({
  kind: "image", key, path, availability, fallback: "procedural", intendedPixelSize: [width, height]
});

const atlasSlot = (key: string, basePath: string, prefix: string, end: number, width = 1024, height = 1024, availability: AssetAvailability = "slot"): AtlasAssetDefinition => ({
  kind: "atlas",
  key,
  texturePath: `${basePath}.webp`,
  atlasPath: `${basePath}.json`,
  availability,
  fallback: "procedural",
  intendedPixelSize: [width, height],
  animation: { key: `${key}-loop`, prefix, start: 0, end, zeroPad: 2, frameRate: 10 }
});

const FIELD_ART_IDS = [...BOARD_TILES.filter(tile => tile.type !== "fate" && tile.type !== "adventure").map(tile => tile.id), "schicksal", "abenteuer"];

export const VALENOR_ASSETS = {
  board: {
    table: imageSlot("board-table", "/assets/board/table/table-background.webp", 1672, 941, "ready"),
    frame: imageSlot("board-frame", "/assets/board/frame/board-frame.webp", 1254, 1254, "ready"),
    innerBackground: imageSlot("board-inner", "/assets/board/realms/board-inner-background.webp", 1200, 1200),
    corners: imageSlot("board-corners", "/assets/board/corners/ornaments.webp", 1024, 1024)
  },
  // Feldbilder (512 x 512) je Feld-ID; alle Schicksal- und alle Abenteuerfelder teilen sich ein Bild.
  fields: Object.fromEntries(FIELD_ART_IDS.map(id => [id, imageSlot(`field-${id}`, `/assets/board/fields/${id}.webp`, 512, 512, "ready")])) as Readonly<Record<string, ImageAssetDefinition>>,
  realms: {
    elven: { background: imageSlot("realm-elven", "/assets/board/realms/realm-elven.webp", 1254, 1254, "ready") },
    human: { background: imageSlot("realm-human", "/assets/board/realms/realm-human.webp", 1254, 1254, "ready") },
    orc: { background: imageSlot("realm-orc", "/assets/board/realms/realm-orc.webp", 1254, 1254, "ready") },
    steppe: { background: imageSlot("realm-steppe", "/assets/board/realms/realm-steppe.webp", 1254, 1254, "ready") }
  },
  environment: {
    elven: {
      treeLarge: imageSlot("elven-tree-large-01", "/assets/environment/elven/tree-large-01.webp", 512, 768),
      luminousPlants: imageSlot("elven-luminous-plants-01", "/assets/environment/elven/luminous-plants-01.webp", 512, 512),
      runestone: imageSlot("elven-runestone-01", "/assets/environment/elven/runestone-01.webp", 384, 512),
      treehouse: imageSlot("elven-treehouse-01", "/assets/environment/elven/treehouse-01.webp", 768, 768),
      shrine: imageSlot("elven-shrine-01", "/assets/environment/elven/shrine-01.webp", 512, 640)
    },
    human: {
      tree: imageSlot("human-tree-01", "/assets/environment/human/tree-01.webp", 512, 640),
      house: imageSlot("human-house-01", "/assets/environment/human/house-01.webp", 512, 512),
      farm: imageSlot("human-farm-01", "/assets/environment/human/farm-01.webp", 768, 512),
      bridge: imageSlot("human-bridge-01", "/assets/environment/human/bridge-01.webp", 768, 384),
      castleTower: imageSlot("human-castle-tower-01", "/assets/environment/human/castle-tower-01.webp", 512, 768),
      water: imageSlot("human-water-01", "/assets/environment/human/water-01.webp", 768, 512)
    },
    orc: {
      rocks: imageSlot("orc-rocks-01", "/assets/environment/orc/rocks-01.webp", 640, 512),
      deadTree: imageSlot("orc-dead-tree-01", "/assets/environment/orc/dead-tree-01.webp", 384, 640),
      campfire: imageSlot("orc-campfire-01", "/assets/environment/orc/campfire-01.webp", 256, 256),
      banner: imageSlot("orc-banner-01", "/assets/environment/orc/banner-01.webp", 256, 512),
      hut: imageSlot("orc-hut-01", "/assets/environment/orc/hut-01.webp", 512, 512),
      fortress: imageSlot("orc-fortress-01", "/assets/environment/orc/fortress-01.webp", 768, 768)
    },
    steppe: {
      grass: imageSlot("steppe-grass-01", "/assets/environment/steppe/grass-01.webp", 512, 256),
      rocks: imageSlot("steppe-rocks-01", "/assets/environment/steppe/rocks-01.webp", 512, 384),
      tent: imageSlot("steppe-tent-01", "/assets/environment/steppe/tent-01.webp", 512, 512),
      totem: imageSlot("steppe-totem-01", "/assets/environment/steppe/totem-01.webp", 256, 640),
      banner: imageSlot("steppe-banner-01", "/assets/environment/steppe/banner-01.webp", 256, 512),
      greatHall: imageSlot("steppe-great-hall-01", "/assets/environment/steppe/great-hall-01.webp", 768, 640)
    }
  },
  special: {
    runegate: imageSlot("special-runegate", "/assets/board/special-tiles/runegate.png", 1244, 1254, "ready"),
    dungeon: imageSlot("special-dungeon", "/assets/board/special-tiles/dungeon.png", 1254, 1240, "ready"),
    tavern: imageSlot("special-tavern", "/assets/board/special-tiles/tavern.webp", 512, 512),
    goToDungeon: imageSlot("special-go-to-dungeon", "/assets/board/special-tiles/go-to-dungeon.webp", 512, 512),
    northHarbor: imageSlot("special-north-harbor", "/assets/board/special-tiles/north-harbor.webp", 512, 512),
    mistBay: imageSlot("special-mist-bay", "/assets/board/special-tiles/mist-bay.webp", 512, 512),
    sunHarbor: imageSlot("special-sun-harbor", "/assets/board/special-tiles/sun-harbor.webp", 512, 512),
    stormDock: imageSlot("special-storm-dock", "/assets/board/special-tiles/storm-dock.webp", 512, 512),
    windmill: imageSlot("special-windmill", "/assets/board/special-tiles/windmill.webp", 512, 512),
    well: imageSlot("special-well", "/assets/board/special-tiles/well.webp", 512, 512),
    crownTax: imageSlot("special-crown-tax", "/assets/board/special-tiles/crown-tax.webp", 512, 512),
    dragonTithe: imageSlot("special-dragon-tithe", "/assets/board/special-tiles/dragon-tithe.webp", 512, 512)
  },
  // Ein Bild je Baustufe in der Reihenfolge von REALM_BUILDING_THEMES.
  buildings: {
    elven: [
      imageSlot("building-elven-1", "/assets/buildings/elven/wurzelhuette.webp", 256, 316, "ready"),
      imageSlot("building-elven-2", "/assets/buildings/elven/treehouse-sanctuary.png", 362, 543, "ready"),
      imageSlot("building-elven-3", "/assets/buildings/elven/glowing-shrine.png", 362, 543, "ready"),
      imageSlot("building-elven-4", "/assets/buildings/elven/baumhalle.webp", 256, 380, "ready"),
      imageSlot("building-elven-5", "/assets/buildings/elven/sternenzitadelle.webp", 256, 381, "ready")
    ],
    human: [
      imageSlot("building-human-1", "/assets/buildings/human/cottage.png", 362, 543, "ready"),
      imageSlot("building-human-2", "/assets/buildings/human/gehoeft.webp", 256, 289, "ready"),
      imageSlot("building-human-3", "/assets/buildings/human/herrenhaus.webp", 256, 348, "ready"),
      imageSlot("building-human-4", "/assets/buildings/human/keep-tower.png", 362, 543, "ready"),
      imageSlot("building-human-5", "/assets/buildings/human/koenigsburg.webp", 256, 378, "ready")
    ],
    orc: [
      imageSlot("building-orc-1", "/assets/buildings/orc/hut.png", 362, 543, "ready"),
      imageSlot("building-orc-2", "/assets/buildings/orc/raiderlager.webp", 256, 360, "ready"),
      imageSlot("building-orc-3", "/assets/buildings/orc/kriegslager.webp", 256, 381, "ready"),
      imageSlot("building-orc-4", "/assets/buildings/orc/fortress-tower.png", 362, 543, "ready"),
      imageSlot("building-orc-5", "/assets/buildings/orc/eisenfestung.webp", 256, 380, "ready")
    ],
    steppe: [
      imageSlot("building-steppe-1", "/assets/buildings/steppe/wanderzelt.webp", 256, 338, "ready"),
      imageSlot("building-steppe-2", "/assets/buildings/steppe/yurt-hall.png", 362, 527, "ready"),
      imageSlot("building-steppe-3", "/assets/buildings/steppe/totem-hall.png", 362, 531, "ready"),
      imageSlot("building-steppe-4", "/assets/buildings/steppe/grosse-halle.webp", 256, 247, "ready"),
      imageSlot("building-steppe-5", "/assets/buildings/steppe/himmelsfeste.webp", 256, 256, "ready")
    ]
  },
  relics: {
    runestone: imageSlot("relic-runestone", "/assets/Relicts/Runenstein.png", 1254, 1254, "ready"),
    "merchant-seal": imageSlot("relic-merchant-seal", "/assets/Relicts/SIEGELDESHÄNDLERS.png", 1254, 1254, "ready"),
    "dungeon-amulet": imageSlot("relic-dungeon-amulet", "/assets/Relicts/KERKERAMULETT.png", 1254, 1254, "ready"),
    "golden-feather": imageSlot("relic-golden-feather", "/assets/Relicts/GOLDENEFEDER.png", 1254, 1254, "ready")
  } satisfies Record<RelicId, ImageAssetDefinition>,
  characters: {
    dragon: Array.from({ length: 8 }, (_, index) => imageSlot(`dragon-frame-${index + 1}`, `/assets/Dragon/Drache${index + 1}.png`, 1254, 1254, "ready")),
    elvenSpellweaver: imageSlot("character-elven-spellweaver", "/assets/characters/elven-spellweaver.png", 542, 724, "ready"),
    humanKnight: imageSlot("character-human-knight", "/assets/characters/human-knight.png", 543, 711, "ready"),
    orcWarlord: imageSlot("character-orc-warlord", "/assets/characters/orc-warlord.png", 543, 713, "ready"),
    steppeScoutShaman: imageSlot("character-steppe-scout-shaman", "/assets/characters/steppe-scout-shaman.png", 543, 714, "ready"),
    dwarf: imageSlot("character-dwarf", "/assets/characters/Dwarf.png", 543, 714, "ready"),
    tauren: imageSlot("character-tauren", "/assets/characters/Tauren.png", 543, 714, "ready"),
    troll: imageSlot("character-troll", "/assets/characters/Troll.png", 543, 714, "ready"),
    nightElf: imageSlot("character-night-elf", "/assets/characters/nightelv.png", 543, 714, "ready")
  },
  cards: {
    adventureFrame: imageSlot("card-adventure-frame", "/assets/cards/CardAbenteuer.png", 1058, 1487, "ready"),
    fateFrame: imageSlot("card-fate-frame", "/assets/cards/CardSchicksal.png", 1058, 1487, "ready")
  },
  ui: {
    boardFieldHorizontal: imageSlot("field-base-horizontal", "/assets/ui/board/field_base_horizontal.png", 1086, 1448),
    boardFieldVertical: imageSlot("field-base-vertical", "/assets/ui/board/field_base_vertical.png", 1448, 1086),
    goldFrame: imageSlot("ui-gold-frame", "/assets/ui/gold-frame.webp", 1024, 256),
    parchment: imageSlot("ui-parchment", "/assets/ui/parchment.webp", 1024, 1024),
    panelCorners: imageSlot("ui-panel-corners", "/assets/ui/panel-corners.webp", 512, 512),
    coin: imageSlot("ui-valenor-coin", "/assets/ui/valenor-coin.webp", 256, 256),
    crests: imageSlot("ui-player-crests", "/assets/ui/player-crests.webp", 1024, 256)
  },
  effects: {
    portal: atlasSlot("effect-portal", "/assets/effects/portal/portal", "portal_", 15),
    fire: atlasSlot("effect-fire", "/assets/effects/fire/fire", "fire_", 11),
    water: atlasSlot("effect-water", "/assets/effects/water/water", "water_", 15),
    banner: atlasSlot("effect-banner", "/assets/effects/banner/banner", "banner_", 11),
    windmill: atlasSlot("effect-windmill", "/assets/effects/windmill/windmill", "windmill_", 15),
    magicPlants: atlasSlot("effect-magic-plants", "/assets/effects/magic-plants/magic-plants", "plant_", 11)
  }
} as const;

export const FIELD_BASE_ASSETS = {
  portrait: VALENOR_ASSETS.ui.boardFieldHorizontal,
  landscape: VALENOR_ASSETS.ui.boardFieldVertical
} as const;

export const RELIC_ASSETS = VALENOR_ASSETS.relics;

export const DRAGON_ANIMATION = { key: "wandering-dragon-loop", frameRate: 3.8, repeat: -1,
  frames: VALENOR_ASSETS.characters.dragon.map(asset => ({ key: asset.key })) } as const;

/** Visual projections of the existing territory; does not change encounter rules. */
export const DRAGON_PRESENTATION_SCALE = .9;
export function getDragonTerritoryVisuals(tileIndex: number) {
  const count = BOARD_TILES.length;
  return [
    { tileIndex, scale: DRAGON_PRESENTATION_SCALE, alpha: 1 },
    { tileIndex: (tileIndex + count - 1) % count, scale: DRAGON_PRESENTATION_SCALE/2, alpha: 1 },
    { tileIndex: (tileIndex + 1) % count, scale: DRAGON_PRESENTATION_SCALE/2, alpha: 1 }
  ] as const;
}

export function getAvailableDragonFrames(hasTexture: (key: string) => boolean) {
  return DRAGON_ANIMATION.frames.filter(frame => hasTexture(frame.key));
}

function isAssetDefinition(value: unknown): value is ValenorAssetDefinition {
  return Boolean(value && typeof value === "object" && "kind" in value && "key" in value && "availability" in value);
}

export function flattenAssetManifest(root: unknown = VALENOR_ASSETS): ValenorAssetDefinition[] {
  if (isAssetDefinition(root)) return [root];
  if (!root || typeof root !== "object") return [];
  return Object.values(root).flatMap((value) => flattenAssetManifest(value));
}

export function getPreloadAssets(): ValenorAssetDefinition[] {
  return flattenAssetManifest().filter((asset) => asset.availability === "ready");
}

export function getBuildingAsset(region: RegionType, level: BuildingLevel): ImageAssetDefinition | undefined {
  if (level === 0) return undefined;
  const assetRealm = { elves: "elven", humans: "human", orcs: "orc", steppe: "steppe" } as const;
  return VALENOR_ASSETS.buildings[assetRealm[region]][level - 1];
}

/** Feldbild für das Brett; Schicksal und Abenteuer nutzen je ein gemeinsames Bild. */
export function getFieldArtAsset(tile: BoardTile): ImageAssetDefinition | undefined {
  const id = tile.type === "fate" ? "schicksal" : tile.type === "adventure" ? "abenteuer" : tile.id;
  return VALENOR_ASSETS.fields[id];
}

/** Bilder außerhalb des Bretts, die als CSS-Hintergrund geladen werden (nicht über Phaser). */
export const LOBBY_ASSETS = {
  title: imageSlot("lobby-title", "/assets/ui/title/titelbild-valenor.webp", 1536, 1024, "ready")
} as const;

export const CHARACTER_ASSETS = PLAYER_CHARACTERS.map(character => VALENOR_ASSETS.characters[character.id]);
export function getCharacterAsset(characterId: PlayerCharacterId): ImageAssetDefinition {
  return VALENOR_ASSETS.characters[characterId] ?? VALENOR_ASSETS.characters.humanKnight;
}

export const SPECIAL_TILE_ASSETS: Readonly<Partial<Record<number, ImageAssetDefinition>>> = {
  0: VALENOR_ASSETS.special.runegate,
  5: VALENOR_ASSETS.special.northHarbor,
  13: VALENOR_ASSETS.special.dungeon,
  11: VALENOR_ASSETS.special.windmill,
  15: VALENOR_ASSETS.special.mistBay,
  20: VALENOR_ASSETS.special.tavern,
  25: VALENOR_ASSETS.special.sunHarbor,
  28: VALENOR_ASSETS.special.well,
  33: VALENOR_ASSETS.special.goToDungeon,
  35: VALENOR_ASSETS.special.stormDock,
  4: VALENOR_ASSETS.special.crownTax,
  38: VALENOR_ASSETS.special.dragonTithe
};
