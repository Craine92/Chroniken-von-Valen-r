import { randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  DEFAULT_GAME_CONFIG,
  BUILDING_BANK_CAPACITY,
  STARTING_GOLD,
  PLAYER_COLORS,
  PLAYER_CHARACTERS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  type GameConfig,
  type GameRoom,
  type GameState,
  type Player,
  type PlayerColor,
  type PlayerCharacterId,
  type PlayerType,
  type AuctionBidIncrement,
  type CardDeckType
} from "@valenor/shared";
import type { TavernChoice } from "@valenor/shared";
import type { WorldImpulseChoice } from "@valenor/shared";
import { DiceService } from "./game/dice-service";
import { EconomyService } from "./game/economy-service";
import { BuildingService } from "./game/building-service";
import { MortgageService } from "./game/mortgage-service";
import { TradeService, type CreateTradeRequest } from "./game/trade-service";
import { BankruptcyService } from "./game/bankruptcy-service";
import { TurnEngine } from "./game/turn-engine";
import { initializeWanderingDragon, resolveDragonEncounter } from "./game/chronicle-event-service";
import { initializePlayerQuests } from "./game/quest-service";
import { CardService, type PrivateCardRuntime } from "./game/card-service";
import type { CardShuffleSource } from "./game/card-deck";
import { QuickGameClockService, type TimeSource } from "./game/quick-game-clock-service";
import { QuickGameScoringService } from "./game/quick-game-scoring-service";
import { chooseGoldenMoment, resolveGoldenMomentRisk } from "./game/world-impulse-service";

const AI_NAMES = ["Aelor", "Myrra", "Tharok", "Kaela", "Varun", "Nyra", "Bromir", "Sylwen"];
const QUICK_DURATIONS = new Set([60, 75, 90]);

interface InternalPlayer extends Player {
  playerToken?: string;
  socketId?: string;
}

interface InternalRoom {
  code: string;
  players: InternalPlayer[];
  phase: GameRoom["phase"];
  config: GameConfig;
  gameState?: GameState;
  createdAt: number;
  hostSocketId: string;
  hostToken: string;
  cardRuntime?: PrivateCardRuntime;
}

export interface JoinOutcome {
  room: GameRoom;
  player: Player;
  playerToken: string;
  reconnected: boolean;
}

export class RoomManager {
  private readonly rooms = new Map<string, InternalRoom>();

  private readonly turns: TurnEngine;
  private readonly economy = new EconomyService();
  private readonly tavernDice: DiceService;
  private readonly buildings = new BuildingService();
  private readonly mortgages = new MortgageService();
  private readonly trades = new TradeService();
  private readonly bankruptcies = new BankruptcyService();
  private readonly cards: CardService;
  private readonly quickClock: QuickGameClockService;
  private readonly quickScoring = new QuickGameScoringService();

  constructor(dice?: DiceService, cardShuffleSource?: CardShuffleSource, timeSource?: TimeSource, private readonly chooseWorldIndex: (count: number) => number = randomInt) {
    this.tavernDice = dice ?? new DiceService();
    this.turns = new TurnEngine(dice, chooseWorldIndex);
    this.cards = new CardService(cardShuffleSource, dice);
    this.quickClock = new QuickGameClockService(timeSource);
  }

  createRoom(hostSocketId: string): { room: GameRoom; hostToken: string } {
    const code = this.createUniqueCode();
    const room: InternalRoom = {
      code,
      players: [],
      phase: "lobby",
      config: { ...DEFAULT_GAME_CONFIG },
      createdAt: Date.now(),
      hostSocketId,
      hostToken: randomUUID()
    };
    this.rooms.set(code, room);
    return { room: this.toPublicRoom(room), hostToken: room.hostToken };
  }

  reconnectHost(roomCode: string, hostToken: string, socketId: string): GameRoom | undefined {
    const room = this.rooms.get(this.normalizeCode(roomCode));
    if (!room || room.hostToken !== hostToken) return undefined;
    room.hostSocketId = socketId;
    return this.toPublicRoom(room);
  }

  joinRoom(roomCode: string, name: string, socketId: string, playerToken?: string): JoinOutcome {
    const room = this.requireRoom(roomCode);

    if (playerToken) {
      const existing = room.players.find(
        (player) => player.type === "human" && player.playerToken === playerToken
      );
      if (existing) {
        existing.socketId = socketId;
        existing.connectionState = "connected";
        existing.name = this.cleanName(name);
        this.syncConnectionState(room, existing.id, "connected");
        return {
          room: this.toPublicRoom(room),
          player: this.toPublicPlayer(existing),
          playerToken,
          reconnected: true
        };
      }
    }

    if (room.phase !== "lobby") throw new Error("Dieses Abenteuer hat bereits begonnen.");
    this.ensureFreeSlot(room);
    const color = this.findFreeColor(room);
    const token = randomUUID();
    const player: InternalPlayer = {
      id: randomUUID(),
      playerToken: token,
      socketId,
      name: this.cleanName(name),
      type: "human",
      color,
      characterId: this.findFreeCharacter(room),
      ready: false,
      connectionState: "connected",
      joinedAt: Date.now()
    };
    room.players.push(player);

    return {
      room: this.toPublicRoom(room),
      player: this.toPublicPlayer(player),
      playerToken: token,
      reconnected: false
    };
  }

  addComputer(roomCode: string, hostSocketId: string): GameRoom {
    const room = this.requireHostRoom(roomCode, hostSocketId);
    if (room.phase !== "lobby") throw new Error("Nach Spielbeginn können keine Computer ergänzt werden.");
    this.ensureFreeSlot(room);
    const usedNames = new Set(room.players.map((player) => player.name));
    const name = AI_NAMES.find((candidate) => !usedNames.has(candidate));
    if (!name) throw new Error("Es ist kein Computername mehr verfügbar.");

    room.players.push({
      id: randomUUID(),
      name,
      type: "computer",
      color: this.findFreeColor(room),
      characterId: this.findFreeCharacter(room),
      ready: true,
      connectionState: "connected",
      joinedAt: Date.now()
    });
    return this.toPublicRoom(room);
  }

  removeComputer(roomCode: string, playerId: string, hostSocketId: string): GameRoom {
    const room = this.requireHostRoom(roomCode, hostSocketId);
    if (room.phase !== "lobby") throw new Error("Nach Spielbeginn können keine Computer entfernt werden.");
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player || player.type !== "computer") throw new Error("Dieser Computer wurde nicht gefunden.");
    room.players = room.players.filter((candidate) => candidate.id !== playerId);
    return this.toPublicRoom(room);
  }

  removePlayer(roomCode: string, playerId: string, hostSocketId: string): GameRoom {
    const room = this.requireHostRoom(roomCode, hostSocketId);
    if (room.phase !== "lobby") throw new Error("Spieler können nur in der Lobby entfernt werden.");
    if (!room.players.some(player => player.id === playerId)) throw new Error("Dieser Spieler wurde nicht gefunden.");
    room.players = room.players.filter(player => player.id !== playerId);
    return this.toPublicRoom(room);
  }

  updatePlayerColor(roomCode: string, playerId: string, color: PlayerColor, socketId: string): GameRoom {
    const room = this.requireRoom(roomCode);
    if (room.phase !== "lobby") throw new Error("Die Spielerfarbe kann nur vor Spielbeginn geändert werden.");
    const player = room.players.find(candidate => candidate.id === playerId);
    if (!player || player.type !== "human" || player.socketId !== socketId || player.connectionState !== "connected") {
      throw new Error("Nur verbundene menschliche Spieler dürfen ihre eigene Farbe wählen.");
    }
    if (!PLAYER_COLORS.includes(color)) throw new Error("Diese Spielerfarbe ist ungültig.");
    const occupant = room.players.find(candidate => candidate.id !== playerId && candidate.color === color);
    if (occupant?.type === "human") throw new Error(`Diese Farbe ist bereits von ${occupant.name} belegt.`);
    // Swapping with the requesting human preserves uniqueness even in a full lobby.
    if (occupant) occupant.color = player.color;
    if (player.color !== color) player.ready = false;
    player.color = color;
    return this.toPublicRoom(room);
  }

  updatePlayerCharacter(roomCode: string, playerId: string, characterId: PlayerCharacterId, socketId: string): GameRoom {
    const room = this.requireRoom(roomCode);
    const player = this.requireLobbyHuman(room, playerId, socketId);
    if (!PLAYER_CHARACTERS.some(character => character.id === characterId)) throw new Error("Diese Figur ist ungültig.");
    const occupant = room.players.find(candidate => candidate.id !== playerId && candidate.characterId === characterId);
    if (occupant?.type === "human") throw new Error(`Diese Figur wurde bereits von ${occupant.name} gewählt.`);
    if (occupant) occupant.characterId = player.characterId;
    if (player.characterId !== characterId) player.ready = false;
    player.characterId = characterId;
    return this.toPublicRoom(room);
  }

  updatePlayerReady(roomCode: string, playerId: string, ready: boolean, socketId: string): GameRoom {
    const room = this.requireRoom(roomCode);
    const player = this.requireLobbyHuman(room, playerId, socketId);
    if (typeof ready !== "boolean") throw new Error("Dieser Bereitstatus ist ungültig.");
    player.ready = ready;
    return this.toPublicRoom(room);
  }

  private requireLobbyHuman(room: InternalRoom, playerId: string, socketId: string): InternalPlayer {
    if (room.phase !== "lobby") throw new Error("Diese Auswahl kann nur in der Lobby geändert werden.");
    const player = room.players.find(candidate => candidate.id === playerId);
    if (!player || player.type !== "human" || player.socketId !== socketId || player.connectionState !== "connected") throw new Error("Nur verbundene Menschen dürfen ihre eigene Auswahl ändern.");
    return player;
  }

  updateConfig(roomCode: string, config: GameConfig, hostSocketId: string): GameRoom {
    const room = this.requireHostRoom(roomCode, hostSocketId);
    if (room.phase !== "lobby") throw new Error("Der Spielmodus kann nach Spielbeginn nicht geändert werden.");
    room.config = this.validateConfig(config);
    return this.toPublicRoom(room);
  }

  disconnectPlayer(roomCode: string, playerId: string): Player | undefined {
    const room = this.rooms.get(this.normalizeCode(roomCode));
    const player = room?.players.find((candidate) => candidate.id === playerId && candidate.type === "human");
    if (!room || !player) return undefined;
    player.connectionState = "disconnected";
    if (room.phase === "lobby") player.ready = false;
    delete player.socketId;
    this.syncConnectionState(room, playerId, "disconnected");
    return this.toPublicPlayer(player);
  }

  removeDisconnectedPlayer(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(this.normalizeCode(roomCode));
    if (!room || room.phase !== "lobby") return false;
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player || player.type !== "human" || player.connectionState === "connected") return false;
    room.players = room.players.filter((candidate) => candidate.id !== playerId);
    return true;
  }

  startGame(roomCode: string, hostSocketId: string): GameState {
    const room = this.requireHostRoom(roomCode, hostSocketId);
    if (room.phase !== "lobby") throw new Error("Dieses Abenteuer hat bereits begonnen.");
    if (room.players.length < MIN_PLAYERS) throw new Error("Mindestens zwei Gefährten werden benötigt.");
    if (room.players.length > MAX_PLAYERS) throw new Error("Maximal sechs Gefährten sind erlaubt.");
    const connectedHumans = room.players.filter(
      (player) => player.type === "human" && player.connectionState === "connected"
    );
    if (connectedHumans.length < 1) throw new Error("Mindestens ein menschlicher Gefährte muss verbunden sein.");
    if (connectedHumans.some(player => !player.ready)) throw new Error("Alle verbundenen Menschen müssen bereit sein.");

    const gameState: GameState = {
      stateRevision: 0,
      roomId: room.code,
      status: "playing",
      config: { ...room.config },
      players: room.players.map((player) => ({
        ...this.toPublicPlayer(player),
        gold: STARTING_GOLD,
        position: 0,
        isBankrupt: false,
        dungeon: { inDungeon: false, failedAttempts: 0 },
        heldCards: [],
        relics: [], armedRelics: []
      })),
      turnOrder: [],
      orderRolls: room.players.map((player) => ({ playerId: player.id, rolls: [] })),
      orderContenders: room.players.map((player) => player.id),
      orderRollTargetCount: 1,
      currentTurnIndex: 0,
      currentRound: 1,
      chronicleEventHistory: [],
      worldImpulseHistory: [],
      worldImpulseEffects: {},
      celebratedPropertyGroups: [],
      weltenwegPot: 0,
      turnNumber: 0,
      turnPhase: "determiningOrder",
      turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
      propertyOwnerships: [],
      buildingBank: {
        settlementUnitsAvailable: BUILDING_BANK_CAPACITY.settlementUnits,
        grandStructuresAvailable: BUILDING_BANK_CAPACITY.grandStructures
      },
      economyLog: [],
      trades: [],
      startedAt: Date.now()
    };
    initializeWanderingDragon(gameState, this.chooseWorldIndex);
    initializePlayerQuests(gameState);
    room.cardRuntime = this.cards.createRuntime();
    this.cards.syncPublicDecks(gameState, room.cardRuntime);
    room.phase = "playing";
    room.gameState = gameState;
    return this.cloneGameState(gameState);
  }

  rollForOrder(roomCode: string, playerId: string, actorType: PlayerType): GameState {
    const state = this.requireGameState(roomCode);
    this.turns.rollForOrder(state, playerId, actorType);
    if (this.quickClock.start(state) && state.players.some((player) =>
      player.type === "human" && !player.isBankrupt && player.connectionState === "disconnected"
    )) this.quickClock.pause(state);
    return this.cloneGameState(state);
  }

  rollTurn(roomCode: string, playerId: string, actorType: PlayerType): GameState {
    const state = this.requireGameState(roomCode);
    const player = state.players.find(player => player.id === playerId);
    // Computer players make the same activation choice before their normal roll.
    if (actorType === "computer" && player?.type === "computer" && state.currentPlayerId === playerId && state.turnPhase === "waitingForRoll") {
    }
    this.turns.rollTurn(state, playerId, actorType);
    delete state.tavern;
    return this.cloneGameState(state);
  }

  rollDungeon(roomCode: string, playerId: string, actorType: PlayerType): GameState {
    const state = this.requireGameState(roomCode);
    this.turns.rollDungeon(state, playerId, actorType);
    return this.cloneGameState(state);
  }

  decideRuneStone(roomCode: string, playerId: string, actorType: PlayerType, reroll: boolean): GameState {
    const state = this.requireGameState(roomCode);
    this.turns.decideRuneStone(state, playerId, actorType, reroll);
    return this.cloneGameState(state);
  }

  chooseWorldImpulse(roomCode: string, playerId: string, actorType: PlayerType, choice: WorldImpulseChoice): GameState {
    const state = this.requireGameState(roomCode);
    const player = state.players.find(entry => entry.id === playerId);
    if (!player || player.type !== actorType || player.isBankrupt || (player.type === "human" && player.connectionState !== "connected")) {
      throw new Error("Diese Weltimpuls-Entscheidung steht dir nicht zu.");
    }
    if (state.pendingWorldImpulseDecision?.impulseId === "twistOfFate") {
      if (choice !== "keep" && choice !== "reroll") throw new Error("Diese Wahl gehört nicht zur Schicksalswende.");
      this.turns.decideTwistOfFate(state, playerId, actorType, choice === "reroll");
    } else chooseGoldenMoment(state, playerId, choice);
    return this.cloneGameState(state);
  }

  resolveGoldenMoment(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    resolveGoldenMomentRisk(state, () => this.tavernDice.rollSingleDie());
    return this.cloneGameState(state);
  }

  resolveDungeonRoll(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    this.turns.resolveDungeonRoll(state);
    return this.cloneGameState(state);
  }

  payDungeonRelease(roomCode: string, playerId: string, actorType: PlayerType): GameState {
    const state = this.requireGameState(roomCode);
    this.turns.payDungeonRelease(state, playerId, actorType);
    return this.cloneGameState(state);
  }

  beginMovement(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    this.turns.beginMovement(state);
    return this.cloneGameState(state);
  }

  completeMovement(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    this.turns.completeMovement(state);
    return this.cloneGameState(state);
  }

  awaitEndTurn(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    this.turns.awaitEndTurn(state);
    return this.cloneGameState(state);
  }

  resolveLanding(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    const runtime = this.requireCardRuntime(roomCode);
    const tileType = state.lastMovement?.landedTile.type;
    this.economy.awardStartPass(state);
    resolveDragonEncounter(state, this.chooseWorldIndex);
    if (tileType === "adventure" || tileType === "fate") this.cards.awaitDraw(state, tileType);
    else if (tileType === "goToDungeon") {
      if (state.cardResolution?.status === "waitingForLanding") this.cards.sendToDungeonFromLanding(state);
      else this.turns.sendCurrentPlayerToDungeon(state);
      this.cards.resumeAfterLanding(state, runtime);
    } else {
      this.economy.resolveLanding(state);
      this.cards.resumeAfterLanding(state, runtime);
    }
    return this.cloneGameState(state);
  }

  drawCard(roomCode: string, playerId: string, actorType: PlayerType): GameState {
    const state = this.requireGameState(roomCode);
    this.cards.draw(state, this.requireCardRuntime(roomCode), playerId, actorType);
    return this.cloneGameState(state);
  }

  completeCardMovement(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    this.cards.completeMovement(state, this.requireCardRuntime(roomCode));
    return this.cloneGameState(state);
  }

  acknowledgeCard(roomCode: string, playerId: string, actorType: PlayerType): GameState {
    const state = this.requireGameState(roomCode);
    const result = this.cards.acknowledge(state, this.requireCardRuntime(roomCode), playerId, actorType);
    if (result.endedInDungeon) this.turns.finishCardDungeon(state);
    return this.cloneGameState(state);
  }

  useDungeonCard(roomCode: string, playerId: string, actorType: PlayerType): GameState {
    const state = this.requireGameState(roomCode);
    this.cards.useDungeonRelease(state, this.requireCardRuntime(roomCode), playerId, actorType);
    return this.cloneGameState(state);
  }

  completeDungeonTransfer(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    this.turns.completeDungeonTransfer(state);
    return this.cloneGameState(state);
  }

  chooseTavern(roomCode: string, playerId: string, actorType: PlayerType, choice: TavernChoice): GameState {
    const state = this.requireGameState(roomCode);
    if (state.players.find(player => player.id === playerId)?.type !== actorType) throw new Error("Diese Tavernenentscheidung steht dir nicht zu.");
    this.economy.chooseTavern(state, playerId, choice);
    return this.cloneGameState(state);
  }

  resolveTavernGamble(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    if (state.turnPhase !== "tavernRolling" || state.tavern?.status !== "rolling") throw new Error("Es wird gerade kein Tavernenwürfel geworfen.");
    this.economy.resolveTavernGamble(state, () => this.tavernDice.rollSingleDie());
    return this.cloneGameState(state);
  }

  buyProperty(roomCode: string, playerId: string): GameState {
    const state = this.requireGameState(roomCode);
    this.economy.buyCurrentTile(state, playerId);
    this.cards.resumeAfterLanding(state, this.requireCardRuntime(roomCode));
    return this.cloneGameState(state);
  }

  declineProperty(roomCode: string, playerId: string): GameState {
    const state = this.requireGameState(roomCode);
    this.economy.declineCurrentTile(state, playerId);
    return this.cloneGameState(state);
  }

  bidAuction(roomCode: string, playerId: string, increment: AuctionBidIncrement): GameState {
    const room = this.requireRoom(roomCode);
    const state = this.requireGameState(roomCode);
    this.economy.bid(state, playerId, increment);
    this.resumeCardAfterInterruption(roomCode, state);
    if (state.status === "finished") room.phase = "finished";
    return this.cloneGameState(state);
  }

  withdrawAuction(roomCode: string, playerId: string): GameState {
    const room = this.requireRoom(roomCode);
    const state = this.requireGameState(roomCode);
    this.economy.withdraw(state, playerId);
    this.resumeCardAfterInterruption(roomCode, state);
    if (state.status === "finished") room.phase = "finished";
    return this.cloneGameState(state);
  }

  buildProperty(roomCode: string, playerId: string, tileIndex: number): GameState {
    const state = this.requireGameState(roomCode);
    this.buildings.build(state, playerId, tileIndex);
    return this.cloneGameState(state);
  }

  sellBuilding(roomCode: string, playerId: string, tileIndex: number): GameState {
    const state = this.requireGameState(roomCode);
    this.buildings.sell(state, playerId, tileIndex);
    return this.cloneGameState(state);
  }

  settlePayment(roomCode: string, playerId: string): GameState {
    const state = this.requireGameState(roomCode);
    const isDungeonRelease = state.pendingPayment?.reasonType === "dungeonRelease";
    const isCardPayment = state.pendingPayment?.reasonType === "card" || state.pendingPayment?.reasonType === "cardRepair";
    this.economy.settlePendingPayment(state, playerId);
    if (isDungeonRelease) this.turns.continueAfterDungeonPayment(state, playerId);
    else if (isCardPayment) this.cards.continueAfterPayment(state, this.requireCardRuntime(roomCode));
    else this.cards.resumeAfterLanding(state, this.requireCardRuntime(roomCode));
    return this.cloneGameState(state);
  }

  mortgageProperty(roomCode: string, playerId: string, tileIndex: number): GameState {
    const state = this.requireGameState(roomCode);
    this.mortgages.mortgage(state, playerId, tileIndex);
    return this.cloneGameState(state);
  }

  redeemMortgage(roomCode: string, playerId: string, tileIndex: number): GameState {
    const state = this.requireGameState(roomCode);
    this.mortgages.redeem(state, playerId, tileIndex);
    return this.cloneGameState(state);
  }

  autoMortgageForPayment(roomCode: string, playerId: string): GameState {
    const state = this.requireGameState(roomCode);
    this.mortgages.autoMortgageForPayment(state, playerId);
    return this.cloneGameState(state);
  }

  redeemAllMortgages(roomCode: string, playerId: string): GameState {
    const state = this.requireGameState(roomCode);
    this.mortgages.redeemAll(state, playerId);
    return this.cloneGameState(state);
  }

  createTrade(roomCode: string, playerId: string, request: CreateTradeRequest): GameState {
    const state = this.requireGameState(roomCode);
    this.trades.create(state, playerId, request);
    return this.cloneGameState(state);
  }

  acceptTrade(roomCode: string, playerId: string, tradeId: string): GameState {
    const state = this.requireGameState(roomCode);
    this.trades.accept(state, playerId, tradeId);
    return this.cloneGameState(state);
  }

  rejectTrade(roomCode: string, playerId: string, tradeId: string): GameState {
    const state = this.requireGameState(roomCode);
    this.trades.reject(state, playerId, tradeId);
    return this.cloneGameState(state);
  }

  cancelTrade(roomCode: string, playerId: string, tradeId: string): GameState {
    const state = this.requireGameState(roomCode);
    this.trades.cancel(state, playerId, tradeId);
    return this.cloneGameState(state);
  }

  declareBankruptcy(roomCode: string, playerId: string): GameState {
    const room = this.requireRoom(roomCode);
    const state = this.requireGameState(roomCode);
    const payment = state.pendingPayment;
    const hadCardResolution = Boolean(state.cardResolution);
    this.cards.handleBankruptcyCards(state, this.requireCardRuntime(roomCode), playerId, payment?.creditorType === "player" ? payment.payeeId : undefined);
    this.bankruptcies.declare(state, playerId);
    if (hadCardResolution && !state.bankruptcyAuction) this.cards.continueAfterBankruptcy(state, this.requireCardRuntime(roomCode), playerId);
    if (state.status === "finished") room.phase = "finished";
    return this.cloneGameState(state);
  }

  newChronicle(roomCode: string, hostSocketId: string): GameRoom {
    const room = this.requireHostRoom(roomCode, hostSocketId);
    if (room.gameState?.status !== "finished") throw new Error("Die laufende Chronik ist noch nicht entschieden.");
    return this.returnToLobby(roomCode, hostSocketId);
  }

  returnToLobby(roomCode: string, hostSocketId: string): GameRoom {
    const room = this.requireHostRoom(roomCode, hostSocketId);
    if (!["playing", "finished"].includes(room.phase)) throw new Error("Es läuft keine Partie.");
    if (room.gameState) this.quickClock.stop(room.gameState);
    room.phase = "lobby";
    delete room.gameState;
    delete room.cardRuntime;
    room.players.forEach(player => { player.ready = player.type === "computer"; });
    return this.toPublicRoom(room);
  }

  endTurn(roomCode: string, playerId: string, actorType: PlayerType): GameState {
    const state = this.requireGameState(roomCode);
    this.turns.endTurn(state, playerId, actorType);
    return this.cloneGameState(state);
  }

  beginNextTurn(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    if (state.status === "finished") return this.cloneGameState(state);
    this.turns.beginNextTurn(state);
    delete state.tavern;
    return this.cloneGameState(state);
  }

  syncQuickClock(roomCode: string): GameState {
    const state = this.requireGameState(roomCode);
    return this.cloneGameState(state);
  }

  expireQuickClockForDevelopment(roomCode: string): GameState {
    if (process.env.NODE_ENV === "production") throw new Error("Die Entwicklungsabkürzung ist im Produktivbetrieb gesperrt.");
    const state = this.requireGameState(roomCode);
    const clock = state.quickGameClock;
    if (!clock) throw new Error("Für diese Partie läuft keine Schnelluhr.");
    delete clock.pausedAt;
    clock.totalPausedMs = 0;
    clock.startedAt = this.quickClock.now() - clock.durationMs;
    this.quickClock.sync(state);
    return this.cloneGameState(state);
  }

  completeQuickFinalRoundForDevelopment(roomCode: string): GameState {
    if (process.env.NODE_ENV === "production") throw new Error("Die Entwicklungsabkürzung ist im Produktivbetrieb gesperrt.");
    const state = this.requireGameState(roomCode);
    const finishAfterRound = state.quickGameClock?.finishAfterRound;
    if (finishAfterRound === undefined) throw new Error("Die letzte Runde wurde noch nicht ausgerufen.");
    state.currentRound = finishAfterRound + 1;
    state.currentTurnIndex = 0;
    state.turnPhase = "turnTransition";
    return this.cloneGameState(state);
  }

  getGameState(roomCode: string): GameState | undefined {
    const state = this.rooms.get(this.normalizeCode(roomCode))?.gameState;
    return state ? this.cloneGameState(state) : undefined;
  }

  advanceStateRevision(roomCode: string): number {
    const state = this.requireGameState(roomCode);
    state.stateRevision = (state.stateRevision ?? 0) + 1;
    return state.stateRevision;
  }

  getRoom(roomCode: string): GameRoom | undefined {
    const room = this.rooms.get(this.normalizeCode(roomCode));
    return room ? this.toPublicRoom(room) : undefined;
  }

  getPlayer(roomCode: string, playerId: string): Player | undefined {
    const player = this.getInternalPlayer(roomCode, playerId);
    return player ? this.toPublicPlayer(player) : undefined;
  }

  hasSocket(roomCode: string, playerId: string): boolean {
    return Boolean(this.getInternalPlayer(roomCode, playerId)?.socketId);
  }

  private validateConfig(config: GameConfig): GameConfig {
    const aiDifficulty = ["easy", "normal", "hard"].includes(config.aiDifficulty ?? "normal") ? config.aiDifficulty ?? "normal" : "normal";
    if (config.mode === "chronicles") return { mode: "chronicles", aiDifficulty };
    if (config.mode !== "quick" || !QUICK_DURATIONS.has(config.quickGameDurationMinutes ?? -1)) {
      throw new Error("Schnelle Abenteuer dauern 60, 75 oder 90 Minuten.");
    }
    return { mode: "quick", quickGameDurationMinutes: config.quickGameDurationMinutes!, aiDifficulty };
  }

  private syncConnectionState(room: InternalRoom, playerId: string, state: Player["connectionState"]) {
    const gamePlayer = room.gameState?.players.find((player) => player.id === playerId);
    if (gamePlayer) {
      gamePlayer.connectionState = state;
      this.economy.syncAuctionPause(room.gameState!);
      const hasDisconnectedActiveHuman = room.gameState!.players.some((player) =>
        player.type === "human" && !player.isBankrupt && player.connectionState === "disconnected"
      );
      if (hasDisconnectedActiveHuman) this.quickClock.pause(room.gameState!);
      else this.quickClock.resume(room.gameState!);
    }
  }

  private ensureFreeSlot(room: InternalRoom) {
    if (room.players.length >= MAX_PLAYERS) {
      throw new Error("Dieser Spielraum ist bereits vollständig besetzt.");
    }
  }

  private findFreeColor(room: InternalRoom) {
    const color = PLAYER_COLORS.find(
      (candidate) => !room.players.some((player) => player.color === candidate)
    );
    if (!color) throw new Error("Für diesen Spielraum ist keine Spielerfarbe mehr frei.");
    return color;
  }

  private findFreeCharacter(room: InternalRoom): PlayerCharacterId {
    const character = PLAYER_CHARACTERS.find(candidate => !room.players.some(player => player.characterId === candidate.id));
    if (!character) throw new Error("Keine Figur ist mehr frei.");
    return character.id;
  }

  private getInternalPlayer(roomCode: string, playerId: string): InternalPlayer | undefined {
    return this.rooms.get(this.normalizeCode(roomCode))?.players.find((player) => player.id === playerId);
  }

  private requireHostRoom(roomCode: string, hostSocketId: string): InternalRoom {
    const room = this.requireRoom(roomCode);
    if (room.hostSocketId !== hostSocketId) throw new Error("Nur der Host darf diese Einstellung ändern.");
    return room;
  }

  private requireRoom(roomCode: string): InternalRoom {
    const room = this.rooms.get(this.normalizeCode(roomCode));
    if (!room) throw new Error("Dieser Spielraum wurde nicht gefunden.");
    return room;
  }

  private requireGameState(roomCode: string): GameState {
    const state = this.requireRoom(roomCode).gameState;
    if (!state) throw new Error("Für diesen Raum läuft noch keine Partie.");
    this.quickClock.sync(state);
    this.finishGameIfReady(state);
    return state;
  }

  private requireCardRuntime(roomCode: string): PrivateCardRuntime {
    const runtime = this.requireRoom(roomCode).cardRuntime;
    if (!runtime) throw new Error("Die Kartendecks wurden noch nicht initialisiert.");
    return runtime;
  }

  private resumeCardAfterInterruption(roomCode: string, state: GameState): void {
    const cardPlayer = state.cardResolution ? state.players.find((player) => player.id === state.cardResolution!.playerId) : undefined;
    if (cardPlayer?.isBankrupt) {
      this.cards.continueAfterBankruptcy(state, this.requireCardRuntime(roomCode), cardPlayer.id);
      return;
    }
    if (state.turnPhase === "waitingForEndTurn") this.cards.resumeAfterLanding(state, this.requireCardRuntime(roomCode));
    if (state.turnPhase === "cardResolving" && state.cardResolution?.status === "waitingForPayment") {
      const debtorId = state.cardResolution.pendingPayments[0]?.fromPlayerId;
      if (debtorId) this.cards.continueAfterBankruptcy(state, this.requireCardRuntime(roomCode), debtorId);
    }
  }

  private cleanName(name: string): string {
    const cleaned = name.trim().replace(/\s+/g, " ").slice(0, 24);
    if (cleaned.length < 2) throw new Error("Bitte gib einen Namen mit mindestens zwei Zeichen ein.");
    return cleaned;
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private createUniqueCode(): string {
    let code: string;
    do {
      const number = randomBytes(2).readUInt16BE(0) % 10_000;
      code = `VAL-${number.toString().padStart(4, "0")}`;
    } while (this.rooms.has(code));
    return code;
  }

  private toPublicPlayer(player: InternalPlayer): Player {
    const { id, name, type, color, characterId, ready, connectionState, joinedAt } = player;
    return { id, name, type, color, characterId, ready, connectionState, joinedAt };
  }

  private cloneGameState(gameState: GameState): GameState {
    this.quickClock.sync(gameState);
    this.finishGameIfReady(gameState);
    return {
      ...gameState,
      weltenwegPot: gameState.weltenwegPot ?? 0,
      config: { ...gameState.config },
      players: gameState.players.map((player) => ({ ...player, dungeon: { ...player.dungeon }, heldCards: (player.heldCards ?? []).map((card) => ({ ...card })), relics: [...(player.relics ?? [])], armedRelics: [...(player.armedRelics ?? [])],
        ...(player.activeQuests ? { activeQuests: player.activeQuests.map(quest => ({ ...quest })) } : {}),
        ...(player.processedQuestEventIds ? { processedQuestEventIds: [...player.processedQuestEventIds] } : {}) })),
      ...(gameState.wanderingDragon ? { wanderingDragon: { ...gameState.wanderingDragon } } : {}),
      ...(gameState.tavern ? { tavern: { ...gameState.tavern } } : {}),
      turnContext: {
        ...gameState.turnContext,
        ...(gameState.turnContext.pendingDungeonMovement ? { pendingDungeonMovement: { ...gameState.turnContext.pendingDungeonMovement } } : {})
      },
      turnOrder: [...gameState.turnOrder],
      orderRolls: gameState.orderRolls.map((entry) => ({
        playerId: entry.playerId,
        rolls: entry.rolls.map((roll) => ({ ...roll }))
      })),
      orderContenders: [...gameState.orderContenders],
      propertyOwnerships: gameState.propertyOwnerships.map((ownership) => ({ ...ownership })),
      buildingBank: { ...gameState.buildingBank },
      economyLog: gameState.economyLog.map((entry) => ({ ...entry, playerIds: [...entry.playerIds] })),
      chronicleEventHistory: (gameState.chronicleEventHistory ?? []).map((event) => ({ ...event, ...(event.targetRegions ? { targetRegions: [...event.targetRegions] } : {}), ...(event.affectedTileTypes ? { affectedTileTypes: [...event.affectedTileTypes] } : {}) })),
      worldImpulseHistory: (gameState.worldImpulseHistory ?? []).map((impulse) => ({ ...impulse })),
      worldImpulseEffects: { ...(gameState.worldImpulseEffects ?? {}) },
      celebratedPropertyGroups: [...(gameState.celebratedPropertyGroups ?? [])],
      ...(gameState.activeWorldImpulse ? { activeWorldImpulse: { ...gameState.activeWorldImpulse } } : {}),
      ...(gameState.pendingWorldImpulseDecision ? { pendingWorldImpulseDecision: { ...gameState.pendingWorldImpulseDecision } } : {}),
      ...(gameState.lastWorldImpulseResolution ? { lastWorldImpulseResolution: { ...gameState.lastWorldImpulseResolution } } : {}),
      ...(gameState.lastMomentumCelebration ? { lastMomentumCelebration: { ...gameState.lastMomentumCelebration } } : {}),
      ...(gameState.activeChronicleEvent ? { activeChronicleEvent: { ...gameState.activeChronicleEvent,
        ...(gameState.activeChronicleEvent.targetRegions ? { targetRegions: [...gameState.activeChronicleEvent.targetRegions] } : {}),
        ...(gameState.activeChronicleEvent.affectedTileTypes ? { affectedTileTypes: [...gameState.activeChronicleEvent.affectedTileTypes] } : {}) } } : {}),
      trades: gameState.trades.map((trade) => ({
        ...trade,
        offer: { ...trade.offer, propertyTileIndices: [...trade.offer.propertyTileIndices], cardIds: [...(trade.offer.cardIds ?? [])], relicIds: [...(trade.offer.relicIds ?? [])] },
        request: { ...trade.request, propertyTileIndices: [...trade.request.propertyTileIndices], cardIds: [...(trade.request.cardIds ?? [])], relicIds: [...(trade.request.relicIds ?? [])] }
      })),
      ...(gameState.auction ? {
        auction: {
          ...gameState.auction,
          participantIds: [...gameState.auction.participantIds],
          withdrawnPlayerIds: [...gameState.auction.withdrawnPlayerIds],
          pausedForPlayerIds: [...gameState.auction.pausedForPlayerIds]
        }
      } : {}),
      ...(gameState.pendingPayment ? { pendingPayment: { ...gameState.pendingPayment } } : {}),
      ...(gameState.decks ? { decks: { adventure: { ...gameState.decks.adventure }, fate: { ...gameState.decks.fate } } } : {}),
      ...(gameState.activeCard ? { activeCard: { ...gameState.activeCard } } : {}),
      ...(gameState.cardResolution ? { cardResolution: { ...gameState.cardResolution, pendingPayments: gameState.cardResolution.pendingPayments.map((payment) => ({ ...payment })) } } : {}),
      ...(gameState.quickGameClock ? { quickGameClock: { ...gameState.quickGameClock } } : {}),
      ...(gameState.winnerIds ? { winnerIds: [...gameState.winnerIds] } : {}),
      ...(gameState.finalScores ? { finalScores: gameState.finalScores.map((score) => ({ ...score })) } : {}),
      ...(gameState.gameResult ? {
        gameResult: {
          ...gameState.gameResult,
          winnerIds: [...gameState.gameResult.winnerIds],
          ...(gameState.gameResult.scores ? { scores: gameState.gameResult.scores.map((score) => ({ ...score })) } : {})
        }
      } : {}),
      ...(gameState.bankruptcyAuction ? { bankruptcyAuction: { ...gameState.bankruptcyAuction, pendingTileIndices: [...gameState.bankruptcyAuction.pendingTileIndices] } } : {}),
      ...(gameState.lastBuildingAction ? { lastBuildingAction: { ...gameState.lastBuildingAction } } : {}),
      ...(gameState.lastTradeAction ? { lastTradeAction: { ...gameState.lastTradeAction } } : {}),
      ...(gameState.lastTurnAction ? { lastTurnAction: { ...gameState.lastTurnAction } } : {}),
      ...(gameState.lastDiceRoll ? { lastDiceRoll: { ...gameState.lastDiceRoll } } : {}),
      ...(gameState.lastMovement ? {
        lastMovement: {
          ...gameState.lastMovement,
          path: [...gameState.lastMovement.path],
          landedTile: { ...gameState.lastMovement.landedTile }
        }
      } : {})
    };
  }

  private finishGameIfReady(state: GameState): void {
    if (state.status === "finished") {
      this.ensureFinishedResult(state);
      return;
    }
    const clock = state.quickGameClock;
    if (!clock?.expired || clock.finishAfterRound === undefined || state.currentRound <= clock.finishAfterRound) return;

    const scores = this.quickScoring.calculate(state);
    const winnerIds = this.quickScoring.determineWinnerIds(scores);
    state.trades.forEach((trade) => {
      if (trade.status === "pending") trade.status = "cancelled";
    });
    state.status = "finished";
    state.finishReason = "quickGameTimeExpired";
    state.winnerIds = winnerIds;
    if (winnerIds.length === 1) state.winnerId = winnerIds[0]!;
    else delete state.winnerId;
    state.finalScores = scores;
    this.quickClock.stop(state);
    state.gameResult = {
      finishReason: "quickGameTimeExpired",
      winnerIds: [...winnerIds],
      finishedAt: this.quickClock.now(),
      scores: scores.map((score) => ({ ...score })),
      roundsPlayed: clock.finishAfterRound,
      durationPlayedMs: this.quickClock.elapsed(state)!
    };
    const names = winnerIds
      .map((id) => state.players.find((player) => player.id === id)?.name)
      .filter(Boolean)
      .join(" und ");
    state.economyLog.push({
      id: randomUUID(), kind: "system",
      message: winnerIds.length > 1
        ? `${names} teilen sich den Sieg nach Ablauf der Zeit.`
        : `${names} gewinnt nach Ablauf der Zeit.`,
      playerIds: [...winnerIds], createdAt: this.quickClock.now()
    });
    state.economyLog = state.economyLog.slice(-12);
    const room = this.rooms.get(state.roomId);
    if (room) room.phase = "finished";
  }

  private ensureFinishedResult(state: GameState): void {
    if (state.gameResult || state.finishReason !== "lastPlayerStanding" || !state.winnerId) return;
    state.winnerIds = [state.winnerId];
    this.quickClock.stop(state);
    const durationPlayedMs = this.quickClock.elapsed(state);
    state.gameResult = {
      finishReason: "lastPlayerStanding",
      winnerIds: [state.winnerId],
      finishedAt: this.quickClock.now(),
      roundsPlayed: state.currentRound,
      ...(durationPlayedMs === undefined ? {} : { durationPlayedMs })
    };
    const room = this.rooms.get(state.roomId);
    if (room) room.phase = "finished";
  }

  private toPublicRoom(room: InternalRoom): GameRoom {
    return {
      code: room.code,
      players: room.players.map((player) => this.toPublicPlayer(player)),
      phase: room.phase,
      config: { ...room.config },
      ...(room.gameState ? { gameState: this.cloneGameState(room.gameState) } : {}),
      createdAt: room.createdAt
    };
  }
}
