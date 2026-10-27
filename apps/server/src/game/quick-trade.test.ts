import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_TILES,
  QUICK_TRADE_MIN_PRICE,
  QUICK_TRADE_PRICE_RATING_BOUNDS,
  QUICK_TRADE_PRICE_RATING_LABELS,
  formatQuickTradeHeadline,
  getEffectiveMortgageRedemptionCost,
  getOpenQuickTrade,
  getQuickTradeEligibility,
  getQuickTradeSuggestion,
  getQuickTradeTerms,
  rateQuickTradePrice,
  type GameState
} from "@valenor/shared";
import { TradeService } from "./trade-service";
import { RoomManager } from "../room-manager";
import { startReadyGame } from "../test-fixtures";

const trades = new TradeService();

function game(): GameState {
  const ids = ["p1", "p2", "p3"];
  return {
    roomId: "VAL-QUICK", status: "playing", config: { mode: "chronicles" },
    players: ids.map((id, index) => ({
      id, name: ["Lena", "Justine", "Aelor"][index]!, type: "human" as const,
      color: (["violet", "green", "red"] as const)[index]!, characterId: "humanKnight" as const, connectionState: "connected" as const,
      gold: 1_000, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }
    })),
    turnOrder: ids, orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 3, turnNumber: 7, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 1
  };
}

const own = (state: GameState, ownerId: string, indices: number[], mortgaged = false) =>
  state.propertyOwnerships.push(...indices.map(tileIndex => ({ tileIndex, ownerId, mortgaged, buildingLevel: 0 as const })));
const ownership = (state: GameState, tileIndex: number) => state.propertyOwnerships.find(entry => entry.tileIndex === tileIndex)!;
const gold = (state: GameState, id: string) => state.players.find(player => player.id === id)!.gold;

// Mühlenweg (10) kostet 140 Gold und gehört in diesen Tests zunächst Justine.
function market() {
  const state = game();
  own(state, "p2", [10]);
  return state;
}

test("fair price starts from the purchase price and is rounded to ten gold", () => {
  const state = market();
  const suggestion = getQuickTradeSuggestion(state, 10, "p1")!;
  assert.equal(suggestion.fairPrice, 140);
  assert.equal(suggestion.sellerId, "p2");
  assert.equal(suggestion.buyerId, "p1");
  assert.equal(suggestion.minPrice, QUICK_TRADE_MIN_PRICE);
  assert.equal(suggestion.maxPrice, 1_000);
  assert.deepEqual(suggestion.factors, [{ label: "Kaufpreis", amount: 140 }]);
  assert.equal(getQuickTradeSuggestion(state, 10, "p2"), undefined, "the owner cannot buy from himself");
  assert.equal(getQuickTradeSuggestion(state, 1, "p1"), undefined, "unowned tiles have no seller");
});

test("fair price subtracts the effective mortgage redemption the buyer must pay", () => {
  const state = game();
  own(state, "p2", [9], true);
  const redemption = getEffectiveMortgageRedemptionCost(state, BOARD_TILES[9]!);
  const suggestion = getQuickTradeSuggestion(state, 9, "p1")!;
  assert.equal(suggestion.fairPrice, Math.round((120 - redemption) / 10) * 10);
  assert.ok(suggestion.factors.some(factor => factor.label.includes("Hypothek") && factor.amount === -redemption));
});

test("fair price adds premiums for completing a group, breaking up a seller group and harbor networks", () => {
  const completion = game();
  own(completion, "p1", [1]); own(completion, "p2", [3]);
  const completing = getQuickTradeSuggestion(completion, 3, "p1")!;
  assert.equal(completing.fairPrice, 70, "60 Gold plus 10 % Gruppenbonus, gerundet");
  assert.ok(completing.factors.some(factor => factor.label === "Vervollständigt Mondhain"));

  const breakup = game();
  own(breakup, "p2", [6, 8]);
  assert.equal(getQuickTradeSuggestion(breakup, 8, "p1")!.fairPrice, 110, "100 Gold plus 10 % für die aufgegebene Teilgruppe");

  const harbors = game();
  own(harbors, "p1", [5, 15]); own(harbors, "p2", [25]);
  const network = getQuickTradeSuggestion(harbors, 25, "p1")!;
  assert.equal(network.fairPrice, 220, "200 Gold plus 5 % je eigenem Hafen");
  assert.ok(network.factors.some(factor => factor.label === "Stärkt das Hafennetz"));
});

test("price rating bounds are shared constants relative to the fair price", () => {
  assert.deepEqual(QUICK_TRADE_PRICE_RATING_BOUNDS, { cheapBelow: 0.9, highAbove: 1.1 });
  assert.equal(rateQuickTradePrice(80, 100), "cheap");
  assert.equal(rateQuickTradePrice(90, 100), "fair");
  assert.equal(rateQuickTradePrice(100, 100), "fair");
  assert.equal(rateQuickTradePrice(110, 100), "fair");
  assert.equal(rateQuickTradePrice(120, 100), "high");
  assert.equal(rateQuickTradePrice(50, 0), "fair");
  assert.deepEqual(QUICK_TRADE_PRICE_RATING_LABELS, { cheap: "günstig", fair: "fair", high: "hoch" });
});

test("eligibility keeps building and bankruptcy rules and explains the block", () => {
  const state = market();
  assert.deepEqual(getQuickTradeEligibility(state, "p2", "p1", 10), { allowed: true });
  own(state, "p3", [12]); ownership(state, 12).buildingLevel = 1;
  assert.match(getQuickTradeEligibility(state, "p2", "p1", 10).reason!, /Bauwerke/);
  ownership(state, 12).buildingLevel = 0; state.players[0]!.isBankrupt = true;
  assert.match(getQuickTradeEligibility(state, "p2", "p1", 10).reason!, /Ausgeschiedene/);
});

test("buying derives seller and direction from ownership and announces the offer in one line", () => {
  const state = market();
  const trade = trades.createQuick(state, "p1", { tileIndex: 10, gold: 150 });
  assert.equal(trade.mode, "quick");
  assert.equal(trade.recipientId, "p2");
  assert.deepEqual(trade.offer, { gold: 150, propertyTileIndices: [], cardIds: [], relicIds: [] });
  assert.deepEqual(trade.request, { gold: 0, propertyTileIndices: [10], cardIds: [], relicIds: [] });
  assert.deepEqual(trade.quickSnapshot, { round: 3, mortgaged: false });
  assert.deepEqual(getQuickTradeTerms(trade), { tileIndex: 10, gold: 150, sellerId: "p2", buyerId: "p1" });
  assert.equal(formatQuickTradeHeadline(state, trade), "Lena will Mühlenweg für 150 Gold kaufen.");
  assert.equal(state.economyLog.at(-1)!.message, "Lena will Mühlenweg für 150 Gold kaufen.");
  assert.equal(state.lastTradeAction?.type, "created");
  assert.equal(state.lastTradeAction?.tradeId, trade.id);
});

test("selling an own property needs a chosen buyer", () => {
  const state = game();
  own(state, "p1", [10]);
  assert.throws(() => trades.createQuick(state, "p1", { tileIndex: 10, gold: 150 }), /Käufer/);
  const trade = trades.createQuick(state, "p1", { tileIndex: 10, gold: 150, recipientId: "p3" });
  assert.deepEqual(getQuickTradeTerms(trade), { tileIndex: 10, gold: 150, sellerId: "p1", buyerId: "p3" });
  assert.equal(formatQuickTradeHeadline(state, trade), "Lena bietet Mühlenweg für 150 Gold an.");
});

test("quick trade requests cannot smuggle in prices, owners or assets the server does not allow", () => {
  const state = market();
  own(state, "p3", [12]);
  assert.throws(() => trades.createQuick(state, "p1", { tileIndex: 10, gold: 5 }), /mindestens 10 Gold/);
  assert.throws(() => trades.createQuick(state, "p1", { tileIndex: 10, gold: 12.5 }), /mindestens 10 Gold/);
  assert.throws(() => trades.createQuick(state, "p1", { tileIndex: 10, gold: 1_001 }), /nicht genügend Gold/);
  assert.throws(() => trades.createQuick(state, "p1", { tileIndex: 10, gold: 150, recipientId: "p3" }), /anderen Gefährten/);
  assert.throws(() => trades.createQuick(state, "p1", { tileIndex: 1, gold: 150 }), /keinen Besitzer/);
  assert.throws(() => trades.createQuick(state, "p1", { tileIndex: 0, gold: 150 }), /keinen Besitzer/);
  state.players[1]!.heldCards = [{ cardId: "adv_024", deck: "adventure" }];
  own(state, "p2", [14]);
  assert.throws(() => trades.create(state, "p1", { recipientId: "p2", mode: "quick", offer: { gold: 150, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [10], cardIds: ["adv_024"] } }), /genau ein Grundstück/);
  assert.throws(() => trades.create(state, "p1", { recipientId: "p2", mode: "quick", offer: { gold: 150, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [10, 14] } }), /genau ein Grundstück/);
  assert.throws(() => trades.create(state, "p1", { recipientId: "p2", mode: "quick", offer: { gold: 150, propertyTileIndices: [] }, request: { gold: 20, propertyTileIndices: [10] } }), /genau ein Grundstück/);
  state.turnPhase = "paymentRequired";
  assert.throws(() => trades.createQuick(state, "p1", { tileIndex: 10, gold: 150 }));
  assert.equal(state.trades.length, 0);
});

test("each player has at most one open quick offer and can withdraw it", () => {
  const state = market();
  own(state, "p3", [12]);
  const first = trades.createQuick(state, "p1", { tileIndex: 10, gold: 150 });
  assert.equal(getOpenQuickTrade(state, "p1"), first);
  assert.throws(() => trades.createQuick(state, "p1", { tileIndex: 12, gold: 150 }), /bereits ein offenes Schnellangebot/);
  assert.throws(() => trades.createQuick(state, "p1", { tileIndex: 10, gold: 200 }), /bereits ein offenes Schnellangebot/);
  // Andere Spieler und der erweiterte Handel sind davon nicht betroffen.
  assert.equal(trades.createQuick(state, "p3", { tileIndex: 10, gold: 160 }).status, "pending");
  assert.equal(trades.create(state, "p1", { recipientId: "p3", offer: { gold: 50, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [12] } }).status, "pending");

  assert.throws(() => trades.cancel(state, "p2", first.id), /Nur der Anbieter/);
  trades.cancel(state, "p1", first.id);
  assert.equal(first.status, "cancelled");
  assert.equal(state.lastTradeAction?.type, "cancelled");
  assert.equal(state.economyLog.at(-1)!.message, "Lena zieht das Angebot für Mühlenweg zurück.");
  assert.equal(getOpenQuickTrade(state, "p1"), undefined);
  assert.equal(trades.createQuick(state, "p1", { tileIndex: 12, gold: 150 }).status, "pending");
});

test("counter offers in quick trade may only change the price", () => {
  const state = market();
  own(state, "p2", [12]);
  const offer = trades.createQuick(state, "p1", { tileIndex: 10, gold: 120 });
  assert.throws(() => trades.create(state, "p2", { counterToTradeId: offer.id, recipientId: "p1", offer: { gold: 0, propertyTileIndices: [12] }, request: { gold: 120, propertyTileIndices: [] } }), /nur den Preis/);
  assert.throws(() => trades.create(state, "p2", { counterToTradeId: offer.id, recipientId: "p1", offer: { gold: 0, propertyTileIndices: [10, 12] }, request: { gold: 120, propertyTileIndices: [] } }), /genau ein Grundstück/);
  assert.throws(() => trades.createQuick(state, "p3", { tileIndex: 10, gold: 170, counterToTradeId: offer.id }), /Nur der Empfänger/);
  assert.equal(offer.status, "pending");

  const counter = trades.createQuick(state, "p2", { tileIndex: 10, gold: 170, counterToTradeId: offer.id });
  assert.equal(offer.status, "countered");
  assert.equal(counter.mode, "quick");
  assert.equal(counter.counterToTradeId, offer.id);
  assert.deepEqual(getQuickTradeTerms(counter), { tileIndex: 10, gold: 170, sellerId: "p2", buyerId: "p1" });
  assert.equal(state.economyLog.at(-1)!.message, "Justine verlangt 170 Gold für Mühlenweg.");

  const final = trades.createQuick(state, "p1", { tileIndex: 10, gold: 160, counterToTradeId: counter.id });
  assert.equal(state.economyLog.at(-1)!.message, "Lena bietet jetzt 160 Gold für Mühlenweg.");
  trades.accept(state, "p2", final.id);
  assert.equal(ownership(state, 10).ownerId, "p1");
});

test("a counter offer also counts as the counterer's single open quick offer", () => {
  const state = market();
  own(state, "p2", [12]); own(state, "p3", [1]);
  trades.createQuick(state, "p2", { tileIndex: 1, gold: 60 });
  const offer = trades.createQuick(state, "p1", { tileIndex: 10, gold: 120 });
  assert.throws(() => trades.createQuick(state, "p2", { tileIndex: 10, gold: 170, counterToTradeId: offer.id }), /bereits ein offenes Schnellangebot/);
  assert.equal(offer.status, "pending");
});

test("accepting transfers gold and property atomically and seals the trade on the chronicle", () => {
  const state = market();
  const trade = trades.createQuick(state, "p1", { tileIndex: 10, gold: 150 });
  assert.throws(() => trades.accept(state, "p1", trade.id), /nicht an dich gerichtet/);
  trades.accept(state, "p2", trade.id);
  assert.equal(trade.status, "accepted");
  assert.equal(ownership(state, 10).ownerId, "p1");
  assert.equal(gold(state, "p1"), 850);
  assert.equal(gold(state, "p2"), 1_150);
  assert.equal(state.lastTradeAction?.type, "accepted");
  assert.equal(state.economyLog.at(-1)!.message, "Handel besiegelt: Lena erwirbt Mühlenweg von Justine für 150 Gold.");
});

test("accepting re-checks that the buyer still has enough gold", () => {
  // Der Anbieter kauft und hat sein Gold inzwischen ausgegeben.
  const buying = market();
  const offer = trades.createQuick(buying, "p1", { tileIndex: 10, gold: 150 });
  buying.players[0]!.gold = 149;
  assert.throws(() => trades.accept(buying, "p2", offer.id), /nicht genügend Gold/);
  assert.equal(offer.status, "cancelled");
  assert.equal(ownership(buying, 10).ownerId, "p2");
  assert.equal(gold(buying, "p1"), 149);
  assert.equal(gold(buying, "p2"), 1_000);

  // Der Empfänger kauft und kann den Preis beim Annehmen nicht mehr zahlen.
  const selling = market();
  const sale = trades.createQuick(selling, "p2", { tileIndex: 10, gold: 300, recipientId: "p1" });
  selling.players[0]!.gold = 299;
  assert.throws(() => trades.accept(selling, "p1", sale.id), /nicht genügend Gold/);
  assert.equal(sale.status, "cancelled");
  assert.equal(ownership(selling, 10).ownerId, "p2");
  assert.equal(gold(selling, "p1"), 299);
  assert.equal(gold(selling, "p2"), 1_000);
});

test("accepting re-checks that the property is still tradable", () => {
  const built = market();
  own(built, "p2", [12, 14]);
  const offer = trades.createQuick(built, "p1", { tileIndex: 10, gold: 150 });
  ownership(built, 12).buildingLevel = 1;
  assert.throws(() => trades.accept(built, "p2", offer.id), /verfallen.*Bauwerke/);
  assert.equal(offer.status, "expired");
  assert.equal(ownership(built, 10).ownerId, "p2");
  assert.equal(gold(built, "p1"), 1_000);

  const moved = market();
  const second = trades.createQuick(moved, "p1", { tileIndex: 10, gold: 150 });
  ownership(moved, 10).ownerId = "p3";
  assert.throws(() => trades.accept(moved, "p2", second.id), /verfallen.*Besitzer gewechselt/);
  assert.equal(second.status, "expired");
  assert.equal(ownership(moved, 10).ownerId, "p3");

  const mortgaged = market();
  const third = trades.createQuick(mortgaged, "p1", { tileIndex: 10, gold: 150 });
  ownership(mortgaged, 10).mortgaged = true;
  assert.throws(() => trades.accept(mortgaged, "p2", third.id), /verfallen.*verpfändet/);
  assert.equal(gold(mortgaged, "p1"), 1_000);
});

test("open quick offers expire when they no longer match the game and say why", () => {
  const cases: [string, (state: GameState) => void, RegExp][] = [
    ["mortgage", state => { ownership(state, 10).mortgaged = true; }, /Mühlenweg wurde verpfändet\./],
    ["building", state => { own(state, "p2", [12, 14]); ownership(state, 14).buildingLevel = 1; }, /In Silberbach stehen jetzt Bauwerke\./],
    ["owner", state => { ownership(state, 10).ownerId = "p3"; }, /Mühlenweg hat den Besitzer gewechselt\./],
    ["buyer bankrupt", state => { state.players[0]!.isBankrupt = true; }, /Lena ist ausgeschieden\./],
    ["seller bankrupt", state => { state.players[1]!.isBankrupt = true; }, /Justine ist ausgeschieden\./],
    ["round over", state => { state.currentRound += 1; }, /Die Runde ist vorüber\./]
  ];
  for (const [name, change, reason] of cases) {
    const state = market();
    const trade = trades.createQuick(state, "p1", { tileIndex: 10, gold: 150 });
    trades.expireStaleQuickTrades(state);
    assert.equal(trade.status, "pending", `${name}: still valid before the change`);
    change(state);
    trades.expireStaleQuickTrades(state);
    assert.equal(trade.status, "expired", name);
    assert.match(trade.closedReason!, reason, name);
    assert.equal(state.lastTradeAction?.type, "expired", name);
    assert.match(state.economyLog.at(-1)!.message, /^Das Angebot von Lena für Mühlenweg ist verfallen: /, name);
  }
});

test("redeeming a mortgage also expires the offer because the price basis changed", () => {
  const state = game();
  own(state, "p2", [10], true);
  const trade = trades.createQuick(state, "p1", { tileIndex: 10, gold: 50 });
  assert.deepEqual(trade.quickSnapshot, { round: 3, mortgaged: true });
  ownership(state, 10).mortgaged = false;
  trades.expireStaleQuickTrades(state);
  assert.equal(trade.closedReason, "Mühlenweg wurde ausgelöst.");
});

test("expiry leaves gold dips, advanced trades and settled offers alone", () => {
  const state = market();
  own(state, "p3", [12]);
  const quick = trades.createQuick(state, "p1", { tileIndex: 10, gold: 150 });
  const advanced = trades.create(state, "p1", { recipientId: "p3", offer: { gold: 50, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [12] } });
  state.players[0]!.gold = 10;
  trades.expireStaleQuickTrades(state);
  assert.equal(quick.status, "pending", "gold can recover and is checked at acceptance");
  state.players[0]!.gold = 1_000;
  state.currentRound += 1;
  const log = state.economyLog.length;
  trades.expireStaleQuickTrades(state);
  trades.expireStaleQuickTrades(state);
  assert.equal(quick.status, "expired");
  assert.equal(advanced.status, "pending");
  assert.equal(state.economyLog.length, log + 1, "an offer expires exactly once");
});

test("the room manager expires stale quick offers after every state change", () => {
  const manager = new RoomManager(undefined, undefined, undefined, () => 0);
  const { room } = manager.createRoom("host-1");
  const lena = manager.joinRoom(room.code, "Lena", "socket-1");
  const justine = manager.joinRoom(room.code, "Justine", "socket-2");
  startReadyGame(manager, room.code, "host-1");
  const live = (manager as unknown as { rooms: Map<string, { gameState: GameState }> }).rooms.get(room.code)!.gameState;
  live.turnPhase = "waitingForRoll";
  live.propertyOwnerships.push({ tileIndex: 10, ownerId: justine.player.id, mortgaged: false, buildingLevel: 0 });
  const created = manager.createQuickTrade(room.code, lena.player.id, { tileIndex: 10, gold: 150 });
  assert.equal(created.trades[0]!.status, "pending");
  assert.deepEqual(created.trades[0]!.quickSnapshot, { round: live.currentRound, mortgaged: false });
  created.trades[0]!.quickSnapshot!.round = 99;
  assert.equal(live.trades[0]!.quickSnapshot!.round, live.currentRound, "snapshots are copied, not shared");

  const mortgaged = manager.mortgageProperty(room.code, justine.player.id, 10);
  assert.equal(mortgaged.trades[0]!.status, "expired");
  assert.equal(mortgaged.trades[0]!.closedReason, "Mühlenweg wurde verpfändet.");
  assert.equal(mortgaged.lastTradeAction?.type, "expired");
});
