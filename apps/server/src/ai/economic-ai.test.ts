import assert from "node:assert/strict";
import test from "node:test";
import { type GameState, type TradeAssets, type CreateTradeOfferRequest } from "@valenor/shared";
import { TradeService } from "../game/trade-service";
import { EconomicAi, AI_RELIC_TRADE_VALUES, AI_DUNGEON_CARD_TRADE_VALUE } from "./economic-ai";

const ai=new EconomicAi(),trades=new TradeService();
function game(): GameState {
  return {roomId:'NPC-TRADE',status:'playing',config:{mode:'chronicles'},
    players:['human','npc','other'].map((id,index)=>({id,name:id,type:index===1?'computer':'human',color:'violet',characterId: "elvenSpellweaver" as const, connectionState:index===1?'disconnected':'connected',gold:1500,position:0,isBankrupt:false,dungeon:{inDungeon:false,failedAttempts:0},heldCards:[],relics:[],armedRelics:[]})),
    turnOrder:['human','npc','other'],orderRolls:[],orderContenders:[],orderRollTargetCount:1,currentPlayerId:'human',currentTurnIndex:0,currentRound:4,turnNumber:10,turnPhase:'waitingForRoll',
    turnContext:{consecutiveDoubles:0,pendingExtraRoll:false,rollSequence:0},propertyOwnerships:[],buildingBank:{settlementUnitsAvailable:32,grandStructuresAvailable:12},economyLog:[],trades:[],startedAt:1};
}
const assets=(gold=0,propertyTileIndices:number[]=[]):TradeAssets=>({gold,propertyTileIndices});
const offer=(state:GameState,incoming:TradeAssets,outgoing:TradeAssets)=>trades.create(state,'human',{recipientId:'npc',offer:incoming,request:outgoing});
const own=(state:GameState,id:string,indices:number[])=>{state.propertyOwnerships.push(...indices.map(tileIndex=>({tileIndex,ownerId:id,mortgaged:false,buildingLevel:0 as const})));};

test('human, NPC and human trades work; only human connections are required',()=>{
  for(const [from,to] of [['human','other'],['human','npc'],['npc','human']]){
    const state=game(),trade=trades.create(state,from!,{recipientId:to!,offer:assets(100),request:assets(80)});
    trades.accept(state,to!,trade.id);assert.equal(trade.status,'accepted');
    assert.equal(state.players.find(p=>p.id===from)!.gold,1480);assert.equal(state.players.find(p=>p.id===to)!.gold,1520);
  }
  const state=game();state.players[0]!.connectionState='disconnected';assert.throws(()=>offer(state,assets(100),assets()),/verbunden/);
  state.players[0]!.connectionState='connected';state.players[2]!.type='computer';
  assert.throws(()=>trades.create(state,'npc',{recipientId:'other',offer:assets(100),request:assets()}),/nur mit Menschen/);
});

test('NPC trades preserve property, building, card and relic rules without partial mutation',()=>{
  const changes:((state:GameState,request:CreateTradeOfferRequest)=>void)[]=[
    (_,r)=>{r.request.propertyTileIndices=[1];},
    (s,r)=>{own(s,'npc',[1]);s.propertyOwnerships[0]!.buildingLevel=1;r.request.propertyTileIndices=[1];},
    (_,r)=>{r.request.cardIds=['fate_024'];},
    (s,r)=>{s.players[1]!.heldCards=[{cardId:'fate_001',deck:'fate'}];r.request.cardIds=['fate_001'];},
    (s,r)=>{s.players[1]!.relics=['golden-feather'];s.players[1]!.armedRelics=['golden-feather'];r.request.relicIds=['golden-feather'];},
    (s,r)=>{s.players[0]!.relics=['golden-feather'];s.players[1]!.relics=['runestone','merchant-seal'];r.offer.relicIds=['golden-feather'];},
    (_,r)=>{r.request.gold=2000;}
  ];
  for(const change of changes){const state=game(),request={recipientId:'npc',offer:assets(100),request:assets()};change(state,request);const before=JSON.stringify(state);assert.throws(()=>trades.create(state,'human',request));assert.equal(JSON.stringify(state),before);}
  const state=game();own(state,'npc',[1]);const trade=offer(state,assets(100),assets(0,[1]));state.propertyOwnerships[0]!.ownerId='other';
  assert.equal(ai.decideTradeResponse(state,'npc',trade).type,'reject');assert.throws(()=>trades.accept(state,'npc',trade.id),/nicht mehr gültig/);
  assert.equal(trade.status,'cancelled');assert.equal(state.players[0]!.gold,1500);assert.equal(state.propertyOwnerships[0]!.ownerId,'other');
});

test('fair trades accept, poor trades reject and close trades counter deterministically',()=>{
  for(const [incoming,outgoing,expected] of [[100,100,'accept'],[95,100,'accept'],[60,100,'reject'],[80,100,'counter']] as const){
    const state=game(),trade=offer(state,assets(incoming),assets(outgoing)),before=JSON.stringify(state);
    const decision=ai.decideTradeResponse(state,'npc',trade);assert.equal(decision.type,expected);assert.deepEqual(ai.decideTradeResponse(state,'npc',trade),decision);assert.equal(JSON.stringify(state),before);
    if(decision.type==='counter') {assert.equal(decision.request.offer.gold,80);assert.equal(decision.request.request.gold,80);assert.equal(decision.request.counterToTradeId,trade.id);}
  }
});

test('counter preserves property/cards/relics and balances through gold before using the existing atomic creation',()=>{
  const state=game();own(state,'npc',[1]);state.players[0]!.heldCards=[{cardId:'adv_024',deck:'adventure'}];state.players[1]!.relics=['merchant-seal'];
  const trade=offer(state,{...assets(80),cardIds:['adv_024']},{...assets(0,[1]),relicIds:['merchant-seal']});
  const decision=ai.decideTradeResponse(state,'npc',trade);assert.equal(decision.type,'counter');if(decision.type!=='counter')return;
  assert.deepEqual(decision.request.offer.propertyTileIndices,[1]);assert.deepEqual(decision.request.offer.relicIds,['merchant-seal']);assert.deepEqual(decision.request.request.cardIds,['adv_024']);assert.equal(decision.request.request.gold,125);
  const counter=trades.create(state,'npc',decision.request);assert.equal(trade.status,'countered');assert.equal(counter.status,'pending');assert.equal(counter.recipientId,'human');
  trades.accept(state,'human',counter.id);assert.equal(state.propertyOwnerships[0]!.ownerId,'human');assert.deepEqual(state.players[0]!.relics,['merchant-seal']);assert.deepEqual(state.players[1]!.heldCards,[{cardId:'adv_024',deck:'adventure'}]);
});

test('reserve, locked complete groups and unaffordable gold counters reject',()=>{
  let state=game();state.players[1]!.gold=200;assert.equal(ai.decideTradeResponse(state,'npc',offer(state,assets(95),assets(100))).type,'reject');
  state=game();own(state,'npc',[1,3]);assert.equal(ai.decideTradeResponse(state,'npc',offer(state,assets(1000),assets(0,[1]))).type,'reject');
  state=game();own(state,'npc',[1]);state.players[0]!.gold=45;assert.equal(ai.decideTradeResponse(state,'npc',offer(state,assets(45),assets(0,[1]))).type,'reject');
});

test('property valuations account for partial and complete groups, mortgages, harbor and utility synergy',()=>{
  const state=game();assert.equal(ai.evaluatePropertyForPlayer(state,'npc',1),60);own(state,'npc',[3]);assert.equal(ai.evaluatePropertyForPlayer(state,'npc',1),114);
  own(state,'npc',[6]);assert.equal(ai.evaluatePropertyForPlayer(state,'npc',8),135);own(state,'npc',[9]);assert.equal(ai.evaluatePropertyForPlayer(state,'npc',8),190);
  own(state,'human',[1]);state.propertyOwnerships.at(-1)!.mortgaged=true;assert.equal(ai.evaluatePropertyForPlayer(state,'npc',1),51);
  own(state,'npc',[15,28]);assert.equal(ai.evaluatePropertyForPlayer(state,'npc',5),236);assert.equal(ai.evaluatePropertyForPlayer(state,'npc',11),177);
});

test('outgoing property completing the human group demands a strategic premium',()=>{
  const state=game();own(state,'npc',[1]);const trade=offer(state,assets(80),assets(0,[1]));assert.equal(ai.evaluateTrade(state,'npc',trade).givenValue,60);
  own(state,'human',[3]);assert.equal(ai.evaluateTrade(state,'npc',trade).givenValue,99);assert.equal(ai.decideTradeResponse(state,'npc',trade).type,'counter');
});

test('package valuation uses final ownership so giving away a group member does not claim false completion',()=>{
  const state=game();own(state,'npc',[6]);own(state,'human',[8,9]);const trade=offer(state,assets(0,[8,9]),assets(0,[6]));
  assert.equal(ai.evaluateTrade(state,'npc',trade).receivedValue,297); // 135% of 100 + 120, not 190%.
});

test('central fixed values cover all relics, held cards and gold',()=>{
  const state=game();for(const [id,value] of Object.entries(AI_RELIC_TRADE_VALUES))assert.equal(ai.evaluateTradeAssets(state,'npc',{...assets(),relicIds:[id as keyof typeof AI_RELIC_TRADE_VALUES]}),value);
  assert.equal(ai.evaluateTradeAssets(state,'npc',{...assets(25),cardIds:['adv_024']}),25+AI_DUNGEON_CARD_TRADE_VALUE);
});

test('a re-countered negotiation only accepts or rejects and never produces another NPC counter',()=>{
  const state=game(),original=offer(state,assets(80),assets(100)),decision=ai.decideTradeResponse(state,'npc',original);assert.equal(decision.type,'counter');if(decision.type!=='counter')return;
  const counter=trades.create(state,'npc',decision.request);
  const humanCounter=trades.create(state,'human',{recipientId:'npc',counterToTradeId:counter.id,offer:assets(80),request:assets(100)});
  assert.equal(ai.decideTradeResponse(state,'npc',humanCounter).type,'reject');
  humanCounter.offer.gold=100;assert.equal(ai.decideTradeResponse(state,'npc',humanCounter).type,'accept');
});

function proposalFixture(){const state=game();state.currentPlayerId='npc';state.turnPhase='waitingForEndTurn';own(state,'npc',[6,8]);own(state,'human',[9]);return state;}

test('initiative offers rounded gold for the human-owned final group member and selects the highest potential group',()=>{
  const state=proposalFixture();let request=ai.findTradeProposal(state,'npc')!;
  assert.equal(request.recipientId,'human');assert.deepEqual(request.request,assets(0,[9]));assert.equal(request.offer.gold,130);assert.equal(request.offer.gold%10,0);assert.ok(state.players[1]!.gold-request.offer.gold>=200);
  own(state,'npc',[37]);own(state,'other',[39]);request=ai.findTradeProposal(state,'npc')!;assert.equal(request.recipientId,'other');assert.deepEqual(request.request.propertyTileIndices,[39]);assert.equal(request.offer.gold,440);
  const trade=trades.create(state,'npc',request);assert.equal(trade.status,'pending');assert.match(state.economyLog.at(-1)!.message,/440 Gold/);
});

test('initiative is suppressed for buildings, insufficient funds, inactive/disconnected humans, NPC owners and pending offers',()=>{
  const changes:((state:GameState)=>void)[]=[
    s=>{s.propertyOwnerships[0]!.buildingLevel=1;},s=>{s.players[1]!.gold=329;},s=>{s.players[0]!.isBankrupt=true;},s=>{s.players[0]!.connectionState='disconnected';},
    s=>{s.players[0]!.type='computer';},s=>{s.players[1]!.isBankrupt=true;},s=>{s.turnPhase='waitingForRoll';},s=>{s.currentPlayerId='human';},
    s=>{s.turnPhase='paymentRequired';},s=>{trades.create(s,'npc',{recipientId:'human',offer:assets(10),request:assets()});}
  ];
  for(const change of changes){const state=proposalFixture();change(state);assert.equal(ai.findTradeProposal(state,'npc'),undefined);}
});

test('initiative cooldown lasts three rounds even after an offer is rejected',()=>{
  const state=proposalFixture(),request=ai.findTradeProposal(state,'npc')!,trade=trades.create(state,'npc',request),last=state.currentRound;
  assert.equal(ai.findTradeProposal(state,'npc',last),undefined);trades.reject(state,'human',trade.id);
  for(const round of [last,last+1,last+2]){state.currentRound=round;assert.equal(ai.findTradeProposal(state,'npc',last),undefined);}
  state.currentRound=last+3;assert.ok(ai.findTradeProposal(state,'npc',last));
});

test('a stale NPC proposal cannot transfer gold below the reserve at human acceptance',()=>{
  const state=proposalFixture(),request=ai.findTradeProposal(state,'npc')!,trade=trades.create(state,'npc',request);
  state.players[1]!.gold=329;const before=structuredClone(state.propertyOwnerships);
  assert.throws(()=>trades.accept(state,'human',trade.id),/Goldreserve/);
  assert.equal(trade.status,'cancelled');assert.equal(state.players[1]!.gold,329);assert.deepEqual(state.propertyOwnerships,before);
  const updated=game();own(updated,'npc',[1]);own(updated,'human',[3]);
  const counter=trades.create(updated,'npc',{recipientId:'human',offer:assets(0,[1]),request:assets(100)});
  updated.propertyOwnerships[1]!.ownerId='npc';
  assert.throws(()=>trades.accept(updated,'human',counter.id),/vollständige eigene Baugruppe/);
  assert.equal(counter.status,'cancelled');assert.ok(updated.propertyOwnerships.every(entry=>entry.ownerId==='npc'));
});
