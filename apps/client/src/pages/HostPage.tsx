import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  SOCKET_EVENTS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  type CreateRoomRequest,
  type GameConfig,
  type GameRoom,
  type GameState,
  type MagicSignal,
  type PropertyGroupFocusSignal
} from "@valenor/shared";
import { Ambience } from "../components/Ambience";
import { BrandMark } from "../components/BrandMark";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { GameModeSelector } from "../components/GameModeSelector";
import { PlayerSlot } from "../components/PlayerSlot";
import { createValenorSocket } from "../lib/socket";
import { audioManager } from "../audio/AudioManager";

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
  const signalTimer = useRef<number | undefined>(undefined);
  const propertyGroupFocusTimer = useRef<number | undefined>(undefined);
  const lastRoomPhase = useRef<GameRoom["phase"] | undefined>(undefined);

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
        setGameState(result.room.gameState);
        setControllerUrl(result.controllerUrl);
        setError("");
      });
    };

    const handleSignal = (nextSignal: MagicSignal) => {
      setSignal(nextSignal);
      window.clearTimeout(signalTimer.current);
      signalTimer.current = window.setTimeout(() => setSignal(undefined), 3_600);
    };
    const handlePropertyGroupFocus = (nextFocus: PropertyGroupFocusSignal) => {
      window.clearTimeout(propertyGroupFocusTimer.current);
      setPropertyGroupFocus((current) => nextFocus.active ? nextFocus : current?.groupId === nextFocus.groupId ? undefined : current);
      if (nextFocus.active) propertyGroupFocusTimer.current = window.setTimeout(() => setPropertyGroupFocus(undefined), 8_000);
    };

    socket.on("connect", establishRoom);
    socket.on("disconnect", () => setConnected(false));
    socket.on(SOCKET_EVENTS.roomUpdate, (nextRoom) => {
      setRoom(nextRoom);
      if (nextRoom.phase === "lobby" && lastRoomPhase.current && lastRoomPhase.current !== "lobby") {
        audioManager.resetMusic();
        window.clearTimeout(propertyGroupFocusTimer.current);
        setPropertyGroupFocus(undefined);
      }
      lastRoomPhase.current = nextRoom.phase;
      setGameState(nextRoom.gameState);
    });
    socket.on(SOCKET_EVENTS.gameStart, setGameState);
    socket.on(SOCKET_EVENTS.gameState, setGameState);
    socket.on(SOCKET_EVENTS.playerMagicSignal, handleSignal);
    socket.on(SOCKET_EVENTS.propertyGroupFocus, handlePropertyGroupFocus);
    socket.connect();

    return () => {
      window.clearTimeout(signalTimer.current);
      window.clearTimeout(propertyGroupFocusTimer.current);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [socket]);

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
      setGameState(result.gameState);
    });
  };

  const startNewChronicle = () => {
    socket.emit(SOCKET_EVENTS.gameNewChronicle, (result) => {
      if (!result.ok || !result.room) {
        setError(result.message ?? "Die neue Chronik konnte nicht vorbereitet werden.");
        return;
      }
      setRoom(result.room);
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
      setRoom(result.room); setGameState(undefined);
    });
  };

  if (gameState) {
    return (
      <Suspense fallback={<main className="board-page"><div className="game-loading">Das Runentor öffnet sich …</div></main>}>
        <GameExperience gameState={gameState} onNewChronicle={startNewChronicle} onReturnToLobby={returnToLobby} focusedPropertyGroupId={propertyGroupFocus?.groupId} focusedPropertyGroupPlayerId={propertyGroupFocus?.playerId} />
        {error && <div className="error-toast" role="alert">{error}</div>}
      </Suspense>
    );
  }

  const players = room?.players ?? [];
  const connectedHumans = players.filter(
    (player) => player.type === "human" && player.connectionState === "connected"
  ).length;
  const humansReady = players.filter(player => player.type === "human" && player.connectionState === "connected").every(player => player.ready);
  const canStart = players.length >= MIN_PLAYERS && connectedHumans >= 1 && players.length <= MAX_PLAYERS && humansReady;
  const slots = Array.from({ length: MAX_PLAYERS }, (_, index) => players[index]);

  return (
    <main className="host-page host-page--setup">
      <Ambience />
      <header className="host-header">
        <div className="host-header__brand"><BrandMark /><p>Versammelt eure Gefährten.</p></div>
        <div className="host-header__status">
          <span className="host-header__label">SPIELRAUM</span>
          <strong>{room?.code ?? "WIRD ERSCHAFFEN"}</strong>
          <ConnectionBadge connected={connected} />
        </div>
      </header>

      <section className="setup-layout">
        <aside className="join-panel join-panel--compact">
          <div className="join-panel__heading">
            <span className="ornament" aria-hidden="true">◆</span>
            <div><p className="eyebrow">Smartphone</p><h2>Beitreten</h2></div>
          </div>
          <div className="qr-frame qr-frame--compact">
            {controllerUrl ? (
              <QRCodeSVG
                value={controllerUrl}
                size={166}
                level="M"
                bgColor="#f4eddc"
                fgColor="#11121b"
                marginSize={2}
                title={`Beitritt zum Spielraum ${room?.code ?? "Valenør"}`}
              />
            ) : <div className="qr-placeholder qr-placeholder--compact"><span /></div>}
          </div>
          <p className="join-panel__instruction">QR-Code scannen</p>
          <div className="room-code">{room?.code ?? "VAL-····"}</div>
          <p className="join-panel__url">{controllerUrl || "Netzwerkadresse wird ermittelt …"}</p>
        </aside>

        <section className="party-panel party-panel--setup">
          <div className="party-panel__topline">
            <div><p className="eyebrow">Eure Gemeinschaft</p><h2>Gefährten</h2></div>
            <span className="player-count"><strong>{players.length}</strong> / {MAX_PLAYERS} Spieler</span>
          </div>
          <div className="player-grid player-grid--setup">
            {slots.map((player, index) => (
              <PlayerSlot
                key={player?.id ?? index}
                player={player}
                index={index}
                onAddComputer={() => mutateRoom("add")}
                onRemovePlayer={(playerId) => mutateRoom("remove", playerId)}
                disabled={busy || !connected}
              />
            ))}
          </div>
          <div className="party-legend">
            <span><i className="legend-human" /> Smartphone-Spieler</span>
            <span><i className="legend-computer" /> Serverseitiger Computer</span>
          </div>
        </section>

        <div className="setup-final-column">
          <GameModeSelector
            config={room?.config ?? { mode: "chronicles" }}
            onChange={(config) => mutateRoom("config", config)}
            disabled={busy || !connected || !room}
          />
          <section className="start-panel">
            <div>
              <p className="eyebrow">Das Tor erwartet euch</p>
              <p>{canStart ? "Die Gemeinschaft ist bereit." : !humansReady ? "Alle verbundenen Menschen müssen bereit sein." : "Mindestens zwei Teilnehmer und ein Mensch werden benötigt."}</p>
            </div>
            <button
              className="primary-button primary-button--wide"
              type="button"
              data-audio-cue="UI_CONFIRM"
              disabled={!canStart || !connected || busy}
              onClick={startAdventure}
            >
              <span aria-hidden="true">✦</span>
              Abenteuer beginnen
              <span aria-hidden="true">✦</span>
            </button>
          </section>
        </div>
      </section>

      {signal && (
        <div className={`magic-toast magic-toast--${signal.color}`} role="status">
          <span className="magic-toast__glyph" aria-hidden="true">✦</span>
          <div><strong>{signal.playerName}</strong> sendet ein magisches Signal</div>
        </div>
      )}
      {error && <div className="error-toast" role="alert">{error}</div>}
      <footer className="host-footer">CHRONIKEN VON VALENØR · SPIELVORBEREITUNG</footer>
    </main>
  );
}
