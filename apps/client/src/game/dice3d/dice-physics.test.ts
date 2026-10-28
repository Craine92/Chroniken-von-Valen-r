import assert from "node:assert/strict";
import test from "node:test";
import { CUBE_ROTATIONS, DICE_ARENA, DICE_SETTLE_FRAMES, DIE_SIZE, FACE_NORMALS, FACE_VALUES, faceRemap, planThrow, rotateVector, simulateThrow, topFace, visibleValue } from "./dice-physics";

test("the 24 cube rotations are distinct and keep faces on faces", () => {
  assert.equal(CUBE_ROTATIONS.length, 24);
  const signatures = CUBE_ROTATIONS.map(q => FACE_NORMALS.map(normal => rotateVector(q, normal).map(value => Math.round(value)).join(",")).join("|"));
  assert.equal(new Set(signatures).size, 24);
  assert.deepEqual([...FACE_VALUES].sort(), [1, 2, 3, 4, 5, 6]);
  for (let face = 0; face < 6; face += 2) assert.equal(FACE_VALUES[face]! + FACE_VALUES[face + 1]!, 7, "opposite faces sum to seven");
});

test("a throw is reproducible, ends lying flat inside the arena within 1.1 seconds and has audible impacts", () => {
  const first = simulateThrow(7), second = simulateThrow(7);
  assert.deepEqual(first.frames.at(-1), second.frames.at(-1), "same seed, same path");
  assert.equal(first.frames.length, DICE_SETTLE_FRAMES);
  for (const seed of [1, 2, 3, 42, 99, 2026]) {
    const throwData = simulateThrow(seed);
    const last = throwData.frames.at(-1)!;
    for (const die of last) {
      assert.ok(topFace(die.quaternion).flatness > .98, `seed ${seed}: lies flat`);
      assert.ok(Math.abs(die.position[1] - DIE_SIZE / 2) < .1, `seed ${seed}: on the floor`);
      assert.ok(Math.abs(die.position[0]) < DICE_ARENA.width / 2 && Math.abs(die.position[2]) < DICE_ARENA.depth / 2, `seed ${seed}: inside`);
    }
    assert.ok(throwData.impacts.length >= 1, `seed ${seed}: the dice hit the table`);
  }
});

test("the dice always show exactly the server's numbers: all 36 combinations over many throws", () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const throwData = simulateThrow(seed * 7919);
    const last = throwData.frames.at(-1)!;
    for (let die1 = 1; die1 <= 6; die1 += 1) for (let die2 = 1; die2 <= 6; die2 += 1) {
      const remaps = [faceRemap(die1, throwData.topFaces[0]), faceRemap(die2, throwData.topFaces[1])];
      assert.equal(visibleValue(last[0].quaternion, remaps[0]!), die1, `seed ${seed}: first die ${die1}`);
      assert.equal(visibleValue(last[1].quaternion, remaps[1]!), die2, `seed ${seed}: second die ${die2}`);
    }
  }
});

test("planThrow combines path and face mapping for a server roll, doubles included", () => {
  for (const [die1, die2, seed] of [[6, 6, 11], [1, 1, 12], [3, 4, 13], [2, 5, 14]] as const) {
    const plan = planThrow(die1, die2, seed);
    const last = plan.trajectory.frames.at(-1)!;
    assert.deepEqual([visibleValue(last[0].quaternion, plan.remaps[0]), visibleValue(last[1].quaternion, plan.remaps[1])], [die1, die2]);
  }
});
