import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_TILES, QUEST_DEFINITIONS, getPropertyGroupTiles, type GameState, type QuestId } from "@valenor/shared";
import { RoomManager } from "../room-manager";
import { initializePlayerQuests, completeQuests } from "./quest-service";
import { EconomyService } from "./economy-service";
import { BuildingService } from "./building-service";
import { TradeService } from "./trade-service";
import { resolveDragonEncounter } from "./chronicle-event-service";

function game(id: QuestId, tileIndex = 1): GameState {
  const fillers = (Object.keys(QUEST_DEFINITIONS) as QuestId[]).filter(candidate => candidate !== id).slice(-2);
  return {
    roomId: "VAL-QUEST", status: "playing", config: { mode: "chronicles" },
    players: ["p1","p2"].map(playerId => ({ id: playerId, name: playerId, type: "human", color: "violet", connectionState: "connected", gold: 1500, position: tileIndex,
      isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }, relics: [], armedRelics: [],
      activeQuests: [id, ...fillers].map(questId => ({ id: questId, assignedAtTurn: 1 })) })),
    turnOrder: ["p1","p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1, currentPlayerId: "p1", currentTurnIndex: 0,
    currentRound: 1, turnNumber: 2, turnPhase: "landed", turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 1 },
    lastMovement: { kind: "normal", sequence: 1, playerId: "p1", from: 0, to: tileIndex, path: [tileIndex], passedStart: false, landedTile: BOARD_TILES[tileIndex]! },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 1
  };
}
const rewards = (state: GameState, id: QuestId) => state.economyLog.filter(entry => entry.kind === "quest" && entry.questId === id);

test("game start assigns exactly three distinct quests to every player and isolates snapshots", () => {
  const manager = new RoomManager(), { room } = manager.createRoom("host"); manager.joinRoom(room.code,"Human","s1"); manager.addComputer(room.code,"host");
  const snapshot = manager.startGame(room.code,"host");
  for (const player of snapshot.players) { assert.equal(player.activeQuests!.length,3); assert.equal(new Set(player.activeQuests!.map(quest => quest.id)).size,3); assert.ok(player.activeQuests!.every(quest => quest.assignedAtTurn === 0)); }
  snapshot.players[0]!.activeQuests![0]!.assignedAtTurn = 99; snapshot.players[0]!.activeQuests!.length = 0;
  snapshot.players[0]!.processedQuestEventIds!.push("client-only");
  const next = manager.getGameState(room.code)!; assert.equal(next.players[0]!.activeQuests!.length,3); assert.equal(next.players[0]!.activeQuests![0]!.assignedAtTurn,0);
  assert.deepEqual(next.players[0]!.processedQuestEventIds,[]);
});

test("exactly eight definitions pay the specified reward and replace completed quests without duplicates or replay", () => {
  const amounts = { traveler:100, landbuyer:100, seafarer:150, builder:125, landlord:250, dragonfriend:150, fortunehunter:200, tollpayer:100 };
  assert.equal(Object.keys(QUEST_DEFINITIONS).length,8);
  for (const id of Object.keys(amounts) as QuestId[]) {
    const state = game(id); completeQuests(state,"p1","action-1",[QUEST_DEFINITIONS[id].type],() => 0);
    assert.equal(state.players[0]!.gold,1500+amounts[id]); assert.equal(rewards(state,id)[0]!.amount,amounts[id]);
    const active = state.players[0]!.activeQuests!; assert.equal(active.length,3); assert.equal(new Set(active.map(quest => quest.id)).size,3);
    assert.ok(!active.some(quest => quest.id === id)); assert.ok(active.some(quest => quest.assignedAtTurn === 2));
    completeQuests(state,"p1","action-1",[QUEST_DEFINITIONS[id].type],() => 0); assert.equal(state.players[0]!.gold,1500+amounts[id]);
    // Even replaying an old action after a later assignment cannot pay it twice.
    active[0] = { id, assignedAtTurn:3 }; completeQuests(state,"p1","action-1",[QUEST_DEFINITIONS[id].type],() => 0);
    assert.equal(rewards(state,id).length,1);
  }
});

test("replacement quests never see the action that just assigned them", () => {
  const state = game("landbuyer"); state.players[0]!.activeQuests = ["landbuyer","landlord","tollpayer"].map(id => ({ id:id as QuestId, assignedAtTurn:1 }));
  completeQuests(state,"p1","purchase",["propertyPurchase","completeGroup"],() => 0);
  assert.equal(state.players[0]!.gold,1850); assert.equal(state.economyLog.filter(entry => entry.kind === "quest").length,2);
  assert.equal(state.players[0]!.activeQuests!.length,3);
  assert.ok(state.players[0]!.activeQuests!.every(quest => !["landbuyer","landlord"].includes(quest.id)));
});

test("quests do not retroactively count an event processed before their assignment", () => {
  const state = game("dragonfriend"); completeQuests(state,"p1","old-passage",["startPass"]);
  state.players[0]!.activeQuests![0] = { id:"traveler", assignedAtTurn:3 };
  completeQuests(state,"p1","old-passage",["startPass"]); assert.equal(state.players[0]!.gold,1500);
  completeQuests(state,"p1","new-passage",["startPass"]); assert.equal(state.players[0]!.gold,1600);
});

test("traveler completes only when the normal start reward is actually paid", () => {
  const state = game("traveler"); state.lastMovement!.passedStart = true;
  const economy = new EconomyService(); economy.awardStartPass(state); assert.equal(state.players[0]!.gold,1800); assert.equal(rewards(state,"traveler").length,1);
  economy.awardStartPass(state); assert.equal(state.players[0]!.gold,1800);
});

test("landbuyer counts only a successful direct property purchase, not harbor, utility or auction", () => {
  for (const index of [1,5,11]) {
    const state = game("landbuyer",index), economy = new EconomyService(); economy.resolveLanding(state); economy.buyCurrentTile(state,"p1");
    assert.equal(rewards(state,"landbuyer").length,index === 1 ? 1 : 0);
    assert.equal(state.players[0]!.gold,1500 - BOARD_TILES[index]!.economy!.purchasePrice! + (index === 1 ? 100 : 0));
  }
  const state = game("landbuyer"), economy = new EconomyService(); economy.resolveLanding(state); economy.declineCurrentTile(state,"p1");
  economy.bid(state,"p1",50); economy.withdraw(state,"p2"); assert.equal(rewards(state,"landbuyer").length,0);
  const failed = game("landbuyer"); economy.resolveLanding(failed); failed.players[0]!.gold = 0;
  assert.throws(() => economy.buyCurrentTile(failed,"p1")); assert.equal(rewards(failed,"landbuyer").length,0);
});

test("seafarer counts direct harbor purchases and won harbor auctions", () => {
  for (const auction of [false,true]) {
    const state = game("seafarer",5), economy = new EconomyService(); economy.resolveLanding(state);
    if (auction) { economy.declineCurrentTile(state,"p1"); economy.bid(state,"p1",50); economy.withdraw(state,"p2"); } else economy.buyCurrentTile(state,"p1");
    assert.equal(rewards(state,"seafarer").length,1); assert.equal(state.players[0]!.gold,1500-(auction?50:200)+150);
  }
});

test("builder counts a successful build and excludes sales and failed builds", () => {
  for (const sell of [false,true]) {
    const state = game("builder"); state.turnPhase = "waitingForRoll";
    state.propertyOwnerships = getPropertyGroupTiles("group_mondhain").map(tile => ({ tileIndex:tile.index, ownerId:"p1", mortgaged:false, buildingLevel:tile.index === 1 && sell ? 1 : 0 }));
    const service = new BuildingService(); if (sell) service.sell(state,"p1",1); else service.build(state,"p1",1);
    assert.equal(rewards(state,"builder").length,sell?0:1); assert.equal(state.players[0]!.gold,sell?1525:1575);
  }
  const failed = game("builder"); failed.turnPhase = "waitingForRoll"; assert.throws(() => new BuildingService().build(failed,"p1",1)); assert.equal(rewards(failed,"builder").length,0);
});

test("landlord completes groups newly acquired through purchases, auctions or trades", () => {
  for (const mode of ["purchase","auction","trade"]) {
    const state = game("landlord",3); state.propertyOwnerships = [{tileIndex:1,ownerId:"p1",buildingLevel:0,mortgaged:false}];
    if (mode === "trade") {
      state.turnPhase = "waitingForRoll"; state.propertyOwnerships.push({tileIndex:3,ownerId:"p2",buildingLevel:0,mortgaged:false});
      const trades = new TradeService(), trade = trades.create(state,"p1",{recipientId:"p2",offer:{gold:0,propertyTileIndices:[]},request:{gold:0,propertyTileIndices:[3]}}); trades.accept(state,"p2",trade.id);
    } else {
      const economy = new EconomyService(); economy.resolveLanding(state);
      if (mode === "auction") { economy.declineCurrentTile(state,"p1"); economy.bid(state,"p1",50); economy.withdraw(state,"p2"); } else economy.buyCurrentTile(state,"p1");
    }
    assert.equal(rewards(state,"landlord").length,1);
  }
  const prior = game("landlord",6); prior.propertyOwnerships = getPropertyGroupTiles("group_mondhain").map(tile=>({tileIndex:tile.index,ownerId:"p1",buildingLevel:0,mortgaged:false}));
  const economy = new EconomyService(); economy.resolveLanding(prior); economy.buyCurrentTile(prior,"p1"); assert.equal(rewards(prior,"landlord").length,0);
});

test("dragonfriend counts a full-inventory encounter exactly once without awarding a relic", () => {
  const state = game("dragonfriend",15); state.players[0]!.relics = ["runestone","golden-feather"];
  state.wanderingDragon = {tileIndex:15,nextMoveRound:3,encounterSequence:0}; resolveDragonEncounter(state,() => 0);
  assert.equal(state.players[0]!.gold,1650); assert.equal(rewards(state,"dragonfriend").length,1); assert.equal(state.players[0]!.relics!.length,2);
  resolveDragonEncounter(state,() => 0); assert.equal(state.players[0]!.gold,1650);
});

test("fortunehunter counts only an actual nonzero tavern payout", () => {
  for (const pot of [0,300]) {
    const state = game("fortunehunter",20); state.weltenwegPot = pot; const economy = new EconomyService(); economy.resolveLanding(state);
    assert.equal(rewards(state,"fortunehunter").length,0);if(pot)economy.chooseTavern(state,"p1","take");
    assert.equal(rewards(state,"fortunehunter").length,pot?1:0); assert.equal(state.players[0]!.gold,pot?2000:1500); assert.equal(state.weltenwegPot,0);
    state.turnPhase = "landed"; economy.resolveLanding(state); assert.equal(rewards(state,"fortunehunter").length,pot?1:0);
  }
});

test("tollpayer rewards only paid crown tax or dragon tithe, including settled pending payments", () => {
  for (const index of [4,38]) {
    const state = game("tollpayer",index), economy = new EconomyService(); economy.resolveLanding(state);
    assert.equal(rewards(state,"tollpayer").length,1); assert.equal(state.players[0]!.gold,index === 4 ? 1400 : 1500);
  }
  const pending = game("tollpayer",4), economy = new EconomyService(); pending.players[0]!.gold = 100; economy.resolveLanding(pending);
  assert.equal(pending.turnPhase,"paymentRequired"); assert.equal(rewards(pending,"tollpayer").length,0);
  pending.players[0]!.gold = 200; economy.settlePendingPayment(pending,"p1"); assert.equal(pending.players[0]!.gold,100); assert.equal(rewards(pending,"tollpayer").length,1);
  assert.throws(() => economy.settlePendingPayment(pending,"p1")); assert.equal(rewards(pending,"tollpayer").length,1);
  const other = game("tollpayer"); other.turnPhase = "paymentRequired";
  other.pendingPayment = {payerId:"p1",creditorType:"bank",reasonType:"dungeonRelease",amount:50,reason:"Kerkergebühr"}; economy.settlePendingPayment(other,"p1");
  assert.equal(rewards(other,"tollpayer").length,0);
});

test("deterministic assignment draws three distinct definitions without using existing ownership", () => {
  const state = game("seafarer"); state.propertyOwnerships = [{tileIndex:5,ownerId:"p1",buildingLevel:0,mortgaged:false}];
  initializePlayerQuests(state,() => 0); assert.deepEqual(state.players[0]!.activeQuests!.map(quest => quest.id),["traveler","landbuyer","seafarer"]);
  assert.equal(state.players[0]!.gold,1500); assert.equal(state.economyLog.length,0);
});
