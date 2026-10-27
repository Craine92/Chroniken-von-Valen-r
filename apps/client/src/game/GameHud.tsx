import { useEffect, useRef, useState } from "react";
import type { GameState } from "@valenor/shared";
import { WorldStatus } from "../components/WorldStatus";
import { QuickGameClockDisplay } from "../components/QuickGameClockDisplay";
import { PlayerPortrait } from "../components/PlayerPortrait";
import { Icon } from "../components/icons/Icon";

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
  return <b><Icon name="gold" className="hud-gold-icon" />{gold.toLocaleString("de-DE")} <small>Gold</small>{delta !== 0 && <span className={`gold-delta ${delta > 0 ? "is-positive" : "is-negative"}`}>{delta > 0 ? "+" : ""}{delta}</span>}</b>;
}

export function GameHud({ gameState }: { gameState: GameState }) {
  const displayedPlayers = gameState.turnOrder.length
    ? gameState.turnOrder.map((id) => gameState.players.find((player) => player.id === id)!).filter(Boolean)
    : gameState.players;

  return (
    <div className={`game-hud${displayedPlayers.length >= 5 ? " game-hud--compact" : ""}`}>
      <div className="game-hud__status">
        <div><span>RUNDE</span><b>{gameState.currentRound}</b></div>
      </div>
      <QuickGameClockDisplay clock={gameState.quickGameClock} />
      <div className="game-hud__players">
        {displayedPlayers.map((player, index) => (
          <article key={player.id} className={`hud-player hud-player--${player.color} ${gameState.currentPlayerId === player.id ? "is-active" : ""} ${player.isBankrupt ? "is-bankrupt" : ""}`}>
            {gameState.turnOrder.length > 0 && <em>{index + 1}</em>}
            <PlayerPortrait characterId={player.characterId} />
            <div>
              <strong>{player.name}</strong>
              {/* Auf dem TV nur Ausnahmen zeigen; Besitz und Spielertyp stehen auf dem Handy. */}
              {(player.isBankrupt || player.dungeon.inDungeon) && <span>{player.isBankrupt ? "Zuschauer" : `Im Kerker · ${player.dungeon.failedAttempts}/3`}</span>}
            </div>
            <GoldAmount gold={player.gold} />
          </article>
        ))}

        <WorldStatus state={gameState} />
      </div>

    </div>
  );
}
