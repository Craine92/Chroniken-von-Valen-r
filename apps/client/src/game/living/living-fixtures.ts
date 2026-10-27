import type { EconomyLogEntry, GameState } from "@valenor/shared";

/** Kleiner Spielstand für Tests des lebendigen Bretts: vier Gefährten, Runde 7, niemand besitzt etwas. */
export function livingTestState(): GameState {
  const names = ["Philipp", "Justine", "Ragna", "Eldric"];
  const ids = ["p1", "p2", "p3", "p4"];
  return {
    roomId: "VAL-LIVING", status: "playing", config: { mode: "chronicles" },
    players: ids.map((id, index) => ({
      id, name: names[index]!, type: index < 2 ? "human" as const : "computer" as const,
      color: (["violet", "green", "red", "blue"] as const)[index]!, characterId: "humanKnight" as const, connectionState: "connected" as const,
      gold: 1_000, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }
    })),
    turnOrder: ids, orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 7, turnNumber: 25, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 14 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 21, grandStructuresAvailable: 9 }, economyLog: [], trades: [], startedAt: 1
  };
}

export function logEntry(id: string, kind: EconomyLogEntry["kind"], playerIds: string[], amount?: number, extra: Partial<EconomyLogEntry> = {}): EconomyLogEntry {
  return { id, kind, playerIds, message: id, createdAt: 1, ...(amount === undefined ? {} : { amount }), ...extra };
}

/** Eine tiefe Kopie, damit Tests den nächsten Stand verändern können, ohne den vorigen zu berühren. */
export function nextState(state: GameState, change: (draft: GameState) => void): GameState {
  const draft = structuredClone(state);
  change(draft);
  return draft;
}
