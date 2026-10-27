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

test("the TV marks players facing bankruptcy with a pulse and a label", () => {
  const state = livingTestState();
  state.players[2]!.gold = 80;
  state.pendingPayment = { payerId: "p3", payeeId: "p1", amount: 300, reason: "Miete", reasonType: "rent" };
  const cards = renderToStaticMarkup(<GameHud gameState={state} />).split("<article").slice(1);
  assert.match(cards[2]!, /is-in-danger/);
  assert.match(cards[2]!, /Bankrott droht/);
  assert.doesNotMatch(cards[0]!, /is-in-danger/);
});
