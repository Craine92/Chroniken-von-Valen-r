import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOARD_TILES, getPropertyGroupTiles, type GameState } from "@valenor/shared";
import { ControllerPossessions, ControllerPropertyDetails } from "./ControllerPossessions";

function state(): GameState {
  return {
    roomId: "VAL-MOBILE", status: "playing", config: { mode: "chronicles" },
    players: ["p1", "p2"].map((id, index) => ({ id, name: index ? "Myrra mit einem langen Namen" : "Philipp", type: "human", color: index ? "green" : "violet", connectionState: "connected", gold: 1500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } })),
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [], trades: [], startedAt: 1
  };
}
const callbacks = { onSelectGroup: () => undefined, onBuild: () => undefined, onMortgage: () => undefined };

test("mobile possessions start with compact groups and no expanded property details", () => {
  const game = state();
  const tiles = getPropertyGroupTiles("group_amethystwald");
  for (const count of [1, 2, 3]) {
    game.propertyOwnerships = tiles.slice(0, count).map(tile => ({ tileIndex: tile.index, ownerId: "p1", mortgaged: false, buildingLevel: 0 }));
    const before = JSON.stringify(game);
    const markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
    assert.match(markup, new RegExp(`${count}/3`));
    assert.match(markup, /Amethystwald/);
    assert.match(markup, /--property-group-accent:#9b5de5/);
    assert.doesNotMatch(markup, /controller-property-detail/);
    assert.doesNotMatch(markup, /Mietstaffel anzeigen/);
    if (count < 3) assert.match(markup, /Fehlt:/);
    assert.equal(JSON.stringify(game), before);
  }
});

test("mobile empty possession and rival/mortgaged members keep readable owner status", () => {
  const game = state();
  assert.match(renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />), /Noch keine Ländereien/);
  game.propertyOwnerships = [{ tileIndex: 6, ownerId: "p1", mortgaged: false, buildingLevel: 0 }, { tileIndex: 8, ownerId: "p2", mortgaged: true, buildingLevel: 0 }];
  const markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(markup, /Besitz: Myrra mit einem langen Namen/);
  assert.match(markup, /Belehnt/);
  assert.match(markup, /Frei/);
});

test("selected mobile details emphasize rent and keep full rent tiers collapsed", () => {
  const game = state();
  game.propertyOwnerships = getPropertyGroupTiles("group_amethystwald").map(tile => ({ tileIndex: tile.index, ownerId: "p1", mortgaged: false, buildingLevel: tile.index === 6 ? 2 : 1 }));
  const tile = BOARD_TILES[6]!;
  const markup = renderToStaticMarkup(<ControllerPropertyDetails state={game} playerId="p1" connected tile={tile} {...callbacks} />);
  assert.match(markup, /Aktuelle Miete/);
  assert.match(markup, new RegExp(`${tile.economy!.rentSchedule![2]} Gold`));
  assert.match(markup, /Nächste Stufe/);
  assert.match(markup, /Maximalmiete/);
  assert.match(markup, /<details class="controller-rent-schedule"><summary>Mietstaffel anzeigen/);
  assert.match(markup, /Bauen · 50 Gold/);
  assert.match(markup, /Baustufe verkaufen/);
});

test("rival details are read only and own blocked actions retain authoritative reasons", () => {
  const game = state();
  game.propertyOwnerships = [{ tileIndex: 6, ownerId: "p2", mortgaged: true, buildingLevel: 0 }];
  const rival = renderToStaticMarkup(<ControllerPropertyDetails state={game} playerId="p1" connected tile={BOARD_TILES[6]!} {...callbacks} />);
  assert.match(rival, /Besitz: Myrra/);
  assert.match(rival, /Belehnt/);
  assert.doesNotMatch(rival, /controller-property-actions/);
  game.propertyOwnerships[0]!.ownerId = "p1";
  const own = renderToStaticMarkup(<ControllerPropertyDetails state={game} playerId="p1" connected tile={BOARD_TILES[6]!} {...callbacks} />);
  assert.match(own, /disabled=""[^>]*>Bauen/);
  assert.match(own, /Hypothek auslösen/);
  assert.match(own, /<p>[^<]+<\/p>/);
});
