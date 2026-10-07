import assert from "node:assert/strict";
import test from "node:test";
import type { GameState } from "@valenor/shared";
import { QuickGameScoringService } from "./quick-game-scoring-service";

function game(): GameState {
  return {
    roomId: "VAL-SCORE", status: "playing", config: { mode: "quick", quickGameDurationMinutes: 60 },
    players: [
      { id: "p1", name: "Philipp", type: "human", color: "violet", characterId: "elvenSpellweaver" as const, connectionState: "connected", gold: 100, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }, heldCards: [{ cardId: "held", deck: "fate" }] },
      { id: "p2", name: "Justine", type: "human", color: "green", characterId: "humanKnight" as const, connectionState: "connected", gold: 100, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }, heldCards: [] }
    ],
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 3, turnNumber: 5, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 }, propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 0
  };
}

test("scoring uses purchase price, full building costs and redemption liability", () => {
  const state = game();
  state.propertyOwnerships.push(
    { tileIndex: 1, ownerId: "p1", mortgaged: true, buildingLevel: 0 },
    { tileIndex: 3, ownerId: "p1", mortgaged: false, buildingLevel: 5 },
    { tileIndex: 5, ownerId: "p1", mortgaged: false, buildingLevel: 0 },
    { tileIndex: 11, ownerId: "p1", mortgaged: false, buildingLevel: 0 }
  );
  const score = new QuickGameScoringService().calculate(state).find((entry) => entry.playerId === "p1")!;
  assert.equal(score.propertyValue, 470);
  assert.equal(score.buildingValue, 250);
  assert.equal(score.mortgageLiability, 33);
  assert.equal(score.netPropertyValue, 437);
  assert.equal(score.totalNetWorth, 787);
  assert.equal(score.propertyCount, 4);
  assert.equal(score.completeGroupCount, 1);
  assert.equal(score.buildingCount, 5);
  assert.equal(score.developedPropertyCount, 1);
  assert.equal(score.highestBuildingLevel, 5);
  assert.equal(score.heldCardCount, 1);
});

test("held cards are statistics and add no value", () => {
  const state = game();
  const scores = new QuickGameScoringService().calculate(state);
  assert.equal(scores[0]!.totalNetWorth, scores[1]!.totalNetWorth);
  assert.deepEqual(new QuickGameScoringService().determineWinnerIds(scores), ["p1", "p2"]);
});

test("winner tie breakers apply total, gold, net property and buildings in order", () => {
  const service = new QuickGameScoringService();
  const base = { propertyValue: 100, mortgageLiability: 0, propertyCount: 1, buildingCount: 0, developedPropertyCount: 0, completeGroupCount: 0, highestBuildingLevel: 0 as const, heldCardCount: 0 };
  const scores = [
    { ...base, playerId: "gold", totalNetWorth: 500, goldValue: 300, netPropertyValue: 100, buildingValue: 100 },
    { ...base, playerId: "property", totalNetWorth: 500, goldValue: 200, netPropertyValue: 250, buildingValue: 50 },
    { ...base, playerId: "lower", totalNetWorth: 499, goldValue: 999, netPropertyValue: 999, buildingValue: 999 }
  ];
  assert.deepEqual(service.determineWinnerIds(scores), ["gold"]);
});

test("bankrupt players are absent from the final score snapshot", () => {
  const state = game();
  state.players[1]!.isBankrupt = true;
  assert.deepEqual(new QuickGameScoringService().calculate(state).map((score) => score.playerId), ["p1"]);
});
