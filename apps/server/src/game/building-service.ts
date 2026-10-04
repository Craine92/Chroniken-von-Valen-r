import { randomUUID } from "node:crypto";
import {
  BOARD_TILES,
  canBuildOnProperty,
  canSellBuilding,
  getBuildingName,
  type BuildingLevel,
  type GameState
} from "@valenor/shared";

const MAX_LOG_ENTRIES = 12;

export class BuildingService {
  build(state: GameState, playerId: string, tileIndex: number): void {
    const eligibility = canBuildOnProperty(state, playerId, tileIndex);
    if (!eligibility.allowed) throw new Error(eligibility.reason ?? "Hier kann gerade nicht gebaut werden.");
    const player = state.players.find((entry) => entry.id === playerId)!;
    const ownership = state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex)!;
    const tile = BOARD_TILES[tileIndex]!;
    const cost = tile.economy!.buildCost!;
    const fromLevel = ownership.buildingLevel;
    const toLevel = (fromLevel + 1) as BuildingLevel;

    player.gold -= cost;
    if (toLevel === 5) {
      state.buildingBank.settlementUnitsAvailable += 4;
      state.buildingBank.grandStructuresAvailable -= 1;
    } else {
      state.buildingBank.settlementUnitsAvailable -= 1;
    }
    ownership.buildingLevel = toLevel;
    const buildingName = getBuildingName(tile.region!, toLevel);
    const message = fromLevel === 0
      ? `${player.name} errichtet eine ${buildingName} auf ${tile.name} für ${cost} Gold.`
      : `${player.name} erweitert ${tile.name} zum ${buildingName} für ${cost} Gold.`;
    this.record(state, "build", playerId, tileIndex, fromLevel, toLevel, buildingName, cost, message, -cost);
  }

  sell(state: GameState, playerId: string, tileIndex: number): void {
    const eligibility = canSellBuilding(state, playerId, tileIndex);
    if (!eligibility.allowed) throw new Error(eligibility.reason ?? "Hier kann gerade nichts verkauft werden.");
    const player = state.players.find((entry) => entry.id === playerId)!;
    const ownership = state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex)!;
    const tile = BOARD_TILES[tileIndex]!;
    const proceeds = tile.economy!.buildCost! / 2;
    const fromLevel = ownership.buildingLevel;
    const toLevel = (fromLevel - 1) as BuildingLevel;
    const buildingName = getBuildingName(tile.region!, fromLevel);

    player.gold += proceeds;
    if (fromLevel === 5) {
      state.buildingBank.grandStructuresAvailable += 1;
      state.buildingBank.settlementUnitsAvailable -= 4;
    } else {
      state.buildingBank.settlementUnitsAvailable += 1;
    }
    ownership.buildingLevel = toLevel;
    this.record(
      state,
      "sell",
      playerId,
      tileIndex,
      fromLevel,
      toLevel,
      buildingName,
      proceeds,
      `${player.name} verkauft eine Baustufe auf ${tile.name} für ${proceeds} Gold.`,
      proceeds
    );
  }

  private record(
    state: GameState,
    type: "build" | "sell",
    playerId: string,
    tileIndex: number,
    fromLevel: BuildingLevel,
    toLevel: BuildingLevel,
    buildingName: string,
    amount: number,
    message: string,
    logAmount: number
  ): void {
    const createdAt = Date.now();
    state.lastBuildingAction = {
      id: randomUUID(), type, playerId, tileIndex, fromLevel, toLevel, buildingName, amount, createdAt
    };
    state.economyLog.push({
      id: randomUUID(), kind: "building", message, playerIds: [playerId], amount: logAmount, createdAt
    });
    state.economyLog = state.economyLog.slice(-MAX_LOG_ENTRIES);
  }
}

