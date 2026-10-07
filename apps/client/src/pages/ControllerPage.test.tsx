import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOARD_TILES, getBloodMoonDefinition, type GameState, type Player } from "@valenor/shared";
import { MobileLiveEvents } from "../components/MobileLiveEvents";
import { PlayerColorPicker } from "../components/PlayerColorPicker";
import { PlayerCharacterPicker } from "../components/PlayerCharacterPicker";
import { PlayerPortrait } from "../components/PlayerPortrait";
import {
  BANKRUPTCY_CONFIRMATION,
  BankruptcySpectator,
  confirmBankruptcy,
  DungeonDecisionPanel,
  DungeonOutcomeNotice,
  MobileTradeNotice,
  MobileTurnNotice,
  PaymentManagement,
  TavernDecisionPanel
} from "./ControllerPage";

test("tavern decision exposes only the two server choices and readable independent outcomes",()=>{
  const tavern={id:'tavern',playerId:'p1',turnNumber:1,movementSequence:1,pot:400,status:'decision' as const,startedAt:1};
  const markup=renderToStaticMarkup(<TavernDecisionPanel tavern={tavern} connected onChoose={()=>undefined} />);
  assert.match(markup,/400 GOLD NEHMEN/);assert.match(markup,/DOPPELT ODER NIX/);assert.match(markup,/1–3: kein Gewinn · 4–6: doppelter Pott/);
  assert.match(renderToStaticMarkup(<TavernDecisionPanel tavern={tavern} connected={false} onChoose={()=>undefined} />),/disabled=""/);
  for(const payout of [0,800]){
    const outcome=renderToStaticMarkup(<TavernDecisionPanel tavern={{...tavern,status:'resolved',choice:'gamble',die:payout?4:1,payout}} connected onChoose={()=>undefined} />);
    assert.match(outcome,payout?/DOPPELT!/:/VERZOCKT!/);assert.match(outcome,payout?/\+800 GOLD/:/Der Pott bleibt bei 400 Gold/);assert.doesNotMatch(outcome,/<button/);
  }
});

const roomPlayer: Player = {
  id: "p1",
  name: "Philipp",
  type: "human",
  color: "violet",
  characterId: "elvenSpellweaver" as const, ready: false, connectionState: "connected",
  joinedAt: 1
};

function spectatorState(): GameState {
  return {
    roomId: "VAL-TEST",
    status: "playing",
    config: { mode: "chronicles" },
    players: [
      { id: "p1", name: "Philipp", type: "human", color: "violet", characterId: "elvenSpellweaver" as const, connectionState: "connected", gold: 0, position: 8, isBankrupt: true, dungeon: { inDungeon: false, failedAttempts: 0 } },
      { id: "p2", name: "Justine", type: "human", color: "green", characterId: "humanKnight" as const, connectionState: "connected", gold: 2_100, position: 12, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
    ],
    turnOrder: ["p1", "p2"],
    orderRolls: [],
    orderContenders: [],
    orderRollTargetCount: 1,
    currentPlayerId: "p2",
    currentTurnIndex: 1,
    currentRound: 4,
    turnNumber: 7,
    turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [],
    trades: [],
    startedAt: 1
  };
}

test("mobile live events show shared context, active NPC, dice, globals and only three latest actions", () => {
  const state = spectatorState();
  state.players[0]!.isBankrupt = false; state.players[1]!.type = "computer";
  state.turnPhase = "propertyDecision"; state.weltenwegPot = 200;
  state.lastDiceRoll = { die1:3, die2:4, total:7, isDouble:false };
  state.lastMovement = { kind:"normal", playerId:"p2", from:1, to:8, path:[2,3,4,5,6,7,8], passedStart:false, landedTile:BOARD_TILES[8]! };
  state.wanderingDragon = { tileIndex:24, nextMoveRound:6, encounterSequence:0 };
  state.activeChronicleEvent = { ...getBloodMoonDefinition("orcs"), startedAfterRound:3, startedAtRound:4, expiresAtRound:6, startedAt:1 };
  state.economyLog = Array.from({length:5}, (_, index) => ({id:`log-${index}`,kind:"system",message:`Live-Aktion ${index}`,playerIds:[],createdAt:1}));
  let markup = renderToStaticMarkup(<MobileLiveEvents state={state} playerId="p1" />);
  for (const text of ["LIVE-GESCHEHEN", "Justine · NPC", "3 + 4", "200 GOLD", "Eisenöde", "Mieten: +25 %", "Noch 2 Runden", BOARD_TILES[24]!.name, "data-context-kind=\"landing\""]) assert.ok(markup.includes(text), text);
  assert.deepEqual([...markup.matchAll(/<span>(Live-Aktion \d)<\/span>/g)].map(match=>match[1]),["Live-Aktion 4","Live-Aktion 3","Live-Aktion 2"]);
  assert.equal(renderToStaticMarkup(<MobileLiveEvents state={state} playerId="p2" />), "");
  state.currentPlayerId = "p1"; state.turnPhase = "waitingForRoll";
  markup = renderToStaticMarkup(<MobileLiveEvents state={state} playerId="p2" />);
  assert.match(markup,/Philipp · MENSCH/); assert.doesNotMatch(markup,/Justine · NPC|Wurf:|Landet auf:|data-context-kind="landing"/);
  state.currentRound = 6;
  assert.doesNotMatch(renderToStaticMarkup(<MobileLiveEvents state={state} playerId="p2" />), /AKTIVE CHRONIK/);
});

test("lobby color picker marks the current color, blocks human colors and offers NPC colors", () => {
  const players: Player[] = [roomPlayer,{...roomPlayer,id:"p2",name:"Myrra",color:"red"},{...roomPlayer,id:"p3",name:"Brom",type:"computer",color:"blue"}];
  const markup = renderToStaticMarkup(<PlayerColorPicker players={players} playerId="p1" connected pending={false} onSelect={()=>undefined} />);
  assert.match(markup,/DEINE FARBE/); assert.equal([...markup.matchAll(/<button /g)].length,6);
  assert.match(markup,/color-swatch--violet" aria-pressed="true"/);
  assert.match(markup,/color-swatch--red"[^>]*disabled=""/); assert.match(markup,/Belegt von Myrra/);
  assert.doesNotMatch(markup.match(/<button[^>]*color-swatch--blue"[^>]*>/)![0],/disabled/);
  assert.equal([...renderToStaticMarkup(<PlayerColorPicker players={players} playerId="p1" connected={false} pending={false} onSelect={()=>undefined} />).matchAll(/disabled=""/g)].length,6);
});

test("character choices use identity assets, block other humans and allow claiming an NPC character",()=>{
  const players:Player[]=[{...roomPlayer,characterId:"nightElf"},{...roomPlayer,id:"p2",name:"Myrra",characterId:"dwarf"},{...roomPlayer,id:"p3",type:"computer",characterId:"tauren"}];
  const markup=renderToStaticMarkup(<PlayerCharacterPicker players={players} playerId="p1" connected pending={false} onSelect={()=>undefined} />);
  assert.equal([...markup.matchAll(/<button /g)].length,8);assert.match(markup,/Belegt von Myrra/);
  const blocked=[...markup.matchAll(/<button[^>]*disabled=""[^>]*>.*?<\/button>/g)];assert.equal(blocked.length,1);assert.match(blocked[0]![0],/Dwarf.png/);
  assert.match(markup,/<button[^>]*aria-pressed="true"[^>]*>.*?nightelv.png/);
  assert.match(renderToStaticMarkup(<PlayerPortrait characterId="troll" />),/Troll.png/);
  assert.match(renderToStaticMarkup(<PlayerPortrait characterId="humanKnight" />),/human-knight.png/);
});

test("paymentRequired explains mortgage resolution and offers bankruptcy", () => {
  const markup = renderToStaticMarkup(
    <PaymentManagement
      payment={{ payerId: "p1", amount: 500, reason: "Kronenzoll", creditorType: "bank", reasonType: "tax" }}
      playerGold={100}
      hasLegalPaymentAction
      connected
      onSettle={() => undefined}
      onDeclareBankruptcy={() => undefined}
    />
  );
  assert.match(markup, /Dir fehlen 400 Gold/);
  assert.match(markup, /beleihe Besitz/);
  assert.match(markup, /Bankrott erklären/);
  assert.doesNotMatch(markup, /Forderung begleichen/);
});

test("paymentRequired exposes settlement once liquid gold is sufficient", () => {
  const markup = renderToStaticMarkup(
    <PaymentManagement
      payment={{ payerId: "p1", payeeId: "p2", amount: 500, reason: "Miete", creditorType: "player", reasonType: "rent" }}
      playerGold={550}
      hasLegalPaymentAction={false}
      connected
      onSettle={() => undefined}
      onDeclareBankruptcy={() => undefined}
    />
  );
  assert.match(markup, /Forderung begleichen/);
});

test("bankruptcy always requires the explicit safety confirmation", () => {
  let received = "";
  assert.equal(confirmBankruptcy((message) => { received = message; return false; }), false);
  assert.equal(received, BANKRUPTCY_CONFIRMATION);
  assert.equal(confirmBankruptcy(() => true), true);
});

test("a bankrupt controller renders the spectator view without rejoining play", () => {
  const markup = renderToStaticMarkup(<BankruptcySpectator gameState={spectatorState()} player={roomPlayer} connected />);
  assert.match(markup, /Du bist ausgeschieden/);
  assert.match(markup, /Zuschauerstatus/);
  assert.match(markup, /Justine/);
  assert.match(markup, /2100 Gold/);
  assert.doesNotMatch(markup, /Würfeln/);
});

test("dungeon decision shows attempt one and enables an affordable release", () => {
  const markup = renderToStaticMarkup(<DungeonDecisionPanel failedAttempts={0} gold={200} connected onRoll={() => undefined} onPay={() => undefined} />);
  assert.match(markup, /Dunkler Kerker/);
  assert.match(markup, /Versuch 1 \/ 3/);
  assert.match(markup, /Pasch versuchen/);
  assert.match(markup, /50 Gold zahlen/);
  assert.doesNotMatch(markup, /disabled=""[^>]*>50 Gold zahlen/);
});

test("third dungeon attempt keeps rolling available and disables an unaffordable release", () => {
  const markup = renderToStaticMarkup(<DungeonDecisionPanel failedAttempts={2} gold={20} connected onRoll={() => undefined} onPay={() => undefined} />);
  assert.match(markup, /Versuch 3 \/ 3/);
  assert.match(markup, /Pasch versuchen/);
  assert.match(markup, /disabled=""[^>]*>50 Gold zahlen/);
  assert.match(markup, /Nicht genügend Gold/);
});

test("dungeon decision exposes a held-card release action", () => {
  const markup = renderToStaticMarkup(<DungeonDecisionPanel failedAttempts={1} gold={20} connected hasDungeonCard onRoll={() => undefined} onPay={() => undefined} onUseCard={() => undefined} />);
  assert.match(markup, /Kerkersiegel verwenden/);
  assert.doesNotMatch(markup, /disabled=""[^>]*>Kerkersiegel verwenden/);
});

test("controller notices distinguish dungeon escape, failed rolls and a third double", () => {
  const escaped = renderToStaticMarkup(<DungeonOutcomeNotice action={{ id: "a", kind: "dungeonEscaped", playerId: "p1", createdAt: 1 }} />);
  const failed = renderToStaticMarkup(<DungeonOutcomeNotice action={{ id: "b", kind: "dungeonFailed", playerId: "p1", attempt: 1, createdAt: 2 }} />);
  const third = renderToStaticMarkup(<DungeonOutcomeNotice action={{ id: "c", kind: "thirdDouble", playerId: "p1", createdAt: 3 }} />);
  assert.match(escaped, /Kerker-Pasch/);
  assert.match(escaped, /Du bist frei/);
  assert.match(failed, /Kein Pasch/);
  assert.match(failed, /bleibst im Kerker/);
  assert.match(third, /Drei Pasche/);
});

test("mobile notices distinguish own turns, foreign turns and incoming trades", () => {
  const own = renderToStaticMarkup(<MobileTurnNotice currentName="Philipp" own />);
  const foreign = renderToStaticMarkup(<MobileTurnNotice currentName="Justine" own={false} />);
  const trade = renderToStaticMarkup(<MobileTradeNotice proposerName="Philipp" />);
  assert.match(own, /DU BIST AM ZUG/);
  assert.match(own, /Würfle oder führe deine Aktion aus/);
  assert.match(foreign, /Justine ist am Zug/);
  assert.match(trade, /HANDELSANGEBOT VON PHILIPP/);
  assert.match(trade, /Ansehen/);
});
