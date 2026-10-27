import assert from "node:assert/strict";
import test from "node:test";
import { getQuickTradeTerms, type GameState } from "@valenor/shared";
import { TradeService } from "../game/trade-service";
import { AI_QUICK_SELL_GOLD_CUSHION, EconomicAi } from "./economic-ai";

const ai = new EconomicAi(), trades = new TradeService();
function game(): GameState {
  return {roomId:'NPC-QUICK',status:'playing',config:{mode:'chronicles',aiDifficulty:'hard'},
    players:['human','npc','other'].map((id,index)=>({id,name:['Lena','Morgrim','Aelor'][index]!,type:index===1?'computer':'human',color:'violet',characterId: "elvenSpellweaver" as const, connectionState:index===1?'disconnected':'connected',gold:1500,position:0,isBankrupt:false,dungeon:{inDungeon:false,failedAttempts:0},heldCards:[],relics:[],armedRelics:[]})),
    turnOrder:['human','npc','other'],orderRolls:[],orderContenders:[],orderRollTargetCount:1,currentPlayerId:'human',currentTurnIndex:0,currentRound:4,turnNumber:10,turnPhase:'waitingForRoll',
    turnContext:{consecutiveDoubles:0,pendingExtraRoll:false,rollSequence:0},propertyOwnerships:[],buildingBank:{settlementUnitsAvailable:32,grandStructuresAvailable:12},economyLog:[],trades:[],startedAt:1};
}
const own=(state:GameState,id:string,indices:number[])=>{state.propertyOwnerships.push(...indices.map(tileIndex=>({tileIndex,ownerId:id,mortgaged:false,buildingLevel:0 as const})));};

// Mühlenweg (10) kostet 140 Gold; für den Computer ohne Gruppenbezug ist er genau das wert.
test('the computer accepts fair quick bids, rejects lowballs and counters close bids with a price only',()=>{
  for(const [bid,expected] of [[140,'accept'],[200,'accept'],[60,'reject'],[100,'counter']] as const){
    const state=game();own(state,'npc',[10]);
    const offer=trades.createQuick(state,'human',{tileIndex:10,gold:bid}),before=JSON.stringify(state);
    const decision=ai.decideTradeResponse(state,'npc',offer);
    assert.equal(decision.type,expected,`bid ${bid}`);assert.equal(JSON.stringify(state),before,'evaluation never mutates state');
    if(decision.type!=='counter') continue;
    assert.equal(decision.request.mode,'quick');assert.equal(decision.request.counterToTradeId,offer.id);
    const counter=trades.create(state,'npc',decision.request);
    assert.deepEqual(getQuickTradeTerms(counter),{tileIndex:10,gold:140,sellerId:'npc',buyerId:'human'});
    assert.equal(state.economyLog.at(-1)!.message,'Morgrim verlangt 140 Gold für Mühlenweg.');
  }
});

test('as a buyer the computer accepts fair asks and counters overpriced asks with what it can spend',()=>{
  for(const [ask,expected] of [[140,'accept'],[200,'counter'],[400,'reject']] as const){
    const state=game();own(state,'human',[10]);
    const offer=trades.createQuick(state,'human',{tileIndex:10,gold:ask,recipientId:'npc'});
    const decision=ai.decideTradeResponse(state,'npc',offer);
    assert.equal(decision.type,expected,`ask ${ask}`);
    if(decision.type==='counter') assert.deepEqual(getQuickTradeTerms({...decision.request,proposerId:'npc'}),{tileIndex:10,gold:140,sellerId:'human',buyerId:'npc'});
  }
  const poor=game();own(poor,'human',[10]);poor.players[1]!.gold=300;
  const offer=trades.createQuick(poor,'human',{tileIndex:10,gold:140,recipientId:'npc'});
  assert.equal(ai.decideTradeResponse(poor,'npc',offer).type,'reject','the gold reserve still applies');
});

test('the computer never sells the last piece that would complete a human region below its premium',()=>{
  const state=game();own(state,'npc',[9]);own(state,'human',[6,8]);
  const fair=trades.createQuick(state,'human',{tileIndex:9,gold:130});
  assert.notEqual(ai.decideTradeResponse(state,'npc',fair).type,'accept');
});

test('the computer answers a re-countered quick negotiation only with accept or reject',()=>{
  const state=game();own(state,'npc',[10]);
  const offer=trades.createQuick(state,'human',{tileIndex:10,gold:100});
  const counter=trades.create(state,'npc',(ai.decideTradeResponse(state,'npc',offer) as {request:Parameters<TradeService['create']>[2]}).request);
  const recounter=trades.createQuick(state,'human',{tileIndex:10,gold:110,counterToTradeId:counter.id});
  assert.equal(ai.decideTradeResponse(state,'npc',recounter).type,'reject');
});

test('initiative purchases are quick offers at the shared fair price',()=>{
  const state=game();state.currentPlayerId='npc';state.turnPhase='waitingForEndTurn';own(state,'npc',[6,8]);own(state,'human',[9]);
  const request=ai.findTradeProposal(state,'npc')!;
  assert.equal(request.mode,'quick');assert.equal(request.offer.gold,130);
  const trade=trades.create(state,'npc',request);
  assert.equal(state.economyLog.at(-1)!.message,'Morgrim will Amethystkrone für 130 Gold kaufen.');
  assert.equal(trade.mode,'quick');
});

function saleFixture(gold:number){
  const state=game();state.currentPlayerId='npc';state.turnPhase='waitingForEndTurn';state.players[1]!.gold=gold;
  own(state,'npc',[6]);own(state,'human',[8]);
  return state;
}

test('a computer short of gold occasionally offers a lone property to a human who already holds part of that region',()=>{
  const state=saleFixture(350);
  const request=ai.findTradeProposal(state,'npc')!;
  assert.equal(request.mode,'quick');assert.equal(request.recipientId,'human');
  assert.deepEqual(request.offer.propertyTileIndices,[6]);assert.equal(request.request.gold,100);
  trades.create(state,'npc',request);
  assert.equal(state.economyLog.at(-1)!.message,'Morgrim bietet Flüsterhain für 100 Gold an.');
});

test('quick sales stay away from comfortable purses, own groups, completed human regions and cooldowns',()=>{
  assert.equal(ai.findTradeProposal(saleFixture(200+AI_QUICK_SELL_GOLD_CUSHION),'npc'),undefined,'enough gold');
  const ownGroup=saleFixture(350);own(ownGroup,'npc',[9]);
  assert.equal(ai.findQuickSaleProposal(ownGroup,'npc'),undefined,'keeps partial own groups');
  assert.equal(ai.findTradeProposal(ownGroup,'npc')!.offer.gold,110,'and would rather buy the missing piece');
  const completing=saleFixture(350);own(completing,'human',[9]);
  assert.equal(ai.findTradeProposal(completing,'npc'),undefined,'does not hand a human a full region');
  const stranger=saleFixture(350);stranger.propertyOwnerships[1]!.ownerId='other';stranger.players[2]!.connectionState='disconnected';
  assert.equal(ai.findTradeProposal(stranger,'npc'),undefined,'needs a connected human buyer');
  assert.equal(ai.findTradeProposal(saleFixture(350),'npc',4),undefined,'respects the proposal cooldown');
  const pending=saleFixture(350);trades.create(pending,'npc',ai.findTradeProposal(pending,'npc')!);
  assert.equal(ai.findTradeProposal(pending,'npc'),undefined,'one open offer at a time');
});
