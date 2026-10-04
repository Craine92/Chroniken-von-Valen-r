import assert from "node:assert/strict";
import test from "node:test";
import type { GameState } from "@valenor/shared";
import { GameSceneBridge } from "./GameSceneBridge";

function state(turnNumber: number): GameState {
  return {
    roomId: "VAL-BRIDGE", status: "playing", config: { mode: "chronicles" }, players: [],
    turnOrder: [], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentTurnIndex: 0, currentRound: 1, turnNumber, turnPhase: "determiningOrder",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 1
  };
}

test("the bridge retains the latest state until the Phaser scene attaches", () => {
  const applied: number[] = [];
  const bridge = new GameSceneBridge(state(0));
  bridge.update(state(1));
  bridge.update(state(2));
  const scene = { applyGameState: (next: GameState) => applied.push(next.turnNumber) };
  bridge.attach(scene);
  assert.deepEqual(applied, [2]);
  bridge.update(state(3));
  assert.deepEqual(applied, [2, 3]);
  bridge.detach(scene);
  bridge.update(state(4));
  assert.deepEqual(applied, [2, 3]);
});
