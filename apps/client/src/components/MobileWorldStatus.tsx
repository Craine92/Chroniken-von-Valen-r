import {
  CHRONICLE_REGIONS, WORLD_IMPULSE_DEFINITIONS, getActiveChronicleEvent, getChronicleRoundsRemaining, getChronicleTargetRegions, type GameState
} from "@valenor/shared";
import { Icon } from "./icons/Icon";

/** Ein laufendes Ereignis oder ein wartender Weltimpuls, wie das Handy ihn erklärt. */
export interface WorldStatusEntry {
  kind: "chronicle" | "impulse";
  title: string;
  /** Kurz: „Mieten +25 %“. */
  effect: string;
  /** Ganzer Satz: was genau passiert. */
  description: string;
  /** Betroffene Reiche, leer wenn es überall gilt. */
  regions: string[];
  /** „noch 2 Runden“, „bis Rundenende“, „bis zum nächsten Bau“ … */
  duration: string;
}

const PENDING_IMPULSE_DURATION = { runeSpark: "bis jemand das Runentor passiert", buildingFervor: "bis zum nächsten Bau", twistOfFate: "bis zum nächsten Wurf", merchantLuck: "bis zum nächsten Direktkauf" } as const;

/** Alles, was gerade in Valenør wirkt: das Chronik-Ereignis und noch nicht verbrauchte Weltimpulse. */
export function getWorldStatus(state: GameState): WorldStatusEntry[] {
  const entries: WorldStatusEntry[] = [];
  const event = getActiveChronicleEvent(state);
  if (event) {
    const rounds = getChronicleRoundsRemaining(state);
    const regions = getChronicleTargetRegions(event);
    entries.push({
      kind: "chronicle", title: event.title, effect: event.effectSummary,
      // Die Beschreibung beginnt bei regionalen Ereignissen mit den Reichen; die stehen hier eigens.
      description: event.description.replace(/^[^:]+: /, ""),
      regions: regions.length === 4 ? ["alle vier Reiche"] : regions.map(region => CHRONICLE_REGIONS[region].name),
      duration: rounds > 1 ? `noch ${rounds} Runden` : "endet mit dieser Runde"
    });
  }
  const effects = state.worldImpulseEffects ?? {};
  for (const definition of WORLD_IMPULSE_DEFINITIONS) {
    const pending = definition.id === "harborWind"
      ? effects.harborWindUntilRound !== undefined && effects.harborWindUntilRound >= state.currentRound
      : definition.id in PENDING_IMPULSE_DURATION && Boolean(effects[definition.id as keyof typeof PENDING_IMPULSE_DURATION]);
    if (!pending) continue;
    entries.push({
      kind: "impulse", title: definition.title, effect: definition.effectSummary, description: definition.description, regions: [],
      duration: definition.id === "harborWind" ? "bis Rundenende" : PENDING_IMPULSE_DURATION[definition.id as keyof typeof PENDING_IMPULSE_DURATION]
    });
  }
  return entries;
}

/** Oben auf jedem Handy: ein kleiner Hinweis, solange etwas wirkt; antippen klappt die Erklärung auf. */
export function MobileWorldStatus({ state }: { state: GameState }) {
  const entries = getWorldStatus(state);
  if (state.status !== "playing" || !entries.length) return null;
  const first = entries[0]!;
  return <details className={`mobile-world-status mobile-world-status--${first.kind}`}>
    <summary>
      <Icon name={first.kind === "chronicle" ? "magic" : "rune"} />
      <span><b>{first.title}</b> · {first.effect}</span>
      <small>{first.duration}{entries.length > 1 ? ` · +${entries.length - 1}` : ""}</small>
    </summary>
    <ul>
      {entries.map(entry => <li key={`${entry.kind}-${entry.title}`}>
        <small>{entry.kind === "chronicle" ? "CHRONIK-EREIGNIS" : "WELTIMPULS"}</small>
        <strong>{entry.title}</strong>
        <p>{entry.description}</p>
        <dl>
          <div><dt>Wirkung</dt><dd>{entry.effect}</dd></div>
          {entry.regions.length > 0 && <div><dt>Reiche</dt><dd>{entry.regions.join(" · ")}</dd></div>}
          <div><dt>Dauer</dt><dd>{entry.duration}</dd></div>
        </dl>
      </li>)}
    </ul>
  </details>;
}
