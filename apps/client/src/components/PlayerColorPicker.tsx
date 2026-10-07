import { PLAYER_COLORS, type Player, type PlayerColor } from "@valenor/shared";
import { PLAYER_COLOR_LABELS } from "../lib/player-colors";

export function PlayerColorPicker({ players, playerId, connected, pending, onSelect }: {
  players: Player[]; playerId: string; connected: boolean; pending: boolean; onSelect: (color: PlayerColor) => void;
}) {
  const player = players.find(candidate => candidate.id === playerId);
  if (!player || player.type !== "human") return null;
  return <section className="player-color-picker" aria-label="Deine Farbe">
    <h2>DEINE FARBE</h2>
    <div>{PLAYER_COLORS.map(color => {
      const occupied = players.find(candidate => candidate.id !== playerId && candidate.type === "human" && candidate.color === color);
      const selected = player.color === color;
      return <button key={color} type="button" className={`color-swatch color-swatch--${color}`}
        aria-pressed={selected} disabled={!connected || pending || Boolean(occupied)} onClick={() => onSelect(color)}>
        <i aria-hidden="true" /><strong>{PLAYER_COLOR_LABELS[color]}</strong>
        <small>{occupied ? `Belegt von ${occupied.name}` : selected ? "Deine Farbe" : "Wählen"}</small>
      </button>;
    })}</div>
  </section>;
}
