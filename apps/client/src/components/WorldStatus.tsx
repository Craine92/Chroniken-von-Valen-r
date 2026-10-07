import { BOARD_TILES, getActiveChronicleEvent, getChronicleRegionLabel, getChronicleRoundsRemaining, type GameState } from "@valenor/shared";

export function WorldStatus({ state }: { state: GameState }) {
  const chronicle = state.status === "playing" ? getActiveChronicleEvent(state) : undefined;
  const remaining = getChronicleRoundsRemaining(state);
  return <>
    <aside className="weltenweg-pot" role="status" aria-label="Weltenweg-Pott">
      <small>WELTENWEG-POTT</small><strong>{(state.weltenwegPot ?? 0).toLocaleString("de-DE")} GOLD</strong>
    </aside>
    {chronicle && <aside className="active-chronicle" role="status">
      <small>AKTIVE CHRONIK</small><strong>{chronicle.title}</strong>
      {getChronicleRegionLabel(chronicle) && <span className="active-chronicle__regions">{getChronicleRegionLabel(chronicle)}</span>}
      <span className="active-chronicle__effect">{chronicle.effectSummary}</span>
      <span>Noch {remaining} {remaining === 1 ? "Runde" : "Runden"}</span>
    </aside>}
    {state.wanderingDragon && <aside className="wandering-dragon" role="status">
      <small>WANDERNDER DRACHE</small><strong>Bei: {BOARD_TILES[state.wanderingDragon.tileIndex]?.name}</strong>
    </aside>}
  </>;
}
