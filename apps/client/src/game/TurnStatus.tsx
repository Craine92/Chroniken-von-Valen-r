import { BOARD_TILES, calculatePropertyRent, getBuildingName, type BoardTileType, type GameState } from "@valenor/shared";
import { PropertyCard } from "../components/PropertyCard";

const TYPE_LABELS: Record<BoardTileType, string> = {
  start: "Runentor", property: "Grundstück", adventure: "Abenteuer", fate: "Schicksal",
  tax: "Abgabe", harbor: "Hafen", utility: "Versorgung", dungeon: "Kerker",
  rest: "Ruheort", goToDungeon: "Kerkerpfad"
};

export function hasTurnStatusContent(state: GameState): boolean {
  if (state.turnPhase === "determiningOrder") return true;
  if (!state.players.some((player) => player.id === state.currentPlayerId)) return false;
  const action = state.lastTurnAction;
  const hasNotice = Boolean(
    action?.kind === "thirdDouble"
    || action?.kind === "sentToDungeon"
    || action?.kind === "dungeonEscaped"
  );
  const hasDice = Boolean(state.lastDiceRoll && ["rolling", "dungeonRolling", "moving", "cardMoving"].includes(state.turnPhase));
  const hasLanding = Boolean(state.lastMovement?.landedTile && ["landed", "waitingForEndTurn"].includes(state.turnPhase));
  const hasEconomy = Boolean((state.auction || state.lastMovement?.landedTile?.economy) && ["propertyDecision", "auction"].includes(state.turnPhase));
  return state.turnPhase === "dungeonDecision" || hasNotice || hasDice || hasLanding || hasEconomy || Boolean(state.turnPhase === "paymentRequired" && state.pendingPayment);
}

export function TurnStatus({ state }: { state: GameState }) {
  const current = state.players.find((player) => player.id === state.currentPlayerId);
  if (state.turnPhase === "determiningOrder") {
    return (
      <section className="order-overlay">
        <p className="eyebrow">Das Schicksal entscheidet</p>
        <h2>{state.orderRollTargetCount > 1 ? "Das Schicksal ist unentschieden …" : "Die Reihenfolge wird bestimmt"}</h2>
        {state.orderRollTargetCount > 1 && (
          <p className="order-tie">{state.orderContenders.map((id) => state.players.find((player) => player.id === id)?.name).join(" und ")} würfeln erneut.</p>
        )}
        <div className="order-rolls">
          {state.players.map((player) => {
            const entry = state.orderRolls.find((candidate) => candidate.playerId === player.id);
            const latest = entry?.rolls.at(-1);
            const waiting = state.orderContenders.includes(player.id) && (entry?.rolls.length ?? 0) < state.orderRollTargetCount;
            return (
              <article key={player.id} className={`order-player order-player--${player.color}`}>
                <strong>{player.name}</strong>
                {latest ? <span>⚄ {latest.die1} + {latest.die2} <b>{latest.total}</b></span> : <span>{waiting ? "wartet …" : "–"}</span>}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  if (!current) return null;
  const turnAction = state.lastTurnAction;
  const actionPlayer = turnAction ? state.players.find((player) => player.id === turnAction.playerId) : undefined;
  const landed = state.lastMovement?.landedTile;
  const auctionTile = state.auction ? BOARD_TILES[state.auction.tileIndex] : undefined;
  const shownTile = auctionTile ?? landed;
  const ownership = shownTile ? state.propertyOwnerships.find((entry) => entry.tileIndex === shownTile.index) : undefined;
  const owner = ownership ? state.players.find((player) => player.id === ownership.ownerId) : undefined;
  const landedRent = landed?.type === "property" && ownership && owner
    ? calculatePropertyRent(state.propertyOwnerships, landed, owner.id)
    : undefined;
  return (
    <section className="turn-overlay">
      {state.turnPhase === "dungeonDecision" && (
        <aside className="dungeon-status"><small>DUNKLER KERKER</small><strong>{current.name}</strong><em>{current.name} sitzt im Dunklen Kerker.</em><span>Versuch {current.dungeon.failedAttempts + 1} / 3</span></aside>
      )}
      {turnAction?.kind === "thirdDouble" && (
        <aside className="dungeon-notice"><small>DAS SCHICKSAL WENDET SICH</small><strong>Drei Pasche in Folge.</strong><span>{actionPlayer?.name} wird in den Dunklen Kerker gebracht.</span></aside>
      )}
      {turnAction?.kind === "sentToDungeon" && (
        <aside className="dungeon-notice"><small>IN DEN KERKER</small><strong>Die Wachen schließen die Tore.</strong><span>{actionPlayer?.name} wird in den Dunklen Kerker gebracht.</span></aside>
      )}
      {turnAction?.kind === "dungeonEscaped" && (
        <aside className="double-notice"><strong>KERKER-PASCH</strong><span>{actionPlayer?.name} ist frei und zieht mit diesem Wurf.</span></aside>
      )}
      {state.lastDiceRoll && ["rolling", "dungeonRolling", "moving", "cardMoving"].includes(state.turnPhase) && (
        <div className="dice-result"><span>{state.lastDiceRoll.die1}</span><i>+</i><span>{state.lastDiceRoll.die2}</span><b>{state.lastDiceRoll.total}</b></div>
      )}
      {landed && ["landed", "waitingForEndTurn"].includes(state.turnPhase) && (
        <div className="landed-card">
          <small>GELANDET AUF FELD {landed.index}</small>
          <strong>{landed.name}</strong>
          <span>{landed.type === "property" && landed.propertyGroup ? `${landed.propertyGroup} · ${TYPE_LABELS[landed.type]}` : TYPE_LABELS[landed.type]}</span>
          {landed.economy && <b>{landed.economy.purchasePrice} GOLD</b>}
          {landed.type === "property" && landed.region && ownership && ownership.buildingLevel > 0 && (
            <><b>{getBuildingName(landed.region, ownership.buildingLevel)}</b><em>Miete: {landedRent} Gold</em></>
          )}
          {state.lastMovement?.passedStart && <em>Das Runentor wurde passiert.</em>}
          {landed.type === "dungeon" && !current.dungeon.inDungeon && <em>Nur zu Besuch · {current.name} ist frei.</em>}
        </div>
      )}
      {shownTile?.economy && ["propertyDecision", "auction"].includes(state.turnPhase) && (
        <div className="economy-overlay">
          <PropertyCard tile={shownTile} {...(ownership ? { ownership } : {})} {...(owner ? { owner } : {})} />
          {state.turnPhase === "propertyDecision" ? (
            <p>{current.name} entscheidet über den Kauf.</p>
          ) : (
            <div className="auction-status">
              <small>OFFENE AUKTION</small>
              <strong>{state.auction?.currentBid ?? 0} Gold</strong>
              <span>{state.auction?.highestBidderId ? `Höchstgebot: ${state.players.find((player) => player.id === state.auction?.highestBidderId)?.name}` : "Noch kein Gebot"}</span>
              {(state.auction?.pausedForPlayerIds.length ?? 0) > 0 && <em>Auktion pausiert · Wiederverbindung wird erwartet</em>}
            </div>
          )}
        </div>
      )}
      {state.turnPhase === "paymentRequired" && state.pendingPayment && (
        <div className="payment-required"><strong>Zahlung ausstehend</strong><span>{state.pendingPayment.amount} Gold · {state.pendingPayment.reason}</span></div>
      )}
    </section>
  );
}
