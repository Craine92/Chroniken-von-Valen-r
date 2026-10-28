import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOARD_TILES, CROWN_TAX, DUNGEON_TILE_INDEX, getEffectivePurchasePrice, getEffectiveRent, type GameState } from "@valenor/shared";
import { livingTestState } from "../game/living/living-fixtures";
import { getCompleteGroupOwner, getGroupOwnershipDots } from "../game/group-ownership";
import { MobileTargetField } from "../components/MobileTargetField";
import { getLandingPreview } from "./landing-preview";

const tileNamed = (name: string) => BOARD_TILES.find(tile => tile.name === name)!;

/** p1 hat gewürfelt und zieht gerade auf das genannte Feld. */
function rolledOnto(name: string, change: (state: GameState) => void = () => undefined): GameState {
  const state = livingTestState();
  const to = tileNamed(name).index;
  state.turnPhase = "moving";
  state.lastMovement = { kind: "normal", sequence: 1, playerId: "p1", from: 0, to, path: [to], passedStart: false, landedTile: BOARD_TILES[to]! };
  change(state);
  return state;
}

test("right after the roll the phone shows a free field with its picture, group and purchase price", () => {
  const state = rolledOnto("Rotfels");
  const preview = getLandingPreview(state, "p1")!;
  assert.equal(preview.name, "Rotfels");
  assert.equal(preview.groupName, "Aschelande");
  assert.equal(preview.imagePath, "/assets/board/fields/rotfels.webp");
  assert.equal(preview.action, "Frei – du kannst es kaufen");
  assert.equal(preview.price?.label, "Kaufpreis");
  assert.equal(preview.price?.info.effective, getEffectivePurchasePrice(state, tileNamed("Rotfels"), "p1"));
  assert.equal(preview.tone, "buy");
});

test("someone else's field shows the owner and the rent; own and mortgaged fields say so", () => {
  const rotfels = tileNamed("Rotfels").index;
  const owned = rolledOnto("Rotfels", state => state.propertyOwnerships.push({ tileIndex: rotfels, ownerId: "p3", buildingLevel: 2, mortgaged: false }));
  const rent = getLandingPreview(owned, "p1")!;
  assert.equal(rent.ownerName, "Ragna");
  assert.equal(rent.ownerColor, "red");
  assert.equal(rent.action, "Gehört Ragna – du zahlst Miete");
  assert.equal(rent.price?.label, "Miete", "the rent is shown big, not the purchase price");
  assert.equal(rent.price?.info.effective, getEffectiveRent(owned, tileNamed("Rotfels"), "p3"));
  assert.match(rent.details[0]!, /Stufe 2/);
  assert.equal(rent.tone, "rent");
  owned.propertyOwnerships[0]!.mortgaged = true;
  assert.equal(getLandingPreview(owned, "p1")!.action, "Gehört Ragna – belehnt, keine Miete");
  owned.propertyOwnerships[0]!.ownerId = "p1";
  assert.equal(getLandingPreview(owned, "p1")!.tone, "own");
  assert.match(getLandingPreview(owned, "p1")!.action, /^Dein Grundstück/);
  assert.equal(getLandingPreview(owned, "p1")!.price, undefined);
});

test("special fields explain what happens there", () => {
  assert.equal(getLandingPreview(rolledOnto("Kronenzoll"), "p1")!.action, `Abgabe ${CROWN_TAX} Gold`);
  assert.match(getLandingPreview(rolledOnto("In den Kerker"), "p1")!.action, /Kerker/);
  const fate = BOARD_TILES.find(tile => tile.type === "fate")!;
  assert.match(getLandingPreview(rolledOnto(fate.name), "p1")!.action, /Karte ziehen/);
});

test("the preview belongs to the player who rolled and stays until the turn ends or the next roll", () => {
  const state = rolledOnto("Rotfels");
  assert.equal(getLandingPreview(state, "p2"), undefined, "other players see nothing");
  state.turnPhase = "landed";
  assert.equal(getLandingPreview(state, "p1")?.settled, false);
  for (const phase of ["propertyDecision", "paymentRequired", "awaitingCardDraw", "waitingForEndTurn"] as const) {
    state.turnPhase = phase;
    assert.equal(getLandingPreview(state, "p1")?.settled, true, `${phase}: the target stays visible, smaller`);
  }
  state.turnPhase = "waitingForRoll";
  assert.equal(getLandingPreview(state, "p1"), undefined, "an old movement before the next roll is not shown");
  state.turnPhase = "dungeonDecision";
  assert.equal(getLandingPreview(state, "p1"), undefined);
});

test("every roll shows its target: right after rolling, after a double, from the dungeon and when a card moves the figure", () => {
  // Gleich nach dem Wurf (die Würfel rollen noch), auch beim erneuten Wurf nach einem Pasch.
  const rolling = rolledOnto("Rotfels", draft => { draft.turnPhase = "rolling"; draft.turnContext.consecutiveDoubles = 1; });
  assert.equal(getLandingPreview(rolling, "p1")?.name, "Rotfels");
  // Solange der Runenstein noch über den Wurf entscheidet, steht das Ziel nicht fest.
  rolling.turnContext.awaitingRuneStoneDecision = true;
  assert.equal(getLandingPreview(rolling, "p1"), undefined);
  // Kerker: Pasch beim Fluchtversuch oder Zahlung nach dem dritten Versuch – der Server zieht sofort.
  const fromDungeon = rolledOnto("Kronenzoll", draft => { draft.turnContext.rollKind = "dungeonAttempt"; });
  assert.match(getLandingPreview(fromDungeon, "p1")!.action, /Abgabe/);
  // Eine Karte bewegt die Figur.
  const byCard = rolledOnto("Rotfels", draft => {
    draft.turnPhase = "cardMoving";
    draft.lastMovement = { ...draft.lastMovement!, kind: "card" };
  });
  assert.equal(getLandingPreview(byCard, "p1")?.name, "Rotfels");
  // Dritter Pasch oder Kerkerkarte: ab in den Kerker.
  const transfer = rolledOnto("Rotfels", draft => {
    draft.turnPhase = "dungeonTransfer";
    draft.lastMovement = { kind: "dungeonTransfer", sequence: 2, playerId: "p1", from: 3, to: DUNGEON_TILE_INDEX, path: [DUNGEON_TILE_INDEX], passedStart: false, landedTile: BOARD_TILES[DUNGEON_TILE_INDEX]! };
  });
  assert.equal(getLandingPreview(transfer, "p1")?.action, "Ab in den Dunklen Kerker");
  assert.equal(getLandingPreview(transfer, "p1")?.tone, "danger");
});

test("the target card renders picture, name, group, owner and action", () => {
  const rotfels = tileNamed("Rotfels").index;
  const state = rolledOnto("Rotfels", draft => draft.propertyOwnerships.push({ tileIndex: rotfels, ownerId: "p3", buildingLevel: 0, mortgaged: false }));
  const html = renderToStaticMarkup(<MobileTargetField preview={getLandingPreview(state, "p1")!} />);
  assert.match(html, /DU LANDEST AUF/);
  assert.match(html, /src="\/assets\/board\/fields\/rotfels.webp"/);
  assert.match(html, /Aschelande/);
  assert.match(html, /Besitz: Ragna/);
  assert.match(html, /<small>Miete<\/small><span class="price-tag">\d+ Gold<\/span>/);
  assert.match(html, /Grundmiete/);
});

test("group dots show size and progress; a complete group knows its owner", () => {
  const state = livingTestState();
  const [first, second] = BOARD_TILES.filter(tile => tile.propertyGroupId === "group_mondhain");
  assert.deepEqual(getGroupOwnershipDots(state, "group_mondhain"), [undefined, undefined]);
  state.propertyOwnerships.push({ tileIndex: first!.index, ownerId: "p3", buildingLevel: 0, mortgaged: false });
  assert.deepEqual(getGroupOwnershipDots(state, "group_mondhain"), ["red", undefined]);
  assert.equal(getCompleteGroupOwner(state, "group_mondhain"), undefined);
  state.propertyOwnerships.push({ tileIndex: second!.index, ownerId: "p2", buildingLevel: 0, mortgaged: false });
  assert.equal(getCompleteGroupOwner(state, "group_mondhain"), undefined, "two owners are not a complete group");
  state.propertyOwnerships[1]!.ownerId = "p3";
  assert.equal(getCompleteGroupOwner(state, "group_mondhain"), "p3");
  assert.equal(getGroupOwnershipDots(state, "group_amethystwald").length, 3);
});
