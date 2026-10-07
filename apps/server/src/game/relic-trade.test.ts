import assert from "node:assert/strict";
import test from "node:test";
import { consumeRelic, type GameState, type RelicId, type TradeAssets } from "@valenor/shared";
import { TradeService } from "./trade-service";
import { activateRelic } from "./chronicle-event-service";

function game(): GameState {
  return {
    roomId:"VAL-RELIC-TRADE",status:"playing",config:{mode:"chronicles"},
    players:["p1","p2"].map(id=>({id,name:id,type:"human",color:"violet",characterId: "elvenSpellweaver" as const, connectionState:"connected",gold:1500,position:0,isBankrupt:false,dungeon:{inDungeon:false,failedAttempts:0},relics:[],armedRelics:[]})),
    turnOrder:["p1","p2"],orderRolls:[],orderContenders:[],orderRollTargetCount:1,currentPlayerId:"p1",currentTurnIndex:0,currentRound:1,turnNumber:1,turnPhase:"waitingForRoll",
    turnContext:{consecutiveDoubles:0,pendingExtraRoll:false,rollSequence:0},propertyOwnerships:[],buildingBank:{settlementUnitsAvailable:32,grandStructuresAvailable:12},economyLog:[],trades:[],startedAt:1
  };
}
const assets = (relicIds: RelicId[] = [], gold = 0): TradeAssets => ({gold,propertyTileIndices:[],relicIds});
const service = new TradeService();
const create = (state: GameState, offered: RelicId[] = ["runestone"], requested: RelicId[] = []) => service.create(state,"p1",{recipientId:"p2",offer:assets(offered),request:assets(requested)});

function counterFixture() {
  const state=game();
  state.players[0]!.relics=['runestone']; state.players[1]!.relics=['golden-feather'];
  state.players[0]!.heldCards=[{cardId:'adv_024',deck:'adventure'}]; state.players[1]!.heldCards=[{cardId:'fate_024',deck:'fate'}];
  state.propertyOwnerships=[{tileIndex:1,ownerId:'p1',buildingLevel:0,mortgaged:false},{tileIndex:3,ownerId:'p2',buildingLevel:0,mortgaged:false}];
  const original=service.create(state,'p1',{recipientId:'p2',offer:{...assets(['runestone'],300),propertyTileIndices:[1],cardIds:['adv_024']},request:{...assets(['golden-feather'],50),propertyTileIndices:[3],cardIds:['fate_024']}});
  const request={recipientId:'p1',counterToTradeId:original.id,offer:structuredClone(original.request),request:structuredClone(original.offer)};
  return {state,original,request};
}

test('counter offers replace the original atomically and transfer all asset types with edited gold',()=>{
  const {state,original,request}=counterFixture(); request.request.gold=250;
  const counter=service.create(state,'p2',request);
  assert.equal(original.status,'countered'); assert.equal(counter.status,'pending'); assert.equal(counter.counterToTradeId,original.id);
  assert.equal(counter.proposerId,'p2'); assert.equal(counter.recipientId,'p1');
  assert.deepEqual(counter.offer,original.request); assert.equal(counter.request.gold,250);
  assert.equal(state.trades.filter(t=>t.status==='pending').length,1);
  assert.throws(()=>service.accept(state,'p2',original.id)); assert.throws(()=>service.create(state,'p2',request));
  service.accept(state,'p1',counter.id);
  assert.deepEqual(state.players.map(p=>p.gold),[1300,1700]);
  assert.deepEqual(state.players.map(p=>p.relics),[['golden-feather'],['runestone']]);
  assert.deepEqual(state.players.map(p=>p.heldCards?.[0]?.cardId),['fate_024','adv_024']);
  assert.deepEqual(state.propertyOwnerships.map(p=>p.ownerId),['p2','p1']);
});

test('each invalid counter leaves the original and the entire state unchanged',()=>{
  const mutations: ((fixture:ReturnType<typeof counterFixture>)=>void)[]=[
    f=>{f.request.counterToTradeId='missing';},
    f=>{f.original.status='rejected';},
    f=>{f.request.recipientId='p2';},
    f=>{f.request.offer.gold=9999;},
    f=>{f.request.offer.propertyTileIndices=[1];},
    f=>{f.state.propertyOwnerships[0]!.buildingLevel=1;},
    f=>{f.state.players[1]!.heldCards=[];},
    f=>{f.state.players[1]!.relics=[];},
    f=>{f.state.players[1]!.armedRelics=['golden-feather'];},
    f=>{f.state.players[1]!.relics=['golden-feather','merchant-seal']; f.request.offer.relicIds=[];},
    f=>{f.request.offer.relicIds=['golden-feather','golden-feather'];}
  ];
  for(const change of mutations){
    const fixture=counterFixture(); change(fixture); const before=JSON.stringify(fixture.state);
    assert.throws(()=>service.create(fixture.state,'p2',fixture.request)); assert.equal(JSON.stringify(fixture.state),before);
  }
  const fixture=counterFixture(), before=JSON.stringify(fixture.state);
  assert.throws(()=>service.create(fixture.state,'stranger',fixture.request)); assert.equal(JSON.stringify(fixture.state),before);
});

test('a counter to a counter has one pending version and can still be rejected',()=>{
  const {state,request}=counterFixture(); const counter=service.create(state,'p2',request);
  const next=service.create(state,'p1',{recipientId:'p2',counterToTradeId:counter.id,offer:counter.request,request:counter.offer});
  assert.equal(counter.status,'countered'); assert.equal(state.trades.filter(t=>t.status==='pending').length,1);
  service.reject(state,'p2',next.id); assert.equal(next.status,'rejected');
});

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
