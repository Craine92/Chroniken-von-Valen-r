import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVENTURE_CARDS,
  BOARD_TILES,
  CARD_DEFINITIONS,
  DUNGEON_TILE_INDEX,
  FATE_CARDS,
  getCardDefinition,
  describeCardEffects,
  type DiceRoll,
  type GameState
} from "@valenor/shared";
import { CardService } from "./card-service";
import { SequenceCardShuffleSource, createDecks, drawTopCard, shuffleCards } from "./card-deck";
import { EconomyService } from "./economy-service";
import { TradeService } from "./trade-service";
import { DiceService } from "./dice-service";

function state(deck: "adventure" | "fate" = "adventure", gold = 1_500): GameState {
  const tileIndex = deck === "adventure" ? 7 : 2;
  return {
    roomId: "VAL-TEST", status: "playing", config: { mode: "chronicles" },
    players: [
      { id: "p1", name: "Philipp", type: "human", color: "violet", connectionState: "connected", gold, position: tileIndex, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }, heldCards: [] },
      { id: "p2", name: "Justine", type: "human", color: "green", connectionState: "connected", gold: 1_500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }, heldCards: [] },
      { id: "p3", name: "Aelor", type: "computer", color: "red", connectionState: "connected", gold: 1_500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }, heldCards: [] }
    ],
    turnOrder: ["p1", "p2", "p3"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "awaitingCardDraw",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 1, movementSequence: 1 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [],
    lastDiceRoll: { die1: 2, die2: 3, total: 5, isDouble: false },
    lastMovement: { kind: "normal", sequence: 1, playerId: "p1", from: 2, to: tileIndex, path: [tileIndex], passedStart: false, landedTile: { ...BOARD_TILES[tileIndex]! } },
    startedAt: 1
  };
}

function putFirst(runtime: ReturnType<CardService["createRuntime"]>, deck: "adventure" | "fate", ...ids: string[]) {
  const wanted = new Set(ids);
  runtime.decks[deck].drawPile = [...ids, ...runtime.decks[deck].drawPile.filter((id) => !wanted.has(id))];
}

test("card catalogue contains 28 typed cards per deck, unique IDs and one keepable release card each", () => {
  assert.equal(ADVENTURE_CARDS.length, 28);
  assert.equal(FATE_CARDS.length, 28);
  assert.equal(new Set(CARD_DEFINITIONS.map((card) => card.id)).size, 56);
  for (const [deck, cards] of [["adventure", ADVENTURE_CARDS], ["fate", FATE_CARDS]] as const) {
    assert.ok(cards.every((card) => card.deck === deck && card.title && card.flavorText && card.effects.length > 0));
    assert.equal(cards.filter((card) => card.keepable && card.effects.some((effect) => effect.type === "keepDungeonRelease")).length, 1);
  }
});

test("all forty board fields expose stable unique machine IDs", () => {
  assert.equal(BOARD_TILES.length, 40);
  assert.equal(new Set(BOARD_TILES.map((tile) => tile.id)).size, 40);
  assert.ok(BOARD_TILES.every((tile) => tile.id.trim().length > 0));
});

test('the eight added cards resolve through existing effects and return to their decks',()=>{
  const cases=[['adv_025',[1650,1500,1500]],['adv_026',[1400,1500,1500]],['adv_028',[1450,1525,1525]],['fate_025',[1675,1500,1500]],['fate_026',[1375,1500,1500]],['fate_028',[1550,1475,1475]]] as const;
  for(const [id,gold] of cases){
    const definition=getCardDefinition(id), cards=new CardService(new SequenceCardShuffleSource([0])),runtime=cards.createRuntime(),game=state(definition.deck);
    assert.ok(describeCardEffects(definition).includes('Gold')); putFirst(runtime,definition.deck,id);
    cards.draw(game,runtime,'p1','human'); assert.deepEqual(game.players.map(p=>p.gold),gold);
    cards.acknowledge(game,runtime,'p1','human'); assert.ok(runtime.decks[definition.deck].discardPile.includes(id));
  }
  for(const [id,destination] of [['adv_027',5],['fate_027',0]] as const){
    const definition=getCardDefinition(id), cards=new CardService(new SequenceCardShuffleSource([0])),runtime=cards.createRuntime(),game=state(definition.deck),economy=new EconomyService();
    game.players[0]!.position=39; putFirst(runtime,definition.deck,id); cards.draw(game,runtime,'p1','human');
    assert.equal(game.lastMovement?.passedStart,true); cards.completeMovement(game,runtime); economy.resolveLanding(game);
    assert.equal(game.players[0]!.position,destination); assert.equal(game.players[0]!.gold,1700);
    if(destination===5) { assert.equal(game.turnPhase,'propertyDecision'); economy.buyCurrentTile(game,'p1'); }
    cards.resumeAfterLanding(game,runtime); cards.acknowledge(game,runtime,'p1','human');
    assert.ok(runtime.decks[definition.deck].discardPile.includes(id));
  }
  const decks=createDecks(new SequenceCardShuffleSource([0]));
  assert.deepEqual([...decks.adventure.drawPile].sort(),ADVENTURE_CARDS.map(c=>c.id).sort());
  assert.deepEqual([...decks.fate.drawPile].sort(),FATE_CARDS.map(c=>c.id).sort());
});

test("shuffle source is deterministic and exhausted decks reshuffle only discards", () => {
  const sourceA = new SequenceCardShuffleSource([2, 1, 0]);
  const sourceB = new SequenceCardShuffleSource([2, 1, 0]);
  assert.deepEqual(shuffleCards(["a", "b", "c", "d"], sourceA), shuffleCards(["a", "b", "c", "d"], sourceB));
  const decks = createDecks(new SequenceCardShuffleSource([0]));
  decks.adventure.drawPile = [];
  decks.adventure.discardPile = ["adv_001", "adv_002"];
  assert.ok(["adv_001", "adv_002"].includes(drawTopCard(decks, "adventure", new SequenceCardShuffleSource([0]))));
  assert.equal(decks.adventure.discardPile.length, 0);
  assert.equal(decks.adventure.drawPile.length, 1);
});

test("bank reward resolves once and draw intent is idempotently rejected afterward", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  const runtime = cards.createRuntime();
  const game = state();
  putFirst(runtime, "adventure", "adv_001");
  cards.draw(game, runtime, "p1", "human");
  assert.equal(game.players[0]!.gold, 1_600);
  assert.equal(game.turnPhase, "cardAcknowledgement");
  assert.throws(() => cards.draw(game, runtime, "p1", "human"), /keine Karte/);
  cards.acknowledge(game, runtime, "p1", "human");
  assert.ok(runtime.decks.adventure.discardPile.includes("adv_001"));
});

test("an unaffordable bank card pauses in paymentRequired and resumes after settlement", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  const economy = new EconomyService();
  const runtime = cards.createRuntime();
  const game = state("adventure", 50);
  putFirst(runtime, "adventure", "adv_007");
  cards.draw(game, runtime, "p1", "human");
  assert.equal(game.turnPhase, "paymentRequired");
  assert.equal(game.pendingPayment?.reasonType, "card");
  game.players[0]!.gold = 150;
  economy.settlePendingPayment(game, "p1");
  cards.continueAfterPayment(game, runtime);
  assert.equal(game.turnPhase, "cardAcknowledgement");
  assert.equal(game.players[0]!.gold, 0);
});

test("pay-each and receive-from-each use deterministic serial turn order", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  let runtime = cards.createRuntime();
  let game = state();
  putFirst(runtime, "adventure", "adv_016");
  cards.draw(game, runtime, "p1", "human");
  assert.deepEqual(game.players.map((player) => player.gold), [1_450, 1_525, 1_525]);

  runtime = cards.createRuntime();
  game = state();
  game.lastMovement = { ...game.lastMovement!, landedTile: { ...BOARD_TILES[2]! }, to: 2 };
  putFirst(runtime, "fate", "fate_019");
  cards.draw(game, runtime, "p1", "human");
  assert.deepEqual(game.players.map((player) => player.gold), [1_540, 1_480, 1_480]);
});

test("card movement to Runentor collects exactly 200 and resumes after destination", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  const economy = new EconomyService();
  const runtime = cards.createRuntime();
  const game = state();
  game.players[0]!.position = 39;
  putFirst(runtime, "adventure", "adv_009");
  cards.draw(game, runtime, "p1", "human");
  assert.equal(game.lastMovement?.kind, "card");
  assert.equal(game.lastMovement?.passedStart, true);
  cards.completeMovement(game, runtime);
  economy.resolveLanding(game);
  cards.resumeAfterLanding(game, runtime);
  assert.equal(game.players[0]!.position, 0);
  assert.equal(game.players[0]!.gold, 1_700);
  assert.equal(game.turnPhase, "cardAcknowledgement");
});

test("card movement to an unowned harbor pauses for the normal property decision", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  const economy = new EconomyService();
  const runtime = cards.createRuntime();
  const game = state();
  putFirst(runtime, "adventure", "adv_010");
  cards.draw(game, runtime, "p1", "human");
  cards.completeMovement(game, runtime);
  economy.resolveLanding(game);
  assert.equal(game.turnPhase, "propertyDecision");
  economy.buyCurrentTile(game, "p1");
  cards.resumeAfterLanding(game, runtime);
  assert.equal(game.propertyOwnerships[0]?.tileIndex, 5);
  assert.equal(game.turnPhase, "cardAcknowledgement");
});

test("relative movement animates backward without Runentor gold", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  const economy = new EconomyService();
  const runtime = cards.createRuntime();
  const game = state();
  game.players[0]!.position = 13;
  putFirst(runtime, "adventure", "adv_014");
  cards.draw(game, runtime, "p1", "human");
  assert.deepEqual(game.lastMovement?.path, [12, 11, 10]);
  assert.equal(game.lastMovement?.passedStart, false);
  cards.completeMovement(game, runtime);
  economy.resolveLanding(game);
  cards.resumeAfterLanding(game, runtime);
  assert.equal(game.players[0]!.gold, 1_500);
});

test("nearest utility reuses the original dice sum and creates a fallback roll only when absent", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]), new DiceService({ rollDie: (() => { const values = [3, 4]; return () => values.shift()!; })() }));
  let runtime = cards.createRuntime();
  let game = state("fate");
  game.propertyOwnerships = [{ tileIndex: 11, ownerId: "p2", mortgaged: false, buildingLevel: 0 }];
  putFirst(runtime, "fate", "fate_015");
  cards.draw(game, runtime, "p1", "human");
  cards.completeMovement(game, runtime);
  new EconomyService().resolveLanding(game);
  assert.equal(game.players[0]!.gold, 1_480);

  runtime = cards.createRuntime();
  game = state("fate");
  delete game.lastDiceRoll;
  putFirst(runtime, "fate", "fate_015");
  cards.draw(game, runtime, "p1", "human");
  cards.completeMovement(game, runtime);
  assert.equal((game.lastDiceRoll as DiceRoll | undefined)?.total, 7);
});

test("repair counts ordinary units and grand structures separately", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  const runtime = cards.createRuntime();
  const game = state();
  game.propertyOwnerships = [
    { tileIndex: 1, ownerId: "p1", mortgaged: false, buildingLevel: 3 },
    { tileIndex: 3, ownerId: "p1", mortgaged: false, buildingLevel: 2 },
    { tileIndex: 6, ownerId: "p1", mortgaged: false, buildingLevel: 5 }
  ];
  putFirst(runtime, "adventure", "adv_020");
  cards.draw(game, runtime, "p1", "human");
  assert.equal(game.players[0]!.gold, 1_275);
  assert.match(game.economyLog.at(-2)?.message ?? "", /225 Gold/);
});

test("direct dungeon card cancels doubles, moves to the dungeon corner and ends after acknowledgement", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  const runtime = cards.createRuntime();
  const game = state();
  game.turnContext.consecutiveDoubles = 2;
  game.turnContext.pendingExtraRoll = true;
  putFirst(runtime, "adventure", "adv_022");
  cards.draw(game, runtime, "p1", "human");
  assert.equal(game.lastMovement?.kind, "dungeonTransfer");
  assert.equal(game.lastMovement?.passedStart, false);
  cards.completeMovement(game, runtime);
  assert.equal(game.players[0]!.position, DUNGEON_TILE_INDEX);
  assert.equal(game.players[0]!.dungeon.inDungeon, true);
  assert.equal(game.turnContext.pendingExtraRoll, false);
});

test("keepable release card never enters discard and can be consumed from dungeon", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  const runtime = cards.createRuntime();
  const game = state();
  putFirst(runtime, "adventure", "adv_024");
  cards.draw(game, runtime, "p1", "human");
  assert.deepEqual(game.players[0]!.heldCards, [{ cardId: "adv_024", deck: "adventure" }]);
  cards.acknowledge(game, runtime, "p1", "human");
  assert.ok(!runtime.decks.adventure.discardPile.includes("adv_024"));
  game.players[0]!.dungeon = { inDungeon: true, failedAttempts: 2 };
  game.turnPhase = "dungeonDecision";
  cards.useDungeonRelease(game, runtime, "p1", "human");
  assert.equal(game.players[0]!.dungeon.inDungeon, false);
  assert.equal(game.players[0]!.heldCards!.length, 0);
  assert.ok(runtime.decks.adventure.discardPile.includes("adv_024"));
  assert.equal(game.turnPhase, "waitingForRoll");
});

test("a card movement landing on another card suspends and resumes the parent", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  const runtime = cards.createRuntime();
  const game = state();
  game.players[0]!.position = 10;
  putFirst(runtime, "adventure", "adv_014", "adv_001");
  cards.draw(game, runtime, "p1", "human");
  cards.completeMovement(game, runtime);
  cards.awaitDraw(game, "adventure");
  cards.draw(game, runtime, "p1", "human");
  assert.equal(game.activeCard?.cardId, "adv_001");
  cards.acknowledge(game, runtime, "p1", "human");
  assert.equal(game.activeCard?.cardId, "adv_014");
  assert.equal(game.turnPhase, "cardAcknowledgement");
});

test("held release cards participate atomically in human trade", () => {
  const game = state();
  game.turnPhase = "waitingForRoll";
  game.players[0]!.heldCards = [{ cardId: "adv_024", deck: "adventure" }];
  const trades = new TradeService();
  const trade = trades.create(game, "p1", {
    recipientId: "p2",
    offer: { gold: 0, propertyTileIndices: [], cardIds: ["adv_024"] },
    request: { gold: 0, propertyTileIndices: [], cardIds: [] }
  });
  trades.accept(game, "p2", trade.id);
  assert.equal(game.players[0]!.heldCards!.length, 0);
  assert.deepEqual(game.players[1]!.heldCards, [{ cardId: "adv_024", deck: "adventure" }]);
});

test("bankruptcy card transfer goes to a player creditor or the matching discard", () => {
  const cards = new CardService(new SequenceCardShuffleSource([0]));
  let runtime = cards.createRuntime();
  let game = state();
  game.players[0]!.heldCards = [{ cardId: "adv_024", deck: "adventure" }];
  cards.handleBankruptcyCards(game, runtime, "p1", "p2");
  assert.equal(game.players[1]!.heldCards?.[0]?.cardId, "adv_024");

  runtime = cards.createRuntime();
  game = state("fate");
  game.players[0]!.heldCards = [{ cardId: "fate_024", deck: "fate" }];
  cards.handleBankruptcyCards(game, runtime, "p1");
  assert.ok(runtime.decks.fate.discardPile.includes("fate_024"));
});
