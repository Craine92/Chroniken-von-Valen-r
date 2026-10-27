import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMOTE_COOLDOWN_MS, EMOTE_IDS } from "@valenor/shared";
import { EmoteBar, emoteSecondsLeft } from "./EmoteBar";

test("the emote bar offers four large buttons and shows the remaining cooldown", () => {
  const idle = renderToStaticMarkup(<EmoteBar connected onSend={() => undefined} />);
  assert.equal((idle.match(/class="emote-button /g) ?? []).length, EMOTE_IDS.length);
  for (const label of ["Jubel", "Fluch", "Lachen", "Staunen"]) assert.match(idle, new RegExp(`aria-label="${label} senden"`));
  assert.doesNotMatch(idle, /disabled/);
  assert.match(idle, /Reagiere auf das Geschehen am Brett/);

  const cooling = renderToStaticMarkup(<EmoteBar connected onSend={() => undefined} initialCooldownUntil={Date.now() + EMOTE_COOLDOWN_MS} />);
  assert.equal((cooling.match(/disabled=""/g) ?? []).length, EMOTE_IDS.length, "all buttons wait during the cooldown");
  assert.match(cooling, /wieder in 5 s/);
  assert.match(renderToStaticMarkup(<EmoteBar connected={false} onSend={() => undefined} />), /disabled=""/);
});

test("the cooldown seconds round up so a locked button never says 0 s", () => {
  assert.equal(emoteSecondsLeft(10_000, 10_000), 0);
  assert.equal(emoteSecondsLeft(10_001, 10_000), 1);
  assert.equal(emoteSecondsLeft(15_000, 10_000), 5);
  assert.equal(emoteSecondsLeft(9_000, 10_000), 0);
});
