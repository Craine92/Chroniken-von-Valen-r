import { randomUUID } from "node:crypto";
import {
  AUCTION_BID_INCREMENTS,
  BOARD_TILES,
  CROWN_TAX,
  DRAGON_TITHE,
  ECONOMY_CONFIG,
  PASS_START_GOLD,
  calculatePropertyRent,
  isBuyableTile,
  type AuctionBidIncrement,
  type BoardTile,
  type GamePlayerState,
  type GameState
} from "@valenor/shared";
import { startNextBankruptcyAuction } from "./bankruptcy-service";

const MAX_LOG_ENTRIES = 12;

export class EconomyService {
  resolveLanding(state: GameState): void {
    if (state.turnPhase !== "landed" || !state.lastMovement || !state.currentPlayerId) {
      throw new Error("Die Landung kann gerade nicht ausgewertet werden.");
    }
    const movementSequence = state.lastMovement.sequence ?? state.turnContext.rollSequence;
    if (state.lastResolvedMovementSequence === movementSequence) return;
    state.lastResolvedMovementSequence = movementSequence;

    const player = this.requirePlayer(state, state.currentPlayerId);
    const tile = BOARD_TILES[state.lastMovement.to]!;
    if (state.lastMovement.passedStart || (state.lastMovement.kind === "normal" && state.lastMovement.from !== 0 && tile.type === "start")) {
      player.gold += PASS_START_GOLD;
      this.log(state, "start", `${player.name} passiert das Runentor und erhält ${PASS_START_GOLD} Gold.`, [player.id], PASS_START_GOLD);
    }

    if (isBuyableTile(tile)) {
      const ownership = this.getOwnership(state, tile.index);
      if (!ownership) {
        state.turnPhase = "propertyDecision";
        return;
      }
      if (ownership.ownerId === player.id) {
        state.turnPhase = "waitingForEndTurn";
        return;
      }
      if (ownership.mortgaged) {
        this.log(state, "mortgage", `${tile.name} ist verpfändet. Keine Miete wird erhoben.`, [ownership.ownerId]);
        state.turnPhase = "waitingForEndTurn";
        return;
      }
      const owner = this.requirePlayer(state, ownership.ownerId);
      state.turnPhase = tile.type === "harbor" ? "harborResolution" : tile.type === "utility" ? "utilityResolution" : "rentResolution";
      const rent = this.calculateRent(state, tile, owner.id);
      if (this.transferMandatory(state, player, owner, rent, `Miete für ${tile.name}`)) {
        this.log(state, "rent", `${player.name} zahlt ${rent} Gold Miete an ${owner.name}.`, [player.id, owner.id], -rent);
        state.turnPhase = "waitingForEndTurn";
      }
      return;
    }

    if (tile.type === "tax") {
      state.turnPhase = "taxResolution";
      const amount = tile.index === 4 ? CROWN_TAX : DRAGON_TITHE;
      if (this.payBankMandatory(state, player, amount, tile.name)) {
        this.log(state, "tax", `${player.name} zahlt ${amount} Gold ${tile.name}.`, [player.id], -amount);
        state.turnPhase = "waitingForEndTurn";
      }
      return;
    }

    state.turnPhase = "waitingForEndTurn";
  }

  buyCurrentTile(state: GameState, playerId: string): void {
    this.requireDecisionActor(state, playerId);
    const tile = this.requireCurrentBuyableTile(state);
    if (this.getOwnership(state, tile.index)) throw new Error("Dieses Feld gehört bereits jemandem.");
    const player = this.requirePlayer(state, playerId);
    const price = tile.economy!.purchasePrice;
    if (player.gold < price) throw new Error("Dafür reicht dein Gold nicht aus.");
    player.gold -= price;
    state.propertyOwnerships.push({ tileIndex: tile.index, ownerId: player.id, mortgaged: false, buildingLevel: 0 });
    this.log(state, "purchase", `${player.name} kauft ${tile.name} für ${price} Gold.`, [player.id], -price);
    state.turnPhase = "waitingForEndTurn";
  }

  declineCurrentTile(state: GameState, playerId: string): void {
    this.requireDecisionActor(state, playerId);
    const tile = this.requireCurrentBuyableTile(state);
    state.auction = {
      tileIndex: tile.index,
      currentBid: 0,
      participantIds: state.players.filter((player) => !player.isBankrupt).map((player) => player.id),
      withdrawnPlayerIds: [],
      pausedForPlayerIds: [],
      revision: 0
      , source: "property"
    };
    state.turnPhase = "auction";
    this.syncAuctionPause(state);
    this.log(state, "auction", `${tile.name} wird versteigert.`, [playerId]);
  }

  bid(state: GameState, playerId: string, increment: AuctionBidIncrement): void {
    const auction = this.requireAuction(state);
    if (!AUCTION_BID_INCREMENTS.includes(increment)) throw new Error("Dieses Gebot ist nicht erlaubt.");
    if (!auction.participantIds.includes(playerId) || auction.withdrawnPlayerIds.includes(playerId)) {
      throw new Error("Du nimmst nicht mehr an dieser Auktion teil.");
    }
    if (auction.pausedForPlayerIds.length > 0) throw new Error("Die Auktion wartet auf eine Wiederverbindung.");
    const player = this.requirePlayer(state, playerId);
    const nextBid = auction.currentBid + increment;
    if (player.gold < nextBid) throw new Error("Dafür reicht dein Gold nicht aus.");
    auction.currentBid = nextBid;
    auction.highestBidderId = playerId;
    auction.revision += 1;
    this.log(state, "auction", `${player.name} bietet ${nextBid} Gold.`, [player.id], -nextBid);
    this.finishAuctionIfReady(state);
  }

  withdraw(state: GameState, playerId: string): void {
    const auction = this.requireAuction(state);
    if (!auction.participantIds.includes(playerId) || auction.withdrawnPlayerIds.includes(playerId)) {
      throw new Error("Du nimmst nicht mehr an dieser Auktion teil.");
    }
    if (auction.pausedForPlayerIds.length > 0) throw new Error("Die Auktion wartet auf eine Wiederverbindung.");
    if (auction.highestBidderId === playerId && auction.currentBid > 0) {
      throw new Error("Das derzeit höchste Gebot kann nicht zurückgezogen werden.");
    }
    auction.withdrawnPlayerIds.push(playerId);
    auction.revision += 1;
    this.finishAuctionIfReady(state);
  }

  syncAuctionPause(state: GameState): void {
    if (!state.auction || state.turnPhase !== "auction") return;
    state.auction.pausedForPlayerIds = state.auction.participantIds.filter((id) => {
      const player = state.players.find((candidate) => candidate.id === id);
      return player?.type === "human" && player.connectionState === "disconnected" && !state.auction!.withdrawnPlayerIds.includes(id);
    });
  }

  calculateRent(state: GameState, tile: BoardTile, ownerId: string): number {
    if (tile.type === "property") return calculatePropertyRent(state.propertyOwnerships, tile, ownerId);
    const ownedTypeCount = state.propertyOwnerships.filter((entry) => {
      if (entry.ownerId !== ownerId || entry.mortgaged) return false;
      return BOARD_TILES[entry.tileIndex]?.type === tile.type;
    }).length;
    if (tile.type === "harbor") return ECONOMY_CONFIG.harborRents[Math.max(0, ownedTypeCount - 1)] ?? 0;
    if (tile.type === "utility") {
      const multiplier = ownedTypeCount >= 2 ? ECONOMY_CONFIG.utilityMultipliers[1] : ECONOMY_CONFIG.utilityMultipliers[0];
      return multiplier * (state.lastDiceRoll?.total ?? 0);
    }
    return 0;
  }

  settlePendingPayment(state: GameState, playerId: string): void {
    const payment = state.pendingPayment;
    if (state.turnPhase !== "paymentRequired" || !payment) throw new Error("Es besteht keine offene Forderung.");
    if (payment.payerId !== playerId) throw new Error("Diese Forderung gehört einem anderen Gefährten.");
    const payer = this.requirePlayer(state, playerId);
    if (payer.gold < payment.amount) throw new Error("Dein verfügbares Gold reicht weiterhin nicht aus.");
    payer.gold -= payment.amount;
    if (payment.payeeId) {
      const payee = this.requirePlayer(state, payment.payeeId);
      payee.gold += payment.amount;
      this.log(state, payment.reasonType === "card" ? "system" : "rent", payment.reasonType === "card"
        ? `${payer.name} zahlt ${payee.name} ${payment.amount} Gold für ${payment.reason}.`
        : `${payer.name} zahlt ${payment.amount} Gold Miete an ${payee.name}.`, [payer.id, payee.id], -payment.amount);
    } else {
      const message = payment.reasonType === "dungeonRelease"
        ? `${payer.name} begleicht ${payment.amount} Gold Kerkergebühr.`
        : `${payer.name} begleicht ${payment.amount} Gold für ${payment.reason}.`;
      this.log(state, "tax", message, [payer.id], -payment.amount);
    }
    delete state.pendingPayment;
    state.turnPhase = "waitingForEndTurn";
  }

  private finishAuctionIfReady(state: GameState): void {
    const auction = this.requireAuction(state);
    const remaining = auction.participantIds.filter((id) => !auction.withdrawnPlayerIds.includes(id));
    if (remaining.length === 0 && auction.currentBid === 0) {
      const tile = BOARD_TILES[auction.tileIndex]!;
      this.log(state, "auction", `Für ${tile.name} wurde kein Gebot abgegeben.`, []);
      const wasBankruptcyAuction = auction.source === "bankruptcy";
      delete state.auction;
      if (!wasBankruptcyAuction || !startNextBankruptcyAuction(state)) {
        if (!wasBankruptcyAuction) state.turnPhase = "waitingForEndTurn";
      }
      return;
    }
    if (remaining.length !== 1 || auction.currentBid <= 0 || auction.highestBidderId !== remaining[0]) return;
    const winner = this.requirePlayer(state, remaining[0]!);
    if (winner.gold < auction.currentBid) throw new Error("Das Höchstgebot kann nicht bezahlt werden.");
    winner.gold -= auction.currentBid;
    state.propertyOwnerships.push({ tileIndex: auction.tileIndex, ownerId: winner.id, mortgaged: false, buildingLevel: 0 });
    const tile = BOARD_TILES[auction.tileIndex]!;
    this.log(state, "auction", `${winner.name} ersteigert ${tile.name} für ${auction.currentBid} Gold.`, [winner.id], -auction.currentBid);
    const wasBankruptcyAuction = auction.source === "bankruptcy";
    delete state.auction;
    if (!wasBankruptcyAuction || !startNextBankruptcyAuction(state)) {
      if (!wasBankruptcyAuction) state.turnPhase = "waitingForEndTurn";
    }
  }

  private transferMandatory(state: GameState, payer: GamePlayerState, payee: GamePlayerState, amount: number, reason: string): boolean {
    if (payer.gold < amount) return this.requirePayment(state, payer.id, amount, reason, payee.id);
    payer.gold -= amount;
    payee.gold += amount;
    return true;
  }

  private payBankMandatory(state: GameState, player: GamePlayerState, amount: number, reason: string): boolean {
    if (player.gold < amount) return this.requirePayment(state, player.id, amount, reason);
    player.gold -= amount;
    return true;
  }

  private requirePayment(state: GameState, payerId: string, amount: number, reason: string, payeeId?: string): false {
    state.turnPhase = "paymentRequired";
    state.pendingPayment = {
      payerId, amount, reason,
      creditorType: payeeId ? "player" : "bank",
      reasonType: payeeId ? "rent" : "tax",
      ...(payeeId ? { payeeId } : {})
    };
    const player = this.requirePlayer(state, payerId);
    this.log(state, "system", `${player.name} muss ${amount} Gold für ${reason} aufbringen.`, [payerId]);
    return false;
  }

  private requireDecisionActor(state: GameState, playerId: string): void {
    if (state.turnPhase !== "propertyDecision" || state.currentPlayerId !== playerId) {
      throw new Error("Diese Kaufentscheidung steht dir gerade nicht zu.");
    }
  }

  private requireCurrentBuyableTile(state: GameState): BoardTile {
    const tile = state.lastMovement ? BOARD_TILES[state.lastMovement.to] : undefined;
    if (!tile || !isBuyableTile(tile) || !tile.economy) throw new Error("Hier gibt es nichts zu kaufen.");
    return tile;
  }

  private requireAuction(state: GameState) {
    if (state.turnPhase !== "auction" || !state.auction) throw new Error("Es läuft gerade keine Auktion.");
    return state.auction;
  }

  private getOwnership(state: GameState, tileIndex: number) {
    return state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex);
  }

  private requirePlayer(state: GameState, playerId: string): GamePlayerState {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new Error("Dieser Spieler wurde nicht gefunden.");
    return player;
  }

  private log(state: GameState, kind: Parameters<typeof this.createLog>[1], message: string, playerIds: string[], amount?: number): void {
    state.economyLog.push(this.createLog(state, kind, message, playerIds, amount));
    state.economyLog = state.economyLog.slice(-MAX_LOG_ENTRIES);
  }

  private createLog(_state: GameState, kind: GameState["economyLog"][number]["kind"], message: string, playerIds: string[], amount?: number) {
    return { id: randomUUID(), kind, message, playerIds, ...(amount === undefined ? {} : { amount }), createdAt: Date.now() };
  }
}
