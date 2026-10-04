import assert from "node:assert/strict";
import test from "node:test";
import type { GameState } from "@valenor/shared";
import { FakeTimeSource, QuickGameClockService } from "./quick-game-clock-service";

function game(mode: "quick" | "chronicles" = "quick"): GameState {
  return {
    roomId: "VAL-TIME", status: "playing",
    config: mode === "quick" ? { mode, quickGameDurationMinutes: 60 } : { mode },
    players: ["p1", "p2"].map((id, index) => ({ id, name: id, type: "human" as const, color: index ? "green" as const : "violet" as const, connectionState: "connected" as const, gold: 1500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } })),
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 }, propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 0
  };
}

test("quick clock starts only in round one after order resolution", () => {
  const time = new FakeTimeSource(1_000);
  const clock = new QuickGameClockService(time);
  const state = game();
  state.turnPhase = "determiningOrder";
  assert.equal(clock.start(state), false);
  state.turnPhase = "waitingForRoll";
  assert.equal(clock.start(state), true);
  assert.equal(state.quickGameClock?.durationMs, 3_600_000);
  assert.equal(state.quickGameClock?.startedAt, 1_000);
  assert.equal(clock.start(state), false);
});

test("chronicles mode never creates a clock", () => {
  const state = game("chronicles");
  assert.equal(new QuickGameClockService(new FakeTimeSource()).start(state), false);
  assert.equal(state.quickGameClock, undefined);
});

test("timestamps remain authoritative without per-second state changes", () => {
  const time = new FakeTimeSource(500);
  const service = new QuickGameClockService(time);
  const state = game();
  service.start(state);
  time.advance(90_000);
  assert.equal(service.remaining(state.quickGameClock!), 3_510_000);
  assert.equal(state.quickGameClock!.remainingMs, 3_600_000);
  service.sync(state);
  assert.equal(state.quickGameClock!.remainingMs, 3_510_000);
});

test("disconnect pause excludes paused time and reconnect resumes", () => {
  const time = new FakeTimeSource(0);
  const service = new QuickGameClockService(time);
  const state = game();
  service.start(state);
  time.advance(30_000);
  service.pause(state);
  time.advance(500_000);
  assert.equal(service.remaining(state.quickGameClock!), 3_570_000);
  service.resume(state);
  time.advance(20_000);
  service.sync(state);
  assert.equal(state.quickGameClock!.remainingMs, 3_550_000);
  assert.equal(state.quickGameClock!.totalPausedMs, 500_000);
});

test("expiry during a player turn marks the current round as final", () => {
  const time = new FakeTimeSource(0);
  const service = new QuickGameClockService(time);
  const state = game();
  service.start(state);
  state.currentRound = 4;
  state.currentTurnIndex = 1;
  state.turnPhase = "cardResolving";
  time.advance(3_600_000);
  assert.equal(service.sync(state), true);
  assert.equal(state.quickGameClock?.expired, true);
  assert.equal(state.quickGameClock?.finishAfterRound, 4);
  assert.equal(state.status, "playing");
});

test("expiry exactly at a completed round boundary does not open another round", () => {
  const time = new FakeTimeSource(0);
  const service = new QuickGameClockService(time);
  const state = game();
  service.start(state);
  state.currentRound = 5;
  state.currentTurnIndex = 0;
  state.turnPhase = "turnTransition";
  time.advance(3_600_000);
  service.sync(state);
  assert.equal(state.quickGameClock?.finishAfterRound, 4);
});

test("clock stop is idempotent", () => {
  const time = new FakeTimeSource(0);
  const service = new QuickGameClockService(time);
  const state = game();
  service.start(state);
  time.advance(12_000);
  service.stop(state);
  time.advance(8_000);
  service.stop(state);
  assert.equal(state.quickGameClock?.stoppedAt, 12_000);
  assert.equal(service.elapsed(state), 12_000);
});
