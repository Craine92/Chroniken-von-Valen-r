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

test("character cards show portrait, name, gold and a dot per owned group; the active card stands out", async () => {
  const { getPlayerGroupDots, countValue } = await import("./character-card");
  const { BOARD_TILES } = await import("@valenor/shared");
  const state = livingTestState();
  const mondhain = BOARD_TILES.filter(tile => tile.propertyGroupId === "group_mondhain");
  const amethyst = BOARD_TILES.find(tile => tile.propertyGroupId === "group_amethystwald")!;
  state.propertyOwnerships = [...mondhain.map(tile => ({ tileIndex: tile.index, ownerId: "p1", buildingLevel: 0 as const, mortgaged: false })),
    { tileIndex: amethyst.index, ownerId: "p1", buildingLevel: 0, mortgaged: false }];
  assert.deepEqual(getPlayerGroupDots(state, "p1").map(dot => [dot.name, dot.owned, dot.total, dot.complete]), [["Mondhain", 2, 2, true], ["Amethystwald", 1, 3, false]]);
  assert.deepEqual(getPlayerGroupDots(state, "p2"), []);
  const cards = renderToStaticMarkup(<GameHud gameState={state} />).split("<article").slice(1);
  assert.match(cards[0]!, /character-card character-card--violet is-active/);
  assert.match(cards[0]!, /AM ZUG/);
  assert.match(cards[0]!, /Mondhain: 2 von 2, komplett/);
  assert.match(cards[0]!, /1\.000/);
  assert.doesNotMatch(cards[1]!, /is-active|character-card__groups/);
  // Hochzählen: zügig los, sanft auslaufend, am Ende genau der neue Wert.
  assert.equal(countValue(1_000, 1_500, 0), 1_000);
  assert.ok(countValue(1_000, 1_500, .5) > 1_250);
  assert.equal(countValue(1_000, 1_500, 1), 1_500);
  assert.equal(countValue(1_000, 400, 2), 400);
});
