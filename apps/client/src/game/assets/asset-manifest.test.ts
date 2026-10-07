import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { RELIC_ASSETS } from "./asset-manifest";
import { getDragonTerritoryVisuals } from "./asset-manifest";
import { CHARACTER_ASSETS, DRAGON_ANIMATION, FIELD_BASE_ASSETS, flattenAssetManifest, getAvailableDragonFrames, getBuildingAsset, getPreloadAssets, SPECIAL_TILE_ASSETS, VALENOR_ASSETS } from "./asset-manifest";
import { ANIMATED_REALM_DECORATIONS, REALM_DECORATIONS } from "./realm-decoration-config";
import { BOARD_EFFECT_DECORATIONS } from "./board-effect-config";
import { BOARD_DEPTHS } from "../layers/board-depths";

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
  assert.equal(ready.length, 34);
  assert.ok(ready.every((asset) => asset.availability === "ready" && asset.fallback === "procedural"));
  assert.ok(pending.length > 0);
  assert.ok(pending.every((asset) => asset.fallback === "procedural"));
  assert.ok(ready.some((asset) => asset.key === "board-table"));
  assert.ok(ready.some((asset) => asset.key === "special-runegate"));
  assert.ok(ready.some((asset) => asset.key === "building-steppe-grand"));
  assert.deepEqual(FIELD_BASE_ASSETS.portrait, VALENOR_ASSETS.ui.boardFieldHorizontal);
  assert.deepEqual(FIELD_BASE_ASSETS.landscape, VALENOR_ASSETS.ui.boardFieldVertical);
  assert.equal(FIELD_BASE_ASSETS.portrait.path, "/assets/ui/board/field_base_horizontal.png");
  assert.equal(FIELD_BASE_ASSETS.landscape.path, "/assets/ui/board/field_base_vertical.png");
});

test("dragon images form an ordered 3.8-fps loop and missing textures are safely skipped", () => {
  assert.deepEqual(VALENOR_ASSETS.characters.dragon.map(asset => asset.path), Array.from({ length: 8 }, (_, index) => `/assets/Dragon/Drache${index + 1}.png`));
  assert.deepEqual(DRAGON_ANIMATION.frames.map(frame => frame.key), Array.from({ length: 8 }, (_, index) => `dragon-frame-${index + 1}`));
  assert.equal(DRAGON_ANIMATION.frameRate, 3.8); assert.equal(DRAGON_ANIMATION.repeat, -1);
  assert.equal(getAvailableDragonFrames(key => key !== "dragon-frame-4").length, 7);
  assert.deepEqual(getAvailableDragonFrames(() => false), []);
});

test("dragon visuals contain one full-size dragon and exactly two subdued cyclic neighbors", () => {
  for (const [tile, expected] of [[15,[15,14,16]], [0,[0,39,1]], [39,[39,38,0]]] as const) {
    const visuals = getDragonTerritoryVisuals(tile);
    assert.deepEqual(visuals.map(visual => visual.tileIndex), expected);
    assert.equal(visuals.length, 3); assert.equal(visuals[0].scale, 1); assert.equal(visuals[0].alpha, 1);
    for (const projection of visuals.slice(1)) { assert.equal(projection.scale, .5); assert.ok(projection.alpha >= .55 && projection.alpha <= .7); }
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

test("every culture has five building levels and four character replacements", () => {
  for (const region of ["elves", "humans", "orcs", "steppe"] as const) {
    for (const level of [1, 2, 3, 4, 5] as const) assert.ok(getBuildingAsset(region, level));
  }
  assert.equal(CHARACTER_ASSETS.length, 4);
  assert.deepEqual(CHARACTER_ASSETS.map((asset) => asset.path), [
    "/assets/characters/elven-spellweaver.png",
    "/assets/characters/human-knight.png",
    "/assets/characters/orc-warlord.png",
    "/assets/characters/steppe-scout-shaman.png"
  ]);
  assert.equal(getBuildingAsset("elves", 1), getBuildingAsset("elves", 4));
  assert.notEqual(getBuildingAsset("elves", 4), getBuildingAsset("elves", 5));
  assert.equal(Object.keys(SPECIAL_TILE_ASSETS).length, 12);
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
