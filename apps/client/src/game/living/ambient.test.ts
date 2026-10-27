import assert from "node:assert/strict";
import test from "node:test";
import { chooseChimneyTiles } from "./ambient";

test("smoke rises above the highest buildings first and never above more than the budget", () => {
  const owned = (tileIndex: number, buildingLevel: 0 | 1 | 2 | 3 | 4 | 5) => ({ tileIndex, ownerId: "p1", mortgaged: false, buildingLevel });
  const state = { propertyOwnerships: [owned(1, 2), owned(3, 0), owned(6, 5), owned(8, 2), owned(9, 4)] };
  assert.deepEqual(chooseChimneyTiles(state, 3), [6, 9, 1]);
  assert.deepEqual(chooseChimneyTiles(state, 10), [6, 9, 1, 8], "unbuilt land has no chimney");
  assert.deepEqual(chooseChimneyTiles(state, 0), []);
});
