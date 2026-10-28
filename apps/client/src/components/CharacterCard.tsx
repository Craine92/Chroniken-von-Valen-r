import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { GamePlayerState } from "@valenor/shared";
import { Icon } from "./icons/Icon";
import { PlayerPortrait } from "./PlayerPortrait";
import { GOLD_COUNT_MS, countValue, type GroupDot } from "../game/character-card";
import { getGraphicsQuality, prefersReducedMotion } from "../game/visual-config";

/** Gold, das bei jeder Änderung sichtbar hoch- oder herunterzählt; auf „low“ und bei reduzierter Bewegung springt es. */
export function CountingGold({ gold }: { gold: number }) {
  const [shown, setShown] = useState(gold);
  const [delta, setDelta] = useState(0);
  const previous = useRef(gold);
  useEffect(() => {
    const from = previous.current, difference = gold - from;
    previous.current = gold;
    if (!difference) return;
    setDelta(difference);
    const clear = window.setTimeout(() => setDelta(0), 1_800);
    if (prefersReducedMotion() || getGraphicsQuality() === "low") { setShown(gold); return () => window.clearTimeout(clear); }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = (now - started) / GOLD_COUNT_MS;
      setShown(countValue(from, gold, t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(clear); setShown(gold); };
  }, [gold]);
  const counting = shown !== gold;
  return <b className={`character-card__gold${counting ? (gold > shown ? " is-rising" : " is-falling") : ""}`} aria-label={`${gold.toLocaleString("de-DE")} Gold`}>
    <Icon name="gold" className="hud-gold-icon" /><span aria-hidden="true">{shown.toLocaleString("de-DE")}</span>
    {delta !== 0 && <span className={`gold-delta ${delta > 0 ? "is-positive" : "is-negative"}`} aria-hidden="true">{delta > 0 ? "+" : ""}{delta.toLocaleString("de-DE")}</span>}
  </b>;
}

/**
 * Charakterkarte auf dem TV: großes Porträt im Ring der Spielerfarbe, Name, Gold und darunter ein Punkt je Gruppe,
 * in der der Spieler Felder besitzt (gefüllt = ganze Gruppe). Die Karte am Zug ist hervorgehoben.
 */
export function CharacterCard({ player, active, order, dots, status, inDanger = false, children }: {
  player: GamePlayerState;
  active: boolean;
  order?: number | undefined;
  dots: readonly GroupDot[];
  status?: string | undefined;
  inDanger?: boolean;
  children?: ReactNode;
}) {
  return <article className={`character-card character-card--${player.color}${active ? " is-active" : ""}${player.isBankrupt ? " is-bankrupt" : ""}${inDanger ? " is-in-danger" : ""}`} data-player-id={player.id} aria-current={active ? "true" : undefined}>
    <div className="character-card__portrait"><PlayerPortrait characterId={player.characterId} /></div>
    <div className="character-card__body">
      <header>{order !== undefined && <em>{order}</em>}<strong>{player.name}</strong></header>
      <CountingGold gold={player.gold} />
      {status && <span className="character-card__status">{status}</span>}
      {dots.length > 0 && <ul className="character-card__groups" aria-label="Besitz nach Gruppen">
        {dots.map(dot => <li key={dot.groupId} className={dot.complete ? "is-complete" : undefined} style={{ "--group-color": dot.color } as CSSProperties} title={`${dot.name}: ${dot.owned} von ${dot.total}`} aria-label={`${dot.name}: ${dot.owned} von ${dot.total}${dot.complete ? ", komplett" : ""}`} />)}
      </ul>}
    </div>
    {active && <i className="character-card__turn" aria-hidden="true">AM ZUG</i>}
    {children}
  </article>;
}
