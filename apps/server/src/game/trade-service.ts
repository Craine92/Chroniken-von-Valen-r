import { randomUUID } from "node:crypto";
import { BOARD_TILES, QUICK_TRADE_MIN_PRICE, formatQuickTradeHeadline, getCardDefinition, getOpenQuickTrade, getPropertyGroupTiles, getQuickTradeExpiryReason, getQuickTradeTerms, type GameState, type QuickTradeRequest, type TradeAssets, type TradeMode, type TradeOffer } from "@valenor/shared";
import { completeQuests, ownershipQuestTypes } from "./quest-service";
import { recordLargeTrade, recordNewCompleteGroups } from "./momentum-celebration-service";

export interface CreateTradeRequest {
  counterToTradeId?: string;
  mode?: TradeMode;
  recipientId: string;
  offer: TradeAssets;
  request: TradeAssets;
}

const SAFE_PHASES = new Set(["waitingForRoll", "waitingForEndTurn"]);
export const NPC_TRADE_GOLD_RESERVE = 200;

export class TradeService {
  wouldBreakCompleteGroup(state: GameState, ownerId: string, tileIndices: readonly number[]): boolean {
    return tileIndices.some(index => {
      const group = BOARD_TILES[index]?.propertyGroup;
      return Boolean(group && getPropertyGroupTiles(group).every(tile => state.propertyOwnerships.some(entry => entry.tileIndex === tile.index && entry.ownerId === ownerId)));
    });
  }

  isValid(state: GameState, trade: TradeOffer): boolean {
    try {
      this.requireSafePhase(state);
      if (trade.status !== "pending") return false;
      this.validate(state, trade);
      return true;
    } catch { return false; }
  }

  create(state: GameState, proposerId: string, request: CreateTradeRequest): TradeOffer {
    this.requireSafePhase(state);
    const original = request.counterToTradeId === undefined ? undefined : this.requirePending(state, request.counterToTradeId);
    if (original && (original.recipientId !== proposerId || original.proposerId !== request.recipientId)) {
      throw new Error("Nur der Empfänger kann dem ursprünglichen Anbieter ein Gegenangebot senden.");
    }
    const quick = request.mode === "quick" || original?.mode === "quick";
    const offer: TradeOffer = {
      id: randomUUID(), proposerId, recipientId: request.recipientId,
      offer: this.normalizeAssets(request.offer), request: this.normalizeAssets(request.request),
      status: "pending", createdAt: Date.now(), ...(original ? { counterToTradeId: original.id } : {}), ...(quick ? { mode: "quick" as const } : {})
    };
    this.validate(state, offer);
    if (offer.offer.gold === 0 && offer.request.gold === 0 && offer.offer.propertyTileIndices.length === 0 && offer.request.propertyTileIndices.length === 0 && !(offer.offer.cardIds?.length) && !(offer.request.cardIds?.length) && !offer.offer.relicIds?.length && !offer.request.relicIds?.length) {
      throw new Error("Ein Handelsangebot muss mindestens einen Wert enthalten.");
    }
    if (quick) {
      this.validateQuickShape(offer, original);
      if (getOpenQuickTrade(state, proposerId)) throw new Error("Du hast bereits ein offenes Schnellangebot. Zieh es zurück, bevor du ein neues sendest.");
      const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === getQuickTradeTerms(offer)!.tileIndex)!;
      offer.quickSnapshot = { round: state.currentRound, mortgaged: ownership.mortgaged };
    }
    if (original) original.status = "countered";
    state.trades.push(offer);
    state.lastTradeAction = { id: randomUUID(), tradeId: offer.id, type: "created", proposerId, recipientId: offer.recipientId, createdAt: Date.now() };
    const proposer = state.players.find((player) => player.id === proposerId)!;
    const recipient = state.players.find((player) => player.id === offer.recipientId)!;
    const message = quick ? formatQuickTradeHeadline(state, offer)!
      : proposer.type === "computer" && !original && offer.offer.gold > 0 && offer.request.propertyTileIndices.length === 1
        ? `${proposer.name} bietet ${recipient.name} ${offer.offer.gold} Gold für ${BOARD_TILES[offer.request.propertyTileIndices[0]!]!.name}.`
        : `${proposer.name} unterbreitet ${recipient.name} ein ${original ? "Gegenangebot" : "Handelsangebot"}.`;
    this.log(state, message, [proposerId, recipient.id]);
    return offer;
  }

  /** Schnellhandel: Der Server leitet Richtung und Partner aus dem Besitz ab; der Client nennt nur Feld und Preis. */
  createQuick(state: GameState, actorId: string, request: QuickTradeRequest): TradeOffer {
    this.requireSafePhase(state);
    if (!Number.isInteger(request.tileIndex)) throw new Error("Das Grundstück ist ungültig.");
    if (!Number.isSafeInteger(request.gold) || request.gold < QUICK_TRADE_MIN_PRICE) throw new Error(`Ein Schnellhandel braucht mindestens ${QUICK_TRADE_MIN_PRICE} Gold.`);
    const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === request.tileIndex);
    if (!BOARD_TILES[request.tileIndex]?.economy || !ownership) throw new Error("Dieses Grundstück hat keinen Besitzer, mit dem du handeln könntest.");
    const original = request.counterToTradeId === undefined ? undefined : this.requirePending(state, request.counterToTradeId);
    const selling = ownership.ownerId === actorId;
    if (!selling && request.recipientId !== undefined && request.recipientId !== ownership.ownerId) throw new Error("Dieses Grundstück gehört einem anderen Gefährten.");
    const recipientId = original ? original.proposerId : selling ? request.recipientId : ownership.ownerId;
    if (!recipientId) throw new Error("Wähle zuerst einen Käufer für dein Grundstück.");
    const property = { gold: 0, propertyTileIndices: [request.tileIndex] };
    const payment = { gold: request.gold, propertyTileIndices: [] };
    return this.create(state, actorId, {
      recipientId, mode: "quick",
      offer: selling ? property : payment,
      request: selling ? payment : property,
      ...(original ? { counterToTradeId: original.id } : {})
    });
  }

  accept(state: GameState, recipientId: string, tradeId: string): void {
    this.requireSafePhase(state);
    const trade = this.requirePending(state, tradeId);
    if (trade.recipientId !== recipientId) throw new Error("Dieses Angebot ist nicht an dich gerichtet.");
    const expiryReason = trade.mode === "quick" ? getQuickTradeExpiryReason(state, trade) : undefined;
    if (expiryReason) {
      this.expire(state, trade, expiryReason);
      throw new Error(`Dieses Angebot ist verfallen. ${expiryReason}`);
    }
    try {
      this.validate(state, trade);
      for (const player of state.players.filter(player => player.type === "computer" && (player.id === trade.proposerId || player.id === trade.recipientId))) {
        const incoming = player.id === trade.recipientId ? trade.offer : trade.request;
        const outgoing = player.id === trade.recipientId ? trade.request : trade.offer;
        if (player.gold + incoming.gold - outgoing.gold < NPC_TRADE_GOLD_RESERVE) throw new Error("Der Computer würde seine Goldreserve unterschreiten.");
        if (this.wouldBreakCompleteGroup(state, player.id, outgoing.propertyTileIndices)) throw new Error("Der Computer würde eine vollständige eigene Baugruppe aufgeben.");
      }
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
    state.lastTradeAction = { id: randomUUID(), tradeId: trade.id, type: "accepted", proposerId: proposer.id, recipientId: recipient.id, createdAt: Date.now() };
    const quickTerms = trade.mode === "quick" ? getQuickTradeTerms(trade) : undefined;
    this.log(state, quickTerms
      ? `Handel besiegelt: ${state.players.find(player => player.id === quickTerms.buyerId)!.name} erwirbt ${BOARD_TILES[quickTerms.tileIndex]!.name} von ${state.players.find(player => player.id === quickTerms.sellerId)!.name} für ${quickTerms.gold} Gold.`
      : recipient.type === "computer" ? `${recipient.name} nimmt das Handelsangebot von ${proposer.name} an.` : `${proposer.name} und ${recipient.name} schließen einen Handel.`, [proposer.id, recipient.id]);
    completeQuests(state, proposer.id, trade.id, ownershipQuestTypes(state, proposer.id, trade.request.propertyTileIndices));
    completeQuests(state, recipient.id, trade.id, ownershipQuestTypes(state, recipient.id, trade.offer.propertyTileIndices));
    recordNewCompleteGroups(state, proposer.id);
    recordNewCompleteGroups(state, recipient.id);
    recordLargeTrade(state, trade);
  }

  reject(state: GameState, recipientId: string, tradeId: string): void {
    const trade = this.requirePending(state, tradeId);
    if (trade.recipientId !== recipientId) throw new Error("Dieses Angebot ist nicht an dich gerichtet.");
    trade.status = "rejected";
    state.lastTradeAction = { id: randomUUID(), tradeId: trade.id, type: "rejected", proposerId: trade.proposerId, recipientId, createdAt: Date.now() };
    const recipient = state.players.find(player => player.id === recipientId);
    const proposerName = state.players.find(player => player.id === trade.proposerId)!.name;
    const quickTerms = trade.mode === "quick" ? getQuickTradeTerms(trade) : undefined;
    if (quickTerms && recipient) this.log(state, `${recipient.name} lehnt das Angebot von ${proposerName} für ${BOARD_TILES[quickTerms.tileIndex]!.name} ab.`, [trade.proposerId, recipientId]);
    else if (recipient?.type === "computer") this.log(state, `${recipient.name} lehnt das Handelsangebot von ${proposerName} ab.`, [trade.proposerId, recipientId]);
  }

  cancel(state: GameState, proposerId: string, tradeId: string): void {
    const trade = this.requirePending(state, tradeId);
    if (trade.proposerId !== proposerId) throw new Error("Nur der Anbieter kann dieses Angebot zurückziehen.");
    trade.status = "cancelled";
    if (trade.mode !== "quick") return;
    state.lastTradeAction = { id: randomUUID(), tradeId: trade.id, type: "cancelled", proposerId, recipientId: trade.recipientId, createdAt: Date.now() };
    const terms = getQuickTradeTerms(trade);
    if (terms) this.log(state, `${state.players.find(player => player.id === proposerId)!.name} zieht das Angebot für ${BOARD_TILES[terms.tileIndex]!.name} zurück.`, [proposerId, trade.recipientId]);
  }

  /** Lässt jedes offene Schnellangebot verfallen, das nicht mehr zum Spielstand passt. Läuft nach jeder Zustandsänderung. */
  expireStaleQuickTrades(state: GameState): void {
    for (const trade of state.trades) {
      if (trade.status !== "pending" || trade.mode !== "quick") continue;
      const reason = getQuickTradeExpiryReason(state, trade);
      if (reason) this.expire(state, trade, reason);
    }
  }

  private expire(state: GameState, trade: TradeOffer, reason: string): void {
    trade.status = "expired";
    trade.closedReason = reason;
    state.lastTradeAction = { id: randomUUID(), tradeId: trade.id, type: "expired", proposerId: trade.proposerId, recipientId: trade.recipientId, createdAt: Date.now() };
    const terms = getQuickTradeTerms(trade);
    const proposerName = state.players.find(player => player.id === trade.proposerId)?.name ?? "Ein Gefährte";
    this.log(state, `Das Angebot von ${proposerName}${terms ? ` für ${BOARD_TILES[terms.tileIndex]!.name}` : ""} ist verfallen: ${reason}`, [trade.proposerId, trade.recipientId]);
  }

  private validate(state: GameState, trade: TradeOffer): void {
    if (trade.offer.relicIds?.length || trade.request.relicIds?.length) throw new Error("Relikte können nicht gehandelt werden.");
    const proposer = state.players.find((player) => player.id === trade.proposerId);
    const recipient = state.players.find((player) => player.id === trade.recipientId);
    if (!proposer || !recipient || proposer.id === recipient.id) throw new Error("Die Handelspartner sind ungültig.");
    if (proposer.type === "computer" && recipient.type === "computer") throw new Error("Computer handeln in diesem Schritt nur mit Menschen.");
    if (proposer.isBankrupt || recipient.isBankrupt) throw new Error("Ausgeschiedene Gefährten können nicht handeln.");
    if ([proposer, recipient].some(player => player.type === "human" && player.connectionState !== "connected")) throw new Error("Menschliche Handelspartner müssen verbunden sein.");
    if (proposer.gold < trade.offer.gold || recipient.gold < trade.request.gold) throw new Error("Für dieses Angebot ist nicht genügend Gold vorhanden.");
    this.validateProperties(state, trade.offer.propertyTileIndices, proposer.id);
    this.validateProperties(state, trade.request.propertyTileIndices, recipient.id);
    this.validateCards(proposer, trade.offer.cardIds ?? []);
    this.validateCards(recipient, trade.request.cardIds ?? []);
  }

  private validateQuickShape(trade: TradeOffer, original: TradeOffer | undefined): void {
    const terms = getQuickTradeTerms(trade);
    if (!terms) throw new Error("Ein Schnellhandel tauscht genau ein Grundstück gegen Gold.");
    if (!original) return;
    const previous = getQuickTradeTerms(original);
    if (!previous || previous.tileIndex !== terms.tileIndex || previous.buyerId !== terms.buyerId || previous.sellerId !== terms.sellerId) {
      throw new Error("Ein Gegenangebot im Schnellhandel darf nur den Preis ändern.");
    }
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
    if (assets.relicIds?.length) throw new Error("Relikte können nicht gehandelt werden.");
    return { gold: assets.gold, propertyTileIndices: [...new Set(assets.propertyTileIndices)], cardIds: [...new Set(assets.cardIds ?? [])], relicIds: [] };
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
