import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameState, Player } from "@valenor/shared";
import {
  BANKRUPTCY_CONFIRMATION,
  BankruptcySpectator,
  confirmBankruptcy,
  DungeonDecisionPanel,
  DungeonOutcomeNotice,
  MobileTradeNotice,
  MobileTurnNotice,
  PaymentManagement
} from "./ControllerPage";

const roomPlayer: Player = {
  id: "p1",
  name: "Philipp",
  type: "human",
  color: "violet",
  connectionState: "connected",
  joinedAt: 1
};

function spectatorState(): GameState {
  return {
    roomId: "VAL-TEST",
    status: "playing",
    config: { mode: "chronicles" },
    players: [
      { id: "p1", name: "Philipp", type: "human", color: "violet", connectionState: "connected", gold: 0, position: 8, isBankrupt: true, dungeon: { inDungeon: false, failedAttempts: 0 } },
      { id: "p2", name: "Justine", type: "human", color: "green", connectionState: "connected", gold: 2_100, position: 12, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
    ],
    turnOrder: ["p1", "p2"],
    orderRolls: [],
    orderContenders: [],
    orderRollTargetCount: 1,
    currentPlayerId: "p2",
    currentTurnIndex: 1,
    currentRound: 4,
    turnNumber: 7,
    turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [],
    trades: [],
    startedAt: 1
  };
}

test("paymentRequired explains mortgage resolution and offers bankruptcy", () => {
  const markup = renderToStaticMarkup(
    <PaymentManagement
      payment={{ payerId: "p1", amount: 500, reason: "Kronenzoll", creditorType: "bank", reasonType: "tax" }}
      playerGold={100}
      hasLegalPaymentAction
      connected
      onSettle={() => undefined}
      onDeclareBankruptcy={() => undefined}
    />
  );
  assert.match(markup, /Dir fehlen 400 Gold/);
  assert.match(markup, /beleihe Besitz/);
  assert.match(markup, /Bankrott erklären/);
  assert.doesNotMatch(markup, /Forderung begleichen/);
});

test("paymentRequired exposes settlement once liquid gold is sufficient", () => {
  const markup = renderToStaticMarkup(
    <PaymentManagement
      payment={{ payerId: "p1", payeeId: "p2", amount: 500, reason: "Miete", creditorType: "player", reasonType: "rent" }}
      playerGold={550}
      hasLegalPaymentAction={false}
      connected
      onSettle={() => undefined}
      onDeclareBankruptcy={() => undefined}
    />
  );
  assert.match(markup, /Forderung begleichen/);
});

test("bankruptcy always requires the explicit safety confirmation", () => {
  let received = "";
  assert.equal(confirmBankruptcy((message) => { received = message; return false; }), false);
  assert.equal(received, BANKRUPTCY_CONFIRMATION);
  assert.equal(confirmBankruptcy(() => true), true);
});

test("a bankrupt controller renders the spectator view without rejoining play", () => {
  const markup = renderToStaticMarkup(<BankruptcySpectator gameState={spectatorState()} player={roomPlayer} connected />);
  assert.match(markup, /Du bist ausgeschieden/);
  assert.match(markup, /Zuschauerstatus/);
  assert.match(markup, /Justine/);
  assert.match(markup, /2100 Gold/);
  assert.doesNotMatch(markup, /Würfeln/);
});

test("dungeon decision shows attempt one and enables an affordable release", () => {
  const markup = renderToStaticMarkup(<DungeonDecisionPanel failedAttempts={0} gold={200} connected onRoll={() => undefined} onPay={() => undefined} />);
  assert.match(markup, /Dunkler Kerker/);
  assert.match(markup, /Versuch 1 \/ 3/);
  assert.match(markup, /Pasch versuchen/);
  assert.match(markup, /50 Gold zahlen/);
  assert.doesNotMatch(markup, /disabled=""[^>]*>50 Gold zahlen/);
});

test("third dungeon attempt keeps rolling available and disables an unaffordable release", () => {
  const markup = renderToStaticMarkup(<DungeonDecisionPanel failedAttempts={2} gold={20} connected onRoll={() => undefined} onPay={() => undefined} />);
  assert.match(markup, /Versuch 3 \/ 3/);
  assert.match(markup, /Pasch versuchen/);
  assert.match(markup, /disabled=""[^>]*>50 Gold zahlen/);
  assert.match(markup, /Nicht genügend Gold/);
});

test("dungeon decision exposes a held-card release action", () => {
  const markup = renderToStaticMarkup(<DungeonDecisionPanel failedAttempts={1} gold={20} connected hasDungeonCard onRoll={() => undefined} onPay={() => undefined} onUseCard={() => undefined} />);
  assert.match(markup, /Kerkersiegel verwenden/);
  assert.doesNotMatch(markup, /disabled=""[^>]*>Kerkersiegel verwenden/);
});

test("controller notices distinguish dungeon escape, failed rolls and a third double", () => {
  const escaped = renderToStaticMarkup(<DungeonOutcomeNotice action={{ id: "a", kind: "dungeonEscaped", playerId: "p1", createdAt: 1 }} />);
  const failed = renderToStaticMarkup(<DungeonOutcomeNotice action={{ id: "b", kind: "dungeonFailed", playerId: "p1", attempt: 1, createdAt: 2 }} />);
  const third = renderToStaticMarkup(<DungeonOutcomeNotice action={{ id: "c", kind: "thirdDouble", playerId: "p1", createdAt: 3 }} />);
  assert.match(escaped, /Kerker-Pasch/);
  assert.match(escaped, /Du bist frei/);
  assert.match(failed, /Kein Pasch/);
  assert.match(failed, /bleibst im Kerker/);
  assert.match(third, /Drei Pasche/);
});

test("mobile notices distinguish own turns, foreign turns and incoming trades", () => {
  const own = renderToStaticMarkup(<MobileTurnNotice currentName="Philipp" own />);
  const foreign = renderToStaticMarkup(<MobileTurnNotice currentName="Justine" own={false} />);
  const trade = renderToStaticMarkup(<MobileTradeNotice proposerName="Philipp" />);
  assert.match(own, /DU BIST AM ZUG/);
  assert.match(own, /Würfle oder führe deine Aktion aus/);
  assert.match(foreign, /Justine ist am Zug/);
  assert.match(trade, /HANDELSANGEBOT VON PHILIPP/);
  assert.match(trade, /Ansehen/);
});
