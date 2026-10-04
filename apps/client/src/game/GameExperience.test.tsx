import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOARD_TILES, DUNGEON_TILE_INDEX, type GameState } from "@valenor/shared";
import { DOUBLE_BANNER_DURATION_MS, GameExperience } from "./GameExperience";
import { hasTurnStatusContent, TurnStatus } from "./TurnStatus";

function startedGameState(playerCount: 2 | 4): GameState {
  return {
    roomId: "VAL-TEST",
    status: "playing",
    config: { mode: "chronicles" },
    players: Array.from({ length: playerCount }, (_, index) => ({
      id: `p${index + 1}`,
      name: index === 0 ? "Mensch" : `Computer ${index}`,
      type: index === 0 ? "human" as const : "computer" as const,
      color: (["violet", "green", "red", "blue"] as const)[index]!,
      connectionState: "connected" as const,
      gold: 1500,
      position: 0,
      isBankrupt: false,
      dungeon: { inDungeon: false, failedAttempts: 0 }
    })),
    turnOrder: [],
    orderRolls: Array.from({ length: playerCount }, (_, index) => ({ playerId: `p${index + 1}`, rolls: [] })),
    orderContenders: Array.from({ length: playerCount }, (_, index) => `p${index + 1}`),
    orderRollTargetCount: 1,
    currentTurnIndex: 0,
    currentRound: 1,
    turnNumber: 0,
    turnPhase: "determiningOrder",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [],
    trades: [],
    startedAt: 1
  };
}

for (const playerCount of [2, 4] as const) {
  test(`a started ${playerCount}-player state renders the game view instead of the lobby`, () => {
    const markup = renderToStaticMarkup(<GameExperience gameState={startedGameState(playerCount)} />);
    assert.match(markup, /data-testid="valenor-game-view"/);
    assert.match(markup, /Die Chroniken von Valen/);
    assert.doesNotMatch(markup, /class="setup-layout"/);
  });
}

test("a finished game renders the winner and new-chronicle action", () => {
  const state = startedGameState(2);
  state.status = "finished";
  state.winnerId = "p1";
  state.finishReason = "lastPlayerStanding";
  const markup = renderToStaticMarkup(<GameExperience gameState={state} onNewChronicle={() => undefined} />);
  assert.match(markup, /Die Chronik ist entschieden/);
  assert.match(markup, /Mensch/);
  assert.match(markup, /Neue Chronik/);
});

test("TV presents an active fate card over the board without a permanent chronicle rail", () => {
  const state = startedGameState(2);
  state.activeCard = { cardId: "fate_008", deck: "fate", playerId: "p1", status: "waitingForPayment" };
  state.cardResolution = { cardId: "fate_008", deck: "fate", playerId: "p1", effectIndex: 1, status: "waitingForPayment", chainDepth: 0, pendingPayments: [] };
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", amount: 100, reason: "Fluch der Mondfinsternis", creditorType: "bank", reasonType: "card" };
  const markup = renderToStaticMarkup(<GameExperience gameState={state} />);
  assert.match(markup, /Fluch der Mondfinsternis/);
  assert.match(markup, /class="board-card-event"/);
  assert.doesNotMatch(markup, /game-context-sidebar/);
  assert.equal((markup.match(/data-testid="card-reveal"/g) ?? []).length, 1);
  assert.match(markup, /Du zahlst 100 Gold/);
});

test("the TV board reports idle and active event state without adding a right rail", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.orderContenders = [];
  state.turnPhase = "waitingForRoll";
  let markup = renderToStaticMarkup(<GameExperience gameState={state} />);
  assert.match(markup, /board-page--gameplay is-context-idle/);
  assert.match(markup, /data-context-state="idle"/);
  assert.match(markup, /class="board-event-layer"/);
  assert.doesNotMatch(markup, /game-context-sidebar/);

  state.turnPhase = "determiningOrder";
  markup = renderToStaticMarkup(<GameExperience gameState={state} boardPresentationMode="tabletop" />);
  assert.match(markup, /board-page--tabletop has-context-event/);
  assert.match(markup, /data-context-state="active"/);
  assert.doesNotMatch(markup, /game-context-sidebar/);
});

test("turn status renders dungeon decisions, dungeon doubles and third-double fate", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.players[0]!.dungeon = { inDungeon: true, failedAttempts: 1 };
  state.turnPhase = "dungeonDecision";
  let markup = renderToStaticMarkup(<TurnStatus state={state} />);
  assert.match(markup, /sitzt im Dunklen Kerker/);
  assert.match(markup, /Versuch 2 \/ 3/);

  state.players[0]!.dungeon = { inDungeon: false, failedAttempts: 0 };
  state.turnPhase = "moving";
  state.lastTurnAction = { id: "escape", kind: "dungeonEscaped", playerId: "p1", createdAt: 1 };
  markup = renderToStaticMarkup(<TurnStatus state={state} />);
  assert.match(markup, /KERKER-PASCH/);
  assert.match(markup, /ist frei/);

  state.turnPhase = "dungeonTransfer";
  state.lastTurnAction = { id: "third", kind: "thirdDouble", playerId: "p1", createdAt: 2 };
  markup = renderToStaticMarkup(<TurnStatus state={state} />);
  assert.match(markup, /Drei Pasche in Folge/);
  assert.match(markup, /Dunklen Kerker gebracht/);
});

test("a normal landing on dungeon is clearly shown as only visiting", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.turnPhase = "waitingForEndTurn";
  state.lastMovement = { kind: "normal", playerId: "p1", from: 7, to: DUNGEON_TILE_INDEX, path: [8, 9, 10, 11, 12, DUNGEON_TILE_INDEX], passedStart: false, landedTile: BOARD_TILES[DUNGEON_TILE_INDEX]! };
  const markup = renderToStaticMarkup(<TurnStatus state={state} />);
  assert.match(markup, /Nur zu Besuch/);
  assert.match(markup, /ist frei/);
});

test("a normal roll never creates a double banner", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.orderContenders = [];
  state.turnPhase = "moving";
  state.lastDiceRoll = { die1: 2, die2: 5, total: 7, isDouble: false };
  const markup = renderToStaticMarkup(<GameExperience gameState={state} />);
  assert.doesNotMatch(markup, /class="double-banner"/);
});

test("a double uses its own temporary board lane instead of the central turn overlay", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.orderContenders = [];
  state.turnPhase = "waitingForRoll";
  state.turnContext.pendingExtraRoll = true;
  state.lastTurnAction = { id: "double-1", kind: "double", playerId: "p1", createdAt: 1 };

  const statusMarkup = renderToStaticMarkup(<TurnStatus state={state} />);
  const experienceMarkup = renderToStaticMarkup(<GameExperience gameState={state} />);
  assert.doesNotMatch(statusMarkup, /PASCH!/);
  assert.equal(hasTurnStatusContent(state), false);
  assert.match(experienceMarkup, /class="board-notification-lane"/);
  assert.match(experienceMarkup, /class="double-banner"/);
  assert.match(experienceMarkup, /Mensch darf erneut würfeln/);
  assert.equal(DOUBLE_BANNER_DURATION_MS, 2_200);
});

test("double banner remains separate from landing, property and card presentations", () => {
  for (const scenario of ["property", "fate", "adventure"] as const) {
    const state = startedGameState(2);
    state.turnOrder = ["p1", "p2"];
    state.currentPlayerId = "p1";
    state.orderContenders = [];
    state.turnContext.pendingExtraRoll = true;
    state.lastTurnAction = { id: `double-${scenario}`, kind: "double", playerId: "p1", createdAt: 1 };
    if (scenario === "property") {
      const property = BOARD_TILES.find((tile) => tile.type === "property")!;
      state.turnPhase = "waitingForEndTurn";
      state.lastMovement = { kind: "normal", playerId: "p1", from: 0, to: property.index, path: [property.index], passedStart: false, landedTile: property };
    } else {
      state.turnPhase = "cardResolving";
      state.activeCard = { cardId: scenario === "fate" ? "fate_001" : "adv_001", deck: scenario, playerId: "p1", status: "resolving" };
    }
    const markup = renderToStaticMarkup(<GameExperience gameState={state} />);
    assert.match(markup, /class="double-banner"/);
    assert.match(markup, scenario === "property" ? /class="landed-card"/ : /class="board-card-event"/);
  }
});

test("consecutive double actions receive distinct banner instances", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.orderContenders = [];
  state.turnPhase = "waitingForRoll";
  state.turnContext.pendingExtraRoll = true;
  for (const id of ["double-fast-1", "double-fast-2"]) {
    state.lastTurnAction = { id, kind: "double", playerId: "p1", createdAt: 1 };
    const markup = renderToStaticMarkup(<GameExperience gameState={state} />);
    assert.match(markup, new RegExp(`data-notification-id="${id}"`));
  }
});

test("the action log renders only the two newest complete entries", () => {
  const state = startedGameState(2);
  state.economyLog = [
    { id: "old", kind: "system", message: "Ältester Eintrag", playerIds: [], createdAt: 1 },
    { id: "middle", kind: "system", message: "Mittlerer Eintrag", playerIds: [], createdAt: 2 },
    { id: "new", kind: "system", message: "Neuester Eintrag", playerIds: [], createdAt: 3 }
  ];
  const markup = renderToStaticMarkup(<GameExperience gameState={state} />);
  assert.doesNotMatch(markup, /Ältester Eintrag/);
  assert.match(markup, /Neuester Eintrag.*Mittlerer Eintrag/);
});
