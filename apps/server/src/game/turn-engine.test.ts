import assert from "node:assert/strict";
import test from "node:test";
import { DiceService, type RandomSource } from "./dice-service";
import { RoomManager } from "../room-manager";
import { TurnEngine } from "./turn-engine";
import type { GameState } from "@valenor/shared";

class SequenceRandomSource implements RandomSource {
  constructor(private readonly values: number[]) {}
  rollDie() {
    const value = this.values.shift();
    if (value === undefined) throw new Error("Testwürfelfolge erschöpft.");
    return value;
  }
}

function managerWithSequence(values: number[]) {
  return new RoomManager(new DiceService(new SequenceRandomSource(values)), undefined, undefined, () => 0);
}

test("dice service reports total and doubles deterministically", () => {
  const normal = new DiceService(new SequenceRandomSource([3, 4])).roll();
  const double = new DiceService(new SequenceRandomSource([6, 6])).roll();
  assert.deepEqual(normal, { die1: 3, die2: 4, total: 7, isDouble: false });
  assert.deepEqual(double, { die1: 6, die2: 6, total: 12, isDouble: true });
});

test("start order is sorted by descending two-dice total", () => {
  const manager = managerWithSequence([2, 3, 6, 4]);
  const { room } = manager.createRoom("host");
  const low = manager.joinRoom(room.code, "Low", "s1");
  const high = manager.joinRoom(room.code, "High", "s2");
  manager.startGame(room.code, "host");
  manager.rollForOrder(room.code, low.player.id, "human");
  const state = manager.rollForOrder(room.code, high.player.id, "human");
  assert.deepEqual(state.turnOrder, [high.player.id, low.player.id]);
  assert.equal(state.currentPlayerId, high.player.id);
  assert.equal(state.turnPhase, "waitingForRoll");
});

test("start order ties reroll until they are resolved", () => {
  const manager = managerWithSequence([4, 5, 3, 6, 6, 6, 1, 1]);
  const { room } = manager.createRoom("host");
  const first = manager.joinRoom(room.code, "First", "s1");
  const second = manager.joinRoom(room.code, "Second", "s2");
  manager.startGame(room.code, "host");
  manager.rollForOrder(room.code, first.player.id, "human");
  const tied = manager.rollForOrder(room.code, second.player.id, "human");
  assert.equal(tied.turnPhase, "determiningOrder");
  assert.deepEqual(new Set(tied.orderContenders), new Set([first.player.id, second.player.id]));
  manager.rollForOrder(room.code, first.player.id, "human");
  const resolved = manager.rollForOrder(room.code, second.player.id, "human");
  assert.deepEqual(resolved.turnOrder, [first.player.id, second.player.id]);
});

test("invalid roll attempts leave game state unchanged", () => {
  const manager = managerWithSequence([6, 6, 1, 1, 3, 4]);
  const { room } = manager.createRoom("host");
  const first = manager.joinRoom(room.code, "First", "s1");
  const second = manager.joinRoom(room.code, "Second", "s2");
  manager.startGame(room.code, "host");
  manager.rollForOrder(room.code, first.player.id, "human");
  manager.rollForOrder(room.code, second.player.id, "human");
  const before = manager.getGameState(room.code)!;
  assert.throws(() => manager.rollTurn(room.code, second.player.id, "human"), /nicht am Zug/);
  assert.deepEqual(manager.getGameState(room.code), before);
  manager.rollTurn(room.code, first.player.id, "human");
  assert.throws(() => manager.rollTurn(room.code, first.player.id, "human"), /Zugphase/);
});

test("movement wraps over Runentor without adding gold", () => {
  const state: GameState = {
    roomId: "VAL-TEST", status: "playing", config: { mode: "chronicles" },
    players: [{ id: "p1", name: "First", type: "human", color: "violet", connectionState: "connected", gold: 1500, position: 37, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }],
    turnOrder: ["p1"], orderRolls: [{ playerId: "p1", rolls: [] }], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 1
  };
  const engine = new TurnEngine(new DiceService(new SequenceRandomSource([3, 3])));
  engine.rollTurn(state, "p1", "human");
  assert.equal(state.lastMovement?.from, 37);
  assert.deepEqual(state.lastMovement?.path, [38, 39, 0, 1, 2, 3]);
  assert.equal(state.lastMovement?.passedStart, true);
  assert.equal(state.players[0]?.gold, 1500);
});

test("ending the last turn advances the round", () => {
  const manager = managerWithSequence([6, 6, 1, 1, 1, 2, 2, 3]);
  const { room } = manager.createRoom("host");
  const first = manager.joinRoom(room.code, "First", "s1");
  const second = manager.joinRoom(room.code, "Second", "s2");
  manager.startGame(room.code, "host");
  manager.rollForOrder(room.code, first.player.id, "human");
  manager.rollForOrder(room.code, second.player.id, "human");
  for (const player of [first, second]) {
    manager.rollTurn(room.code, player.player.id, "human");
    manager.beginMovement(room.code);
    manager.completeMovement(room.code);
    manager.awaitEndTurn(room.code);
    manager.endTurn(room.code, player.player.id, "human");
    manager.beginNextTurn(room.code);
  }
  const state = manager.getGameState(room.code)!;
  assert.equal(state.currentRound, 2);
  assert.equal(state.turnNumber, 3);
  assert.equal(state.currentPlayerId, first.player.id);
});
