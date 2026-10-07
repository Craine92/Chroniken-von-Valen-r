import { MAX_ACTIVE_QUESTS, QUEST_DEFINITIONS, type GameState } from "@valenor/shared";

export function ControllerQuestLog({ state, playerId }: { state: GameState; playerId: string }) {
  const quests = state.players.find(player => player.id === playerId)?.activeQuests ?? [];
  return <section className="controller-quests" aria-label="Deine Aufträge">
    <h3>DEINE AUFTRÄGE <span>{quests.length} / {MAX_ACTIVE_QUESTS}</span></h3>
    {quests.map(quest => {
      const definition = QUEST_DEFINITIONS[quest.id];
      return <article key={quest.id}>
        <h4><span aria-hidden="true">{definition.symbol}</span>{definition.title}</h4>
        <p>{definition.description}</p>
        <strong>Belohnung: {definition.rewardGold} Gold</strong>
      </article>;
    })}
  </section>;
}
