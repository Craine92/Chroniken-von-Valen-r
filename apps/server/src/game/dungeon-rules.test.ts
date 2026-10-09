import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_TILES,
  DUNGEON_TILE_INDEX,
  DUNGEON_RELEASE_COST,
  GO_TO_DUNGEON_TILE_INDEX,
  type GameState
} from "@valenor/shared";
import { BankruptcyService } from "./bankruptcy-service";
import { DiceService, type RandomSource } from "./dice-service";
import { EconomyService } from "./economy-service";
import { TurnEngine } from "./turn-engine";

class SequenceRandomSource implements RandomSource {
  constructor(private readonly values: number[]) {}
  rollDie(): number {
    const value = this.values.shift();
    if (value === undefined) throw new Error("Testwürfelfolge erschöpft.");
    return value;
  }
}

function state(position = 0): GameState {
  return {
    roomId: "VAL-DUNGEON",
    status: "playing",
    config: { mode: "chronicles" },
    players: [
      { id: "p1", name: "Philipp", type: "human", color: "violet", characterId: "elvenSpellweaver" as const, connectionState: "connected", gold: 1_500, position, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
      { id: "p2", name: "Justine", type: "human", color: "green", characterId: "humanKnight" as const, connectionState: "connected", gold: 1_500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
    ],
    turnOrder: ["p1", "p2"],
    orderRolls: [],
    orderContenders: [],
    orderRollTargetCount: 1,
    currentPlayerId: "p1",
    currentTurnIndex: 0,
    currentRound: 4,
    turnNumber: 8,
    turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [],
    trades: [],
    startedAt: 1
  };
}

function completeNeutralLanding(engine: TurnEngine, game: GameState): void {
  engine.beginMovement(game);
  engine.completeMovement(game);
  engine.awaitEndTurn(game);
}

test("a regular double grants an extra roll without advancing round, turn index or turn number", () => {
  const game = state();
  const engine = new TurnEngine(new DiceService(new SequenceRandomSource([3, 3])));
  engine.rollTurn(game, "p1", "human");
  completeNeutralLanding(engine, game);
  engine.endTurn(game, "p1", "human");
  assert.equal(game.turnPhase, "waitingForRoll");
  assert.equal(game.currentPlayerId, "p1");
  assert.equal(game.currentTurnIndex, 0);
  assert.equal(game.currentRound, 4);
  assert.equal(game.turnNumber, 8);
  assert.equal(game.turnContext.consecutiveDoubles, 1);
});

test("a non-double ends the sequence and resets consecutive doubles", () => {
  const game = state();
  game.turnContext.consecutiveDoubles = 2;
  const engine = new TurnEngine(new DiceService(new SequenceRandomSource([3, 4])));
  engine.rollTurn(game, "p1", "human");
  completeNeutralLanding(engine, game);
  engine.endTurn(game, "p1", "human");
  assert.equal(game.currentPlayerId, "p2");
  assert.equal(game.turnContext.consecutiveDoubles, 0);
  assert.equal(game.turnPhase, "turnTransition");
});

test("two doubles move normally and the third sends the player directly to dungeon", () => {
  const game = state();
  const engine = new TurnEngine(new DiceService(new SequenceRandomSource([2, 2, 5, 5, 3, 3])));
  engine.rollTurn(game, "p1", "human");
  completeNeutralLanding(engine, game);
  engine.endTurn(game, "p1", "human");
  assert.equal(game.players[0]!.position, 4);
  engine.rollTurn(game, "p1", "human");
  completeNeutralLanding(engine, game);
  engine.endTurn(game, "p1", "human");
  assert.equal(game.players[0]!.position, 14);
  engine.rollTurn(game, "p1", "human");
  assert.equal(game.turnPhase, "dungeonTransfer");
  assert.equal(game.lastMovement?.kind, "dungeonTransfer");
  assert.equal(game.lastMovement?.passedStart, false);
  assert.equal(game.players[0]!.position, 14);
  assert.equal(game.turnContext.consecutiveDoubles, 0);
  engine.completeDungeonTransfer(game);
  assert.equal(game.players[0]!.position, DUNGEON_TILE_INDEX);
  assert.deepEqual(game.players[0]!.dungeon, { inDungeon: true, failedAttempts: 0 });
  assert.equal(game.currentPlayerId, "p2");
});

test("landing on go-to-dungeon cancels a double while a normal dungeon landing is only a visit", () => {
  const sent = state(GO_TO_DUNGEON_TILE_INDEX - 10);
  const sentEngine = new TurnEngine(new DiceService(new SequenceRandomSource([5, 5])));
  sentEngine.rollTurn(sent, "p1", "human");
  sentEngine.beginMovement(sent);
  sentEngine.completeMovement(sent);
  assert.equal(sent.lastMovement?.landedTile.type, "goToDungeon");
  sentEngine.sendCurrentPlayerToDungeon(sent);
  assert.equal(sent.turnContext.pendingExtraRoll, false);
  sentEngine.completeDungeonTransfer(sent);
  assert.equal(sent.players[0]!.dungeon.inDungeon, true);

  const visiting = state(DUNGEON_TILE_INDEX - 6);
  const visitingEngine = new TurnEngine(new DiceService(new SequenceRandomSource([3, 3])));
  visitingEngine.rollTurn(visiting, "p1", "human");
  visitingEngine.beginMovement(visiting);
  visitingEngine.completeMovement(visiting);
  assert.equal(visiting.players[0]!.position, DUNGEON_TILE_INDEX);
  assert.equal(visiting.players[0]!.dungeon.inDungeon, false);
  assert.equal(visiting.turnContext.pendingExtraRoll, true);
});

test("paying before the dungeon roll releases the player and a following double is regular", () => {
  const game = state(DUNGEON_TILE_INDEX);
  game.turnPhase = "dungeonDecision";
  game.players[0]!.gold = 200;
  game.players[0]!.dungeon = { inDungeon: true, failedAttempts: 1 };
  const engine = new TurnEngine(new DiceService(new SequenceRandomSource([4, 4])));
  engine.payDungeonRelease(game, "p1", "human");
  assert.equal(game.players[0]!.gold, 150);
  assert.equal(game.turnPhase, "waitingForRoll");
  engine.rollTurn(game, "p1", "human");
  assert.equal(game.lastMovement?.to, 21);
  assert.equal(game.turnContext.consecutiveDoubles, 1);
  assert.equal(game.turnContext.pendingExtraRoll, true);
});

test("the first and second failed dungeon rolls keep the player imprisoned and end the turn", () => {
  const game = state(DUNGEON_TILE_INDEX);
  game.turnPhase = "dungeonDecision";
  game.players[0]!.dungeon = { inDungeon: true, failedAttempts: 0 };
  const engine = new TurnEngine(new DiceService(new SequenceRandomSource([2, 5, 1, 3])));
  engine.rollDungeon(game, "p1", "human");
  engine.resolveDungeonRoll(game);
  assert.equal(game.players[0]!.dungeon.failedAttempts, 1);
  assert.equal(game.players[0]!.position, DUNGEON_TILE_INDEX);
  assert.equal(game.currentPlayerId, "p2");
  game.currentPlayerId = "p1";
  game.currentTurnIndex = 0;
  game.turnPhase = "dungeonDecision";
  engine.rollDungeon(game, "p1", "human");
  engine.resolveDungeonRoll(game);
  assert.equal(game.players[0]!.dungeon.failedAttempts, 2);
  assert.equal(game.players[0]!.dungeon.inDungeon, true);
});

test("a dungeon double releases and moves the player but never grants an extra roll", () => {
  const game = state(DUNGEON_TILE_INDEX);
  game.turnPhase = "dungeonDecision";
  game.players[0]!.dungeon = { inDungeon: true, failedAttempts: 1 };
  const engine = new TurnEngine(new DiceService(new SequenceRandomSource([4, 4])));
  engine.rollDungeon(game, "p1", "human");
  engine.resolveDungeonRoll(game);
  assert.equal(game.turnPhase, "moving");
  assert.equal(game.lastMovement?.to, 21);
  assert.deepEqual(game.players[0]!.dungeon, { inDungeon: false, failedAttempts: 0 });
  assert.equal(game.turnContext.pendingExtraRoll, false);
  assert.equal(game.turnContext.consecutiveDoubles, 0);
});

test("the third failed attempt always creates a visible fee before moving with the existing roll", () => {
  const game = state(DUNGEON_TILE_INDEX);
  game.turnPhase = "dungeonDecision";
  game.players[0]!.gold = 200;
  game.players[0]!.dungeon = { inDungeon: true, failedAttempts: 2 };
  const engine = new TurnEngine(new DiceService(new SequenceRandomSource([2, 5])));
  engine.rollDungeon(game, "p1", "human");
  engine.resolveDungeonRoll(game);
  assert.equal(game.players[0]!.gold, 200);
  assert.equal(game.pendingPayment?.amount, DUNGEON_RELEASE_COST);
  assert.equal(game.pendingPayment?.reasonType, "dungeonRelease");
  assert.deepEqual(game.turnContext.pendingDungeonMovement, { die1: 2, die2: 5, total: 7, isDouble: false });
  assert.equal(game.turnPhase, "paymentRequired");
  assert.equal(game.turnContext.pendingExtraRoll, false);
  new EconomyService().settlePendingPayment(game, "p1");
  engine.continueAfterDungeonPayment(game, "p1");
  assert.equal(game.players[0]!.gold, 150);
  assert.equal(game.lastMovement?.to, 20);
  assert.equal(game.turnPhase, "moving");
});

test("an unaffordable third failure preserves the roll through paymentRequired", () => {
  const game = state(DUNGEON_TILE_INDEX);
  game.turnPhase = "dungeonDecision";
  game.players[0]!.gold = 20;
  game.players[0]!.dungeon = { inDungeon: true, failedAttempts: 2 };
  const engine = new TurnEngine(new DiceService(new SequenceRandomSource([2, 5])));
  const economy = new EconomyService();
  engine.rollDungeon(game, "p1", "human");
  engine.resolveDungeonRoll(game);
  assert.equal(game.turnPhase, "paymentRequired");
  assert.deepEqual(game.turnContext.pendingDungeonMovement, { die1: 2, die2: 5, total: 7, isDouble: false });
  assert.equal(game.pendingPayment?.reasonType, "dungeonRelease");
  game.players[0]!.gold = 50;
  economy.settlePendingPayment(game, "p1");
  engine.continueAfterDungeonPayment(game, "p1");
  assert.equal(game.players[0]!.gold, 0);
  assert.equal(game.lastMovement?.from, DUNGEON_TILE_INDEX);
  assert.equal(game.lastMovement?.to, 20);
  assert.equal(game.turnContext.pendingDungeonMovement, undefined);
});

test("bankruptcy over the dungeon fee clears dungeon and pending movement state", () => {
  const game = state(DUNGEON_TILE_INDEX);
  game.turnPhase = "paymentRequired";
  game.players[0]!.gold = 20;
  game.players[0]!.dungeon = { inDungeon: true, failedAttempts: 3 };
  game.turnContext.pendingDungeonMovement = { die1: 2, die2: 5, total: 7, isDouble: false };
  game.pendingPayment = { payerId: "p1", amount: 50, reason: "Kerkergebühr", creditorType: "bank", reasonType: "dungeonRelease" };
  new BankruptcyService().declare(game, "p1");
  assert.equal(game.players[0]!.isBankrupt, true);
  assert.deepEqual(game.players[0]!.dungeon, { inDungeon: false, failedAttempts: 0 });
  assert.equal(game.turnContext.pendingDungeonMovement, undefined);
  assert.equal(game.status, "finished");
  assert.equal(game.winnerId, "p2");
});

test("imprisoned owners still collect rent and multiple prisoners remain independent", () => {
  const game = state(1);
  game.turnPhase = "landed";
  game.turnContext.rollSequence = 1;
  game.lastDiceRoll = { die1: 1, die2: 1, total: 2, isDouble: true };
  game.lastMovement = { kind: "normal", playerId: "p1", from: 39, to: 1, path: [0, 1], passedStart: true, landedTile: BOARD_TILES[1]! };
  game.players[1]!.dungeon = { inDungeon: true, failedAttempts: 1 };
  game.propertyOwnerships.push({ tileIndex: 1, ownerId: "p2", mortgaged: false, buildingLevel: 0 });
  new EconomyService().resolveLanding(game);
  assert.equal(game.players[1]!.gold, 1_502);
  game.players[0]!.dungeon = { inDungeon: true, failedAttempts: 2 };
  game.players[0]!.position = DUNGEON_TILE_INDEX;
  game.players[1]!.position = DUNGEON_TILE_INDEX;
  assert.notDeepEqual(game.players[0]!.dungeon, game.players[1]!.dungeon);
});
