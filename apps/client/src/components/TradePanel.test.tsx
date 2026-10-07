import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameState } from "@valenor/shared";
import { TradePanel, getCounterOfferTemplate } from "./TradePanel";
import { RELIC_ASSETS } from "../game/assets/asset-manifest";

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

test("relic trades display central assets and descriptions while armed relic selection is disabled", () => {
  const game = state(); game.players[0]!.relics = ["runestone","merchant-seal"]; game.players[0]!.armedRelics = ["merchant-seal"];
  game.players[1]!.relics = ["golden-feather"]; game.trades[0]!.offer.relicIds = ["golden-feather"]; game.trades[0]!.request.relicIds = ["runestone"];
  const markup = renderToStaticMarkup(<TradePanel state={game} playerId="p1" connected onCreate={() => undefined} onDecision={() => undefined} />);
  assert.match(markup,/RELIKTE/); assert.match(markup,/AKTIV · nicht handelbar/);
  assert.match(markup,/aria-label="Siegel des Händlers" disabled=""/); assert.match(markup,/Wurf einmal wiederholen/);
  for (const id of ["runestone","merchant-seal","golden-feather"] as const) assert.ok(markup.includes(RELIC_ASSETS[id].path));
});

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

test("every traded property names its group, owner and status on both offer sides", () => {
  const game = state();
  game.trades.push({ ...game.trades[0]!, id: "sent", proposerId: "p1", recipientId: "p2" });
  const original = JSON.stringify(game);
  const markup = renderToStaticMarkup(<TradePanel state={game} playerId="p1" connected onCreate={() => undefined} onDecision={() => undefined} />);
  assert.match(markup, /Mondhain · 2er-Gruppe/);
  assert.match(markup, /Silberbach · 3er-Gruppe/);
  assert.match(markup, /Besitz: Philipp/);
  assert.match(markup, /Besitz: Justine/);
  assert.match(markup, /Belehnt/);
  assert.match(markup, /Du gibst/);
  assert.match(markup, /Du erhältst/);
  assert.match(markup, /Dein Angebot im Überblick/);
  assert.match(markup, /--property-group-accent:#24c4b7/);
  assert.equal(JSON.stringify(game), original);
});

test("rejected offers retain grouped property identities in collapsed history", () => {
  const game = state();
  game.trades[0]!.status = "rejected";
  const markup = renderToStaticMarkup(<TradePanel state={game} playerId="p1" connected onCreate={() => undefined} onDecision={() => undefined} />);
  assert.match(markup, /Abgelehnt/);
  assert.match(markup, /<details class="trade-section trade-history">/);
  assert.match(markup, /Silberbach · 3er-Gruppe/);
});

test("incoming offers expose a counter action and replaced offers have clear history", () => {
  const game=state();
  const render=()=>renderToStaticMarkup(<TradePanel state={game} playerId="p1" connected onCreate={()=>undefined} onDecision={()=>undefined} />);
  assert.match(render(),/>Gegenangebot<\/button>/);
  game.turnPhase='dungeonDecision'; assert.match(render(),/disabled=""[^>]*>Gegenangebot/);
  game.trades[0]!.status='countered'; assert.match(render(),/Durch Gegenangebot ersetzt/);
});

test("counter template mirrors every asset and remains editable without changing the original", () => {
  const original=state().trades[0]!;
  original.offer.cardIds=['adv_024']; original.offer.relicIds=['runestone'];
  original.request.cardIds=['fate_024']; original.request.relicIds=['golden-feather'];
  const before=JSON.stringify(original), template=getCounterOfferTemplate(original);
  assert.equal(template.recipientId,original.proposerId); assert.equal(template.counterToTradeId,original.id);
  assert.deepEqual(template.offer,original.request); assert.deepEqual(template.request,original.offer);
  template.offer.gold=250; template.offer.propertyTileIndices.splice(0); template.offer.cardIds!.splice(0); template.offer.relicIds!.splice(0);
  template.request.propertyTileIndices.push(3); template.request.cardIds!.splice(0); template.request.relicIds!.splice(0);
  assert.equal(JSON.stringify(original),before); assert.equal(original.status,'pending');
});
