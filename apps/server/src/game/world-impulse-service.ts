import { randomInt, randomUUID } from "node:crypto";
import {
  BOARD_TILES,
  WORLD_IMPULSE_DEFINITIONS,
  getPropertyGroupTiles,
  getWorldImpulseDefinition,
  isBuyableTile,
  type ActiveWorldImpulse,
  type GameState,
  type WorldImpulseChoice,
  type WorldImpulseDefinition,
  type WorldImpulseId
} from "@valenor/shared";
import { moveWanderingDragonNow } from "./chronicle-event-service";
import { recordPotThreshold } from "./momentum-celebration-service";

type ChooseIndex = (count: number) => number;

function freeBuyableTiles(state: GameState) {
  return BOARD_TILES.filter(tile => isBuyableTile(tile) && !state.propertyOwnerships.some(entry => entry.tileIndex === tile.index));
}

function hasBuildableGroup(state: GameState): boolean {
  return state.players.some(player => !player.isBankrupt && BOARD_TILES.some(tile => {
    if (tile.type !== "property" || !tile.propertyGroup) return false;
    const group = getPropertyGroupTiles(tile.propertyGroup);
    return group.length > 0 && group.every(groupTile => {
      const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === groupTile.index);
      return ownership?.ownerId === player.id && !ownership.mortgaged;
    }) && group.some(groupTile => (state.propertyOwnerships.find(entry => entry.tileIndex === groupTile.index)?.buildingLevel ?? 0) < 5);
  }));
}

export function isWorldImpulseApplicable(state: GameState, id: WorldImpulseId): boolean {
  switch (id) {
    case "marketCry": return freeBuyableTiles(state).length > 0;
    case "dragonCall": return Boolean(state.wanderingDragon);
    case "runeSpark": return !state.worldImpulseEffects?.runeSpark;
    case "buildingFervor": return !state.worldImpulseEffects?.buildingFervor && hasBuildableGroup(state);
    case "harborWind": return state.worldImpulseEffects?.harborWindUntilRound === undefined && state.propertyOwnerships.some(entry => BOARD_TILES[entry.tileIndex]?.type === "harbor" && !entry.mortgaged);
    case "twistOfFate": return !state.worldImpulseEffects?.twistOfFate;
    case "merchantLuck": return !state.worldImpulseEffects?.merchantLuck && freeBuyableTiles(state).length > 0;
    case "crownFavor":
    case "goldenMoment": return state.players.some(player => !player.isBankrupt);
    default: return true;
  }
}

function weightedChoice(definitions: readonly WorldImpulseDefinition[], chooseIndex: ChooseIndex): WorldImpulseDefinition {
  const weighted = definitions.flatMap(definition => Array.from({ length: definition.weight }, () => definition));
  return weighted[chooseIndex(weighted.length)]!;
}

function setImpulse(state: GameState, definition: WorldImpulseDefinition): ActiveWorldImpulse {
  const impulse: ActiveWorldImpulse = {
    ...definition, startedAfterRound: state.currentRound - 1, startedAtRound: state.currentRound,
    startedAt: Date.now(), status: "active"
  };
  state.activeWorldImpulse = impulse;
  (state.worldImpulseHistory ??= []).push(impulse);
  state.worldImpulseHistory = state.worldImpulseHistory.slice(-12);
  return impulse;
}

function findActiveImpulse(state: GameState, id: WorldImpulseId): ActiveWorldImpulse | undefined {
  return state.worldImpulseHistory?.slice().reverse().find(entry => entry.id === id && entry.status === "active");
}

export function updateWorldImpulse(state: GameState, id: WorldImpulseId, patch: Partial<ActiveWorldImpulse>): void {
  const impulse = findActiveImpulse(state, id);
  if (!impulse) return;
  Object.assign(impulse, patch);
  if (state.activeWorldImpulse?.startedAt === impulse.startedAt && state.activeWorldImpulse.id === impulse.id) Object.assign(state.activeWorldImpulse, patch);
}

export function resolveWorldImpulse(state: GameState, resultText?: string, id?: WorldImpulseId): void {
  const targetId = id ?? state.activeWorldImpulse?.id;
  if (!targetId) return;
  const impulse = findActiveImpulse(state, targetId);
  if (!impulse) return;
  impulse.status = "resolved";
  impulse.resolvedAt = Date.now();
  if (resultText) impulse.resultText = resultText;
  if (state.activeWorldImpulse?.startedAt === impulse.startedAt && state.activeWorldImpulse.id === impulse.id) Object.assign(state.activeWorldImpulse, impulse);
  state.lastWorldImpulseResolution = {
    impulseId: targetId, resolvedAt: impulse.resolvedAt,
    ...(impulse.targetPlayerId ? { targetPlayerId: impulse.targetPlayerId } : {}),
    ...(impulse.resultGold !== undefined ? { resultGold: impulse.resultGold } : {}),
    ...(impulse.resultDie !== undefined ? { resultDie: impulse.resultDie } : {}),
    ...(resultText ? { resultText } : {})
  };
}

export function cleanupWorldImpulseEffects(state: GameState): void {
  const effects = state.worldImpulseEffects;
  if (!effects) return;
  if (effects.harborWindUntilRound !== undefined && state.currentRound > effects.harborWindUntilRound) {
    delete effects.harborWindUntilRound;
    resolveWorldImpulse(state, "Der Hafenwind ist verklungen.", "harborWind");
  }
}

function startMarketCryAuction(state: GameState, tileIndex: number): void {
  state.auction = {
    tileIndex, currentBid: 0,
    participantIds: state.players.filter(player => !player.isBankrupt).map(player => player.id),
    withdrawnPlayerIds: [],
    pausedForPlayerIds: state.players.filter(player => !player.isBankrupt && player.type === "human" && player.connectionState === "disconnected").map(player => player.id),
    revision: 0, source: "worldImpulse"
  };
  state.turnPhase = "auction";
}

export function applyWorldImpulse(state: GameState, id: WorldImpulseId, chooseIndex: ChooseIndex = randomInt, deferBlocking = false): boolean {
  if (!isWorldImpulseApplicable(state, id)) return false;
  const definition = getWorldImpulseDefinition(id);
  const impulse = setImpulse(state, definition);
  const effects = state.worldImpulseEffects ??= {};
  switch (id) {
    case "marketCry": {
      const tile = freeBuyableTiles(state)[chooseIndex(freeBuyableTiles(state).length)]!;
      impulse.targetTileIndex = tile.index;
      impulse.effectSummary = `${tile.name} wird versteigert!`;
      if (deferBlocking) state.pendingWorldImpulseActivation = true;
      else startMarketCryAuction(state, tile.index);
      break;
    }
    case "dragonCall":
      moveWanderingDragonNow(state, chooseIndex);
      resolveWorldImpulse(state, "Der Hüter ist weitergezogen.", "dragonCall");
      break;
    case "runeSpark": effects.runeSpark = true; break;
    case "worldwayDonation": {
      const previous = state.weltenwegPot ?? 0;
      state.weltenwegPot = previous + 100;
      recordPotThreshold(state, previous, state.weltenwegPot);
      resolveWorldImpulse(state, "+100 Gold im Weltenweg-Pott", "worldwayDonation");
      break;
    }
    case "buildingFervor": effects.buildingFervor = true; break;
    case "harborWind":
      effects.harborWindUntilRound = state.currentRound;
      impulse.expiresAtRound = state.currentRound + 1;
      break;
    case "crownFavor": {
      const active = state.players.filter(player => !player.isBankrupt);
      const minimum = Math.min(...active.map(player => player.gold));
      const poorest = active.filter(player => player.gold === minimum);
      const player = poorest[chooseIndex(poorest.length)]!;
      player.gold += 100;
      impulse.targetPlayerId = player.id;
      impulse.resultGold = 100;
      impulse.effectSummary = `${player.name} erhält 100 Gold.`;
      resolveWorldImpulse(state, `+100 Gold für ${player.name}`, "crownFavor");
      break;
    }
    case "twistOfFate": effects.twistOfFate = true; break;
    case "merchantLuck": effects.merchantLuck = true; break;
    case "goldenMoment": {
      const active = state.players.filter(player => !player.isBankrupt);
      const player = active[chooseIndex(active.length)]!;
      impulse.targetPlayerId = player.id;
      impulse.effectSummary = `${player.name}: 50 Gold sicher oder Risiko?`;
      if (deferBlocking) state.pendingWorldImpulseActivation = true;
      else {
        state.pendingWorldImpulseDecision = { impulseId: id, playerId: player.id, status: "decision" };
        state.turnPhase = "worldImpulseDecision";
      }
      break;
    }
  }
  state.economyLog.push({ id: randomUUID(), kind: "system", message: `Weltimpuls: ${impulse.title} – ${impulse.effectSummary}`, playerIds: impulse.targetPlayerId ? [impulse.targetPlayerId] : [], createdAt: impulse.startedAt });
  state.economyLog = state.economyLog.slice(-12);
  return true;
}

export function advanceWorldImpulses(state: GameState, chronicleStarted: boolean, chooseIndex: ChooseIndex = randomInt): boolean {
  cleanupWorldImpulseEffects(state);
  // New games opt in with an initialized history; legacy/incomplete snapshots keep their old flow.
  if (!state.worldImpulseHistory || state.status !== "playing" || chronicleStarted || state.currentRound <= 1) return false;
  const previous = state.worldImpulseHistory?.at(-1);
  if (previous && state.currentRound - previous.startedAtRound < 2) return false;
  const candidates = WORLD_IMPULSE_DEFINITIONS.filter(definition => definition.id !== previous?.id && isWorldImpulseApplicable(state, definition.id));
  if (!candidates.length) return false;
  return applyWorldImpulse(state, weightedChoice(candidates, chooseIndex).id, chooseIndex, true);
}

export function activateDeferredWorldImpulse(state: GameState): boolean {
  if (!state.pendingWorldImpulseActivation || !state.activeWorldImpulse) return false;
  delete state.pendingWorldImpulseActivation;
  const impulse = state.activeWorldImpulse;
  if (impulse.id === "marketCry" && impulse.targetTileIndex !== undefined) {
    startMarketCryAuction(state, impulse.targetTileIndex);
    return true;
  }
  if (impulse.id === "goldenMoment" && impulse.targetPlayerId) {
    state.pendingWorldImpulseDecision = { impulseId: "goldenMoment", playerId: impulse.targetPlayerId, status: "decision" };
    state.turnPhase = "worldImpulseDecision";
    return true;
  }
  return false;
}

export function chooseGoldenMoment(state: GameState, playerId: string, choice: WorldImpulseChoice): void {
  const pending = state.pendingWorldImpulseDecision;
  if (state.turnPhase !== "worldImpulseDecision" || pending?.impulseId !== "goldenMoment" || pending.playerId !== playerId || pending.status !== "decision") {
    throw new Error("Diese Weltimpuls-Entscheidung ist nicht offen.");
  }
  if (choice === "safe") {
    const player = state.players.find(entry => entry.id === playerId)!;
    player.gold += 50;
    delete state.pendingWorldImpulseDecision;
    updateWorldImpulse(state, "goldenMoment", { targetPlayerId: player.id, resultGold: 50 });
    resolveWorldImpulse(state, `${player.name} nimmt 50 Gold sicher.`, "goldenMoment");
    state.turnPhase = "turnTransition";
    return;
  }
  if (choice !== "risk") throw new Error("Diese Wahl gehört nicht zum Goldenen Augenblick.");
  pending.status = "rolling";
  state.turnPhase = "worldImpulseRolling";
}

export function resolveGoldenMomentRisk(state: GameState, rollDie: () => number): void {
  const pending = state.pendingWorldImpulseDecision;
  if (state.turnPhase !== "worldImpulseRolling" || pending?.impulseId !== "goldenMoment" || pending.status !== "rolling") {
    throw new Error("Der Risikowurf ist nicht bereit.");
  }
  const die = rollDie();
  if (!Number.isInteger(die) || die < 1 || die > 6) throw new Error("Der Risikowurf ist ungültig.");
  const payout = die <= 2 ? 0 : die <= 4 ? 75 : 150;
  const player = state.players.find(entry => entry.id === pending.playerId)!;
  player.gold += payout;
  pending.die = die;
  pending.payout = payout;
  updateWorldImpulse(state, "goldenMoment", { targetPlayerId: player.id, resultDie: die, resultGold: payout });
  resolveWorldImpulse(state, `${player.name} würfelt ${die} und erhält ${payout} Gold.`, "goldenMoment");
  delete state.pendingWorldImpulseDecision;
  state.turnPhase = "turnTransition";
}

export function chooseNpcGoldenMoment(gold: number, choose: () => number = () => randomInt(2)): "safe" | "risk" {
  return gold <= 500 || choose() === 0 ? "safe" : "risk";
}
