import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BOARD_TILES,
  DUNGEON_RELEASE_COST,
  canSellBuilding,
  canMortgageProperty,
  getCardDefinition,
  getEffectivePurchasePrice,
  RELIC_DEFINITIONS,
  SOCKET_EVENTS,
  type GameState,
  type GameRoom,
  type PlayerColor,
  type TavernChoice,
  type TavernState,
  type CreateTradeOfferRequest,
  type JoinRoomRequest,
  type Player,
  type PropertyGroupId
} from "@valenor/shared";
import type { RelicId } from "@valenor/shared";
import { Ambience } from "../components/Ambience";
import { BrandMark } from "../components/BrandMark";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { PropertyCard } from "../components/PropertyCard";
import { ControllerPossessions } from "../components/ControllerPossessions";
import { ControllerQuestLog } from "../components/ControllerQuestLog";
import { TradePanel } from "../components/TradePanel";
import { CardReveal } from "../components/CardReveal";
import { QuickGameClockDisplay } from "../components/QuickGameClockDisplay";
import { GameResultPanel } from "../components/GameResultPanel";
import { createValenorSocket } from "../lib/socket";
import { MobileFeedbackToast, useMobileFeedback } from "../mobile/MobileFeedback";
import { MobileLiveEvents } from "../components/MobileLiveEvents";
import { PlayerColorPicker } from "../components/PlayerColorPicker";

function normalizeRoomCode(value: string): string {
  const lettersAndNumbers = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!lettersAndNumbers.startsWith("VAL")) return value.toUpperCase().slice(0, 8);
  const digits = lettersAndNumbers.slice(3, 7);
  return digits ? `VAL-${digits}` : "VAL-";
}

export const BANKRUPTCY_CONFIRMATION = "Wirklich aufgeben? Dein Besitz wird übertragen und du scheidest aus der Chronik aus.";

export function TavernDecisionPanel({ tavern, connected, onChoose }: { tavern: TavernState; connected: boolean; onChoose: (choice: TavernChoice) => void }) {
  return <section className={`controller-tavern controller-tavern--${tavern.status}`} aria-live="polite">
    <small>TAVERNE AM WELTENWEG</small>
    {tavern.status === "decision" ? <><h2>Der Weltenweg-Pott</h2><p>Im Pott liegen</p><strong>{tavern.pot} GOLD</strong><p>Sicher mitnehmen oder alles aufs Spiel setzen?</p>
      <button type="button" className="controller-primary-action" disabled={!connected} onClick={() => onChoose("take")}>{tavern.pot} GOLD NEHMEN</button>
      <button type="button" className="controller-tavern__risk" disabled={!connected} onClick={() => onChoose("gamble")}>🎲 DOPPELT ODER NIX</button>
      <p className="controller-tavern__odds">1–3: kein Gewinn · 4–6: doppelter Pott</p></>
      : tavern.status === "rolling" ? <><h2>Doppelt oder Nix!</h2><span className="tavern-die tavern-die--rolling" aria-label="Tavernenwürfel rollt">⚄</span><p>{tavern.pot} Gold stehen auf dem Spiel.</p></>
        : <><h2>{tavern.choice === "take" ? "Pott gesichert!" : tavern.payout ? "DOPPELT!" : "VERZOCKT!"}</h2>{tavern.die && <span className="tavern-die" aria-label={`Tavernenwürfel ${tavern.die}`}>{["","⚀","⚁","⚂","⚃","⚄","⚅"][tavern.die]}</span>}
          <strong>{tavern.payout ? `+${tavern.payout} GOLD` : `${tavern.pot} GOLD`}</strong>{!tavern.payout && <p>Der Pott bleibt bei {tavern.pot} Gold.</p>}</>}
  </section>;
}

export function confirmBankruptcy(confirmAction: (message: string) => boolean = window.confirm): boolean {
  return confirmAction(BANKRUPTCY_CONFIRMATION);
}

export function PaymentManagement({
  payment,
  playerGold,
  hasLegalPaymentAction,
  connected,
  onSettle,
  onDeclareBankruptcy
}: {
  payment: NonNullable<GameState["pendingPayment"]>;
  playerGold: number;
  hasLegalPaymentAction: boolean;
  connected: boolean;
  onSettle: () => void;
  onDeclareBankruptcy: () => void;
}) {
  const missingGold = Math.max(0, payment.amount - playerGold);
  return (
    <section className="payment-management">
      <small>OFFENE FORDERUNG</small>
      <strong>{payment.amount} Gold · {payment.reason}</strong>
      {missingGold > 0 ? (
        <p>Dir fehlen {missingGold} Gold. {hasLegalPaymentAction ? "Verkaufe Bauwerke oder beleihe Besitz, um Gold zu erhalten." : "Dein verfügbares Gold reicht weiterhin nicht aus."}</p>
      ) : (
        <button className="turn-action-button" type="button" disabled={!connected} onClick={onSettle}>Forderung begleichen</button>
      )}
      <button className="bankruptcy-button" type="button" disabled={!connected} onClick={onDeclareBankruptcy}>Bankrott erklären</button>
    </section>
  );
}

export function BankruptcySpectator({ gameState, player, connected }: { gameState: GameState; player: Player; connected: boolean }) {
  const current = gameState.players.find((candidate) => candidate.id === gameState.currentPlayerId);
  return (
    <main className={`controller-page controller-page--active player-theme--${player.color}`}>
      <Ambience />
      <section className="controller-card controller-card--started end-controller">
        <BrandMark compact />
        <p className="eyebrow">Deine Chronik endet hier</p>
        <h1>Du bist ausgeschieden.</h1>
        <p>Zuschauerstatus · {current?.name ?? "Ein Gefährte"} ist am Zug.</p>
        <div className="spectator-players">{gameState.players.filter((entry) => !entry.isBankrupt).map((entry) => <span key={entry.id}>{entry.name} · {entry.gold} Gold</span>)}</div>
        <ConnectionBadge connected={connected} />
      </section>
    </main>
  );
}

export function DungeonDecisionPanel({
  failedAttempts,
  gold,
  connected,
  onRoll,
  onPay,
  hasDungeonCard = false,
  onUseCard
}: {
  failedAttempts: number;
  gold: number;
  connected: boolean;
  onRoll: () => void;
  onPay: () => void;
  hasDungeonCard?: boolean;
  onUseCard?: () => void;
}) {
  const attempt = Math.min(3, failedAttempts + 1);
  const canPay = gold >= DUNGEON_RELEASE_COST;
  return (
    <section className="dungeon-decision">
      <p className="eyebrow">Dunkler Kerker</p>
      <h2>Die Tore sind verschlossen.</h2>
      <strong>Versuch {attempt} / 3</strong>
      <span>Dein Gold: {gold}</span>
      <button className="turn-action-button dungeon-roll-button" type="button" disabled={!connected} onClick={onRoll}>Pasch versuchen</button>
      {hasDungeonCard && <button className="turn-action-button" type="button" disabled={!connected} onClick={onUseCard}>Kerkersiegel verwenden</button>}
      <button className="economy-secondary" type="button" disabled={!connected || !canPay} onClick={onPay}>{DUNGEON_RELEASE_COST} Gold zahlen</button>
      {!canPay && <em>Nicht genügend Gold.</em>}
      <small>Ein Pasch öffnet die Tore. Nach dem dritten Fehlversuch wird die Gebühr fällig.</small>
    </section>
  );
}

export function DungeonOutcomeNotice({ action }: { action: NonNullable<GameState["lastTurnAction"]> }) {
  if (action.kind === "thirdDouble") return <p className="dungeon-fate-copy"><strong>Drei Pasche.</strong> Die Kerkerwachen erwarten dich.</p>;
  if (action.kind === "sentToDungeon") return <p className="dungeon-fate-copy"><strong>In den Kerker.</strong> Die Tore schließen sich hinter dir.</p>;
  if (action.kind === "dungeonEscaped") return <p className="double-copy"><strong>Kerker-Pasch!</strong> Du bist frei und ziehst mit diesem Wurf.</p>;
  if (action.kind === "dungeonFailed") return <p className="dungeon-fate-copy"><strong>Kein Pasch.</strong> {action.attempt && action.attempt < 3 ? "Du bleibst im Kerker." : "Die Kerkergebühr wird fällig."}</p>;
  if (action.kind === "dungeonPaid") return <p className="double-copy"><strong>Du bist frei.</strong> {action.attempt === 3 ? "Du ziehst mit dem bereits gewürfelten Kerkerwurf." : "Würfle deinen normalen Zug."}</p>;
  return null;
}

export function MobileTurnNotice({ currentName, own }: { currentName: string; own: boolean }) {
  return <aside className={`mobile-turn-notice ${own ? "is-own-turn" : ""}`} role="status"><strong>{own ? "DU BIST AM ZUG" : `${currentName} ist am Zug`}</strong><span>{own ? "Würfle oder führe deine Aktion aus." : "Dein Zug folgt später."}</span></aside>;
}

export function MobileTradeNotice({ proposerName }: { proposerName: string }) {
  return <aside className="mobile-trade-notice" role="alert"><strong>HANDELSANGEBOT VON {proposerName.toUpperCase()}</strong><a href="#controller-trade">Ansehen</a></aside>;
}

export function RuneStoneDecisionPanel({ connected, onReroll, onKeep }: { connected: boolean; onReroll: () => void; onKeep: () => void }) {
  return <section className="controller-rune-decision" aria-label="Runenstein-Entscheidung">
    <strong>{RELIC_DEFINITIONS.runestone.name.toUpperCase()} VERWENDEN</strong>
    <p>Der neue Wurf ersetzt diesen Wurf vollständig.</p>
    <button className="controller-primary-action" type="button" disabled={!connected} onClick={onReroll}>Neu würfeln</button>
    <button type="button" disabled={!connected} onClick={onKeep}>Wurf behalten</button>
  </section>;
}

export function ControllerPage() {
  const socket = useMemo(createValenorSocket, []);
  const initialRoom = new URLSearchParams(window.location.search).get("room") ?? "";
  const [roomCode, setRoomCode] = useState(normalizeRoomCode(initialRoom));
  const [name, setName] = useState("");
  const [player, setPlayer] = useState<Player>();
  const [connected, setConnected] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [signalSent, setSignalSent] = useState(false);
  const [gameState, setGameState] = useState<GameState>();
  const [room, setRoom] = useState<GameRoom>();
  const [colorPending, setColorPending] = useState(false);
  const [selectedPropertyGroupId, setSelectedPropertyGroupId] = useState<PropertyGroupId>();
  const [controllerTab, setControllerTab] = useState("action");
  useEffect(() => {
    if (gameState?.turnPhase === "tavernDecision" && gameState.tavern?.playerId === player?.id) setControllerTab("action");
  }, [gameState?.turnPhase, gameState?.tavern?.id, player?.id]);
  useEffect(() => {
    const updateTab = () => {
      const tab = window.location.hash.replace("#controller-", "");
      setControllerTab(["action", "property", "trade", "journal"].includes(tab) ? tab : "action");
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    updateTab();
    window.addEventListener("hashchange", updateTab);
    return () => window.removeEventListener("hashchange", updateTab);
  }, []);
  const mobileFeedback = useMobileFeedback(gameState, player?.id);
  const [feedbackHeight, setFeedbackHeight] = useState(0);
  const playerRef = useRef<Player | undefined>(undefined);
  const nameRef = useRef("");
  const roomRef = useRef(roomCode);
  const signalTimer = useRef<number | undefined>(undefined);
  const incomingTradeCount = gameState?.trades.filter((trade) => trade.recipientId === player?.id && trade.status === "pending").length ?? 0;

  const join = (requestedName: string, reconnecting = false) => {
    const normalizedRoom = roomRef.current.trim().toUpperCase();
    const token = localStorage.getItem(`valenor:player-token:${normalizedRoom}`);
    const request: JoinRoomRequest = {
      roomCode: normalizedRoom,
      name: requestedName,
      ...(token ? { playerToken: token } : {})
    };

    setJoining(true);
    socket.emit(SOCKET_EVENTS.roomJoin, request, (result) => {
      setJoining(false);
      if (!result.ok || !result.player || !result.playerToken) {
        setError(result.message ?? "Der Spielraum konnte nicht betreten werden.");
        if (reconnecting) setConnected(false);
        return;
      }
      localStorage.setItem(`valenor:player-token:${normalizedRoom}`, result.playerToken);
      localStorage.setItem(`valenor:player-name:${normalizedRoom}`, result.player.name);
      playerRef.current = result.player;
      setPlayer(result.player);
      setRoom(result.room);
      if (result.room?.gameState) setGameState(result.room.gameState);
      setName(result.player.name);
      setConnected(true);
      setError("");
    });
  };

  useEffect(() => {
    roomRef.current = roomCode;
    const savedName = localStorage.getItem(`valenor:player-name:${roomCode.trim().toUpperCase()}`);
    if (savedName && !name) setName(savedName);
  }, [roomCode, name]);

  useEffect(() => {
    const handleConnect = () => {
      setConnected(true);
      if (playerRef.current && nameRef.current) join(nameRef.current, true);
    };
    const handleDisconnect = () => setConnected(false);
    const handleRoomUpdate = (updatedRoom: GameRoom) => {
      setRoom(updatedRoom);
      const updatedPlayer = updatedRoom.players.find(candidate => candidate.id === playerRef.current?.id);
      if (updatedPlayer) {
        playerRef.current = updatedPlayer;
        setPlayer(updatedPlayer);
      }
      setGameState(updatedRoom.gameState);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on(SOCKET_EVENTS.gameStart, setGameState);
    socket.on(SOCKET_EVENTS.gameState, setGameState);
    socket.on(SOCKET_EVENTS.roomUpdate, handleRoomUpdate);
    socket.connect();

    return () => {
      window.clearTimeout(signalTimer.current);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [socket]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cleanedName = name.trim();
    nameRef.current = cleanedName;
    roomRef.current = roomCode;
    if (!socket.connected) {
      setError("Die Verbindung zum Spielserver wird noch hergestellt.");
      return;
    }
    join(cleanedName);
  };

  const chooseColor = (color: PlayerColor) => {
    setColorPending(true);
    setError("");
    socket.emit(SOCKET_EVENTS.playerUpdateColor, color, result => {
      setColorPending(false);
      if (!result.ok || !result.room) {
        setError(result.message ?? "Die Farbe konnte nicht geändert werden.");
        return;
      }
      setRoom(result.room);
      const updated = result.room.players.find(candidate => candidate.id === playerRef.current?.id);
      if (updated) { playerRef.current = updated; setPlayer(updated); }
    });
  };

  const sendMagicSignal = () => {
    socket.emit(SOCKET_EVENTS.playerMagicSignal, (result) => {
      if (!result.ok) {
        setError(result.message ?? "Das Signal konnte nicht gesendet werden.");
        return;
      }
      setSignalSent(true);
      window.clearTimeout(signalTimer.current);
      signalTimer.current = window.setTimeout(() => setSignalSent(false), 1_800);
    });
  };

  const selectPropertyGroup = (groupId: PropertyGroupId) => {
    const active = selectedPropertyGroupId !== groupId;
    socket.emit(SOCKET_EVENTS.propertyGroupFocus, groupId, active, (result) => {
      if (!result.ok) {
        setError(result.message ?? "Die Baugruppe konnte nicht hervorgehoben werden.");
        return;
      }
      setSelectedPropertyGroupId(active ? groupId : undefined);
    });
  };

  const performGameAction = (event: "game:rollOrder" | "game:rollDice" | "game:useRuneStone" | "game:keepRoll" | "game:rollDungeon" | "game:payDungeonRelease" | "game:useDungeonCard" | "game:drawCard" | "game:acknowledgeCard" | "game:endTurn") => {
    setError("");
    socket.emit(event, (result) => {
      if (!result.ok || !result.gameState) {
        setError(result.message ?? "Diese Aktion ist gerade nicht möglich.");
        return;
      }
      setGameState(result.gameState);
    });
  };

  const chooseTavern = (choice: TavernChoice) => {
    setError("");
    socket.emit(SOCKET_EVENTS.gameChooseTavern, choice, result => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Diese Tavernenentscheidung ist gerade nicht möglich.");
      else setGameState(result.gameState);
    });
  };

  const activateRelic = (id: RelicId) => {
    setError("");
    socket.emit(SOCKET_EVENTS.relicActivate, id, result => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Reliktaktivierung nicht erlaubt.");
      else setGameState(result.gameState);
    });
  };

  const performPropertyAction = (event: "game:buyProperty" | "game:declineProperty") => {
    setError("");
    socket.emit(event, (result) => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Diese Entscheidung ist gerade nicht möglich.");
      else setGameState(result.gameState);
    });
  };

  const bid = (increment: 10 | 50 | 100) => {
    setError("");
    socket.emit(SOCKET_EVENTS.auctionBid, increment, (result) => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Dieses Gebot ist gerade nicht möglich.");
      else setGameState(result.gameState);
    });
  };

  const withdraw = () => {
    setError("");
    socket.emit(SOCKET_EVENTS.auctionWithdraw, (result) => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Du kannst gerade nicht aussteigen.");
      else setGameState(result.gameState);
    });
  };

  const manageBuilding = (event: "property:build" | "property:sellBuilding", tileIndex: number) => {
    setError("");
    socket.emit(event, tileIndex, (result) => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Die Grundstücksverwaltung ist gerade nicht möglich.");
      else setGameState(result.gameState);
    });
  };

  const settlePayment = () => {
    setError("");
    socket.emit(SOCKET_EVENTS.paymentSettle, (result) => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Die Forderung konnte nicht beglichen werden.");
      else setGameState(result.gameState);
    });
  };

  const manageMortgage = (event: "property:mortgage" | "property:redeemMortgage", tileIndex: number) => {
    setError("");
    socket.emit(event, tileIndex, (result) => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Die Hypothekenaktion ist gerade nicht möglich.");
      else setGameState(result.gameState);
    });
  };

  const createTrade = (request: CreateTradeOfferRequest) => {
    setError("");
    socket.emit(SOCKET_EVENTS.tradeCreate, request, (result) => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Das Angebot konnte nicht gesendet werden.");
      else setGameState(result.gameState);
    });
  };

  const decideTrade = (action: "accept" | "reject" | "cancel", tradeId: string) => {
    const event = action === "accept" ? SOCKET_EVENTS.tradeAccept : action === "reject" ? SOCKET_EVENTS.tradeReject : SOCKET_EVENTS.tradeCancel;
    setError("");
    socket.emit(event, tradeId, (result) => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Die Handelsaktion ist nicht möglich.");
      else setGameState(result.gameState);
    });
  };

  const declareBankruptcy = () => {
    if (!confirmBankruptcy()) return;
    socket.emit(SOCKET_EVENTS.playerDeclareBankruptcy, (result) => {
      if (!result.ok || !result.gameState) setError(result.message ?? "Der Bankrott konnte nicht erklärt werden.");
      else setGameState(result.gameState);
    });
  };

  if (!player) {
    return (
      <main className="controller-page">
        <Ambience />
        <section className="controller-card controller-card--entry">
          <BrandMark compact />
          <div className="controller-card__sigil" aria-hidden="true"><span>V</span></div>
          <div className="controller-card__intro">
            <p className="eyebrow">Eine Einladung aus Valenør</p>
            <h1>Wie lautet dein Name?</h1>
            <p>Wähle den Namen, unter dem dich deine Gefährten kennen.</p>
          </div>

          <form className="join-form" onSubmit={submit}>
            <label htmlFor="room-code">Raumcode</label>
            <input
              id="room-code"
              value={roomCode}
              onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
              placeholder="VAL-7421"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={8}
              required
            />
            <label htmlFor="player-name">Dein Name</label>
            <input
              id="player-name"
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 24))}
              placeholder="Name des Gefährten"
              autoComplete="nickname"
              minLength={2}
              maxLength={24}
              required
              autoFocus
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button primary-button--wide" type="submit" disabled={joining || !connected}>
              {joining ? "Das Tor öffnet sich …" : "Valenør betreten"}
            </button>
          </form>
          <ConnectionBadge connected={connected} />
        </section>
      </main>
    );
  }

  const activePlayer = gameState?.players.find((candidate) => candidate.id === player.id);

  if (gameState && activePlayer) {
    const current = gameState.players.find((candidate) => candidate.id === gameState.currentPlayerId);
    if (gameState.status === "finished") {
      return <main className={`controller-page controller-page--active player-theme--${player.color}`}><Ambience /><section className="controller-card controller-card--started end-controller"><BrandMark compact /><GameResultPanel gameState={gameState} viewerId={player.id} /><ConnectionBadge connected={connected} /></section></main>;
    }
    if (activePlayer.isBankrupt) {
      return <BankruptcySpectator gameState={gameState} player={player} connected={connected} />;
    }
    const isCurrent = current?.id === player.id;
    const orderEntry = gameState.orderRolls.find((entry) => entry.playerId === player.id);
    const needsOrderRoll = gameState.turnPhase === "determiningOrder"
      && gameState.orderContenders.includes(player.id)
      && (orderEntry?.rolls.length ?? 0) < gameState.orderRollTargetCount;
    const canRoll = isCurrent && gameState.turnPhase === "waitingForRoll";
    const canEnd = isCurrent && gameState.turnPhase === "waitingForEndTurn";
    const landed = gameState.lastMovement?.landedTile;
    const canDecide = isCurrent && gameState.turnPhase === "propertyDecision" && Boolean(landed?.economy);
    const purchasePrice = landed?.economy ? getEffectivePurchasePrice(gameState, landed) : Infinity;
    const canBuy = canDecide && activePlayer.gold >= purchasePrice;
    const auction = gameState.auction;
    const auctionTile = auction ? BOARD_TILES[auction.tileIndex] : undefined;
    const withdrew = Boolean(auction?.withdrawnPlayerIds.includes(player.id));
    const participates = Boolean(auction?.participantIds.includes(player.id));
    const auctionPaused = Boolean(auction?.pausedForPlayerIds.length);
    const ownedTiles = gameState.propertyOwnerships
      .filter((ownership) => ownership.ownerId === player.id)
      .map((ownership) => ({ ownership, tile: BOARD_TILES[ownership.tileIndex]! }));


    const payment = gameState.pendingPayment?.payerId === player.id ? gameState.pendingPayment : undefined;
    const hasLegalPaymentSale = payment && ownedTiles.some(({ tile }) => canSellBuilding(gameState, player.id, tile.index).allowed || canMortgageProperty(gameState, player.id, tile.index).allowed);
    return (
      <main className={`controller-page controller-page--active player-theme--${player.color}`}
        style={{ "--mobile-feedback-space": feedbackHeight ? `${feedbackHeight + 24}px` : "0px" } as CSSProperties}>
        <Ambience />
        <MobileFeedbackToast snapshot={mobileFeedback.snapshot} onDismiss={mobileFeedback.dismiss} onHeightChange={setFeedbackHeight} />
        <section className="controller-card controller-card--started">
          <BrandMark compact />
          <header className={`controller-player-bar controller-player-bar--${player.color}`}>
            <span aria-hidden="true">{["♞", "➶", "✧", "⚒"][gameState.players.findIndex((entry) => entry.id === player.id)] ?? "✦"}</span>
            <div><strong>{activePlayer.name}</strong><small>RUNDE {gameState.currentRound} · {activePlayer.dungeon.inDungeon ? "IM KERKER" : gameState.currentPlayerId === player.id ? "AM ZUG" : "BEREIT"}</small></div>
            <b><i className="valenor-coin" aria-hidden="true">V</i>{activePlayer.gold.toLocaleString("de-DE")}</b>
          </header>
          <div className={`player-orb player-orb--${player.color}`} aria-hidden="true">
            <span>{player.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="controller-card__intro">
            <p className="eyebrow">Das Runentor ist geöffnet</p>
            <h1>Das Abenteuer hat begonnen.</h1>
            <p className="started-player-name">{activePlayer.name}</p>
          </div>
          <div className="controller-gold">
            <span>DEIN VERMÖGEN</span>
            <strong>{activePlayer.gold.toLocaleString("de-DE")}</strong>
            <small>Goldstücke</small>
          </div>
          <QuickGameClockDisplay clock={gameState.quickGameClock} compact />
          {gameState.quickGameClock?.expired && <p className="controller-last-round">DIE LETZTE RUNDE</p>}
          <ConnectionBadge connected={connected} />
          <div id="controller-action" hidden={controllerTab !== "action"}>
          {!isCurrent && <MobileLiveEvents state={gameState} playerId={player.id} />}
          <div className="controller-divider"><span>✦</span></div>
          {isCurrent && gameState.turnPhase === "dungeonDecision" ? (
            <DungeonDecisionPanel
              failedAttempts={activePlayer.dungeon.failedAttempts}
              gold={activePlayer.gold}
              connected={connected}
              onRoll={() => performGameAction(SOCKET_EVENTS.gameRollDungeon)}
              onPay={() => performGameAction(SOCKET_EVENTS.gamePayDungeonRelease)}
              hasDungeonCard={(activePlayer.heldCards?.length ?? 0) > 0}
              onUseCard={() => performGameAction(SOCKET_EVENTS.gameUseDungeonCard)}
            />
          ) : gameState.turnPhase === "determiningOrder" ? (
            <div className="turn-controls">
              <p className="waiting-copy">{needsOrderRoll ? "Bestimme dein Schicksal" : "Die anderen Gefährten bestimmen ihr Schicksal …"}</p>
              {needsOrderRoll && (
                <button className="turn-action-button" type="button" disabled={!connected} onClick={() => performGameAction(SOCKET_EVENTS.gameRollOrder)}>
                  <span aria-hidden="true">⚄ ⚄</span> Startwurf
                </button>
              )}
              {orderEntry?.rolls.at(-1) && <p className="personal-roll">Dein Wurf: <strong>{orderEntry.rolls.at(-1)!.total}</strong></p>}
            </div>
          ) : (
            <div className="turn-controls">
              {isCurrent && <p className="waiting-copy">Du bist am Zug</p>}
              {canRoll && (
                <button className="turn-action-button" type="button" disabled={!connected} onClick={() => performGameAction(SOCKET_EVENTS.gameRollDice)}>
                  <span aria-hidden="true">⚄ ⚄</span> Würfeln
                </button>
              )}
              {isCurrent && gameState.tavern?.playerId === player.id && gameState.tavern.turnNumber === gameState.turnNumber && ["tavernDecision", "tavernRolling", "waitingForEndTurn"].includes(gameState.turnPhase) && <TavernDecisionPanel tavern={gameState.tavern} connected={connected} onChoose={chooseTavern} />}
              {isCurrent && gameState.turnPhase === "awaitingCardDraw" && (landed?.type === "adventure" || landed?.type === "fate") && (
                <section className={`card-draw-prompt card-draw-prompt--${landed.type}`}>
                  <small>{landed.type === "adventure" ? "ABENTEUER" : "SCHICKSAL"}</small>
                  <h2>{landed.type === "adventure" ? "Das nächste Kapitel wartet." : "Die Fäden des Schicksals bewegen sich."}</h2>
                  <button className="turn-action-button" type="button" disabled={!connected} onClick={() => performGameAction(SOCKET_EVENTS.gameDrawCard)}>Karte ziehen</button>
                </section>
              )}
              {isCurrent && gameState.activeCard && (
                <section className="controller-card-event">
                  <CardReveal activeCard={gameState.activeCard} compact={["paymentRequired", "propertyDecision", "auction", "cardMoving"].includes(gameState.turnPhase)} />
                  {gameState.turnPhase === "cardAcknowledgement" && (
                    <button className="turn-action-button" type="button" disabled={!connected} onClick={() => performGameAction(SOCKET_EVENTS.gameAcknowledgeCard)}>
                      {getCardDefinition(gameState.activeCard.cardId).keepable ? "Karte behalten" : "Weiter"}
                    </button>
                  )}
                </section>
              )}
              {canRoll && gameState.lastTurnAction?.kind === "double" && gameState.lastTurnAction.playerId === player.id && <p className="double-copy"><strong>Pasch!</strong> Du darfst erneut würfeln.</p>}
              {isCurrent && gameState.turnContext.awaitingRuneStoneDecision && <RuneStoneDecisionPanel connected={connected}
                onReroll={() => performGameAction(SOCKET_EVENTS.gameUseRuneStone)} onKeep={() => performGameAction(SOCKET_EVENTS.gameKeepRoll)} />}
              {gameState.lastTurnAction && gameState.lastTurnAction.playerId === player.id && gameState.lastTurnAction.kind !== "double" && <DungeonOutcomeNotice action={gameState.lastTurnAction} />}
              {isCurrent && gameState.turnPhase === "dungeonRolling" && <p className="dungeon-fate-copy">Die Würfel entscheiden über deine Freiheit …</p>}
              {isCurrent && gameState.lastDiceRoll && !canRoll && (
                <div className="personal-turn-result">
                  <span>Gewürfelt: {gameState.lastDiceRoll.die1} + {gameState.lastDiceRoll.die2} = <strong>{gameState.lastDiceRoll.total}</strong></span>
                  {landed && <span>Gelandet: <strong>{landed.name}</strong></span>}
                  {landed?.type === "dungeon" && !activePlayer.dungeon.inDungeon && <span>Nur zu Besuch · Du bist frei.</span>}
                </div>
              )}
              {canEnd && (
                <button className="turn-action-button turn-action-button--end" type="button" disabled={!connected} onClick={() => performGameAction(SOCKET_EVENTS.gameEndTurn)}>
                  Zug beenden
                </button>
              )}
              {canDecide && landed && (
                <div className="controller-economy">
                  <PropertyCard tile={landed} state={gameState} compact />
                  <button className="turn-action-button" type="button" disabled={!connected || !canBuy} onClick={() => performPropertyAction(SOCKET_EVENTS.gameBuyProperty)}>
                    Kaufen · {purchasePrice} Gold
                  </button>
                  <button className="economy-secondary" type="button" disabled={!connected} onClick={() => performPropertyAction(SOCKET_EVENTS.gameDeclineProperty)}>Ablehnen &amp; versteigern</button>
                </div>
              )}
              {gameState.turnPhase === "auction" && auction && auctionTile && participates && (
                <div className="controller-economy">
                  <PropertyCard tile={auctionTile} state={gameState} compact />
                  <p className="auction-bid">Aktuelles Gebot <strong>{auction.currentBid} Gold</strong></p>
                  {auctionPaused ? <p className="controller-hint">Auktion pausiert – ein Gefährte verbindet sich neu.</p> : withdrew ? <p className="controller-hint">Du bist aus der Auktion ausgestiegen.</p> : (
                    <>
                      <div className="bid-buttons">{([10, 50, 100] as const).map((amount) => <button key={amount} type="button" disabled={!connected || activePlayer.gold < auction.currentBid + amount} onClick={() => bid(amount)}>+{amount}</button>)}</div>
                      <button className="economy-secondary" type="button" disabled={!connected || auction.highestBidderId === player.id} onClick={withdraw}>Aussteigen</button>
                    </>
                  )}
                </div>
              )}
              {isCurrent && ["rolling", "moving", "landed"].includes(gameState.turnPhase) && <p className="controller-hint">Blick zum gemeinsamen Bildschirm …</p>}
            </div>
          )}
          {payment && <PaymentManagement payment={payment} playerGold={activePlayer.gold} hasLegalPaymentAction={Boolean(hasLegalPaymentSale)} connected={connected} onSettle={settlePayment} onDeclareBankruptcy={declareBankruptcy} />}
          </div>
          <div hidden={controllerTab !== "property"}><ControllerPossessions state={gameState} playerId={player.id} connected={connected} selectedGroupId={selectedPropertyGroupId} onSelectGroup={selectPropertyGroup} onBuild={manageBuilding} onMortgage={manageMortgage} onActivateRelic={activateRelic} onUseRuneStone={() => performGameAction(SOCKET_EVENTS.gameUseRuneStone)} /></div>
          <div id="controller-trade" hidden={controllerTab !== "trade"}><TradePanel state={gameState} playerId={player.id} connected={connected && ["waitingForRoll", "waitingForEndTurn"].includes(gameState.turnPhase)} onCreate={createTrade} onDecision={decideTrade} /></div>
          <section id="controller-journal" hidden={controllerTab !== "journal"}><ControllerQuestLog state={gameState} playerId={player.id} /><h2>Journal</h2>{gameState.economyLog.at(-1) ? <p className="controller-log">{gameState.economyLog.at(-1)!.message}</p> : <p>Noch keine Einträge.</p>}</section>
          <nav className="controller-nav" aria-label="Controller-Bereiche">
            <a href="#controller-action" aria-current={controllerTab === "action" ? "page" : undefined}><span>✦</span>Aktion</a>
            <a href="#controller-property" aria-current={controllerTab === "property" ? "page" : undefined}><span>♜</span>Besitz</a>
            <a href="#controller-trade" aria-current={controllerTab === "trade" ? "page" : undefined}><span>◇</span>Handel{incomingTradeCount > 0 && <b className="controller-trade-badge" aria-label={`${incomingTradeCount} offene Handelsangebote`}>{incomingTradeCount}</b>}</a>
            <a href="#controller-journal" aria-current={controllerTab === "journal" ? "page" : undefined}><span>☷</span>Journal</a>
          </nav>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className={`controller-page controller-page--active player-theme--${player.color}`}>
      <Ambience />
      <section className="controller-card controller-card--connected">
        <BrandMark compact />
        <div className={`player-orb player-orb--${player.color}`} aria-hidden="true">
          <span>{player.name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="controller-card__intro">
          <p className="eyebrow">Gefährte verbunden</p>
          <h1>{player.name}</h1>
          <p>Du bist mit dem Spiel verbunden.</p>
        </div>
        <ConnectionBadge connected={connected} />

        {room?.phase === "lobby" && <PlayerColorPicker players={room.players} playerId={player.id} connected={connected} pending={colorPending} onSelect={chooseColor} />}
        <div className="controller-divider"><span>✦</span></div>
        <button
          className={`magic-button magic-button--${player.color} ${signalSent ? "is-casting" : ""}`}
          type="button"
          onClick={sendMagicSignal}
          disabled={!connected}
        >
          <span className="magic-button__icon" aria-hidden="true">✦</span>
          <span>{signalSent ? "Signal gesendet" : "Magisches Signal senden"}</span>
        </button>
        <p className="controller-hint">Dein Signal erscheint auf dem gemeinsamen Bildschirm.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
