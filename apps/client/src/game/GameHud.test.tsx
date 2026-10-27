import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EmoteSignal } from "@valenor/shared";
import { GameHud } from "./GameHud";
import { livingTestState } from "./living/living-fixtures";

test("the TV shows an emote bubble at the sender's portrait only", () => {
  const emote: EmoteSignal = { id: "p2:1", playerId: "p2", emoteId: "laugh", color: "green", sentAt: 1 };
  const html = renderToStaticMarkup(<GameHud gameState={livingTestState()} emotes={{ p2: emote }} />);
  const cards = html.split("<article").slice(1);
  assert.match(cards[1]!, /hud-emote hud-emote--laugh/);
  assert.match(cards[1]!, /aria-label="Justine: Lachen"/);
  assert.match(cards[1]!, /Ha-ha-ha!/);
  assert.equal((html.match(/hud-emote /g) ?? []).length, 1, "only the sender gets a bubble");
});
