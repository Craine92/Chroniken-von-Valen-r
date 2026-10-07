import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOARD_TILES, CHRONICLE_EVENTS, getRegionalChronicleDefinition, RELIC_DEFINITIONS, RELIC_ACTIONS, getPropertyGroupTiles, type GameState, type RelicId } from "@valenor/shared";
import { RELIC_ASSETS } from "../game/assets/asset-manifest";
import { ControllerPossessions, ControllerPropertyDetails } from "./ControllerPossessions";

function state(): GameState {
  return {
    roomId: "VAL-MOBILE", status: "playing", config: { mode: "chronicles" },
    players: ["p1", "p2"].map((id, index) => ({ id, name: index ? "Myrra mit einem langen Namen" : "Philipp", type: "human", color: index ? "green" : "violet", characterId: "humanKnight" as const, connectionState: "connected", gold: 1500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } })),
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [], trades: [], startedAt: 1
  };
}
const callbacks = { onSelectGroup: () => undefined, onBuild: () => undefined, onMortgage: () => undefined };

test("possessions show two compact relic slots using the shared relic definitions", () => {
  const game = state(); game.players[0]!.relics = ["runestone","golden-feather"];
  const markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(markup, /DEINE RELIKTE/); assert.match(markup, /2 \/ 2/);
  for (const id of game.players[0]!.relics) {
    assert.ok(markup.includes(RELIC_DEFINITIONS[id].name));
    assert.ok(markup.includes(RELIC_DEFINITIONS[id].description));
    assert.ok(markup.includes(RELIC_ASSETS[id].path));
  }
});

test("all relics display their name, full explanation, icon and activation state", () => {
  for (const id of Object.keys(RELIC_DEFINITIONS) as RelicId[]) {
    const game = state(); game.players[0]!.relics = [id];
    const render = () => renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} onActivateRelic={() => undefined} onUseRuneStone={() => undefined} />);
    let markup = render();
    assert.ok(markup.includes(RELIC_DEFINITIONS[id].name)); assert.ok(markup.includes(RELIC_DEFINITIONS[id].description));
    assert.ok(markup.includes(RELIC_ASSETS[id].path)); assert.match(markup, /role="img"/);
    if (id === "runestone") {
      assert.match(markup, /disabled=""[^>]*>Neu würfeln/); assert.match(markup, /Nach einem normalen Würfelwurf verfügbar/);
      game.turnPhase = "rolling"; game.turnContext.awaitingRuneStoneDecision = true; game.turnContext.rollKind = "normal";
      assert.match(render(), /<button type="button">Neu würfeln/);
      game.currentPlayerId = "p2"; assert.match(render(), /disabled=""[^>]*>Neu würfeln/);
    } else {
      assert.ok(markup.includes(RELIC_ACTIONS[id].label));
      game.players[0]!.armedRelics = [id]; markup = render();
      assert.ok(markup.includes(RELIC_ACTIONS[id].status)); assert.match(markup, /controller-relic--armed/);
    }
  }
});

test("overview shows current building levels, names and a direct build button only for the lowest street", () => {
  const game = state(); game.propertyOwnerships = [{tileIndex:1,ownerId:'p1',mortgaged:false,buildingLevel:2},{tileIndex:3,ownerId:'p1',mortgaged:false,buildingLevel:1}];
  const markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(markup,/Stufe 2 · Baumhaus/); assert.match(markup,/Stufe 1 · Wurzelhütte/); assert.match(markup,/aria-label="Baustufe 2"/);
  assert.equal((markup.match(/class="controller-inline-build"/g)??[]).length,1); assert.match(markup,/\+ BAUEN · 50 GOLD/);
  assert.match(markup,/Zuerst Sternenlichtung ausbauen/); assert.doesNotMatch(markup,/controller-property-detail/);
  assert.match(markup,/Unbegrenzt/); assert.doesNotMatch(markup,/Bauwerke \d+ \/ 32|Großbauten \d+ \/ 12/);
});

test("overview and detail use the actual regional chronicle build price and retain touch-safe separate controls", () => {
  const game = state(); game.currentRound = 4;
  game.activeChronicleEvent = {...getRegionalChronicleDefinition(CHRONICLE_EVENTS[4]!,['elves']),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
  game.propertyOwnerships = getPropertyGroupTiles('group_mondhain').map(tile=>({tileIndex:tile.index,ownerId:'p1',mortgaged:false,buildingLevel:0}));
  const markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(markup,/UNBEBAUT/); assert.match(markup,/\+ BAUEN · 38 GOLD/); assert.doesNotMatch(markup,/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
  const detail = renderToStaticMarkup(<ControllerPropertyDetails state={game} playerId="p1" connected tile={BOARD_TILES[1]!} {...callbacks} />);
  assert.match(detail,/Bauen · 38 Gold/); assert.match(detail,/Mietstaffel anzeigen/); assert.match(detail,/Baustufe verkaufen/);
});

test("direct sale is absent at level zero and uses even-sale eligibility and the current chronicle proceeds", () => {
  const game = state();
  game.propertyOwnerships = getPropertyGroupTiles('group_mondhain').map(tile=>({tileIndex:tile.index,ownerId:'p1',mortgaged:false,buildingLevel:0}));
  const render = () => renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.doesNotMatch(render(),/controller-inline-sell/);
  game.propertyOwnerships[0]!.buildingLevel = 1; game.propertyOwnerships[1]!.buildingLevel = 2;
  let markup = render();
  assert.equal((markup.match(/class="controller-inline-sell"/g)??[]).length,1);
  assert.match(markup,/− BAUSTUFE VERKAUFEN · \+25 GOLD/);
  assert.match(markup,/Zuerst Baustufe auf Sternenlichtung reduzieren\./);
  game.currentRound=4;
  game.activeChronicleEvent={...getRegionalChronicleDefinition(CHRONICLE_EVENTS[7]!,['elves']),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
  assert.match(render(),/− BAUSTUFE VERKAUFEN · \+38 GOLD/);
  game.propertyOwnerships[1]!.buildingLevel=1;
  assert.equal((render().match(/class="controller-inline-sell"/g)??[]).length,2);
});

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
