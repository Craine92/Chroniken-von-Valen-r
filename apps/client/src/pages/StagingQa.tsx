import { useEffect, useState } from "react";
import { BOARD_TILES, CHRONICLE_EVENTS, getPropertyGroupTiles, getRegionalChronicleDefinition, type GameState, type RegionType } from "@valenor/shared";
import { GameExperience } from "../game/GameExperience";

/** Szenen der Inszenierung: Würfel, Kamerafahrten, Stimmungen, Tag und Nacht, Kartenwendung, Spielstart. */
const MOOD_SCENES = CHRONICLE_EVENTS.map(event => `mood-${event.id}`);
const DAYTIME_SCENES = ["time-morning", "time-day", "time-evening", "time-night"];
export const STAGING_SCENES = [
  "dice-roll", "dice-double", "grand-start",
  "camera-dragon", "camera-rent", "camera-group", "camera-build5", "camera-bankrupt", "camera-auction", "camera-move",
  "card-flip", ...MOOD_SCENES, ...DAYTIME_SCENES,
  // Feinschliff: Landekarte mit Kaufpreis bzw. Miete, Banner weicht dem Geschehen aus.
  "landing-free-discount", "landing-rent-low", "landing-own"
] as const;
export type StagingScene = string;

export function isStagingScene(scene: string): scene is StagingScene {
  return (STAGING_SCENES as readonly string[]).includes(scene);
}

/** Wann der vorbereitete Moment startet: kurz nachdem das Brett sichtbar ist. */
export const STAGING_TRIGGER_MS = 5_200;

let sequence = 0;
const log = (draft: GameState, kind: GameState["economyLog"][number]["kind"], playerIds: string[], message: string, amount?: number, extra: Partial<GameState["economyLog"][number]> = {}) =>
  draft.economyLog.push({ id: `staging-${++sequence}`, kind, playerIds, message, createdAt: Date.now(), ...(amount === undefined ? {} : { amount }), ...extra });

function land(draft: GameState, playerId: string, from: number, to: number): void {
  const player = draft.players.find(entry => entry.id === playerId)!;
  player.position = to;
  const path = Array.from({ length: (to - from + 40) % 40 }, (_, step) => (from + step + 1) % 40);
  draft.lastMovement = { kind: "normal", sequence: 300 + sequence, playerId, from, to, path, passedStart: false, landedTile: BOARD_TILES[to]! };
  draft.turnPhase = "waitingForEndTurn";
}

function rollState(draft: GameState, die1: number, die2: number): void {
  const player = draft.players.find(entry => entry.id === draft.currentPlayerId)!;
  const to = (player.position + die1 + die2) % 40;
  draft.turnPhase = "rolling";
  draft.turnContext.rollSequence += 1;
  draft.lastDiceRoll = { die1, die2, total: die1 + die2, isDouble: die1 === die2 };
  draft.lastMovement = { kind: "normal", sequence: 200, playerId: player.id, from: player.position, to, path: Array.from({ length: die1 + die2 }, (_, step) => (player.position + step + 1) % 40), passedStart: false, landedTile: BOARD_TILES[to]! };
}

/** Vorbereitung (vor dem Brett) und der Moment selbst (nach STAGING_TRIGGER_MS). */
const SCENES: Record<string, { prepare?: (draft: GameState) => void; trigger?: (draft: GameState) => void; intro?: boolean }> = {
  "dice-roll": { trigger: draft => rollState(draft, 4, 2) },
  "dice-double": { trigger: draft => rollState(draft, 5, 5) },
  "grand-start": {
    intro: true,
    prepare: draft => {
      // Eine frische Partie: Runde 1, Reihenfolge wird ausgewürfelt; eigener Raum, damit der Start nicht als „schon gesehen“ gilt.
      draft.roomId = `QA-START-${Date.now()}`; draft.startedAt = Date.now(); draft.currentRound = 1; draft.turnNumber = 0;
      draft.turnPhase = "determiningOrder"; draft.orderContenders = draft.players.map(player => player.id);
      draft.propertyOwnerships = []; draft.economyLog = [];
      draft.players.forEach(player => { player.position = 0; });
    }
  },
  "camera-dragon": {
    prepare: draft => { draft.wanderingDragon = { tileIndex: 16, nextMoveRound: 9, encounterSequence: 0 }; },
    trigger: draft => { land(draft, "p1", 12, 16); log(draft, "dragon", ["p1"], "Philipp begegnet dem Hüter der Relikte.", undefined, { relicId: "golden-feather" }); draft.players[0]!.relics = ["golden-feather"]; }
  },
  "camera-rent": { trigger: draft => { land(draft, "p1", 21, 24); log(draft, "rent", ["p1", "p3"], "Philipp zahlt Miete.", -1_100); draft.players[0]!.gold -= 1_100; } },
  "camera-group": {
    trigger: draft => {
      const tiles = getPropertyGroupTiles("group_sonnensteppe");
      draft.propertyOwnerships = draft.propertyOwnerships.filter(entry => !tiles.some(tile => tile.index === entry.tileIndex));
      tiles.forEach(tile => draft.propertyOwnerships.push({ tileIndex: tile.index, ownerId: "p4", buildingLevel: 0, mortgaged: false }));
      draft.lastMomentumCelebration = { id: "qa-group", type: "completeGroup", playerId: "p4", groupId: "group_sonnensteppe", title: "Sonnensteppe vereint", subtitle: "Eldric", createdAt: Date.now() };
    }
  },
  "camera-build5": {
    trigger: draft => {
      const ownership = draft.propertyOwnerships.find(entry => entry.tileIndex === 21) ?? { tileIndex: 21, ownerId: "p3", buildingLevel: 4 as const, mortgaged: false };
      ownership.buildingLevel = 5;
      if (!draft.propertyOwnerships.includes(ownership)) draft.propertyOwnerships.push(ownership);
      draft.lastBuildingAction = { id: "qa-build5", type: "build", playerId: ownership.ownerId, tileIndex: 21, fromLevel: 4, toLevel: 5, buildingName: "Eisenfestung", amount: 150, createdAt: Date.now() };
    }
  },
  "camera-bankrupt": { trigger: draft => { draft.players[1]!.isBankrupt = true; draft.players[1]!.gold = 0; } },
  "camera-auction": {
    trigger: draft => {
      draft.propertyOwnerships = draft.propertyOwnerships.filter(entry => entry.tileIndex !== 26);
      draft.turnPhase = "auction";
      draft.auction = { tileIndex: 26, currentBid: 120, participantIds: draft.players.map(player => player.id), withdrawnPlayerIds: [], pausedForPlayerIds: [], revision: 1, source: "property" };
    }
  },
  "camera-move": {
    trigger: draft => {
      const player = draft.players[0]!, from = player.position, to = (from + 8) % 40;
      player.position = to;
      draft.turnPhase = "moving";
      draft.lastMovement = { kind: "normal", sequence: 400, playerId: player.id, from, to, path: Array.from({ length: 8 }, (_, step) => (from + step + 1) % 40), passedStart: false, landedTile: BOARD_TILES[to]! };
    }
  },
  "landing-free-discount": {
    prepare: draft => { draft.propertyOwnerships = draft.propertyOwnerships.filter(entry => entry.tileIndex !== 26); regionalEvent(draft, "traders-festival", ["orcs"]); },
    trigger: draft => { land(draft, "p1", 21, 26); draft.turnPhase = "propertyDecision"; }
  },
  "landing-rent-low": {
    prepare: draft => {
      draft.propertyOwnerships = draft.propertyOwnerships.filter(entry => ![6, 8, 9].includes(entry.tileIndex));
      draft.propertyOwnerships.push({ tileIndex: 6, ownerId: "p3", buildingLevel: 0, mortgaged: false }, { tileIndex: 8, ownerId: "p3", buildingLevel: 3, mortgaged: false }, { tileIndex: 9, ownerId: "p3", buildingLevel: 0, mortgaged: false });
      draft.players[0]!.position = 3;
      regionalEvent(draft, "blood-moon", ["elves"]);
    },
    trigger: draft => land(draft, "p1", 3, 8)
  },
  "landing-own": {
    prepare: draft => {
      draft.propertyOwnerships = draft.propertyOwnerships.filter(entry => entry.tileIndex !== 24);
      draft.propertyOwnerships.push({ tileIndex: 24, ownerId: "p1", buildingLevel: 1, mortgaged: false });
    },
    trigger: draft => land(draft, "p1", 21, 24)
  },
  "card-flip": {
    trigger: draft => {
      draft.turnPhase = "cardAcknowledgement";
      draft.activeCard = { cardId: "adv_002", deck: "adventure", playerId: "p1", status: "readyToAcknowledge" };
      draft.decks = { adventure: { drawCount: 5, discardCount: 2 }, fate: { drawCount: 3, discardCount: 1 } };
    }
  }
};

/** Ein Chronik-Ereignis, das nur in den genannten Reichen gilt. */
function regionalEvent(draft: GameState, eventId: string, regions: RegionType[]): void {
  const definition = getRegionalChronicleDefinition(CHRONICLE_EVENTS.find(event => event.id === eventId)!, regions);
  draft.activeChronicleEvent = { ...definition, startedAfterRound: draft.currentRound - 1, startedAtRound: draft.currentRound, expiresAtRound: draft.currentRound + 2, startedAt: Date.now() };
}

function chronicleTrigger(eventId: string) {
  return (draft: GameState) => {
    const event = CHRONICLE_EVENTS.find(entry => entry.id === eventId)!;
    draft.activeChronicleEvent = { ...event, startedAfterRound: draft.currentRound - 1, startedAtRound: draft.currentRound, expiresAtRound: draft.currentRound + 2, startedAt: Date.now() };
  };
}

function sceneFor(scene: string) {
  if (scene.startsWith("mood-")) return { prepare: (draft: GameState) => { draft.currentRound = 3; }, trigger: chronicleTrigger(scene.slice(5)) };
  if (scene.startsWith("time-")) {
    const round = { "time-morning": 1, "time-day": 3, "time-evening": 5, "time-night": 7 }[scene] ?? 3;
    // Vom Tag aus in die gewünschte Tageszeit wechseln, damit der Übergang zu sehen ist.
    return { prepare: (draft: GameState) => { draft.currentRound = 3; }, trigger: (draft: GameState) => { draft.currentRound = round; } };
  }
  return SCENES[scene] ?? {};
}

/** Spielt nach dem Aufbau des Bretts einen vorbereiteten Moment ab. */
export function StagingQa({ scene, createBase }: { scene: StagingScene; createBase: () => GameState }) {
  const definition = sceneFor(scene);
  const [state, setState] = useState(() => {
    const base = structuredClone(createBase());
    definition.prepare?.(base);
    return base;
  });
  useEffect(() => {
    if (!definition.trigger) return;
    const timer = window.setTimeout(() => setState(current => {
      const draft = structuredClone(current);
      definition.trigger!(draft);
      return draft;
    }), STAGING_TRIGGER_MS);
    return () => window.clearTimeout(timer);
  }, [scene]);
  return <GameExperience gameState={state} suppressIntro={!("intro" in definition && definition.intro)} />;
}
