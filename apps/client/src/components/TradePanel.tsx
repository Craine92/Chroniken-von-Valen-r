import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BOARD_TILES, getCardDefinition, getPropertyGroup, getBuildingName, type CreateTradeOfferRequest, type GameState, type TradeOffer, type PropertyOwnership } from "@valenor/shared";
import { ControllerActionBar } from "./ControllerActionBar";

export function getCounterOfferTemplate(trade: TradeOffer): CreateTradeOfferRequest {
  const copy = (assets: TradeOffer["offer"]) => ({ ...assets, propertyTileIndices: [...assets.propertyTileIndices], cardIds: [...(assets.cardIds ?? [])], relicIds: [] });
  return { counterToTradeId: trade.id, recipientId: trade.proposerId, offer: copy(trade.request), request: copy(trade.offer) };
}

function propertyIdentity(index: number) {
  const tile = BOARD_TILES[index]!;
  const group = getPropertyGroup(tile.propertyGroupId);
  return { tile, label: group?.displayName ?? (tile.type === "harbor" ? "Häfen" : "Versorgung"), accent: group?.accent ?? (tile.type === "harbor" ? "#76c8d6" : "#d6bd78"), sigil: group?.sigil ?? (tile.type === "harbor" ? "⚓" : "⚙"), size: group?.size ?? BOARD_TILES.filter(field => field.type === tile.type).length };
}

function PropertyLabel({ state, index }: { state: GameState; index: number }) {
  const { tile, label, sigil, size } = propertyIdentity(index);
  const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === index);
  const owner = state.players.find(player => player.id === ownership?.ownerId);
  return <><span className="trade-property__sigil" aria-hidden="true">{sigil}</span><span className="trade-property__identity"><strong>{tile.name}</strong><small>{label} · {size}er-Gruppe</small><span>Besitz: {owner?.name ?? "Frei"}</span><span>{ownership?.buildingLevel && tile.region ? `Baustufe ${ownership.buildingLevel} · ${getBuildingName(tile.region, ownership.buildingLevel)}` : "Unbebaut"}{ownership?.mortgaged ? " · Belehnt / verpfändet" : ""}</span></span></>;
}

function Assets({ state, assets, onRemoveProperty, onRemoveCard }: {
  state: GameState; assets: TradeOffer["offer"];
  onRemoveProperty?: (index: number) => void;
  onRemoveCard?: (id: string) => void;
}) {
  return <div className="trade-assets">
    {assets.gold > 0 && <span className="trade-gold">✦ {assets.gold} Gold</span>}
    {assets.propertyTileIndices.map(index => onRemoveProperty ? <button type="button" className="trade-property trade-selected-remove" key={index} style={{ "--property-group-accent": propertyIdentity(index).accent } as CSSProperties} onClick={() => onRemoveProperty(index)}><PropertyLabel state={state} index={index} /><b aria-hidden="true">×</b></button> : <div className="trade-property" key={index} style={{ "--property-group-accent": propertyIdentity(index).accent } as CSSProperties}><PropertyLabel state={state} index={index} /></div>)}
    {(assets.cardIds ?? []).map(cardId => onRemoveCard ? <button type="button" className="trade-held-card trade-selected-remove" key={cardId} onClick={() => onRemoveCard(cardId)}>▤ {getCardDefinition(cardId).title}<b aria-hidden="true">×</b></button> : <span className="trade-held-card" key={cardId}>▤ {getCardDefinition(cardId).title}</span>)}
    {assets.gold === 0 && assets.propertyTileIndices.length === 0 && !assets.cardIds?.length && <span className="trade-empty">Keine Objekte ausgewählt</span>}
  </div>;
}

function PropertyOptions({ state, properties, selected, onToggle }: { state: GameState; properties: PropertyOwnership[]; selected: number[]; onToggle: (index: number) => void }) {
  const groups = [...new Set(properties.map(entry => propertyIdentity(entry.tileIndex).label))];
  return <div className="trade-property-options">{groups.map(label => {
    const members = properties.filter(entry => propertyIdentity(entry.tileIndex).label === label);
    const visual = propertyIdentity(members[0]!.tileIndex);
    return <details className="trade-region" key={label} style={{ "--property-group-accent": visual.accent } as CSSProperties}><summary><span aria-hidden="true">{visual.sigil}</span> {label} ({members.length})</summary>{members.map(entry => <label className={`trade-property${selected.includes(entry.tileIndex) ? " is-selected" : ""}`} key={entry.tileIndex}><input type="checkbox" checked={selected.includes(entry.tileIndex)} onChange={() => onToggle(entry.tileIndex)} /><PropertyLabel state={state} index={entry.tileIndex} /><span className="trade-property__check" aria-hidden="true">{selected.includes(entry.tileIndex) ? "✓" : "+"}</span></label>)}</details>;
  })}{properties.length === 0 && <p className="trade-empty">Keine Grundstücke vorhanden.</p>}</div>;
}

export function TradePanel({ state, playerId, connected, onCreate, onDecision, draftIntent, onDraftIntentHandled }: {
  state: GameState; playerId: string; connected: boolean;
  onCreate: (request: CreateTradeOfferRequest) => void;
  onDecision: (action: "accept" | "reject" | "cancel", tradeId: string) => void;
  draftIntent?: TradeDraftIntent | undefined;
  onDraftIntentHandled?: () => void;
}) {
  const targets = state.players.filter(player => player.id !== playerId && !player.isBankrupt);
  const playerLabel = (id: string) => { const player = state.players.find(player => player.id === id); return `${player?.name ?? ""}${player?.type === "computer" ? " · NPC" : ""}`; };
  const initialIntentValid = Boolean(draftIntent && targets.some(player => player.id === draftIntent.recipientId));
  const initialRecipientId = initialIntentValid ? draftIntent!.recipientId : targets[0]?.id ?? "";
  const initialRequested = initialIntentValid ? draftIntent!.requestedPropertyTileIndices.filter(index => state.propertyOwnerships.some(entry => entry.tileIndex === index && entry.ownerId === initialRecipientId)) : [];
  const [recipientId, setRecipientId] = useState(initialRecipientId);
  const [offerGold, setOfferGold] = useState("");
  const [requestGold, setRequestGold] = useState("");
  const [offered, setOffered] = useState<number[]>([]);
  const [requested, setRequested] = useState<number[]>(initialRequested);
  const [offeredCards, setOfferedCards] = useState<string[]>([]);
  const [requestedCards, setRequestedCards] = useState<string[]>([]);
  const [counterToTradeId, setCounterToTradeId] = useState<string>();
  const [step, setStep] = useState<"partner" | "compose" | "picker" | "review">(initialIntentValid ? "compose" : "partner");
  const [editingTrade, setEditingTrade] = useState(initialIntentValid);
  const [editingSide, setEditingSide] = useState<"offer" | "request">("offer");
  const [assetTab, setAssetTab] = useState<"gold" | "properties" | "cards">("gold");
  const closeCounter = () => {
    setCounterToTradeId(undefined);
    setOfferGold(""); setRequestGold(""); setOffered([]); setRequested([]);
    setOfferedCards([]); setRequestedCards([]);
    setEditingTrade(false); setStep("partner");
  };
  useEffect(() => {
    if (!draftIntent) return;
    const validTarget = targets.some(target => target.id === draftIntent.recipientId);
    const validRequested = draftIntent.requestedPropertyTileIndices.filter(index => state.propertyOwnerships.some(entry => entry.tileIndex === index && entry.ownerId === draftIntent.recipientId));
    if (!validTarget || validRequested.length === 0) { onDraftIntentHandled?.(); return; }
    const hasDraft = Boolean(Number(offerGold) || Number(requestGold) || offered.length || requested.length || offeredCards.length || requestedCards.length || counterToTradeId);
    const alreadyApplied = recipientId === draftIntent.recipientId && validRequested.every(index => requested.includes(index));
    if (hasDraft && !alreadyApplied && !window.confirm("Bestehenden Handelsentwurf ersetzen?")) { onDraftIntentHandled?.(); return; }
    if (!alreadyApplied) {
      setCounterToTradeId(undefined); setRecipientId(draftIntent.recipientId);
      setOfferGold(""); setRequestGold(""); setOffered([]); setRequested(validRequested);
      setOfferedCards([]); setRequestedCards([]);
    }
    setEditingTrade(true); setStep("compose"); setEditingSide("offer"); setAssetTab("gold"); onDraftIntentHandled?.();
  }, [draftIntent?.id]);
  useEffect(() => {
    if (counterToTradeId && !state.trades.some(trade => trade.id === counterToTradeId && trade.status === "pending")) closeCounter();
  }, [counterToTradeId, state.trades]);
  const startCounter = (trade: TradeOffer) => {
    const template = getCounterOfferTemplate(trade);
    setCounterToTradeId(template.counterToTradeId); setRecipientId(template.recipientId);
    setOfferGold(String(template.offer.gold)); setRequestGold(String(template.request.gold));
    setOffered(template.offer.propertyTileIndices); setRequested(template.request.propertyTileIndices);
    setOfferedCards(template.offer.cardIds ?? []); setRequestedCards(template.request.cardIds ?? []);
    setEditingTrade(true); setStep("compose");
  };
  const recipient = state.players.find(player => player.id === recipientId);
  const ownProperties = state.propertyOwnerships.filter(entry => entry.ownerId === playerId);
  const recipientProperties = state.propertyOwnerships.filter(entry => entry.ownerId === recipientId);
  const ownCards = state.players.find(player => player.id === playerId)?.heldCards ?? [];
  const recipientCards = recipient?.heldCards ?? [];
  const received = state.trades.filter(trade => trade.recipientId === playerId && trade.status === "pending");
  const sent = state.trades.filter(trade => trade.proposerId === playerId && trade.status === "pending");
  const history = state.trades.filter(trade => (trade.proposerId === playerId || trade.recipientId === playerId) && trade.status !== "pending").slice(-3).reverse();
  const safe = ["waitingForRoll", "waitingForEndTurn"].includes(state.turnPhase) && !state.auction && !state.pendingPayment;
  const toggle = <T extends number | string,>(values: T[], value: T, update: (next: T[]) => void) => update(values.includes(value) ? values.filter(entry => entry !== value) : [...values, value]);
  const statusLabel = useMemo(() => ({ accepted: "Angenommen", rejected: "Abgelehnt", cancelled: "Ungültig", countered: "Durch Gegenangebot ersetzt" }) as const, []);
  const normalizeGold = (value: string) => { if (value === "") return ""; const amount = Number(value); return Number.isFinite(amount) ? String(Math.max(0, Math.trunc(amount))) : ""; };
  const offer = { gold: Number(offerGold) || 0, propertyTileIndices: offered, cardIds: offeredCards, relicIds: [] };
  const request = { gold: Number(requestGold) || 0, propertyTileIndices: requested, cardIds: requestedCards, relicIds: [] };
  const disabledReason = !safe ? "Handel ist in dieser Spielphase nicht möglich." : !connected ? "Keine Verbindung zum Spielserver." : undefined;
  const summarize = (assets: TradeOffer["offer"]) => [
    `${assets.gold} Gold`,
    `${assets.propertyTileIndices.length} Grundstück${assets.propertyTileIndices.length === 1 ? "" : "e"}`,
    ...(assets.cardIds?.length ? [`${assets.cardIds.length} Karte${assets.cardIds.length === 1 ? "" : "n"}`] : [])
  ].join(" · ");
  const renderOffer = (trade: TradeOffer, incoming: boolean, sticky = false) => <article className={`trade-card${incoming ? " trade-card--received" : ""}`} key={trade.id}>
    <strong>{incoming ? `HANDELSANGEBOT VON ${playerLabel(trade.proposerId).toUpperCase()}` : `An ${playerLabel(trade.recipientId)}`}</strong>
    {trade.counterToTradeId && <small>{incoming ? "Gegenangebot zu vorherigem Handel" : "Gegenangebot gesendet"}</small>}
    <div className="trade-side"><h4>Du gibst</h4><Assets state={state} assets={incoming ? trade.request : trade.offer} /></div>
    <div className="trade-side"><h4>Du erhältst</h4><Assets state={state} assets={incoming ? trade.offer : trade.request} /></div>
    <div className="trade-decisions">{incoming ? <>{!sticky && <><button className="controller-primary-action" disabled={!safe || !connected} onClick={() => onDecision("accept", trade.id)}>Annehmen</button><button className="trade-counter-action" disabled={!safe || !connected} onClick={() => startCounter(trade)}>Gegenangebot</button></>}<button disabled={!safe || !connected} onClick={() => onDecision("reject", trade.id)}>Ablehnen</button></> : <button disabled={!safe || !connected} onClick={() => onDecision("cancel", trade.id)}>Angebot zurückziehen</button>}</div>
    {disabledReason && <p className="controller-disabled-reason">{disabledReason}</p>}
  </article>;
  const renderPicker = (side: "offer" | "request") => {
    const giving = side === "offer";
    const properties = giving ? ownProperties : recipientProperties;
    const selectedProperties = giving ? offered : requested;
    const cards = giving ? ownCards : recipientCards;
    const selectedCards = giving ? offeredCards : requestedCards;
    const tabs = ["gold", ...(properties.length ? ["properties"] : []), ...(cards.length ? ["cards"] : [])] as ("gold" | "properties" | "cards")[];
    const currentTab = tabs.includes(assetTab) ? assetTab : tabs[0]!;
    return <section className="trade-asset-picker">
      <div className="trade-asset-tabs" role="tablist">{tabs.map(tab => <button type="button" role="tab" aria-selected={currentTab === tab} key={tab} onClick={() => setAssetTab(tab)}>{({ gold: "Gold", properties: "Grundstücke", cards: "Karten" })[tab]}</button>)}</div>
      {currentTab === "gold" && <label>Gold<input type="number" aria-label={giving ? "Du gibst Gold" : "Du erhältst Gold"} inputMode="numeric" min="0" step="1" placeholder="0" value={giving ? offerGold : requestGold} onChange={event => giving ? setOfferGold(normalizeGold(event.target.value)) : setRequestGold(normalizeGold(event.target.value))} /></label>}
      {currentTab === "properties" && <PropertyOptions state={state} properties={properties} selected={selectedProperties} onToggle={index => giving ? toggle(offered, index, setOffered) : toggle(requested, index, setRequested)} />}
      {currentTab === "cards" && <div className="trade-card-options">{cards.map(held => <label className="trade-held-option" key={held.cardId}><input type="checkbox" checked={selectedCards.includes(held.cardId)} onChange={() => giving ? toggle(offeredCards, held.cardId, setOfferedCards) : toggle(requestedCards, held.cardId, setRequestedCards)} />▤ {getCardDefinition(held.cardId).title}</label>)}</div>}
    </section>;
  };
  const openPicker = (side: "offer" | "request") => {
    const properties = side === "offer" ? ownProperties : recipientProperties;
    setEditingSide(side); setAssetTab(properties.length ? "properties" : "gold"); setStep("picker");
  };
  const renderComposeSide = (side: "offer" | "request") => {
    const giving = side === "offer";
    const assets = giving ? offer : request;
    const withoutGold = { ...assets, gold: 0 };
    return <section className="trade-compose-side" data-side={side}>
      <h3>{giving ? "DU GIBST" : "DU ERHÄLTST"}</h3>
      <label>Gold<input type="number" aria-label={giving ? "Du gibst Gold direkt" : "Du erhältst Gold direkt"} inputMode="numeric" min="0" step="1" placeholder="0" value={giving ? offerGold : requestGold} onChange={event => giving ? setOfferGold(normalizeGold(event.target.value)) : setRequestGold(normalizeGold(event.target.value))} /></label>
      <Assets state={state} assets={withoutGold}
        onRemoveProperty={index => giving ? setOffered(offered.filter(entry => entry !== index)) : setRequested(requested.filter(entry => entry !== index))}
        onRemoveCard={id => giving ? setOfferedCards(offeredCards.filter(entry => entry !== id)) : setRequestedCards(requestedCards.filter(entry => entry !== id))} />
      <button type="button" className="trade-add-assets" onClick={() => openPicker(side)}>+ HINZUFÜGEN</button>
    </section>;
  };
  const incoming = editingTrade ? undefined : received[0];
  const submitOffer = () => onCreate({ recipientId, offer, request, ...(counterToTradeId ? { counterToTradeId } : {}) });
  const primary = incoming
    ? { label: "Annehmen", onClick: () => onDecision("accept", incoming.id), disabled: !safe || !connected }
    : step === "partner" ? { label: "Weiter", onClick: () => setStep("compose") }
      : step === "compose" ? { label: "Angebot prüfen", onClick: () => setStep("review") }
        : step === "picker" ? { label: "Auswahl übernehmen", onClick: () => setStep("compose") }
          : { label: counterToTradeId ? "Gegenangebot senden" : "Angebot senden", onClick: submitOffer, disabled: !safe || !connected || !recipient };
  const secondary = incoming
    ? { label: "Gegenangebot", onClick: () => startCounter(incoming), disabled: !safe || !connected, tone: "secondary" as const }
    : step === "partner" ? undefined
      : { label: step === "compose" ? "Partner ändern" : step === "review" ? "Bearbeiten" : "Zur Übersicht", onClick: () => setStep(step === "compose" ? "partner" : "compose"), tone: "secondary" as const };
  return <section className="trade-panel has-context-action-bar">
    <header className="trade-panel__header"><div><small>SCHRITT {step === "partner" ? 1 : step === "review" ? 3 : 2} / 3</small><h2>{counterToTradeId ? "Gegenangebot" : "Handel"}</h2></div></header>
    {!editingTrade && received.length > 0 && <section className="trade-incoming" aria-label="Offene eingehende Angebote"><h3>ANGEBOT VON {playerLabel(received[0]!.proposerId).toUpperCase()}</h3>{received.map((trade, index) => renderOffer(trade, true, index === 0))}</section>}
    {targets.length > 0 ? <div className="trade-create">
      {disabledReason && <p className="controller-disabled-reason">{disabledReason}</p>}
      <section className="trade-step trade-partner-step" hidden={step !== "partner"}><label>HANDEL MIT<select value={recipientId} disabled={Boolean(counterToTradeId)} onChange={event => { setRecipientId(event.target.value); setRequested([]); setRequestedCards([]); }}>{targets.map(player => <option value={player.id} key={player.id}>{playerLabel(player.id)}</option>)}</select></label></section>
      {step !== "partner" && <div className="trade-sticky-summary" aria-live="polite"><div><small>DU GIBST</small><span>{summarize(offer)}</span></div><div><small>DU ERHÄLTST</small><span>{summarize(request)}</span></div></div>}
      <section className="trade-step trade-composer" hidden={step !== "compose"}><h3 className="trade-with">HANDEL MIT {playerLabel(recipientId).toUpperCase()}</h3>{renderComposeSide("offer")}{renderComposeSide("request")}</section>
      <section className="trade-step trade-picker" hidden={step !== "picker"}><h3>{editingSide === "offer" ? "ZU DU GIBST HINZUFÜGEN" : "ZU DU ERHÄLTST HINZUFÜGEN"}</h3>{renderPicker(editingSide)}</section>
      <section className="trade-step trade-review" hidden={step !== "review"}><h3>ANGEBOT PRÜFEN</h3><div className="trade-side"><h4>Du gibst</h4><Assets state={state} assets={offer} /></div><div className="trade-side"><h4>Du erhältst</h4><Assets state={state} assets={request} /></div>{counterToTradeId && <button type="button" className="trade-counter-cancel" onClick={closeCounter}>Gegenangebot abbrechen</button>}</section>
    </div> : <p>Kein Handelspartner verfügbar.</p>}
    <details className="trade-section trade-open-offers" open={sent.length > 0}><summary>OFFENE ANGEBOTE ({sent.length})</summary>{sent.map(trade => renderOffer(trade, false))}</details>
    <details className="trade-section trade-history"><summary>ABGESCHLOSSENE ANGEBOTE ({history.length})</summary>{history.map(trade => <article className="trade-history-row" key={trade.id}><strong>{statusLabel[trade.status as keyof typeof statusLabel]}</strong><span>{state.players.find(player => player.id === trade.proposerId)?.name} → {state.players.find(player => player.id === trade.recipientId)?.name}</span></article>)}</details>
    <ControllerActionBar primary={targets.length > 0 || incoming ? primary : undefined} secondary={secondary} label="Handelsaktionen" />
  </section>;
}

export interface TradeDraftIntent {
  id: number;
  recipientId: string;
  requestedPropertyTileIndices: number[];
}
