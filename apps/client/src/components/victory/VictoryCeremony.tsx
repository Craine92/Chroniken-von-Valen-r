import { useEffect, useState, type CSSProperties } from "react";
import { getMatchAwards, getMatchRanking, getMatchRecords, getNetWorth, type GameState } from "@valenor/shared";
import { PlayerPortrait } from "../PlayerPortrait";
import { Icon } from "../icons/Icon";
import { WealthChart } from "./WealthChart";
import { getGraphicsQuality, prefersReducedMotion } from "../../game/visual-config";

/** So lange gehört die Bühne dem Brett: Kamerafahrt, Lichtkegel, Funkenregen und der Chronist. */
export const VICTORY_MOMENT_MS = 5_200;
export const VICTORY_MOMENT_CALM_MS = 1_200;
/** So viele Auszeichnungen stehen je Spieler auf der Karte; weitere werden gezählt („+2 weitere“). */
export const SHOWN_AWARDS = 3;

/** Podestplätze in der Anzeige: Zweiter links, Erster in der Mitte, Dritter rechts. */
export function podiumOrder(ranking: readonly string[]): { id: string; place: number }[] {
  const [first, second, third] = ranking;
  return [second && { id: second, place: 2 }, first && { id: first, place: 1 }, third && { id: third, place: 3 }].filter(Boolean) as { id: string; place: number }[];
}

/** Ist der Sieg frisch? Wer später dazukommt (Neuladen), sieht gleich die Ehrung. */
function momentDuration(state: GameState, calm: boolean): number {
  const finishedAt = state.gameResult?.finishedAt;
  if (finishedAt && Date.now() - finishedAt > VICTORY_MOMENT_MS + 1_000) return 0;
  return calm ? VICTORY_MOMENT_CALM_MS : VICTORY_MOMENT_MS;
}

/**
 * Siegerehrung auf dem TV: zuerst der Moment auf dem Brett (nur ein schmales Siegesbanner), dann die Ehrung mit
 * Podest, Auszeichnungen für alle, Vermögensverlauf und Rekorden der Partie.
 */
export function VictoryCeremony({ gameState, onNewChronicle }: { gameState: GameState; onNewChronicle?: (() => void) | undefined }) {
  const calm = prefersReducedMotion() || getGraphicsQuality() === "low";
  const [stage, setStage] = useState<"moment" | "ceremony">(() => momentDuration(gameState, calm) ? "moment" : "ceremony");
  useEffect(() => {
    if (stage !== "moment") return;
    const timer = window.setTimeout(() => setStage("ceremony"), momentDuration(gameState, calm));
    return () => window.clearTimeout(timer);
  }, [stage]);
  const ranking = getMatchRanking(gameState);
  const players = new Map(gameState.players.map(player => [player.id, player]));
  const winners = (gameState.winnerIds ?? (gameState.winnerId ? [gameState.winnerId] : [])).map(id => players.get(id)).filter(player => player !== undefined);
  const awards = getMatchAwards(gameState);
  const records = getMatchRecords(gameState);
  const snapshots = gameState.matchStats?.wealthByRound ?? [];
  const title = winners.length > 1 ? "Geteilter Sieg" : winners[0]?.name ?? "Valenør";

  if (stage === "moment") {
    return <section className="victory-moment" data-stage="moment" aria-live="polite">
      <div className="victory-moment__banner"><small>DIE CHRONIK IST ENTSCHIEDEN</small><strong>{title}</strong><span>{winners.length > 1 ? winners.map(winner => winner.name).join(" · ") : "Herrscher von Valenør"}</span></div>
    </section>;
  }

  return <section className={`victory-ceremony${calm ? " is-calm" : ""}`} data-stage="ceremony" aria-labelledby="victory-title">
    <header className="victory-ceremony__header">
      <small>{gameState.gameResult?.finishReason === "quickGameTimeExpired" ? "DAS SCHNELLE ABENTEUER ENDET" : "DIE CHRONIK IST ENTSCHIEDEN"}</small>
      <h1 id="victory-title"><Icon name="crown" /> {title}</h1>
      <p>{winners.length > 1 ? winners.map(winner => winner.name).join(" · ") : "Herrscher von Valenør"} · {gameState.currentRound} Runden</p>
    </header>
    <div className="victory-ceremony__stage">
      <div className="victory-podium" aria-label="Siegerpodest" style={{ "--podium-places": Math.min(3, ranking.length) } as CSSProperties}>
        {podiumOrder(ranking).map(({ id, place }, index) => {
          const player = players.get(id)!;
          return <div key={id} className={`victory-podium__step victory-podium__step--${place} player-theme--${player.color}`} style={{ "--step-delay": `${[600, 1_000, 200][index] ?? 0}ms` } as CSSProperties}>
            <div className="victory-podium__hero"><PlayerPortrait characterId={player.characterId} />{place === 1 && <Icon name="crown" className="victory-podium__crown" />}</div>
            <strong>{player.name}</strong>
            <span>{getNetWorth(gameState, id).toLocaleString("de-DE")} Gold Vermögen</span>
            <div className="victory-podium__block"><b>{place}</b></div>
          </div>;
        })}
        {ranking.length > 3 && <ol className="victory-podium__rest" start={4}>
          {ranking.slice(3).map(id => { const player = players.get(id)!; return <li key={id} className={`player-theme--${player.color}`}><b>{player.name}</b><span>{player.isBankrupt ? "ausgeschieden" : `${getNetWorth(gameState, id).toLocaleString("de-DE")} Gold`}</span></li>; })}
        </ol>}
      </div>
      <div className="victory-ceremony__chart">
        {snapshots.length > 1
          ? <WealthChart snapshots={snapshots} series={ranking.map(id => ({ id, name: players.get(id)!.name, color: players.get(id)!.color }))} animate={!calm} />
          : <p className="victory-ceremony__empty">Für einen Verlauf war die Chronik zu kurz.</p>}
        <dl className="victory-records">
          {records.map((record, index) => <div key={record.id} style={{ "--item-delay": `${1_400 + index * 120}ms` } as CSSProperties}><dt>{record.label}</dt><dd><b>{record.value}</b><span>{record.detail}</span></dd></div>)}
        </dl>
      </div>
    </div>
    <ul className="victory-awards" aria-label="Auszeichnungen">
      {ranking.map((id, index) => {
        const player = players.get(id)!;
        return <li key={id} className={`victory-award player-theme--${player.color}`} style={{ "--item-delay": `${1_800 + index * 160}ms` } as CSSProperties}>
          <PlayerPortrait characterId={player.characterId} />
          <div><strong>{player.name}</strong>{awards[id]!.slice(0, SHOWN_AWARDS).map(award => <p key={award.id}><b>{award.title}</b><span>{award.reason}</span></p>)}
            {awards[id]!.length > SHOWN_AWARDS && <small className="victory-award__more" title={awards[id]!.slice(SHOWN_AWARDS).map(award => award.title).join(", ")}>+{awards[id]!.length - SHOWN_AWARDS} weitere: {awards[id]!.slice(SHOWN_AWARDS).map(award => award.title).join(", ")}</small>}</div>
        </li>;
      })}
    </ul>
    {onNewChronicle && <button type="button" className="victory-ceremony__again" data-audio-cue="UI_CONFIRM" onClick={onNewChronicle}>Neue Chronik</button>}
  </section>;
}
