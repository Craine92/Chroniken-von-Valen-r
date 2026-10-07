import { randomInt, randomUUID } from "node:crypto";
import { BOARD_TILES, MAX_ACTIVE_QUESTS, QUEST_DEFINITIONS, ownsCompletePropertyGroup,
  type GameState, type QuestId, type QuestType } from "@valenor/shared";

const questIds = Object.keys(QUEST_DEFINITIONS) as QuestId[];

export function initializePlayerQuests(state: GameState, chooseIndex: (count: number) => number = randomInt): void {
  for (const player of state.players) {
    player.activeQuests = [];
    player.processedQuestEventIds = [];
    const candidates = [...questIds];
    for (let slot = 0; slot < MAX_ACTIVE_QUESTS; slot++) {
      const id = candidates.splice(chooseIndex(candidates.length), 1)[0]!;
      player.activeQuests.push({ id, assignedAtTurn: state.turnNumber });
    }
  }
}

/** Only groups containing a newly acquired property can have become complete. */
export function ownershipQuestTypes(state: GameState, playerId: string, acquiredTiles: readonly number[]): QuestType[] {
  return acquiredTiles.some(index => {
    const tile = BOARD_TILES[index];
    return tile?.type === "property" && tile.propertyGroup && ownsCompletePropertyGroup(state.propertyOwnerships, playerId, tile.propertyGroup);
  }) ? ["completeGroup"] : [];
}

/** Called after a confirmed effect. Snapshot all matching quests before assigning replacements. */
export function completeQuests(state: GameState, playerId: string, eventId: string, types: readonly QuestType[], chooseIndex: (count: number) => number = randomInt): void {
  const player = state.players.find(player => player.id === playerId);
  if (state.status !== "playing" || !player || player.isBankrupt || !player.activeQuests || !types.length) return;
  const processed = player.processedQuestEventIds ??= [];
  if (processed.includes(eventId)) return;
  processed.push(eventId);
  const completed = player.activeQuests.filter(quest => types.includes(QUEST_DEFINITIONS[quest.id].type));
  if (!completed.length) return;
  const completedIds = new Set(completed.map(quest => quest.id));
  player.activeQuests = player.activeQuests.filter(quest => !completedIds.has(quest.id));
  for (const quest of completed) {
    const definition = QUEST_DEFINITIONS[quest.id];
    player.gold += definition.rewardGold;
    state.economyLog.push({ id: randomUUID(), kind: "quest", questId: quest.id, playerIds: [player.id], amount: definition.rewardGold,
      message: `${player.name} erfüllt den Auftrag »${definition.title}« und erhält ${definition.rewardGold} Gold.`, createdAt: Date.now() });
  }
  while (player.activeQuests.length < MAX_ACTIVE_QUESTS) {
    const candidates = questIds.filter(id => !completedIds.has(id) && !player.activeQuests!.some(quest => quest.id === id));
    player.activeQuests.push({ id: candidates[chooseIndex(candidates.length)]!, assignedAtTurn: state.turnNumber });
  }
  state.economyLog = state.economyLog.slice(-12);
}
