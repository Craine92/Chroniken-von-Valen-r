import { BOARD_TILES, getActiveChronicleEvent, getChronicleRegionLabel, getChronicleRoundsRemaining, type GameState } from "@valenor/shared";

export function WorldStatus({ state }: { state: GameState }) {
  const chronicle = state.status === "playing" ? getActiveChronicleEvent(state) : undefined;
  const remaining = getChronicleRoundsRemaining(state);
  const impulseEffects = [
    state.worldImpulseEffects?.runeSpark ? "Runenfunke · +75 Gold am Runentor" : undefined,
    state.worldImpulseEffects?.buildingFervor ? "⚒ Baueifer · nächster Bau −20 %" : undefined,
    state.worldImpulseEffects?.merchantLuck ? "Händlerglück · nächster Direktkauf −15 %" : undefined,
    state.worldImpulseEffects?.twistOfFate ? "Schicksalswende · nächster normaler Wurf" : undefined,
    state.worldImpulseEffects?.harborWindUntilRound === state.currentRound ? `Hafenwind · bis Ende Runde ${state.currentRound}` : undefined
  ].filter((entry): entry is string => Boolean(entry));
  return <>
    <aside className={`weltenweg-pot ${(state.weltenwegPot ?? 0) >= 1000 ? "is-legendary" : (state.weltenwegPot ?? 0) >= 500 ? "is-large" : ""}`} role="status" aria-label="Weltenweg-Pott">
      <small>WELTENWEG-POTT</small><strong>{(state.weltenwegPot ?? 0).toLocaleString("de-DE")} GOLD</strong>
    </aside>
    {chronicle && <aside className="active-chronicle" role="status">
      <small>AKTIVE CHRONIK</small><strong>{chronicle.title}</strong>
      {getChronicleRegionLabel(chronicle) && <span className="active-chronicle__regions">{getChronicleRegionLabel(chronicle)}</span>}
      <span className="active-chronicle__effect">{chronicle.effectSummary}</span>
      <span>Noch {remaining} {remaining === 1 ? "Runde" : "Runden"}</span>
    </aside>}
    {impulseEffects.length > 0 && <aside className="active-world-impulse" role="status">
      <small>AKTIVE WELTIMPULSE</small>
      {impulseEffects.map(effect => <span key={effect}>{effect}</span>)}
    </aside>}
    {state.wanderingDragon && <aside className="wandering-dragon" role="status">
      <small>WANDERNDER DRACHE</small><strong>Bei: {BOARD_TILES[state.wanderingDragon.tileIndex]?.name}</strong>
    </aside>}
  </>;
}
