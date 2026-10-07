import { useEffect, useRef, useState } from "react";
import type { GameState } from "@valenor/shared";
import { WorldStatus } from "../components/WorldStatus";
import { QuickGameClockDisplay } from "../components/QuickGameClockDisplay";
import { CHARACTER_ASSETS } from "./assets/asset-manifest";

function GoldAmount({ gold }: { gold: number }) {
  const previous = useRef(gold);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const difference = gold - previous.current;
    previous.current = gold;
    if (difference === 0) return;
    setDelta(difference);
    const timer = window.setTimeout(() => setDelta(0), 1_800);
    return () => window.clearTimeout(timer);
  }, [gold]);
  return <b><i className="valenor-coin" aria-hidden="true">V</i>{gold.toLocaleString("de-DE")} <small>Gold</small>{delta !== 0 && <span className={`gold-delta ${delta > 0 ? "is-positive" : "is-negative"}`}>{delta > 0 ? "+" : ""}{delta}</span>}</b>;
}

const MINIATURE_SIGILS = ["♞", "➶", "✧", "⚒"];

function PlayerPortrait({ index }: { index: number }) {
  const [failed, setFailed] = useState(false);
  const asset = CHARACTER_ASSETS[index];
  return <span className="hud-player__portrait" aria-hidden="true">
    {asset && !failed ? <img src={asset.path} alt="" onError={() => setFailed(true)} /> : MINIATURE_SIGILS[index] ?? "✦"}
  </span>;
}

export function GameHud({ gameState }: { gameState: GameState }) {
  const modeLabel = gameState.config.mode === "quick"
    ? `Schnelles Abenteuer · ${gameState.config.quickGameDurationMinutes} Min`
    : "Chroniken-Modus";
  const displayedPlayers = gameState.turnOrder.length
    ? gameState.turnOrder.map((id) => gameState.players.find((player) => player.id === id)!).filter(Boolean)
    : gameState.players;

  return (
    <div className="game-hud">
      <div className="game-hud__status">
        <div><span>RUNDE</span><b>{gameState.currentRound}</b><span>ZUG</span><b>{gameState.turnNumber || "–"}</b></div>
        <small>{modeLabel}</small>
      </div>
      <QuickGameClockDisplay clock={gameState.quickGameClock} />
      <div className="game-hud__players">
        {displayedPlayers.map((player, index) => (
          <article key={player.id} className={`hud-player hud-player--${player.color} ${gameState.currentPlayerId === player.id ? "is-active" : ""} ${player.isBankrupt ? "is-bankrupt" : ""}`}>
            {gameState.turnOrder.length > 0 && <em>{index + 1}</em>}
            <PlayerPortrait index={gameState.players.findIndex(candidate => candidate.id === player.id)} />
            <div>
              <strong>{player.name}</strong>
              <span>{player.isBankrupt ? "Zuschauer" : player.dungeon.inDungeon ? `Im Kerker · ${player.dungeon.failedAttempts}/3` : player.type === "computer" ? "NPC" : "Mensch"} · {gameState.propertyOwnerships.filter((entry) => entry.ownerId === player.id).length} Besitz</span>
            </div>
            <GoldAmount gold={player.gold} />
          </article>
        ))}

        <WorldStatus state={gameState} />
      </div>

    </div>
  );
}
