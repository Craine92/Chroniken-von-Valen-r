import { randomUUID } from "node:crypto";
import {
  BOARD_TILES,
  canMortgageProperty,
  canRedeemMortgage,
  getEffectiveMortgageRedemptionCost,
  getAutoMortgagePlan,
  getMortgageRedemptionPlan,
  getMortgageValue,
  type GameState
} from "@valenor/shared";

export class MortgageService {
  mortgage(state: GameState, playerId: string, tileIndex: number): void {
    const eligibility = canMortgageProperty(state, playerId, tileIndex);
    if (!eligibility.allowed) throw new Error(eligibility.reason ?? "Dieses Feld kann nicht beliehen werden.");
    const player = state.players.find((entry) => entry.id === playerId)!;
    const ownership = state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex)!;
    const tile = BOARD_TILES[tileIndex]!;
    const value = getMortgageValue(tile);
    player.gold += value;
    ownership.mortgaged = true;
    this.log(state, `${player.name} verpfändet ${tile.name} an die Krone und erhält ${value} Gold.`, playerId, value);
  }

  redeem(state: GameState, playerId: string, tileIndex: number): void {
    const eligibility = canRedeemMortgage(state, playerId, tileIndex);
    if (!eligibility.allowed) throw new Error(eligibility.reason ?? "Diese Hypothek kann nicht ausgelöst werden.");
    const player = state.players.find((entry) => entry.id === playerId)!;
    const ownership = state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex)!;
    const tile = BOARD_TILES[tileIndex]!;
    const cost = getEffectiveMortgageRedemptionCost(state, tile);
    player.gold -= cost;
    ownership.mortgaged = false;
    this.log(state, `${player.name} löst die Hypothek auf ${tile.name} für ${cost} Gold aus.`, playerId, -cost);
  }

  autoMortgageForPayment(state: GameState, playerId: string): void {
    const plan = getAutoMortgagePlan(state, playerId);
    if (plan.shortfall <= 0) throw new Error("Die Forderung kann bereits bezahlt werden.");
    if (!plan.covered) throw new Error(`Die verfügbaren Hypotheken decken die Forderung nicht. Es fehlen ${plan.remainingShortfall} Gold.`);
    for (const tileIndex of plan.tileIndices) {
      const eligibility = canMortgageProperty(state, playerId, tileIndex);
      if (!eligibility.allowed) throw new Error(eligibility.reason ?? "Der Hypothekenplan ist nicht mehr gültig.");
    }
    for (const tileIndex of plan.tileIndices) this.mortgage(state, playerId, tileIndex);
  }

  redeemAll(state: GameState, playerId: string): void {
    const plan = getMortgageRedemptionPlan(state, playerId);
    if (plan.tileIndices.length === 0) throw new Error("Du hast keine Hypotheken zum Auslösen.");
    const player = state.players.find((entry) => entry.id === playerId);
    if (!player || player.gold < plan.totalCost) throw new Error(`Für alle Hypotheken werden ${plan.totalCost} Gold benötigt.`);
    for (const tileIndex of plan.tileIndices) {
      const eligibility = canRedeemMortgage(state, playerId, tileIndex);
      if (!eligibility.allowed && eligibility.reason !== "Nicht genügend Gold.") throw new Error(eligibility.reason ?? "Eine Hypothek kann gerade nicht ausgelöst werden.");
    }
    player.gold -= plan.totalCost;
    for (const tileIndex of plan.tileIndices) state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex)!.mortgaged = false;
    this.log(state, `${player.name} löst ${plan.tileIndices.length} Hypotheken für insgesamt ${plan.totalCost} Gold aus.`, playerId, -plan.totalCost);
  }

  private log(state: GameState, message: string, playerId: string, amount: number): void {
    state.economyLog.push({ id: randomUUID(), kind: "mortgage", message, playerIds: [playerId], amount, createdAt: Date.now() });
    state.economyLog = state.economyLog.slice(-12);
  }
}
