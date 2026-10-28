import { useState, type CSSProperties, type PointerEvent } from "react";
import type { PlayerColor, WealthSnapshot } from "@valenor/shared";

export interface WealthSeries {
  id: string;
  name: string;
  color: PlayerColor;
}

const VIEW = { width: 760, height: 360, left: 56, right: 132, top: 18, bottom: 40 } as const;
/** Bis zu so vielen Linien stehen Namen direkt am Ende; darüber tragen Legende und Tooltip die Zuordnung. */
const MAX_DIRECT_LABELS = 4;

const compact = (value: number) => value >= 1_000 ? `${(value / 1_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}K` : value.toLocaleString("de-DE");

/** Saubere Skala: 0 bis knapp über den Höchstwert, in runden Schritten und höchstens 5 Abschnitten. */
export function niceScale(max: number): number[] {
  const value = Math.max(1, max);
  const magnitude = 10 ** Math.floor(Math.log10(value / 5));
  const step = [1, 2, 2.5, 5, 10, 20].map(factor => factor * magnitude).find(candidate => Math.ceil(value / candidate) <= 5)!;
  return Array.from({ length: Math.ceil(value / step) + 1 }, (_, index) => index * step);
}

/** Namen am Linienende ohne Überlappung: von oben nach unten mit Mindestabstand verschieben. */
export function placeEndLabels(ends: readonly { id: string; y: number }[], gap: number, top: number, bottom: number): Record<string, number> {
  const sorted = [...ends].sort((left, right) => left.y - right.y);
  const placed: { id: string; y: number }[] = [];
  for (const end of sorted) placed.push({ id: end.id, y: Math.max(end.y, (placed.at(-1)?.y ?? -Infinity) + gap) });
  const overflow = (placed.at(-1)?.y ?? 0) - bottom;
  if (overflow > 0) for (let index = placed.length - 1; index >= 0; index -= 1) {
    const limit = index === placed.length - 1 ? bottom : placed[index + 1]!.y - gap;
    placed[index]!.y = Math.max(top, Math.min(placed[index]!.y, limit));
  }
  return Object.fromEntries(placed.map(entry => [entry.id, entry.y]));
}

/**
 * Vermögen jedes Spielers über die Runden, in den Spielerfarben. Die Linien zeichnen sich nacheinander (ruhig bei
 * reduzierter Bewegung). Legende immer, Namen am Ende bei bis zu vier Spielern, Fadenkreuz mit Werten aller Spieler,
 * dazu eine Tabelle für Screenreader.
 */
export function WealthChart({ snapshots, series, animate = true }: { snapshots: readonly WealthSnapshot[]; series: readonly WealthSeries[]; animate?: boolean }) {
  const [hover, setHover] = useState<number>();
  const ticks = niceScale(Math.max(...snapshots.flatMap(snapshot => series.map(entry => snapshot.values[entry.id] ?? 0))));
  const top = ticks.at(-1)!;
  const plotWidth = VIEW.width - VIEW.left - VIEW.right, plotHeight = VIEW.height - VIEW.top - VIEW.bottom;
  const x = (index: number) => VIEW.left + (snapshots.length > 1 ? index / (snapshots.length - 1) : 0) * plotWidth;
  const y = (value: number) => VIEW.top + plotHeight - (value / top) * plotHeight;
  const lastIndex = snapshots.length - 1;
  const ends = series.map(entry => ({ id: entry.id, y: y(snapshots[lastIndex]?.values[entry.id] ?? 0) }));
  const labelY = placeEndLabels(ends, 30, VIEW.top + 8, VIEW.top + plotHeight);
  const direct = series.length <= MAX_DIRECT_LABELS;
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - box.left) / box.width) * VIEW.width;
    setHover(Math.max(0, Math.min(lastIndex, Math.round(((position - VIEW.left) / plotWidth) * lastIndex))));
  };
  const hoverSnapshot = hover === undefined ? undefined : snapshots[hover];
  return <figure className={`wealth-chart${animate ? " is-animated" : ""}`}>
    <figcaption>Vermögen über die Runden</figcaption>
    <ul className="wealth-chart__legend" aria-hidden="true">
      {series.map(entry => <li key={entry.id}><i className={`wealth-key player-theme--${entry.color}`} />{entry.name}</li>)}
    </ul>
    <div className="wealth-chart__plot">
      <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label="Vermögen jedes Spielers je Runde; Werte in der Tabelle darunter" onPointerMove={onPointerMove} onPointerLeave={() => setHover(undefined)}>
        {ticks.map(tick => <g key={tick} className="wealth-chart__grid">
          <line x1={VIEW.left} x2={VIEW.left + plotWidth} y1={y(tick)} y2={y(tick)} />
          <text x={VIEW.left - 10} y={y(tick)} dy="0.35em" textAnchor="end">{compact(tick)}</text>
        </g>)}
        {snapshots.map((snapshot, index) => (snapshots.length <= 12 || index % Math.ceil(snapshots.length / 12) === 0 || index === lastIndex) &&
          <text key={snapshot.round} className="wealth-chart__round" x={x(index)} y={VIEW.top + plotHeight + 24} textAnchor="middle">{snapshot.round === 0 ? "Start" : snapshot.round}</text>)}
        {series.map((entry, order) => {
          const points = snapshots.map((snapshot, index) => `${x(index).toFixed(1)},${y(snapshot.values[entry.id] ?? 0).toFixed(1)}`).join(" ");
          return <polyline key={entry.id} className={`wealth-chart__line player-theme--${entry.color}`} points={points} pathLength={1} style={{ "--line-delay": `${order * 260}ms` } as CSSProperties} />;
        })}
        {series.map((entry, order) => {
          const endY = y(snapshots[lastIndex]?.values[entry.id] ?? 0);
          return <g key={entry.id} className="wealth-chart__end" style={{ "--line-delay": `${order * 260}ms` } as CSSProperties}>
            <circle className={`player-theme--${entry.color}`} cx={x(lastIndex)} cy={endY} r={5} />
            {direct && <>
              {Math.abs(labelY[entry.id]! - endY) > 2 && <line className="wealth-chart__leader" x1={x(lastIndex) + 7} y1={endY} x2={x(lastIndex) + 18} y2={labelY[entry.id]} />}
              <text className="wealth-chart__label" x={x(lastIndex) + 22} y={labelY[entry.id]} dy="0.35em">{entry.name} <tspan>{compact(snapshots[lastIndex]?.values[entry.id] ?? 0)}</tspan></text>
            </>}
          </g>;
        })}
        {hoverSnapshot && <line className="wealth-chart__crosshair" x1={x(hover!)} x2={x(hover!)} y1={VIEW.top} y2={VIEW.top + plotHeight} />}
      </svg>
      {hoverSnapshot && <div className="wealth-chart__tooltip" style={{ left: `${(x(hover!) / VIEW.width) * 100}%` }}>
        <small>{hoverSnapshot.round === 0 ? "Start" : `Runde ${hoverSnapshot.round}`}</small>
        {[...series].sort((left, right) => (hoverSnapshot.values[right.id] ?? 0) - (hoverSnapshot.values[left.id] ?? 0)).map(entry =>
          <span key={entry.id}><i className={`wealth-key player-theme--${entry.color}`} /><b>{(hoverSnapshot.values[entry.id] ?? 0).toLocaleString("de-DE")}</b> {entry.name}</span>)}
      </div>}
    </div>
    <table className="visually-hidden">
      <caption>Vermögen in Gold je Runde</caption>
      <thead><tr><th scope="col">Runde</th>{series.map(entry => <th key={entry.id} scope="col">{entry.name}</th>)}</tr></thead>
      <tbody>{snapshots.map(snapshot => <tr key={snapshot.round}><th scope="row">{snapshot.round === 0 ? "Start" : snapshot.round}</th>{series.map(entry => <td key={entry.id}>{snapshot.values[entry.id] ?? 0}</td>)}</tr>)}</tbody>
    </table>
  </figure>;
}
