import { useEffect, useRef, useState } from "react";
import { BOARD_TILES, describeCardEffects, getCardDefinition, getEffectivePurchasePrice, getEffectiveRent, getBuildingName, getPropertyGroup, getActiveChronicleEvent, getChronicleRegionLabel, getChronicleRoundsRemaining, type GameState } from "@valenor/shared";
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

export const BOARD_CONTEXT_DURATION_MS = 4_000;
export interface BoardContext { kind: string; eyebrow: string; title: string; lines: string[]; gold?: number; goldLabel?: string; stats?: Array<{label: string; value: string}> }
export function getCurrentBoardContext(state: GameState, now = Date.now(), landingVisible = true): BoardContext {
  const current = state.players.find(player => player.id === state.currentPlayerId);
  const neutral: BoardContext = { kind: "neutral", eyebrow: "AM ZUG", title: current?.name ?? "Valenør",
    lines: [state.status === "finished" ? "Die Chronik ist entschieden." : state.turnPhase === "waitingForRoll" ? "Bereit zum Würfeln" : "Das nächste Kapitel wartet."],
    ...(current && state.status === "playing" ? {stats:[{label:"Gold",value:current.gold.toLocaleString("de-DE")},{label:"Besitz",value:String(state.propertyOwnerships.filter(entry=>entry.ownerId===current.id).length)},{label:"Aufträge",value:String(current.activeQuests?.length ?? 0)},{label:"Relikte",value:String(current.relics?.length ?? 0)},{label:"Runde",value:String(state.currentRound)}]} : {}) };
  if (state.status !== "playing") return neutral;
  const tavern = state.tavern?.turnNumber === state.turnNumber && state.tavern.playerId === state.currentPlayerId ? state.tavern : undefined;
  if (tavern && (["tavernDecision","tavernRolling"].includes(state.turnPhase) || state.turnPhase === "waitingForEndTurn" && now - (tavern.resolvedAt ?? 0) < BOARD_CONTEXT_DURATION_MS)) {
    return {kind:"tavern",eyebrow:"TAVERNE AM WELTENWEG",title:tavern.status === "decision" ? "Pott nehmen oder riskieren?" : tavern.status === "rolling" ? "Doppelt oder Nix!" : tavern.choice === "take" ? "Pott gesichert!" : tavern.payout ? "DOPPELT!" : "VERZOCKT!",
      lines:[current?.name ?? "",tavern.status === "decision" ? "Wählt: Pott nehmen oder Doppelt oder Nix" : tavern.status === "rolling" ? "Wählt: DOPPELT ODER NIX" : tavern.payout ? "Das Glück ist mit dir." : "BLEIBEN IM POTT"],gold:tavern.payout || tavern.pot,goldLabel:tavern.status === "resolved" && tavern.payout ? "GEWINN" : "POTT"};
  }
  if (state.activeCard?.playerId === state.currentPlayerId && state.activeCard) {const card=getCardDefinition(state.activeCard.cardId);return {kind:"card",eyebrow:card.deck === "adventure" ? "ABENTEUER" : "SCHICKSAL",title:card.title,lines:[describeCardEffects(card)]};}
  const fresh = (kind: GameState["economyLog"][number]["kind"]) => state.economyLog.filter(entry => entry.kind === kind && entry.playerIds.includes(state.currentPlayerId ?? "") && now - entry.createdAt < BOARD_CONTEXT_DURATION_MS).at(-1);
  const purchase = fresh("purchase");
  const purchasedTile = state.lastMovement && state.lastMovement.playerId === current?.id ? BOARD_TILES[state.lastMovement.to] : undefined;
  if (purchase && purchasedTile && purchase.message.includes(purchasedTile.name) && !["rolling","moving","cardMoving","waitingForRoll"].includes(state.turnPhase)) return {kind:"purchase",eyebrow:"ERWORBEN",title:current?.name ?? "",lines:["kauft",purchasedTile.name],gold:Math.abs(purchase.amount ?? 0),goldLabel:"KAUFPREIS"};
  const trade = state.lastTradeAction;
  if (trade && now - trade.createdAt < BOARD_CONTEXT_DURATION_MS) {
    const offer = state.trades.filter(entry=>entry.proposerId===trade.proposerId && entry.recipientId===trade.recipientId).at(-1);
    return {kind:"trade",eyebrow:"HANDEL",title:`${state.players.find(player=>player.id===trade.proposerId)?.name ?? ""} ↔ ${state.players.find(player=>player.id===trade.recipientId)?.name ?? ""}`,
      lines:[trade.type === "accepted" ? "ANGENOMMEN" : offer?.counterToTradeId ? "GEGENANGEBOT" : "ANGEBOT"]};
  }
  const dragon=fresh("dragon");if(dragon)return {kind:"dragon",eyebrow:"DRACHENBEGEGNUNG",title:"Hüter der Relikte",lines:[dragon.message]};
  const movement=state.lastMovement?.playerId === state.currentPlayerId ? state.lastMovement : undefined;
  const tile=movement ? BOARD_TILES[movement.to] : undefined;
  const payment=state.pendingPayment;
  if(tile?.economy && (landingVisible && !["rolling","moving","cardMoving","waitingForRoll","turnTransition"].includes(state.turnPhase) || ["propertyDecision","auction","paymentRequired"].includes(state.turnPhase) || purchase)) {
    const owned=state.propertyOwnerships.find(entry=>entry.tileIndex===tile.index), owner=state.players.find(player=>player.id===owned?.ownerId);
    return {kind:purchase ? "purchase" : "landing",eyebrow:purchase ? `${current?.name} KAUFT` : `${current?.name} LANDET AUF`,title:tile.name,
      lines:[getPropertyGroup(tile.propertyGroupId)?.displayName ?? (tile.type === "harbor" ? "Hafen" : "Versorgung"), owned ? `Besitz: ${owner?.name ?? "Unbekannt"}` : "FREI",...(owned ? [`Baustufe ${owned.buildingLevel}${owned.mortgaged ? " · BELEHNT" : tile.region && owned.buildingLevel ? ` · ${getBuildingName(tile.region,owned.buildingLevel)}` : ""}`] : [])],
      gold:purchase ? Math.abs(purchase.amount ?? 0) : payment && payment.payerId === current?.id ? payment.amount : owned ? owned.ownerId === current?.id ? 0 : getEffectiveRent(state,tile,owned.ownerId) : getEffectivePurchasePrice(state,tile,current?.id),
      goldLabel:purchase ? "KAUFPREIS" : payment ? "ZAHLUNG" : owned ? "MIETE" : "KAUFPREIS"};
  }
  const building=state.lastBuildingAction;
  if(building && now-building.createdAt<BOARD_CONTEXT_DURATION_MS)return {kind:"building",eyebrow:building.type === "build" ? "BAUWERK ERRICHTET" : "BAUSTUFE VERKAUFT",title:BOARD_TILES[building.tileIndex]!.name,lines:[state.players.find(player=>player.id===building.playerId)?.name ?? "",`Baustufe ${building.toLevel}`],gold:building.amount,goldLabel:building.type === "build" ? "BAUKOSTEN" : "ERLÖS"};
  if(tile && landingVisible && !["rolling","moving","cardMoving","waitingForRoll","turnTransition"].includes(state.turnPhase))return {kind:"target",eyebrow:`${current?.name} LANDET AUF`,title:tile.name,lines:["Das aktuelle Zielfeld"]};
  const chronicle=getActiveChronicleEvent(state);
  if(chronicle && now-chronicle.startedAt<BOARD_CONTEXT_DURATION_MS)return {kind:"chronicle",eyebrow:"CHRONIK",title:chronicle.title,lines:[getChronicleRegionLabel(chronicle) ?? "",chronicle.effectSummary ?? ""]};
  return neutral;
}

export function GameHud({ gameState }: { gameState: GameState }) {
  const [contextNow,setContextNow]=useState(Date.now());
  const landing=useRef({key:"",until:0});
  const movementKey=gameState.lastMovement ? `${gameState.turnNumber}:${gameState.lastMovement.sequence ?? gameState.turnContext.rollSequence}` : "";
  if(landing.current.key!==movementKey)landing.current={key:movementKey,until:0};
  if(!landing.current.until && gameState.lastMovement?.playerId===gameState.currentPlayerId && !["moving","rolling","cardMoving","waitingForRoll"].includes(gameState.turnPhase))landing.current.until=Date.now()+BOARD_CONTEXT_DURATION_MS;
  useEffect(()=>setContextNow(Date.now()),[gameState]);
  useEffect(()=>{
    const deadlines=[landing.current.until,...gameState.economyLog.map(entry=>entry.createdAt+BOARD_CONTEXT_DURATION_MS),(gameState.lastBuildingAction?.createdAt ?? 0)+BOARD_CONTEXT_DURATION_MS,(gameState.lastTradeAction?.createdAt ?? 0)+BOARD_CONTEXT_DURATION_MS,(gameState.activeChronicleEvent?.startedAt ?? 0)+BOARD_CONTEXT_DURATION_MS,(gameState.tavern?.resolvedAt ?? 0)+BOARD_CONTEXT_DURATION_MS].filter(time=>time>contextNow);
    if(!deadlines.length)return;
    const timer=window.setTimeout(()=>setContextNow(Date.now()),Math.max(0,Math.min(...deadlines)-Date.now()+20));return()=>window.clearTimeout(timer);
  },[gameState,contextNow]);
  const context=getCurrentBoardContext(gameState,contextNow,landing.current.until>contextNow);
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
            <PlayerPortrait index={gameState.players.findIndex(candidate => candidate.id === player.id)} />
            <div>
              <strong>{player.name}</strong>
              <span>{player.isBankrupt ? "Zuschauer" : player.dungeon.inDungeon ? `Im Kerker · ${player.dungeon.failedAttempts}/3` : player.type === "computer" ? "NPC" : "Mensch"} · {gameState.propertyOwnerships.filter((entry) => entry.ownerId === player.id).length} Besitz</span>
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
      <aside className="game-hud__context" aria-live="polite" data-context-kind={context.kind}>
        <small>AKTUELLES GESCHEHEN</small><span>{context.eyebrow}</span><strong key={`${context.kind}:${context.title}`}>{context.title}</strong>
        {context.kind === "neutral" && current && <div className="game-hud__context-portrait"><PlayerPortrait index={gameState.players.findIndex(player=>player.id===current.id)} /></div>}
        {context.stats && <dl className="game-hud__context-stats">{context.stats.map(stat=><div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
        {context.lines.filter(Boolean).map((line,index)=><p key={index}>{line}</p>)}
        {context.gold !== undefined && <div className="game-hud__context-gold"><small>{context.goldLabel}</small><b>{context.gold} GOLD</b></div>}
      </aside>
    </div>
  );
}
