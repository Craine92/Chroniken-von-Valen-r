import assert from "node:assert/strict";
import test from "node:test";
import { CHRONICLE_EVENTS } from "@valenor/shared";
import { CHRONICLE_MOODS, DAYTIME_MOODS, FIELD_RING_FACTOR, MAX_FIELD_TINT_ALPHA, MAX_TINT_ALPHA, MOOD_TRANSITION_MS, getAtmosphere, getTimeOfDay, mixColor } from "./atmosphere";

test("each of the eight chronicle events has its own mood, and no mood hides the fields", () => {
  assert.deepEqual(Object.keys(CHRONICLE_MOODS).sort(), CHRONICLE_EVENTS.map(event => event.id).sort());
  const signatures = Object.values(CHRONICLE_MOODS).map(mood => `${mood.tint}:${mood.blend}:${mood.saturation}`);
  assert.equal(new Set(signatures).size, 8, "every event looks different");
  for (const mood of [...Object.values(CHRONICLE_MOODS), ...Object.values(DAYTIME_MOODS)]) {
    assert.ok(mood.tintAlpha <= MAX_TINT_ALPHA && mood.brightness >= .88 && mood.brightness <= 1.08, "fields stay readable");
    assert.ok(mood.tintAlpha * FIELD_RING_FACTOR <= MAX_FIELD_TINT_ALPHA, "over the fields the veil stays as light as before");
  }
  // Etwa doppelt so deutlich: Jedes Ereignis färbt das Innere der Reiche mindestens mit 20 %.
  assert.ok(Object.values(CHRONICLE_MOODS).every(mood => mood.tintAlpha >= .2));
  assert.equal(CHRONICLE_MOODS["blood-moon"]!.moon, 0xd8352c, "blood moon brings a red moon");
  assert.ok(CHRONICLE_MOODS["resource-shortage"]!.saturation < -.2, "scarcity is cool and sparse");
  assert.equal(CHRONICLE_MOODS["four-realms-peace"]!.blend, "screen", "peace is warm golden light");
});

test("the light wanders with the rounds: two rounds each for morning, day, evening and night", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(getTimeOfDay), ["morning", "morning", "day", "day", "evening", "evening", "night", "night", "morning"]);
  assert.equal(getAtmosphere(7, undefined, "high", false).windowLights, 1, "windows and torches glow at night");
  assert.equal(getAtmosphere(3, undefined, "high", false).windowLights, 0);
  assert.ok(getAtmosphere(5, undefined, "high", false).windowLights > 0, "evening lights start softly");
});

test("quality levels: bloom only on high, low and reduced motion stay calm and quick", () => {
  const high = getAtmosphere(3, "blood-moon", "high", false), medium = getAtmosphere(3, "blood-moon", "medium", false), low = getAtmosphere(3, "blood-moon", "low", false);
  assert.equal(high.bloom, true);
  assert.equal(medium.bloom, false);
  assert.equal(medium.vignette, true);
  assert.equal(low.bloom || low.vignette || low.colorGrading, false);
  assert.equal(low.transitionMs, MOOD_TRANSITION_MS.calm);
  assert.equal(getAtmosphere(3, undefined, "high", true).transitionMs, MOOD_TRANSITION_MS.calm);
  assert.equal(high.transitionMs, MOOD_TRANSITION_MS.full);
});

test("an event at night keeps its mood but stays dark enough and shows the moon", () => {
  const night = getAtmosphere(8, "four-realms-peace", "high", false);
  assert.ok(night.mood.brightness <= .95);
  assert.ok(night.mood.moon !== undefined);
  assert.equal(mixColor(0x000000, 0xffffff, .5), 0x808080);
});
