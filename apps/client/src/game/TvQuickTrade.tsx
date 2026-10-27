import { useEffect, useState, type CSSProperties } from "react";
import { BOARD_TILES, formatQuickTradeHeadline, getQuickTradeTerms, type GameState, type TradeAction } from "@valenor/shared";
import { propertyIdentity } from "../components/TradePanel";
import { Icon } from "../components/icons/Icon";

/** Wie lange der TV den Ausgang eines Schnellhandels zeigt. Ein offenes Angebot bleibt sichtbar, solange es gilt. */
export const QUICK_TRADE_TV_RESULT_MS: Record<Exclude<TradeAction["type"], "created">, number> = { accepted: 4_500, rejected: 3_000, cancelled: 3_000, expired: 3_500 };

export interface TvQuickTradeView {
  kind: "pending" | "accepted" | "rejected" | "cancelled" | "expired";
  eyebrow: string;
  title: string;
  detail: string;
  gold: number;
  tileIndex: number;
  waitingCount: number;
}

const name = (state: GameState, id: string) => state.players.find(player => player.id === id)?.name ?? "Ein Gefährte";

/** Ist die letzte Handelsaktion Teil eines Schnellhandels? Dann übernimmt das Schnellhandel-Banner die Anzeige. */
export function isQuickTradeAction(state: GameState, action: TradeAction | undefined): boolean {
  return Boolean(action?.tradeId && state.trades.find(trade => trade.id === action.tradeId)?.mode === "quick");
}

/** Was der TV zum Schnellhandel zeigt: zuerst ein frischer Ausgang, sonst das jüngste offene Angebot. */
export function getTvQuickTradeView(state: GameState, shownResultActionId?: string): TvQuickTradeView | undefined {
  const pending = state.trades.filter(trade => trade.status === "pending" && trade.mode === "quick");
  const action = state.lastTradeAction;
  const resolved = action && action.type !== "created" && action.id === shownResultActionId ? state.trades.find(trade => trade.id === action.tradeId && trade.mode === "quick") : undefined;
  const resolvedTerms = resolved ? getQuickTradeTerms(resolved) : undefined;
  if (action && action.type !== "created" && resolved && resolvedTerms) {
    const tile = BOARD_TILES[resolvedTerms.tileIndex]!.name;
    const base = { kind: action.type, gold: resolvedTerms.gold, tileIndex: resolvedTerms.tileIndex, waitingCount: pending.length };
    if (action.type === "accepted") return { ...base, eyebrow: "HANDEL BESIEGELT", title: tile, detail: `${name(state, resolvedTerms.buyerId)} erwirbt ${tile} von ${name(state, resolvedTerms.sellerId)}.` };
    if (action.type === "rejected") return { ...base, eyebrow: "ANGEBOT ABGELEHNT", title: tile, detail: `${name(state, resolved.recipientId)} lehnt das Angebot von ${name(state, resolved.proposerId)} ab.` };
    if (action.type === "cancelled") return { ...base, eyebrow: "ANGEBOT ZURÜCKGEZOGEN", title: tile, detail: `${name(state, resolved.proposerId)} zieht das Angebot zurück.` };
    return { ...base, eyebrow: "ANGEBOT VERFALLEN", title: tile, detail: resolved.closedReason ?? "Das Angebot gilt nicht mehr." };
  }
  const latest = pending.reduce<(typeof pending)[number] | undefined>((newest, trade) => !newest || trade.createdAt >= newest.createdAt ? trade : newest, undefined);
  const terms = latest ? getQuickTradeTerms(latest) : undefined;
  if (!latest || !terms) return undefined;
  return {
    kind: "pending", eyebrow: latest.counterToTradeId ? "GEGENANGEBOT" : "HANDEL AM TISCH",
    title: formatQuickTradeHeadline(state, latest)!, detail: `${name(state, latest.recipientId)} entscheidet …`,
    gold: terms.gold, tileIndex: terms.tileIndex, waitingCount: pending.length - 1
  };
}

export function TvQuickTradeCard({ view }: { view: TvQuickTradeView }) {
  const identity = propertyIdentity(view.tileIndex);
  return <aside className={`tv-quick-trade tv-quick-trade--${view.kind}`} role="status" style={{ "--property-group-accent": identity.accent } as CSSProperties}>
    <i className="tv-quick-trade__seal" aria-hidden="true"><Icon name={view.kind === "accepted" ? "seal" : identity.icon} /></i>
    <small>{view.eyebrow}</small>
    <strong>{view.title}</strong>
    <span>{view.detail}</span>
    <b>{view.gold} GOLD</b>
    {view.kind === "pending" && view.waitingCount > 0 && <em>+ {view.waitingCount} weitere{view.waitingCount === 1 ? "s" : ""} Angebot{view.waitingCount === 1 ? "" : "e"}</em>}
  </aside>;
}

export function TvQuickTradeBanner({ state }: { state: GameState }) {
  const action = state.lastTradeAction;
  const [shownResultId, setShownResultId] = useState<string>();
  useEffect(() => {
    if (!action || action.type === "created" || !isQuickTradeAction(state, action)) return;
    const remaining = QUICK_TRADE_TV_RESULT_MS[action.type] - (Date.now() - action.createdAt);
    if (remaining <= 0) return;
    setShownResultId(action.id);
    const timer = window.setTimeout(() => setShownResultId(undefined), remaining);
    return () => window.clearTimeout(timer);
  }, [action?.id]);
  const view = getTvQuickTradeView(state, shownResultId);
  return view ? <TvQuickTradeCard key={`${view.kind}:${view.tileIndex}:${view.gold}`} view={view} /> : null;
}
