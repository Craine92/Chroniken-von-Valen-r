import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BOARD_TILES,
  QUICK_TRADE_MIN_PRICE,
  QUICK_TRADE_PRICE_STEPS,
  formatQuickTradeHeadline,
  getOpenQuickTrade,
  getPropertyGroupTiles,
  getQuickTradeEligibility,
  getQuickTradeSuggestion,
  getQuickTradePriceVerdict,
  getQuickTradeTerms,
  type GameState,
  type QuickTradeRequest,
  type QuickTradeRole,
  type TradeOffer
} from "@valenor/shared";
import { ControllerActionBar } from "./ControllerActionBar";
import { PropertyLabel, propertyIdentity } from "./TradePanel";
import { Icon } from "./icons/Icon";

/** Der Preisbildschirm: ein Grundstück, ein Partner, ein Preis. */
export interface QuickTradeDraft {
  tileIndex: number;
  /** Beim Verkauf der gewählte Käufer; beim Kauf und Gegenangebot ergibt sich der Partner aus Besitz bzw. Angebot. */
  buyerId?: string | undefined;
  counterToTradeId?: string | undefined;
  gold: number;
}

export const OPEN_QUICK_TRADE_REASON = "Du hast bereits ein offenes Angebot. Zieh es zurück, um ein neues zu senden.";

const SAFE_PHASES = ["waitingForRoll", "waitingForEndTurn"];
const clampPrice = (gold: number, maxPrice: number) => Math.max(QUICK_TRADE_MIN_PRICE, Math.min(maxPrice, gold));
const playerName = (state: GameState, id: string | undefined) => state.players.find(player => player.id === id)?.name ?? "Ein Gefährte";
const playerLabel = (state: GameState, id: string) => { const player = state.players.find(entry => entry.id === id); return `${player?.name ?? ""}${player?.type === "computer" ? " · NPC" : ""}`; };

export interface BlockedTileGroup { key: string; label: string; reason: string; tileIndices: number[] }

/**
 * Fasst gesperrte Grundstücke zusammen: Bauwerke pro Region, alle anderen Gründe (Bankrott, Verbindung, Gold) je Grund.
 * So steht statt mehrerer ausgegrauter Karten eine Zeile wie „3 Grundstücke gesperrt – Bauwerke in Eisenöde“.
 */
export function groupBlockedTiles(state: GameState, blocked: readonly { tileIndex: number; reason: string }[]): BlockedTileGroup[] {
  const groups = new Map<string, BlockedTileGroup>();
  for (const { tileIndex, reason } of blocked) {
    const region = BOARD_TILES[tileIndex]?.propertyGroup;
    const built = region !== undefined && getPropertyGroupTiles(region).some(member => (state.propertyOwnerships.find(entry => entry.tileIndex === member.index)?.buildingLevel ?? 0) > 0);
    const key = built ? `built:${region}` : `reason:${reason}`;
    const group = groups.get(key) ?? { key, label: built ? `Bauwerke in ${region}` : reason.replace(/\.$/, ""), reason, tileIndices: [] };
    group.tileIndices.push(tileIndex);
    groups.set(key, group);
  }
  return [...groups.values()];
}
const blockedSummary = (group: BlockedTileGroup) => `${group.tileIndices.length} ${group.tileIndices.length === 1 ? "Grundstück" : "Grundstücke"} gesperrt – ${group.label}`;

/** Startpreis für einen neuen Entwurf: der Vorschlag des Spiels, begrenzt auf das Gold des Käufers. */
export function createQuickTradeDraft(state: GameState, playerId: string, tileIndex: number, buyerId?: string): QuickTradeDraft | undefined {
  const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === tileIndex);
  if (!ownership) return undefined;
  const selling = ownership.ownerId === playerId;
  const buyer = selling ? buyerId ?? state.players.find(player => player.id !== playerId && !player.isBankrupt)?.id : playerId;
  const suggestion = buyer ? getQuickTradeSuggestion(state, tileIndex, buyer) : undefined;
  const maxPrice = state.players.find(player => player.id === buyer)?.gold ?? 0;
  return { tileIndex, ...(selling ? { buyerId: buyer } : {}), gold: clampPrice(suggestion?.fairPrice ?? QUICK_TRADE_MIN_PRICE, Math.max(QUICK_TRADE_MIN_PRICE, maxPrice)) };
}

/** Bewertung aus Sicht des Betrachters: grün, wenn der Preis für ihn gut ist, rot, wenn er für ihn ungünstig ist. */
export function QuickTradePriceVerdictLine({ gold, fairPrice, role, context }: { gold: number; fairPrice: number; role: QuickTradeRole; context: "offer" | "draft" }) {
  const verdict = getQuickTradePriceVerdict(gold, fairPrice, role, context);
  return <p className={`quick-trade-rating quick-trade-rating--${verdict.tone}`} data-rating={verdict.rating}><strong>{verdict.label}</strong><span>Vorschlag des Spiels: {fairPrice} Gold</span></p>;
}

export function QuickTradePriceStepper({ gold, fairPrice, maxPrice, role, onChange, disabled }: { gold: number; fairPrice: number; maxPrice: number; role: QuickTradeRole; onChange: (gold: number) => void; disabled?: boolean }) {
  const [small, large] = QUICK_TRADE_PRICE_STEPS;
  const step = (delta: number) => onChange(clampPrice(gold + delta, maxPrice));
  return <section className="quick-trade-price" aria-label="Preis">
    <output className="quick-trade-price__value" aria-live="polite"><b>{gold}</b> GOLD</output>
    <div className="quick-trade-price__steps">
      {[-large, -small, small, large].map(delta => <button type="button" key={delta} disabled={disabled || (delta < 0 ? gold <= QUICK_TRADE_MIN_PRICE : gold >= maxPrice)} onClick={() => step(delta)} aria-label={`${delta > 0 ? "Plus" : "Minus"} ${Math.abs(delta)} Gold`}>{delta > 0 ? "+" : "−"}{Math.abs(delta)}</button>)}
    </div>
    <QuickTradePriceVerdictLine gold={gold} fairPrice={fairPrice} role={role} context="draft" />
    {gold !== Math.min(fairPrice, maxPrice) && <button type="button" className="quick-trade-reset" disabled={disabled} onClick={() => onChange(clampPrice(fairPrice, maxPrice))}>Vorschlag übernehmen</button>}
  </section>;
}

/** Die Karte, die der Empfänger sieht – und in kleiner Form der Anbieter für sein eigenes offenes Angebot. */
export function QuickTradeOfferCard({ state, playerId, trade, actionsEnabled, disabledReason, onDecision, onChangePrice }: {
  state: GameState; playerId: string; trade: TradeOffer; actionsEnabled: boolean; disabledReason?: string | undefined;
  onDecision: (action: "accept" | "reject" | "cancel", tradeId: string) => void;
  onChangePrice?: (trade: TradeOffer) => void;
}) {
  const terms = getQuickTradeTerms(trade);
  if (!terms) return null;
  const incoming = trade.recipientId === playerId;
  const identity = propertyIdentity(terms.tileIndex);
  const fairPrice = getQuickTradeSuggestion(state, terms.tileIndex, terms.buyerId)?.fairPrice;
  const viewerRole: QuickTradeRole = terms.sellerId === playerId ? "seller" : "buyer";
  const buyer = state.players.find(player => player.id === terms.buyerId);
  const missingGold = incoming && terms.buyerId === playerId && buyer ? Math.max(0, terms.gold - buyer.gold) : 0;
  const ownOpenOffer = incoming ? getOpenQuickTrade(state, playerId) : undefined;
  const acceptReason = disabledReason ?? (missingGold > 0 ? `Dir fehlen ${missingGold} Gold, um anzunehmen.` : undefined);
  const counterReason = disabledReason ?? (ownOpenOffer ? OPEN_QUICK_TRADE_REASON : undefined);
  const reason = incoming ? acceptReason ?? counterReason : disabledReason;
  return <article className={`quick-trade-offer${incoming ? " quick-trade-offer--incoming" : " quick-trade-offer--own"}`} style={{ "--property-group-accent": identity.accent } as CSSProperties}>
    <small>{incoming ? trade.counterToTradeId ? "GEGENANGEBOT" : "HANDELSANGEBOT" : "DEIN OFFENES ANGEBOT"}</small>
    <h3>{formatQuickTradeHeadline(state, trade)}</h3>
    <div className="trade-property"><PropertyLabel state={state} index={terms.tileIndex} /></div>
    {fairPrice !== undefined && <QuickTradePriceVerdictLine gold={terms.gold} fairPrice={fairPrice} role={viewerRole} context={incoming ? "offer" : "draft"} />}
    {incoming ? <div className="quick-trade-offer__actions">
      <button type="button" className="controller-primary-action" disabled={!actionsEnabled || Boolean(acceptReason)} onClick={() => onDecision("accept", trade.id)}>Annehmen</button>
      <button type="button" disabled={!actionsEnabled} onClick={() => onDecision("reject", trade.id)}>Ablehnen</button>
      <button type="button" className="trade-counter-action" disabled={!actionsEnabled || Boolean(counterReason)} onClick={() => onChangePrice?.(trade)}>Preis ändern</button>
    </div> : <>
      <p className="quick-trade-offer__waiting">{playerName(state, trade.recipientId)} überlegt noch …</p>
      <div className="quick-trade-offer__actions"><button type="button" disabled={!actionsEnabled} onClick={() => onDecision("cancel", trade.id)}>Angebot zurückziehen</button></div>
    </>}
    {reason && <p className="controller-disabled-reason">{reason}</p>}
  </article>;
}

/** Ein Bildschirm für Kauf, Verkauf und Preisänderung: Grundstück, gegebenenfalls Käufer, Preis. */
export function QuickTradePriceScreen({ state, playerId, draft, disabledReason, onChange, onBack, onSend }: {
  state: GameState; playerId: string; draft: QuickTradeDraft; disabledReason?: string | undefined;
  onChange: (draft: QuickTradeDraft) => void;
  onBack: () => void;
  onSend: (request: QuickTradeRequest) => void;
}) {
  const openQuick = getOpenQuickTrade(state, playerId);
  const counterTarget = draft.counterToTradeId ? state.trades.find(trade => trade.id === draft.counterToTradeId) : undefined;
  const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === draft.tileIndex);
  const counterTerms = counterTarget ? getQuickTradeTerms(counterTarget) : undefined;
  const sellerId = counterTerms?.sellerId ?? ownership?.ownerId;
  const selling = sellerId === playerId;
  const buyerId = counterTerms?.buyerId ?? (selling ? draft.buyerId : playerId);
  const buyer = state.players.find(player => player.id === buyerId);
  const partnerId = selling ? buyerId : sellerId;
  const suggestion = buyerId ? getQuickTradeSuggestion(state, draft.tileIndex, buyerId) : undefined;
  const eligibility = sellerId && buyerId ? getQuickTradeEligibility(state, sellerId, buyerId, draft.tileIndex) : { allowed: false, reason: "Wähle zuerst einen Käufer." };
  const maxPrice = Math.max(QUICK_TRADE_MIN_PRICE, buyer?.gold ?? 0);
  const buyers = state.players.filter(player => player.id !== playerId && !player.isBankrupt);
  const sendReason = disabledReason ?? (!eligibility.allowed ? eligibility.reason : (buyer?.gold ?? 0) < draft.gold ? `${buyer?.name ?? "Der Käufer"} besitzt nur ${buyer?.gold ?? 0} Gold.` : openQuick ? OPEN_QUICK_TRADE_REASON : undefined);
  const send = () => onSend({ tileIndex: draft.tileIndex, gold: draft.gold, ...(selling && buyerId && !draft.counterToTradeId ? { recipientId: buyerId } : {}), ...(draft.counterToTradeId ? { counterToTradeId: draft.counterToTradeId } : {}) });
  const identity = propertyIdentity(draft.tileIndex);
  return <section className="trade-panel quick-trade-panel has-context-action-bar" aria-label="Schnellhandel">
    <header className="trade-panel__header"><div><small>{counterTarget ? "PREIS ÄNDERN" : selling ? "VERKAUFEN" : "KAUFEN"}</small><h2>{BOARD_TILES[draft.tileIndex]?.name}</h2></div></header>
    <p className="quick-trade-lead">{counterTarget ? `Nenne ${playerName(state, partnerId)} deinen Preis. Grundstück und Rollen bleiben gleich.` : selling ? "Wähle einen Käufer und nenne deinen Preis." : `Nenne ${playerName(state, partnerId)} deinen Preis.`}</p>
    <div className="trade-property" style={{ "--property-group-accent": identity.accent } as CSSProperties}><PropertyLabel state={state} index={draft.tileIndex} /></div>
    {selling && !counterTarget && <fieldset className="quick-trade-buyers"><legend>WER SOLL KAUFEN?</legend>
      {buyers.map(player => <button type="button" key={player.id} aria-pressed={player.id === buyerId} onClick={() => { const next = createQuickTradeDraft(state, playerId, draft.tileIndex, player.id); if (next) onChange(next); }}>{playerLabel(state, player.id)}<small>{player.gold} Gold</small></button>)}
    </fieldset>}
    <QuickTradePriceStepper gold={draft.gold} fairPrice={suggestion?.fairPrice ?? draft.gold} maxPrice={maxPrice} role={selling ? "seller" : "buyer"} disabled={!eligibility.allowed} onChange={gold => onChange({ ...draft, gold })} />
    {suggestion && suggestion.factors.length > 1 && <ul className="quick-trade-factors" aria-label="So entsteht der Vorschlag">{suggestion.factors.map(factor => <li key={factor.label}><span>{factor.label}</span><b>{factor.amount > 0 && factor !== suggestion.factors[0] ? "+" : ""}{factor.amount}</b></li>)}</ul>}
    {sendReason && <p className="controller-disabled-reason">{sendReason}</p>}
    <ControllerActionBar label="Schnellhandel" primary={{ label: counterTarget ? "Neuen Preis senden" : "Angebot senden", onClick: send, disabled: Boolean(sendReason) }} secondary={{ label: "Zurück", onClick: onBack, tone: "secondary" }} />
  </section>;
}

export function QuickTradePanel({ state, playerId, connected, onQuickCreate, onDecision, onOpenAdvanced, draftIntent, onDraftIntentHandled }: {
  state: GameState; playerId: string; connected: boolean;
  onQuickCreate: (request: QuickTradeRequest) => void;
  onDecision: (action: "accept" | "reject" | "cancel", tradeId: string) => void;
  onOpenAdvanced: () => void;
  draftIntent?: { id: number; tileIndex: number } | undefined;
  onDraftIntentHandled?: () => void;
}) {
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [draft, setDraft] = useState<QuickTradeDraft>();
  const safe = SAFE_PHASES.includes(state.turnPhase) && !state.auction && !state.pendingPayment;
  const disabledReason = !safe ? "Handel ist in dieser Spielphase nicht möglich." : !connected ? "Keine Verbindung zum Spielserver." : undefined;
  const actionsEnabled = !disabledReason;
  const openQuick = getOpenQuickTrade(state, playerId);
  const incomingQuick = state.trades.filter(trade => trade.status === "pending" && trade.mode === "quick" && trade.recipientId === playerId);
  const incomingAdvanced = state.trades.filter(trade => trade.status === "pending" && trade.mode !== "quick" && trade.recipientId === playerId);
  const counterTarget = draft?.counterToTradeId ? state.trades.find(trade => trade.id === draft.counterToTradeId) : undefined;

  useEffect(() => {
    if (!draftIntent) return;
    const next = createQuickTradeDraft(state, playerId, draftIntent.tileIndex);
    if (next) { setDirection(next.buyerId ? "sell" : "buy"); setDraft(next); }
    onDraftIntentHandled?.();
  }, [draftIntent?.id]);
  // Ein Gegenangebot zu einem inzwischen erledigten Angebot ergibt keinen Sinn mehr.
  useEffect(() => {
    if (draft?.counterToTradeId && counterTarget?.status !== "pending") setDraft(undefined);
  }, [draft?.counterToTradeId, counterTarget?.status]);
  // Sobald das eigene Angebot beim Server angekommen ist, zurück zur Übersicht mit der Angebotskarte.
  const knownOpenQuickId = useRef(openQuick?.id);
  useEffect(() => {
    if (openQuick && openQuick.id !== knownOpenQuickId.current) setDraft(undefined);
    knownOpenQuickId.current = openQuick?.id;
  }, [openQuick?.id]);

  if (draft) return <QuickTradePriceScreen state={state} playerId={playerId} draft={draft} disabledReason={disabledReason} onChange={setDraft} onBack={() => setDraft(undefined)} onSend={onQuickCreate} />;

  const others = state.players.filter(player => player.id !== playerId && !player.isBankrupt);
  const eligibilityFor = (tileIndex: number, sellerId: string) => direction === "buy" ? getQuickTradeEligibility(state, sellerId, playerId, tileIndex)
    : others.some(player => getQuickTradeEligibility(state, playerId, player.id, tileIndex).allowed) ? { allowed: true } : getQuickTradeEligibility(state, playerId, others[0]?.id ?? "", tileIndex);
  const tileButton = (tileIndex: number) => {
    const identity = propertyIdentity(tileIndex);
    const fairPrice = direction === "buy" ? getQuickTradeSuggestion(state, tileIndex, playerId)?.fairPrice : undefined;
    return <button type="button" className="quick-trade-tile" key={tileIndex} style={{ "--property-group-accent": identity.accent } as CSSProperties}
      onClick={() => { const next = createQuickTradeDraft(state, playerId, tileIndex); if (next) setDraft(next); }}>
      <span aria-hidden="true"><Icon name={identity.icon} /></span>
      <span><strong>{BOARD_TILES[tileIndex]?.name}</strong><small>{identity.label}{state.propertyOwnerships.find(entry => entry.tileIndex === tileIndex)?.mortgaged ? " · verpfändet" : ""}</small></span>
      {fairPrice !== undefined && <b>≈ {fairPrice}</b>}
    </button>;
  };
  const tileList = (tiles: number[], sellerId: string) => {
    const checked = tiles.map(tileIndex => ({ tileIndex, eligibility: eligibilityFor(tileIndex, sellerId) }));
    const blocked = groupBlockedTiles(state, checked.filter(entry => !entry.eligibility.allowed).map(entry => ({ tileIndex: entry.tileIndex, reason: entry.eligibility.reason ?? "Nicht handelbar." })));
    return <>
      {checked.filter(entry => entry.eligibility.allowed).map(entry => tileButton(entry.tileIndex))}
      {blocked.map(group => <details className="quick-trade-blocked" key={group.key}>
        <summary><span>{blockedSummary(group)}</span><Icon name="chevron-right" className="quick-trade-blocked__chevron" /></summary>
        <p>{group.reason}</p>
        <ul>{group.tileIndices.map(index => <li key={index}><Icon name={propertyIdentity(index).icon} /> {BOARD_TILES[index]?.name}</li>)}</ul>
      </details>)}
    </>;
  };
  const owned = (ownerId: string) => state.propertyOwnerships.filter(entry => entry.ownerId === ownerId).map(entry => entry.tileIndex).sort((a, b) => a - b);

  return <section className="trade-panel quick-trade-panel" aria-label="Schnellhandel">
    <header className="trade-panel__header"><div><small>SCHNELLHANDEL</small><h2>Handel</h2></div></header>
    {incomingQuick.map(trade => <QuickTradeOfferCard key={trade.id} state={state} playerId={playerId} trade={trade} actionsEnabled={actionsEnabled} disabledReason={disabledReason} onDecision={onDecision}
      onChangePrice={offer => { const terms = getQuickTradeTerms(offer)!; setDraft({ tileIndex: terms.tileIndex, counterToTradeId: offer.id, gold: terms.gold }); }} />)}
    {openQuick && <QuickTradeOfferCard state={state} playerId={playerId} trade={openQuick} actionsEnabled={actionsEnabled} disabledReason={disabledReason} onDecision={onDecision} />}
    {incomingAdvanced.length > 0 && <aside className="quick-trade-advanced-notice"><span>{incomingAdvanced.length === 1 ? `Erweitertes Angebot von ${playerName(state, incomingAdvanced[0]!.proposerId)}` : `${incomingAdvanced.length} erweiterte Angebote`}</span><button type="button" onClick={onOpenAdvanced}>Ansehen</button></aside>}
    <div className="quick-trade-direction" role="tablist" aria-label="Handelsrichtung">
      <button type="button" role="tab" aria-selected={direction === "buy"} onClick={() => setDirection("buy")}>Kaufen</button>
      <button type="button" role="tab" aria-selected={direction === "sell"} onClick={() => setDirection("sell")}>Verkaufen</button>
    </div>
    <p className="quick-trade-lead">{direction === "buy" ? "Tippe auf ein Grundstück eines Gefährten und nenne deinen Preis." : "Tippe auf einen deiner Besitze und biete ihn feil."}</p>
    {openQuick && <p className="controller-disabled-reason">{OPEN_QUICK_TRADE_REASON}</p>}
    {direction === "buy"
      ? others.map(owner => owned(owner.id).length > 0 && <section className="quick-trade-owner" key={owner.id}><h3>{playerLabel(state, owner.id).toUpperCase()}</h3>{tileList(owned(owner.id), owner.id)}</section>)
      : <section className="quick-trade-owner">{tileList(owned(playerId), playerId)}</section>}
    {(direction === "buy" ? others.every(owner => owned(owner.id).length === 0) : owned(playerId).length === 0) && <p className="trade-empty">{direction === "buy" ? "Noch besitzt kein Gefährte ein Grundstück." : "Du besitzt noch kein Grundstück."}</p>}
    <button type="button" className="quick-trade-advanced-link" onClick={onOpenAdvanced}><strong>Erweiterter Handel</strong><small>Mehrere Grundstücke, Gold und Karten auf beiden Seiten</small></button>
  </section>;
}
