import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_TILES,
  BUILDING_BANK_CAPACITY,
  PROPERTY_GROUPS,
  calculatePropertyRent,
  canBuildOnProperty,
  canSellBuilding,
  getBuildingName,
  CHRONICLE_EVENTS,
  getRegionalChronicleDefinition,
  getEffectiveBuildCost,
  getEffectiveBuildingSaleValue,
  ownsCompletePropertyGroup,
  type BuildingLevel,
  type GameState
} from "@valenor/shared";
import { EconomicAi } from "../ai/economic-ai";
import { BuildingService } from "./building-service";
import { EconomyService } from "./economy-service";

const buildings = new BuildingService();
const economy = new EconomyService();
const ai = new EconomicAi();

function state(): GameState {
  return {
    roomId: "VAL-BUILD", status: "playing", config: { mode: "chronicles" },
    players: [
      { id: "p1", name: "Philipp", type: "human", color: "violet", connectionState: "connected", gold: 2_000, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
      { id: "p2", name: "Aelor", type: "computer", color: "green", connectionState: "connected", gold: 2_000, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
    ],
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: BUILDING_BANK_CAPACITY.settlementUnits, grandStructuresAvailable: BUILDING_BANK_CAPACITY.grandStructures },
    economyLog: [], trades: [], startedAt: 1
  };
}

function own(game: GameState, playerId: string, entries: Array<number | [number, BuildingLevel]>): void {
  entries.forEach((entry) => {
    const [tileIndex, buildingLevel] = Array.isArray(entry) ? entry : [entry, 0 as BuildingLevel];
    game.propertyOwnerships.push({ tileIndex, ownerId: playerId, mortgaged: false, buildingLevel });
  });
}

test("complete regions recognize two- and three-property groups but ignore harbors and utilities", () => {
  const game = state();
  own(game, "p1", [1, 3, 5, 12]);
  assert.equal(ownsCompletePropertyGroup(game.propertyOwnerships, "p1", "Mondhain"), true);
  own(game, "p1", [6, 8]);
  assert.equal(ownsCompletePropertyGroup(game.propertyOwnerships, "p1", "Amethystwald"), false);
  own(game, "p1", [9]);
  assert.equal(ownsCompletePropertyGroup(game.propertyOwnerships, "p1", "Amethystwald"), true);
  assert.equal(ownsCompletePropertyGroup(game.propertyOwnerships, "p1", "Nordhafen"), false);
});

test("A: owning both streets of an explicit two-property group allows building", () => {
  const game = state();
  own(game, "p1", [1, 3]);
  assert.equal(canBuildOnProperty(game, "p1", 1).allowed, true);
});

test("B: owning only one street of a two-property group blocks building", () => {
  const game = state();
  own(game, "p1", [1]);
  assert.equal(canBuildOnProperty(game, "p1", 1).allowed, false);
});

test("C: owning all three streets of an explicit three-property group allows building", () => {
  const game = state();
  own(game, "p1", [6, 8, 9]);
  assert.equal(canBuildOnProperty(game, "p1", 6).allowed, true);
});

test("D: owning only two streets of a three-property group blocks building", () => {
  const game = state();
  own(game, "p1", [6, 8]);
  assert.equal(canBuildOnProperty(game, "p1", 6).allowed, false);
});

test("E: a complete two-property group builds without the remaining streets on that board side", () => {
  const game = state();
  own(game, "p1", [1, 3]);
  assert.equal(canBuildOnProperty(game, "p1", 3).allowed, true);
  assert.equal(game.propertyOwnerships.some((entry) => [6, 8, 9].includes(entry.tileIndex)), false);
});

test("F: many streets on one board side do not build without a complete configured group", () => {
  const game = state();
  own(game, "p1", [1, 6, 8]);
  assert.equal(canBuildOnProperty(game, "p1", 1).allowed, false);
  assert.equal(canBuildOnProperty(game, "p1", 6).allowed, false);
});

test("every build group centrally declares a stable id and exactly two or three property ids", () => {
  assert.equal(PROPERTY_GROUPS.length, 8);
  assert.equal(PROPERTY_GROUPS.every((group) => group.propertyIds.length === group.size && [2, 3].includes(group.size)), true);
  assert.equal(new Set(PROPERTY_GROUPS.flatMap((group) => group.propertyIds)).size, 22);
});

test("property rent doubles only the undeveloped complete-region base rent", () => {
  const tile = BOARD_TILES[10]!;
  const incomplete = state();
  own(incomplete, "p1", [10]);
  assert.equal(calculatePropertyRent(incomplete.propertyOwnerships, tile, "p1"), 10);
  own(incomplete, "p1", [12, 14]);
  assert.equal(calculatePropertyRent(incomplete.propertyOwnerships, tile, "p1"), 20);
  incomplete.propertyOwnerships.find((entry) => entry.tileIndex === 10)!.buildingLevel = 1;
  assert.equal(calculatePropertyRent(incomplete.propertyOwnerships, tile, "p1"), 50);
});

test("the first and last property expose every authoritative rent tier", () => {
  const first = state();
  own(first, "p1", [1, 3]);
  const firstOwnership = first.propertyOwnerships[0]!;
  assert.equal(calculatePropertyRent(first.propertyOwnerships, BOARD_TILES[1]!, "p1"), 4);
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => {
    firstOwnership.buildingLevel = level as BuildingLevel;
    return calculatePropertyRent(first.propertyOwnerships, BOARD_TILES[1]!, "p1");
  }), [10, 30, 90, 160, 250]);

  const last = state();
  own(last, "p1", [37, 39]);
  const lastOwnership = last.propertyOwnerships.find((entry) => entry.tileIndex === 39)!;
  assert.equal(calculatePropertyRent(last.propertyOwnerships, BOARD_TILES[39]!, "p1"), 100);
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => {
    lastOwnership.buildingLevel = level as BuildingLevel;
    return calculatePropertyRent(last.propertyOwnerships, BOARD_TILES[39]!, "p1");
  }), [200, 600, 1400, 1700, 2000]);
});

test("building charges configured gold and updates level and journal without changing legacy stock", () => {
  const game = state();
  own(game, "p1", [1, 3]);
  buildings.build(game, "p1", 1);
  assert.equal(game.players[0]!.gold, 1_950);
  assert.equal(game.propertyOwnerships[0]!.buildingLevel, 1);
  assert.equal(game.buildingBank.settlementUnitsAvailable, 32);
  assert.match(game.economyLog.at(-1)!.message, /Wurzelhütte.*50 Gold/);
  assert.equal(game.lastBuildingAction?.tileIndex, 1);
});

test("building rejects incomplete groups, foreign and non-property fields", () => {
  const game = state();
  own(game, "p1", [1, 5, 11]);
  assert.match(canBuildOnProperty(game, "p1", 1).reason!, /gesamte Baugruppe/);
  assert.throws(() => buildings.build(game, "p2", 1), /gehört dir nicht/);
  assert.throws(() => buildings.build(game, "p1", 5), /keine Bauwerke/);
  assert.throws(() => buildings.build(game, "p1", 11), /keine Bauwerke/);
});

test("even building requires every lowest property before a second level", () => {
  const game = state();
  own(game, "p1", [6, 8, 9]);
  buildings.build(game, "p1", 6);
  assert.equal(canBuildOnProperty(game, "p1", 6).allowed, false);
  buildings.build(game, "p1", 8);
  buildings.build(game, "p1", 9);
  assert.deepEqual(game.propertyOwnerships.map((entry) => entry.buildingLevel), [1, 1, 1]);
  assert.equal(canBuildOnProperty(game, "p1", 6).allowed, true);
});

test("normal selling refunds half the build cost and follows reverse even distribution", () => {
  const game = state();
  own(game, "p1", [[6, 3], [8, 3], [9, 3]]);
  const gold = game.players[0]!.gold;
  buildings.sell(game, "p1", 6);
  assert.equal(game.players[0]!.gold, gold + 25);
  assert.equal(game.propertyOwnerships[0]!.buildingLevel, 2);
  assert.equal(game.buildingBank.settlementUnitsAvailable, 32);
  assert.equal(canSellBuilding(game, "p1", 6).allowed, false);
  assert.throws(() => buildings.sell(game, "p2", 8), /gehört dir nicht/);
});

test("level five can be built and sold with zero legacy bank stock", () => {
  const game = state();
  own(game, "p1", [[1, 4], [3, 4]]);
  game.buildingBank = { settlementUnitsAvailable: 0, grandStructuresAvailable: 0 };
  buildings.build(game, "p1", 1);
  assert.equal(game.propertyOwnerships[0]!.buildingLevel, 5);
  assert.deepEqual(game.buildingBank, { settlementUnitsAvailable: 0, grandStructuresAvailable: 0 });
  buildings.sell(game, "p1", 1);
  assert.deepEqual(game.buildingBank, { settlementUnitsAvailable: 0, grandStructuresAvailable: 0 });
  game.propertyOwnerships[0]!.buildingLevel = 5;
  game.buildingBank.settlementUnitsAvailable = 3;
  assert.equal(canSellBuilding(game, "p1", 1).allowed, true);
});

test("zero legacy stock permits construction while the level five maximum stays enforced", () => {
  const game = state();
  own(game, "p1", [[1, 0], [3, 0]]);
  game.buildingBank.settlementUnitsAvailable = 0;
  assert.equal(canBuildOnProperty(game, "p1", 1).allowed, true);
  game.propertyOwnerships.forEach((entry) => { entry.buildingLevel = 4; });
  game.buildingBank.grandStructuresAvailable = 0;
  assert.equal(canBuildOnProperty(game, "p1", 1).allowed, true);
  game.propertyOwnerships[0]!.buildingLevel = 5;
  assert.match(canBuildOnProperty(game, "p1", 1).reason!, /größte Festung/);
});

test("paymentRequired permits only sales and a deliberate authoritative settlement", () => {
  const game = state();
  game.players[0]!.gold = 50;
  own(game, "p1", [[31, 1], 32, 34]);
  game.turnPhase = "paymentRequired";
  game.pendingPayment = { payerId: "p1", amount: 150, reason: "Kronenzoll" };
  assert.equal(canBuildOnProperty(game, "p1", 32).allowed, false);
  buildings.sell(game, "p1", 31);
  assert.equal(game.players[0]!.gold, 150);
  economy.settlePendingPayment(game, "p1");
  assert.equal(game.players[0]!.gold, 0);
  assert.equal(game.pendingPayment, undefined);
  assert.equal(game.turnPhase, "waitingForEndTurn");
});

test("AI builds complete affordable regions evenly and respects reserve without a bank limit", () => {
  const game = state();
  own(game, "p2", [1, 3]);
  const first = ai.decideBuildingAction(game, "p2");
  assert.ok(first === 1 || first === 3);
  buildings.build(game, "p2", first!);
  assert.notEqual(ai.decideBuildingAction(game, "p2"), first);
  game.players[1]!.gold = 275;
  assert.equal(ai.decideBuildingAction(game, "p2"), undefined);
  game.players[1]!.gold = 2_000;
  game.buildingBank.settlementUnitsAvailable = 0;
  assert.notEqual(ai.decideBuildingAction(game, "p2"), undefined);
});

test("AI emergency strategy chooses a legal sale during paymentRequired", () => {
  const game = state();
  own(game, "p2", [[37, 1], 39]);
  game.turnPhase = "paymentRequired";
  game.pendingPayment = { payerId: "p2", amount: 300, reason: "Miete", payeeId: "p1" };
  assert.equal(ai.decideEmergencySale(game, "p2"), 37);
});

test("regional building prices are shared by validation and actual debit and expire correctly", () => {
  for (const [id, expected] of [["builders-blessing",38],["resource-shortage",63]] as const) {
    const game = state(); own(game,"p1",[1,3]); game.currentRound = 4;
    game.activeChronicleEvent = {...getRegionalChronicleDefinition(CHRONICLE_EVENTS.find(event=>event.id===id)!,["elves"]),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
    assert.equal(getEffectiveBuildCost(game,BOARD_TILES[1]!),expected);
    const humanTile = BOARD_TILES.find(tile=>tile.type==='property'&&tile.region==='humans')!;
    assert.equal(getEffectiveBuildCost(game,humanTile),humanTile.economy!.buildCost);
    game.players[0]!.gold = expected-1; assert.equal(canBuildOnProperty(game,"p1",1).allowed,false);
    game.players[0]!.gold = expected; buildings.build(game,"p1",1); assert.equal(game.players[0]!.gold,0); assert.equal(game.lastBuildingAction!.amount,expected);
    game.currentRound = 6; assert.equal(getEffectiveBuildCost(game,BOARD_TILES[1]!),50);
  }
});

test("golden construction boom sells for 75 percent of original cost, not discounted purchase cost", () => {
  const game = state(); own(game,"p1",[[1,1],3]); game.currentRound = 4;
  game.activeChronicleEvent = {...getRegionalChronicleDefinition(CHRONICLE_EVENTS[7]!,["elves"]),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
  assert.equal(getEffectiveBuildingSaleValue(game,BOARD_TILES[1]!),38);
  const humanTile = BOARD_TILES.find(tile=>tile.type==='property'&&tile.region==='humans')!;
  assert.equal(getEffectiveBuildingSaleValue(game,humanTile),humanTile.economy!.buildCost! / 2);
  buildings.sell(game,"p1",1); assert.equal(game.players[0]!.gold,2038); assert.equal(game.lastBuildingAction!.amount,38);
  game.currentRound = 6; assert.equal(getEffectiveBuildingSaleValue(game,BOARD_TILES[1]!),25);
});

test("unlimited supply still requires gold, full ownership, no mortgage and a safe phase", () => {
  const game = state(); own(game,"p1",[1,3]); game.buildingBank = {settlementUnitsAvailable:0,grandStructuresAvailable:0};
  game.players[0]!.gold = 49; assert.equal(canBuildOnProperty(game,"p1",1).allowed,false);
  game.players[0]!.gold = 50; game.propertyOwnerships[1]!.mortgaged = true; assert.equal(canBuildOnProperty(game,"p1",1).allowed,false);
  game.propertyOwnerships[1]!.mortgaged = false; game.turnPhase = 'moving'; assert.equal(canBuildOnProperty(game,"p1",1).allowed,false);
  game.turnPhase = 'waitingForRoll'; assert.equal(canBuildOnProperty(game,"p1",1).allowed,true);
});

test("realm building names are centralized for all five levels", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => getBuildingName("elves", level as BuildingLevel)), ["Wurzelhütte", "Baumhaus", "Hainheiligtum", "Baumhalle", "Sternenzitadelle"]);
  assert.equal(getBuildingName("humans", 5), "Königsburg");
  assert.equal(getBuildingName("orcs", 5), "Eisenfestung");
  assert.equal(getBuildingName("steppe", 5), "Himmelsfeste");
});
