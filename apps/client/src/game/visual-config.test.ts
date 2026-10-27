import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_GRAPHICS_QUALITY, getLivingBoardSettings, prefersReducedMotion, resolveGraphicsQuality, VISUAL_QUALITY } from "./visual-config";

test("visual quality tiers reduce ornamental work without changing game state", () => {
  assert.equal(DEFAULT_GRAPHICS_QUALITY, "high");
  assert.ok(VISUAL_QUALITY.high.ambientMotes > VISUAL_QUALITY.medium.ambientMotes);
  assert.ok(VISUAL_QUALITY.medium.ambientMotes > VISUAL_QUALITY.low.ambientMotes);
  assert.equal(VISUAL_QUALITY.low.animateAmbient, false);
});

test("reduced-motion preference is read defensively from the browser", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: true }) } });
  assert.equal(prefersReducedMotion(), true);
  if (previousWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  else Reflect.deleteProperty(globalThis, "window");
});

test("a quality chosen in the address wins over the stored one; unknown values fall back to high", () => {
  assert.equal(resolveGraphicsQuality("?quality=low", "high"), "low");
  assert.equal(resolveGraphicsQuality("?scene=four&quality=medium", null), "medium");
  assert.equal(resolveGraphicsQuality("", "low"), "low");
  assert.equal(resolveGraphicsQuality("?quality=ultra", "medium"), "medium");
  assert.equal(resolveGraphicsQuality("", "ultra"), DEFAULT_GRAPHICS_QUALITY);
});

test("the living board is calm on low quality and with reduced motion, lighter on medium", () => {
  const high = getLivingBoardSettings("high", false);
  const medium = getLivingBoardSettings("medium", false);
  assert.equal(high.drama, "full");
  assert.equal(high.tokenReactions, true);
  assert.ok(high.ambient.fireflies > medium.ambient.fireflies && medium.ambient.fireflies > 0);
  assert.ok(high.ambient.smoke > medium.ambient.smoke && high.ambient.embers > medium.ambient.embers);
  assert.equal(medium.ambient.birds, false);
  for (const calm of [getLivingBoardSettings("low", false), getLivingBoardSettings("high", true), getLivingBoardSettings("medium", true)]) {
    assert.deepEqual(calm.ambient, { smoke: 0, embers: 0, fireflies: 0, cloudShadows: 0, birds: false });
    assert.equal(calm.tokenReactions, false);
    assert.equal(calm.drama, "calm");
  }
});
