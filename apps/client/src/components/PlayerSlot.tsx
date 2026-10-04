import type { Player } from "@valenor/shared";

const COLOR_LABELS: Record<Player["color"], string> = {
  violet: "Violett",
  green: "Grün",
  red: "Rot",
  blue: "Blau"
};
const ARCHETYPES = ["Runenritter", "Waldläuferin", "Runenmagier", "Schildkriegerin"];
const ARCHETYPE_SIGILS = ["♞", "➶", "✧", "⚒"];

interface PlayerSlotProps {
  player: Player | undefined;
  index: number;
  onAddComputer: () => void;
  onRemoveComputer: (playerId: string) => void;
  disabled?: boolean;
}

export function PlayerSlot({ player, index, onAddComputer, onRemoveComputer, disabled }: PlayerSlotProps) {
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
      <div className="player-slot__sigil" aria-hidden="true">{ARCHETYPE_SIGILS[index]}</div>
      <div className="player-slot__identity">
        <h3>{player.name}</h3>
        <p>{ARCHETYPES[index]} · {player.type === "computer" ? "Computer" : "Mensch"} · {COLOR_LABELS[player.color]}</p>
      </div>
      {player.type === "computer" ? (
        <button
          className="slot-remove"
          type="button"
          aria-label={`${player.name} entfernen`}
          title="Computer entfernen"
          onClick={() => onRemoveComputer(player.id)}
          disabled={disabled}
        >
          ×
        </button>
      ) : (
        <span className="player-slot__state">{disconnected ? "Getrennt" : "Bereit"}</span>
      )}
    </article>
  );
}
