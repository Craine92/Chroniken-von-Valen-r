import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameState } from "@valenor/shared";
import { TradePanel } from "./TradePanel";

function state(): GameState {
  return {
    roomId: "VAL-TRADE", status: "playing", config: { mode: "chronicles" },
    players: [
      { id: "p1", name: "Philipp", type: "human", color: "violet", connectionState: "connected", gold: 500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
      { id: "p2", name: "Justine", type: "human", color: "green", connectionState: "connected", gold: 600, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
    ],
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [
      { tileIndex: 1, ownerId: "p1", mortgaged: false, buildingLevel: 0 },
      { tileIndex: 10, ownerId: "p2", mortgaged: true, buildingLevel: 0 }
    ],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [],
    trades: [{ id: "t1", proposerId: "p2", recipientId: "p1", offer: { gold: 100, propertyTileIndices: [10] }, request: { gold: 50, propertyTileIndices: [1] }, status: "pending", createdAt: 1 }],
    startedAt: 1
  };
}

test("trade panel renders received assets and touch actions", () => {
  const markup = renderToStaticMarkup(<TradePanel state={state()} playerId="p1" connected onCreate={() => undefined} onDecision={() => undefined} />);
  assert.match(markup, /Erhaltene Angebote/);
  assert.match(markup, /HANDELSANGEBOT VON JUSTINE/);
  assert.match(markup, /Mühlenweg/);
  assert.match(markup, /Annehmen/);
  assert.match(markup, /Ablehnen/);
});

test("trade creation lists both players' properties and mortgage state", () => {
  const markup = renderToStaticMarkup(<TradePanel state={state()} playerId="p1" connected onCreate={() => undefined} onDecision={() => undefined} />);
  assert.match(markup, /Mondpfad/);
  assert.match(markup, /verpfändet/);
  assert.match(markup, /Angebot senden/);
  assert.equal((markup.match(/placeholder="0"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /value="0"/);
});

test("dungeon decisions disable every trade action", () => {
  const game = state();
  game.turnPhase = "dungeonDecision";
  const markup = renderToStaticMarkup(<TradePanel state={game} playerId="p1" connected onCreate={() => undefined} onDecision={() => undefined} />);
  assert.match(markup, /Handel ist in dieser Spielphase nicht möglich/);
  assert.match(markup, /disabled=""[^>]*>Annehmen/);
  assert.match(markup, /disabled=""[^>]*>Ablehnen/);
  assert.match(markup, /disabled=""[^>]*>Angebot senden/);
});

test("held dungeon cards are visible as selectable and received trade assets", () => {
  const game = state();
  game.players[0]!.heldCards = [{ cardId: "adv_024", deck: "adventure" }];
  game.players[1]!.heldCards = [{ cardId: "fate_024", deck: "fate" }];
  game.trades[0]!.offer.cardIds = ["fate_024"];
  const markup = renderToStaticMarkup(<TradePanel state={game} playerId="p1" connected onCreate={() => undefined} onDecision={() => undefined} />);
  assert.match(markup, /Siegel der freien Pfade/);
  assert.match(markup, /Gunst der Mondseherin/);
  assert.match(markup, /type="checkbox"/);
});
