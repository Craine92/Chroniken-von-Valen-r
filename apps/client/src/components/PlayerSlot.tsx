import { PLAYER_CHARACTERS, type Player } from "@valenor/shared";
import { PLAYER_COLOR_LABELS } from "../lib/player-colors";
import { PlayerPortrait } from "./PlayerPortrait";

interface PlayerSlotProps {
  player: Player | undefined;
  index: number;
  onAddComputer: () => void;
  onRemovePlayer: (playerId: string) => void;
  disabled?: boolean;
}

export function PlayerSlot({ player, index, onAddComputer, onRemovePlayer, disabled }: PlayerSlotProps) {
  if (!player) {
    return (
      <article className="player-slot player-slot--empty">
        <span className="player-slot__number">0{index + 1}</span>
        <div className="player-slot__sigil" aria-hidden="true">◇</div>
        <div className="player-slot__identity">
          <h3>Spielerplatz frei</h3>
          <button className="slot-action" type="button" onClick={onAddComputer} disabled={disabled}>
            + Computer hinzufügen
          </button>
        </div>
      </article>
    );
  }

  const disconnected = player.type === "human" && player.connectionState === "disconnected";
  return (
    <article className={`player-slot player-slot--${player.color} ${disconnected ? "is-disconnected" : ""}`}>
      <span className="player-slot__number">0{index + 1}</span>
      <PlayerPortrait characterId={player.characterId} />
      <div className="player-slot__identity">
        <h3>{player.name}</h3>
        <p>{PLAYER_CHARACTERS.find(character => character.id === player.characterId)?.name} · {player.type === "computer" ? "Computer" : "Mensch"} · {PLAYER_COLOR_LABELS[player.color]}</p>
        <span className="player-slot__state">{disconnected ? "Getrennt" : player.ready ? "✓ Bereit" : "Noch nicht bereit"}</span>
      </div>
      {(
        <button
          className="slot-remove"
          type="button"
          aria-label={`${player.name} entfernen`}
          title={player.type === "computer" ? "Computer entfernen" : "Spieler entfernen"}
          onClick={() => onRemovePlayer(player.id)}
          disabled={disabled}
        >
          ×
        </button>
      )}
    </article>
  );
}
