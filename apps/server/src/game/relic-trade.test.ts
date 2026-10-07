import assert from "node:assert/strict";
import test from "node:test";
import { consumeRelic, type GameState, type RelicId, type TradeAssets } from "@valenor/shared";
import { TradeService } from "./trade-service";
import { activateRelic } from "./chronicle-event-service";

function game(): GameState {
  return {
    roomId:"VAL-RELIC-TRADE",status:"playing",config:{mode:"chronicles"},
    players:["p1","p2"].map(id=>({id,name:id,type:"human",color:"violet",connectionState:"connected",gold:1500,position:0,isBankrupt:false,dungeon:{inDungeon:false,failedAttempts:0},relics:[],armedRelics:[]})),
    turnOrder:["p1","p2"],orderRolls:[],orderContenders:[],orderRollTargetCount:1,currentPlayerId:"p1",currentTurnIndex:0,currentRound:1,turnNumber:1,turnPhase:"waitingForRoll",
    turnContext:{consecutiveDoubles:0,pendingExtraRoll:false,rollSequence:0},propertyOwnerships:[],buildingBank:{settlementUnitsAvailable:32,grandStructuresAvailable:12},economyLog:[],trades:[],startedAt:1
  };
}
const assets = (relicIds: RelicId[] = [], gold = 0): TradeAssets => ({gold,propertyTileIndices:[],relicIds});
const service = new TradeService();
const create = (state: GameState, offered: RelicId[] = ["runestone"], requested: RelicId[] = []) => service.create(state,"p1",{recipientId:"p2",offer:assets(offered),request:assets(requested)});

test("an inactive relic alone is a valid offer and transfers without activation", () => {
  const state = game(); state.players[0]!.relics = ["runestone"];
  const trade = create(state); service.accept(state,"p2",trade.id);
  assert.deepEqual(state.players[0]!.relics,[]); assert.deepEqual(state.players[1]!.relics,["runestone"]);
  assert.deepEqual(state.players[1]!.armedRelics,[]); assert.equal(trade.status,"accepted");
  assert.throws(()=>service.accept(state,"p2",trade.id)); assert.deepEqual(state.players[1]!.relics,["runestone"]);
});

test("armed relics and a runestone bound to the current roll cannot be offered or requested", () => {
  for (const id of ["merchant-seal","dungeon-amulet","golden-feather"] as const) {
    const state = game(); state.players[0]!.relics = [id]; activateRelic(state,"p1",id);
    assert.throws(()=>create(state,[id]),/Aktive/);
    state.players[0]!.relics = []; state.players[0]!.armedRelics = [];
    state.players[1]!.relics = [id]; activateRelic(state,"p2",id); assert.throws(()=>create(state,[],[id]),/Aktive/);
    assert.equal(state.trades.length,0);
  }
  const rune = game(); rune.players[0]!.relics = ["runestone"]; rune.turnContext.awaitingRuneStoneDecision = true;
  assert.throws(()=>create(rune),/gebundene/);
});

test("foreign, unknown and duplicate relics are rejected without mutating the game", () => {
  const state = game(); state.players[0]!.relics = ["runestone"];
  for (const ids of [["golden-feather"],["missing"],["runestone","runestone"]]) {
    const before = JSON.stringify(state); assert.throws(()=>create(state,ids as RelicId[])); assert.equal(JSON.stringify(state),before);
  }
});

test("a consumed or newly activated relic invalidates an offer at acceptance atomically", () => {
  for (const change of ["consumed","activated"]) {
    const state = game(); state.players[0]!.relics = ["merchant-seal"]; state.propertyOwnerships = [{tileIndex:1,ownerId:"p1",buildingLevel:0,mortgaged:false}];
    const trade = service.create(state,"p1",{recipientId:"p2",offer:{...assets(["merchant-seal"],100),propertyTileIndices:[1]},request:assets([],200)});
    if (change === "consumed") consumeRelic(state.players[0]!,"merchant-seal"); else activateRelic(state,"p1","merchant-seal");
    const players = structuredClone(state.players), ownerships = structuredClone(state.propertyOwnerships);
    assert.throws(()=>service.accept(state,"p2",trade.id),/nicht mehr gültig/);
    assert.deepEqual(state.players,players); assert.deepEqual(state.propertyOwnerships,ownerships); assert.equal(trade.status,"cancelled");
  }
});

test("two full inventories can exchange one relic each and retain their own activation states", () => {
  const state = game(); state.players[0]!.relics = ["runestone","merchant-seal"]; state.players[1]!.relics = ["golden-feather","dungeon-amulet"];
  activateRelic(state,"p1","merchant-seal"); activateRelic(state,"p2","dungeon-amulet");
  const trade = create(state,["runestone"],["golden-feather"]); service.accept(state,"p2",trade.id);
  assert.deepEqual(state.players[0]!.relics,["merchant-seal","golden-feather"]); assert.deepEqual(state.players[1]!.relics,["dungeon-amulet","runestone"]);
  assert.deepEqual(state.players[0]!.armedRelics,["merchant-seal"]); assert.deepEqual(state.players[1]!.armedRelics,["dungeon-amulet"]);
});

test("both final inventories enforce the two-slot cap at creation and acceptance", () => {
  const state = game(); state.players[0]!.relics = ["runestone"]; state.players[1]!.relics = ["merchant-seal","golden-feather"];
  assert.throws(()=>create(state),/höchstens zwei/);
  state.players[1]!.relics = ["merchant-seal"]; const trade = create(state);
  state.players[1]!.relics!.push("golden-feather"); const before = structuredClone(state.players);
  assert.throws(()=>service.accept(state,"p2",trade.id),/höchstens zwei/); assert.deepEqual(state.players,before);
  const reverse = game(); reverse.players[0]!.relics = ["runestone","merchant-seal"]; reverse.players[1]!.relics = ["golden-feather"];
  assert.throws(()=>create(reverse,[],["golden-feather"]),/höchstens zwei/);
});

test("receiving a duplicate retained relic is invalid, while swapping the same owned relic is valid", () => {
  const state = game(); state.players[0]!.relics = ["runestone"]; state.players[1]!.relics = ["runestone"];
  assert.throws(()=>create(state),/doppelt/);
  const trade = create(state,["runestone"],["runestone"]); service.accept(state,"p2",trade.id);
  assert.deepEqual(state.players.map(player=>player.relics),[["runestone"],["runestone"]]);
});

test("rejecting or cancelling a trade leaves every relic untouched", () => {
  for (const cancel of [false,true]) {
    const state = game(); state.players[0]!.relics = ["runestone"];
    const trade = create(state), before = structuredClone(state.players);
    if (cancel) service.cancel(state,"p1",trade.id); else service.reject(state,"p2",trade.id);
    assert.deepEqual(state.players,before); assert.equal(trade.status,cancel?"cancelled":"rejected");
  }
});
