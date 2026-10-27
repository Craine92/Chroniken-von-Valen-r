import { useEffect, useRef, useState } from "react";
import type { GameState } from "@valenor/shared";
import { CHRONICLE_IDLE_LINE } from "../game/living/chronicle-lines";
import { CHRONICLE_VISIBLE_LINES, ChronicleTracker, getInitialChronicleLines, type ChronicleLine } from "../game/living/chronicler";
import { Icon } from "./icons/Icon";

/**
 * Sammelt die Zeilen der Chronik zu einem laufenden Spielstand: erzählte Sätze und schlichte Protokollzeilen
 * für alles, was der Chronist nicht erzählt. Die jüngsten CHRONICLE_VISIBLE_LINES bleiben stehen.
 */
export function useChronicleLines(gameState: GameState): readonly ChronicleLine[] {
  const tracker = useRef<ChronicleTracker | undefined>(undefined);
  tracker.current ??= new ChronicleTracker(gameState);
  const [lines, setLines] = useState<readonly ChronicleLine[]>(() => getInitialChronicleLines(gameState));
  useEffect(() => {
    const added = tracker.current!.update(gameState);
    if (added.length) setLines(current => [...current, ...added].slice(-CHRONICLE_VISIBLE_LINES));
  }, [gameState]);
  return lines;
}

/** Die Chronik in der TV-Seitenleiste – der einzige Verlauf: neueste Zeile oben und hell, ältere verblassen. */
export function ChroniclePanel({ lines }: { lines: readonly ChronicleLine[] }) {
  return <section className="chronicle-panel" aria-label="Chronik">
    <strong className="chronicle-panel__title"><Icon name="feather" /> DIE CHRONIK</strong>
    {lines.length
      ? <ol aria-live="polite">{[...lines].reverse().map((line, age) => <li key={line.id} className={`chronicle-line chronicle-line--${line.kind === "fact" ? "fact" : line.tone}`} data-age={age}>{line.text}</li>)}</ol>
      : <p className="chronicle-panel__idle">{CHRONICLE_IDLE_LINE}</p>}
  </section>;
}
