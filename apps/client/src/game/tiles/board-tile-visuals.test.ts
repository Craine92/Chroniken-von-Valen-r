import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_CORNER_TILE_INDICES, BOARD_TILES } from "@valenor/shared";
import { getBoardTileVisualLayout } from "./board-tile-layout";
import { ACTIVE_TOKEN_SCALE_BOOST, BOARD_FIELD_DEPTH, BOARD_HEIGHT, BOARD_WIDTH, getBoardFitZoom, getBuildingSeat, getDragonAnchor, getFieldZones, getTileInnerAnchor, getTilePlacement, getTokenSeat, TOKEN_FOOTPRINT } from "../board-layout";
import { getBoardVisualScale } from "../board-presentation";
import { getFieldSymbol, getPropertyGroupVisual, getTileFooter, getTilePalette, getTilePrimaryAction, getTileTitle, getTileVariant } from "./board-tile-theme";
import { showsTokenName } from "../tokens/token-visuals";

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
  // Alle Randfelder sind gleich tief; die Seitenfelder sind etwas niedriger als die oberen und unteren breit sind.
  assert.equal(portrait.height, landscape.width);
  assert.ok(Math.abs(portrait.width - landscape.height) < 8);
  assert.ok(landscape.title.fontSize >= portrait.title.fontSize - 3);
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
  // Komposita werden mit Trennstrich umbrochen, Mehrwortnamen an der Leerstelle.
  assert.equal(getTileTitle("Schwarzgrat"), "SCHWARZ-\nGRAT");
  assert.equal(getTileTitle("Sternenlichtung"), "STERNEN-\nLICHTUNG");
  assert.equal(getTileTitle("Knochenpass"), "KNOCHEN-\nPASS");
  assert.equal(getTileTitle("Amethystkrone"), "AMETHYST-\nKRONE");
  assert.equal(getTileTitle("Königsfurt"), "KÖNIGS-\nFURT");
  assert.equal(getTileTitle("Mühlenweg"), "MÜHLEN-\nWEG");
  assert.equal(getTileTitle("Abenteuer"), "ABENTEUER");
  assert.equal(getTileTitle("Schicksal"), "SCHICKSAL");
  assert.equal(getTileTitle("Mondpfad", 7), "MOND-\nPFAD");
  assert.equal(getTileTitle("Windgras", 7), "WIND-\nGRAS");
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
  assert.ok(BOARD_WIDTH / BOARD_HEIGHT >= 1.7);
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
    const fromSeat = getTokenSeat(index, 1, 0);
    const nextIndex = (index + 1) % 40;
    const to = getTilePlacement(nextIndex);
    const toSeat = getTokenSeat(nextIndex, 1, 0);
    return Math.hypot(to.x + toSeat.x - from.x - fromSeat.x, to.y + toSeat.y - from.y - fromSeat.y);
  });
  assert.ok(tokenSteps.every((distance) => distance < 190));
});

test("calibrated inner anchors preserve all field bounds and point inward on every side and corner",()=>{
  for(let index=0;index<40;index++){
    const before=getTilePlacement(index);
    const anchor=getTileInnerAnchor(index);
    if(anchor.x)assert.ok(Math.abs(anchor.x)>before.width/2);
    if(anchor.y)assert.ok(Math.abs(anchor.y)>before.height/2);
    const echo=getDragonAnchor(index,.5),main=getDragonAnchor(index);
    assert.ok(Math.abs(echo.x)<=Math.abs(main.x)&&Math.abs(echo.y)<=Math.abs(main.y));
    assert.deepEqual(getTilePlacement(index),before);
  }
});

const tokenBox = (seat: { x: number; y: number; scale: number }) => ({
  left: seat.x - TOKEN_FOOTPRINT.width * seat.scale / 2, right: seat.x + TOKEN_FOOTPRINT.width * seat.scale / 2,
  top: seat.y - TOKEN_FOOTPRINT.above * seat.scale, bottom: seat.y + TOKEN_FOOTPRINT.below * seat.scale
});

test("fields are 190 deep and name and price bands cover at most a third of every field", () => {
  assert.equal(BOARD_FIELD_DEPTH, 190);
  for (let index = 0; index < 40; index += 1) {
    const place = getTilePlacement(index), zones = getFieldZones(index);
    const bands = [zones.nameBand, zones.priceBand].filter(Boolean).reduce((sum, band) => sum + (band!.bottom - band!.top), 0);
    const depth = zones.kind === "landscape" ? place.height : place.height;
    assert.ok(bands / depth <= 1 / 3 + .001, `Feld ${index}: Bänder ${bands} von ${depth}`);
    assert.ok(Math.max(place.width, place.height) >= 190);
  }
});

test("one to six tokens stand on their own field, below the name band and with distinct places", () => {
  for (let tileIndex = 0; tileIndex < 40; tileIndex += 1) {
    const place = getTilePlacement(tileIndex), zones = getFieldZones(tileIndex);
    for (const built of [false, true]) for (let count = 1; count <= 6; count += 1) for (const activeIndex of [-1, 0, count - 1]) {
      const seats = Array.from({ length: count }, (_, index) => getTokenSeat(tileIndex, count, index, { activeIndex, occupiedByBuilding: built }));
      assert.equal(new Set(seats.map(seat => `${seat.x.toFixed(2)}:${seat.y.toFixed(2)}`)).size, count, `Feld ${tileIndex}, ${count} Figuren`);
      for (const seat of seats) {
        const box = tokenBox(seat);
        assert.ok(box.left >= -place.width / 2 && box.right <= place.width / 2, `Feld ${tileIndex}: Figur ragt seitlich heraus`);
        assert.ok(box.bottom <= place.height / 2, `Feld ${tileIndex}: Figur ragt unten heraus`);
        if (zones.kind !== "corner") assert.ok(box.top >= zones.nameBand.bottom - .5, `Feld ${tileIndex}: Kopf im Namensband`);
        else assert.ok(box.bottom <= zones.nameBand.top, `Ecke ${tileIndex}: Figur steht im Namensband`);
        if (zones.priceBand) assert.ok(seat.y <= zones.priceBand.top, `Feld ${tileIndex}: Füße im Preisband`);
      }
    }
  }
});

test("the active token stands in front and a little larger; alone it keeps the normal size", () => {
  for (const tileIndex of [3, 16, 24, 0, 37]) for (let count = 2; count <= 6; count += 1) {
    const activeIndex = count - 1;
    const seats = Array.from({ length: count }, (_, index) => getTokenSeat(tileIndex, count, index, { activeIndex }));
    const active = seats[activeIndex]!;
    assert.ok(active.front, `Feld ${tileIndex}: aktive Figur vorne`);
    assert.ok(seats.every(seat => seat.y <= active.y + .001));
    assert.ok(seats.every((seat, index) => index === activeIndex || seat.scale < active.scale), `Feld ${tileIndex}: aktive Figur am größten`);
    assert.ok(active.scale <= seats.find((_, index) => index !== activeIndex)!.scale * ACTIVE_TOKEN_SCALE_BOOST + .001);
  }
  const alone = getTokenSeat(3, 1, 0, { activeIndex: 0 });
  assert.equal(alone.scale, getTokenSeat(3, 1, 0).scale);
});

test("tokens shrink as a field fills up, and crowded fields show only the active name", () => {
  for (const tileIndex of [3, 16, 0]) {
    const scales = [1, 2, 3, 4, 5, 6].map(count => getTokenSeat(tileIndex, count, 0).scale);
    scales.slice(1).forEach((scale, index) => assert.ok(scale <= scales[index]! + .001));
  }
  assert.equal(showsTokenName(1, false), true);
  assert.equal(showsTokenName(2, false), false);
  assert.equal(showsTokenName(6, true), true);
});

test("buildings sit on the inner part of their field and leave room for the tokens", () => {
  for (let tileIndex = 0; tileIndex < 40; tileIndex += 1) {
    const zones = getFieldZones(tileIndex);
    if (!zones.building) continue;
    const place = getTilePlacement(tileIndex), seat = getBuildingSeat(tileIndex);
    assert.ok(Math.abs(seat.x) + seat.width / 2 <= place.width / 2 && seat.y <= place.height / 2 && seat.y - seat.height >= zones.nameBand.bottom - .5);
    if (zones.kind === "landscape") {
      // Bauplatz an der Innenkante, die Figuren stehen daneben.
      assert.equal(Math.sign(seat.x), zones.inward.x);
      for (let count = 1; count <= 6; count += 1) for (let index = 0; index < count; index += 1) {
        const box = tokenBox(getTokenSeat(tileIndex, count, index, { occupiedByBuilding: true }));
        assert.ok(zones.inward.x > 0 ? box.right <= zones.building.left + .5 : box.left >= zones.building.right - .5, `Feld ${tileIndex}: Figur auf dem Bauplatz`);
      }
    } else {
      // Oben und unten steht das Gebäude hinter den Figuren; ihre Füße bleiben vor dem Bauplatz.
      for (let count = 1; count <= 6; count += 1) for (let index = 0; index < count; index += 1) {
        assert.ok(getTokenSeat(tileIndex, count, index, { occupiedByBuilding: true }).y > zones.building.bottom - 30);
      }
    }
  }
});

test("every field kind has a small symbol for its band", () => {
  BOARD_TILES.forEach(tile => assert.ok(getFieldSymbol(tile).length > 0, tile.name));
  assert.equal(getFieldSymbol(BOARD_TILES.find(tile => tile.type === "harbor")!), "harbor");
  assert.match(getFieldSymbol(BOARD_TILES.find(tile => tile.type === "property")!), /^group-/);
});
