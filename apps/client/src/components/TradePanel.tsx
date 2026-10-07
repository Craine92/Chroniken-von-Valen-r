import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BOARD_TILES, RELIC_DEFINITIONS, isRelicTradeBound, getCardDefinition, getPropertyGroup, getBuildingName, type CreateTradeOfferRequest, type GameState, type TradeOffer, type PropertyOwnership, type RelicId } from "@valenor/shared";
import { RelicIcon } from "./RelicIcon";

export function getCounterOfferTemplate(trade: TradeOffer): CreateTradeOfferRequest {
  const copy = (assets: TradeOffer["offer"]) => ({ ...assets, propertyTileIndices: [...assets.propertyTileIndices], cardIds: [...(assets.cardIds ?? [])], relicIds: [...(assets.relicIds ?? [])] });
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

function Assets({ state, assets }: { state: GameState; assets: TradeOffer["offer"] }) {
  return <div className="trade-assets">
    {assets.gold > 0 && <span className="trade-gold">✦ {assets.gold} Gold</span>}
    {assets.propertyTileIndices.map(index => <div className="trade-property" key={index} style={{ "--property-group-accent": propertyIdentity(index).accent } as CSSProperties}><PropertyLabel state={state} index={index} /></div>)}
    {(assets.cardIds ?? []).map(cardId => <span className="trade-held-card" key={cardId}>▤ {getCardDefinition(cardId).title}</span>)}
    {(assets.relicIds ?? []).map(id => <span className="trade-relic" key={id}><RelicIcon id={id} /><strong>{RELIC_DEFINITIONS[id].name}</strong></span>)}
    {assets.gold === 0 && assets.propertyTileIndices.length === 0 && !assets.cardIds?.length && !assets.relicIds?.length && <span className="trade-empty">Keine Objekte ausgewählt</span>}
  </div>;
}

function PropertyOptions({ state, properties, selected, onToggle }: { state: GameState; properties: PropertyOwnership[]; selected: number[]; onToggle: (index: number) => void }) {
  const groups = [...new Set(properties.map(entry => propertyIdentity(entry.tileIndex).label))];
  return <div className="trade-property-options">{groups.map(label => {
    const members = properties.filter(entry => propertyIdentity(entry.tileIndex).label === label);
    const visual = propertyIdentity(members[0]!.tileIndex);
    return <fieldset className="trade-region" key={label} style={{ "--property-group-accent": visual.accent } as CSSProperties}><legend><span aria-hidden="true">{visual.sigil}</span> {label}</legend>{members.map(entry => <label className={`trade-property${selected.includes(entry.tileIndex) ? " is-selected" : ""}`} key={entry.tileIndex}><input type="checkbox" checked={selected.includes(entry.tileIndex)} onChange={() => onToggle(entry.tileIndex)} /><PropertyLabel state={state} index={entry.tileIndex} /><span className="trade-property__check" aria-hidden="true">{selected.includes(entry.tileIndex) ? "✓" : "+"}</span></label>)}</fieldset>;
  })}{properties.length === 0 && <p className="trade-empty">Keine Grundstücke vorhanden.</p>}</div>;
}

function RelicOptions({ state, ownerId, selected, onToggle }: { state: GameState; ownerId: string; selected: RelicId[]; onToggle: (id: RelicId) => void }) {
  const owner = state.players.find(player => player.id === ownerId);
  return <fieldset className="trade-relic-options"><legend>RELIKTE</legend>{owner?.relics?.length ? owner.relics.map(id => {
    const bound = isRelicTradeBound(state, owner, id);
    return <label className={`trade-relic${bound ? " trade-relic--bound" : ""}`} key={id}>
      <input type="checkbox" aria-label={RELIC_DEFINITIONS[id].name} disabled={bound} checked={!bound && selected.includes(id)} onChange={() => onToggle(id)} />
      <RelicIcon id={id} /><span><strong>{RELIC_DEFINITIONS[id].name}</strong><small>{bound ? "AKTIV · nicht handelbar" : RELIC_DEFINITIONS[id].shortDescription}</small></span>
    </label>;
  }) : <p className="trade-empty">Keine Relikte vorhanden.</p>}</fieldset>;
}

export function TradePanel({ state, playerId, connected, onCreate, onDecision }: {
  state: GameState; playerId: string; connected: boolean;
  onCreate: (request: CreateTradeOfferRequest) => void;
  onDecision: (action: "accept" | "reject" | "cancel", tradeId: string) => void;
}) {
  const targets = state.players.filter(player => player.id !== playerId && player.type === "human" && !player.isBankrupt);
  const [recipientId, setRecipientId] = useState(targets[0]?.id ?? "");
  const [offerGold, setOfferGold] = useState("");
  const [requestGold, setRequestGold] = useState("");
  const [offered, setOffered] = useState<number[]>([]);
  const [requested, setRequested] = useState<number[]>([]);
  const [offeredCards, setOfferedCards] = useState<string[]>([]);
  const [requestedCards, setRequestedCards] = useState<string[]>([]);
  const [offeredRelics, setOfferedRelics] = useState<RelicId[]>([]);
  const [requestedRelics, setRequestedRelics] = useState<RelicId[]>([]);
  const [counterToTradeId, setCounterToTradeId] = useState<string>();
  const editor = useRef<HTMLDetailsElement>(null);
  const closeCounter = () => {
    setCounterToTradeId(undefined);
    setOfferGold(""); setRequestGold(""); setOffered([]); setRequested([]);
    setOfferedCards([]); setRequestedCards([]); setOfferedRelics([]); setRequestedRelics([]);
    if (editor.current) editor.current.open = false;
  };
  useEffect(() => {
    if (counterToTradeId && !state.trades.some(trade => trade.id === counterToTradeId && trade.status === "pending")) closeCounter();
  }, [counterToTradeId, state.trades]);
  const startCounter = (trade: TradeOffer) => {
    const template = getCounterOfferTemplate(trade);
    setCounterToTradeId(template.counterToTradeId); setRecipientId(template.recipientId);
    setOfferGold(String(template.offer.gold)); setRequestGold(String(template.request.gold));
    setOffered(template.offer.propertyTileIndices); setRequested(template.request.propertyTileIndices);
    setOfferedCards(template.offer.cardIds ?? []); setRequestedCards(template.request.cardIds ?? []);
    setOfferedRelics(template.offer.relicIds ?? []); setRequestedRelics(template.request.relicIds ?? []);
    if (editor.current) { editor.current.open = true; editor.current.scrollIntoView({ block: "start", behavior: "smooth" }); }
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
  const availableRelics = (ownerId: string, selected: RelicId[]) => {
    const owner = state.players.find(player => player.id === ownerId);
    return selected.filter(id => owner?.relics?.includes(id) && !isRelicTradeBound(state, owner, id));
  };
  const offer = { gold: Number(offerGold) || 0, propertyTileIndices: offered, cardIds: offeredCards, relicIds: availableRelics(playerId, offeredRelics) };
  const request = { gold: Number(requestGold) || 0, propertyTileIndices: requested, cardIds: requestedCards, relicIds: availableRelics(recipientId, requestedRelics) };
  const disabledReason = !safe ? "Handel ist in dieser Spielphase nicht möglich." : !connected ? "Keine Verbindung zum Spielserver." : undefined;
  const renderOffer = (trade: TradeOffer, incoming: boolean) => <article className={`trade-card${incoming ? " trade-card--received" : ""}`} key={trade.id}>
    <strong>{incoming ? `HANDELSANGEBOT VON ${state.players.find(player => player.id === trade.proposerId)?.name.toUpperCase()}` : `An ${state.players.find(player => player.id === trade.recipientId)?.name}`}</strong>
    {trade.counterToTradeId && <small>{incoming ? "Gegenangebot zu vorherigem Handel" : "Gegenangebot gesendet"}</small>}
    <div className="trade-side"><h4>Du gibst</h4><Assets state={state} assets={incoming ? trade.request : trade.offer} /></div>
    <div className="trade-side"><h4>Du erhältst</h4><Assets state={state} assets={incoming ? trade.offer : trade.request} /></div>
    <div className="trade-decisions">{incoming ? <><button className="controller-primary-action" disabled={!safe || !connected} onClick={() => onDecision("accept", trade.id)}>Annehmen</button><button className="trade-counter-action" disabled={!safe || !connected} onClick={() => startCounter(trade)}>Gegenangebot</button><button disabled={!safe || !connected} onClick={() => onDecision("reject", trade.id)}>Ablehnen</button></> : <button disabled={!safe || !connected} onClick={() => onDecision("cancel", trade.id)}>Angebot zurückziehen</button>}</div>
    {disabledReason && <p className="controller-disabled-reason">{disabledReason}</p>}
  </article>;
  return <section className="trade-panel">
    <h2>Handel</h2>
    {received.length > 0 && <div className="trade-section"><h3>Erhaltene Angebote</h3>{received.map(trade => renderOffer(trade, true))}</div>}
    {sent.length > 0 && <div className="trade-section"><h3>Gesendete Angebote</h3>{sent.map(trade => renderOffer(trade, false))}</div>}
    {targets.length > 0 ? <details className="trade-create" ref={editor}>
      <summary>{counterToTradeId ? `GEGENANGEBOT AN ${recipient?.name.toUpperCase() ?? ""}` : "Handel anbieten"}</summary>
      {counterToTradeId && <p>Passe das ursprüngliche Angebot an.</p>}
      {disabledReason && <p className="controller-disabled-reason">{disabledReason}</p>}
      <label>Handelspartner<select value={recipientId} disabled={Boolean(counterToTradeId)} onChange={event => { setRecipientId(event.target.value); setRequested([]); setRequestedCards([]); setRequestedRelics([]); }}>{targets.map(player => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>
      <section className="trade-side"><h3>Du gibst</h3><label>Gold<input type="number" aria-label="Du gibst Gold" inputMode="numeric" min="0" step="1" placeholder="0" value={offerGold} onChange={event => setOfferGold(normalizeGold(event.target.value))} /></label><PropertyOptions state={state} properties={ownProperties} selected={offered} onToggle={index => toggle(offered, index, setOffered)} />{ownCards.map(held => <label className="trade-held-option" key={held.cardId}><input type="checkbox" checked={offeredCards.includes(held.cardId)} onChange={() => toggle(offeredCards, held.cardId, setOfferedCards)} />▤ {getCardDefinition(held.cardId).title}</label>)}<RelicOptions state={state} ownerId={playerId} selected={offer.relicIds} onToggle={id => toggle(offeredRelics, id, setOfferedRelics)} /></section>
      <section className="trade-side"><h3>Du erhältst</h3><label>Gold<input type="number" aria-label="Du erhältst Gold" inputMode="numeric" min="0" step="1" placeholder="0" value={requestGold} onChange={event => setRequestGold(normalizeGold(event.target.value))} /></label><PropertyOptions state={state} properties={recipientProperties} selected={requested} onToggle={index => toggle(requested, index, setRequested)} />{recipientCards.map(held => <label className="trade-held-option" key={held.cardId}><input type="checkbox" checked={requestedCards.includes(held.cardId)} onChange={() => toggle(requestedCards, held.cardId, setRequestedCards)} />▤ {getCardDefinition(held.cardId).title}</label>)}<RelicOptions state={state} ownerId={recipientId} selected={request.relicIds} onToggle={id => toggle(requestedRelics, id, setRequestedRelics)} /></section>
      <div className="trade-summary" aria-live="polite"><h3>Dein Angebot im Überblick</h3><div className="trade-side"><h4>Du gibst</h4><Assets state={state} assets={offer} /></div><div className="trade-side"><h4>Du erhältst</h4><Assets state={state} assets={request} /></div></div>
      <button className="controller-primary-action" disabled={!safe || !connected || !recipient} onClick={() => onCreate({ recipientId, offer, request, ...(counterToTradeId ? { counterToTradeId } : {}) })}>{counterToTradeId ? "Gegenangebot senden" : "Angebot senden"}</button>
      {counterToTradeId && <button type="button" className="trade-counter-cancel" onClick={closeCounter}>Abbrechen</button>}
    </details> : <p>Kein Handelspartner verfügbar.</p>}
    {history.length > 0 && <details className="trade-section trade-history"><summary>Abgeschlossene Angebote</summary>{history.map(trade => <article className="trade-card" key={trade.id}><strong>{statusLabel[trade.status as keyof typeof statusLabel]}</strong><span>{state.players.find(player => player.id === trade.proposerId)?.name} → {state.players.find(player => player.id === trade.recipientId)?.name}</span><div className="trade-side"><h4>Du gibst</h4><Assets state={state} assets={trade.proposerId === playerId ? trade.offer : trade.request} /></div><div className="trade-side"><h4>Du erhältst</h4><Assets state={state} assets={trade.proposerId === playerId ? trade.request : trade.offer} /></div></article>)}</details>}
  </section>;
}
