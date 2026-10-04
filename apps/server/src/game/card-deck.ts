import { randomInt } from "node:crypto";
import { ADVENTURE_CARDS, FATE_CARDS, type CardDeckType, type PublicDeckState } from "@valenor/shared";

export interface CardShuffleSource { nextInt(maxExclusive: number): number }

export class CryptoCardShuffleSource implements CardShuffleSource {
  nextInt(maxExclusive: number): number { return randomInt(maxExclusive); }
}

export class SequenceCardShuffleSource implements CardShuffleSource {
  private index = 0;
  constructor(private readonly values: readonly number[]) {}
  nextInt(maxExclusive: number): number {
    if (this.values.length === 0) return 0;
    const value = this.values[this.index++ % this.values.length]!;
    return Math.abs(value) % maxExclusive;
  }
}

export interface PrivateDeckState { drawPile: string[]; discardPile: string[] }
export type PrivateDecks = Record<CardDeckType, PrivateDeckState>;

export function shuffleCards(ids: readonly string[], source: CardShuffleSource): string[] {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = source.nextInt(index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  return shuffled;
}

export function createDecks(source: CardShuffleSource = new CryptoCardShuffleSource()): PrivateDecks {
  return {
    adventure: { drawPile: shuffleCards(ADVENTURE_CARDS.map((card) => card.id), source), discardPile: [] },
    fate: { drawPile: shuffleCards(FATE_CARDS.map((card) => card.id), source), discardPile: [] }
  };
}

export function drawTopCard(decks: PrivateDecks, deck: CardDeckType, source: CardShuffleSource): string {
  const target = decks[deck];
  if (target.drawPile.length === 0) {
    if (target.discardPile.length === 0) throw new Error(`Das ${deck === "adventure" ? "Abenteuer" : "Schicksals"}-Deck ist leer.`);
    target.drawPile = shuffleCards(target.discardPile, source);
    target.discardPile = [];
  }
  return target.drawPile.shift()!;
}

export function publicDeckState(decks: PrivateDecks): Record<CardDeckType, PublicDeckState> {
  return {
    adventure: { drawCount: decks.adventure.drawPile.length, discardCount: decks.adventure.discardPile.length },
    fate: { drawCount: decks.fate.drawPile.length, discardCount: decks.fate.discardPile.length }
  };
}
