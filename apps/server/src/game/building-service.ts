import { randomUUID } from "node:crypto";
import {
  BOARD_TILES,
  canBuildOnProperty,
  canSellBuilding,
  getBuildingName,
  getEffectiveBuildCost,
  getEffectiveBuildingSaleValue,
  type BuildingLevel,
  type GameState
} from "@valenor/shared";
import { completeQuests } from "./quest-service";
import { recordMaxBuilding } from "./momentum-celebration-service";
import { resolveWorldImpulse } from "./world-impulse-service";

const MAX_LOG_ENTRIES = 12;

export class BuildingService {
  build(state: GameState, playerId: string, tileIndex: number): void {
    const eligibility = canBuildOnProperty(state, playerId, tileIndex);
    if (!eligibility.allowed) throw new Error(eligibility.reason ?? "Hier kann gerade nicht gebaut werden.");
    const player = state.players.find((entry) => entry.id === playerId)!;
    const ownership = state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex)!;
    const tile = BOARD_TILES[tileIndex]!;
    const cost = getEffectiveBuildCost(state, tile);
    const usedBuildingFervor = Boolean(state.worldImpulseEffects?.buildingFervor);
    const fromLevel = ownership.buildingLevel;
    const toLevel = (fromLevel + 1) as BuildingLevel;

    player.gold -= cost;
    ownership.buildingLevel = toLevel;
    const buildingName = getBuildingName(tile.region!, toLevel);
    const message = fromLevel === 0
      ? `${player.name} errichtet eine ${buildingName} auf ${tile.name} für ${cost} Gold.`
      : `${player.name} erweitert ${tile.name} zum ${buildingName} für ${cost} Gold.`;
    this.record(state, "build", playerId, tileIndex, fromLevel, toLevel, buildingName, cost, message, -cost);
    completeQuests(state, playerId, state.lastBuildingAction!.id, ["build"]);
    if (usedBuildingFervor) {
      delete state.worldImpulseEffects!.buildingFervor;
      resolveWorldImpulse(state, `${player.name} baut 20 % günstiger.`, "buildingFervor");
    }
    if (toLevel === 5) recordMaxBuilding(state, playerId, tileIndex);
  }

  sell(state: GameState, playerId: string, tileIndex: number): void {
    const eligibility = canSellBuilding(state, playerId, tileIndex);
    if (!eligibility.allowed) throw new Error(eligibility.reason ?? "Hier kann gerade nichts verkauft werden.");
    const player = state.players.find((entry) => entry.id === playerId)!;
    const ownership = state.propertyOwnerships.find((entry) => entry.tileIndex === tileIndex)!;
    const tile = BOARD_TILES[tileIndex]!;
    const proceeds = getEffectiveBuildingSaleValue(state, tile);
    const fromLevel = ownership.buildingLevel;
    const toLevel = (fromLevel - 1) as BuildingLevel;
    const buildingName = getBuildingName(tile.region!, fromLevel);

    player.gold += proceeds;
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
