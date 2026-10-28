import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SOCKET_EVENTS,
  EMOTE_DISPLAY_MS,
  type CreateRoomRequest,
  type GameConfig,
  type GameRoom,
  type GameState,
  type EmoteSignal,
  type LocateSignal,
  type GrandStartSkipSignal,
  type MagicSignal,
  type PropertyGroupFocusSignal
} from "@valenor/shared";
import { createValenorSocket } from "../lib/socket";
import { shouldApplyAuthoritativeGameState } from "../lib/authoritative-game-state";
import { audioManager } from "../audio/AudioManager";
import { HostLobby } from "./HostLobby";

const GameExperience = lazy(() =>
  import("../game/GameExperience").then((module) => ({ default: module.GameExperience }))
);

const HOST_ROOM_KEY = "valenor:host-room";
const HOST_TOKEN_KEY = "valenor:host-token";

export function HostPage() {
  const socket = useMemo(createValenorSocket, []);
  const [room, setRoom] = useState<GameRoom>();
  const [gameState, setGameState] = useState<GameState>();
  const [controllerUrl, setControllerUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signal, setSignal] = useState<MagicSignal>();
  const [propertyGroupFocus, setPropertyGroupFocus] = useState<PropertyGroupFocusSignal>();
  const [emotes, setEmotes] = useState<Readonly<Record<string, EmoteSignal>>>({});
  const [locateSignal, setLocateSignal] = useState<LocateSignal>();
  const [grandStartSkip, setGrandStartSkip] = useState<GrandStartSkipSignal>();
  const emoteTimers = useRef(new Map<string, number>());
  const [creditsOpen, setCreditsOpen] = useState(false);
  const closeCredits = useCallback(() => setCreditsOpen(false), []);
  const signalTimer = useRef<number | undefined>(undefined);
  const propertyGroupFocusTimer = useRef<number | undefined>(undefined);
  const lastRoomPhase = useRef<GameRoom["phase"] | undefined>(undefined);
  const latestAppliedRevision = useRef(-1);
  const applyAuthoritativeGameState = useCallback((nextState: GameState) => {
    if (!shouldApplyAuthoritativeGameState(latestAppliedRevision.current, nextState)) return;
    latestAppliedRevision.current = nextState.stateRevision ?? 0;
    setGameState(nextState);
  }, []);

  useEffect(() => {
    if (error) audioManager.play("UI_ERROR");
  }, [error]);

  useEffect(() => {
    const establishRoom = () => {
      setConnected(true);
      const savedRoom = localStorage.getItem(HOST_ROOM_KEY);
      const savedToken = localStorage.getItem(HOST_TOKEN_KEY);
      const request: CreateRoomRequest = savedRoom && savedToken
        ? { roomCode: savedRoom, hostToken: savedToken }
        : {};

      socket.emit(SOCKET_EVENTS.roomCreate, request, (result) => {
        if (!result.ok || !result.room || !result.hostToken || !result.controllerUrl) {
          setError(result.message ?? "Der Spielraum konnte nicht erschaffen werden.");
          return;
        }
        localStorage.setItem(HOST_ROOM_KEY, result.room.code);
        localStorage.setItem(HOST_TOKEN_KEY, result.hostToken);
        setRoom(result.room);
        lastRoomPhase.current = result.room.phase;
        if (result.room.gameState) applyAuthoritativeGameState(result.room.gameState);
        setControllerUrl(result.controllerUrl);
        setError("");
      });
    };

    const handleSignal = (nextSignal: MagicSignal) => {
      setSignal(nextSignal);
      window.clearTimeout(signalTimer.current);
      signalTimer.current = window.setTimeout(() => setSignal(undefined), 3_600);
    };
    const handleEmote = (emote: EmoteSignal) => {
      setEmotes((current) => ({ ...current, [emote.playerId]: emote }));
      window.clearTimeout(emoteTimers.current.get(emote.playerId));
      emoteTimers.current.set(emote.playerId, window.setTimeout(() => {
        emoteTimers.current.delete(emote.playerId);
        setEmotes(({ [emote.playerId]: _expired, ...rest }) => rest);
      }, EMOTE_DISPLAY_MS));
    };
    const handlePropertyGroupFocus = (nextFocus: PropertyGroupFocusSignal) => {
      window.clearTimeout(propertyGroupFocusTimer.current);
      setPropertyGroupFocus((current) => nextFocus.active ? nextFocus : current?.groupId === nextFocus.groupId ? undefined : current);
      if (nextFocus.active) propertyGroupFocusTimer.current = window.setTimeout(() => setPropertyGroupFocus(undefined), 8_000);
    };

    const handleDisconnect = () => setConnected(false);
    const handleRoomUpdate = (nextRoom: GameRoom) => {
      setRoom(nextRoom);
      if (nextRoom.phase === "lobby" && lastRoomPhase.current && lastRoomPhase.current !== "lobby") {
        audioManager.resetMusic();
        window.clearTimeout(propertyGroupFocusTimer.current);
        setPropertyGroupFocus(undefined);
      }
      lastRoomPhase.current = nextRoom.phase;
      if (nextRoom.phase === "lobby") {
        latestAppliedRevision.current = -1;
        setGameState(undefined);
      } else if (nextRoom.gameState) applyAuthoritativeGameState(nextRoom.gameState);
    };
    const handleGameState = (nextState: GameState) => applyAuthoritativeGameState(nextState);
    socket.on("connect", establishRoom);
    socket.on("disconnect", handleDisconnect);
    socket.on(SOCKET_EVENTS.roomUpdate, handleRoomUpdate);
    socket.on(SOCKET_EVENTS.gameStart, handleGameState);
    socket.on(SOCKET_EVENTS.gameState, handleGameState);
    socket.on(SOCKET_EVENTS.playerMagicSignal, handleSignal);
    socket.on(SOCKET_EVENTS.playerLocate, setLocateSignal);
    socket.on(SOCKET_EVENTS.grandStartSkip, setGrandStartSkip);
    socket.on(SOCKET_EVENTS.playerEmote, handleEmote);
    socket.on(SOCKET_EVENTS.propertyGroupFocus, handlePropertyGroupFocus);
    socket.connect();

    return () => {
      window.clearTimeout(signalTimer.current);
      window.clearTimeout(propertyGroupFocusTimer.current);
      socket.off("connect", establishRoom);
      socket.off("disconnect", handleDisconnect);
      socket.off(SOCKET_EVENTS.roomUpdate, handleRoomUpdate);
      socket.off(SOCKET_EVENTS.gameStart, handleGameState);
      socket.off(SOCKET_EVENTS.gameState, handleGameState);
      socket.off(SOCKET_EVENTS.playerMagicSignal, handleSignal);
      socket.off(SOCKET_EVENTS.playerLocate, setLocateSignal);
      socket.off(SOCKET_EVENTS.grandStartSkip, setGrandStartSkip);
      socket.off(SOCKET_EVENTS.playerEmote, handleEmote);
      emoteTimers.current.forEach((timer) => window.clearTimeout(timer));
      emoteTimers.current.clear();
      socket.off(SOCKET_EVENTS.propertyGroupFocus, handlePropertyGroupFocus);
      socket.disconnect();
    };
  }, [applyAuthoritativeGameState, socket]);

  const mutateRoom = (action: "add" | "remove" | "config", value?: string | GameConfig) => {
    setBusy(true);
    const done = (result: { ok: boolean; room?: GameRoom; message?: string }) => {
      setBusy(false);
      if (!result.ok || !result.room) {
        setError(result.message ?? "Die Lobby konnte nicht aktualisiert werden.");
        return;
      }
      setRoom(result.room);
      setError("");
    };

    if (action === "add") socket.emit(SOCKET_EVENTS.roomAddComputer, done);
    if (action === "remove" && typeof value === "string") {
      socket.emit(SOCKET_EVENTS.roomRemovePlayer, value, done);
    }
    if (action === "config" && typeof value === "object") {
      socket.emit(SOCKET_EVENTS.roomUpdateConfig, value, done);
    }
  };

  const startAdventure = () => {
    setBusy(true);
    socket.emit(SOCKET_EVENTS.gameStart, (result) => {
      setBusy(false);
      if (!result.ok || !result.gameState) {
        setError(result.message ?? "Das Abenteuer konnte nicht begonnen werden.");
        return;
      }
      applyAuthoritativeGameState(result.gameState);
    });
  };

  const startNewChronicle = () => {
    socket.emit(SOCKET_EVENTS.gameNewChronicle, (result) => {
      if (!result.ok || !result.room) {
        setError(result.message ?? "Die neue Chronik konnte nicht vorbereitet werden.");
        return;
      }
      setRoom(result.room);
      latestAppliedRevision.current = -1;
      setGameState(undefined);
      audioManager.resetMusic();
    });
  };

  const returnToLobby = () => {
    if (!window.confirm("Partie beenden und zur Lobby zurückkehren?\nDer aktuelle Spielstand geht verloren.")) return;
    socket.emit(SOCKET_EVENTS.gameReturnToLobby, result => {
      if (!result.ok || !result.room) {
        setError(result.message ?? "Rückkehr zur Lobby fehlgeschlagen.");
        return;
      }
      audioManager.resetMusic();
      latestAppliedRevision.current = -1;
      setRoom(result.room); setGameState(undefined);
    });
  };

  if (gameState) {
    return (
      <Suspense fallback={<main className="board-page"><div className="game-loading">Das Runentor öffnet sich …</div></main>}>
        <GameExperience gameState={gameState} onNewChronicle={startNewChronicle} onReturnToLobby={returnToLobby} focusedPropertyGroupId={propertyGroupFocus?.groupId} focusedPropertyGroupPlayerId={propertyGroupFocus?.playerId} emotes={emotes} locateSignal={locateSignal} grandStartSkip={grandStartSkip} />
        {error && <div className="error-toast" role="alert">{error}</div>}
      </Suspense>
    );
  }

  return (
    <HostLobby
      room={room}
      controllerUrl={controllerUrl}
      connected={connected}
      busy={busy}
      signal={signal}
      error={error}
      creditsOpen={creditsOpen}
      onAddComputer={() => mutateRoom("add")}
      onRemovePlayer={(playerId) => mutateRoom("remove", playerId)}
      onConfigChange={(config) => mutateRoom("config", config)}
      onStart={startAdventure}
      onOpenCredits={() => setCreditsOpen(true)}
      onCloseCredits={closeCredits}
    />
  );
}
