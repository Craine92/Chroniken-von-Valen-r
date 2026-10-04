import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_TILES, STARTING_GOLD, type GameState } from "@valenor/shared";
import { EconomyService } from "./economy-service";

const economy = new EconomyService();

function stateOn(tileIndex: number, gold: number = STARTING_GOLD): GameState {
  return {
    roomId: "VAL-ECON", status: "playing", config: { mode: "chronicles" },
    players: [
      { id: "p1", name: "Aela", type: "human", color: "violet", connectionState: "connected", gold, position: tileIndex, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
      { id: "p2", name: "Brom", type: "human", color: "green", connectionState: "connected", gold: STARTING_GOLD, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
    ],
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "landed",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 1 },
    lastDiceRoll: { die1: 3, die2: 4, total: 7, isDouble: false },
    lastMovement: { kind: "normal", playerId: "p1", from: 0, to: tileIndex, path: [tileIndex], passedStart: false, landedTile: BOARD_TILES[tileIndex]! },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 1
  };
}

test("all property prices and rents follow the board order", () => {
  const properties = BOARD_TILES.filter((tile) => tile.type === "property");
  assert.deepEqual(properties.map((tile) => tile.economy?.purchasePrice), [60,60,100,100,120,140,140,160,180,180,200,220,220,240,260,260,280,300,300,320,350,400]);
  assert.deepEqual(properties.map((tile) => tile.economy?.baseRent), [2,4,6,6,8,10,10,12,14,14,16,18,18,20,22,22,24,26,26,28,35,50]);
});

test("an unowned property can be bought without mutating board data", () => {
  const state = stateOn(1);
  economy.resolveLanding(state);
  assert.equal(state.turnPhase, "propertyDecision");
  economy.buyCurrentTile(state, "p1");
  assert.equal(state.players[0]!.gold, 1440);
  assert.deepEqual(state.propertyOwnerships[0], { tileIndex: 1, ownerId: "p1", mortgaged: false, buildingLevel: 0 });
  assert.equal(state.turnPhase, "waitingForEndTurn");
  assert.equal((BOARD_TILES[1] as unknown as { ownerId?: string }).ownerId, undefined);
});

test("invalid and unaffordable purchases leave ownership and gold unchanged", () => {
  const state = stateOn(39, 399);
  economy.resolveLanding(state);
  assert.throws(() => economy.buyCurrentTile(state, "p1"), /reicht/);
  assert.equal(state.players[0]!.gold, 399);
  assert.deepEqual(state.propertyOwnerships, []);
  assert.throws(() => economy.buyCurrentTile(state, "p2"), /nicht zu/);
});

test("property rent transfers gold, own fields do not", () => {
  const state = stateOn(39);
  state.propertyOwnerships.push({ tileIndex: 39, ownerId: "p2", mortgaged: false, buildingLevel: 0 });
  economy.resolveLanding(state);
  assert.equal(state.players[0]!.gold, 1450);
  assert.equal(state.players[1]!.gold, 1550);
  assert.equal(state.turnPhase, "waitingForEndTurn");

  const own = stateOn(39);
  own.propertyOwnerships.push({ tileIndex: 39, ownerId: "p1", mortgaged: false, buildingLevel: 0 });
  economy.resolveLanding(own);
  assert.equal(own.players[0]!.gold, STARTING_GOLD);
});

test("harbor rent scales with the owner's harbor count", () => {
  [25, 50, 100, 200].forEach((expected, countIndex) => {
    const state = stateOn(5);
    [5, 15, 25, 35].slice(0, countIndex + 1).forEach((tileIndex) => state.propertyOwnerships.push({ tileIndex, ownerId: "p2", mortgaged: false, buildingLevel: 0 }));
    economy.resolveLanding(state);
    assert.equal(state.players[0]!.gold, STARTING_GOLD - expected);
  });
});

test("utility rent uses the dice total and owned utility count", () => {
  const one = stateOn(11);
  one.propertyOwnerships.push({ tileIndex: 11, ownerId: "p2", mortgaged: false, buildingLevel: 0 });
  economy.resolveLanding(one);
  assert.equal(one.players[0]!.gold, STARTING_GOLD - 28);
  const both = stateOn(11);
  [11, 28].forEach((tileIndex) => both.propertyOwnerships.push({ tileIndex, ownerId: "p2", mortgaged: false, buildingLevel: 0 }));
  economy.resolveLanding(both);
  assert.equal(both.players[0]!.gold, STARTING_GOLD - 70);
});

test("passing or landing on Runentor awards exactly 200 once", () => {
  const state = stateOn(0);
  state.lastMovement = { ...state.lastMovement!, from: 39, to: 0, passedStart: true, landedTile: BOARD_TILES[0]! };
  economy.resolveLanding(state);
  assert.equal(state.players[0]!.gold, 1700);
  assert.throws(() => economy.resolveLanding(state), /Landung/);
  assert.equal(state.players[0]!.gold, 1700);
});

test("taxes use the configured amounts and never make gold negative", () => {
  const crown = stateOn(4);
  economy.resolveLanding(crown);
  assert.equal(crown.players[0]!.gold, 1300);
  const tithe = stateOn(38);
  economy.resolveLanding(tithe);
  assert.equal(tithe.players[0]!.gold, 1400);
  const poor = stateOn(4, 150);
  economy.resolveLanding(poor);
  assert.equal(poor.players[0]!.gold, 150);
  assert.equal(poor.turnPhase, "paymentRequired");
  assert.deepEqual(poor.pendingPayment, { payerId: "p1", amount: 200, reason: "Kronenzoll", creditorType: "bank", reasonType: "tax" });
});

test("mandatory rent pauses safely when the payer cannot cover it", () => {
  const state = stateOn(39, 20);
  state.propertyOwnerships.push({ tileIndex: 39, ownerId: "p2", mortgaged: false, buildingLevel: 0 });
  economy.resolveLanding(state);
  assert.equal(state.players[0]!.gold, 20);
  assert.equal(state.players[1]!.gold, STARTING_GOLD);
  assert.equal(state.turnPhase, "paymentRequired");
});

test("declining starts an auction and the last bidder wins at the authoritative bid", () => {
  const state = stateOn(1);
  economy.resolveLanding(state);
  economy.declineCurrentTile(state, "p1");
  economy.bid(state, "p2", 50);
  economy.withdraw(state, "p1");
  assert.equal(state.turnPhase, "waitingForEndTurn");
  assert.equal(state.players[1]!.gold, 1450);
  assert.equal(state.propertyOwnerships[0]?.ownerId, "p2");
});

test("an auction with no bids leaves the field unowned", () => {
  const state = stateOn(1);
  economy.resolveLanding(state);
  economy.declineCurrentTile(state, "p1");
  economy.withdraw(state, "p1");
  economy.withdraw(state, "p2");
  assert.equal(state.turnPhase, "waitingForEndTurn");
  assert.deepEqual(state.propertyOwnerships, []);
});

test("auction bids enforce increments, funds, withdrawal and reconnect pause", () => {
  const state = stateOn(1, 40);
  economy.resolveLanding(state);
  economy.declineCurrentTile(state, "p1");
  assert.throws(() => economy.bid(state, "p1", 25 as 10), /nicht erlaubt/);
  assert.throws(() => economy.bid(state, "p1", 50), /reicht/);
  state.players[1]!.connectionState = "disconnected";
  economy.syncAuctionPause(state);
  assert.deepEqual(state.auction?.pausedForPlayerIds, ["p2"]);
  assert.throws(() => economy.bid(state, "p1", 10), /Wiederverbindung/);
  state.players[1]!.connectionState = "connected";
  economy.syncAuctionPause(state);
  economy.withdraw(state, "p1");
  assert.throws(() => economy.bid(state, "p1", 10), /nicht mehr/);
});

test("non-economic fields end without changing gold", () => {
  [2, 7, 13, 17, 20, 22, 32, 33, 36].forEach((tileIndex) => {
    const state = stateOn(tileIndex);
    economy.resolveLanding(state);
    assert.equal(state.players[0]!.gold, STARTING_GOLD);
    assert.equal(state.turnPhase, "waitingForEndTurn");
  });
});
