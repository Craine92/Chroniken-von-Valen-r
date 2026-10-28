import assert from "node:assert/strict";
import test from "node:test";
import { CAMERA_KIND_COOLDOWN_MS, CAMERA_MAX_ZOOM, CAMERA_SHOTS, CAMERA_TIMING, CameraDirector, FOLLOW, clampToBoard, followTarget, grandStartDurationMs, shotDurationMs, type CameraShotKind } from "./camera-director";

test("every camera move lasts at most two seconds and never zooms closer than 1.35x", () => {
  for (const kind of Object.keys(CAMERA_SHOTS) as CameraShotKind[]) {
    assert.ok(shotDurationMs(kind) <= CAMERA_TIMING.maxShotMs, kind);
    assert.ok(CAMERA_SHOTS[kind].zoom <= CAMERA_MAX_ZOOM, kind);
  }
  assert.ok(CAMERA_TIMING.interruptMs <= 250, "when a player acts the camera is back almost at once");
});

test("the same kind of move waits thirty seconds; dragon, level 5, bankruptcy and victory may always run", () => {
  const director = new CameraDirector(() => true);
  assert.equal(director.request("highRent", 0), true);
  director.release();
  assert.equal(director.request("highRent", 10_000), false, "too soon");
  assert.equal(director.request("auction", 10_000), true, "another kind is fine");
  director.release();
  assert.equal(director.request("highRent", CAMERA_KIND_COOLDOWN_MS), true);
  for (const kind of ["dragon", "build5", "bankrupt", "victory"] as const) {
    director.release();
    assert.equal(director.request(kind, 50_000), true, kind);
    director.release();
    assert.equal(director.request(kind, 50_001), true, `${kind} again`);
  }
});

test("a more important moment takes over a running move, a less important one waits its turn", () => {
  const director = new CameraDirector(() => true);
  assert.equal(director.request("auction", 0), true);
  assert.equal(director.request("dragon", 100), true, "the dragon replaces the auction");
  assert.equal(director.active, "dragon");
  assert.equal(director.request("groupComplete", 200), false, "the group waits behind the dragon");
  assert.equal(director.request("bankrupt", 300), true);
});

test("with the TV switch off there are no camera moves at all", () => {
  let enabled = false;
  const director = new CameraDirector(() => enabled);
  assert.equal(director.request("victory", 0), false);
  enabled = true;
  assert.equal(director.request("victory", 1), true);
});

test("a short move never shows the empty table beyond the board edge", () => {
  const board = { width: 1700, height: 1000 }, view = { width: 1700, height: 1080 };
  // Bei Zoom 1 passt das Brett gerade hinein: kein Spielraum, die Kamera bleibt in der Mitte.
  assert.deepEqual(clampToBoard({ x: 600, y: -400 }, 1, view, board), { x: 0, y: 0 });
  // Bei 1,35-fach darf sie bis zum Rand rücken, aber nicht weiter.
  const edge = clampToBoard({ x: 800, y: -480 }, 1.35, view, board);
  assert.ok(Math.abs(edge.x - (850 - 1700 / 2.7)) < 1e-9 && Math.abs(edge.y - -(500 - 1080 / 2.7)) < 1e-9);
  assert.deepEqual(clampToBoard({ x: 50, y: 20 }, 1.35, view, board), { x: 50, y: 20 }, "targets in the middle stay centered");
});

test("following a moving figure stays gentle and the grand start is short enough to skip comfortably", () => {
  assert.deepEqual(followTarget({ x: 800, y: -400 }), { x: 800 * FOLLOW.share, y: -400 * FOLLOW.share });
  assert.ok(FOLLOW.share <= .3 && FOLLOW.zoom <= 1.1);
  assert.ok(grandStartDurationMs() <= 7_000, `${grandStartDurationMs()} ms`);
});
