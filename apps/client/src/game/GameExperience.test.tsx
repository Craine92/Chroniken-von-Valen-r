import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOARD_TILES, CHRONICLE_EVENTS, PLAYER_COLORS, PLAYER_CHARACTERS, DUNGEON_TILE_INDEX, getBloodMoonDefinition, getRegionalChronicleDefinition, type GameState, type RegionType } from "@valenor/shared";
import { DOUBLE_BANNER_DURATION_MS, GameExperience } from "./GameExperience";
import { BoardTopHud, hasTurnStatusContent, TurnStatus } from "./TurnStatus";
import { GameHud } from "./GameHud";
import { getCurrentBoardContext } from "./board-context";
import { getBoardScreenLayout, getCardPresentationKey } from "./board-presentation";

function startedGameState(playerCount: 2 | 3 | 4 | 5 | 6): GameState {
  return {
    roomId: "VAL-TEST",
    status: "playing",
    config: { mode: "chronicles" },
    players: Array.from({ length: playerCount }, (_, index) => ({
      id: `p${index + 1}`,
      name: index === 0 ? "Mensch" : `Computer ${index}`,
      type: index === 0 ? "human" as const : "computer" as const,
      color: PLAYER_COLORS[index]!,
      characterId: PLAYER_CHARACTERS[index]!.id, connectionState: "connected" as const,
      gold: 1500,
      position: 0,
      isBankrupt: false,
      dungeon: { inDungeon: false, failedAttempts: 0 }
    })),
    turnOrder: [],
    orderRolls: Array.from({ length: playerCount }, (_, index) => ({ playerId: `p${index + 1}`, rolls: [] })),
    orderContenders: Array.from({ length: playerCount }, (_, index) => `p${index + 1}`),
    orderRollTargetCount: 1,
    currentTurnIndex: 0,
    currentRound: 1,
    turnNumber: 0,
    turnPhase: "determiningOrder",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [],
    trades: [],
    startedAt: 1
  };
}

test("TV context uses actual ownership, building level, effective rent and free purchase price",()=>{
  const state=startedGameState(2);state.currentPlayerId='p1';state.turnPhase='propertyDecision';state.lastMovement={kind:'normal',sequence:1,playerId:'p1',from:0,to:1,path:[1],passedStart:false,landedTile:BOARD_TILES[1]!};
  let context=getCurrentBoardContext(state,1000);assert.equal(context.title,'Mondpfad');assert.equal(context.gold,60);assert.ok(context.lines.includes('FREI'));
  state.propertyOwnerships=[{tileIndex:1,ownerId:'p2',buildingLevel:2,mortgaged:false}];state.turnPhase='waitingForEndTurn';context=getCurrentBoardContext(state,1000);
  assert.ok(context.lines.includes('Besitz: Computer 1'));assert.ok(context.lines.some(line=>line.startsWith('Baustufe 2')));assert.equal(context.gold,30);assert.equal(context.goldLabel,'MIETE');
  state.propertyOwnerships[0]!.mortgaged=true;assert.equal(getCurrentBoardContext(state,1000).gold,0);
  state.turnPhase='waitingForRoll';assert.equal(getCurrentBoardContext(state,6000,false).kind,'neutral');
});

test("neutral context shows current balances and a chronicle introduction expires back to turn information",()=>{
  const state=startedGameState(2);state.currentPlayerId="p1";state.turnPhase="waitingForRoll";
  state.players[0]!.activeQuests=[{id:"traveler",assignedAtTurn:0},{id:"builder",assignedAtTurn:0},{id:"landbuyer",assignedAtTurn:0}];
  state.players[0]!.relics=["runestone"];
  assert.deepEqual(getCurrentBoardContext(state,1000,false).stats,[{label:"Gold",value:"1.500"},{label:"Besitz",value:"0"},{label:"Aufträge",value:"3"},{label:"Relikte",value:"1"},{label:"Runde",value:"1"}]);
  state.currentRound=4;state.activeChronicleEvent={...getBloodMoonDefinition("orcs"),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1000};
  assert.equal(getCurrentBoardContext(state,1500,false).kind,"chronicle");
  assert.equal(getCurrentBoardContext(state,6000,false).kind,"neutral");
  assert.match(renderToStaticMarkup(<GameHud gameState={state} />),/active-chronicle/);
});

test("top HUD retains a completed roll and clears the previous result before the next roll",()=>{
  const state=startedGameState(2);state.currentPlayerId="p1";state.turnPhase="waitingForEndTurn";
  state.lastDiceRoll={die1:4,die2:4,total:8,isDouble:true};
  let markup=renderToStaticMarkup(<BoardTopHud state={state} />);
  assert.match(markup,/WÜRFELERGEBNIS/);assert.match(markup,/PASCH!/);assert.match(markup,/board-top-hud__total">8/);
  state.turnPhase="waitingForRoll";markup=renderToStaticMarkup(<BoardTopHud state={state} />);
  assert.match(markup,/AM ZUG/);assert.match(markup,/WÜRFLE/);assert.doesNotMatch(markup,/PASCH!|board-top-hud__total/);
});

test("the context identifies counteroffers and accepted trades using participants rather than action IDs",()=>{
  const state=startedGameState(2);state.currentPlayerId="p1";state.turnPhase="waitingForEndTurn";
  state.trades=[{id:"offer",counterToTradeId:"original",proposerId:"p2",recipientId:"p1",offer:{gold:100,propertyTileIndices:[]},request:{gold:0,propertyTileIndices:[1]},status:"pending",createdAt:1000}];
  state.lastTradeAction={id:"separate-action",type:"created",proposerId:"p2",recipientId:"p1",createdAt:1001};
  let context=getCurrentBoardContext(state,2000,false);assert.equal(context.kind,"trade");assert.ok(context.lines.includes("GEGENANGEBOT"));assert.match(context.title,/Computer 1 ↔ Mensch/);
  state.lastTradeAction.type="accepted";assert.ok(getCurrentBoardContext(state,2000,false).lines.includes("ANGENOMMEN"));
  assert.equal(getCurrentBoardContext(state,6000,false).kind,"neutral");
});

test("card presentation ignores resolution updates but distinguishes consecutive draws of the same card",()=>{
  const state=startedGameState(2);state.activeCard={cardId:"fate_025",deck:"fate",playerId:"p1",status:"resolving"};
  state.decks={fate:{drawCount:1,discardCount:0},adventure:{drawCount:0,discardCount:0}};
  const key=getCardPresentationKey(state);state.activeCard.status="readyToAcknowledge";assert.equal(getCardPresentationKey(state),key);
  state.decks.fate.drawCount++;assert.notEqual(getCardPresentationKey(state),key);
  for(const [width,height] of [[1699,1080],[2280,1440],[3444,2160]])assert.ok(getBoardScreenLayout(width!,height!).topSpace>45);
});

test("TV context prioritizes decisions and cards and expires transient events without stale turns",()=>{
  const state=startedGameState(2);state.currentPlayerId='p1';state.turnPhase='tavernDecision';
  state.tavern={id:'tavern',playerId:'p1',turnNumber:state.turnNumber,movementSequence:1,pot:400,status:'decision',startedAt:1};
  state.activeCard={cardId:'fate_025',deck:'fate',playerId:'p1',status:'readyToAcknowledge'};assert.equal(getCurrentBoardContext(state,100000).kind,'tavern');
  state.tavern.status='resolved';state.tavern.payout=0;state.tavern.choice='gamble';state.tavern.resolvedAt=1000;
  state.turnPhase='waitingForEndTurn';
  assert.equal(getCurrentBoardContext(state,2000).title,'VERZOCKT!');assert.equal(getCurrentBoardContext(state,6000).kind,'card');
  assert.ok(getCurrentBoardContext(state,6000).lines[0]!.includes('175 Gold'));delete state.activeCard;delete state.tavern;
  state.economyLog=[{id:'dragon',kind:'dragon',playerIds:['p1'],message:'Mensch begegnet dem Hüter der Relikte.',createdAt:1000}];
  assert.equal(getCurrentBoardContext(state,2000).kind,'dragon');assert.equal(getCurrentBoardContext(state,6000,false).kind,'neutral');
  state.currentPlayerId='p2';assert.equal(getCurrentBoardContext(state,2000,false).kind,'neutral');
});

test("the left HUD shows only a currently active chronicle and counts its remaining rounds", () => {
  const state = startedGameState(2); state.currentRound = 4;
  state.activeChronicleEvent = { ...getBloodMoonDefinition("orcs"), startedAfterRound: 3, startedAtRound: 4, expiresAtRound: 6, startedAt: 1 };
  let markup = renderToStaticMarkup(<GameHud gameState={state} />);
  assert.match(markup, /AKTIVE CHRONIK/);
  assert.match(markup, /Blutmond/);
  assert.match(markup, /Eisenöde/);
  assert.match(markup, /Mieten: \+25 %/);
  assert.match(markup, /Noch 2 Runden/);
  state.currentRound = 5;
  assert.match(renderToStaticMarkup(<GameHud gameState={state} />), /Noch 1 Runde/);
  state.currentRound = 6;
  markup = renderToStaticMarkup(<GameHud gameState={state} />);
  assert.doesNotMatch(markup, /AKTIVE CHRONIK/);
});

test("every chronicle supplies its own compact HUD effect text and the pot stays visible at zero", () => {
  const state = startedGameState(2); state.currentRound = 4;
  for (const event of CHRONICLE_EVENTS) {
    assert.ok(event.effectSummary);
    state.activeChronicleEvent = { ...event, startedAfterRound: 3, startedAtRound: 4, expiresAtRound: 6, startedAt: 1 };
    const markup = renderToStaticMarkup(<GameHud gameState={state} />);
    assert.ok(markup.includes(event.title));
    assert.ok(markup.includes(event.effectSummary));
    assert.match(markup, /Noch 2 Runden/);
    assert.match(markup, /WELTENWEG-POTT/);
    assert.match(markup, /0 GOLD/);
  }
  delete state.activeChronicleEvent; state.weltenwegPot = 500;
  assert.match(renderToStaticMarkup(<GameHud gameState={state} />), /500 GOLD/);
});

test("regional HUD shows concrete targets and uses compact labels for three or four realms", () => {
  const state = startedGameState(4); state.currentRound = 4;
  for (const [regions,label] of [[['elves','orcs'],'Amethystwald · Eisenöde'],[['elves','humans','orcs'],'3 Reiche betroffen'],[['elves','humans','orcs','steppe'],'ALLE VIER REICHE']] as Array<[RegionType[],string]>) {
    state.activeChronicleEvent = {...getRegionalChronicleDefinition(CHRONICLE_EVENTS[1]!,regions),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
    const markup = renderToStaticMarkup(<GameHud gameState={state} />); assert.ok(markup.includes(label)); assert.match(markup,/Mieten: \+25 %/);
  }
  state.activeChronicleEvent = {...CHRONICLE_EVENTS[2]!,startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
  assert.doesNotMatch(renderToStaticMarkup(<GameHud gameState={state} />),/active-chronicle__regions/);
});

for (const playerCount of [2, 3, 4, 5, 6] as const) {
  test(`a started ${playerCount}-player state renders the game view instead of the lobby`, () => {
    const markup = renderToStaticMarkup(<GameExperience gameState={startedGameState(playerCount)} />);
    assert.match(markup, /data-testid="valenor-game-view"/);
    assert.match(markup, /Die Chroniken von Valen/);
    assert.doesNotMatch(markup, /class="setup-layout"/);
  });
}

test("a finished game renders the winner and new-chronicle action", () => {
  const state = startedGameState(2);
  state.status = "finished";
  state.winnerId = "p1";
  state.finishReason = "lastPlayerStanding";
  const markup = renderToStaticMarkup(<GameExperience gameState={state} onNewChronicle={() => undefined} />);
  assert.match(markup, /Die Chronik ist entschieden/);
  assert.match(markup, /Mensch/);
  assert.match(markup, /Neue Chronik/);
});

test("TV presents an active fate card over the board without a permanent chronicle rail", () => {
  const state = startedGameState(2);
  state.activeCard = { cardId: "fate_008", deck: "fate", playerId: "p1", status: "waitingForPayment" };
  state.cardResolution = { cardId: "fate_008", deck: "fate", playerId: "p1", effectIndex: 1, status: "waitingForPayment", chainDepth: 0, pendingPayments: [] };
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", amount: 100, reason: "Fluch der Mondfinsternis", creditorType: "bank", reasonType: "card" };
  const markup = renderToStaticMarkup(<GameExperience gameState={state} />);
  assert.match(markup, /Fluch der Mondfinsternis/);
  assert.match(markup, /class="board-card-event"/);
  assert.doesNotMatch(markup, /game-context-sidebar/);
  assert.equal((markup.match(/data-testid="card-reveal"/g) ?? []).length, 1);
  assert.match(markup, /Du zahlst 100 Gold/);
});

test("the TV board reports idle and active event state without adding a right rail", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.orderContenders = [];
  state.turnPhase = "waitingForRoll";
  let markup = renderToStaticMarkup(<GameExperience gameState={state} />);
  assert.match(markup, /board-page--gameplay is-context-idle/);
  assert.match(markup, /data-context-state="idle"/);
  assert.match(markup, /class="board-event-layer"/);
  assert.doesNotMatch(markup, /game-context-sidebar/);

  state.turnPhase = "determiningOrder";
  markup = renderToStaticMarkup(<GameExperience gameState={state} boardPresentationMode="tabletop" />);
  assert.match(markup, /board-page--tabletop has-context-event/);
  assert.match(markup, /data-context-state="active"/);
  assert.doesNotMatch(markup, /game-context-sidebar/);
});

test("turn status renders dungeon decisions, dungeon doubles and third-double fate", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.players[0]!.dungeon = { inDungeon: true, failedAttempts: 1 };
  state.turnPhase = "dungeonDecision";
  let markup = renderToStaticMarkup(<TurnStatus state={state} />);
  assert.match(markup, /sitzt im Dunklen Kerker/);
  assert.match(markup, /Versuch 2 \/ 3/);

  state.players[0]!.dungeon = { inDungeon: false, failedAttempts: 0 };
  state.turnPhase = "moving";
  state.lastTurnAction = { id: "escape", kind: "dungeonEscaped", playerId: "p1", createdAt: 1 };
  markup = renderToStaticMarkup(<TurnStatus state={state} />);
  assert.match(markup, /KERKER-PASCH/);
  assert.match(markup, /ist frei/);

  state.turnPhase = "dungeonTransfer";
  state.lastTurnAction = { id: "third", kind: "thirdDouble", playerId: "p1", createdAt: 2 };
  markup = renderToStaticMarkup(<TurnStatus state={state} />);
  assert.match(markup, /Drei Pasche in Folge/);
  assert.match(markup, /Dunklen Kerker gebracht/);
});

test("a normal landing on dungeon is clearly shown as only visiting", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.turnPhase = "waitingForEndTurn";
  state.lastMovement = { kind: "normal", playerId: "p1", from: 7, to: DUNGEON_TILE_INDEX, path: [8, 9, 10, 11, 12, DUNGEON_TILE_INDEX], passedStart: false, landedTile: BOARD_TILES[DUNGEON_TILE_INDEX]! };
  const markup = renderToStaticMarkup(<TurnStatus state={state} />);
  assert.match(markup, /Nur zu Besuch/);
  assert.match(markup, /ist frei/);
});

test("a normal roll never creates a double banner", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.orderContenders = [];
  state.turnPhase = "moving";
  state.lastDiceRoll = { die1: 2, die2: 5, total: 7, isDouble: false };
  const markup = renderToStaticMarkup(<GameExperience gameState={state} />);
  assert.doesNotMatch(markup, /class="double-banner"/);
});

test("a double uses its own temporary board lane instead of the central turn overlay", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.orderContenders = [];
  state.turnPhase = "waitingForRoll";
  state.turnContext.pendingExtraRoll = true;
  state.lastTurnAction = { id: "double-1", kind: "double", playerId: "p1", createdAt: 1 };

  const statusMarkup = renderToStaticMarkup(<TurnStatus state={state} />);
  const experienceMarkup = renderToStaticMarkup(<GameExperience gameState={state} />);
  assert.doesNotMatch(statusMarkup, /PASCH!/);
  assert.equal(hasTurnStatusContent(state), false);
  assert.match(experienceMarkup, /class="board-notification-lane"/);
  assert.match(experienceMarkup, /class="double-banner"/);
  assert.match(experienceMarkup, /Mensch darf erneut würfeln/);
  assert.equal(DOUBLE_BANNER_DURATION_MS, 2_200);
});

test("double banner remains separate from landing, property and card presentations", () => {
  for (const scenario of ["property", "fate", "adventure"] as const) {
    const state = startedGameState(2);
    state.turnOrder = ["p1", "p2"];
    state.currentPlayerId = "p1";
    state.orderContenders = [];
    state.turnContext.pendingExtraRoll = true;
    state.lastTurnAction = { id: `double-${scenario}`, kind: "double", playerId: "p1", createdAt: 1 };
    if (scenario === "property") {
      const property = BOARD_TILES.find((tile) => tile.type === "property")!;
      state.turnPhase = "waitingForEndTurn";
      state.lastMovement = { kind: "normal", playerId: "p1", from: 0, to: property.index, path: [property.index], passedStart: false, landedTile: property };
    } else {
      state.turnPhase = "cardResolving";
      state.activeCard = { cardId: scenario === "fate" ? "fate_001" : "adv_001", deck: scenario, playerId: "p1", status: "resolving" };
    }
    const markup = renderToStaticMarkup(<GameExperience gameState={state} />);
    assert.match(markup, /class="double-banner"/);
    assert.match(markup, scenario === "property" ? /class="landed-card"/ : /class="board-card-event"/);
  }
});

test("consecutive double actions receive distinct banner instances", () => {
  const state = startedGameState(2);
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerId = "p1";
  state.orderContenders = [];
  state.turnPhase = "waitingForRoll";
  state.turnContext.pendingExtraRoll = true;
  for (const id of ["double-fast-1", "double-fast-2"]) {
    state.lastTurnAction = { id, kind: "double", playerId: "p1", createdAt: 1 };
    const markup = renderToStaticMarkup(<GameExperience gameState={state} />);
    assert.match(markup, new RegExp(`data-notification-id="${id}"`));
  }
});

test("the TV sidebar contains only game status, four players and ordered global information", () => {
  const state = startedGameState(4);
  state.currentRound = 4; state.currentPlayerId = "p1"; state.turnPhase = "waitingForRoll";
  state.wanderingDragon = { tileIndex: 8, nextMoveRound: 6, encounterSequence: 0 };
  state.activeChronicleEvent = { ...getBloodMoonDefinition("orcs"), startedAfterRound:3, startedAtRound:4, expiresAtRound:6, startedAt:1 };
  const markup = renderToStaticMarkup(<GameHud gameState={state} />);
  assert.doesNotMatch(markup, /AKTUELLES GESCHEHEN|ist am Zug|würfelt|ist gelandet/);
  assert.equal([...markup.matchAll(/<article /g)].length, 4);
  assert.ok(markup.indexOf("WELTENWEG-POTT") < markup.indexOf("AKTIVE CHRONIK"));
  assert.ok(markup.indexOf("AKTIVE CHRONIK") < markup.indexOf("WANDERNDER DRACHE"));
});

test("the action log renders up to three newest entries in reverse chronological order without changing history", () => {
  const state = startedGameState(2);
  for (const count of [0,1,2,3,4,7]) {
    state.economyLog = Array.from({length:count}, (_, index) => ({ id:`action-${index}`, kind:"system" as const, message:`Aktion ${index}: Myrra verkauft eine Baustufe auf Sternenlichtung und erhält 38 Gold.`, playerIds:[], createdAt:index }));
    const before=JSON.stringify(state.economyLog);
    const markup = renderToStaticMarkup(<GameExperience gameState={state} />);
    const log=markup.match(/<aside class="economy-log"[^>]*>(.*?)<\/aside>/)![1]!;
    const messages=[...log.matchAll(/<p\b[^>]*>.*?<span>(.*?)<\/span><\/p>/g)].map(match=>match[1]);
    assert.deepEqual(messages,state.economyLog.slice(-3).reverse().map(entry=>entry.message));
    assert.equal(messages.length,Math.min(count,3));
    assert.equal(JSON.stringify(state.economyLog),before);
  }
});
