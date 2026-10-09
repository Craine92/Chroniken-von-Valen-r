import { startReadyGame } from "./test-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_CORNER_TILE_INDICES, BOARD_TILES, CHRONICLE_EVENTS, DUNGEON_TILE_INDEX, NORMAL_STARTING_GOLD, SOCKET_EVENTS, validateBoardTiles, type GameState } from "@valenor/shared";
import { RoomManager } from "./room-manager";
import { DiceService, type RandomSource } from "./game/dice-service";
import { FakeTimeSource } from "./game/quick-game-clock-service";

class TestSequenceRandom implements RandomSource {
  constructor(private readonly values: number[]) {}
  rollDie(): number { return this.values.shift()!; }
}

function roomWithHuman() {
  const manager = new RoomManager(undefined, undefined, undefined, () => 0);
  const { room } = manager.createRoom("host-1");
  const human = manager.joinRoom(room.code, "Philipp", "socket-1");
  return { manager, roomCode: room.code, human };
}

test("chronicle snapshots stay isolated and blessed passage is paid before drawing a card", () => {
  const { manager, roomCode, human } = roomWithHuman();
  manager.addComputer(roomCode, "host-1"); startReadyGame(manager,roomCode, "host-1");
  const live = (manager as unknown as { rooms: Map<string, { gameState: GameState }> }).rooms.get(roomCode)!.gameState;
  live.currentRound = 4; live.currentPlayerId = human.player.id;
  live.activeChronicleEvent = { ...CHRONICLE_EVENTS[2]!, startedAfterRound: 3, startedAtRound: 4, expiresAtRound: 6, startedAt: 1 };
  live.chronicleEventHistory = [{ ...live.activeChronicleEvent }];
  const snapshot = manager.getGameState(roomCode)!;
  snapshot.activeChronicleEvent!.title = "Changed on client";
  snapshot.chronicleEventHistory![0]!.title = "Changed in history";
  snapshot.chronicleEventHistory!.length = 0;
  assert.equal(manager.getGameState(roomCode)!.activeChronicleEvent!.title, "Segen des Runentors");
  assert.equal(manager.getGameState(roomCode)!.chronicleEventHistory![0]!.title, "Segen des Runentors");
  live.turnPhase = "landed";
  live.lastMovement = { kind: "card", sequence: 1, playerId: human.player.id, from: 39, to: 2, path: [0,1,2], passedStart: true, landedTile: BOARD_TILES[2]! };
  const landed = manager.resolveLanding(roomCode);
  assert.equal(landed.turnPhase, "awaitingCardDraw");
  const expectedGold = 1800 + landed.economyLog.filter(entry => entry.kind === "quest").reduce((total, entry) => total + (entry.amount ?? 0), 0);
  assert.equal(landed.players[0]!.gold, expectedGold);
  assert.throws(() => manager.resolveLanding(roomCode));
  assert.equal(manager.getGameState(roomCode)!.players[0]!.gold, expectedGold);
});

test("humans choose free lobby colors and occupied human colors fail without changing the room", () => {
  const { manager, roomCode, human } = roomWithHuman();
  let room = manager.updatePlayerColor(roomCode, human.player.id, "red", "socket-1");
  assert.equal(room.players[0]!.color,"red");
  const other = manager.joinRoom(roomCode,"Myrra","socket-2");
  const before = manager.getRoom(roomCode);
  assert.throws(()=>manager.updatePlayerColor(roomCode,other.player.id,"red","socket-2"),/belegt/);
  assert.deepEqual(manager.getRoom(roomCode),before);
  room.players[0]!.color="blue";
  assert.equal(manager.getRoom(roomCode)!.players[0]!.color,"red");
  assert.equal(manager.joinRoom(roomCode,"Philipp","new-socket",human.playerToken).player.color,"red");
});

test("a human color request swaps the NPC color without duplicates in a full lobby and persists into the game", () => {
  const { manager, roomCode, human } = roomWithHuman();
  for(let index=0;index<3;index++) manager.addComputer(roomCode,"host-1");
  for(const color of ["green","blue","red","violet"] as const) {
    const previous = manager.getRoom(roomCode)!;
    const npc = previous.players.find(player=>player.color===color&&player.type==="computer");
    const room = manager.updatePlayerColor(roomCode,human.player.id,color,"socket-1");
    assert.equal(room.players[0]!.color,color);
    assert.equal(new Set(room.players.map(player=>player.color)).size,4);
    if(npc) assert.equal(room.players.find(player=>player.id===npc.id)!.color,previous.players[0]!.color);
  }
  const room = manager.updatePlayerColor(roomCode,human.player.id,"blue","socket-1");
  const started = startReadyGame(manager,roomCode,"host-1");
  assert.deepEqual(started.players.map(player=>player.color),room.players.map(player=>player.color));
  assert.throws(()=>manager.updatePlayerColor(roomCode,human.player.id,"red","socket-1"),/Spielbeginn/);
});

test("lobby color changes validate player, socket, type, connection and runtime color values", () => {
  const { manager, roomCode, human } = roomWithHuman();
  const npc = manager.addComputer(roomCode,"host-1").players[1]!;
  for(const [id,socket] of [[human.player.id,"wrong-socket"],[npc.id,"socket-1"],["missing","socket-1"]]) {
    assert.throws(()=>manager.updatePlayerColor(roomCode,id!,"blue",socket!));
  }
  for(const color of ["gold",null,{},undefined]) assert.throws(()=>manager.updatePlayerColor(roomCode,human.player.id,color as "blue","socket-1"),/ungültig/);
  manager.disconnectPlayer(roomCode,human.player.id);
  assert.throws(()=>manager.updatePlayerColor(roomCode,human.player.id,"blue","socket-1"));
  assert.equal(new Set(manager.getRoom(roomCode)!.players.map(player=>player.color)).size,2);
});

test("allows one human and one computer to start", () => {
  const { manager, roomCode } = roomWithHuman();
  manager.addComputer(roomCode, "host-1");
  const state = startReadyGame(manager,roomCode, "host-1");
  assert.equal(state.players.length, 2);
  assert.equal(state.status, "playing");
  assert.equal(state.turnPhase, "determiningOrder");
  assert.deepEqual(state.propertyOwnerships, []);
  assert.deepEqual(state.economyLog, []);
  assert.deepEqual(state.buildingBank, { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 });
  assert.equal(state.auction, undefined);
  assert.equal(state.weltenwegPot, 0);
  assert.equal(state.pendingPayment, undefined);
});

test("the separate tavern die consumes one random value, keeps the normal roll intact and rejects replays",()=>{
  let rolls=0;const manager=new RoomManager(new DiceService({rollDie:()=>{rolls++;return 6;}}),undefined,undefined,()=>0);
  const {room}=manager.createRoom('host');const human=manager.joinRoom(room.code,'Myrra','human');manager.addComputer(room.code,'host');startReadyGame(manager,room.code,'host');
  const live=(manager as unknown as {rooms:Map<string,{gameState:GameState}>}).rooms.get(room.code)!.gameState;
  live.currentPlayerId=human.player.id;live.turnPhase='landed';live.turnNumber=1;live.players[0]!.position=20;live.players[0]!.activeQuests=[];live.players[0]!.relics=['runestone'];live.weltenwegPot=400;
  live.turnContext={rollSequence:4,consecutiveDoubles:1,pendingExtraRoll:true};live.lastDiceRoll={die1:1,die2:1,total:2,isDouble:true};
  live.lastMovement={kind:'normal',sequence:4,playerId:human.player.id,from:18,to:20,path:[19,20],passedStart:false,landedTile:BOARD_TILES[20]!};
  manager.resolveLanding(room.code);const normal=structuredClone(live.lastDiceRoll),context=structuredClone(live.turnContext);
  assert.throws(()=>manager.rollTurn(room.code,human.player.id,'human'));assert.throws(()=>manager.decideRuneStone(room.code,human.player.id,'human',true));assert.equal(rolls,0);
  assert.throws(()=>manager.chooseTavern(room.code,human.player.id,'computer','gamble'));
  const snapshot=manager.chooseTavern(room.code,human.player.id,'human','gamble');snapshot.tavern!.pot=900;assert.equal(manager.getGameState(room.code)!.tavern!.pot,400);
  live.players[0]!.connectionState='disconnected';assert.throws(()=>manager.resolveTavernGamble(room.code));assert.equal(rolls,0);live.players[0]!.connectionState='connected';
  const result=manager.resolveTavernGamble(room.code);assert.equal(rolls,1);assert.equal(result.players[0]!.gold,2300);assert.equal(result.tavern!.payout,800);assert.deepEqual(result.lastDiceRoll,normal);assert.deepEqual(result.turnContext,context);
  assert.throws(()=>manager.resolveTavernGamble(room.code));assert.equal(rolls,1);
});

test("allows one human and three computers to start", () => {
  const { manager, roomCode } = roomWithHuman();
  manager.addComputer(roomCode, "host-1");
  manager.addComputer(roomCode, "host-1");
  manager.addComputer(roomCode, "host-1");
  const state = startReadyGame(manager,roomCode, "host-1");
  assert.equal(state.players.length, 4);
  assert.equal(state.status, "playing");
  assert.equal(state.turnPhase, "determiningOrder");
  assert.deepEqual(state.propertyOwnerships, []);
  assert.deepEqual(state.economyLog, []);
});

test("does not allow one human to start alone", () => {
  const { manager, roomCode } = roomWithHuman();
  assert.throws(() => startReadyGame(manager,roomCode, "host-1"), /Mindestens zwei/);
});

test("rejects a seventh participant", () => {
  const { manager, roomCode } = roomWithHuman();
  manager.addComputer(roomCode, "host-1");
  manager.addComputer(roomCode, "host-1");
  manager.addComputer(roomCode, "host-1");
  manager.addComputer(roomCode, "host-1");
  manager.addComputer(roomCode, "host-1");
  assert.throws(() => manager.joinRoom(roomCode, "Justine", "socket-2"), /vollständig/);
});

test("removing a computer frees its slot", () => {
  const { manager, roomCode } = roomWithHuman();
  const withComputer = manager.addComputer(roomCode, "host-1");
  const computer = withComputer.players.find((player) => player.type === "computer")!;
  const updated = manager.removeComputer(roomCode, computer.id, "host-1");
  assert.equal(updated.players.length, 1);
  assert.doesNotThrow(() => manager.joinRoom(roomCode, "Justine", "socket-2"));
});

test("computer players receive distinct colors and no socket", () => {
  const { manager, roomCode } = roomWithHuman();
  const firstRoom = manager.addComputer(roomCode, "host-1");
  const secondRoom = manager.addComputer(roomCode, "host-1");
  const computers = secondRoom.players.filter((player) => player.type === "computer");
  assert.notEqual(computers[0]?.color, computers[1]?.color);
  assert.equal(manager.hasSocket(roomCode, computers[0]!.id), false);
  assert.equal(firstRoom.players[1]?.type, "computer");
});

test("stores chronicles mode without a quick duration", () => {
  const { manager, roomCode } = roomWithHuman();
  const room = manager.updateConfig(roomCode, { mode: "chronicles" }, "host-1");
  assert.deepEqual(room.config, { mode: "chronicles", aiDifficulty: "normal" });
});

test("stores quick mode with 75 minutes", () => {
  const { manager, roomCode } = roomWithHuman();
  const room = manager.updateConfig(
    roomCode,
    { mode: "quick", quickGameDurationMinutes: 75 },
    "host-1"
  );
  assert.deepEqual(room.config, { mode: "quick", quickGameDurationMinutes: 75, aiDifficulty: "normal" });
});

test("rejects an invalid quick duration", () => {
  const { manager, roomCode } = roomWithHuman();
  assert.throws(
    () => manager.updateConfig(
      roomCode,
      { mode: "quick", quickGameDurationMinutes: 45 as 60 },
      "host-1"
    ),
    /60, 75 oder 90/
  );
});

test("game start creates state at position zero with central starting gold", () => {
  const { manager, roomCode } = roomWithHuman();
  manager.addComputer(roomCode, "host-1");
  const state = startReadyGame(manager,roomCode, "host-1");
  assert.equal(state.roomId, roomCode);
  assert.equal(state.status, "playing");
  assert.equal(state.currentRound, 1);
  assert.ok(state.players.every((player) => player.position === 0));
  assert.ok(state.players.every((player) => player.gold === NORMAL_STARTING_GOLD));
});

test("reconnects a human during a running game without losing state", () => {
  const { manager, roomCode, human } = roomWithHuman();
  manager.addComputer(roomCode, "host-1");
  startReadyGame(manager,roomCode, "host-1");
  manager.disconnectPlayer(roomCode, human.player.id);
  const rejoined = manager.joinRoom(roomCode, "Philipp", "socket-new", human.playerToken);
  assert.equal(rejoined.reconnected, true);
  assert.equal(rejoined.room.gameState?.players[0]?.gold, NORMAL_STARTING_GOLD);
  assert.equal(rejoined.room.gameState?.players[0]?.connectionState, "connected");
});

test("reconnect preserves mortgages, trades, payment and bankruptcy spectator state", () => {
  const { manager, roomCode, human } = roomWithHuman();
  manager.addComputer(roomCode, "host-1");
  startReadyGame(manager,roomCode, "host-1");
  const internal = manager as unknown as { rooms: Map<string, { gameState?: GameState }> };
  const state = internal.rooms.get(roomCode)!.gameState!;
  state.propertyOwnerships.push({ tileIndex: 1, ownerId: human.player.id, mortgaged: true, buildingLevel: 0 });
  state.trades.push({ id: "trade-1", proposerId: human.player.id, recipientId: state.players[1]!.id, offer: { gold: 10, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [] }, status: "pending", createdAt: 1 });
  state.pendingPayment = { payerId: human.player.id, creditorType: "bank", amount: 200, reason: "Kronenzoll" };
  state.turnPhase = "paymentRequired";
  state.players[0]!.isBankrupt = true;
  manager.disconnectPlayer(roomCode, human.player.id);
  const rejoined = manager.joinRoom(roomCode, "Philipp", "socket-new", human.playerToken);
  assert.equal(rejoined.room.gameState?.propertyOwnerships[0]?.mortgaged, true);
  assert.equal(rejoined.room.gameState?.trades[0]?.id, "trade-1");
  assert.equal(rejoined.room.gameState?.pendingPayment?.amount, 200);
  assert.equal(rejoined.room.gameState?.players[0]?.isBankrupt, true);
});

test("reconnect preserves dungeon decisions and a pending third-attempt movement", () => {
  const { manager, roomCode, human } = roomWithHuman();
  manager.addComputer(roomCode, "host-1");
  startReadyGame(manager,roomCode, "host-1");
  const internal = manager as unknown as { rooms: Map<string, { gameState?: GameState }> };
  const state = internal.rooms.get(roomCode)!.gameState!;
  state.turnOrder = [human.player.id, state.players[1]!.id];
  state.currentPlayerId = human.player.id;
  state.players[0]!.position = DUNGEON_TILE_INDEX;
  state.players[0]!.dungeon = { inDungeon: true, failedAttempts: 2 };
  state.turnPhase = "paymentRequired";
  state.lastDiceRoll = { die1: 2, die2: 5, total: 7, isDouble: false };
  state.turnContext.rollSequence = 3;
  state.turnContext.rollKind = "dungeonAttempt";
  state.turnContext.pendingDungeonMovement = { ...state.lastDiceRoll };
  state.pendingPayment = { payerId: human.player.id, amount: 50, reason: "Kerkergebühr", creditorType: "bank", reasonType: "dungeonRelease" };
  manager.disconnectPlayer(roomCode, human.player.id);
  const rejoined = manager.joinRoom(roomCode, "Philipp", "socket-new", human.playerToken);
  assert.deepEqual(rejoined.room.gameState?.players[0]?.dungeon, { inDungeon: true, failedAttempts: 2 });
  assert.equal(rejoined.room.gameState?.turnPhase, "paymentRequired");
  assert.equal(rejoined.room.gameState?.turnContext.pendingDungeonMovement?.total, 7);
  assert.equal(rejoined.room.gameState?.lastDiceRoll?.total, 7);
});

test("new chronicle returns finished room to lobby and next start resets every system", () => {
  const { manager, roomCode } = roomWithHuman();
  manager.addComputer(roomCode, "host-1");
  startReadyGame(manager,roomCode, "host-1");
  const internal = manager as unknown as { rooms: Map<string, { gameState?: GameState; phase: "lobby" | "starting" | "playing" | "finished" }> };
  const room = internal.rooms.get(roomCode)!;
  room.gameState!.status = "finished";
  room.gameState!.players[0]!.dungeon = { inDungeon: true, failedAttempts: 2 };
  room.gameState!.turnContext.consecutiveDoubles = 2;
  room.gameState!.turnContext.pendingExtraRoll = true;
  room.gameState!.turnContext.pendingDungeonMovement = { die1: 2, die2: 5, total: 7, isDouble: false };
  room.gameState!.winnerId = room.gameState!.players[0]!.id;
  room.phase = "finished";
  const lobby = manager.newChronicle(roomCode, "host-1");
  assert.equal(lobby.phase, "lobby");
  assert.equal(lobby.gameState, undefined);
  const restarted = startReadyGame(manager,roomCode, "host-1");
  assert.deepEqual(restarted.propertyOwnerships, []);
  assert.deepEqual(restarted.trades, []);
  assert.deepEqual(restarted.buildingBank, { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 });
  assert.ok(restarted.players.every((player) => player.gold === NORMAL_STARTING_GOLD && !player.isBankrupt && player.position === 0));
  assert.ok(restarted.players.every((player) => !player.dungeon.inDungeon && player.dungeon.failedAttempts === 0));
  assert.deepEqual(restarted.turnContext, { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 });
});

test("quick game clock starts after order, pauses for a human and produces an idempotent shared result", () => {
  const time = new FakeTimeSource(10_000);
  const manager = new RoomManager(new DiceService(new TestSequenceRandom([1, 2, 5, 6])), undefined, time);
  const { room } = manager.createRoom("host-quick");
  const first = manager.joinRoom(room.code, "Philipp", "socket-p");
  const second = manager.joinRoom(room.code, "Justine", "socket-j");
  manager.updateConfig(room.code, { mode: "quick", quickGameDurationMinutes: 60 }, "host-quick");
  startReadyGame(manager,room.code, "host-quick");
  assert.equal(manager.rollForOrder(room.code, first.player.id, "human").quickGameClock, undefined);
  let state = manager.rollForOrder(room.code, second.player.id, "human");
  assert.equal(state.quickGameClock?.startedAt, 10_000);

  time.advance(10_000);
  manager.disconnectPlayer(room.code, first.player.id);
  assert.equal(manager.getGameState(room.code)?.quickGameClock?.pausedAt, 20_000);
  time.advance(20_000);
  manager.joinRoom(room.code, "Philipp", "socket-p2", first.playerToken);
  assert.equal(manager.getGameState(room.code)?.quickGameClock?.totalPausedMs, 20_000);

  const internal = manager as unknown as { rooms: Map<string, { gameState?: GameState }> };
  const live = internal.rooms.get(room.code)!.gameState!;
  live.trades.push({ id: "pending", proposerId: first.player.id, recipientId: second.player.id, offer: { gold: 0, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [] }, status: "pending", createdAt: 1 });
  time.advance(3_590_000);
  state = manager.syncQuickClock(room.code);
  assert.equal(state.quickGameClock?.expired, true);
  assert.equal(state.status, "playing");
  live.currentRound = 2;
  live.currentTurnIndex = 0;
  live.turnPhase = "turnTransition";
  state = manager.syncQuickClock(room.code);
  assert.equal(state.status, "finished");
  assert.equal(state.finishReason, "quickGameTimeExpired");
  assert.deepEqual(new Set(state.winnerIds), new Set([first.player.id, second.player.id]));
  assert.equal(state.winnerId, undefined);
  assert.equal(state.trades[0]?.status, "cancelled");
  assert.equal(state.finalScores?.length, 2);
  assert.equal(state.gameResult?.roundsPlayed, 1);
  assert.equal(manager.syncQuickClock(room.code).gameResult?.finishedAt, state.gameResult?.finishedAt);
});

test("quick game finishes after the final active turn when turn-order index zero is bankrupt", () => {
  const time = new FakeTimeSource(3_600_000);
  const manager = new RoomManager(undefined, undefined, time);
  const { room } = manager.createRoom("host-final-round");
  manager.joinRoom(room.code, "Philipp", "socket-p");
  manager.addComputer(room.code, "host-final-round");
  manager.addComputer(room.code, "host-final-round");
  manager.updateConfig(room.code, { mode: "quick", quickGameDurationMinutes: 60 }, "host-final-round");
  startReadyGame(manager,room.code, "host-final-round");

  const internal = manager as unknown as { rooms: Map<string, { gameState?: GameState }> };
  const live = internal.rooms.get(room.code)!.gameState!;
  live.turnOrder = live.players.map((player) => player.id);
  live.players[0]!.isBankrupt = true;
  live.currentTurnIndex = 2;
  live.currentPlayerId = live.turnOrder[2]!;
  live.currentRound = 7;
  live.turnNumber = 20;
  live.turnPhase = "waitingForEndTurn";
  live.quickGameClock = {
    durationMs: 3_600_000, startedAt: 0, totalPausedMs: 0, expired: true,
    expiredAt: 3_600_000, finishAfterRound: 7, serverNow: 3_600_000, remainingMs: 0
  };

  const finished = manager.endTurn(room.code, live.currentPlayerId, "computer");
  assert.equal(finished.status, "finished");
  assert.equal(finished.finishReason, "quickGameTimeExpired");
  assert.equal(finished.currentRound, 8);
  assert.equal(finished.gameResult?.roundsPlayed, 7);
  assert.equal(finished.finalScores?.length, 2);
});

test("step six socket contract uses intent-only event names", () => {
  assert.deepEqual(
    [SOCKET_EVENTS.propertyMortgage, SOCKET_EVENTS.propertyRedeemMortgage, SOCKET_EVENTS.tradeCreate, SOCKET_EVENTS.tradeAccept, SOCKET_EVENTS.playerDeclareBankruptcy],
    ["property:mortgage", "property:redeemMortgage", "trade:create", "trade:accept", "player:declareBankruptcy"]
  );
});

test("authoritative game state revisions start at zero and advance monotonically", () => {
  const { manager, roomCode } = roomWithHuman();
  manager.addComputer(roomCode, "host-1"); startReadyGame(manager, roomCode, "host-1");
  assert.equal(manager.getGameState(roomCode)?.stateRevision, 0);
  assert.equal(manager.advanceStateRevision(roomCode), 1);
  assert.equal(manager.advanceStateRevision(roomCode), 2);
  assert.equal(manager.getGameState(roomCode)?.stateRevision, 2);
});

test("step seven socket contract exposes only dungeon intentions", () => {
  assert.deepEqual(
    [SOCKET_EVENTS.gameRollDungeon, SOCKET_EVENTS.gamePayDungeonRelease],
    ["game:rollDungeon", "game:payDungeonRelease"]
  );
});

test("step eight socket contract exposes intent-only card actions", () => {
  assert.deepEqual(
    [SOCKET_EVENTS.gameDrawCard, SOCKET_EVENTS.gameAcknowledgeCard, SOCKET_EVENTS.gameUseDungeonCard],
    ["game:drawCard", "game:acknowledgeCard", "game:useDungeonCard"]
  );
});

test("board configuration contains 40 unique fields and 22 properties", () => {
  assert.doesNotThrow(() => validateBoardTiles());
  assert.equal(BOARD_TILES.length, 40);
  assert.equal(new Set(BOARD_TILES.map((tile) => tile.index)).size, 40);
  assert.equal(BOARD_TILES.filter((tile) => tile.type === "property").length, 22);
  assert.deepEqual(
    BOARD_CORNER_TILE_INDICES.map((index) => BOARD_TILES[index]!.type),
    ["start", "dungeon", "rest", "goToDungeon"]
  );
});

test("board validation rejects missing, duplicate and out-of-range indices", () => {
  assert.throws(() => validateBoardTiles(BOARD_TILES.slice(0, 39)), /40 Brettfelder/);
  assert.throws(() => validateBoardTiles([...BOARD_TILES.slice(0, 39), { ...BOARD_TILES[0]!, index: 38 }]), /eindeutigen Indizes/);
  assert.throws(() => validateBoardTiles([...BOARD_TILES.slice(0, 39), { ...BOARD_TILES[39]!, index: 40 }]), /eindeutigen Indizes/);
});
