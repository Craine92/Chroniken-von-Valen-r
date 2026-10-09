import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_TILES,
  BUILDING_BANK_CAPACITY,
  CHRONICLE_EVENTS,
  getEffectiveBuildCost,
  getEffectivePurchasePrice,
  getEffectiveRent,
  getPropertyGroupTiles,
  type GameState,
  type WorldImpulseId
} from "@valenor/shared";
import { BuildingService } from "./building-service";
import { DiceService, type RandomSource } from "./dice-service";
import { EconomyService } from "./economy-service";
import { TurnEngine } from "./turn-engine";
import {
  advanceWorldImpulses,
  applyWorldImpulse,
  chooseGoldenMoment,
  chooseNpcGoldenMoment,
  cleanupWorldImpulseEffects,
  isWorldImpulseApplicable,
  resolveGoldenMomentRisk
} from "./world-impulse-service";

class SequenceRandom implements RandomSource {
  constructor(private readonly values: number[]) {}
  rollDie(): number { return this.values.shift()!; }
}

function game(): GameState {
  return {
    roomId: "VAL-IMPULSE", status: "playing", config: { mode: "chronicles" },
    players: [
      { id: "p1", name: "Aria", type: "human", color: "violet", characterId: "elvenSpellweaver", connectionState: "connected", gold: 1500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }, relics: [], armedRelics: [] },
      { id: "p2", name: "Borin", type: "computer", color: "green", characterId: "dwarf", connectionState: "connected", gold: 1500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }, relics: [], armedRelics: [] }
    ],
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 2, turnNumber: 2, turnPhase: "turnTransition",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 }, propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: BUILDING_BANK_CAPACITY.settlementUnits, grandStructuresAvailable: BUILDING_BANK_CAPACITY.grandStructures },
    economyLog: [], trades: [], weltenwegPot: 0, worldImpulseHistory: [], worldImpulseEffects: {}, startedAt: 1
  };
}

function apply(state: GameState, id: WorldImpulseId, index = 0): void {
  assert.equal(applyWorldImpulse(state, id, () => index), true);
}

test("Marktschrei chooses only a free buyable tile and starts the regular auction", () => {
  const state = game();
  const firstBuyable = BOARD_TILES.find(tile => tile.economy)!;
  state.propertyOwnerships.push({ tileIndex: firstBuyable.index, ownerId: "p1", mortgaged: false, buildingLevel: 0 });
  apply(state, "marketCry");
  assert.equal(state.turnPhase, "auction");
  assert.equal(state.auction?.source, "worldImpulse");
  assert.notEqual(state.auction?.tileIndex, firstBuyable.index);
  assert.equal(state.propertyOwnerships.some(entry => entry.tileIndex === state.auction?.tileIndex), false);
  const auctionTileIndex = state.auction!.tileIndex;
  const economy = new EconomyService();
  economy.bid(state, "p1", 10);
  economy.withdraw(state, "p2");
  assert.equal(state.propertyOwnerships.some(entry => entry.tileIndex === auctionTileIndex && entry.ownerId === "p1"), true);
  assert.equal(state.turnPhase, "turnTransition");
  assert.equal(state.activeWorldImpulse?.status, "resolved");

  const unavailable = game();
  unavailable.propertyOwnerships = BOARD_TILES.filter(tile => tile.economy).map(tile => ({ tileIndex: tile.index, ownerId: "p1", mortgaged: false, buildingLevel: 0 }));
  assert.equal(isWorldImpulseApplicable(unavailable, "marketCry"), false);
  assert.equal(applyWorldImpulse(unavailable, "marketCry", () => 0), false);
});

test("Drachenruf performs one extra legal dragon relocation without an encounter or schedule change", () => {
  const state = game();
  state.wanderingDragon = { tileIndex: 1, nextMoveRound: 4, encounterSequence: 3 };
  apply(state, "dragonCall");
  assert.notEqual(state.wanderingDragon.tileIndex, 1);
  assert.ok(BOARD_TILES[state.wanderingDragon.tileIndex]?.economy);
  assert.ok(Math.min(Math.abs(state.wanderingDragon.tileIndex - 1), BOARD_TILES.length - Math.abs(state.wanderingDragon.tileIndex - 1)) >= 5);
  assert.equal(state.wanderingDragon.nextMoveRound, 4);
  assert.equal(state.wanderingDragon.encounterSequence, 3);
  assert.equal(state.lastDragonEncounterMovementSequence, undefined);
});

test("Runenfunke stacks with normal start and golden feather exactly once", () => {
  const state = game();
  const blessing = CHRONICLE_EVENTS.find(event => event.effectType === "startPassBonus")!;
  state.activeChronicleEvent = { ...blessing, startedAfterRound: 0, startedAtRound: 1, expiresAtRound: 4, startedAt: 1 };
  apply(state, "runeSpark");
  state.players[0]!.armedRelics = ["golden-feather"];
  state.players[0]!.relics = ["golden-feather"];
  state.turnPhase = "landed";
  state.lastMovement = { kind: "normal", sequence: 1, playerId: "p1", from: 39, to: 1, path: [0, 1], passedStart: true, landedTile: { ...BOARD_TILES[1]! } };
  const economy = new EconomyService();
  economy.awardStartPass(state);
  assert.equal(state.players[0]!.gold, 1500 + 300 + 100 + 75);
  assert.equal(state.worldImpulseEffects?.runeSpark, undefined);
  state.lastMovement.sequence = 2;
  economy.awardStartPass(state);
  assert.equal(state.players[0]!.gold, 1500 + 300 * 2 + 100 + 75);
});

test("Weltenweg-Spende adds exactly 100 and records crossed pot thresholds", () => {
  const state = game(); state.weltenwegPot = 450;
  apply(state, "worldwayDonation");
  assert.equal(state.weltenwegPot, 550);
  assert.equal(state.lastMomentumCelebration?.type, "largePot");
  assert.equal(state.activeWorldImpulse?.status, "resolved");
});

test("Baueifer applies after the normal build price and is consumed by one human or NPC build", () => {
  const state = game();
  const group = getPropertyGroupTiles("group_mondhain");
  const tile = group[0]!;
  state.propertyOwnerships = group.map(tile => ({ tileIndex: tile.index, ownerId: "p1", mortgaged: false, buildingLevel: 0 }));
  apply(state, "buildingFervor");
  const buildDiscount = CHRONICLE_EVENTS.find(event => event.effectType === "buildDiscount")!;
  state.activeChronicleEvent = { ...buildDiscount, targetRegions: [tile.region!], startedAfterRound: 0, startedAtRound: 1, expiresAtRound: 4, startedAt: 1 };
  state.turnPhase = "waitingForRoll";
  const expected = Math.round(Math.round(tile.economy!.buildCost! * .75) * .8);
  assert.equal(getEffectiveBuildCost(state, tile), expected);
  new BuildingService().build(state, "p1", tile.index);
  assert.equal(state.lastBuildingAction?.amount, expected);
  assert.equal(state.worldImpulseEffects?.buildingFervor, undefined);
  assert.equal(getEffectiveBuildCost(state, tile), Math.round(tile.economy!.buildCost! * .75));
});

test("Hafenwind raises harbor rent by 50 percent, never utility rent, and expires after the round", () => {
  const state = game();
  const harbors = BOARD_TILES.filter(tile => tile.type === "harbor");
  const utility = BOARD_TILES.find(tile => tile.type === "utility")!;
  state.propertyOwnerships.push({ tileIndex: harbors[0]!.index, ownerId: "p1", mortgaged: false, buildingLevel: 0 });
  apply(state, "harborWind");
  assert.equal(getEffectiveRent(state, harbors[0]!, "p1"), 38);
  state.propertyOwnerships.push({ tileIndex: utility.index, ownerId: "p1", mortgaged: false, buildingLevel: 0 });
  state.lastDiceRoll = { die1: 3, die2: 4, total: 7, isDouble: false };
  assert.equal(getEffectiveRent(state, utility, "p1"), 28);
  state.currentRound += 1;
  cleanupWorldImpulseEffects(state);
  assert.equal(state.worldImpulseEffects?.harborWindUntilRound, undefined);
  assert.equal(getEffectiveRent(state, harbors[0]!, "p1"), 25);
});

test("Kronengunst picks among tied poorest active players and ignores bankrupt players", () => {
  const state = game();
  state.players[0]!.gold = 300; state.players[1]!.gold = 300;
  state.players.push({ ...state.players[1]!, id: "p3", name: "Bankrupt", gold: 0, isBankrupt: true });
  apply(state, "crownFavor", 1);
  assert.equal(state.players[0]!.gold, 300);
  assert.equal(state.players[1]!.gold, 400);
  assert.equal(state.players[2]!.gold, 0);
});

test("Schicksalswende affects only the next normal roll, replaces it, and suppresses Runenstein", () => {
  const state = game(); state.turnPhase = "waitingForRoll";
  state.players[0]!.relics = ["runestone"];
  apply(state, "twistOfFate");
  const turns = new TurnEngine(new DiceService(new SequenceRandom([1, 2, 5, 6])), () => 0);
  turns.rollTurn(state, "p1", "human");
  assert.equal(state.turnPhase, "worldImpulseDecision");
  assert.equal(state.lastDiceRoll?.total, 3);
  turns.decideTwistOfFate(state, "p1", "human", true);
  assert.equal(state.lastDiceRoll?.total, 11);
  assert.equal(state.turnContext.awaitingRuneStoneDecision, undefined);
  assert.equal(state.turnPhase, "rolling");

  const dungeon = game(); dungeon.turnPhase = "dungeonDecision"; dungeon.players[0]!.dungeon.inDungeon = true; dungeon.worldImpulseEffects = { twistOfFate: true };
  new TurnEngine(new DiceService(new SequenceRandom([2, 3]))).rollDungeon(dungeon, "p1", "human");
  assert.equal(dungeon.worldImpulseEffects.twistOfFate, true);

  const order = game(); order.turnPhase = "determiningOrder"; order.orderContenders = ["p1", "p2"];
  order.orderRolls = [{ playerId: "p1", rolls: [] }, { playerId: "p2", rolls: [] }]; order.worldImpulseEffects = { twistOfFate: true };
  new TurnEngine(new DiceService(new SequenceRandom([3, 4]))).rollForOrder(order, "p1", "human");
  assert.equal(order.worldImpulseEffects.twistOfFate, true);

  const tavern = game(); tavern.worldImpulseEffects = { twistOfFate: true }; tavern.turnPhase = "tavernRolling";
  tavern.currentPlayerId = "p1"; tavern.players[0]!.position = 20; tavern.weltenwegPot = 100;
  tavern.tavern = { id: "t", playerId: "p1", turnNumber: tavern.turnNumber, movementSequence: 1, pot: 100, status: "rolling", choice: "gamble", startedAt: 1 };
  tavern.lastMovement = { kind: "normal", sequence: 1, playerId: "p1", from: 19, to: 20, path: [20], passedStart: false, landedTile: { ...BOARD_TILES[20]! } };
  new EconomyService().resolveTavernGamble(tavern, () => 6);
  assert.equal(tavern.worldImpulseEffects.twistOfFate, true);
});

test("Händlerglück discounts only one direct purchase and never an auction", () => {
  const state = game();
  const tile = BOARD_TILES.find(entry => entry.type === "property")!;
  apply(state, "merchantLuck");
  const festival = CHRONICLE_EVENTS.find(event => event.effectType === "purchaseDiscount")!;
  state.activeChronicleEvent = { ...festival, targetRegions: [tile.region!], startedAfterRound: 0, startedAtRound: 1, expiresAtRound: 4, startedAt: 1 };
  state.currentPlayerId = "p1"; state.turnPhase = "propertyDecision";
  state.lastMovement = { kind: "normal", sequence: 1, playerId: "p1", from: 0, to: tile.index, path: [tile.index], passedStart: false, landedTile: { ...tile } };
  const expected = Math.round(Math.round(tile.economy!.purchasePrice! * .8) * .85);
  assert.equal(getEffectivePurchasePrice(state, tile, "p1"), expected);
  new EconomyService().buyCurrentTile(state, "p1");
  assert.equal(state.players[0]!.gold, 1500 - expected);
  assert.equal(state.worldImpulseEffects?.merchantLuck, undefined);
  const auctionState = game(); auctionState.worldImpulseEffects = { merchantLuck: true }; auctionState.turnPhase = "auction";
  assert.equal(getEffectivePurchasePrice(auctionState, tile, "p1"), tile.economy!.purchasePrice);
});

test("Goldener Augenblick resolves safe and all risk brackets without movement", () => {
  const safe = game(); apply(safe, "goldenMoment"); const target = safe.pendingWorldImpulseDecision!.playerId;
  const before = safe.players.find(player => player.id === target)!.gold;
  chooseGoldenMoment(safe, target, "safe");
  assert.equal(safe.players.find(player => player.id === target)!.gold, before + 50);
  assert.equal(safe.lastMovement, undefined);

  for (const [die, payout] of [[1, 0], [2, 0], [3, 75], [4, 75], [5, 150], [6, 150]] as const) {
    const risk = game(); apply(risk, "goldenMoment"); const playerId = risk.pendingWorldImpulseDecision!.playerId;
    const gold = risk.players.find(player => player.id === playerId)!.gold;
    chooseGoldenMoment(risk, playerId, "risk"); resolveGoldenMomentRisk(risk, () => die);
    assert.equal(risk.players.find(player => player.id === playerId)!.gold, gold + payout);
    assert.equal(risk.lastMovement, undefined);
  }
  assert.equal(chooseNpcGoldenMoment(500, () => 1), "safe");
  assert.equal(chooseNpcGoldenMoment(501, () => 0), "safe");
  assert.equal(chooseNpcGoldenMoment(501, () => 1), "risk");
});

test("round scheduling gives chronicles priority and prevents consecutive impulses", () => {
  const state = game();
  assert.equal(advanceWorldImpulses(state, true, () => 0), false);
  assert.equal(state.activeWorldImpulse, undefined);
  assert.equal(advanceWorldImpulses(state, false, () => 0), true);
  state.currentRound += 1;
  assert.equal(advanceWorldImpulses(state, false, () => 0), false);
});
