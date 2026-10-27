import { lazy, Suspense, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { MIN_PLAYERS, MAX_PLAYERS, type GameConfig, type GameRoom, type MagicSignal } from "@valenor/shared";
import { Ambience } from "../components/Ambience";
import { BrandMark } from "../components/BrandMark";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { GameModeSelector } from "../components/GameModeSelector";
import { PlayerSlot } from "../components/PlayerSlot";
import { CODEX_COLORS } from "../game/design-tokens";
import { LOBBY_ASSETS } from "../game/assets/asset-manifest";
import { Icon } from "../components/icons/Icon";

const CreditsOverlay = lazy(() => import("../components/credits/CreditsOverlay"));

export interface HostLobbyProps {
  room: GameRoom | undefined;
  controllerUrl: string;
  connected: boolean;
  busy: boolean;
  signal?: MagicSignal | undefined;
  error: string;
  creditsOpen: boolean;
  onAddComputer: () => void;
  onRemovePlayer: (playerId: string) => void;
  onConfigChange: (config: GameConfig) => void;
  onStart: () => void;
  onOpenCredits: () => void;
  onCloseCredits: () => void;
}

/** Die TV-Lobby ohne Verbindungslogik: Titelbild, Beitritt per QR-Code, Gefährten und Spielmodus. */
export function HostLobby({ room, controllerUrl, connected, busy, signal, error, creditsOpen, onAddComputer, onRemovePlayer, onConfigChange, onStart, onOpenCredits, onCloseCredits }: HostLobbyProps) {
  const players = room?.players ?? [];
  const connectedHumans = players.filter(
    (player) => player.type === "human" && player.connectionState === "connected"
  ).length;
  const humansReady = players.filter(player => player.type === "human" && player.connectionState === "connected").every(player => player.ready);
  const canStart = players.length >= MIN_PLAYERS && connectedHumans >= 1 && players.length <= MAX_PLAYERS && humansReady;
  const slots = Array.from({ length: MAX_PLAYERS }, (_, index) => players[index]);

  return (
    <main className="host-page host-page--setup host-page--title" style={{ "--lobby-title-image": `url("${LOBBY_ASSETS.title.path}")` } as CSSProperties}>
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
            <span className="ornament" aria-hidden="true"><Icon name="seal" /></span>
            <div><p className="eyebrow">Smartphone</p><h2>Beitreten</h2></div>
          </div>
          <div className="qr-frame qr-frame--compact">
            {controllerUrl ? (
              <QRCodeSVG
                value={controllerUrl}
                size={166}
                level="M"
                bgColor={CODEX_COLORS.parchment50}
                fgColor={CODEX_COLORS.ink900}
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
                onAddComputer={onAddComputer}
                onRemovePlayer={onRemovePlayer}
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
            onChange={onConfigChange}
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
              onClick={onStart}
            >
              <span aria-hidden="true"><Icon name="magic" /></span>
              Abenteuer beginnen
              <span aria-hidden="true"><Icon name="magic" /></span>
            </button>
          </section>
        </div>
      </section>

      {signal && (
        <div className={`magic-toast magic-toast--${signal.color}`} role="status">
          <span className="magic-toast__glyph" aria-hidden="true"><Icon name="magic" /></span>
          <div><strong>{signal.playerName}</strong> sendet ein magisches Signal</div>
        </div>
      )}
      {error && <div className="error-toast" role="alert">{error}</div>}
      <footer className="host-footer"><span>CHRONIKEN VON VALENØR · SPIELVORBEREITUNG</span><button type="button" className="host-footer__credits" onClick={onOpenCredits}>Mitwirkende</button></footer>
      {creditsOpen && <Suspense fallback={null}><CreditsOverlay onClose={onCloseCredits} /></Suspense>}
    </main>
  );
}
