import { useEffect, useRef, useState } from "react";
import { BOARD_TILES, getActiveChronicleEvent, getChronicleRegionLabel, getChronicleRoundsRemaining, type GameState } from "@valenor/shared";
import { QuickGameClockDisplay } from "../components/QuickGameClockDisplay";

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

export function GameHud({ gameState }: { gameState: GameState }) {
  const chronicle = gameState.status === "playing" ? getActiveChronicleEvent(gameState) : undefined;
  const modeLabel = gameState.config.mode === "quick"
    ? `Schnelles Abenteuer · ${gameState.config.quickGameDurationMinutes} Min`
    : "Chroniken-Modus";
  const displayedPlayers = gameState.turnOrder.length
    ? gameState.turnOrder.map((id) => gameState.players.find((player) => player.id === id)!).filter(Boolean)
    : gameState.players;
  const current = gameState.players.find((player) => player.id === gameState.currentPlayerId);
  const turnDescription = current
    ? gameState.turnPhase === "dungeonDecision"
      ? `${current.name} sitzt im Dunklen Kerker`
      : `${current.name} ${gameState.turnPhase === "waitingForRoll" ? "ist am Zug" : ["rolling", "dungeonRolling", "moving"].includes(gameState.turnPhase) ? "würfelt" : "ist gelandet"}`
    : "Die Reihenfolge wird bestimmt";

  return (
    <div className="game-hud">
      <div className="game-hud__status">
        <div><span>RUNDE</span><b>{gameState.currentRound}</b><span>ZUG</span><b>{gameState.turnNumber || "–"}</b></div>
        <small>{modeLabel}</small>
        <strong><i aria-hidden="true">♞</i>{turnDescription}</strong>
      </div>
      <QuickGameClockDisplay clock={gameState.quickGameClock} />
      <div className="game-hud__players">
        {displayedPlayers.map((player, index) => (
          <article key={player.id} className={`hud-player hud-player--${player.color} ${gameState.currentPlayerId === player.id ? "is-active" : ""} ${player.isBankrupt ? "is-bankrupt" : ""}`}>
            {gameState.turnOrder.length > 0 && <em>{index + 1}</em>}
            <span className="hud-player__portrait" aria-hidden="true">{MINIATURE_SIGILS[index] ?? "✦"}</span>
            <div>
              <strong>{player.name}</strong>
              <span>{player.isBankrupt ? "Zuschauer" : player.dungeon.inDungeon ? `Im Kerker · ${player.dungeon.failedAttempts}/3` : player.type === "computer" ? "Computer" : "Mensch"} · {gameState.propertyOwnerships.filter((entry) => entry.ownerId === player.id).length} Besitz</span>
            </div>
            <GoldAmount gold={player.gold} />
          </article>
        ))}
        {chronicle && <aside className="active-chronicle" role="status">
          <small>AKTIVE CHRONIK</small>
          <strong>{chronicle.title}</strong>
          {getChronicleRegionLabel(chronicle) && <span className="active-chronicle__regions">{getChronicleRegionLabel(chronicle)}</span>}
          <span className="active-chronicle__effect">{chronicle.effectSummary}</span>
          <span>Noch {getChronicleRoundsRemaining(gameState)} {getChronicleRoundsRemaining(gameState) === 1 ? "Runde" : "Runden"}</span>
        </aside>}
        <aside className="weltenweg-pot" role="status" aria-label="Weltenweg-Pott">
          <small>WELTENWEG-POTT</small>
          <strong>{(gameState.weltenwegPot ?? 0).toLocaleString("de-DE")} GOLD</strong>
        </aside>
        {gameState.wanderingDragon && <aside className="wandering-dragon" role="status">
          <small>WANDERNDER DRACHE</small>
          <strong>Bei: {BOARD_TILES[gameState.wanderingDragon.tileIndex]?.name}</strong>
        </aside>}
      </div>
    </div>
  );
}
