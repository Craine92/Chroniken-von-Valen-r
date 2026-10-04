import { randomInt } from "node:crypto";
import type { DiceRoll } from "@valenor/shared";

export interface RandomSource {
  rollDie(): number;
}

export class CryptoRandomSource implements RandomSource {
  rollDie(): number {
    return randomInt(1, 7);
  }
}

export class DiceService {
  constructor(private readonly random: RandomSource = new CryptoRandomSource()) {}

  roll(): DiceRoll {
    const die1 = this.random.rollDie();
    const die2 = this.random.rollDie();
    if (![die1, die2].every((value) => Number.isInteger(value) && value >= 1 && value <= 6)) {
      throw new Error("Die Würfelquelle lieferte einen ungültigen Wert.");
    }
    return { die1, die2, total: die1 + die2, isDouble: die1 === die2 };
  }
}
