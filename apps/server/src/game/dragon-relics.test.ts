import { startReadyGame } from "../test-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_TILES, CHRONICLE_EVENTS, DUNGEON_TILE_INDEX, GO_TO_DUNGEON_TILE_INDEX, RELIC_DEFINITIONS,
  getBloodMoonDefinition, getEffectiveRent, isBuyableTile, type GameState, type RegionType, type RelicId } from "@valenor/shared";
import { activateRelic, advanceChronicleEvents, advanceWanderingDragon, initializeWanderingDragon, isDragonEncounterTile, resolveDragonEncounter } from "./chronicle-event-service";
import { EconomyService } from "./economy-service";
import { TurnEngine } from "./turn-engine";
import { DiceService } from "./dice-service";
import { CardService } from "./card-service";
import { RoomManager } from "../room-manager";

function game(index = 1): GameState {
  return {
    roomId: "VAL-DRAGON", status: "playing", config: { mode: "chronicles" },
    players: ["p1","p2"].map(id => ({ id, name: id, type: "human", color: "violet", characterId: "elvenSpellweaver" as const, connectionState: "connected",
      gold: 1500, position: index, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }, relics: [] })),
    turnOrder: ["p1","p2"], orderRolls: [{ playerId: "p1", rolls: [] }, { playerId: "p2", rolls: [] }], orderContenders: ["p1","p2"], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "landed",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 1 },
    lastMovement: { kind: "normal", sequence: 1, playerId: "p1", from: 0, to: index, path: [index], passedStart: false, landedTile: BOARD_TILES[index]! },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [], trades: [], chronicleEventHistory: [], startedAt: 1
  };
}
const dice = (...values: number[]) => new DiceService({ rollDie: () => { const value = values.shift(); assert.notEqual(value, undefined); return value!; } });

test("activation is separate from ownership, retains the relic and rejects invalid requests", () => {
  for (const id of ["merchant-seal", "dungeon-amulet", "golden-feather"] as const) {
    const state = game(); state.players[0]!.relics = [id];
    activateRelic(state, "p1", id);
    assert.deepEqual(state.players[0]!.relics, [id]); assert.deepEqual(state.players[0]!.armedRelics, [id]);
    assert.equal(state.economyLog.length, 0);
    assert.throws(() => activateRelic(state, "p1", id), /bereits/);
    assert.throws(() => activateRelic(state, "p2", id), /besitzt/);
  }
  const invalid = game(); invalid.players[0]!.relics = ["runestone"];
  assert.throws(() => activateRelic(invalid, "p1", "runestone"));
  assert.throws(() => activateRelic(invalid, "p1", "missing" as RelicId));
  invalid.players[0]!.relics = ["golden-feather"]; invalid.players[0]!.connectionState = "disconnected";
  assert.throws(() => activateRelic(invalid, "p1", "golden-feather"));
  invalid.players[0]!.connectionState = "connected"; invalid.players[0]!.isBankrupt = true;
  assert.throws(() => activateRelic(invalid, "p1", "golden-feather"));
  invalid.players[0]!.isBankrupt = false; invalid.status = "finished";
  assert.throws(() => activateRelic(invalid, "p1", "golden-feather"));
});

test("unarmed relics do not discount purchases, reward passage or prevent detention", () => {
  const purchase = game(); purchase.players[0]!.relics = ["merchant-seal"];
  const economy = new EconomyService(); economy.resolveLanding(purchase); economy.buyCurrentTile(purchase, "p1");
  assert.equal(purchase.players[0]!.gold, 1440); assert.deepEqual(purchase.players[0]!.relics, ["merchant-seal"]);
  const passage = game(); passage.players[0]!.relics = ["golden-feather"]; passage.lastMovement!.passedStart = true;
  economy.awardStartPass(passage); assert.equal(passage.players[0]!.gold, 1700); assert.deepEqual(passage.players[0]!.relics, ["golden-feather"]);
  const detention = game(GO_TO_DUNGEON_TILE_INDEX); detention.players[0]!.relics = ["dungeon-amulet"];
  new TurnEngine().sendCurrentPlayerToDungeon(detention);
  assert.equal(detention.players[0]!.dungeon.inDungeon, true); assert.deepEqual(detention.players[0]!.relics, ["dungeon-amulet"]);
});

test("blood moon can select every realm and applies rent only using its stored target", () => {
  for (const [index, region] of (["elves","humans","orcs","steppe"] as RegionType[]).entries()) {
    const state = game(); state.currentRound = 4; const choices = [1, 0, index];
    advanceChronicleEvents(state, () => choices.shift()!);
    assert.deepEqual(state.activeChronicleEvent?.targetRegions, [region]);
    assert.equal(state.activeChronicleEvent?.title, getBloodMoonDefinition(region).title);
    for (const tile of BOARD_TILES.filter(tile => tile.type === "property")) {
      state.propertyOwnerships = [{ tileIndex: tile.index, ownerId: "p2", buildingLevel: 1, mortgaged: false }];
      const base = tile.economy!.rentSchedule![1];
      assert.equal(getEffectiveRent(state, tile, "p2"), tile.region === region ? Math.round(base * 1.25) : base);
    }
  }
});

test("blood moon excludes the previous blood moon realm even after another chronicle intervenes", () => {
  const state = game(); state.currentRound = 4;
  const choices = [1, 0, 0]; advanceChronicleEvents(state, () => choices.shift()!);
  const previous = state.activeChronicleEvent!.targetRegions;
  state.currentRound = 7; advanceChronicleEvents(state, () => 0);
  state.currentRound = 10; advanceChronicleEvents(state, () => 0);
  assert.equal(state.activeChronicleEvent?.id, "blood-moon");
  assert.notDeepEqual(state.activeChronicleEvent?.targetRegions, previous);
});

test("dragon starts only on buyable fields and changes every two full rounds by at least five fields", () => {
  const state = game();
  for (let index = 0; index < 28; index++) {
    initializeWanderingDragon(state, count => index % count);
    assert.equal(isBuyableTile(BOARD_TILES[state.wanderingDragon!.tileIndex]!), true);
  }
  initializeWanderingDragon(state, () => 0);
  for (let round = 2; round <= 15; round++) {
    const previous = state.wanderingDragon!.tileIndex;
    state.currentRound = round; advanceWanderingDragon(state, () => 0);
    const next = state.wanderingDragon!.tileIndex;
    if (round % 2 === 0) assert.equal(next, previous);
    else assert.ok(Math.min(Math.abs(next - previous), 40 - Math.abs(next - previous)) >= 5);
    assert.ok(isBuyableTile(BOARD_TILES[next]!));
  }
});

test("dragon ignores passage outside its territory and card or dungeon movements", () => {
  for (const kind of ["normal","card","dungeonTransfer"] as const) {
    const state = game(kind === "normal" ? 3 : 1);
    initializeWanderingDragon(state, () => 0);
    state.lastMovement!.kind = kind; state.lastMovement!.path = [1, state.lastMovement!.to];
    resolveDragonEncounter(state, () => 0);
    assert.deepEqual(state.players[0]!.relics, []);
  }
  const state = game(); initializeWanderingDragon(state, () => 0); state.currentRound = 2;
  resolveDragonEncounter(state, () => 0);
  assert.deepEqual(state.players[0]!.relics, ["runestone"]);
  assert.notEqual(state.wanderingDragon!.tileIndex, 1);
  assert.equal(state.wanderingDragon!.nextMoveRound, 4);
  assert.equal(state.wanderingDragon!.encounterSequence, 1);
  state.wanderingDragon!.tileIndex = 1; resolveDragonEncounter(state, () => 0);
  assert.equal(state.economyLog.length, 1);
});

test("dragon territory covers exactly both cyclic neighbors and relocates after every encounter", () => {
  for (const [dragon, landings] of [[15, [13,14,15,16,17]], [0, [38,39,0,1,2]]] as const) {
    for (const landing of landings) {
      const expected = dragon === 15 ? landing >= 14 && landing <= 16 : [39,0,1].includes(landing);
      assert.equal(isDragonEncounterTile(landing, dragon), expected);
      const state = game(landing); initializeWanderingDragon(state, () => 0);
      state.wanderingDragon!.tileIndex = dragon;
      resolveDragonEncounter(state, () => 0);
      assert.equal(state.players[0]!.relics!.length, expected ? 1 : 0);
      if (expected) { assert.notEqual(state.wanderingDragon!.tileIndex, dragon); assert.equal(state.wanderingDragon!.nextMoveRound, 3); }
    }
  }
  const synchronizing = game(15); synchronizing.turnPhase = "waitingForRoll";
  initializeWanderingDragon(synchronizing, () => 0); synchronizing.wanderingDragon!.tileIndex = 15;
  resolveDragonEncounter(synchronizing); assert.deepEqual(synchronizing.players[0]!.relics, []);
  const detention = game(GO_TO_DUNGEON_TILE_INDEX); initializeWanderingDragon(detention, () => 0);
  detention.wanderingDragon!.tileIndex = GO_TO_DUNGEON_TILE_INDEX + 1;
  resolveDragonEncounter(detention); assert.deepEqual(detention.players[0]!.relics, []);
});

test("dragon awards distinct relics up to two slots, then records a full inventory without a third", () => {
  const state = game(); initializeWanderingDragon(state, () => 0);
  for (let sequence = 1; sequence <= 3; sequence++) {
    state.lastMovement!.sequence = sequence; state.wanderingDragon!.tileIndex = 1;
    resolveDragonEncounter(state, () => 0);
    assert.equal(state.players[0]!.relics!.length, Math.min(sequence, 2));
  }
  assert.equal(new Set(state.players[0]!.relics).size, 2);
  assert.equal(state.economyLog.at(-1)!.relicId, undefined);
  assert.match(state.economyLog.at(-1)!.message, /gefüllte Reliktplätze/);
  assert.equal(Object.keys(RELIC_DEFINITIONS).length, 4);
});

test("merchant seal discounts and consumes only a successful direct purchase, stacking with the festival", () => {
  const state = game(), economy = new EconomyService(); state.players[0]!.relics = ["merchant-seal"];
  activateRelic(state, "p1", "merchant-seal");
  economy.resolveLanding(state); state.players[0]!.gold = 44;
  assert.throws(() => economy.buyCurrentTile(state, "p1"), /reicht/);
  assert.deepEqual(state.players[0]!.relics, ["merchant-seal"]);
  state.players[0]!.gold = 45; economy.buyCurrentTile(state, "p1");
  assert.equal(state.players[0]!.gold, 0); assert.deepEqual(state.players[0]!.relics, []);
  assert.deepEqual(state.players[0]!.armedRelics, []);
  assert.equal(state.economyLog.filter(entry => entry.kind === "relic" && entry.relicId === "merchant-seal").length, 1);
  const festival = game(); festival.currentRound = 4; festival.players[0]!.relics = ["merchant-seal"];
  activateRelic(festival, "p1", "merchant-seal");
  festival.activeChronicleEvent = { ...CHRONICLE_EVENTS[0]!, targetRegions: ["elves"], startedAfterRound: 3, startedAtRound: 4, expiresAtRound: 6, startedAt: 1 };
  economy.resolveLanding(festival); economy.buyCurrentTile(festival, "p1");
  assert.equal(festival.players[0]!.gold, 1464);
  const auction = game(); auction.players[1]!.relics = ["merchant-seal"];
  activateRelic(auction, "p2", "merchant-seal");
  economy.resolveLanding(auction); economy.declineCurrentTile(auction, "p1");
  economy.bid(auction, "p2", 50); economy.withdraw(auction, "p1");
  assert.equal(auction.players[1]!.gold, 1450); assert.deepEqual(auction.players[1]!.relics, ["merchant-seal"]);
  assert.deepEqual(auction.players[1]!.armedRelics, ["merchant-seal"]);
});

test("golden feather adds 100 to normal or blessed passage exactly once and is then consumed", () => {
  for (const blessed of [false, true]) {
    const state = game(); state.players[0]!.relics = ["golden-feather"];
    activateRelic(state, "p1", "golden-feather");
    if (blessed) { state.currentRound = 4; state.activeChronicleEvent = { ...CHRONICLE_EVENTS[2]!, startedAfterRound: 3, startedAtRound: 4, expiresAtRound: 6, startedAt: 1 }; }
    state.lastMovement!.passedStart = true; state.lastMovement!.from = 39;
    const economy = new EconomyService(); economy.resolveLanding(state);
    assert.equal(state.players[0]!.gold, blessed ? 1900 : 1800);
    assert.deepEqual(state.players[0]!.relics, []);
    assert.deepEqual(state.players[0]!.armedRelics, []);
    assert.equal(state.economyLog.filter(entry => entry.kind === "relic" && entry.relicId === "golden-feather").length, 1);
    state.turnPhase = "landed"; economy.resolveLanding(state);
    assert.equal(state.players[0]!.gold, blessed ? 1900 : 1800);
  }
});

test("dungeon amulet blocks the dungeon field, third double and card detention, but not visits", () => {
  const field = game(GO_TO_DUNGEON_TILE_INDEX); field.players[0]!.relics = ["dungeon-amulet"];
  activateRelic(field, "p1", "dungeon-amulet");
  new TurnEngine().sendCurrentPlayerToDungeon(field);
  assert.equal(field.players[0]!.position, GO_TO_DUNGEON_TILE_INDEX);
  assert.equal(field.players[0]!.dungeon.inDungeon, false); assert.deepEqual(field.players[0]!.relics, []);
  assert.equal(field.turnPhase, "waitingForEndTurn");
  const bonus = game(GO_TO_DUNGEON_TILE_INDEX); bonus.players[0]!.relics = ["dungeon-amulet"];
  activateRelic(bonus, "p1", "dungeon-amulet");
  bonus.turnContext.consecutiveDoubles = 1; bonus.turnContext.pendingExtraRoll = true;
  const bonusEngine = new TurnEngine(); bonusEngine.sendCurrentPlayerToDungeon(bonus);
  assert.equal(bonus.turnContext.pendingExtraRoll, true);
  bonusEngine.endTurn(bonus, "p1", "human");
  assert.equal(bonus.currentPlayerId, "p1"); assert.equal(bonus.turnPhase, "waitingForRoll");
  const third = game(5); third.turnPhase = "waitingForRoll"; third.players[0]!.relics = ["dungeon-amulet"];
  activateRelic(third, "p1", "dungeon-amulet");
  third.turnContext.consecutiveDoubles = 2; new TurnEngine(dice(6,6)).rollTurn(third, "p1", "human");
  assert.equal(third.players[0]!.position, 5); assert.equal(third.players[0]!.dungeon.inDungeon, false);
  assert.equal(third.turnPhase, "waitingForEndTurn"); assert.deepEqual(third.players[0]!.relics, []);
  const card = game(2); card.turnPhase = "awaitingCardDraw"; card.players[0]!.relics = ["dungeon-amulet"];
  activateRelic(card, "p1", "dungeon-amulet");
  const service = new CardService(), runtime = service.createRuntime();
  runtime.decks.fate.drawPile = ["fate_023", ...runtime.decks.fate.drawPile.filter(id => id !== "fate_023")];
  service.draw(card, runtime, "p1", "human");
  assert.equal(card.players[0]!.position, 2); assert.equal(card.players[0]!.dungeon.inDungeon, false);
  assert.deepEqual(card.players[0]!.relics, []); assert.equal(card.turnPhase, "cardAcknowledgement");
  const back = game(36); back.turnPhase = "awaitingCardDraw"; back.players[0]!.relics = ["dungeon-amulet"];
  activateRelic(back, "p1", "dungeon-amulet");
  const backRuntime = service.createRuntime();
  backRuntime.decks.adventure.drawPile = ["adv_014", ...backRuntime.decks.adventure.drawPile.filter(id => id !== "adv_014")];
  service.draw(back, backRuntime, "p1", "human"); service.completeMovement(back, backRuntime);
  assert.equal(back.players[0]!.position, GO_TO_DUNGEON_TILE_INDEX);
  service.sendToDungeonFromLanding(back); service.resumeAfterLanding(back, backRuntime);
  assert.equal(back.turnPhase, "cardAcknowledgement");
  assert.equal(back.players[0]!.dungeon.inDungeon, false); assert.deepEqual(back.players[0]!.relics, []);
  const visit = game(DUNGEON_TILE_INDEX); visit.players[0]!.relics = ["dungeon-amulet"];
  activateRelic(visit, "p1", "dungeon-amulet");
  new EconomyService().resolveLanding(visit); assert.deepEqual(visit.players[0]!.relics, ["dungeon-amulet"]);
  assert.deepEqual(visit.players[0]!.armedRelics, ["dungeon-amulet"]);
});

test("runestone replaces a pending normal roll without old movement, doubles or amulet side effects", () => {
  const state = game(37); state.turnPhase = "waitingForRoll"; state.players[0]!.relics = ["runestone","dungeon-amulet"];
  activateRelic(state, "p1", "dungeon-amulet");
  state.turnContext.consecutiveDoubles = 2; const engine = new TurnEngine(dice(6,6,2,3));
  engine.rollTurn(state, "p1", "human");
  assert.equal(state.turnContext.awaitingRuneStoneDecision, true); assert.equal(Boolean(state.lastMovement), false);
  assert.equal(state.players[0]!.dungeon.inDungeon, false); assert.equal(state.turnContext.consecutiveDoubles, 2);
  assert.throws(() => engine.beginMovement(state), /bestätigt/);
  assert.throws(() => engine.decideRuneStone(state, "p2", "human", true));
  engine.decideRuneStone(state, "p1", "human", true);
  assert.equal(state.lastDiceRoll!.total, 5); assert.equal(state.lastMovement!.to, 2);
  assert.equal(state.economyLog.filter(entry => entry.kind === "relic" && entry.relicId === "runestone").length, 1);
  assert.deepEqual(state.players[0]!.relics, ["dungeon-amulet"]);
  assert.equal(state.turnContext.consecutiveDoubles, 0); assert.equal(state.turnContext.pendingExtraRoll, false);
  assert.throws(() => engine.decideRuneStone(state, "p1", "human", true));
  engine.beginMovement(state); engine.completeMovement(state); assert.equal(state.players[0]!.position, 2);
});

test("keeping a roll retains the runestone and resolves that roll's doubles exactly once", () => {
  const state = game(); state.turnPhase = "waitingForRoll"; state.players[0]!.relics = ["runestone"];
  const engine = new TurnEngine(dice(3,3)); engine.rollTurn(state, "p1", "human");
  engine.decideRuneStone(state, "p1", "human", false);
  assert.deepEqual(state.players[0]!.relics, ["runestone"]);
  assert.equal(state.lastDiceRoll!.total, 6); assert.equal(state.turnContext.consecutiveDoubles, 1);
  assert.equal(state.turnContext.pendingExtraRoll, true);
  assert.throws(() => engine.decideRuneStone(state, "p1", "human", false));
});

test("runestone never affects start-order rolls or dungeon rolls", () => {
  const order = game(); order.turnPhase = "determiningOrder"; order.players[0]!.relics = ["runestone"];
  const engine = new TurnEngine(dice(2,3,3,4)); engine.rollForOrder(order, "p1", "human");
  assert.throws(() => engine.decideRuneStone(order, "p1", "human", true));
  assert.deepEqual(order.players[0]!.relics, ["runestone"]);
  const dungeon = game(DUNGEON_TILE_INDEX); dungeon.turnPhase = "dungeonDecision"; dungeon.players[0]!.dungeon.inDungeon = true;
  dungeon.players[0]!.relics = ["runestone"]; engine.rollDungeon(dungeon, "p1", "human");
  assert.throws(() => engine.decideRuneStone(dungeon, "p1", "human", true));
  assert.deepEqual(dungeon.players[0]!.relics, ["runestone"]);
});

test("a feather received from the dragon after passing start applies to the next passage, and snapshots isolate relics", () => {
  const manager = new RoomManager(undefined, undefined, undefined, () => 2);
  const { room } = manager.createRoom("host"); const human = manager.joinRoom(room.code, "p1", "socket");
  manager.addComputer(room.code, "host"); startReadyGame(manager,room.code, "host");
  const live = (manager as unknown as { rooms: Map<string, { gameState: GameState }> }).rooms.get(room.code)!.gameState;
  live.currentPlayerId = human.player.id; live.turnPhase = "landed";
  live.players[0]!.relics = ["runestone"]; live.wanderingDragon!.tileIndex = 1;
  live.lastMovement = { kind: "normal", sequence: 1, playerId: human.player.id, from: 39, to: 1, path: [0,1], passedStart: true, landedTile: BOARD_TILES[1]! };
  const snapshot = manager.resolveLanding(room.code);
  const questRewards = snapshot.economyLog.filter(entry => entry.kind === "quest").reduce((total, entry) => total + (entry.amount ?? 0), 0);
  assert.equal(snapshot.players[0]!.gold, 1700 + questRewards); assert.ok(snapshot.players[0]!.relics!.includes("golden-feather"));
  snapshot.players[0]!.relics!.length = 0; snapshot.wanderingDragon!.tileIndex = 0;
  assert.equal(manager.getGameState(room.code)!.players[0]!.relics!.length, 2);
  assert.notEqual(manager.getGameState(room.code)!.wanderingDragon!.tileIndex, 0);
  const activated = manager.activateRelic(room.code, human.player.id, "golden-feather");
  activated.players[0]!.armedRelics!.length = 0;
  assert.deepEqual(manager.getGameState(room.code)!.players[0]!.armedRelics, ["golden-feather"]);
});
