import { PLAYER_CHARACTERS, type Player, type PlayerCharacterId } from "@valenor/shared";
import { getCharacterAsset } from "../game/assets/asset-manifest";

export function PlayerCharacterPicker({ players, playerId, connected, pending, onSelect }: {
  players: Player[]; playerId: string; connected: boolean; pending: boolean; onSelect: (characterId: PlayerCharacterId) => void;
}) {
  const player = players.find(candidate => candidate.id === playerId);
  if (!player || player.type !== "human") return null;
  return <section className="player-character-picker" aria-label="Deine Figur">
    <h2>DEINE FIGUR</h2>
    <div>{PLAYER_CHARACTERS.map(character => {
      const occupant = players.find(candidate => candidate.id !== playerId && candidate.type === "human" && candidate.characterId === character.id);
      const selected = player.characterId === character.id;
      return <button key={character.id} type="button" aria-pressed={selected} className="character-choice"
        disabled={!connected || pending || Boolean(occupant)} onClick={() => onSelect(character.id)}>
        <img src={getCharacterAsset(character.id).path} alt="" />
        <strong>{character.name}</strong><small>{occupant ? `Belegt von ${occupant.name}` : selected ? "✓ Deine Figur" : "Wählen"}</small>
      </button>;
    })}</div>
  </section>;
}
