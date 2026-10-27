import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { RELIC_ASSETS } from "./asset-manifest";
import { getDragonTerritoryVisuals } from "./asset-manifest";
import { CHARACTER_ASSETS, DRAGON_ANIMATION, FIELD_BASE_ASSETS, flattenAssetManifest, getAvailableDragonFrames, getBuildingAsset, getFieldArtAsset, getPreloadAssets, LOBBY_ASSETS, SPECIAL_TILE_ASSETS, VALENOR_ASSETS } from "./asset-manifest";
import { ANIMATED_REALM_DECORATIONS, REALM_DECORATIONS } from "./realm-decoration-config";
import { BOARD_EFFECT_DECORATIONS } from "./board-effect-config";
import { BOARD_DEPTHS } from "../layers/board-depths";
import { BOARD_TILES, PLAYER_CHARACTERS } from "@valenor/shared";
import { getCharacterAsset } from "./asset-manifest";

test("asset manifest exposes unique local slots and never hotlinks runtime art", () => {
  const assets = flattenAssetManifest();
  assert.ok(assets.length >= 60);
  assert.equal(new Set(assets.map((asset) => asset.key)).size, assets.length);
  const paths = assets.flatMap((asset) => asset.kind === "image" ? [asset.path] : [asset.texturePath, asset.atlasPath]);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.every((path) => path.startsWith("/assets/") && !path.startsWith("http")));
});

test("only reviewed core art is preloaded and pending slots retain procedural fallbacks", () => {
  const assets = flattenAssetManifest();
  const ready = getPreloadAssets();
  const pending = assets.filter((asset) => asset.availability === "slot");
  // 30 Grundbilder, 20 Gebäude (5 Stufen x 4 Reiche) und 36 Feldbilder.
  assert.equal(ready.length, 86);
  assert.ok(ready.every((asset) => asset.availability === "ready" && asset.fallback === "procedural"));
  assert.ok(pending.length > 0);
  assert.ok(pending.every((asset) => asset.fallback === "procedural"));
  assert.ok(ready.some((asset) => asset.key === "board-table"));
  assert.ok(ready.some((asset) => asset.key === "special-runegate"));
  assert.ok(ready.some((asset) => asset.key === "building-steppe-5"));
  // Die alten Feldplatten passen nicht zu den tieferen Feldern; sie werden nicht mehr geladen.
  assert.deepEqual(FIELD_BASE_ASSETS.portrait, VALENOR_ASSETS.ui.boardFieldHorizontal);
  assert.equal(FIELD_BASE_ASSETS.portrait.availability, "slot");
  assert.equal(FIELD_BASE_ASSETS.landscape.availability, "slot");
});

test("dragon images form an ordered 3.8-fps loop and missing textures are safely skipped", () => {
  assert.deepEqual(VALENOR_ASSETS.characters.dragon.map(asset => asset.path), Array.from({ length: 8 }, (_, index) => `/assets/Dragon/Drache${index + 1}.png`));
  assert.deepEqual(DRAGON_ANIMATION.frames.map(frame => frame.key), Array.from({ length: 8 }, (_, index) => `dragon-frame-${index + 1}`));
  assert.equal(DRAGON_ANIMATION.frameRate, 3.8); assert.equal(DRAGON_ANIMATION.repeat, -1);
  assert.equal(getAvailableDragonFrames(key => key !== "dragon-frame-4").length, 7);
  assert.deepEqual(getAvailableDragonFrames(() => false), []);
});

test("dragon visuals contain one full-size dragon and two opaque half-size cyclic neighbors", () => {
  for (const [tile, expected] of [[15,[15,14,16]], [0,[0,39,1]], [39,[39,38,0]]] as const) {
    const visuals = getDragonTerritoryVisuals(tile);
    assert.deepEqual(visuals.map(visual => visual.tileIndex), expected);
    assert.equal(visuals.length, 3); assert.equal(visuals[0].scale, .9); assert.equal(visuals[0].alpha, 1);
    for (const projection of visuals.slice(1)) { assert.equal(projection.scale, visuals[0].scale/2); assert.equal(projection.alpha, 1); }
  }
});

test("all four relics map centrally to existing 1254px PNG assets in Relicts", () => {
  assert.equal(Object.keys(RELIC_ASSETS).length, 4);
  for (const asset of Object.values(RELIC_ASSETS)) {
    assert.match(asset.path, /^\/assets\/Relicts\/.+\.png$/);
    const path = new URL(`../../../public${asset.path}`, import.meta.url);
    assert.ok(existsSync(path));
    const png = readFileSync(path);
    assert.equal(png.readUInt32BE(16), 1254); assert.equal(png.readUInt32BE(20), 1254);
    assert.ok(getPreloadAssets().includes(asset));
  }
});

test("both deck frames are existing PNGs with their actual dimensions", () => {
  for (const asset of Object.values(VALENOR_ASSETS.cards)) {
    const png = readFileSync(new URL(`../../../public${asset.path}`, import.meta.url));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1058,1487]);
    assert.equal(asset.availability,"ready");
  }
});

test("every culture has five building levels and eight character choices", () => {
  for (const region of ["elves", "humans", "orcs", "steppe"] as const) {
    for (const level of [1, 2, 3, 4, 5] as const) assert.ok(getBuildingAsset(region, level));
  }
  assert.equal(CHARACTER_ASSETS.length, 8);
  assert.deepEqual(CHARACTER_ASSETS.map((asset) => asset.path), [
    "/assets/characters/elven-spellweaver.png",
    "/assets/characters/human-knight.png",
    "/assets/characters/orc-warlord.png",
    "/assets/characters/steppe-scout-shaman.png",
    "/assets/characters/Dwarf.png", "/assets/characters/Tauren.png", "/assets/characters/Troll.png", "/assets/characters/nightelv.png"
  ]);
  for (const region of ["elves", "humans", "orcs", "steppe"] as const) {
    const paths = ([1, 2, 3, 4, 5] as const).map(level => getBuildingAsset(region, level)!.path);
    assert.equal(new Set(paths).size, 5, `${region}: jede Baustufe hat ein eigenes Bild`);
    paths.forEach(path => assert.ok(existsSync(new URL(`../../../public${path}`, import.meta.url)), path));
  }
  assert.equal(getBuildingAsset("elves", 0), undefined);
  assert.equal(Object.keys(SPECIAL_TILE_ASSETS).length, 12);
  for(const character of PLAYER_CHARACTERS){
    const asset=getCharacterAsset(character.id);
    assert.equal(existsSync(new URL(`../../../public${asset.path}`,import.meta.url)),true,character.id);
    assert.ok(CHARACTER_ASSETS.includes(asset));
  }
});

test("realm decoration placement is data-driven for every realm and atlas animation slots exist", () => {
  for (const realm of ["elves", "humans", "orcs", "steppe"] as const) {
    const placements = REALM_DECORATIONS.filter((entry) => entry.realm === realm);
    assert.ok(placements.length >= 5);
    assert.ok(placements.every((entry) => Math.abs(entry.x) <= 500 && Math.abs(entry.y) <= 500 && entry.scale > 0));
  }
  assert.ok(ANIMATED_REALM_DECORATIONS.length >= 4);
  assert.equal(VALENOR_ASSETS.effects.portal.kind, "atlas");
  assert.equal(VALENOR_ASSETS.effects.windmill.kind, "atlas");
  assert.deepEqual(BOARD_EFFECT_DECORATIONS.map((entry) => entry.tileIndex), [0, 11]);
});

test("board layers keep the required visual depth order", () => {
  assert.deepEqual(Object.values(BOARD_DEPTHS), [-100, -90, -80, -70, 10, 20, 26, 30, 40, 50, 60, 70]);
});

const publicFile = (path: string) => new URL(`../../../public${path}`, import.meta.url);
/** Breite und Höhe einer verlustbehafteten oder verlustfreien WebP-Datei (VP8/VP8L/VP8X). */
function webpSize(path: string): [number, number] {
  const data = readFileSync(publicFile(path));
  assert.equal(data.toString("ascii", 0, 4), "RIFF"); assert.equal(data.toString("ascii", 8, 12), "WEBP");
  const chunk = data.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [1 + data.readUIntLE(24, 3), 1 + data.readUIntLE(27, 3)];
  if (chunk === "VP8L") { const bits = data.readUInt32LE(21); return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]; }
  return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
}

test("every board field has a 512px WebP field image; fate and adventure share one each", () => {
  for (const tile of BOARD_TILES) {
    const asset = getFieldArtAsset(tile);
    assert.ok(asset, tile.name);
    assert.equal(asset.availability, "ready");
    assert.deepEqual(webpSize(asset.path), [512, 512], asset.path);
  }
  const fate = BOARD_TILES.filter(tile => tile.type === "fate").map(tile => getFieldArtAsset(tile));
  assert.equal(new Set(fate).size, 1);
  assert.equal(getFieldArtAsset(BOARD_TILES.find(tile => tile.type === "adventure")!)!.path, "/assets/board/fields/abenteuer.webp");
  assert.equal(new Set(BOARD_TILES.map(tile => getFieldArtAsset(tile))).size, 36);
});

test("the new field, building and title images stay below 10 MB together and buildings keep transparency", () => {
  const fields = Object.values(VALENOR_ASSETS.fields).map(asset => asset.path);
  const buildings = Object.values(VALENOR_ASSETS.buildings).flat().map(asset => asset.path).filter(path => path.endsWith(".webp"));
  assert.equal(buildings.length, 12);
  const total = [...fields, ...buildings, LOBBY_ASSETS.title.path].reduce((sum, path) => sum + statSync(publicFile(path)).size, 0);
  assert.ok(total < 10 * 1024 * 1024, `${(total / 1024 / 1024).toFixed(2)} MB`);
  for (const path of buildings) {
    const data = readFileSync(publicFile(path));
    // Transparente WebP-Bilder tragen ein ALPH-Kapitel (verlustbehaftet) oder sind verlustfrei mit Alpha.
    assert.ok(data.includes("ALPH") || data.toString("ascii", 12, 16) === "VP8L", `${path} ohne Alpha`);
  }
  assert.deepEqual(webpSize(LOBBY_ASSETS.title.path), [1536, 1024]);
});
