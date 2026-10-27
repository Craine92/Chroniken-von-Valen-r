import type { GameState } from "@valenor/shared";
import type { GameMoment } from "./moments";

/** Ab dieser Miete ist sie immer „hoch“, egal wie reich der Zahlende ist. */
export const HIGH_RENT_ABSOLUTE_GOLD = 300;
/** Darunter zählt der Anteil am Vermögen: ab 100 Gold und mindestens 35 % des Goldes vor der Zahlung. */
export const HIGH_RENT_MIN_GOLD = 100;
export const HIGH_RENT_SHARE = 0.35;
/** Höchstdauer eines Spannungseffekts. Danach ist das Brett wieder ruhig; Züge warten nie darauf. */
export const DRAMA_MAX_DURATION_MS = 1_200;

export function isHighRent(amount: number, payerGoldBefore: number): boolean {
  return amount >= HIGH_RENT_ABSOLUTE_GOLD || (amount >= HIGH_RENT_MIN_GOLD && amount >= payerGoldBefore * HIGH_RENT_SHARE);
}

/** Momente, die das Brett kurz inszeniert. */
export type DramaticMoment =
  | { kind: "highRent"; tileIndex?: number; payerId: string; amount: number }
  | { kind: "dragon"; tileIndex?: number; playerId: string }
  | { kind: "tradeSealed"; proposerId: string; recipientId: string }
  | { kind: "bankrupt"; playerId: string };

export function selectDramaticMoments(moments: readonly GameMoment[]): DramaticMoment[] {
  const result: DramaticMoment[] = [];
  for (const moment of moments) {
    if (moment.kind === "rent" && isHighRent(moment.amount, moment.payerGoldBefore)) {
      result.push({ kind: "highRent", payerId: moment.payerId, amount: moment.amount, ...(moment.tileIndex === undefined ? {} : { tileIndex: moment.tileIndex }) });
    } else if (moment.kind === "dragon") {
      result.push({ kind: "dragon", playerId: moment.playerId, ...(moment.tileIndex === undefined ? {} : { tileIndex: moment.tileIndex }) });
    } else if (moment.kind === "tradeSealed") {
      result.push({ kind: "tradeSealed", proposerId: moment.proposerId, recipientId: moment.recipientId });
    } else if (moment.kind === "bankrupt") {
      result.push({ kind: "bankrupt", playerId: moment.playerId });
    }
  }
  return result;
}

/**
 * Spieler, denen der Bankrott droht: Eine offene Forderung übersteigt ihr Gold.
 * Gilt für normale Zahlungen und für Kartenzahlungen, solange das Spiel läuft.
 */
export function getPlayersInDanger(state: GameState): Set<string> {
  const result = new Set<string>();
  if (state.status !== "playing") return result;
  const gold = (playerId: string) => state.players.find(player => player.id === playerId && !player.isBankrupt)?.gold;
  const check = (playerId: string, amount: number) => {
    const available = gold(playerId);
    if (available !== undefined && amount > available) result.add(playerId);
  };
  if (state.pendingPayment) check(state.pendingPayment.payerId, state.pendingPayment.amount);
  for (const payment of state.cardResolution?.pendingPayments ?? []) check(payment.fromPlayerId, payment.amount);
  return result;
}
