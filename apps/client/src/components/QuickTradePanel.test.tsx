import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameState, TradeOffer } from "@valenor/shared";
import { QuickTradeOfferCard, QuickTradePanel, QuickTradePriceScreen, QuickTradePriceStepper, createQuickTradeDraft } from "./QuickTradePanel";
import { TradeTab } from "./TradeTab";
import { TradePanel } from "./TradePanel";

const noop = () => undefined;

function state(): GameState {
  return {
    roomId: "VAL-QUICK", status: "playing", config: { mode: "chronicles" },
    players: [
      { id: "p1", name: "Lena", type: "human", color: "violet", characterId: "elvenSpellweaver" as const, connectionState: "connected", gold: 500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
      { id: "p2", name: "Justine", type: "human", color: "green", characterId: "humanKnight" as const, connectionState: "connected", gold: 600, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
      { id: "p3", name: "Morgrim", type: "computer", color: "red", characterId: "humanKnight" as const, connectionState: "disconnected", gold: 900, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
    ],
    turnOrder: ["p1", "p2", "p3"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 2, turnNumber: 4, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [
      { tileIndex: 1, ownerId: "p1", mortgaged: false, buildingLevel: 0 },
      { tileIndex: 10, ownerId: "p2", mortgaged: false, buildingLevel: 0 },
      { tileIndex: 37, ownerId: "p3", mortgaged: false, buildingLevel: 0 }
    ],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 1
  };
}

const quickOffer = (overrides: Partial<TradeOffer> = {}): TradeOffer => ({
  id: "q1", mode: "quick", proposerId: "p2", recipientId: "p1",
  offer: { gold: 150, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [1] },
  status: "pending", createdAt: 1, quickSnapshot: { round: 2, mortgaged: false }, ...overrides
});

test("the trade tab opens on quick trade, lists foreign properties with a suggested price and keeps advanced trade one tap away", () => {
  const markup = renderToStaticMarkup(<TradeTab state={state()} playerId="p1" connected onCreate={noop} onQuickCreate={noop} onDecision={noop} />);
  assert.match(markup, /SCHNELLHANDEL/);
  assert.match(markup, />Kaufen<\/button>/);
  assert.match(markup, />Verkaufen<\/button>/);
  assert.match(markup, /JUSTINE/);
  assert.match(markup, /MORGRIM · NPC/);
  assert.match(markup, /Mühlenweg<\/strong>.*?≈ 140/);
  assert.doesNotMatch(markup, /Mondpfad/, "own properties are not offered for purchase");
  assert.match(markup, /Erweiterter Handel/);
  assert.doesNotMatch(markup, /SCHRITT 1 \/ 3/);
});

test("advanced trade still renders the full three-step editor with a way back", () => {
  const markup = renderToStaticMarkup(<TradeTab state={state()} playerId="p1" connected onCreate={noop} onQuickCreate={noop} onDecision={noop} initialMode="advanced" />);
  assert.match(markup, /Zurück zum Schnellhandel/);
  assert.match(markup, /SCHRITT 1 \/ 3/);
  assert.match(markup, /HANDEL MIT/);
});

test("quick offers stay out of the advanced editor so they cannot be countered with extra assets", () => {
  const game = state(); game.trades = [quickOffer()];
  const markup = renderToStaticMarkup(<TradePanel state={game} playerId="p1" connected onCreate={noop} onDecision={noop} />);
  assert.doesNotMatch(markup, /HANDELSANGEBOT VON JUSTINE/);
});

test("the recipient sees one clear sentence with accept, reject and change price", () => {
  const game = state(); game.trades = [quickOffer()];
  const markup = renderToStaticMarkup(<QuickTradePanel state={game} playerId="p1" connected onQuickCreate={noop} onDecision={noop} onOpenAdvanced={noop} />);
  assert.match(markup, /HANDELSANGEBOT/);
  assert.match(markup, /Justine will Mondpfad für 150 Gold kaufen\./);
  assert.match(markup, /<button[^>]*class="controller-primary-action"[^>]*>Annehmen<\/button>/);
  assert.match(markup, />Ablehnen<\/button>/);
  assert.match(markup, />Preis ändern<\/button>/);
  assert.match(markup, /Preis: <strong>hoch<\/strong>/, "150 Gold liegt deutlich über dem fairen Preis von 60 Gold");
  assert.match(markup, /Vorschlag des Spiels: 60 Gold/);
  assert.doesNotMatch(markup, /DU GIBST|HINZUFÜGEN/);
});

test("counter offers are labelled and the receiving buyer cannot accept without enough gold", () => {
  const game = state();
  const sale = quickOffer({ id: "q2", counterToTradeId: "q0", proposerId: "p2", recipientId: "p1", offer: { gold: 0, propertyTileIndices: [10] }, request: { gold: 520, propertyTileIndices: [] } });
  const markup = renderToStaticMarkup(<QuickTradeOfferCard state={game} playerId="p1" trade={sale} actionsEnabled onDecision={noop} />);
  assert.match(markup, /GEGENANGEBOT/);
  assert.match(markup, /Justine verlangt 520 Gold für Mühlenweg\./);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Annehmen<\/button>/);
  assert.match(markup, /Dir fehlen 20 Gold, um anzunehmen\./);
  assert.match(markup, /<button type="button" class="trade-counter-action">Preis ändern<\/button>/, "a lower price can still be proposed");
});

test("the proposer sees the own open offer with a withdraw button and cannot start a second one", () => {
  const game = state(); game.trades = [quickOffer({ proposerId: "p1", recipientId: "p2", offer: { gold: 120, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [10] } })];
  const markup = renderToStaticMarkup(<QuickTradePanel state={game} playerId="p1" connected onQuickCreate={noop} onDecision={noop} onOpenAdvanced={noop} />);
  assert.match(markup, /DEIN OFFENES ANGEBOT/);
  assert.match(markup, /Lena will Mühlenweg für 120 Gold kaufen\./);
  assert.match(markup, /Justine überlegt noch/);
  assert.match(markup, />Angebot zurückziehen<\/button>/);
  assert.match(markup, /Du hast bereits ein offenes Angebot/);

  const incoming = state(); incoming.trades = [...game.trades, quickOffer({ id: "q9", proposerId: "p3", recipientId: "p1", offer: { gold: 80, propertyTileIndices: [] } })];
  const blocked = renderToStaticMarkup(<QuickTradeOfferCard state={incoming} playerId="p1" trade={incoming.trades[1]!} actionsEnabled onDecision={noop} />);
  assert.match(blocked, /<button[^>]*disabled=""[^>]*>Preis ändern<\/button>/, "a counter would be a second open offer");
  assert.match(blocked, /<button type="button" class="controller-primary-action">Annehmen<\/button>/);
});

test("unsafe phases disable every quick trade action with a reason", () => {
  const game = state(); game.turnPhase = "dungeonDecision"; game.trades = [quickOffer()];
  const markup = renderToStaticMarkup(<QuickTradePanel state={game} playerId="p1" connected onQuickCreate={noop} onDecision={noop} onOpenAdvanced={noop} />);
  assert.match(markup, /Handel ist in dieser Spielphase nicht möglich\./);
  for (const label of ["Annehmen", "Ablehnen", "Preis ändern"]) assert.match(markup, new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`));
});

test("built regions are listed but blocked with the existing rule as reason", () => {
  const game = state(); game.propertyOwnerships.push({ tileIndex: 12, ownerId: "p2", mortgaged: false, buildingLevel: 0 }, { tileIndex: 14, ownerId: "p2", mortgaged: false, buildingLevel: 1 });
  const markup = renderToStaticMarkup(<QuickTradePanel state={game} playerId="p1" connected onQuickCreate={noop} onDecision={noop} onOpenAdvanced={noop} />);
  assert.match(markup, /<button type="button" class="quick-trade-tile" disabled=""[^>]*>.*?Mühlenweg.*?Zuerst müssen alle Bauwerke dieser Region verkauft werden\./);
});

test("advanced offers are announced in quick mode and open the advanced editor", () => {
  const game = state();
  game.trades = [{ id: "a1", proposerId: "p2", recipientId: "p1", offer: { gold: 50, propertyTileIndices: [10] }, request: { gold: 0, propertyTileIndices: [1] }, status: "pending", createdAt: 1 }];
  const markup = renderToStaticMarkup(<QuickTradePanel state={game} playerId="p1" connected onQuickCreate={noop} onDecision={noop} onOpenAdvanced={noop} />);
  assert.match(markup, /Erweitertes Angebot von Justine/);
  assert.match(markup, />Ansehen<\/button>/);
});

test("a new draft starts at the suggested price, capped by the buyer's purse", () => {
  const game = state();
  assert.deepEqual(createQuickTradeDraft(game, "p1", 10), { tileIndex: 10, gold: 140 });
  assert.deepEqual(createQuickTradeDraft(game, "p1", 37), { tileIndex: 37, gold: 350 });
  game.players[0]!.gold = 95;
  assert.deepEqual(createQuickTradeDraft(game, "p1", 10), { tileIndex: 10, gold: 95 });
  assert.deepEqual(createQuickTradeDraft(game, "p1", 1), { tileIndex: 1, buyerId: "p2", gold: 60 });
  assert.deepEqual(createQuickTradeDraft(game, "p1", 1, "p3"), { tileIndex: 1, buyerId: "p3", gold: 60 });
  assert.equal(createQuickTradeDraft(game, "p1", 2), undefined);
});

test("the price stepper uses big plus and minus buttons instead of a number field", () => {
  const markup = renderToStaticMarkup(<QuickTradePriceStepper gold={140} fairPrice={140} maxPrice={500} onChange={noop} />);
  assert.doesNotMatch(markup, /<input/);
  assert.match(markup, /<b>140<\/b> GOLD/);
  for (const label of ["−50", "−10", "\\+10", "\\+50"]) assert.match(markup, new RegExp(`>${label}</button>`));
  assert.match(markup, /Preis: <strong>fair<\/strong>/);
  assert.doesNotMatch(markup, /Vorschlag übernehmen/);

  const atBounds = renderToStaticMarkup(<QuickTradePriceStepper gold={10} fairPrice={140} maxPrice={10} onChange={noop} />);
  assert.equal((atBounds.match(/disabled=""/g) ?? []).length, 4);
  assert.match(atBounds, /Preis: <strong>günstig<\/strong>/);
  assert.doesNotMatch(atBounds, /Vorschlag übernehmen/, "the capped suggestion is already selected");

  const high = renderToStaticMarkup(<QuickTradePriceStepper gold={200} fairPrice={140} maxPrice={500} onChange={noop} />);
  assert.match(high, /Preis: <strong>hoch<\/strong>/);
  assert.match(high, />Vorschlag übernehmen<\/button>/);
});

test("the buy screen fits on one screen: property, price, explanation and send", () => {
  const game = state(); game.propertyOwnerships.push({ tileIndex: 3, ownerId: "p2", mortgaged: false, buildingLevel: 0 });
  const markup = renderToStaticMarkup(<QuickTradePriceScreen state={game} playerId="p1" draft={{ tileIndex: 3, gold: 70 }} onChange={noop} onBack={noop} onSend={noop} />);
  assert.match(markup, /KAUFEN/);
  assert.match(markup, /Nenne Justine deinen Preis\./);
  assert.match(markup, /Sternenlichtung/);
  assert.match(markup, /Vervollständigt Mondhain/);
  assert.match(markup, />Angebot senden<\/button>/);
  assert.doesNotMatch(markup, /WER SOLL KAUFEN/);
});

test("the sell screen asks for a buyer and the counter screen fixes everything but the price", () => {
  const game = state();
  const sell = renderToStaticMarkup(<QuickTradePriceScreen state={game} playerId="p1" draft={{ tileIndex: 1, buyerId: "p3", gold: 60 }} onChange={noop} onBack={noop} onSend={noop} />);
  assert.match(sell, /VERKAUFEN/);
  assert.match(sell, /WER SOLL KAUFEN\?/);
  assert.match(sell, /<button type="button" aria-pressed="true">Morgrim · NPC<small>900 Gold<\/small><\/button>/);

  game.trades = [quickOffer()];
  const counter = renderToStaticMarkup(<QuickTradePriceScreen state={game} playerId="p1" draft={{ tileIndex: 1, counterToTradeId: "q1", gold: 150 }} onChange={noop} onBack={noop} onSend={noop} />);
  assert.match(counter, /PREIS ÄNDERN/);
  assert.match(counter, /Grundstück und Rollen bleiben gleich/);
  assert.doesNotMatch(counter, /WER SOLL KAUFEN/);
  assert.match(counter, />Neuen Preis senden<\/button>/);
});

test("the send button explains why an offer cannot go out", () => {
  const game = state();
  const tooExpensive = renderToStaticMarkup(<QuickTradePriceScreen state={game} playerId="p1" draft={{ tileIndex: 10, gold: 510 }} onChange={noop} onBack={noop} onSend={noop} />);
  assert.match(tooExpensive, /Lena besitzt nur 500 Gold\./);
  assert.match(tooExpensive, /<button type="button" class="is-primary" disabled="">Angebot senden<\/button>/);
  const offline = renderToStaticMarkup(<QuickTradePriceScreen state={game} playerId="p1" draft={{ tileIndex: 10, gold: 140 }} disabledReason="Keine Verbindung zum Spielserver." onChange={noop} onBack={noop} onSend={noop} />);
  assert.match(offline, /Keine Verbindung zum Spielserver\./);
});
