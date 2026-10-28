import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_TILES, MATCH_AWARDS, getMatchAwards, getMatchRanking, getMatchRecords, type GameState } from "@valenor/shared";
import { RoomManager } from "../room-manager";
import { startReadyGame } from "../test-fixtures";

/** Eine laufende Partie mit Mensch, zwei Computern; `live` ist der echte Spielstand im RoomManager. */
function match() {
  const manager = new RoomManager(), { room } = manager.createRoom("host");
  manager.joinRoom(room.code, "human", "s1");
  manager.addComputer(room.code, "host");
  manager.addComputer(room.code, "host");
  startReadyGame(manager, room.code, "host");
  const live = (manager as unknown as { rooms: Map<string, { gameState: GameState }> }).rooms.get(room.code)!.gameState;
  live.status = "playing";
  const [a, b, c] = live.players.map(player => player.id) as [string, string, string];
  return { manager, code: room.code, live, a, b, c };
}

const log = (state: GameState, kind: GameState["economyLog"][number]["kind"], playerIds: string[], amount?: number) =>
  state.economyLog.push({ id: `${kind}-${state.economyLog.length}-${Math.random()}`, kind, playerIds, message: kind, createdAt: 1, ...(amount === undefined ? {} : { amount }) });

test("the server collects match statistics from every change, without counting anything twice", () => {
  const { manager, code, live, a, b, c } = match();
  assert.equal(manager.getGameState(code)!.matchStats!.wealthByRound[0]!.round, 0, "starting wealth is recorded");

  // Miete auf Rotfels (Feld 24): a zahlt b.
  live.lastMovement = { kind: "normal", sequence: 9, playerId: a, from: 20, to: 24, path: [21, 22, 23, 24], passedStart: false, landedTile: BOARD_TILES[24]! };
  log(live, "rent", [a, b], -300);
  let stats = manager.getGameState(code)!.matchStats!;
  stats = manager.getGameState(code)!.matchStats!;
  assert.equal(stats.players[a]!.rentPaid, 300);
  assert.equal(stats.players[b]!.rentReceived, 300, "asking twice does not count twice");
  assert.deepEqual(stats.highestRent, { amount: 300, playerId: b, otherPlayerId: a, tileIndex: 24 });

  // Kauf, Bau, Handel, Drache, Runentor.
  live.propertyOwnerships.push({ tileIndex: 26, ownerId: b, buildingLevel: 0, mortgaged: false });
  log(live, "purchase", [b], -260);
  live.lastBuildingAction = { id: "build-1", type: "build", playerId: c, tileIndex: 1, fromLevel: 0, toLevel: 1, buildingName: "Wurzelhütte", amount: 50, createdAt: 1 };
  live.trades.push({ id: "t1", proposerId: a, recipientId: c, offer: { gold: 10, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [] }, status: "accepted", createdAt: 1 } as GameState["trades"][number]);
  log(live, "dragon", [c]);
  log(live, "start", [a], 200);
  stats = manager.getGameState(code)!.matchStats!;
  assert.equal(stats.players[b]!.purchases, 1);
  assert.deepEqual(stats.priciestPurchase, { amount: 260, playerId: b, tileIndex: 26 });
  assert.equal(stats.players[c]!.buildingsBuilt, 1);
  assert.deepEqual([stats.players[a]!.tradesCompleted, stats.players[c]!.tradesCompleted], [1, 1]);
  assert.equal(stats.players[c]!.dragonEncounters, 1);
  assert.equal(stats.players[a]!.runegatePasses, 1);

  // Kerker: zwei eigene Züge hinter Gittern, dann frei.
  live.players[0]!.dungeon = { inDungeon: true, failedAttempts: 0 };
  manager.getGameState(code);
  for (const turn of [1, 2]) { live.turnNumber += turn; live.currentPlayerId = a; manager.getGameState(code); }
  live.players[0]!.dungeon = { inDungeon: false, failedAttempts: 0 };
  stats = manager.getGameState(code)!.matchStats!;
  assert.deepEqual([stats.players[a]!.dungeonVisits, stats.players[a]!.dungeonTurns, stats.players[a]!.longestDungeonStay, stats.players[a]!.currentDungeonStay], [1, 2, 2, 0]);

  // Vermögen je Runde.
  live.currentRound = 2;
  stats = manager.getGameState(code)!.matchStats!;
  assert.deepEqual(stats.wealthByRound.map(snapshot => snapshot.round), [0, 1, 2]);
  assert.ok(Object.keys(stats.wealthByRound.at(-1)!.values).length === 3);

  // Kopien nach außen sind unabhängig, und eine neue Partie beginnt mit leerer Statistik.
  manager.getGameState(code)!.matchStats!.players[a]!.rentPaid = 999_999;
  assert.equal(manager.getGameState(code)!.matchStats!.players[a]!.rentPaid, 300);
  live.startedAt += 1;
  assert.equal(manager.getGameState(code)!.matchStats!.players[a]!.rentPaid, 0);
});

test("awards go to everyone, each award exactly once; the ranking puts the winner first and late bankruptcies before early ones", () => {
  const { manager, code, live, a, b, c } = match();
  live.propertyOwnerships = [1, 3, 6].map(tileIndex => ({ tileIndex, ownerId: a, buildingLevel: 0 as const, mortgaged: false }));
  log(live, "rent", [b, a], -500);
  manager.getGameState(code);
  live.players[2]!.isBankrupt = true; live.turnNumber += 1; manager.getGameState(code);
  live.players[1]!.isBankrupt = true; live.turnNumber += 1;
  live.status = "finished"; live.winnerIds = [a];
  const state = manager.getGameState(code)!;
  assert.deepEqual(getMatchRanking(state), [a, b, c], "b went bankrupt later than c");
  const awards = getMatchAwards(state);
  for (const id of [a, b, c]) assert.ok(awards[id]!.length >= 1, `${id} gets at least one award`);
  assert.equal(awards[a]!.find(award => award.id === "grossgrundbesitzer")?.reason, "3 Grundstücke am Ende");
  assert.equal(awards[b]!.find(award => award.id === "pechvogel")?.reason, "500 Gold Miete gezahlt");
  assert.deepEqual(awards[c], [{ id: "tapfer", title: "Tapfer gefallen", reason: "bis zum letzten Goldstück gekämpft" }]);
  const given = Object.values(awards).flat().filter(award => MATCH_AWARDS.some(definition => definition.id === award.id)).map(award => award.id);
  assert.equal(new Set(given).size, given.length, "no award twice");
  const records = getMatchRecords(state);
  assert.equal(records.find(record => record.id === "highestRent")?.value, "500 Gold");
  assert.ok(records.some(record => record.id === "rounds"));
});
