import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOARD_TILES, CROWN_TAX, getEffectivePurchasePrice, getEffectiveRent, type GameState } from "@valenor/shared";
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
  assert.equal(preview.action, `Frei – kaufen für ${getEffectivePurchasePrice(state, tileNamed("Rotfels"), "p1")} Gold`);
  assert.equal(preview.tone, "buy");
});

test("someone else's field shows the owner and the rent; own and mortgaged fields say so", () => {
  const rotfels = tileNamed("Rotfels").index;
  const owned = rolledOnto("Rotfels", state => state.propertyOwnerships.push({ tileIndex: rotfels, ownerId: "p3", buildingLevel: 2, mortgaged: false }));
  const rent = getLandingPreview(owned, "p1")!;
  assert.equal(rent.ownerName, "Ragna");
  assert.equal(rent.ownerColor, "red");
  assert.equal(rent.action, `Gehört Ragna – Miete ${getEffectiveRent(owned, tileNamed("Rotfels"), "p3")} Gold`);
  assert.equal(rent.tone, "rent");
  owned.propertyOwnerships[0]!.mortgaged = true;
  assert.equal(getLandingPreview(owned, "p1")!.action, "Gehört Ragna – belehnt, keine Miete");
  owned.propertyOwnerships[0]!.ownerId = "p1";
  assert.equal(getLandingPreview(owned, "p1")!.tone, "own");
});

test("special fields explain what happens there", () => {
  assert.equal(getLandingPreview(rolledOnto("Kronenzoll"), "p1")!.action, `Abgabe ${CROWN_TAX} Gold`);
  assert.match(getLandingPreview(rolledOnto("In den Kerker"), "p1")!.action, /Kerker/);
  const fate = BOARD_TILES.find(tile => tile.type === "fate")!;
  assert.match(getLandingPreview(rolledOnto(fate.name), "p1")!.action, /Karte ziehen/);
});

test("the preview belongs to the player who rolled and stops when the decision screen takes over", () => {
  const state = rolledOnto("Rotfels");
  assert.equal(getLandingPreview(state, "p2"), undefined, "other players see nothing");
  state.turnPhase = "landed";
  assert.ok(getLandingPreview(state, "p1"));
  state.turnPhase = "propertyDecision";
  assert.equal(getLandingPreview(state, "p1"), undefined);
  state.turnPhase = "waitingForRoll";
  assert.equal(getLandingPreview(state, "p1"), undefined, "an old movement from the last turn is not shown");
});

test("the target card renders picture, name, group, owner and action", () => {
  const rotfels = tileNamed("Rotfels").index;
  const state = rolledOnto("Rotfels", draft => draft.propertyOwnerships.push({ tileIndex: rotfels, ownerId: "p3", buildingLevel: 0, mortgaged: false }));
  const html = renderToStaticMarkup(<MobileTargetField preview={getLandingPreview(state, "p1")!} />);
  assert.match(html, /DU LANDEST AUF/);
  assert.match(html, /src="\/assets\/board\/fields\/rotfels.webp"/);
  assert.match(html, /Aschelande/);
  assert.match(html, /Besitz: Ragna/);
  assert.match(html, /Miete \d+ Gold/);
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
