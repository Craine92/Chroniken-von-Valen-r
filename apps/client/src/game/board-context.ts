import { useEffect, useRef, useState } from "react";
import { BOARD_TILES, describeCardEffects, getCardDefinition, getEffectivePurchasePrice, getEffectiveRent, getBuildingName, getPropertyGroup, getActiveChronicleEvent, getChronicleRegionLabel, type GameState } from "@valenor/shared";

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


export function useCurrentBoardContext(gameState: GameState): BoardContext {
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
  return getCurrentBoardContext(gameState,Date.now(),landing.current.until>Date.now());
}
