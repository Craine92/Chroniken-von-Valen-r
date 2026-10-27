import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameState, TradeOffer } from "@valenor/shared";
import { TvQuickTradeCard, getTvQuickTradeView, isQuickTradeAction } from "./TvQuickTrade";
import { getCurrentBoardContext } from "./board-context";

function state(): GameState {
  const player = (id: string, name: string) => ({ id, name, type: "human" as const, color: "violet" as const, characterId: "humanKnight" as const, connectionState: "connected" as const, gold: 500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } });
  return {
    roomId: "VAL-TV", status: "playing", config: { mode: "chronicles" },
    players: [player("p1", "Lena"), player("p2", "Justine"), player("p3", "Aelor")],
    turnOrder: ["p1", "p2", "p3"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 2, turnNumber: 4, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [{ tileIndex: 10, ownerId: "p2", mortgaged: false, buildingLevel: 0 }, { tileIndex: 1, ownerId: "p3", mortgaged: false, buildingLevel: 0 }],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 1
  };
}

const buy = (overrides: Partial<TradeOffer> = {}): TradeOffer => ({
  id: "q1", mode: "quick", proposerId: "p1", recipientId: "p2",
  offer: { gold: 180, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [10] },
  status: "pending", createdAt: 10, ...overrides
});

test("the TV keeps a running quick offer visible with names, property and price", () => {
  const game = state(); game.trades = [buy()];
  game.lastTradeAction = { id: "a1", tradeId: "q1", type: "created", proposerId: "p1", recipientId: "p2", createdAt: 10 };
  const view = getTvQuickTradeView(game)!;
  assert.deepEqual(view, { kind: "pending", eyebrow: "HANDEL AM TISCH", title: "Lena will Mühlenweg für 180 Gold kaufen.", detail: "Justine entscheidet …", gold: 180, tileIndex: 10, waitingCount: 0 });
  const markup = renderToStaticMarkup(<TvQuickTradeCard view={view} />);
  assert.match(markup, /class="tv-quick-trade tv-quick-trade--pending"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /180 GOLD/);
});

test("the newest of several running offers is shown and the rest are counted", () => {
  const game = state();
  game.trades = [buy(), buy({ id: "q2", proposerId: "p2", recipientId: "p3", offer: { gold: 70, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [1] }, createdAt: 20, counterToTradeId: "q0" })];
  const view = getTvQuickTradeView(game)!;
  assert.equal(view.eyebrow, "GEGENANGEBOT");
  assert.equal(view.title, "Justine bietet jetzt 70 Gold für Mondpfad.");
  assert.equal(view.waitingCount, 1);
  assert.match(renderToStaticMarkup(<TvQuickTradeCard view={view} />), /\+ 1 weiteres Angebot/);
});

test("a sealed quick trade is celebrated in the middle of the board while the result is fresh", () => {
  const game = state(); game.trades = [buy({ status: "accepted" })];
  game.lastTradeAction = { id: "a2", tradeId: "q1", type: "accepted", proposerId: "p1", recipientId: "p2", createdAt: 10 };
  assert.equal(getTvQuickTradeView(game), undefined, "only shown while the banner timer marks it as fresh");
  const view = getTvQuickTradeView(game, "a2")!;
  assert.equal(view.kind, "accepted");
  assert.equal(view.eyebrow, "HANDEL BESIEGELT");
  assert.equal(view.detail, "Lena erwirbt Mühlenweg von Justine.");
  assert.match(renderToStaticMarkup(<TvQuickTradeCard view={view} />), /tv-quick-trade--accepted/);
});

test("rejections, withdrawals and expiries are shown briefly with their reason", () => {
  const cases = [
    ["rejected", "ANGEBOT ABGELEHNT", "Justine lehnt das Angebot von Lena ab."],
    ["cancelled", "ANGEBOT ZURÜCKGEZOGEN", "Lena zieht das Angebot zurück."],
    ["expired", "ANGEBOT VERFALLEN", "Mühlenweg wurde verpfändet."]
  ] as const;
  for (const [type, eyebrow, detail] of cases) {
    const game = state(); game.trades = [buy({ status: type, ...(type === "expired" ? { closedReason: "Mühlenweg wurde verpfändet." } : {}) })];
    game.lastTradeAction = { id: `a-${type}`, tradeId: "q1", type, proposerId: "p1", recipientId: "p2", createdAt: 10 };
    const view = getTvQuickTradeView(game, `a-${type}`)!;
    assert.equal(view.eyebrow, eyebrow, type);
    assert.equal(view.detail, detail, type);
    assert.equal(getCurrentBoardContext(game, 11, false).lines[0], { rejected: "ABGELEHNT", cancelled: "ZURÜCKGEZOGEN", expired: "VERFALLEN" }[type]);
  }
});

test("advanced trades keep the existing short TV notice", () => {
  const game = state();
  const advanced = buy({ id: "adv" }); delete advanced.mode;
  game.trades = [advanced];
  game.lastTradeAction = { id: "a3", tradeId: "adv", type: "created", proposerId: "p1", recipientId: "p2", createdAt: 10 };
  assert.equal(isQuickTradeAction(game, game.lastTradeAction), false);
  assert.equal(getTvQuickTradeView(game), undefined);
  game.trades[0]!.mode = "quick";
  assert.equal(isQuickTradeAction(game, game.lastTradeAction), true);
});
