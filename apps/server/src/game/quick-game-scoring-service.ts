import { BOARD_TILES, PROPERTY_GROUPS, getMortgageRedemptionCost, type BuildingLevel, type GameState, type QuickGameScore } from "@valenor/shared";

export class QuickGameScoringService {
  calculate(state: GameState): QuickGameScore[] {
    return state.players
      .filter((player) => !player.isBankrupt)
      .map((player) => {
        const ownerships = state.propertyOwnerships.filter((entry) => entry.ownerId === player.id);
        let propertyValue = 0;
        let buildingValue = 0;
        let mortgageLiability = 0;
        let netPropertyValue = 0;
        let buildingCount = 0;
        let developedPropertyCount = 0;
        let highestBuildingLevel: BuildingLevel = 0;

        for (const ownership of ownerships) {
          const tile = BOARD_TILES[ownership.tileIndex];
          if (!tile?.economy) continue;
          const price = tile.economy.purchasePrice;
          const liability = ownership.mortgaged ? getMortgageRedemptionCost(tile) : 0;
          propertyValue += price;
          mortgageLiability += liability;
          netPropertyValue += Math.max(0, price - liability);
          if (tile.type === "property" && tile.economy.buildCost) {
            buildingValue += ownership.buildingLevel * tile.economy.buildCost;
            buildingCount += ownership.buildingLevel;
            if (ownership.buildingLevel > 0) developedPropertyCount += 1;
            highestBuildingLevel = Math.max(highestBuildingLevel, ownership.buildingLevel) as BuildingLevel;
          }
        }

        const ownedPropertyIds = new Set(ownerships.map((ownership) => BOARD_TILES[ownership.tileIndex]?.id).filter(Boolean));
        const completeGroupCount = PROPERTY_GROUPS.filter((group) => group.propertyIds.every((propertyId) => ownedPropertyIds.has(propertyId))).length;

        return {
          playerId: player.id,
          goldValue: player.gold,
          propertyValue,
          buildingValue,
          mortgageLiability,
          netPropertyValue,
          totalNetWorth: player.gold + propertyValue + buildingValue - mortgageLiability,
          propertyCount: ownerships.length,
          buildingCount,
          developedPropertyCount,
          completeGroupCount,
          highestBuildingLevel,
          heldCardCount: player.heldCards?.length ?? 0
        };
      })
      .sort((left, right) => this.compare(right, left));
  }

  determineWinnerIds(scores: readonly QuickGameScore[]): string[] {
    const leader = scores[0];
    if (!leader) return [];
    return scores.filter((score) => this.compare(score, leader) === 0).map((score) => score.playerId);
  }

  private compare(left: QuickGameScore, right: QuickGameScore): number {
    return left.totalNetWorth - right.totalNetWorth
      || left.goldValue - right.goldValue
      || left.netPropertyValue - right.netPropertyValue
      || left.buildingValue - right.buildingValue;
  }
}
