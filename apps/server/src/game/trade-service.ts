import { randomUUID } from "node:crypto";
import { BOARD_TILES, getCardDefinition, type GameState, type TradeAssets, type TradeOffer } from "@valenor/shared";

export interface CreateTradeRequest {
  recipientId: string;
  offer: TradeAssets;
  request: TradeAssets;
}

const SAFE_PHASES = new Set(["waitingForRoll", "waitingForEndTurn"]);

export class TradeService {
  create(state: GameState, proposerId: string, request: CreateTradeRequest): TradeOffer {
    this.requireSafePhase(state);
    const offer: TradeOffer = {
      id: randomUUID(), proposerId, recipientId: request.recipientId,
      offer: this.normalizeAssets(request.offer), request: this.normalizeAssets(request.request),
      status: "pending", createdAt: Date.now()
    };
    this.validate(state, offer);
    if (offer.offer.gold === 0 && offer.request.gold === 0 && offer.offer.propertyTileIndices.length === 0 && offer.request.propertyTileIndices.length === 0 && !(offer.offer.cardIds?.length) && !(offer.request.cardIds?.length)) {
      throw new Error("Ein Handelsangebot muss mindestens einen Wert enthalten.");
    }
    state.trades.push(offer);
    state.lastTradeAction = { id: randomUUID(), type: "created", proposerId, recipientId: offer.recipientId, createdAt: Date.now() };
    const proposer = state.players.find((player) => player.id === proposerId)!;
    const recipient = state.players.find((player) => player.id === offer.recipientId)!;
    this.log(state, `${proposer.name} unterbreitet ${recipient.name} ein Handelsangebot.`, [proposerId, recipient.id]);
    return offer;
  }

  accept(state: GameState, recipientId: string, tradeId: string): void {
    this.requireSafePhase(state);
    const trade = this.requirePending(state, tradeId);
    if (trade.recipientId !== recipientId) throw new Error("Dieses Angebot ist nicht an dich gerichtet.");
    try {
      this.validate(state, trade);
    } catch (error) {
      trade.status = "cancelled";
      throw new Error(`Dieses Angebot ist nicht mehr gültig. ${error instanceof Error ? error.message : ""}`.trim());
    }
    const proposer = state.players.find((player) => player.id === trade.proposerId)!;
    const recipient = state.players.find((player) => player.id === trade.recipientId)!;

    proposer.gold = proposer.gold - trade.offer.gold + trade.request.gold;
    recipient.gold = recipient.gold - trade.request.gold + trade.offer.gold;
    trade.offer.propertyTileIndices.forEach((tileIndex) => { state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex)!.ownerId = recipient.id; });
    trade.request.propertyTileIndices.forEach((tileIndex) => { state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex)!.ownerId = proposer.id; });
    this.transferCards(proposer, recipient, trade.offer.cardIds ?? []);
    this.transferCards(recipient, proposer, trade.request.cardIds ?? []);
    trade.status = "accepted";
    state.lastTradeAction = { id: randomUUID(), type: "accepted", proposerId: proposer.id, recipientId: recipient.id, createdAt: Date.now() };
    this.log(state, `${proposer.name} und ${recipient.name} schließen einen Handel.`, [proposer.id, recipient.id]);
  }

  reject(state: GameState, recipientId: string, tradeId: string): void {
    const trade = this.requirePending(state, tradeId);
    if (trade.recipientId !== recipientId) throw new Error("Dieses Angebot ist nicht an dich gerichtet.");
    trade.status = "rejected";
  }

  cancel(state: GameState, proposerId: string, tradeId: string): void {
    const trade = this.requirePending(state, tradeId);
    if (trade.proposerId !== proposerId) throw new Error("Nur der Anbieter kann dieses Angebot zurückziehen.");
    trade.status = "cancelled";
  }

  private validate(state: GameState, trade: TradeOffer): void {
    const proposer = state.players.find((player) => player.id === trade.proposerId);
    const recipient = state.players.find((player) => player.id === trade.recipientId);
    if (!proposer || !recipient || proposer.id === recipient.id) throw new Error("Die Handelspartner sind ungültig.");
    if (proposer.type !== "human" || recipient.type !== "human") throw new Error("Handel ist derzeit nur zwischen Menschen möglich.");
    if (proposer.isBankrupt || recipient.isBankrupt) throw new Error("Ausgeschiedene Gefährten können nicht handeln.");
    if (proposer.connectionState === "disconnected" || recipient.connectionState === "disconnected") throw new Error("Beide Handelspartner müssen verbunden sein.");
    if (proposer.gold < trade.offer.gold || recipient.gold < trade.request.gold) throw new Error("Für dieses Angebot ist nicht genügend Gold vorhanden.");
    this.validateProperties(state, trade.offer.propertyTileIndices, proposer.id);
    this.validateProperties(state, trade.request.propertyTileIndices, recipient.id);
    this.validateCards(proposer, trade.offer.cardIds ?? []);
    this.validateCards(recipient, trade.request.cardIds ?? []);
  }

  private validateProperties(state: GameState, tileIndices: readonly number[], ownerId: string): void {
    tileIndices.forEach((tileIndex) => {
      const tile = BOARD_TILES[tileIndex];
      const ownership = state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex);
      if (!tile?.economy || !ownership || ownership.ownerId !== ownerId) throw new Error("Ein angebotener Besitz gehört nicht mehr dem angegebenen Eigentümer.");
      if (tile.type === "property" && tile.propertyGroup) {
        const groupHasBuildings = state.propertyOwnerships.some((entry) => BOARD_TILES[entry.tileIndex]?.propertyGroup === tile.propertyGroup && entry.buildingLevel > 0);
        if (groupHasBuildings) throw new Error("Zuerst müssen alle Bauwerke dieser Region verkauft werden.");
      }
    });
  }

  private normalizeAssets(assets: TradeAssets): TradeAssets {
    if (!Number.isSafeInteger(assets.gold) || assets.gold < 0) throw new Error("Der Goldbetrag ist ungültig.");
    if (!Array.isArray(assets.propertyTileIndices) || assets.propertyTileIndices.some((index) => !Number.isInteger(index))) throw new Error("Die Besitzliste ist ungültig.");
    if (assets.cardIds !== undefined && (!Array.isArray(assets.cardIds) || assets.cardIds.some((id) => typeof id !== "string"))) throw new Error("Die Kartenliste ist ungültig.");
    return { gold: assets.gold, propertyTileIndices: [...new Set(assets.propertyTileIndices)], cardIds: [...new Set(assets.cardIds ?? [])] };
  }

  private validateCards(owner: GameState["players"][number], cardIds: readonly string[]): void {
    cardIds.forEach((cardId) => {
      const card = getCardDefinition(cardId);
      if (!card.keepable || !card.effects.some((effect) => effect.type === "keepDungeonRelease")) throw new Error("Nur gehaltene Kerkerbefreiungskarten dürfen gehandelt werden.");
      if (!(owner.heldCards ?? []).some((held) => held.cardId === cardId && held.deck === card.deck)) throw new Error("Eine angebotene Karte gehört nicht mehr dem angegebenen Eigentümer.");
    });
  }

  private transferCards(from: GameState["players"][number], to: GameState["players"][number], cardIds: readonly string[]): void {
    from.heldCards ??= [];
    to.heldCards ??= [];
    cardIds.forEach((cardId) => {
      const index = from.heldCards!.findIndex((held) => held.cardId === cardId);
      if (index < 0) throw new Error("Eine Handelskarte ist nicht mehr verfügbar.");
      to.heldCards!.push(from.heldCards!.splice(index, 1)[0]!);
    });
  }

  private requireSafePhase(state: GameState): void {
    if (state.status !== "playing" || !SAFE_PHASES.has(state.turnPhase) || state.auction || state.pendingPayment) throw new Error("Während dieser Spielphase ist kein Handel möglich.");
  }

  private requirePending(state: GameState, tradeId: string): TradeOffer {
    const trade = state.trades.find((entry) => entry.id === tradeId);
    if (!trade || trade.status !== "pending") throw new Error("Dieses Handelsangebot ist nicht mehr offen.");
    return trade;
  }

  private log(state: GameState, message: string, playerIds: string[]): void {
    state.economyLog.push({ id: randomUUID(), kind: "trade", message, playerIds, createdAt: Date.now() });
    state.economyLog = state.economyLog.slice(-12);
  }
}
