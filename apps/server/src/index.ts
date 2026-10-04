import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Server } from "socket.io";
import {
  SOCKET_EVENTS,
  canMortgageProperty,
  getPropertyGroup,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData
} from "@valenor/shared";
import { createControllerUrl, findLocalAddress } from "./network";
import { RoomManager } from "./room-manager";
import { AI_ECONOMY_CONFIG, EconomicAi } from "./ai/economic-ai";

const PORT = Number(process.env.PORT ?? 3001);
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 5 * 60 * 1000);
const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  { cors: { origin: true, credentials: false } }
);
const rooms = new RoomManager();
const economicAi = new EconomicAi();
const removalTimers = new Map<string, NodeJS.Timeout>();
const gameTimers = new Map<string, NodeJS.Timeout>();
const aiBuildingCounts = new Map<string, number>();

function publishGameState(roomCode: string, state: ReturnType<RoomManager["getGameState"]>) {
  if (state) io.to(roomCode).emit(SOCKET_EVENTS.gameState, state);
}

function scheduleGameAction(roomCode: string, key: string, delay: number, action: () => void) {
  const timerKey = `${roomCode}:${key}`;
  if (gameTimers.has(timerKey)) return;
  const timer = setTimeout(() => {
    gameTimers.delete(timerKey);
    action();
  }, delay);
  timer.unref();
  gameTimers.set(timerKey, timer);
}

function clearRoomGameTimers(roomCode: string) {
  const prefix = `${roomCode}:`;
  for (const [key, timer] of gameTimers) {
    if (!key.startsWith(prefix)) continue;
    clearTimeout(timer);
    gameTimers.delete(key);
  }
}

function orchestrateGame(roomCode: string, state: NonNullable<ReturnType<RoomManager["getGameState"]>>) {
  if (state.status === "finished") {
    clearRoomGameTimers(roomCode);
    return;
  }

  const clock = state.quickGameClock;
  if (clock && !clock.expired && clock.pausedAt === undefined && clock.stoppedAt === undefined) {
    scheduleGameAction(
      roomCode,
      `quick-expiry-${clock.startedAt}-${clock.totalPausedMs}`,
      Math.max(0, clock.remainingMs + 5),
      () => {
        try {
          const next = rooms.syncQuickClock(roomCode);
          publishGameState(roomCode, next);
          orchestrateGame(roomCode, next);
        } catch { /* Die Partie wurde inzwischen beendet oder zurückgesetzt. */ }
      }
    );
  }

  if (state.turnPhase === "determiningOrder") {
    const initialPause = state.orderRolls.every((entry) => entry.rolls.length === 0) ? 4_800 : 0;
    state.orderContenders.forEach((playerId, index) => {
      const player = state.players.find((candidate) => candidate.id === playerId);
      const entry = state.orderRolls.find((candidate) => candidate.playerId === playerId);
      if (player?.type !== "computer" || !entry || entry.rolls.length >= state.orderRollTargetCount) return;
      scheduleGameAction(roomCode, `order-${playerId}-${state.orderRollTargetCount}`, initialPause + 800 + index * 180, () => {
        try {
          const next = rooms.rollForOrder(roomCode, playerId, "computer");
          publishGameState(roomCode, next);
          orchestrateGame(roomCode, next);
        } catch { /* A newer state made this scheduled action obsolete. */ }
      });
    });
    return;
  }

  if (state.turnPhase === "paymentRequired" && state.pendingPayment) {
    const payer = state.players.find((player) => player.id === state.pendingPayment?.payerId);
    if (payer?.type === "computer") {
      if (payer.gold >= state.pendingPayment.amount) {
        scheduleGameAction(roomCode, `computer-settle-${state.turnNumber}-${state.economyLog.length}`, 450, () => {
          try {
            const next = rooms.settlePayment(roomCode, payer.id);
            publishGameState(roomCode, next);
            orchestrateGame(roomCode, next);
          } catch { /* A newer state made this action obsolete. */ }
        });
      } else {
        const tileIndex = economicAi.decideEmergencySale(state, payer.id);
        if (tileIndex !== undefined) {
          scheduleGameAction(roomCode, `computer-emergency-sale-${state.turnNumber}-${state.economyLog.length}`, randomInt(350, 601), () => {
            try {
              const next = rooms.sellBuilding(roomCode, payer.id, tileIndex);
              publishGameState(roomCode, next);
              orchestrateGame(roomCode, next);
            } catch { /* A newer state made this action obsolete. */ }
          });
        } else {
          const mortgageTile = state.propertyOwnerships.find((ownership) =>
            ownership.ownerId === payer.id && canMortgageProperty(state, payer.id, ownership.tileIndex).allowed
          )?.tileIndex;
          if (mortgageTile !== undefined) {
            scheduleGameAction(roomCode, `computer-emergency-mortgage-${state.turnNumber}-${state.economyLog.length}`, 450, () => {
              try {
                const next = rooms.mortgageProperty(roomCode, payer.id, mortgageTile);
                publishGameState(roomCode, next);
                orchestrateGame(roomCode, next);
              } catch { /* A newer state made this action obsolete. */ }
            });
          } else {
            scheduleGameAction(roomCode, `computer-bankruptcy-${state.turnNumber}`, 550, () => {
              try {
                const next = rooms.declareBankruptcy(roomCode, payer.id);
                publishGameState(roomCode, next);
                orchestrateGame(roomCode, next);
              } catch { /* A newer state made this action obsolete. */ }
            });
          }
        }
      }
    }
    return;
  }

  if (state.turnPhase === "waitingForRoll" || state.turnPhase === "waitingForEndTurn") {
    for (const computer of state.players.filter((player) => player.type === "computer")) {
      const countKey = `${roomCode}:${state.turnNumber}:${state.turnPhase}:${computer.id}`;
      const count = aiBuildingCounts.get(countKey) ?? 0;
      if (count >= AI_ECONOMY_CONFIG.maxBuildingActionsPerPhase) continue;
      const tileIndex = economicAi.decideBuildingAction(state, computer.id);
      if (tileIndex === undefined) continue;
      scheduleGameAction(roomCode, `computer-build-${state.turnNumber}-${state.turnPhase}-${computer.id}-${count}`, randomInt(350, 601), () => {
        try {
          aiBuildingCounts.set(countKey, count + 1);
          const next = rooms.buildProperty(roomCode, computer.id, tileIndex);
          publishGameState(roomCode, next);
          orchestrateGame(roomCode, next);
        } catch { /* A newer state made this action obsolete. */ }
      });
      return;
    }
  }

  const current = state.players.find((player) => player.id === state.currentPlayerId);
  if (state.turnPhase === "dungeonDecision" && current?.type === "computer") {
    scheduleGameAction(roomCode, `computer-dungeon-${state.turnNumber}-${current.dungeon.failedAttempts}`, randomInt(700, 1_301), () => {
      try {
        const next = (current.heldCards?.length ?? 0) > 0
          ? rooms.useDungeonCard(roomCode, current.id, "computer")
          : rooms.rollDungeon(roomCode, current.id, "computer");
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* A newer state made this scheduled action obsolete. */ }
    });
    return;
  }

  if (state.turnPhase === "awaitingCardDraw" && current?.type === "computer") {
    scheduleGameAction(roomCode, `computer-card-draw-${state.turnNumber}-${state.turnContext.movementSequence ?? 0}`, randomInt(700, 1_101), () => {
      try {
        const next = rooms.drawCard(roomCode, current.id, "computer");
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* A newer state made this action obsolete. */ }
    });
    return;
  }

  if (state.turnPhase === "cardAcknowledgement" && current?.type === "computer") {
    scheduleGameAction(roomCode, `computer-card-ack-${state.activeCard?.cardId}-${state.turnContext.movementSequence ?? 0}`, randomInt(1_200, 1_801), () => {
      try {
        const next = rooms.acknowledgeCard(roomCode, current.id, "computer");
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* A newer state made this action obsolete. */ }
    });
    return;
  }

  if (state.turnPhase === "dungeonRolling") {
    scheduleGameAction(roomCode, `resolve-dungeon-${state.turnContext.rollSequence}`, 1_250, () => {
      try {
        const next = rooms.resolveDungeonRoll(roomCode);
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* State already advanced. */ }
    });
    return;
  }

  if (state.turnPhase === "dungeonTransfer") {
    scheduleGameAction(roomCode, `dungeon-transfer-${state.turnContext.rollSequence}`, 1_350, () => {
      try {
        const next = rooms.completeDungeonTransfer(roomCode);
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* State already advanced. */ }
    });
    return;
  }

  if (state.turnPhase === "waitingForRoll" && current?.type === "computer") {
    scheduleGameAction(roomCode, `computer-roll-${state.turnNumber}`, randomInt(700, 1301), () => {
      try {
        const next = rooms.rollTurn(roomCode, current.id, "computer");
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* A newer state made this scheduled action obsolete. */ }
    });
    return;
  }

  if (state.turnPhase === "rolling") {
    scheduleGameAction(roomCode, `begin-move-${state.turnNumber}`, 1_250, () => {
      try {
        const next = rooms.beginMovement(roomCode);
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* State already advanced. */ }
    });
    return;
  }

  if (state.turnPhase === "moving") {
    const duration = Math.min(2_700, Math.max(400, (state.lastMovement?.path.length ?? 1) * 190));
    scheduleGameAction(roomCode, `finish-move-${state.turnNumber}`, duration, () => {
      try {
        const next = rooms.completeMovement(roomCode);
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* State already advanced. */ }
    });
    return;
  }

  if (state.turnPhase === "cardMoving") {
    const duration = Math.min(2_700, Math.max(400, (state.lastMovement?.path.length ?? 1) * 190));
    scheduleGameAction(roomCode, `finish-card-move-${state.lastMovement?.sequence ?? state.turnContext.movementSequence ?? 0}`, duration, () => {
      try {
        const next = rooms.completeCardMovement(roomCode);
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* State already advanced. */ }
    });
    return;
  }

  if (state.turnPhase === "landed") {
    scheduleGameAction(roomCode, `landed-${state.lastMovement?.sequence ?? state.turnContext.rollSequence}`, 350, () => {
      try {
        const next = rooms.resolveLanding(roomCode);
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* State already advanced. */ }
    });
    return;
  }

  if (state.turnPhase === "propertyDecision" && current?.type === "computer") {
    scheduleGameAction(roomCode, `computer-property-${state.turnNumber}`, randomInt(850, 1_401), () => {
      try {
        const next = economicAi.shouldBuy(state, current.id)
          ? rooms.buyProperty(roomCode, current.id)
          : rooms.declineProperty(roomCode, current.id);
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* A newer state made this scheduled action obsolete. */ }
    });
    return;
  }

  if (state.turnPhase === "auction" && state.auction && state.auction.pausedForPlayerIds.length === 0) {
    const auction = state.auction;
    const computer = state.players.find((player) =>
      player.type === "computer" &&
      auction.participantIds.includes(player.id) &&
      !auction.withdrawnPlayerIds.includes(player.id) &&
      player.id !== auction.highestBidderId
    );
    if (computer) {
      scheduleGameAction(roomCode, `computer-auction-${auction.revision}-${computer.id}`, randomInt(700, 1_201), () => {
        try {
          const decision = economicAi.decideAuction(state, computer.id);
          const next = decision.type === "bid"
            ? rooms.bidAuction(roomCode, computer.id, decision.increment)
            : rooms.withdrawAuction(roomCode, computer.id);
          publishGameState(roomCode, next);
          orchestrateGame(roomCode, next);
        } catch { /* A newer state made this scheduled action obsolete. */ }
      });
    }
    return;
  }

  if (state.turnPhase === "waitingForEndTurn" && current?.type === "computer") {
    scheduleGameAction(roomCode, `computer-end-${state.turnNumber}`, randomInt(1_000, 1_601), () => {
      try {
        const next = rooms.endTurn(roomCode, current.id, "computer");
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* State already advanced. */ }
    });
    return;
  }

  if (state.turnPhase === "turnTransition") {
    scheduleGameAction(roomCode, `next-turn-${state.turnNumber}`, 500, () => {
      try {
        const next = rooms.beginNextTurn(roomCode);
        publishGameState(roomCode, next);
        orchestrateGame(roomCode, next);
      } catch { /* State already advanced. */ }
    });
  }
}

app.use(cors());
app.use(express.json());
app.get("/api/health", (_request, response) => response.json({ ok: true }));
app.get("/api/network", (_request, response) =>
  response.json({ localAddress: findLocalAddress(), clientPort: process.env.PUBLIC_CLIENT_PORT ?? "5173" })
);
if (process.env.NODE_ENV !== "production") {
  app.post("/api/dev/rooms/:roomCode/expire-quick-clock", (request, response) => {
    try {
      const state = rooms.expireQuickClockForDevelopment(request.params.roomCode);
      publishGameState(request.params.roomCode.toUpperCase(), state);
      orchestrateGame(request.params.roomCode.toUpperCase(), state);
      response.json({ ok: true, gameState: state });
    } catch (error) {
      response.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Schnelluhr konnte nicht vorgespult werden." });
    }
  });
  app.post("/api/dev/rooms/:roomCode/complete-quick-final-round", (request, response) => {
    try {
      const state = rooms.completeQuickFinalRoundForDevelopment(request.params.roomCode);
      publishGameState(request.params.roomCode.toUpperCase(), state);
      orchestrateGame(request.params.roomCode.toUpperCase(), state);
      response.json({ ok: true, gameState: state });
    } catch (error) {
      response.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Schlussrunde konnte nicht abgeschlossen werden." });
    }
  });
}

io.on("connection", (socket) => {
  socket.on(SOCKET_EVENTS.roomCreate, (request, callback) => {
    if (request.roomCode && request.hostToken) {
      const room = rooms.reconnectHost(request.roomCode, request.hostToken, socket.id);
      if (room) {
        socket.data = { role: "host", roomCode: room.code };
        void socket.join(room.code);
        callback({ ok: true, room, hostToken: request.hostToken, controllerUrl: createControllerUrl(room.code) });
        return;
      }
    }

    const created = rooms.createRoom(socket.id);
    socket.data = { role: "host", roomCode: created.room.code };
    void socket.join(created.room.code);
    callback({
      ok: true,
      room: created.room,
      hostToken: created.hostToken,
      controllerUrl: createControllerUrl(created.room.code)
    });
  });

  const joinRoom = (
    request: Parameters<ClientToServerEvents["room:join"]>[0],
    callback: Parameters<ClientToServerEvents["room:join"]>[1]
  ) => {
    try {
      const outcome = rooms.joinRoom(request.roomCode, request.name, socket.id, request.playerToken);
      const timerKey = `${outcome.room.code}:${outcome.player.id}`;
      const pendingRemoval = removalTimers.get(timerKey);
      if (pendingRemoval) clearTimeout(pendingRemoval);
      removalTimers.delete(timerKey);

      socket.data = { role: "player", roomCode: outcome.room.code, playerId: outcome.player.id };
      void socket.join(outcome.room.code);
      io.to(outcome.room.code).emit(SOCKET_EVENTS.roomUpdate, outcome.room);
      io.to(outcome.room.code).emit(
        outcome.reconnected ? SOCKET_EVENTS.playerReconnect : SOCKET_EVENTS.playerJoin,
        outcome.player
      );
      callback({ ok: true, ...outcome });
      if (outcome.room.gameState) {
        publishGameState(outcome.room.code, outcome.room.gameState);
        orchestrateGame(outcome.room.code, outcome.room.gameState);
      }
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Beitritt fehlgeschlagen." });
    }
  };

  socket.on(SOCKET_EVENTS.roomJoin, joinRoom);
  socket.on(SOCKET_EVENTS.playerJoin, joinRoom);

  socket.on(SOCKET_EVENTS.roomAddComputer, (callback) => {
    try {
      const roomCode = socket.data.roomCode;
      if (!roomCode || socket.data.role !== "host") throw new Error("Nur der Host darf Computer hinzufügen.");
      const room = rooms.addComputer(roomCode, socket.id);
      io.to(roomCode).emit(SOCKET_EVENTS.roomUpdate, room);
      callback({ ok: true, room });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Computer konnte nicht hinzugefügt werden." });
    }
  });

  socket.on(SOCKET_EVENTS.roomRemoveComputer, (playerId, callback) => {
    try {
      const roomCode = socket.data.roomCode;
      if (!roomCode || socket.data.role !== "host") throw new Error("Nur der Host darf Computer entfernen.");
      const room = rooms.removeComputer(roomCode, playerId, socket.id);
      io.to(roomCode).emit(SOCKET_EVENTS.roomUpdate, room);
      callback({ ok: true, room });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Computer konnte nicht entfernt werden." });
    }
  });

  socket.on(SOCKET_EVENTS.roomUpdateConfig, (config, callback) => {
    try {
      const roomCode = socket.data.roomCode;
      if (!roomCode || socket.data.role !== "host") throw new Error("Nur der Host darf den Spielmodus ändern.");
      const room = rooms.updateConfig(roomCode, config, socket.id);
      io.to(roomCode).emit(SOCKET_EVENTS.roomUpdate, room);
      callback({ ok: true, room });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Spielmodus konnte nicht geändert werden." });
    }
  });

  socket.on(SOCKET_EVENTS.playerMagicSignal, (callback) => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) {
      callback({ ok: false, message: "Du bist mit keinem Spielraum verbunden." });
      return;
    }
    const player = rooms.getPlayer(roomCode, playerId);
    if (!player || player.connectionState !== "connected") {
      callback({ ok: false, message: "Deine Verbindung konnte nicht bestätigt werden." });
      return;
    }
    io.to(roomCode).emit(SOCKET_EVENTS.playerMagicSignal, {
      playerId: player.id,
      playerName: player.name,
      color: player.color,
      sentAt: Date.now()
    });
    callback({ ok: true });
  });

  socket.on(SOCKET_EVENTS.propertyGroupFocus, (groupId, active, callback) => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId || !getPropertyGroup(groupId)) {
      callback({ ok: false, message: "Die Baugruppe konnte nicht hervorgehoben werden." });
      return;
    }
    const player = rooms.getPlayer(roomCode, playerId);
    if (!player || player.connectionState !== "connected") {
      callback({ ok: false, message: "Deine Verbindung konnte nicht bestätigt werden." });
      return;
    }
    io.to(roomCode).emit(SOCKET_EVENTS.propertyGroupFocus, {
      groupId,
      playerId: player.id,
      color: player.color,
      active,
      sentAt: Date.now()
    });
    callback({ ok: true });
  });

  socket.on(SOCKET_EVENTS.gameRollOrder, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.rollForOrder(roomCode, playerId, "human");
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Startwurf fehlgeschlagen." });
    }
  });

  socket.on(SOCKET_EVENTS.gameRollDice, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.rollTurn(roomCode, playerId, "human");
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Würfelwurf nicht erlaubt." });
    }
  });

  socket.on(SOCKET_EVENTS.gameRollDungeon, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.rollDungeon(roomCode, playerId, "human");
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Kerkerwurf nicht erlaubt." });
    }
  });

  socket.on(SOCKET_EVENTS.gamePayDungeonRelease, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.payDungeonRelease(roomCode, playerId, "human");
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Kerkergebühr konnte nicht bezahlt werden." });
    }
  });

  socket.on(SOCKET_EVENTS.gameUseDungeonCard, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.useDungeonCard(roomCode, playerId, "human");
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) { callback({ ok: false, message: error instanceof Error ? error.message : "Kerkersiegel konnte nicht verwendet werden." }); }
  });

  socket.on(SOCKET_EVENTS.gameDrawCard, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.drawCard(roomCode, playerId, "human");
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) { callback({ ok: false, message: error instanceof Error ? error.message : "Karte konnte nicht gezogen werden." }); }
  });

  socket.on(SOCKET_EVENTS.gameAcknowledgeCard, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.acknowledgeCard(roomCode, playerId, "human");
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) { callback({ ok: false, message: error instanceof Error ? error.message : "Karte konnte nicht bestätigt werden." }); }
  });

  socket.on(SOCKET_EVENTS.gameEndTurn, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.endTurn(roomCode, playerId, "human");
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Zugende nicht erlaubt." });
    }
  });

  socket.on(SOCKET_EVENTS.gameBuyProperty, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.buyProperty(roomCode, playerId);
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Kauf nicht möglich." });
    }
  });

  socket.on(SOCKET_EVENTS.gameDeclineProperty, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.declineProperty(roomCode, playerId);
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Auktion konnte nicht beginnen." });
    }
  });

  socket.on(SOCKET_EVENTS.propertyBuild, (tileIndex, callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.buildProperty(roomCode, playerId, tileIndex);
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Bauen nicht möglich." });
    }
  });

  socket.on(SOCKET_EVENTS.propertySellBuilding, (tileIndex, callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.sellBuilding(roomCode, playerId, tileIndex);
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Verkauf nicht möglich." });
    }
  });

  socket.on(SOCKET_EVENTS.paymentSettle, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.settlePayment(roomCode, playerId);
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Forderung konnte nicht beglichen werden." });
    }
  });

  socket.on(SOCKET_EVENTS.propertyMortgage, (tileIndex, callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.mortgageProperty(roomCode, playerId, tileIndex);
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) { callback({ ok: false, message: error instanceof Error ? error.message : "Beleihen nicht möglich." }); }
  });

  socket.on(SOCKET_EVENTS.propertyRedeemMortgage, (tileIndex, callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.redeemMortgage(roomCode, playerId, tileIndex);
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) { callback({ ok: false, message: error instanceof Error ? error.message : "Hypothek konnte nicht ausgelöst werden." }); }
  });

  socket.on(SOCKET_EVENTS.tradeCreate, (request, callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.createTrade(roomCode, playerId, request);
      publishGameState(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) { callback({ ok: false, message: error instanceof Error ? error.message : "Handelsangebot konnte nicht erstellt werden." }); }
  });

  const handleTradeDecision = (action: "accept" | "reject" | "cancel", tradeId: string, callback: Parameters<ClientToServerEvents["trade:accept"]>[1]) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = action === "accept" ? rooms.acceptTrade(roomCode, playerId, tradeId)
        : action === "reject" ? rooms.rejectTrade(roomCode, playerId, tradeId)
          : rooms.cancelTrade(roomCode, playerId, tradeId);
      publishGameState(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) { callback({ ok: false, message: error instanceof Error ? error.message : "Handelsaktion nicht möglich." }); }
  };
  socket.on(SOCKET_EVENTS.tradeAccept, (tradeId, callback) => handleTradeDecision("accept", tradeId, callback));
  socket.on(SOCKET_EVENTS.tradeReject, (tradeId, callback) => handleTradeDecision("reject", tradeId, callback));
  socket.on(SOCKET_EVENTS.tradeCancel, (tradeId, callback) => handleTradeDecision("cancel", tradeId, callback));

  socket.on(SOCKET_EVENTS.playerDeclareBankruptcy, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.declareBankruptcy(roomCode, playerId);
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) { callback({ ok: false, message: error instanceof Error ? error.message : "Bankrott konnte nicht erklärt werden." }); }
  });

  socket.on(SOCKET_EVENTS.gameNewChronicle, (callback) => {
    try {
      const { roomCode, role } = socket.data;
      if (!roomCode || role !== "host") throw new Error("Nur der Host kann eine neue Chronik beginnen.");
      const room = rooms.newChronicle(roomCode, socket.id);
      clearRoomGameTimers(roomCode);
      io.to(roomCode).emit(SOCKET_EVENTS.roomUpdate, room);
      callback({ ok: true, room });
    } catch (error) { callback({ ok: false, message: error instanceof Error ? error.message : "Neue Chronik konnte nicht vorbereitet werden." }); }
  });

  socket.on(SOCKET_EVENTS.auctionBid, (increment, callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.bidAuction(roomCode, playerId, increment);
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Gebot nicht möglich." });
    }
  });

  socket.on(SOCKET_EVENTS.auctionWithdraw, (callback) => {
    try {
      const { roomCode, playerId, role } = socket.data;
      if (!roomCode || !playerId || role !== "player") throw new Error("Du bist mit keiner Partie verbunden.");
      const state = rooms.withdrawAuction(roomCode, playerId);
      publishGameState(roomCode, state);
      orchestrateGame(roomCode, state);
      callback({ ok: true, gameState: state });
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Ausstieg nicht möglich." });
    }
  });

  socket.on(SOCKET_EVENTS.gameStart, (callback) => {
    try {
      const roomCode = socket.data.roomCode;
      if (!roomCode || socket.data.role !== "host") throw new Error("Nur der Host kann das Abenteuer beginnen.");
      const gameState = rooms.startGame(roomCode, socket.id);
      const room = rooms.getRoom(roomCode);
      if (room) io.to(roomCode).emit(SOCKET_EVENTS.roomUpdate, room);
      io.to(roomCode).emit(SOCKET_EVENTS.gameStart, gameState);
      io.to(roomCode).emit(SOCKET_EVENTS.gameState, gameState);
      callback({ ok: true, gameState });
      orchestrateGame(roomCode, gameState);
    } catch (error) {
      callback({ ok: false, message: error instanceof Error ? error.message : "Start fehlgeschlagen." });
    }
  });

  socket.on("disconnect", () => {
    const { role, roomCode, playerId } = socket.data;
    if (role !== "player" || !roomCode || !playerId) return;
    const player = rooms.disconnectPlayer(roomCode, playerId);
    const room = rooms.getRoom(roomCode);
    if (!player || !room) return;
    io.to(roomCode).emit(SOCKET_EVENTS.playerDisconnect, player);
    io.to(roomCode).emit(SOCKET_EVENTS.roomUpdate, room);
    publishGameState(roomCode, room.gameState);
    if (room.gameState) orchestrateGame(roomCode, room.gameState);

    const timerKey = `${roomCode}:${playerId}`;
    const timer = setTimeout(() => {
      removalTimers.delete(timerKey);
      if (rooms.removeDisconnectedPlayer(roomCode, playerId)) {
        const updatedRoom = rooms.getRoom(roomCode);
        if (updatedRoom) io.to(roomCode).emit(SOCKET_EVENTS.roomUpdate, updatedRoom);
      }
    }, RECONNECT_GRACE_MS);
    timer.unref();
    removalTimers.set(timerKey, timer);
  });
});

if (process.env.NODE_ENV === "production") {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const clientDirectory = path.resolve(currentDirectory, "../../client/dist");
  app.use(express.static(clientDirectory));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(clientDirectory, "index.html")));
}

httpServer.listen(PORT, "0.0.0.0", () => {
  const localAddress = findLocalAddress();
  console.log(`Valenør-Server läuft auf http://localhost:${PORT}`);
  console.log(`Im WLAN erreichbar unter http://${localAddress}:${PORT}`);
});
