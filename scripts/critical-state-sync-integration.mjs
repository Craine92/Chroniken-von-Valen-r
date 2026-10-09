import assert from "node:assert/strict";
import { io } from "socket.io-client";

const SERVER_URL = process.env.VALENOR_SERVER_URL ?? "http://127.0.0.1:3001";
const TIMEOUT_MS = 5_000;

function connectClient(label) {
  const socket = io(SERVER_URL, { transports: ["websocket"], forceNew: true, reconnection: false });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label}: Verbindungstimeout`)), TIMEOUT_MS);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("connect_error", reject);
  });
}

function emitAck(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event}: Callback-Timeout`)), TIMEOUT_MS);
    socket.emit(event, ...args, (result) => {
      clearTimeout(timeout);
      if (!result?.ok) reject(new Error(result?.message ?? `${event}: fehlgeschlagen`));
      else resolve(result);
    });
  });
}

function waitForState(socket, predicate, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("game:state", listener);
      reject(new Error(`${label}: kein passender Spielstand`));
    }, TIMEOUT_MS);
    const listener = (state) => {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      socket.off("game:state", listener);
      resolve(state);
    };
    socket.on("game:state", listener);
  });
}

function observeRevisions(socket, label, observations) {
  socket.on("game:state", (state) => {
    const revision = state.stateRevision ?? 0;
    const previous = observations.at(-1)?.revision ?? -1;
    assert.ok(revision >= previous, `${label}: Revision ${revision} folgt auf ${previous}`);
    observations.push({ label, revision });
  });
}

const sockets = [];

try {
  const host = await connectClient("Host");
  const playerA = await connectClient("Spieler A");
  const playerB = await connectClient("Spieler B");
  sockets.push(host, playerA, playerB);

  const revisionsA = [];
  const revisionsB = [];
  observeRevisions(playerA, "Spieler A", revisionsA);
  observeRevisions(playerB, "Spieler B", revisionsB);

  const created = await emitAck(host, "room:create", {});
  assert.ok(created.room?.code);
  const roomCode = created.room.code;

  const joinedA = await emitAck(playerA, "room:join", { roomCode, name: "Arin" });
  const joinedB = await emitAck(playerB, "room:join", { roomCode, name: "Bela" });
  assert.ok(joinedA.player?.id && joinedB.player?.id && joinedB.playerToken);

  await emitAck(playerA, "player:updateReady", true);
  await emitAck(playerB, "player:updateReady", true);
  let state = (await emitAck(host, "game:start")).gameState;
  assert.equal(state.turnPhase, "determiningOrder");

  const playerSockets = new Map([
    [joinedA.player.id, playerA],
    [joinedB.player.id, playerB]
  ]);
  let safety = 20;
  while (state.turnPhase === "determiningOrder" && safety-- > 0) {
    const contenderId = state.orderContenders.find((playerId) => {
      const rolls = state.orderRolls.find((entry) => entry.playerId === playerId)?.rolls.length ?? 0;
      return rolls < state.orderRollTargetCount;
    });
    assert.ok(contenderId, "Startreihenfolge hat einen würfelberechtigten Spieler");
    state = (await emitAck(playerSockets.get(contenderId), "game:rollOrder")).gameState;
  }
  assert.equal(state.turnPhase, "waitingForRoll");

  const incomingTrade = waitForState(
    playerB,
    (next) => next.trades.some((trade) => trade.proposerId === joinedA.player.id && trade.status === "pending"),
    "Eingehender Handel live"
  );
  const tradeResult = await emitAck(playerA, "trade:create", {
    recipientId: joinedB.player.id,
    offer: { gold: 10, propertyTileIndices: [], cardIds: [], relicIds: [] },
    request: { gold: 5, propertyTileIndices: [], cardIds: [], relicIds: [] }
  });
  const trade = tradeResult.gameState.trades.at(-1);
  assert.ok(trade?.id);
  await incomingTrade;

  const acceptedLive = waitForState(
    playerA,
    (next) => next.trades.some((candidate) => candidate.id === trade.id && candidate.status === "accepted"),
    "Handelsannahme live"
  );
  await emitAck(playerB, "trade:accept", trade.id);
  await acceptedLive;

  const reconnectTradeResult = await emitAck(playerA, "trade:create", {
    recipientId: joinedB.player.id,
    offer: { gold: 1, propertyTileIndices: [], cardIds: [], relicIds: [] },
    request: { gold: 0, propertyTileIndices: [], cardIds: [], relicIds: [] }
  });
  const reconnectTrade = reconnectTradeResult.gameState.trades.at(-1);
  assert.ok(reconnectTrade?.id);

  playerB.disconnect();
  await emitAck(playerA, "trade:cancel", reconnectTrade.id);

  const reconnectedB = await connectClient("Spieler B Reconnect");
  sockets.push(reconnectedB);
  const rejoin = await emitAck(reconnectedB, "room:join", {
    roomCode,
    name: "Bela",
    playerToken: joinedB.playerToken
  });
  assert.equal(rejoin.reconnected, true);
  const resynced = (await emitAck(reconnectedB, "game:requestState")).gameState;
  assert.equal(resynced.trades.find((candidate) => candidate.id === reconnectTrade.id)?.status, "cancelled");
  assert.ok((resynced.stateRevision ?? 0) > (tradeResult.gameState.stateRevision ?? 0));

  assert.ok(revisionsA.length > 0 && revisionsB.length > 0);
  console.log(JSON.stringify({
    roomCode,
    humanClients: 2,
    liveTrade: true,
    reconnectResync: true,
    latestRevision: resynced.stateRevision
  }, null, 2));
} finally {
  for (const socket of sockets) socket.disconnect();
}
