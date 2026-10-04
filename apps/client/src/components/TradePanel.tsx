import { useMemo, useState } from "react";
import { BOARD_TILES, getCardDefinition, type CreateTradeOfferRequest, type GameState, type TradeOffer } from "@valenor/shared";

function Assets({ trade, side }: { trade: TradeOffer; side: "offer" | "request" }) {
  const assets = trade[side];
  return (
    <div className="trade-assets">
      {assets.gold > 0 && <span>{assets.gold} Gold</span>}
      {assets.propertyTileIndices.map((index) => <span key={index}>{BOARD_TILES[index]?.name}</span>)}
      {(assets.cardIds ?? []).map((cardId) => <span key={cardId}>{getCardDefinition(cardId).title}</span>)}
      {assets.gold === 0 && assets.propertyTileIndices.length === 0 && !(assets.cardIds?.length) && <span>Kein Besitz</span>}
    </div>
  );
}

export function TradePanel({ state, playerId, connected, onCreate, onDecision }: {
  state: GameState;
  playerId: string;
  connected: boolean;
  onCreate: (request: CreateTradeOfferRequest) => void;
  onDecision: (action: "accept" | "reject" | "cancel", tradeId: string) => void;
}) {
  const targets = state.players.filter((player) => player.id !== playerId && player.type === "human" && !player.isBankrupt);
  const [recipientId, setRecipientId] = useState(targets[0]?.id ?? "");
  const [offerGold, setOfferGold] = useState("");
  const [requestGold, setRequestGold] = useState("");
  const [offered, setOffered] = useState<number[]>([]);
  const [requested, setRequested] = useState<number[]>([]);
  const [offeredCards, setOfferedCards] = useState<string[]>([]);
  const [requestedCards, setRequestedCards] = useState<string[]>([]);
  const recipient = state.players.find((player) => player.id === recipientId);
  const ownProperties = state.propertyOwnerships.filter((entry) => entry.ownerId === playerId);
  const recipientProperties = state.propertyOwnerships.filter((entry) => entry.ownerId === recipientId);
  const ownCards = state.players.find((player) => player.id === playerId)?.heldCards ?? [];
  const recipientCards = recipient?.heldCards ?? [];
  const received = state.trades.filter((trade) => trade.recipientId === playerId && trade.status === "pending");
  const sent = state.trades.filter((trade) => trade.proposerId === playerId && trade.status === "pending");
  const history = state.trades.filter((trade) => (trade.proposerId === playerId || trade.recipientId === playerId) && trade.status !== "pending").slice(-3).reverse();
  const safe = ["waitingForRoll", "waitingForEndTurn"].includes(state.turnPhase) && !state.auction && !state.pendingPayment;
  const toggle = (values: number[], value: number, update: (next: number[]) => void) => update(values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);
  const toggleCard = (values: string[], value: string, update: (next: string[]) => void) => update(values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);
  const statusLabel = useMemo(() => ({ accepted: "Angenommen", rejected: "Abgelehnt", cancelled: "Ungültig" }) as const, []);
  const normalizeGold = (value: string) => {
    if (value === "") return "";
    const amount = Number(value);
    return Number.isFinite(amount) ? String(Math.max(0, Math.trunc(amount))) : "";
  };

  return (
    <section className="trade-panel">
      <h2>Handel</h2>
      {received.length > 0 && <div className="trade-section"><h3>Erhaltene Angebote</h3>{received.map((trade) => {
        const proposer = state.players.find((player) => player.id === trade.proposerId)!;
        return <article className="trade-card trade-card--received" key={trade.id}><strong>HANDELSANGEBOT VON {proposer.name.toUpperCase()}</strong><small>Bietet</small><Assets trade={trade} side="offer" /><small>Möchte</small><Assets trade={trade} side="request" /><div><button disabled={!safe || !connected} onClick={() => onDecision("accept", trade.id)}>Annehmen</button><button disabled={!safe || !connected} onClick={() => onDecision("reject", trade.id)}>Ablehnen</button></div></article>;
      })}</div>}
      {sent.length > 0 && <div className="trade-section"><h3>Gesendete Angebote</h3>{sent.map((trade) => <article className="trade-card" key={trade.id}><strong>An {state.players.find((player) => player.id === trade.recipientId)?.name}</strong><Assets trade={trade} side="offer" /><button disabled={!safe || !connected} onClick={() => onDecision("cancel", trade.id)}>Angebot zurückziehen</button></article>)}</div>}
      {targets.length > 0 && (
        <details className="trade-create">
          <summary>Handel anbieten</summary>
          {!safe && <p>Handel ist in dieser Spielphase nicht möglich.</p>}
          <label>Handelspartner<select value={recipientId} onChange={(event) => { setRecipientId(event.target.value); setRequested([]); setRequestedCards([]); }}>{targets.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>
          <label>Du bietest Gold<input type="number" inputMode="numeric" min="0" step="1" placeholder="0" value={offerGold} onChange={(event) => setOfferGold(normalizeGold(event.target.value))} /></label>
          <div className="trade-property-options">{ownProperties.map((ownership) => <label key={ownership.tileIndex}><input type="checkbox" checked={offered.includes(ownership.tileIndex)} onChange={() => toggle(offered, ownership.tileIndex, setOffered)} />{BOARD_TILES[ownership.tileIndex]?.name}{ownership.mortgaged ? " · verpfändet" : ""}</label>)}</div>
          <div className="trade-property-options">{ownCards.map((held) => <label key={held.cardId}><input type="checkbox" checked={offeredCards.includes(held.cardId)} onChange={() => toggleCard(offeredCards, held.cardId, setOfferedCards)} />{getCardDefinition(held.cardId).title}</label>)}</div>
          <label>Du möchtest Gold<input type="number" inputMode="numeric" min="0" step="1" placeholder="0" value={requestGold} onChange={(event) => setRequestGold(normalizeGold(event.target.value))} /></label>
          <div className="trade-property-options">{recipientProperties.map((ownership) => <label key={ownership.tileIndex}><input type="checkbox" checked={requested.includes(ownership.tileIndex)} onChange={() => toggle(requested, ownership.tileIndex, setRequested)} />{BOARD_TILES[ownership.tileIndex]?.name}{ownership.mortgaged ? " · verpfändet" : ""}</label>)}</div>
          <div className="trade-property-options">{recipientCards.map((held) => <label key={held.cardId}><input type="checkbox" checked={requestedCards.includes(held.cardId)} onChange={() => toggleCard(requestedCards, held.cardId, setRequestedCards)} />{getCardDefinition(held.cardId).title}</label>)}</div>
          <button disabled={!safe || !connected || !recipient} onClick={() => onCreate({ recipientId, offer: { gold: Number(offerGold) || 0, propertyTileIndices: offered, cardIds: offeredCards }, request: { gold: Number(requestGold) || 0, propertyTileIndices: requested, cardIds: requestedCards } })}>Angebot senden</button>
        </details>
      )}
      {history.length > 0 && <div className="trade-section"><h3>Abgeschlossen</h3>{history.map((trade) => <p key={trade.id}>{statusLabel[trade.status as keyof typeof statusLabel]}</p>)}</div>}
    </section>
  );
}
