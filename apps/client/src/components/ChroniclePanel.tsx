import { useEffect, useRef, useState } from "react";
import type { GameState } from "@valenor/shared";
import { CHRONICLE_IDLE_LINE } from "../game/living/chronicle-lines";
import { CHRONICLE_VISIBLE_LINES, ChronicleTracker, type ChronicleLine } from "../game/living/chronicler";
import { Icon } from "./icons/Icon";

/** Sammelt die Sätze des Chronisten zu einem laufenden Spielstand; die jüngsten CHRONICLE_VISIBLE_LINES bleiben stehen. */
export function useChronicleLines(gameState: GameState): readonly ChronicleLine[] {
  const tracker = useRef<ChronicleTracker | undefined>(undefined);
  tracker.current ??= new ChronicleTracker(gameState);
  const [lines, setLines] = useState<readonly ChronicleLine[]>([]);
  useEffect(() => {
    const added = tracker.current!.update(gameState);
    if (added.length) setLines(current => [...current, ...added].slice(-CHRONICLE_VISIBLE_LINES));
  }, [gameState]);
  return lines;
}

/** Der Chronist in der TV-Seitenleiste: neueste Zeile oben und hell, ältere verblassen. */
export function ChroniclePanel({ lines }: { lines: readonly ChronicleLine[] }) {
  return <section className="chronicle-panel" aria-label="Der Chronist">
    <strong className="chronicle-panel__title"><Icon name="feather" /> DER CHRONIST</strong>
    {lines.length
      ? <ol aria-live="polite">{[...lines].reverse().map((line, age) => <li key={line.id} className={`chronicle-line chronicle-line--${line.tone}`} data-age={age}>{line.text}</li>)}</ol>
      : <p className="chronicle-panel__idle">{CHRONICLE_IDLE_LINE}</p>}
  </section>;
}
