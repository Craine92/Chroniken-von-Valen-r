import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_GRAPHICS_QUALITY, prefersReducedMotion, VISUAL_QUALITY } from "./visual-config";

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
