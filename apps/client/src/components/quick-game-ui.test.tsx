import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameState, QuickGameClock } from "@valenor/shared";
import { GameResultPanel } from "./GameResultPanel";
import { QuickGameClockDisplay, formatQuickGameTime } from "./QuickGameClockDisplay";

const clock: QuickGameClock = {
  durationMs: 3_600_000, startedAt: 1_000, totalPausedMs: 0,
  expired: false, serverNow: 1_000, remainingMs: 299_999
};

function finishedGame(): GameState {
  const scores = [
    { playerId: "p1", goldValue: 500, propertyValue: 200, buildingValue: 100, mortgageLiability: 0, netPropertyValue: 200, totalNetWorth: 800, propertyCount: 1, buildingCount: 2, developedPropertyCount: 1, completeGroupCount: 1, highestBuildingLevel: 2 as const, heldCardCount: 1 },
    { playerId: "p2", goldValue: 500, propertyValue: 200, buildingValue: 100, mortgageLiability: 0, netPropertyValue: 200, totalNetWorth: 800, propertyCount: 1, buildingCount: 2, developedPropertyCount: 1, completeGroupCount: 0, highestBuildingLevel: 2 as const, heldCardCount: 0 }
  ];
  return {
    roomId: "VAL-UI", status: "finished", config: { mode: "quick", quickGameDurationMinutes: 60 },
    players: [
      { id: "p1", name: "Philipp", type: "human", color: "violet", characterId: "elvenSpellweaver" as const, connectionState: "connected", gold: 500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
      { id: "p2", name: "Justine", type: "human", color: "green", characterId: "humanKnight" as const, connectionState: "connected", gold: 500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
    ],
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 4, turnNumber: 7, turnPhase: "turnTransition",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 }, propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 0,
    winnerIds: ["p1", "p2"], finishReason: "quickGameTimeExpired", finalScores: scores,
    gameResult: { finishReason: "quickGameTimeExpired", winnerIds: ["p1", "p2"], finishedAt: 4_000, roundsPlayed: 3, scores }
  };
}

test("quick clock formats hours and renders its five-minute warning", () => {
  assert.equal(formatQuickGameTime(3_599_001), "01:00:00");
  const markup = renderToStaticMarkup(<QuickGameClockDisplay clock={clock} />);
  assert.match(markup, /quick-clock--warning/);
  assert.match(markup, /quick-clock__hourglass/);
  assert.match(markup, /00:05:00/);
});

test("result panel renders shared victory, ranking and the viewer breakdown", () => {
  const markup = renderToStaticMarkup(<GameResultPanel gameState={finishedGame()} viewerId="p2" />);
  assert.match(markup, /Geteilter Sieg/);
  assert.match(markup, /Philipp · Justine/);
  assert.match(markup, /Dein Ergebnis · Rang 2/);
  assert.match(markup, /−0 Hypotheken/);
  assert.match(markup, /800 Gesamt/);
  assert.match(markup, /1 Grundst/);
  assert.match(markup, /1 Gruppe/);
  assert.match(markup, /1 Gebäude/);
  assert.match(markup, /result-miniature/);
});
