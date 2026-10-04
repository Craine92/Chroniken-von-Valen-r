import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BOARD_TILES, canBuildOnProperty, getPropertyGroup, getPropertyGroupTiles, type GameState, type PropertyGroupId } from "@valenor/shared";
import { GameHud } from "./GameHud";
import { hasTurnStatusContent, TurnStatus } from "./TurnStatus";
import { CardReveal } from "../components/CardReveal";
import { GameResultPanel } from "../components/GameResultPanel";
import { DEFAULT_BOARD_PRESENTATION_MODE, type BoardPresentationMode } from "./board-presentation";
import { audioManager } from "../audio/AudioManager";
import { GameAudioEventTracker } from "../audio/game-audio-events";

const GameCanvas = lazy(() =>
  import("./GameCanvas").then((module) => ({ default: module.GameCanvas }))
);

export const DOUBLE_BANNER_DURATION_MS = 2_200;

export function GameExperience({ gameState, onNewChronicle, focusedPropertyGroupId, focusedPropertyGroupPlayerId, boardPresentationMode = DEFAULT_BOARD_PRESENTATION_MODE }: { gameState: GameState; onNewChronicle?: () => void; focusedPropertyGroupId?: PropertyGroupId | undefined; focusedPropertyGroupPlayerId?: string | undefined; boardPresentationMode?: BoardPresentationMode | undefined }) {
  const [introVisible, setIntroVisible] = useState(true);
  const [buildingNoticeId, setBuildingNoticeId] = useState<string>();
  const [tradeNoticeId, setTradeNoticeId] = useState<string>();
  const [dismissedDoubleNoticeId, setDismissedDoubleNoticeId] = useState<string>();
  const audioTracker = useRef(new GameAudioEventTracker(gameState));
  const audioTimers = useRef(new Set<number>());

  useEffect(() => {
    audioManager.setGameActive(true);
    return () => {
      audioTimers.current.forEach((timer) => window.clearTimeout(timer));
      audioTimers.current.clear();
      audioManager.setGameActive(false);
    };
  }, []);

  useEffect(() => {
    audioTracker.current.update(gameState).forEach(({ event, delayMs = 0 }) => {
      if (!delayMs) {
        audioManager.play(event);
        return;
      }
      const timer = window.setTimeout(() => {
        audioTimers.current.delete(timer);
        audioManager.play(event);
      }, delayMs);
      audioTimers.current.add(timer);
    });
  }, [gameState]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroVisible(false), 4_800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const action = gameState.lastBuildingAction;
    if (!action || Date.now() - action.createdAt > 3_000) return;
    setBuildingNoticeId(action.id);
    const timer = window.setTimeout(() => setBuildingNoticeId(undefined), 1_800);
    return () => window.clearTimeout(timer);
  }, [gameState.lastBuildingAction?.id]);

  useEffect(() => {
    const action = gameState.lastTradeAction;
    if (!action || Date.now() - action.createdAt > 3_000) return;
    setTradeNoticeId(action.id);
    const timer = window.setTimeout(() => setTradeNoticeId(undefined), 1_800);
    return () => window.clearTimeout(timer);
  }, [gameState.lastTradeAction?.id]);

  useEffect(() => {
    const action = gameState.lastTurnAction;
    if (action?.kind !== "double" || !gameState.turnContext.pendingExtraRoll) return;
    const timer = window.setTimeout(() => setDismissedDoubleNoticeId(action.id), DOUBLE_BANNER_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [gameState.lastTurnAction?.id, gameState.turnContext.pendingExtraRoll]);

  const buildingAction = buildingNoticeId === gameState.lastBuildingAction?.id ? gameState.lastBuildingAction : undefined;
  const buildingPlayer = buildingAction ? gameState.players.find((player) => player.id === buildingAction.playerId) : undefined;
  const buildingTile = buildingAction ? BOARD_TILES[buildingAction.tileIndex] : undefined;
  const tradeAction = tradeNoticeId === gameState.lastTradeAction?.id ? gameState.lastTradeAction : undefined;
  const doubleAction = gameState.lastTurnAction?.kind === "double" && gameState.turnContext.pendingExtraRoll
    && dismissedDoubleNoticeId !== gameState.lastTurnAction.id
    ? gameState.lastTurnAction
    : undefined;
  const doublePlayer = doubleAction ? gameState.players.find((player) => player.id === doubleAction.playerId) : undefined;
  const focusedPropertyGroup = getPropertyGroup(focusedPropertyGroupId);
  const focusedGroupTiles = focusedPropertyGroup ? getPropertyGroupTiles(focusedPropertyGroup.id) : [];
  const focusedOwnedTiles = focusedGroupTiles.filter((tile) => gameState.propertyOwnerships.some((ownership) => ownership.tileIndex === tile.index && (!focusedPropertyGroupPlayerId || ownership.ownerId === focusedPropertyGroupPlayerId)));
  const focusedMissingTiles = focusedGroupTiles.filter((tile) => !focusedOwnedTiles.includes(tile));
  const focusedBuildAvailable = Boolean(focusedPropertyGroupPlayerId && focusedGroupTiles.some((tile) => canBuildOnProperty(gameState, focusedPropertyGroupPlayerId, tile.index).allowed));
  const hasContextEvent = hasTurnStatusContent(gameState)
    || Boolean(gameState.status === "playing" && gameState.quickGameClock?.expired)
    || Boolean(gameState.activeCard)
    || Boolean(buildingAction)
    || Boolean(tradeAction);

  return (
    <main className={`board-page board-page--${boardPresentationMode} ${hasContextEvent ? "has-context-event" : "is-context-idle"}`} data-testid="valenor-game-view" data-context-state={hasContextEvent ? "active" : "idle"}>
      <aside className="game-sidebar" aria-label="Spielstatus">
        <GameHud gameState={gameState} />
        <aside className="economy-log" aria-live="polite">
          <strong>LETZTE AKTIONEN</strong>
          {gameState.economyLog.slice(-2).reverse().map((entry) => <p key={entry.id}>{entry.message}</p>)}
        </aside>
      </aside>
      <section className="board-stage" aria-label="Brettbereich">
        <Suspense fallback={<div className="game-loading">Die Welt von Valenør erwacht …</div>}>
          <GameCanvas gameState={gameState} focusedPropertyGroupId={focusedPropertyGroupId} presentationMode={boardPresentationMode} />
        </Suspense>
        <div className="board-notification-lane" aria-live="polite" aria-atomic="true">
          {doubleAction && (
            <aside key={doubleAction.id} className="double-banner" role="status" data-notification-id={doubleAction.id}>
              <i aria-hidden="true">✦</i>
              <strong>PASCH!</strong>
              <span>{doublePlayer?.name} darf erneut würfeln.</span>
              <i aria-hidden="true">✦</i>
            </aside>
          )}
        </div>
        <div className="board-event-layer" aria-live="polite">
          <TurnStatus state={gameState} />
          {gameState.status === "playing" && gameState.quickGameClock?.expired && (
            <aside className="last-round-banner" role="status">DIE LETZTE RUNDE · DIE ZEIT IST ABGELAUFEN</aside>
          )}
          {buildingAction && buildingPlayer && buildingTile && (
            <aside className={`building-notice building-notice--${buildingAction.type}`}>
              <small>{buildingAction.type === "build" ? `${buildingPlayer.name} erweitert ${buildingTile.name}.` : `${buildingPlayer.name} gibt eine Baustufe auf ${buildingTile.name} auf.`}</small>
              <strong>{buildingAction.buildingName}</strong>
              <span>{buildingAction.type === "build" ? "−" : "+"}{buildingAction.amount} Gold</span>
            </aside>
          )}
          {tradeAction && (
            <aside className="building-notice">
              <small>{tradeAction.type === "created" ? `${gameState.players.find((player) => player.id === tradeAction.proposerId)?.name} unterbreitet ein Handelsangebot.` : "Ein Bündnis wird besiegelt."}</small>
              <strong>Handel</strong>
            </aside>
          )}
        </div>
        {gameState.activeCard && (
          <aside className="board-card-event" aria-live="polite">
            <CardReveal activeCard={gameState.activeCard} />
          </aside>
        )}
        {focusedPropertyGroup && (
          <aside className="board-group-focus-card" aria-live="polite">
            <i aria-hidden="true">{focusedPropertyGroup.sigil}</i>
            <div>
              <strong>{focusedPropertyGroup.displayName} · {focusedOwnedTiles.length}/{focusedPropertyGroup.size}</strong>
              <span>{focusedBuildAvailable ? "Vollständig · Bauen jetzt möglich" : focusedMissingTiles.length ? `Fehlt: ${focusedMissingTiles.map((tile) => tile.name).join(", ")}` : "Gruppe vollständig"}</span>
            </div>
          </aside>
        )}
      </section>
      {gameState.status === "finished" && (
        <section className="victory-overlay">
          <GameResultPanel gameState={gameState} onNewChronicle={onNewChronicle} />
        </section>
      )}
      {introVisible && gameState.status !== "finished" && (
        <div className="game-intro" aria-live="polite">
          <div className="game-intro__rune" aria-hidden="true">✦</div>
          <p>DIE SIEGEL SIND GEBROCHEN</p>
          <h1>Die Chroniken von Valenør beginnen …</h1>
        </div>
      )}
    </main>
  );
}
