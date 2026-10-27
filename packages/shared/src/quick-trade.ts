import { BOARD_TILES, getPropertyGroupTiles } from "./board";
import { getEffectiveMortgageRedemptionCost } from "./finance";
import type { GameState, TradeOffer } from "./game";

/** Schnellhandel: genau ein Besitz gegen Gold. Preise ändern sich in diesen Schritten. */
export const QUICK_TRADE_PRICE_STEPS = [10, 50] as const;
export const QUICK_TRADE_MIN_PRICE = 10;
export const QUICK_TRADE_GROUP_COMPLETION_BONUS = 0.1;
export const QUICK_TRADE_SELLER_GROUP_BONUS = 0.1;
export const QUICK_TRADE_NETWORK_BONUS = 0.05;

/**
 * Preisbewertung relativ zum fairen Preis: unter `cheapBelow` gilt ein Angebot als günstig,
 * über `highAbove` als hoch, dazwischen als fair. Beide Grenzen sind Anteile des fairen Preises.
 */
export const QUICK_TRADE_PRICE_RATING_BOUNDS = { cheapBelow: 0.9, highAbove: 1.1 } as const;
export type QuickTradePriceRating = "cheap" | "fair" | "high";
export const QUICK_TRADE_PRICE_RATING_LABELS: Record<QuickTradePriceRating, string> = { cheap: "günstig", fair: "fair", high: "hoch" };

export function rateQuickTradePrice(gold: number, fairPrice: number): QuickTradePriceRating {
  if (fairPrice <= 0) return "fair";
  if (gold < fairPrice * QUICK_TRADE_PRICE_RATING_BOUNDS.cheapBelow) return "cheap";
  if (gold > fairPrice * QUICK_TRADE_PRICE_RATING_BOUNDS.highAbove) return "high";
  return "fair";
}

/**
 * Wie ein Preis für den Betrachter ausfällt: Ein hoher Preis ist für den Verkäufer gut und für den Käufer schlecht.
 * Die Grenzen kommen weiter aus QUICK_TRADE_PRICE_RATING_BOUNDS; nur Text und Farbe hängen von der Rolle ab.
 */
export type QuickTradeRole = "buyer" | "seller";
export type QuickTradePriceTone = "good" | "fair" | "poor";
export interface QuickTradePriceVerdict { rating: QuickTradePriceRating; tone: QuickTradePriceTone; label: string }

/** "offer": ein eingehendes Angebot; "draft": der eigene Preis auf dem Preisbildschirm oder das eigene offene Angebot. */
export const QUICK_TRADE_PRICE_TONE_LABELS: Record<"offer" | "draft", Record<QuickTradePriceTone, string>> = {
  offer: { good: "Sehr gutes Angebot", fair: "Faires Angebot", poor: "Schwaches Angebot" },
  draft: { good: "Gut für dich", fair: "Fairer Preis", poor: "Ungünstig für dich" }
};

export function getQuickTradePriceVerdict(gold: number, fairPrice: number, role: QuickTradeRole, context: "offer" | "draft"): QuickTradePriceVerdict {
  const rating = rateQuickTradePrice(gold, fairPrice);
  const tone: QuickTradePriceTone = rating === "fair" ? "fair" : (rating === "high") === (role === "seller") ? "good" : "poor";
  return { rating, tone, label: QUICK_TRADE_PRICE_TONE_LABELS[context][tone] };
}

export interface QuickTradeRequest {
  tileIndex: number;
  gold: number;
  /** Nur beim Verkauf eines eigenen Besitzes nötig; beim Kauf bestimmt der Server den Eigentümer. */
  recipientId?: string;
  counterToTradeId?: string;
}

export interface QuickTradeTerms { tileIndex: number; gold: number; sellerId: string; buyerId: string }
export interface QuickTradePriceFactor { label: string; amount: number }
export interface QuickTradeSuggestion {
  tileIndex: number;
  sellerId: string;
  buyerId: string;
  fairPrice: number;
  minPrice: number;
  maxPrice: number;
  factors: QuickTradePriceFactor[];
}
export interface QuickTradeEligibility { allowed: boolean; reason?: string }

const roundToStep = (value: number) => Math.round(value / QUICK_TRADE_PRICE_STEPS[0]) * QUICK_TRADE_PRICE_STEPS[0];

/** Liest Grundstück, Preis und Rollen aus einem Angebot, das genau ein Grundstück gegen Gold tauscht. */
export function getQuickTradeTerms(trade: Pick<TradeOffer, "proposerId" | "recipientId" | "offer" | "request">): QuickTradeTerms | undefined {
  const sides = [trade.offer, trade.request];
  if (sides.some(side => side.cardIds?.length || side.relicIds?.length)) return undefined;
  const [property, payment] = trade.offer.propertyTileIndices.length ? [trade.offer, trade.request] : [trade.request, trade.offer];
  if (property.propertyTileIndices.length !== 1 || property.gold !== 0 || payment.propertyTileIndices.length !== 0 || payment.gold <= 0) return undefined;
  const proposerSells = property === trade.offer;
  return {
    tileIndex: property.propertyTileIndices[0]!, gold: payment.gold,
    sellerId: proposerSells ? trade.proposerId : trade.recipientId,
    buyerId: proposerSells ? trade.recipientId : trade.proposerId
  };
}

export function isQuickTrade(trade: TradeOffer): boolean {
  return trade.mode === "quick" && getQuickTradeTerms(trade) !== undefined;
}

/** Schlägt einen fairen Preis aus Kaufpreis, Hypothek und Gruppenwert vor. Bebaute Regionen sind nicht handelbar. */
export function getQuickTradeSuggestion(state: GameState, tileIndex: number, buyerId: string): QuickTradeSuggestion | undefined {
  const tile = BOARD_TILES[tileIndex];
  const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === tileIndex);
  const buyer = state.players.find(player => player.id === buyerId);
  if (!tile?.economy || !ownership || !buyer || ownership.ownerId === buyerId) return undefined;
  const sellerId = ownership.ownerId;
  const factors: QuickTradePriceFactor[] = [{ label: "Kaufpreis", amount: tile.economy.purchasePrice }];
  if (ownership.mortgaged) factors.push({ label: "Hypothek muss ausgelöst werden", amount: -getEffectiveMortgageRedemptionCost(state, tile) });
  const base = Math.max(0, factors.reduce((sum, factor) => sum + factor.amount, 0));
  const ownedBy = (ownerId: string, index: number) => state.propertyOwnerships.some(entry => entry.tileIndex === index && entry.ownerId === ownerId);
  if (tile.type === "property" && tile.propertyGroup) {
    const others = getPropertyGroupTiles(tile.propertyGroup).filter(member => member.index !== tileIndex);
    if (others.length > 0 && others.every(member => ownedBy(buyerId, member.index))) {
      factors.push({ label: `Vervollständigt ${tile.propertyGroup}`, amount: Math.round(base * QUICK_TRADE_GROUP_COMPLETION_BONUS) });
    }
    if (others.some(member => ownedBy(sellerId, member.index))) {
      factors.push({ label: "Verkäufer gibt eine Teilgruppe auf", amount: Math.round(base * QUICK_TRADE_SELLER_GROUP_BONUS) });
    }
  } else if (tile.type === "harbor" || tile.type === "utility") {
    const network = state.propertyOwnerships.filter(entry => entry.ownerId === buyerId && entry.tileIndex !== tileIndex && BOARD_TILES[entry.tileIndex]?.type === tile.type).length;
    if (network > 0) factors.push({ label: tile.type === "harbor" ? "Stärkt das Hafennetz" : "Stärkt die Versorgung", amount: Math.round(base * QUICK_TRADE_NETWORK_BONUS * network) });
  }
  const total = factors.reduce((sum, factor) => sum + factor.amount, 0);
  return {
    tileIndex, sellerId, buyerId,
    fairPrice: Math.max(QUICK_TRADE_MIN_PRICE, roundToStep(total)),
    minPrice: QUICK_TRADE_MIN_PRICE,
    maxPrice: buyer.gold,
    factors
  };
}

/** Anzeigeprüfung für Smartphone und KI. Der Server prüft beim Erstellen und Annehmen erneut. */
export function getQuickTradeEligibility(state: GameState, sellerId: string, buyerId: string, tileIndex: number): QuickTradeEligibility {
  const tile = BOARD_TILES[tileIndex];
  const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === tileIndex);
  const seller = state.players.find(player => player.id === sellerId);
  const buyer = state.players.find(player => player.id === buyerId);
  if (!tile?.economy || !ownership || ownership.ownerId !== sellerId) return { allowed: false, reason: "Dieser Besitz gehört nicht dem Verkäufer." };
  if (!seller || !buyer || seller.id === buyer.id) return { allowed: false, reason: "Die Handelspartner sind ungültig." };
  if (seller.isBankrupt || buyer.isBankrupt) return { allowed: false, reason: "Ausgeschiedene Gefährten können nicht handeln." };
  if (seller.type === "computer" && buyer.type === "computer") return { allowed: false, reason: "Computer handeln nur mit Menschen." };
  if ([seller, buyer].some(player => player.type === "human" && player.connectionState !== "connected")) return { allowed: false, reason: "Der Gefährte ist gerade nicht verbunden." };
  if (tile.type === "property" && tile.propertyGroup && getPropertyGroupTiles(tile.propertyGroup).some(member => (state.propertyOwnerships.find(entry => entry.tileIndex === member.index)?.buildingLevel ?? 0) > 0)) {
    return { allowed: false, reason: "Zuerst müssen alle Bauwerke dieser Region verkauft werden." };
  }
  if (buyer.gold < QUICK_TRADE_MIN_PRICE) return { allowed: false, reason: `${buyer.name} besitzt nicht genug Gold.` };
  return { allowed: true };
}

/** Das offene Schnellangebot, das ein Spieler selbst gesendet hat. Jeder Spieler hat höchstens eines. */
export function getOpenQuickTrade(state: Pick<GameState, "trades">, proposerId: string): TradeOffer | undefined {
  return state.trades.find(trade => trade.status === "pending" && trade.mode === "quick" && trade.proposerId === proposerId);
}

/**
 * Grund, aus dem ein offenes Schnellangebot verfällt, oder `undefined`, solange es gilt.
 * Gold wird hier bewusst nicht geprüft: Es kann sich bis zur Antwort erholen und wird beim Annehmen erneut geprüft.
 */
export function getQuickTradeExpiryReason(state: GameState, trade: TradeOffer): string | undefined {
  const terms = getQuickTradeTerms(trade);
  if (!terms) return "Das Angebot ist kein gültiger Schnellhandel.";
  const tile = BOARD_TILES[terms.tileIndex];
  const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === terms.tileIndex);
  const tileName = tile?.name ?? "Das Grundstück";
  for (const id of [terms.sellerId, terms.buyerId]) {
    const player = state.players.find(entry => entry.id === id);
    if (!player) return "Ein Handelspartner hat die Partie verlassen.";
    if (player.isBankrupt) return `${player.name} ist ausgeschieden.`;
  }
  if (!tile?.economy || !ownership || ownership.ownerId !== terms.sellerId) return `${tileName} hat den Besitzer gewechselt.`;
  if (trade.quickSnapshot && ownership.mortgaged !== trade.quickSnapshot.mortgaged) return ownership.mortgaged ? `${tileName} wurde verpfändet.` : `${tileName} wurde ausgelöst.`;
  if (tile.type === "property" && tile.propertyGroup && getPropertyGroupTiles(tile.propertyGroup).some(member => (state.propertyOwnerships.find(entry => entry.tileIndex === member.index)?.buildingLevel ?? 0) > 0)) {
    return `In ${tile.propertyGroup} stehen jetzt Bauwerke.`;
  }
  if (trade.quickSnapshot && state.currentRound > trade.quickSnapshot.round) return "Die Runde ist vorüber.";
  return undefined;
}

/** Eine Zeile für Smartphone, TV und Chronik, z. B. „Lena will Eichenhain für 180 Gold kaufen.“ */
export function formatQuickTradeHeadline(state: GameState, trade: TradeOffer): string | undefined {
  const terms = getQuickTradeTerms(trade);
  if (!terms) return undefined;
  const proposer = state.players.find(player => player.id === trade.proposerId)?.name ?? "Ein Gefährte";
  const tile = BOARD_TILES[terms.tileIndex]?.name ?? "ein Grundstück";
  const proposerBuys = terms.buyerId === trade.proposerId;
  if (trade.counterToTradeId) return proposerBuys ? `${proposer} bietet jetzt ${terms.gold} Gold für ${tile}.` : `${proposer} verlangt ${terms.gold} Gold für ${tile}.`;
  return proposerBuys ? `${proposer} will ${tile} für ${terms.gold} Gold kaufen.` : `${proposer} bietet ${tile} für ${terms.gold} Gold an.`;
}
