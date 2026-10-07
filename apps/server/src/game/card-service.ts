import { randomUUID } from "node:crypto";
import {
  BOARD_TILES,
  DUNGEON_TILE_INDEX,
  PASS_START_GOLD,
  getCardDefinition,
  type ActiveCardState,
  type CardDeckType,
  type CardResolutionState,
  type GamePlayerState,
  type GameState,
  type PendingCardPayment,
  type PlayerType
} from "@valenor/shared";
import { DiceService } from "./dice-service";
import { preventDungeonWithAmulet } from "./chronicle-event-service";
import {
  CryptoCardShuffleSource,
  createDecks,
  drawTopCard,
  publicDeckState,
  type CardShuffleSource,
  type PrivateDecks
} from "./card-deck";

const MAX_CARD_CHAIN_DEPTH = 8;

interface SuspendedCard { activeCard: ActiveCardState; resolution: CardResolutionState }
export interface PrivateCardRuntime { decks: PrivateDecks; stack: SuspendedCard[] }

export class CardService {
  constructor(
    private readonly shuffleSource: CardShuffleSource = new CryptoCardShuffleSource(),
    private readonly dice = new DiceService()
  ) {}

  createRuntime(): PrivateCardRuntime { return { decks: createDecks(this.shuffleSource), stack: [] }; }

  syncPublicDecks(state: GameState, runtime: PrivateCardRuntime): void {
    state.decks = publicDeckState(runtime.decks);
  }

  awaitDraw(state: GameState, deck: CardDeckType): void {
    if (state.turnPhase !== "landed" || !state.currentPlayerId) throw new Error("Auf diesem Feld kann gerade keine Karte gezogen werden.");
    const tile = state.lastMovement?.landedTile;
    if (!tile || tile.type !== deck) throw new Error("Das Kartendeck passt nicht zum Landefeld.");
    state.turnPhase = "awaitingCardDraw";
  }

  draw(state: GameState, runtime: PrivateCardRuntime, playerId: string, actorType: PlayerType): void {
    if (state.turnPhase !== "awaitingCardDraw" || state.currentPlayerId !== playerId) throw new Error("Du darfst gerade keine Karte ziehen.");
    const player = this.requirePlayer(state, playerId);
    if (player.type !== actorType) throw new Error("Diese Kartenaktion gehört einem anderen Spielertyp.");
    const deck = state.lastMovement?.landedTile.type;
    if (deck !== "adventure" && deck !== "fate") throw new Error("Das Kartenfeld wurde nicht gefunden.");

    const parentDepth = state.cardResolution?.chainDepth ?? -1;
    if (parentDepth + 1 >= MAX_CARD_CHAIN_DEPTH) {
      this.log(state, "Die Runen brechen eine zu lange Kette von Kartenereignissen sicher ab.", [playerId]);
      this.abortAll(state, runtime);
      state.turnPhase = "waitingForEndTurn";
      return;
    }
    if (state.activeCard && state.cardResolution) {
      runtime.stack.push({ activeCard: { ...state.activeCard }, resolution: this.cloneResolution(state.cardResolution) });
    }

    const cardId = drawTopCard(runtime.decks, deck, this.shuffleSource);
    const card = getCardDefinition(cardId);
    const resolution: CardResolutionState = {
      cardId, deck, playerId, effectIndex: 0, status: "resolving", chainDepth: parentDepth + 1, pendingPayments: []
    };
    state.cardResolution = resolution;
    state.activeCard = { cardId, deck, playerId, status: "resolving" };
    state.turnPhase = "cardResolving";
    this.syncPublicDecks(state, runtime);
    this.log(state, `${player.name} zieht ${deck === "adventure" ? "Abenteuer" : "Schicksal"}: ${card.title}.`, [player.id]);
    this.processEffects(state, runtime);
  }

  completeMovement(state: GameState, runtime: PrivateCardRuntime): void {
    const resolution = this.requireResolution(state);
    if (state.turnPhase !== "cardMoving" || resolution.status !== "waitingForMovement" || !state.lastMovement) {
      throw new Error("Es liegt keine Kartenbewegung vor.");
    }
    const player = this.requirePlayer(state, resolution.playerId);
    player.position = state.lastMovement.to;
    if (state.lastMovement.kind === "dungeonTransfer") {
      resolution.status = "readyToAcknowledge";
      state.activeCard!.status = resolution.status;
      state.turnPhase = "cardAcknowledgement";
      return;
    }
    if (state.lastMovement.landedTile.type === "utility" && !state.lastDiceRoll) {
      state.lastDiceRoll = this.dice.roll();
      state.turnContext.rollSequence += 1;
      this.log(state, `Die Versorgungsmiete wird mit einem neuen Wurf von ${state.lastDiceRoll.total} bestimmt.`, [player.id]);
    }
    resolution.status = "waitingForLanding";
    state.activeCard!.status = resolution.status;
    state.turnPhase = "landed";
  }

  sendToDungeonFromLanding(state: GameState): void {
    const resolution = this.requireResolution(state);
    if (state.turnPhase !== "landed" || resolution.status !== "waitingForLanding") throw new Error("Der Kerkertransfer kann gerade nicht beginnen.");
    const player = this.requirePlayer(state, resolution.playerId);
    if (preventDungeonWithAmulet(state, player)) {
      state.turnPhase = "waitingForEndTurn";
      return;
    }
    player.dungeon = { inDungeon: true, failedAttempts: 0 };
    state.turnContext.consecutiveDoubles = 0;
    state.turnContext.pendingExtraRoll = false;
    this.startMovement(state, resolution, player, DUNGEON_TILE_INDEX, [DUNGEON_TILE_INDEX], false, "dungeonTransfer");
    this.log(state, `${player.name} wird in den Dunklen Kerker geschickt.`, [player.id]);
  }

  resumeAfterLanding(state: GameState, runtime: PrivateCardRuntime): void {
    const resolution = state.cardResolution;
    if (!resolution || resolution.status !== "waitingForLanding" || state.turnPhase !== "waitingForEndTurn") return;
    resolution.status = "resolving";
    state.activeCard!.status = resolution.status;
    state.turnPhase = "cardResolving";
    this.processEffects(state, runtime);
  }

  continueAfterPayment(state: GameState, runtime: PrivateCardRuntime): void {
    const resolution = this.requireResolution(state);
    if (resolution.status !== "waitingForPayment") throw new Error("Die Karte wartet auf keine Zahlung.");
    resolution.pendingPayments.shift();
    this.processPaymentQueue(state, runtime);
  }

  continueAfterBankruptcy(state: GameState, runtime: PrivateCardRuntime, debtorId: string): void {
    const resolution = state.cardResolution;
    if (!resolution) return;
    if (debtorId === resolution.playerId) {
      this.abortAll(state, runtime);
      return;
    }
    if (resolution.status === "waitingForPayment") {
      resolution.pendingPayments.shift();
      this.processPaymentQueue(state, runtime);
    }
  }

  acknowledge(state: GameState, runtime: PrivateCardRuntime, playerId: string, actorType: PlayerType): { endedInDungeon: boolean } {
    const resolution = this.requireResolution(state);
    if (state.turnPhase !== "cardAcknowledgement" || resolution.status !== "readyToAcknowledge" || resolution.playerId !== playerId) {
      throw new Error("Diese Karte kann gerade nicht bestätigt werden.");
    }
    const player = this.requirePlayer(state, playerId);
    if (player.type !== actorType) throw new Error("Diese Kartenaktion gehört einem anderen Spielertyp.");
    const card = getCardDefinition(resolution.cardId);
    if (!card.keepable) runtime.decks[resolution.deck].discardPile.push(resolution.cardId);
    this.syncPublicDecks(state, runtime);

    const endedInDungeon = player.dungeon.inDungeon;
    const suspended = runtime.stack.pop();
    if (suspended && !endedInDungeon) {
      state.activeCard = suspended.activeCard;
      state.cardResolution = suspended.resolution;
      state.cardResolution.status = "resolving";
      state.activeCard.status = "resolving";
      state.turnPhase = "cardResolving";
      this.processEffects(state, runtime);
      return { endedInDungeon: false };
    }
    runtime.stack = [];
    delete state.activeCard;
    delete state.cardResolution;
    state.turnPhase = endedInDungeon ? "cardAcknowledgement" : "waitingForEndTurn";
    return { endedInDungeon };
  }

  useDungeonRelease(state: GameState, runtime: PrivateCardRuntime, playerId: string, actorType: PlayerType): void {
    if (state.turnPhase !== "dungeonDecision" || state.currentPlayerId !== playerId) throw new Error("Das Kerkersiegel kann gerade nicht verwendet werden.");
    const player = this.requirePlayer(state, playerId);
    if (player.type !== actorType || !player.dungeon.inDungeon) throw new Error("Diese Aktion ist nicht erlaubt.");
    const heldIndex = (player.heldCards ?? []).findIndex((held) => getCardDefinition(held.cardId).effects.some((effect) => effect.type === "keepDungeonRelease"));
    if (heldIndex < 0) throw new Error("Du besitzt keine Kerkerbefreiungskarte.");
    const [held] = player.heldCards!.splice(heldIndex, 1);
    runtime.decks[held!.deck].discardPile.push(held!.cardId);
    player.dungeon = { inDungeon: false, failedAttempts: 0 };
    state.turnContext.consecutiveDoubles = 0;
    state.turnContext.pendingExtraRoll = false;
    delete state.turnContext.rollKind;
    state.turnPhase = "waitingForRoll";
    this.syncPublicDecks(state, runtime);
    this.log(state, `${player.name} verwendet ${getCardDefinition(held!.cardId).title} und verlässt den Dunklen Kerker.`, [player.id]);
  }

  handleBankruptcyCards(state: GameState, runtime: PrivateCardRuntime, debtorId: string, creditorId?: string): void {
    const debtor = this.requirePlayer(state, debtorId);
    const held = [...(debtor.heldCards ?? [])];
    debtor.heldCards = [];
    if (creditorId) {
      const creditor = this.requirePlayer(state, creditorId);
      creditor.heldCards ??= [];
      creditor.heldCards.push(...held);
    } else {
      held.forEach((card) => runtime.decks[card.deck].discardPile.push(card.cardId));
    }
    this.syncPublicDecks(state, runtime);
  }

  private processEffects(state: GameState, runtime: PrivateCardRuntime): void {
    const resolution = this.requireResolution(state);
    const card = getCardDefinition(resolution.cardId);
    const player = this.requirePlayer(state, resolution.playerId);
    if (player.isBankrupt) { this.abortAll(state, runtime); return; }

    while (resolution.effectIndex < card.effects.length) {
      const effect = card.effects[resolution.effectIndex]!;
      resolution.effectIndex += 1;
      if (effect.type === "receiveFromBank") {
        player.gold += effect.amount;
        this.log(state, `${player.name} erhält ${effect.amount} Gold.`, [player.id], effect.amount);
        continue;
      }
      if (effect.type === "payBank") {
        resolution.pendingPayments = [{ fromPlayerId: player.id, creditorType: "bank", amount: effect.amount, reason: card.title, reasonType: "card" }];
        this.processPaymentQueue(state, runtime);
        return;
      }
      if (effect.type === "payEachPlayer" || effect.type === "receiveFromEachPlayer") {
        const others = state.turnOrder.map((id) => state.players.find((candidate) => candidate.id === id)!)
          .filter((candidate) => candidate && candidate.id !== player.id && !candidate.isBankrupt);
        resolution.pendingPayments = others.map((other): PendingCardPayment => effect.type === "payEachPlayer"
          ? { fromPlayerId: player.id, toPlayerId: other.id, creditorType: "player", amount: effect.amount, reason: card.title, reasonType: "card" }
          : { fromPlayerId: other.id, toPlayerId: player.id, creditorType: "player", amount: effect.amount, reason: card.title, reasonType: "card" });
        this.processPaymentQueue(state, runtime);
        return;
      }
      if (effect.type === "repair") {
        let units = 0;
        let grandStructures = 0;
        state.propertyOwnerships.filter((ownership) => ownership.ownerId === player.id).forEach((ownership) => {
          if (ownership.buildingLevel === 5) grandStructures += 1;
          else units += ownership.buildingLevel;
        });
        const amount = units * effect.settlementUnitCost + grandStructures * effect.grandStructureCost;
        this.log(state, `${player.name}s Reparaturen kosten ${amount} Gold (${units} Baueinheiten, ${grandStructures} Großbauten).`, [player.id], -amount);
        if (amount > 0) {
          resolution.pendingPayments = [{ fromPlayerId: player.id, creditorType: "bank", amount, reason: card.title, reasonType: "cardRepair" }];
          this.processPaymentQueue(state, runtime);
          return;
        }
        continue;
      }
      if (effect.type === "keepDungeonRelease") {
        player.heldCards ??= [];
        player.heldCards.push({ cardId: card.id, deck: card.deck });
        this.log(state, `${player.name} erhält ${card.title}.`, [player.id]);
        continue;
      }
      if (effect.type === "goToDungeon") {
        if (preventDungeonWithAmulet(state, player)) continue;
        player.dungeon = { inDungeon: true, failedAttempts: 0 };
        state.turnContext.consecutiveDoubles = 0;
        state.turnContext.pendingExtraRoll = false;
        this.startMovement(state, resolution, player, DUNGEON_TILE_INDEX, [DUNGEON_TILE_INDEX], false, "dungeonTransfer");
        this.log(state, `${player.name} wird durch eine ${card.deck === "adventure" ? "Abenteuer" : "Schicksals"}karte in den Dunklen Kerker geschickt.`, [player.id]);
        return;
      }
      const movement = this.createCardMovement(state, player, effect);
      this.startMovement(state, resolution, player, movement.to, movement.path, movement.passedStart, "card");
      return;
    }
    resolution.status = "readyToAcknowledge";
    state.activeCard!.status = resolution.status;
    state.turnPhase = "cardAcknowledgement";
  }

  private processPaymentQueue(state: GameState, runtime: PrivateCardRuntime): void {
    const resolution = this.requireResolution(state);
    while (resolution.pendingPayments.length > 0) {
      const payment = resolution.pendingPayments[0]!;
      const payer = this.requirePlayer(state, payment.fromPlayerId);
      if (payer.isBankrupt) { resolution.pendingPayments.shift(); continue; }
      const payee = payment.toPlayerId ? this.requirePlayer(state, payment.toPlayerId) : undefined;
      if (payee?.isBankrupt) { resolution.pendingPayments.shift(); continue; }
      if (payer.gold < payment.amount) {
        state.pendingPayment = {
          payerId: payer.id, ...(payee ? { payeeId: payee.id } : {}), amount: payment.amount,
          reason: payment.reason, creditorType: payment.creditorType, reasonType: payment.reasonType
        };
        resolution.status = "waitingForPayment";
        state.activeCard!.status = resolution.status;
        state.turnPhase = "paymentRequired";
        this.log(state, `${payer.name} muss ${payment.amount} Gold für ${payment.reason} aufbringen.`, [payer.id]);
        return;
      }
      payer.gold -= payment.amount;
      if (payee) payee.gold += payment.amount;
      this.log(state, payee ? `${payer.name} zahlt ${payee.name} ${payment.amount} Gold.` : `${payer.name} zahlt ${payment.amount} Gold.`, payee ? [payer.id, payee.id] : [payer.id], -payment.amount);
      resolution.pendingPayments.shift();
    }
    resolution.status = "resolving";
    state.activeCard!.status = resolution.status;
    state.turnPhase = "cardResolving";
    this.processEffects(state, runtime);
  }

  private createCardMovement(state: GameState, player: GamePlayerState, effect: Exclude<ReturnType<typeof getCardDefinition>["effects"][number], { type: "receiveFromBank" | "payBank" | "payEachPlayer" | "receiveFromEachPlayer" | "repair" | "keepDungeonRelease" | "goToDungeon" }>) {
    const from = player.position;
    if (effect.type === "moveRelative") {
      const step = effect.offset < 0 ? -1 : 1;
      const path = Array.from({ length: Math.abs(effect.offset) }, (_, index) => (from + step * (index + 1) + BOARD_TILES.length * 2) % BOARD_TILES.length);
      return { to: path.at(-1) ?? from, path, passedStart: effect.offset > 0 && from + effect.offset >= BOARD_TILES.length };
    }
    let to: number;
    if (effect.type === "moveToTile") {
      const tile = BOARD_TILES.find((candidate) => candidate.id === effect.targetTileId);
      if (!tile) throw new Error(`Karten-Zielfeld fehlt: ${effect.targetTileId}`);
      to = tile.index;
    } else {
      const wantedType = effect.target;
      to = Array.from({ length: BOARD_TILES.length - 1 }, (_, offset) => (from + offset + 1) % BOARD_TILES.length)
        .find((index) => BOARD_TILES[index]!.type === wantedType)!;
    }
    const distance = (to - from + BOARD_TILES.length) % BOARD_TILES.length || BOARD_TILES.length;
    const path = Array.from({ length: distance }, (_, step) => (from + step + 1) % BOARD_TILES.length);
    return { to, path, passedStart: effect.collectStart && path.includes(0) };
  }

  private startMovement(state: GameState, resolution: CardResolutionState, player: GamePlayerState, to: number, path: number[], passedStart: boolean, kind: "card" | "dungeonTransfer"): void {
    state.turnContext.movementSequence = (state.turnContext.movementSequence ?? 0) + 1;
    state.lastMovement = {
      kind, sequence: state.turnContext.movementSequence, playerId: player.id, from: player.position, to, path, passedStart,
      landedTile: { ...BOARD_TILES[to]! }
    };
    resolution.status = "waitingForMovement";
    state.activeCard!.status = resolution.status;
    state.turnPhase = "cardMoving";
  }

  private abortAll(state: GameState, runtime: PrivateCardRuntime): void {
    if (state.cardResolution && !getCardDefinition(state.cardResolution.cardId).keepable) {
      runtime.decks[state.cardResolution.deck].discardPile.push(state.cardResolution.cardId);
    }
    runtime.stack.forEach((entry) => {
      if (!getCardDefinition(entry.resolution.cardId).keepable) runtime.decks[entry.resolution.deck].discardPile.push(entry.resolution.cardId);
    });
    runtime.stack = [];
    delete state.activeCard;
    delete state.cardResolution;
    this.syncPublicDecks(state, runtime);
  }

  private requireResolution(state: GameState): CardResolutionState {
    if (!state.cardResolution || !state.activeCard) throw new Error("Es gibt keine aktive Kartenauflösung.");
    return state.cardResolution;
  }

  private requirePlayer(state: GameState, playerId: string): GamePlayerState {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new Error("Dieser Spieler wurde nicht gefunden.");
    return player;
  }

  private cloneResolution(resolution: CardResolutionState): CardResolutionState {
    return { ...resolution, pendingPayments: resolution.pendingPayments.map((payment) => ({ ...payment })) };
  }

  private log(state: GameState, message: string, playerIds: string[], amount?: number): void {
    state.economyLog.push({ id: randomUUID(), kind: "system", message, playerIds, ...(amount === undefined ? {} : { amount }), createdAt: Date.now() });
    state.economyLog = state.economyLog.slice(-12);
  }
}
