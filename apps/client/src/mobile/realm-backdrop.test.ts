import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_TILES } from "@valenor/shared";
import { livingTestState, nextState } from "../game/living/living-fixtures";
import { brightestBackdrop, contrastRatio, getRealmBackdrop } from "./realm-backdrop";

test("the phone background is the field picture under your own figure, and changes when you move", () => {
  const state = nextState(livingTestState(), draft => { draft.players[0]!.position = 8; draft.players[1]!.position = 24; });
  assert.deepEqual(getRealmBackdrop(state, "p1"), { path: "/assets/board/fields/silberblatt.webp", region: "elves" });
  assert.equal(getRealmBackdrop(state, "p2")?.region, "orcs");
  assert.equal(getRealmBackdrop(nextState(state, draft => { draft.status = "finished"; }), "p1"), undefined);
  assert.ok(BOARD_TILES.every(tile => getRealmBackdrop(nextState(state, draft => { draft.players[0]!.position = tile.index; }), "p1")), "every field has a picture");
});

test("text stays readable: even a pure white picture is dimmed far enough", () => {
  const parchment: [number, number, number] = [232, 220, 192];
  const muted: [number, number, number] = [170, 158, 140];
  assert.ok(contrastRatio(parchment, brightestBackdrop()) >= 7, "body text: AAA");
  assert.ok(brightestBackdrop()[0] >= 40, "still visibly a picture, not black");
  assert.ok(contrastRatio(muted, brightestBackdrop()) >= 4.5, "muted text: AA");
});
