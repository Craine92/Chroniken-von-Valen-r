import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_CORNER_TILE_INDICES, BOARD_TILES } from "@valenor/shared";
import { getBoardTileVisualLayout } from "./board-tile-layout";
import { BOARD_HEIGHT, BOARD_WIDTH, getBoardFitZoom, getDragonAnchor, getTileInnerAnchor, getTilePlacement, getTokenFormationOffset, getTokenSlotOffset } from "../board-layout";
import { getBoardVisualScale } from "../board-presentation";
import { getPropertyGroupVisual, getTileFooter, getTilePalette, getTilePrimaryAction, getTileTitle, getTileVariant } from "./board-tile-theme";
import { getTokenPointerGeometry, TOKEN_VISUAL_CONFIG } from "../tokens/token-visuals";

test("moving-player connections stay subtle and inactive connections remain in the background",()=>{
  assert.ok(TOKEN_VISUAL_CONFIG.pointer.activeAlpha>=.45 && TOKEN_VISUAL_CONFIG.pointer.activeAlpha<=.6);
  assert.ok(TOKEN_VISUAL_CONFIG.pointer.inactiveAlpha>=0 && TOKEN_VISUAL_CONFIG.pointer.inactiveAlpha<=.15);
});

test("all forty fields receive a complete data-driven visual definition", () => {
  assert.equal(BOARD_TILES.length, 40);
  BOARD_TILES.forEach((tile) => {
    const layout = getBoardTileVisualLayout(tile.index);
    const palette = getTilePalette(tile);
    assert.ok(layout.width > 0 && layout.height > 0 && layout.title.width > 0 && layout.emblem.size > 0);
    assert.ok(palette.text.startsWith("#") && palette.mutedText.startsWith("#"));
    assert.ok(getTileTitle(tile.name).length > 0);
    assert.ok(getTileFooter(tile).length > 0 || getTilePrimaryAction(tile).length > 0);
    assert.equal(getTileVariant(tile), tile.type);
  });
});

test("corners, horizontal rows and vertical board sides use dedicated layouts", () => {
  assert.equal(getBoardTileVisualLayout(0).kind, "corner");
  assert.equal(getBoardTileVisualLayout(13).kind, "corner");
  assert.equal(getBoardTileVisualLayout(1).kind, "portrait");
  assert.equal(getBoardTileVisualLayout(21).kind, "portrait");
  assert.equal(getBoardTileVisualLayout(14).kind, "landscape");
  assert.equal(getBoardTileVisualLayout(34).kind, "landscape");
  const portrait = getBoardTileVisualLayout(1);
  const landscape = getBoardTileVisualLayout(14);
  assert.equal(portrait.width * portrait.height, landscape.width * landscape.height);
  assert.ok(landscape.title.fontSize >= portrait.title.fontSize - 2);
  assert.equal(portrait.footer.fontSize, landscape.footer.fontSize);
  assert.equal(portrait.price.fontSize, landscape.price.fontSize);
  assert.ok(portrait.title.fontSize > portrait.price.fontSize);
  assert.ok(portrait.price.fontSize > portrait.footer.fontSize);
  assert.ok(portrait.accent.width > 0 && landscape.accent.width > 0);
  assert.notEqual(portrait.accent.y, landscape.accent.y);
});

test("special fields use emphasized frames while properties retain realm palettes", () => {
  const property = BOARD_TILES.find((tile) => tile.type === "property")!;
  const adventure = BOARD_TILES.find((tile) => tile.type === "adventure")!;
  const harbor = BOARD_TILES.find((tile) => tile.type === "harbor")!;
  assert.equal(getTilePalette(property).specialFrame, false);
  assert.equal(getTilePalette(adventure).specialFrame, true);
  assert.equal(getTilePalette(harbor).specialFrame, true);
  assert.notEqual(getTilePalette(property).header, getTilePalette(adventure).header);
});

test("property groups retain their data but show only the compact group name on the board", () => {
  assert.equal(getPropertyGroupVisual("Mondhain").size, 2);
  assert.equal(getPropertyGroupVisual("Himmelsweite").size, 2);
  assert.equal(getPropertyGroupVisual("Amethystwald").size, 3);
  assert.notEqual(getPropertyGroupVisual("Mondhain").accent, getPropertyGroupVisual("Amethystwald").accent);
  assert.equal(getTileFooter(BOARD_TILES.find((tile) => tile.propertyGroup === "Mondhain")!), "MONDHAIN");
  assert.equal(getTileFooter(BOARD_TILES.find((tile) => tile.propertyGroup === "Amethystwald")!), "AMETHYSTWALD");
  BOARD_TILES.filter((tile) => tile.type === "property").forEach((tile) => {
    assert.doesNotMatch(getTileFooter(tile), /\dER|GRUPPE/);
  });
});

test("long names use one central two-line wrapping rule", () => {
  assert.equal(getTileTitle("Alter Brunnen"), "ALTER\nBRUNNEN");
  assert.equal(getTileTitle("Schwarzgrat"), "SCHWARZ\nGRAT");
  assert.equal(getTileTitle("Sternenlichtung"), "STERNEN\nLICHTUNG");
  assert.equal(getTileTitle("Knochenpass"), "KNOCHEN\nPASS");
  assert.equal(getTileTitle("Amethystkrone"), "AMETHYST\nKRONE");
  assert.equal(getTileTitle("Königsfurt"), "KÖNIGS\nFURT");
  assert.equal(getTileTitle("Mühlenweg"), "MÜHLEN\nWEG");
  assert.equal(getTileTitle("Abenteuer"), "ABENTEUER");
  assert.equal(getTileTitle("Schicksal"), "SCHICKSAL");
  assert.equal(getTileTitle("Mondpfad", 7), "MOND\nPFAD");
  assert.equal(getTileTitle("Windgras", 7), "WIND\nGRAS");
  BOARD_TILES.forEach((tile) => assert.ok(getTileTitle(tile.name).split("\n").length <= 2));
});

test("fields without a price use the primary-action area", () => {
  const adventure = BOARD_TILES.find((tile) => tile.type === "adventure")!;
  const fate = BOARD_TILES.find((tile) => tile.type === "fate")!;
  const tax = BOARD_TILES.find((tile) => tile.name === "Drachenzehnt")!;
  const harbor = BOARD_TILES.find((tile) => tile.type === "harbor")!;
  assert.equal(getTileFooter(adventure), "");
  assert.equal(getTilePrimaryAction(adventure), "KARTE ZIEHEN");
  assert.equal(getTilePrimaryAction(fate), "KARTE ZIEHEN");
  assert.equal(getTilePrimaryAction(tax), "TRIBUT");
  assert.equal(getTileFooter(harbor), "ÜBERFAHRT");
  assert.match(getTilePrimaryAction(harbor), /^\d+ GOLD$/);
});

test("the widescreen camera fills a 1080p stage without clipping its rectangular frame", () => {
  const zoom = getBoardFitZoom(1_699, 1_080);
  assert.ok(BOARD_WIDTH / BOARD_HEIGHT > 1.7);
  assert.ok(BOARD_WIDTH * zoom / 1_699 > .95);
  assert.ok((BOARD_HEIGHT + 40) * zoom <= 1_080);
});

test("board element scaling boosts TV clarity while keeping mobile markers compact", () => {
  const television = getBoardVisualScale(getBoardFitZoom(1_699, 1_080), 1_699);
  const mobile = getBoardVisualScale(getBoardFitZoom(390, 736), 390);
  assert.ok(television.visualTokenScale > 1.1);
  assert.ok(television.buildingScale > 1.08);
  assert.ok(mobile.visualTokenScale < 1);
  assert.ok(mobile.buildingScale < 1);
});

test("field order follows the 14 / 6 / 14 / 6 widescreen route", () => {
  const sideCounts = Array.from({ length: 40 }, (_, index) => getTilePlacement(index).side)
    .reduce<Record<string, number>>((counts, side) => ({ ...counts, [side]: (counts[side] ?? 0) + 1 }), {});
  assert.deepEqual(sideCounts, { corner: 4, bottom: 12, left: 6, top: 12, right: 6 });
  assert.equal(getTilePlacement(0).side, "corner");
  assert.equal(getTilePlacement(12).side, "bottom");
  assert.equal(getTilePlacement(13).side, "corner");
  assert.equal(getTilePlacement(19).side, "left");
  assert.equal(getTilePlacement(20).side, "corner");
  assert.equal(getTilePlacement(32).side, "top");
  assert.equal(getTilePlacement(33).side, "corner");
  assert.equal(getTilePlacement(39).side, "right");
  assert.deepEqual(BOARD_CORNER_TILE_INDICES, [0, 13, 20, 33]);
  assert.deepEqual(BOARD_CORNER_TILE_INDICES.map((index) => BOARD_TILES[index]!.type), ["start", "dungeon", "rest", "goToDungeon"]);
  assert.ok(getTilePlacement(39).y > getTilePlacement(38).y);
  assert.ok(getTilePlacement(0).y > getTilePlacement(39).y);
  const steps = Array.from({ length: 40 }, (_, index) => {
    const from = getTilePlacement(index);
    const to = getTilePlacement((index + 1) % 40);
    return Math.hypot(to.x - from.x, to.y - from.y);
  });
  assert.ok(steps.every((distance) => distance < 160));
  const tokenSteps = Array.from({ length: 40 }, (_, index) => {
    const from = getTilePlacement(index);
    const fromSlot = getTokenSlotOffset(index, 1, 0);
    const nextIndex = (index + 1) % 40;
    const to = getTilePlacement(nextIndex);
    const toSlot = getTokenSlotOffset(nextIndex, 1, 0);
    return Math.hypot(to.x + toSlot.x - from.x - fromSlot.x, to.y + toSlot.y - from.y - fromSlot.y);
  });
  assert.ok(tokenSteps.every((distance) => distance < 170));
});

test("two to four player tokens receive distinct bounded positions on one field", () => {
  for (const count of [2, 3, 4]) {
    const positions = Array.from({ length: count }, (_, index) => getTokenFormationOffset(count, index));
    assert.equal(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size, count);
    assert.ok(positions.every(({ x, y }) => Math.abs(x) <= 24 && Math.abs(y) <= 20));
  }
});

test("fixed token slots rotate toward the inner board edge", () => {
  const bottom = getTokenSlotOffset(5, 4, 0);
  const left = getTokenSlotOffset(16, 4, 0);
  const top = getTokenSlotOffset(25, 4, 0);
  const right = getTokenSlotOffset(36, 4, 0);
  assert.ok(bottom.y < -70);
  assert.ok(left.x > 70);
  assert.ok(top.y > 70);
  assert.ok(right.x < -70);
});

test("token pointers run from the base edge to the actual occupied field edge", () => {
  for (const tileIndex of Array.from({ length: 40 }, (_, index) => index)) {
    for (const count of [1, 2, 3, 4]) {
      for (let index = 0; index < count; index += 1) {
        const slot = getTokenSlotOffset(tileIndex, count, index);
        const pointer = getTokenPointerGeometry(tileIndex, count, index);
        const place = getTilePlacement(tileIndex);
        const renderedSlot = { x: slot.x, y: slot.y + TOKEN_VISUAL_CONFIG.pointer.settledTokenYOffset };
        const fieldPoint = { x: renderedSlot.x + pointer.tip.x, y: renderedSlot.y + pointer.tip.y };
        assert.ok(pointer.tip.x * -slot.x + pointer.tip.y * -slot.y > 0);
        assert.ok(Math.abs(fieldPoint.x) <= place.width / 2 + .001);
        assert.ok(Math.abs(fieldPoint.y) <= place.height / 2 + .001);
        assert.ok(Math.abs(Math.abs(fieldPoint.x) - place.width / 2) < .001 || Math.abs(Math.abs(fieldPoint.y) - place.height / 2) < .001);
        const baseX = pointer.start.x / (TOKEN_VISUAL_CONFIG.base.outerWidth / 2);
        const baseY = (pointer.start.y - TOKEN_VISUAL_CONFIG.base.centerY) / (TOKEN_VISUAL_CONFIG.base.outerHeight / 2);
        assert.ok(Math.abs(baseX ** 2 + baseY ** 2 - 1) < .001);
      }
    }
  }
});

test("multiple occupants fan out to distinct points on every field edge without changing slots", () => {
  for (const tileIndex of [0, 5, 13, 16, 20, 25, 33, 36]) {
    for (const count of [2, 3, 4]) {
      const fieldPoints = Array.from({ length: count }, (_, index) => {
        const slot = getTokenSlotOffset(tileIndex, count, index);
        const pointer = getTokenPointerGeometry(tileIndex, count, index);
        return {
          x: slot.x + pointer.tip.x,
          y: slot.y + TOKEN_VISUAL_CONFIG.pointer.settledTokenYOffset + pointer.tip.y
        };
      });
      assert.equal(new Set(fieldPoints.map(({ x, y }) => `${x.toFixed(3)}:${y.toFixed(3)}`)).size, count);
    }
  }
});

test("calibrated inner anchors preserve all field bounds and point inward on every side and corner",()=>{
  for(let index=0;index<40;index++){
    const before=getTilePlacement(index);
    for(const purpose of ["token","dragon","building"] as const){
      const anchor=getTileInnerAnchor(index,purpose);
      if(anchor.x)assert.ok(Math.abs(anchor.x)>before.width/2);
      if(anchor.y)assert.ok(Math.abs(anchor.y)>before.height/2);
    }
    const echo=getDragonAnchor(index,.5),main=getDragonAnchor(index);
    assert.ok(Math.abs(echo.x)<=Math.abs(main.x)&&Math.abs(echo.y)<=Math.abs(main.y));
    assert.deepEqual(getTilePlacement(index),before);
  }
});

test("pointer end points remain on the field edge with TV scaling and geometry-derived building clearance",()=>{
  for(const visualScale of [1.1,1.16])for(const tileIndex of [0,8,13,16,20,24,33,37])for(const count of [1,2,3,4])for(let index=0;index<count;index++){
    const slot=getTokenSlotOffset(tileIndex,count,index,true),pointer=getTokenPointerGeometry(tileIndex,count,index,visualScale,true),field=getTilePlacement(tileIndex);
    const x=slot.x+pointer.tip.x,y=slot.y+TOKEN_VISUAL_CONFIG.pointer.settledTokenYOffset+pointer.tip.y;
    assert.ok(Math.abs(x)<=field.width/2+.001&&Math.abs(y)<=field.height/2+.001);
    assert.ok(Math.abs(Math.abs(x)-field.width/2)<.001||Math.abs(Math.abs(y)-field.height/2)<.001);
  }
});
