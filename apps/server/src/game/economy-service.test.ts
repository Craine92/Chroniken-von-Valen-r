import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_TILES, CHRONICLE_EVENTS, REST_TILE_INDEX, STARTING_GOLD, type GameState } from "@valenor/shared";
import { EconomyService, chooseNpcTavernAction } from "./economy-service";
import { MortgageService } from "./mortgage-service";

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
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], weltenwegPot: 0, startedAt: 1
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
  assert.deepEqual(poor.pendingPayment, { payerId: "p1", amount: 200, reason: "Kronenzoll", creditorType: "bank", reasonType: "tax", weltenwegPotContribution: true });
});

for (const [tileIndex, amount] of [[4, 200], [38, 100]] as const) {
  test(`${BOARD_TILES[tileIndex]!.name} adds its actual payment to the shared pot exactly once`, () => {
    const state = stateOn(tileIndex); state.weltenwegPot = 300;
    economy.resolveLanding(state);
    assert.equal(state.players[0]!.gold, STARTING_GOLD - amount);
    assert.equal(state.weltenwegPot, 300 + amount);
    assert.match(state.economyLog.at(-1)!.message, new RegExp(`Weltenweg-Pott steigt auf ${300 + amount} Gold`));
    state.turnPhase = "landed"; economy.resolveLanding(state);
    assert.equal(state.weltenwegPot, 300 + amount);
    assert.equal(state.players[0]!.gold, STARTING_GOLD - amount);
  });
}

test("pending field taxes fund the pot only after settlement, including mortgage funding and retries", () => {
  for (const [tileIndex, amount, gold] of [[4, 200, 150], [38, 100, 20]] as const) {
    const state = stateOn(tileIndex, gold); state.weltenwegPot = 70;
    state.propertyOwnerships = [{ tileIndex: 39, ownerId: "p1", mortgaged: false, buildingLevel: 0 }];
    economy.resolveLanding(state);
    assert.equal(state.turnPhase, "paymentRequired");
    assert.equal(state.pendingPayment?.amount, amount);
    assert.equal(state.weltenwegPot, 70);
    assert.throws(() => economy.settlePendingPayment(state, "p1"), /reicht/);
    assert.throws(() => economy.settlePendingPayment(state, "p2"), /anderen/);
    assert.equal(state.weltenwegPot, 70);
    new MortgageService().mortgage(state, "p1", 39);
    const fundedGold = state.players[0]!.gold;
    assert.equal(state.weltenwegPot, 70);
    economy.settlePendingPayment(state, "p1");
    assert.equal(state.players[0]!.gold, fundedGold - amount);
    assert.equal(state.weltenwegPot, 70 + amount);
    assert.equal(state.pendingPayment, undefined);
    assert.throws(() => economy.settlePendingPayment(state, "p1"), /keine offene/);
    state.turnPhase = "landed"; economy.resolveLanding(state);
    assert.equal(state.weltenwegPot, 70 + amount);
    assert.equal(state.players[0]!.gold, fundedGold - amount);
  }
});

test("normal tavern landing asks before paying the full pot and never repeats that movement", () => {
  const state = stateOn(REST_TILE_INDEX); state.weltenwegPot = 500;
  economy.resolveLanding(state);
  assert.equal(state.turnPhase,"tavernDecision");assert.equal(state.players[0]!.gold,STARTING_GOLD);assert.equal(state.weltenwegPot,500);
  economy.chooseTavern(state,"p1","take");
  assert.equal(state.players[0]!.gold, STARTING_GOLD + 500);
  assert.equal(state.weltenwegPot, 0);
  const win = state.economyLog.at(-1)!;
  assert.equal(win.kind, "tavern"); assert.equal(win.amount, 500);
  assert.deepEqual(win.playerIds, ["p1"]); assert.match(win.message, /nimmt 500 Gold/);
  // A replay must not claim money paid into the pot since the original win.
  state.weltenwegPot = 100; state.turnPhase = "landed"; economy.resolveLanding(state);
  assert.equal(state.players[0]!.gold, STARTING_GOLD + 500);
  assert.equal(state.weltenwegPot, 100);
  assert.equal(state.economyLog.filter(entry => entry.kind === "tavern").length, 1);
});

test("an empty tavern never creates gold or a winning log", () => {
  const state = stateOn(REST_TILE_INDEX); economy.resolveLanding(state);
  assert.equal(state.players[0]!.gold, STARTING_GOLD);
  assert.equal(state.weltenwegPot, 0);
  assert.equal(state.economyLog.filter(entry => entry.kind === "tavern").length, 0);
  assert.equal(state.tavern,undefined);assert.equal(state.turnPhase,"waitingForEndTurn");
});

test("passing the tavern or landing there through a card does not claim the pot", () => {
  const passing = stateOn(REST_TILE_INDEX + 1); passing.weltenwegPot = 500;
  passing.lastMovement = { ...passing.lastMovement!, from: REST_TILE_INDEX - 1, path: [REST_TILE_INDEX, REST_TILE_INDEX + 1] };
  const card = stateOn(REST_TILE_INDEX); card.weltenwegPot = 500; card.lastMovement!.kind = "card";
  for (const state of [passing, card]) {
    economy.resolveLanding(state);
    assert.equal(state.players[0]!.gold, STARTING_GOLD);
    assert.equal(state.weltenwegPot, 500);
    assert.equal(state.economyLog.filter(entry => entry.kind === "tavern").length, 0);
  }
});

test("card and dungeon-release bank payments do not contribute to the field-tax pot", () => {
  for (const reasonType of ["card", "cardRepair", "dungeonRelease"] as const) {
    const state = stateOn(4); state.turnPhase = "paymentRequired"; state.weltenwegPot = 300;
    state.pendingPayment = { payerId: "p1", amount: 100, reason: "Gebühr", creditorType: "bank", reasonType };
    economy.settlePendingPayment(state, "p1");
    assert.equal(state.players[0]!.gold, STARTING_GOLD - 100);
    assert.equal(state.weltenwegPot, 300);
  }
});

test("every chronicle leaves field taxes and the tavern jackpot unchanged", () => {
  for (const event of CHRONICLE_EVENTS) {
    const state = stateOn(4); state.currentRound = 4; state.weltenwegPot = 300;
    state.activeChronicleEvent = { ...event, startedAfterRound: 3, startedAtRound: 4, expiresAtRound: 6, startedAt: 1 };
    economy.resolveLanding(state);
    assert.equal(state.weltenwegPot, 500);
    assert.equal(state.players[0]!.gold, STARTING_GOLD - 200);
    state.lastMovement = { kind: "normal", sequence: 2, playerId: "p1", from: REST_TILE_INDEX - 1,
      to: REST_TILE_INDEX, path: [REST_TILE_INDEX], passedStart: false, landedTile: BOARD_TILES[REST_TILE_INDEX]! };
    state.players[0]!.position=REST_TILE_INDEX;
    state.turnPhase = "landed"; economy.resolveLanding(state);
    economy.chooseTavern(state,"p1","take");
    assert.equal(state.weltenwegPot, 0);
    assert.equal(state.players[0]!.gold, STARTING_GOLD + 300);
  }
});

test("the six independent tavern outcomes pay twice on 4–6 and preserve the pot on 1–3",()=>{
  for(const die of [1,2,3,4,5,6]){
    const state=stateOn(REST_TILE_INDEX);state.weltenwegPot=400;state.players[0]!.relics=['runestone'];
    state.turnContext.consecutiveDoubles=1;state.turnContext.pendingExtraRoll=true;
    const dice=structuredClone(state.lastDiceRoll),movement=structuredClone(state.lastMovement),context=structuredClone(state.turnContext),dungeon=structuredClone(state.players[0]!.dungeon);
    economy.resolveLanding(state);economy.chooseTavern(state,'p1','gamble');assert.equal(state.turnPhase,'tavernRolling');
    let calls=0;economy.resolveTavernGamble(state,()=>{calls++;return die;});assert.equal(calls,1);
    assert.equal(state.tavern!.die,die);assert.equal(state.tavern!.payout,die>=4?800:0);assert.equal(state.weltenwegPot,die>=4?0:400);
    assert.equal(state.players[0]!.gold,STARTING_GOLD+(die>=4?800:0));assert.equal(state.players[0]!.position,20);
    assert.deepEqual(state.lastDiceRoll,dice);assert.deepEqual(state.lastMovement,movement);assert.deepEqual(state.turnContext,context);assert.deepEqual(state.players[0]!.dungeon,dungeon);assert.deepEqual(state.players[0]!.relics,['runestone']);
    assert.equal(state.economyLog.filter(entry=>entry.kind==='quest').length,0);assert.equal(state.turnPhase,'waitingForEndTurn');
    assert.throws(()=>economy.resolveTavernGamble(state,()=>{calls++;return die;}));assert.equal(calls,1);
    assert.throws(()=>economy.chooseTavern(state,'p1','take'));assert.equal(state.economyLog.filter(entry=>entry.kind==='tavern').length,1);
  }
});

test("tavern choices reject foreign actors, disconnected players and invalid dice without changing gold",()=>{
  const state=stateOn(REST_TILE_INDEX);state.weltenwegPot=400;economy.resolveLanding(state);
  const before=JSON.stringify(state);assert.throws(()=>economy.chooseTavern(state,'p2','take'));assert.equal(JSON.stringify(state),before);
  assert.throws(()=>economy.chooseTavern(state,'p1','invalid' as never));assert.equal(JSON.stringify(state),before);
  state.players[0]!.connectionState='disconnected';assert.throws(()=>economy.chooseTavern(state,'p1','take'));state.players[0]!.connectionState='connected';
  economy.chooseTavern(state,'p1','gamble');const rolling=JSON.stringify(state);assert.throws(()=>economy.resolveTavernGamble(state,()=>7));assert.equal(JSON.stringify(state),rolling);
});

test("NPC tavern strategy takes safely below 500 and makes one even choice at or above 500",()=>{
  assert.equal(chooseNpcTavernAction(499,()=>{assert.fail('no random choice below reserve');}),'take');
  for(const gold of [500,1500]) {assert.equal(chooseNpcTavernAction(gold,()=>0),'take');assert.equal(chooseNpcTavernAction(gold,()=>1),'gamble');}
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
