import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_TILES,
  calculatePropertyRent,
  canBuildOnProperty,
  getMortgageRedemptionCost,
  CHRONICLE_EVENTS,
  getRegionalChronicleDefinition,
  getEffectiveMortgageRedemptionCost,
  getMortgageValue,
  getAutoMortgagePlan,
  type BuildingLevel,
  type GameState
} from "@valenor/shared";
import { BankruptcyService } from "./bankruptcy-service";
import { BuildingService } from "./building-service";
import { EconomyService } from "./economy-service";
import { MortgageService } from "./mortgage-service";
import { TradeService } from "./trade-service";
import { TurnEngine } from "./turn-engine";

const mortgages = new MortgageService();
const trades = new TradeService();
const bankruptcies = new BankruptcyService();
const buildings = new BuildingService();
const economy = new EconomyService();

function game(playerCount = 3): GameState {
  const ids = ["p1", "p2", "p3", "p4"].slice(0, playerCount);
  return {
    roomId: "VAL-FIN", status: "playing", config: { mode: "chronicles" },
    players: ids.map((id, index) => ({
      id, name: ["Philipp", "Justine", "Aelor", "Myrra"][index]!, type: "human" as const,
      color: (["violet", "green", "red", "blue"] as const)[index]!, characterId: "humanKnight" as const, connectionState: "connected" as const,
      gold: 1_500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }
    })),
    turnOrder: ids, orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [], trades: [], startedAt: 1
  };
}

function own(state: GameState, ownerId: string, entries: Array<number | [number, BuildingLevel, boolean?]>): void {
  entries.forEach((entry) => {
    const [tileIndex, buildingLevel, mortgaged] = Array.isArray(entry) ? entry : [entry, 0 as BuildingLevel, false];
    state.propertyOwnerships.push({ tileIndex, ownerId, buildingLevel, mortgaged: Boolean(mortgaged) });
  });
}

test("mortgage values and redemption costs derive centrally from purchase prices", () => {
  assert.equal(getMortgageValue(BOARD_TILES[1]!), 30);
  assert.equal(getMortgageRedemptionCost(BOARD_TILES[1]!), 33);
  assert.equal(getMortgageValue(BOARD_TILES[5]!), 100);
  assert.equal(getMortgageRedemptionCost(BOARD_TILES[5]!), 110);
  assert.equal(getMortgageValue(BOARD_TILES[11]!), 75);
  assert.equal(getMortgageRedemptionCost(BOARD_TILES[11]!), 83);
});

test("owners can mortgage properties, harbors and utilities for authoritative values", () => {
  const state = game();
  own(state, "p1", [1, 5, 11]);
  mortgages.mortgage(state, "p1", 1);
  mortgages.mortgage(state, "p1", 5);
  mortgages.mortgage(state, "p1", 11);
  assert.equal(state.players[0]!.gold, 1_705);
  assert.ok(state.propertyOwnerships.every((entry) => entry.mortgaged));
  assert.match(state.economyLog[0]!.message, /30 Gold/);
});

test("mortgages reject duplicates, foreign ownership and groups containing buildings", () => {
  const state = game();
  own(state, "p1", [[1, 0], [3, 1]]);
  assert.throws(() => mortgages.mortgage(state, "p1", 1), /alle Bauwerke/);
  state.propertyOwnerships[1]!.buildingLevel = 0;
  mortgages.mortgage(state, "p1", 1);
  assert.throws(() => mortgages.mortgage(state, "p1", 1), /bereits verpfändet/);
  assert.throws(() => mortgages.mortgage(state, "p2", 3), /gehört dir nicht/);
});

test("crown decree discounts only regional mortgage redemption and validates the actual discounted amount", () => {
  const state = game(); own(state,'p1',[[1,0,true],[15,0,true]]); state.currentRound = 4;
  state.activeChronicleEvent = {...getRegionalChronicleDefinition(CHRONICLE_EVENTS[6]!,['elves']),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
  assert.equal(getEffectiveMortgageRedemptionCost(state,BOARD_TILES[1]!),25); assert.equal(getEffectiveMortgageRedemptionCost(state,BOARD_TILES[15]!),110);
  state.players[0]!.gold = 24; assert.throws(()=>mortgages.redeem(state,'p1',1),/Nicht genügend/);
  state.players[0]!.gold = 25; mortgages.redeem(state,'p1',1); assert.equal(state.players[0]!.gold,0); assert.equal(state.propertyOwnerships[0]!.mortgaged,false);
  state.currentRound = 6; assert.equal(getEffectiveMortgageRedemptionCost(state,BOARD_TILES[1]!),33);
});

test("mortgages redeem for principal plus ten percent and never overdraft", () => {
  const state = game();
  own(state, "p1", [[1, 0, true]]);
  state.players[0]!.gold = 33;
  mortgages.redeem(state, "p1", 1);
  assert.equal(state.players[0]!.gold, 0);
  assert.equal(state.propertyOwnerships[0]!.mortgaged, false);
  state.propertyOwnerships[0]!.mortgaged = true;
  assert.throws(() => mortgages.redeem(state, "p1", 1), /Nicht genügend/);
  assert.throws(() => mortgages.redeem(state, "p2", 1), /gehört dir nicht/);
});

test("automatic payment mortgages are minimal, deterministic and never sell buildings", () => {
  const state = game();
  state.players[0]!.gold = 10;
  own(state, "p1", [1, 5, 11]);
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", amount: 100, reason: "Miete" };
  assert.deepEqual(getAutoMortgagePlan(state, "p1").tileIndices, [1, 11]);
  mortgages.autoMortgageForPayment(state, "p1");
  assert.equal(state.players[0]!.gold, 115);
  assert.deepEqual(state.propertyOwnerships.filter((entry) => entry.mortgaged).map((entry) => entry.tileIndex), [1, 11]);
});

test("automatic payment mortgages reject incomplete coverage without partial mutation", () => {
  const state = game();
  state.players[0]!.gold = 0;
  own(state, "p1", [1]);
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", amount: 100, reason: "Steuer" };
  assert.throws(() => mortgages.autoMortgageForPayment(state, "p1"), /decken die Forderung nicht/);
  assert.equal(state.players[0]!.gold, 0);
  assert.equal(state.propertyOwnerships[0]!.mortgaged, false);
});

test("redeeming every mortgage is atomic and uses effective chronicle costs", () => {
  const state = game(); own(state, "p1", [[1, 0, true], [15, 0, true]]); state.currentRound = 4;
  state.activeChronicleEvent = { ...getRegionalChronicleDefinition(CHRONICLE_EVENTS[6]!, ["elves"]), startedAfterRound: 3, startedAtRound: 4, expiresAtRound: 6, startedAt: 1 };
  state.players[0]!.gold = 134;
  assert.throws(() => mortgages.redeemAll(state, "p1"), /135 Gold/);
  assert.ok(state.propertyOwnerships.every((entry) => entry.mortgaged));
  state.players[0]!.gold = 135;
  mortgages.redeemAll(state, "p1");
  assert.equal(state.players[0]!.gold, 0);
  assert.ok(state.propertyOwnerships.every((entry) => !entry.mortgaged));
});

test("a mortgage suspends rent, complete-region bonus and all building in that group", () => {
  const state = game();
  own(state, "p1", [1, [3, 0, true]]);
  assert.equal(calculatePropertyRent(state.propertyOwnerships, BOARD_TILES[1]!, "p1"), 2);
  assert.equal(calculatePropertyRent(state.propertyOwnerships, BOARD_TILES[3]!, "p1"), 0);
  assert.match(canBuildOnProperty(state, "p1", 1).reason!, /Hypotheken/);
  state.propertyOwnerships[1]!.mortgaged = false;
  assert.equal(calculatePropertyRent(state.propertyOwnerships, BOARD_TILES[1]!, "p1"), 4);
});

test("mortgaged harbors and utilities charge no rent", () => {
  const state = game(2);
  state.players[0]!.position = 5;
  state.lastDiceRoll = { die1: 3, die2: 4, total: 7, isDouble: false };
  state.lastMovement = { kind: "normal", playerId: "p1", from: 0, to: 5, path: [5], passedStart: false, landedTile: BOARD_TILES[5]! };
  state.turnContext.rollSequence = 1;
  state.turnPhase = "landed";
  own(state, "p2", [[5, 0, true], [12, 0, true]]);
  economy.resolveLanding(state);
  assert.equal(state.players[0]!.gold, 1_500);
  assert.match(state.economyLog.at(-1)!.message, /Keine Miete/);
});

test("trade can atomically exchange gold for property", () => {
  const state = game();
  own(state, "p1", [1]);
  const trade = trades.create(state, "p1", { recipientId: "p2", offer: { gold: 100, propertyTileIndices: [1] }, request: { gold: 250, propertyTileIndices: [] } });
  trades.accept(state, "p2", trade.id);
  assert.equal(state.players[0]!.gold, 1_650);
  assert.equal(state.players[1]!.gold, 1_350);
  assert.equal(state.propertyOwnerships[0]!.ownerId, "p2");
  assert.equal(trade.status, "accepted");
});

test("trade swaps properties and preserves mortgage state", () => {
  const state = game();
  own(state, "p1", [[1, 0, true]]);
  own(state, "p2", [11]);
  const trade = trades.create(state, "p1", { recipientId: "p2", offer: { gold: 0, propertyTileIndices: [1] }, request: { gold: 0, propertyTileIndices: [11] } });
  trades.accept(state, "p2", trade.id);
  assert.equal(state.propertyOwnerships.find((entry) => entry.tileIndex === 1)?.ownerId, "p2");
  assert.equal(state.propertyOwnerships.find((entry) => entry.tileIndex === 1)?.mortgaged, true);
  assert.equal(state.propertyOwnerships.find((entry) => entry.tileIndex === 11)?.ownerId, "p1");
});

test("rejected and cancelled trades mutate no economy values", () => {
  const state = game();
  own(state, "p1", [1]);
  const first = trades.create(state, "p1", { recipientId: "p2", offer: { gold: 0, propertyTileIndices: [1] }, request: { gold: 1, propertyTileIndices: [] } });
  trades.reject(state, "p2", first.id);
  const second = trades.create(state, "p1", { recipientId: "p2", offer: { gold: 5, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [] } });
  trades.cancel(state, "p1", second.id);
  assert.deepEqual(state.players.map((player) => player.gold), [1_500, 1_500, 1_500]);
  assert.equal(state.propertyOwnerships[0]!.ownerId, "p1");
});

test("stale trades are cancelled at acceptance without a partial transfer", () => {
  const state = game();
  own(state, "p1", [1]);
  const trade = trades.create(state, "p1", { recipientId: "p2", offer: { gold: 1_000, propertyTileIndices: [1] }, request: { gold: 0, propertyTileIndices: [] } });
  state.players[0]!.gold = 100;
  assert.throws(() => trades.accept(state, "p2", trade.id), /nicht mehr gültig/);
  assert.equal(trade.status, "cancelled");
  assert.equal(state.propertyOwnerships[0]!.ownerId, "p1");
  assert.equal(state.players[1]!.gold, 1_500);
});

test("trade rejects built groups, foreign assets and paymentRequired while allowing computer targets", () => {
  const state = game();
  own(state, "p1", [[1, 1], 3]);
  assert.throws(() => trades.create(state, "p1", { recipientId: "p2", offer: { gold: 0, propertyTileIndices: [1] }, request: { gold: 1, propertyTileIndices: [] } }), /alle Bauwerke/);
  state.propertyOwnerships[0]!.buildingLevel = 0;
  assert.throws(() => trades.create(state, "p1", { recipientId: "p2", offer: { gold: 0, propertyTileIndices: [11] }, request: { gold: 1, propertyTileIndices: [] } }), /gehört nicht/);
  state.players[1]!.type = "computer";
  assert.equal(trades.create(state, "p1", { recipientId: "p2", offer: { gold: 1, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [] } }).status, "pending");
  state.players[1]!.type = "human";
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", amount: 10, reason: "Miete", creditorType: "player", payeeId: "p2" };
  assert.throws(() => trades.create(state, "p1", { recipientId: "p2", offer: { gold: 1, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [] } }), /kein Handel/);
});

test("paymentRequired resolves after a building sale and mortgage without double payment", () => {
  const state = game();
  state.players[0]!.gold = 100;
  own(state, "p1", [[30, 1], 31, 34, 5, 11, 15, 28]);
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", payeeId: "p2", creditorType: "player", reasonType: "rent", amount: 500, reason: "Miete" };
  buildings.sell(state, "p1", 30);
  mortgages.mortgage(state, "p1", 5);
  mortgages.mortgage(state, "p1", 11);
  mortgages.mortgage(state, "p1", 15);
  mortgages.mortgage(state, "p1", 28);
  economy.settlePendingPayment(state, "p1");
  assert.equal(state.players[0]!.gold, 50);
  assert.equal(state.players[1]!.gold, 2_000);
  assert.throws(() => economy.settlePendingPayment(state, "p1"), /keine offene/);
});

test("bankruptcy against a player liquidates buildings and transfers all assets and mortgages", () => {
  const state = game();
  state.players[0]!.gold = 100;
  own(state, "p1", [[1, 1], [3, 0, true], 5, 12]);
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", payeeId: "p2", creditorType: "player", amount: 800, reason: "Miete" };
  bankruptcies.declare(state, "p1");
  assert.equal(state.players[0]!.gold, 0);
  assert.equal(state.players[0]!.isBankrupt, true);
  assert.equal(state.players[1]!.gold, 1_625);
  assert.ok(state.propertyOwnerships.every((entry) => entry.ownerId === "p2" && entry.buildingLevel === 0));
  assert.equal(state.propertyOwnerships.find((entry) => entry.tileIndex === 3)?.mortgaged, true);
  assert.equal(state.currentPlayerId, "p2");
});

test("bankruptcy against the bank clears mortgages and auctions assets in tile order", () => {
  const state = game();
  own(state, "p1", [[5, 0, true], 1]);
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", creditorType: "bank", amount: 200, reason: "Kronenzoll" };
  bankruptcies.declare(state, "p1");
  assert.equal(state.auction?.tileIndex, 1);
  assert.deepEqual(state.bankruptcyAuction?.pendingTileIndices, [5]);
  assert.equal(state.propertyOwnerships.length, 0);
  economy.bid(state, "p2", 10);
  economy.withdraw(state, "p3");
  assert.equal(state.propertyOwnerships[0]?.tileIndex, 1);
  assert.equal(state.propertyOwnerships[0]?.mortgaged, false);
  assert.equal(state.auction?.tileIndex, 5);
  economy.withdraw(state, "p2");
  economy.withdraw(state, "p3");
  assert.equal(state.bankruptcyAuction, undefined);
  assert.equal(state.currentPlayerId, "p2");
});

test("bankruptcy auction excludes the debtor and closes when the final bidder bids after all others withdrew", () => {
  const state = game(4);
  own(state, "p1", [1, 5]);
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", creditorType: "bank", amount: 200, reason: "Kronenzoll" };
  bankruptcies.declare(state, "p1");

  assert.deepEqual(state.auction?.participantIds, ["p2", "p3", "p4"]);
  economy.withdraw(state, "p3");
  economy.withdraw(state, "p4");
  economy.bid(state, "p2", 10);

  assert.equal(state.propertyOwnerships.find((entry) => entry.tileIndex === 1)?.ownerId, "p2");
  assert.equal(state.auction?.tileIndex, 5);
  economy.withdraw(state, "p3");
  economy.withdraw(state, "p4");
  economy.bid(state, "p2", 10);

  assert.equal(state.auction, undefined);
  assert.equal(state.bankruptcyAuction, undefined);
  assert.equal(state.turnPhase, "waitingForRoll");
  assert.equal(state.currentPlayerId, "p2");
  new TurnEngine().rollTurn(state, "p2", "human");
  assert.equal(state.turnPhase, "rolling");
});

test("last active player wins and further turn actions are rejected", () => {
  const state = game(2);
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", payeeId: "p2", creditorType: "player", amount: 10, reason: "Miete" };
  bankruptcies.declare(state, "p1");
  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, "p2");
  assert.equal(state.finishReason, "lastPlayerStanding");
  assert.throws(() => new TurnEngine().rollTurn(state, "p2", "human"), /entschieden/);
});

test("normal end-turn skips bankrupt players without loops", () => {
  const state = game(4);
  state.turnPhase = "waitingForEndTurn";
  state.players[1]!.isBankrupt = true;
  new TurnEngine().endTurn(state, "p1", "human");
  assert.equal(state.currentPlayerId, "p3");
});

test("round completion survives a bankrupt player at turn-order index zero", () => {
  const state = game(4);
  state.players[0]!.isBankrupt = true;
  state.currentPlayerId = "p4";
  state.currentTurnIndex = 3;
  state.currentRound = 7;
  state.turnPhase = "waitingForEndTurn";

  new TurnEngine().endTurn(state, "p4", "human");

  assert.equal(state.currentPlayerId, "p2");
  assert.equal(state.currentTurnIndex, 1);
  assert.equal(state.currentRound, 8);
});
