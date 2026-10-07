import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_TILES, CHRONICLE_EVENTS, calculatePropertyRent, getChronicleRoundsRemaining,
  getBloodMoonDefinition, getRegionalChronicleDefinition, getChronicleTargetRegions, getEffectivePurchasePrice, getEffectiveRent, getPropertyGroupTiles, getStartPassReward, type GameState, type RegionType } from "@valenor/shared";
import { advanceChronicleEvents, pickAffectedRegionCount, pickChronicleRegions } from "./chronicle-event-service";
import { RoomManager } from "../room-manager";
import { completeBankruptcyTurn } from "./bankruptcy-service";
import { EconomyService } from "./economy-service";
import { TurnEngine } from "./turn-engine";

function game(tileIndex = 1): GameState {
  return {
    roomId: "VAL-CHRONICLE", status: "playing", config: { mode: "chronicles" },
    players: ["p1", "p2", "p3"].map((id) => ({ id, name: id, type: "human", color: "violet",
      connectionState: "connected", gold: 1500, position: tileIndex, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } })),
    turnOrder: ["p1", "p2", "p3"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "landed",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 1 },
    lastDiceRoll: { die1: 3, die2: 4, total: 7, isDouble: false },
    lastMovement: { kind: "normal", sequence: 1, playerId: "p1", from: 0, to: tileIndex, path: [tileIndex], passedStart: false, landedTile: BOARD_TILES[tileIndex]! },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [], trades: [], chronicleEventHistory: [], startedAt: 1
  };
}
function activate(state: GameState, id: string) {
  state.currentRound = 4;
  state.activeChronicleEvent = { ...(id === "blood-moon" ? getBloodMoonDefinition("orcs") : getRegionalChronicleDefinition(CHRONICLE_EVENTS.find(event => event.id === id)!, ["elves", "humans", "orcs", "steppe"])), startedAfterRound: 3,
    startedAtRound: 4, expiresAtRound: 6, startedAt: 1 };
}
function completeRound(state: GameState) {
  const engine = new TurnEngine();
  for (let turn = 0; turn < state.turnOrder.length; turn++) {
    state.turnPhase = "waitingForEndTurn";
    engine.endTurn(state, state.currentPlayerId!, "human");
    engine.beginNextTurn(state);
  }
}

test("region count uses exactly 50/30/15/5 weighting and every subset contains distinct regions", () => {
  const histogram = [0,0,0,0];
  for (let roll = 0; roll < 100; roll++) histogram[pickAffectedRegionCount(roll / 100) - 1]!++;
  assert.deepEqual(histogram, [50,30,15,5]);
  for (const [roll,count,combinationCount] of [[0,1,4],[50,2,6],[80,3,4],[95,4,1]]) {
    const seen = new Set<string>();
    for (let index = 0; index < combinationCount!; index++) {
      const choices = [roll!, index], regions = pickChronicleRegions(() => choices.shift()!);
      assert.equal(regions.length,count); assert.equal(new Set(regions).size,count); seen.add([...regions].sort().join(","));
    }
    assert.equal(seen.size,combinationCount);
  }
});

test("regional selections exclude the previous unordered combination whenever alternatives exist", () => {
  for (const [roll,previous] of [[0,["elves"]],[50,["humans","elves"]],[80,["orcs","humans","elves"]]] as const) {
    const choices = [roll,0], selected = pickChronicleRegions(() => choices.shift()!, previous);
    assert.notDeepEqual([...selected].sort(),[...previous].sort());
  }
  const all: RegionType[] = ["elves","humans","orcs","steppe"], choices = [95,0];
  assert.deepEqual(pickChronicleRegions(() => choices.shift()!,all),all);
});

test("each regional event remembers its last combination across an intervening chronicle", () => {
  for (const id of ["traders-festival","blood-moon","four-realms-peace"]) {
    const state = game(); state.currentRound = 10;
    const definition = CHRONICLE_EVENTS.find(event => event.id === id)!;
    state.chronicleEventHistory = [
      {...getRegionalChronicleDefinition(definition,["elves","humans"]),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1},
      {...CHRONICLE_EVENTS[2]!,startedAfterRound:6,startedAtRound:7,expiresAtRound:9,startedAt:2}
    ];
    const candidateIndex = CHRONICLE_EVENTS.filter(event => event.id !== "runegate-blessing").findIndex(event => event.id === id);
    const choices = [candidateIndex,50,0]; advanceChronicleEvents(state,() => choices.shift()!);
    assert.equal(state.activeChronicleEvent!.id,id); assert.equal(state.activeChronicleEvent!.targetRegions!.length,2);
    assert.notDeepEqual(state.activeChronicleEvent!.targetRegions,["elves","humans"]);
  }
});

test("regional purchase and rent effects affect only selected regions and declared tile types", () => {
  const before = JSON.stringify(BOARD_TILES);
  for (const event of CHRONICLE_EVENTS.filter(event => event.effectType !== "startPassBonus")) {
    const state = game(); state.currentRound = 4;
    state.activeChronicleEvent = {...getRegionalChronicleDefinition(event,["elves","orcs"]),startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
    for (const tile of BOARD_TILES.filter(tile => tile.economy)) {
      const selected = Boolean(tile.region && ["elves","orcs"].includes(tile.region));
      assert.equal(getEffectivePurchasePrice(state,tile), Math.round(tile.economy!.purchasePrice * (selected && event.effectType === "purchaseDiscount" ? .8 : 1)));
      state.propertyOwnerships = [{tileIndex:tile.index,ownerId:"p2",buildingLevel:0,mortgaged:false}];
      const plain = {...state}; delete plain.activeChronicleEvent;
      const base = getEffectiveRent(plain,tile,"p2");
      const factor = selected && event.affectedTileTypes!.includes(tile.type) ? event.effectType === "rentDiscount" ? .75 : event.effectType === "regionalRentBonus" ? 1.25 : 1 : 1;
      assert.equal(getEffectiveRent(state,tile,"p2"),Math.round(base * factor)); state.propertyOwnerships = [];
    }
    state.turnPhase = "auction"; assert.equal(getEffectivePurchasePrice(state,BOARD_TILES[1]!),BOARD_TILES[1]!.economy!.purchasePrice);
    const regionless = {...BOARD_TILES[1]!}; delete regionless.region;
    state.propertyOwnerships = [{tileIndex:1,ownerId:"p2",buildingLevel:0,mortgaged:false}];
    assert.equal(getEffectiveRent(state,regionless,"p2"),2);
  }
  assert.equal(JSON.stringify(BOARD_TILES),before);
});

test("legacy single-region snapshots migrate to targetRegions and blessing remains non-regional", () => {
  const legacy = {...CHRONICLE_EVENTS[1]!,targetRegion:"orcs" as const}; assert.deepEqual(getChronicleTargetRegions(legacy),["orcs"]);
  const migrated = getRegionalChronicleDefinition(legacy,["elves","steppe"]); assert.equal(migrated.targetRegion,undefined); assert.deepEqual(migrated.targetRegions,["elves","steppe"]);
  const blessing = getRegionalChronicleDefinition(CHRONICLE_EVENTS[2]!,["orcs"]); assert.equal(blessing.targetRegions,undefined); assert.deepEqual(getChronicleTargetRegions(blessing),[]);
  const state = game(); state.currentRound = 4; state.activeChronicleEvent = {...blessing,startedAfterRound:3,startedAtRound:4,expiresAtRound:6,startedAt:1};
  assert.equal(getStartPassReward(state),300); state.players[0]!.relics = ["golden-feather"]; state.players[0]!.armedRelics = ["golden-feather"]; assert.equal(getStartPassReward(state),400);
});

test("active and historical targetRegion arrays remain isolated from client snapshots", () => {
  const manager = new RoomManager(), {room} = manager.createRoom("host"); manager.joinRoom(room.code,"human","s1"); manager.addComputer(room.code,"host"); manager.startGame(room.code,"host");
  const live = (manager as unknown as {rooms:Map<string,{gameState:GameState}>}).rooms.get(room.code)!.gameState;
  live.currentRound = 4; const choices = [1,50,0]; advanceChronicleEvents(live,() => choices.shift()!);
  const snapshot = manager.getGameState(room.code)!; snapshot.activeChronicleEvent!.targetRegions!.length = 0;
  snapshot.chronicleEventHistory![0]!.targetRegions![0] = "steppe"; snapshot.activeChronicleEvent!.affectedTileTypes = [];
  const next = manager.getGameState(room.code)!; assert.deepEqual(next.activeChronicleEvent!.targetRegions,["elves","humans"]); assert.deepEqual(next.chronicleEventHistory![0]!.targetRegions,["elves","humans"]);
});

test("the server starts the first of exactly four chronicles after round 3 completes", () => {
  const state = game();
  assert.equal(CHRONICLE_EVENTS.length, 4);
  completeRound(state); completeRound(state);
  assert.equal(state.currentRound, 3);
  assert.equal(Boolean(state.activeChronicleEvent), false);
  completeRound(state);
  assert.equal(state.currentRound, 4);
  assert.equal(state.activeChronicleEvent?.startedAfterRound, 3);
  assert.equal(state.activeChronicleEvent?.startedAtRound, 4);
  assert.equal(state.chronicleEventHistory?.length, 1);
});

test("repeated round processing keeps exactly one active chronicle and one history entry", () => {
  const state = game(); state.currentRound = 4;
  advanceChronicleEvents(state, () => 0);
  const active = structuredClone(state.activeChronicleEvent);
  advanceChronicleEvents(state, () => 1); advanceChronicleEvents(state, () => 2);
  assert.deepEqual(state.activeChronicleEvent, active);
  assert.equal(state.chronicleEventHistory?.length, 1);
});

test("a chronicle lasts two full subsequent rounds and the next begins after round 6", () => {
  const state = game(); completeRound(state); completeRound(state); completeRound(state);
  assert.equal(getChronicleRoundsRemaining(state), 2);
  completeRound(state);
  assert.equal(getChronicleRoundsRemaining(state), 1);
  completeRound(state);
  assert.equal(state.currentRound, 6);
  assert.equal(Boolean(state.activeChronicleEvent), false);
  assert.equal(getChronicleRoundsRemaining(state), 0);
  completeRound(state);
  assert.equal(state.activeChronicleEvent?.startedAfterRound, 6);
  assert.equal(state.chronicleEventHistory?.length, 2);
});

test("successive chronicles never repeat even when selection always chooses the first candidate", () => {
  const state = game();
  for (let round = 2; round <= 31; round++) { state.currentRound = round; advanceChronicleEvents(state, () => 0); }
  const history = state.chronicleEventHistory!;
  assert.equal(history.length, 10);
  history.slice(1).forEach((event, index) => assert.notEqual(event.id, history[index]!.id));
  assert.deepEqual(history.map(event => event.startedAfterRound), [3,6,9,12,15,18,21,24,27,30]);
});

test("a bankruptcy ending round 3 also triggers the server chronicle", () => {
  const state = game(); state.currentRound = 3; state.currentPlayerId = "p3"; state.currentTurnIndex = 2;
  state.players[2]!.isBankrupt = true;
  completeBankruptcyTurn(state);
  assert.equal(state.currentRound, 4);
  assert.equal(state.activeChronicleEvent?.startedAfterRound, 3);
});

test("traders festival reduces actual unsold purchases without changing owned or board values", () => {
  const economy = new EconomyService();
  const before = JSON.stringify(BOARD_TILES);
  for (const index of [1, 5, 11]) {
    const state = game(index); activate(state, "traders-festival");
    const tile = BOARD_TILES[index]!, basePrice = tile.economy!.purchasePrice;
    const price = Math.round(basePrice * .8);
    state.players[0]!.gold = price;
    economy.resolveLanding(state); economy.buyCurrentTile(state, "p1");
    assert.equal(state.players[0]!.gold, 0);
    assert.equal(state.propertyOwnerships[0]?.ownerId, "p1");
    assert.equal(getEffectivePurchasePrice(state, tile), basePrice);
    state.propertyOwnerships = []; state.currentRound = 6;
    assert.equal(getEffectivePurchasePrice(state, tile), basePrice);
  }
  assert.equal(JSON.stringify(BOARD_TILES), before);
});

test("blood moon increases only the stored realm's rent, including developed land, once", () => {
  const iron = getPropertyGroupTiles("group_eisenoede")[0]!;
  const otherOrc = getPropertyGroupTiles("group_aschelande")[0]!;
  for (const tile of [iron, otherOrc, BOARD_TILES[1]!]) for (const level of [0, 2] as const) {
    const state = game(tile.index); activate(state, "blood-moon");
    state.propertyOwnerships = [{ tileIndex: tile.index, ownerId: "p2", buildingLevel: level, mortgaged: false }];
    const base = calculatePropertyRent(state.propertyOwnerships, tile, "p2");
    const expected = tile.region === "orcs" ? Math.round(base * 1.25) : base;
    new EconomyService().resolveLanding(state);
    assert.equal(state.players[0]!.gold, 1500 - expected);
    assert.equal(state.players[1]!.gold, 1500 + expected);
    state.propertyOwnerships[0]!.mortgaged = true;
    assert.equal(getEffectiveRent(state, tile, "p2"), 0);
  }
});

test("peace reduces property, harbor and utility rent and expires without altering base data", () => {
  for (const [index, base] of [[39, 50], [5, 25], [11, 28]] as const) {
    const state = game(index); activate(state, "four-realms-peace");
    state.propertyOwnerships = [{ tileIndex: index, ownerId: "p2", buildingLevel: 0, mortgaged: false }];
    const economy = new EconomyService(); economy.resolveLanding(state);
    assert.equal(state.players[0]!.gold, 1500 - Math.round(base * .75));
    state.currentRound = 6;
    assert.equal(economy.calculateRent(state, BOARD_TILES[index]!, "p2"), base);
  }
});

test("runegate blessing pays a total of 300 once per normal or card passage, otherwise 200", () => {
  const state = game();
  assert.equal(getStartPassReward(state), 200);
  activate(state, "runegate-blessing");
  const economy = new EconomyService();
  state.lastMovement = { ...state.lastMovement!, from: 38, path: [39,0,1], passedStart: true };
  economy.resolveLanding(state);
  assert.equal(state.players[0]!.gold, 1800);
  state.turnPhase = "landed"; economy.resolveLanding(state); economy.awardStartPass(state);
  assert.equal(state.players[0]!.gold, 1800);
  state.lastMovement = { ...state.lastMovement!, kind: "card", sequence: 2, from: 39, to: 0, path: [0], landedTile: BOARD_TILES[0]! };
  economy.resolveLanding(state);
  assert.equal(state.players[0]!.gold, 2100);
  state.currentRound = 6;
  assert.equal(getStartPassReward(state), 200);
});
