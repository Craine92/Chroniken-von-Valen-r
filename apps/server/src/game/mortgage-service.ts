import { randomUUID } from "node:crypto";
import {
  BOARD_TILES,
  canMortgageProperty,
  canRedeemMortgage,
  getEffectiveMortgageRedemptionCost,
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

  private log(state: GameState, message: string, playerId: string, amount: number): void {
    state.economyLog.push({ id: randomUUID(), kind: "mortgage", message, playerIds: [playerId], amount, createdAt: Date.now() });
    state.economyLog = state.economyLog.slice(-12);
  }
}
