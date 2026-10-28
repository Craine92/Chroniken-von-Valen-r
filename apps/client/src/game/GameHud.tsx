import { EMOTE_LABELS, EMOTE_SHOUTS, type EmoteSignal, type GameState } from "@valenor/shared";
import { WorldStatus } from "../components/WorldStatus";
import { QuickGameClockDisplay } from "../components/QuickGameClockDisplay";
import { CharacterCard } from "../components/CharacterCard";
import { getPlayerGroupDots } from "./character-card";
import { EMOTE_ICONS, Icon } from "../components/icons/Icon";
import { getPlayersInDanger } from "./living/drama";

/** Aktuelle Reaktion je Spieler; der Host entfernt sie nach EMOTE_DISPLAY_MS wieder. */
export type ActiveEmotes = Readonly<Record<string, EmoteSignal>>;

export function EmoteBubble({ emote, playerName }: { emote: EmoteSignal; playerName: string }) {
  return <span className={`hud-emote hud-emote--${emote.emoteId}`} role="status" aria-label={`${playerName}: ${EMOTE_LABELS[emote.emoteId]}`}>
    <Icon name={EMOTE_ICONS[emote.emoteId]} />
    <em aria-hidden="true">{EMOTE_SHOUTS[emote.emoteId]}</em>
  </span>;
}

export function GameHud({ gameState, emotes = {} }: { gameState: GameState; emotes?: ActiveEmotes | undefined }) {
  const inDanger = getPlayersInDanger(gameState);
  const displayedPlayers = gameState.turnOrder.length
    ? gameState.turnOrder.map((id) => gameState.players.find((player) => player.id === id)!).filter(Boolean)
    : gameState.players;

  return (
    <div className={`game-hud${displayedPlayers.length >= 5 ? " game-hud--compact" : ""}`}>
      <div className="game-hud__status">
        <div><span>RUNDE</span><b>{gameState.currentRound}</b></div>
      </div>
      <QuickGameClockDisplay clock={gameState.quickGameClock} />
      <div className="game-hud__players">
        {displayedPlayers.map((player, index) => (
          <CharacterCard key={player.id} player={player} active={gameState.currentPlayerId === player.id} order={gameState.turnOrder.length > 0 ? index + 1 : undefined}
            dots={getPlayerGroupDots(gameState, player.id)} inDanger={inDanger.has(player.id)}
            // Auf dem TV nur Ausnahmen als Text; Einzelheiten stehen auf dem Handy.
            status={player.isBankrupt ? "Zuschauer" : inDanger.has(player.id) ? "Bankrott droht" : player.dungeon.inDungeon ? `Im Kerker · ${player.dungeon.failedAttempts}/3` : undefined}>
            {emotes[player.id] && <EmoteBubble key={emotes[player.id]!.id} emote={emotes[player.id]!} playerName={player.name} />}
          </CharacterCard>
        ))}

        <WorldStatus state={gameState} />
      </div>

    </div>
  );
}
