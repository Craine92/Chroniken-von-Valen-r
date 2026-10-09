import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOARD_TILES, CHRONICLE_EVENTS, getRegionalChronicleDefinition, RELIC_DEFINITIONS, getPropertyGroupTiles, type GameState, type RelicId } from "@valenor/shared";
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

test("all relics are displayed as ready without activation controls", () => {
  for (const id of Object.keys(RELIC_DEFINITIONS) as RelicId[]) {
    const game = state(); game.players[0]!.relics = [id];
    const markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
    assert.ok(markup.includes(RELIC_DEFINITIONS[id].name)); assert.ok(markup.includes(RELIC_DEFINITIONS[id].description));
    assert.ok(markup.includes(RELIC_ASSETS[id].path)); assert.match(markup, /role="img"/);
    assert.match(markup, /BEREIT/);
    assert.doesNotMatch(markup, /<button[^>]*>.*aktivieren/i);
  }
});

test("overview shows building levels and direct build and sale actions", () => {
  const game = state(); game.propertyOwnerships = [{tileIndex:1,ownerId:'p1',mortgaged:false,buildingLevel:2},{tileIndex:3,ownerId:'p1',mortgaged:false,buildingLevel:1}];
  const markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(markup,/STUFE 2 · Baumhaus/); assert.match(markup,/STUFE 1 · Wurzelhütte/); assert.match(markup,/controller-level-dots/);
  assert.match(markup,/controller-inline-build/); assert.match(markup,/\+ BAUEN · 50 GOLD/); assert.match(markup,/− VERKAUFEN · 25 GOLD/);
  assert.match(markup,/Zuerst Sternenlichtung ausbauen/); assert.match(markup,/controller-property-group property-group/);
  assert.match(markup,/Dein Besitz:/); assert.doesNotMatch(markup,/controller-property-detail/);
  assert.match(markup,/Unbegrenzt/); assert.doesNotMatch(markup,/Bauwerke \d+ \/ 32|Großbauten \d+ \/ 12/);
});

test("overview and detail use the actual regional chronicle build price and retain touch-safe separate controls", () => {
  const game = state(); game.currentRound = 4;
  game.activeChronicleEvent = {...getRegionalChronicleDefinition(CHRONICLE_EVENTS[4]!,['elves']),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
  game.propertyOwnerships = getPropertyGroupTiles('group_mondhain').map(tile=>({tileIndex:tile.index,ownerId:'p1',mortgaged:false,buildingLevel:0}));
  const markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(markup,/UNBEBAUT/); assert.match(markup,/\+ BAUEN · 38 GOLD/); assert.doesNotMatch(markup,/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
  const detail = renderToStaticMarkup(<ControllerPropertyDetails state={game} playerId="p1" connected tile={BOARD_TILES[1]!} {...callbacks} />);
  assert.match(detail,/controller-action-bar/); assert.match(detail,/Bauen · 38 Gold/); assert.match(detail,/Mietstaffel anzeigen/); assert.doesNotMatch(detail,/Verkaufen/);
});

test("overview uses the effective Baueifer price and keeps blocked actions visible with their reason", () => {
  const game = state();
  game.worldImpulseEffects = { buildingFervor: true };
  game.propertyOwnerships = getPropertyGroupTiles("group_mondhain").map(tile => ({ tileIndex: tile.index, ownerId: "p1", mortgaged: false, buildingLevel: 0 }));
  let markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(markup, /\+ BAUEN · 40 GOLD/);
  game.propertyOwnerships[0]!.mortgaged = true;
  markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(markup, /disabled=""[^>]*>\+ BAUEN · 40 GOLD/);
  assert.match(markup, /Zuerst müssen alle Hypotheken dieser Baugruppe ausgelöst werden/);
});

test("sale action appears in overview and detail and uses current chronicle proceeds", () => {
  const game = state();
  game.propertyOwnerships = getPropertyGroupTiles('group_mondhain').map(tile=>({tileIndex:tile.index,ownerId:'p1',mortgaged:false,buildingLevel:0}));
  const render = () => renderToStaticMarkup(<ControllerPropertyDetails state={game} playerId="p1" connected tile={BOARD_TILES[1]!} {...callbacks} />);
  assert.doesNotMatch(render(),/Verkaufen/);
  game.propertyOwnerships[0]!.buildingLevel = 1; game.propertyOwnerships[1]!.buildingLevel = 1;
  let markup = render();
  assert.match(markup,/Verkaufen · \+25 Gold/);
  game.currentRound=4;
  game.activeChronicleEvent={...getRegionalChronicleDefinition(CHRONICLE_EVENTS[7]!,['elves']),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
  assert.match(render(),/Verkaufen · \+38 Gold/);
  const overview = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(overview,/− VERKAUFEN · 38 GOLD/);
});

test("overview exposes levels 0, 1, 3 and 5 with correct building names for own and rival properties", () => {
  for (const [level, expected] of [[0, "UNBEBAUT"], [1, "STUFE 1 · Wurzelhütte"], [3, "STUFE 3 · Hainheiligtum"], [5, "STUFE 5 · Sternenzitadelle"]] as const) {
    const game = state();
    game.propertyOwnerships = [{ tileIndex: 6, ownerId: level === 3 ? "p2" : "p1", mortgaged: false, buildingLevel: level }];
    const markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
    assert.ok(markup.includes(expected), `level ${level} should render ${expected}`);
    assert.equal((markup.match(/<i class="is-active"><\/i>/g) ?? []).length, level);
    if (level === 3) assert.match(markup, /Besitz: Myrra mit einem langen Namen/);
  }
});

test("complete groups show build-ready or maximum badges", () => {
  const game = state();
  game.propertyOwnerships = getPropertyGroupTiles("group_amethystwald").map(tile => ({ tileIndex: tile.index, ownerId: "p1", mortgaged: false, buildingLevel: 0 }));
  let markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(markup, /BAUBEREIT/);
  game.propertyOwnerships.forEach(ownership => { ownership.buildingLevel = 5; });
  markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
  assert.match(markup, /MAXIMAL AUSGEBAUT/);
});

test("foreign active properties expose quick trade, while free and bankrupt properties do not", () => {
  const game = state();
  game.propertyOwnerships = [{ tileIndex: 6, ownerId: "p1", mortgaged: false, buildingLevel: 0 }, { tileIndex: 8, ownerId: "p2", mortgaged: false, buildingLevel: 1 }];
  const render = () => renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} onOfferTrade={() => undefined} />);
  assert.equal((render().match(/HANDEL ANBIETEN/g) ?? []).length, 1);
  game.players[1]!.isBankrupt = true;
  assert.doesNotMatch(render(), /HANDEL ANBIETEN/);
});

test("mobile possessions start with compact groups and no expanded property details", () => {
  const game = state();
  const tiles = getPropertyGroupTiles("group_amethystwald");
  for (const count of [1, 2, 3]) {
    game.propertyOwnerships = tiles.slice(0, count).map(tile => ({ tileIndex: tile.index, ownerId: "p1", mortgaged: false, buildingLevel: 0 }));
    const before = JSON.stringify(game);
    const markup = renderToStaticMarkup(<ControllerPossessions state={game} playerId="p1" connected {...callbacks} />);
    assert.match(markup, new RegExp(`${count} / 3`));
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
  game.propertyOwnerships = getPropertyGroupTiles("group_amethystwald").map(tile => ({ tileIndex: tile.index, ownerId: "p1", mortgaged: false, buildingLevel: 2 }));
  const tile = BOARD_TILES[6]!;
  const markup = renderToStaticMarkup(<ControllerPropertyDetails state={game} playerId="p1" connected tile={tile} {...callbacks} />);
  assert.match(markup, /Aktuelle Miete/);
  assert.match(markup, new RegExp(`${tile.economy!.rentSchedule![2]} Gold`));
  assert.match(markup, /Nächste Stufe/);
  assert.match(markup, /Maximalmiete/);
  assert.match(markup, /<details class="controller-rent-schedule"><summary>Mietstaffel anzeigen/);
  assert.match(markup, /Bauen · 50 Gold/);
  assert.match(markup, /Verkaufen · \+25 Gold/);
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
  assert.match(own, /Du besitzt nicht die gesamte Baugruppe/);
  assert.doesNotMatch(own, /controller-action-bar/);
  assert.match(own, /Hypothek auslösen/);
  assert.match(own, /<p>[^<]+<\/p>/);
});
