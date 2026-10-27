import { useEffect, useState } from "react";
import { BOARD_TILES, type EmoteSignal, type GameState } from "@valenor/shared";
import { GameExperience } from "../game/GameExperience";

type Step = (draft: GameState) => void;

export const LIVING_BOARD_SCENES = ["chronist", "emotes", "drama-rent", "drama-bankrupt", "drama-dragon", "drama-trade", "ambient"] as const;
export type LivingBoardScene = typeof LIVING_BOARD_SCENES[number];

/** Erster Schritt, nachdem das Brett bereit ist und die Figuren ihre Einblendung beendet haben. */
const FIRST_STEP_AFTER_READY_MS = 3_600;
const STEP_INTERVAL_MS = 700;

let logSequence = 0;
const log = (draft: GameState, kind: GameState["economyLog"][number]["kind"], playerIds: string[], message: string, amount?: number, extra: Partial<GameState["economyLog"][number]> = {}) =>
  draft.economyLog.push({ id: `qa-living-${logSequence += 1}`, kind, playerIds, message, createdAt: Date.now(), ...(amount === undefined ? {} : { amount }), ...extra });

const land = (draft: GameState, playerId: string, from: number, to: number) => {
  draft.players.find(player => player.id === playerId)!.position = to;
  draft.lastMovement = { kind: "normal", sequence: draft.turnContext.rollSequence + 1, playerId, from, to, path: [to], passedStart: false, landedTile: BOARD_TILES[to]! };
  draft.turnContext = { ...draft.turnContext, rollSequence: draft.turnContext.rollSequence + 1 };
  draft.turnPhase = "waitingForEndTurn";
};

function emote(playerId: string, emoteId: EmoteSignal["emoteId"], color: EmoteSignal["color"]): EmoteSignal {
  return { id: `qa-${playerId}`, playerId, emoteId, color, sentAt: Date.now() };
}

/** Spielt eine Folge von Spielständen ab, wie sie vom Server käme. */
function Replay({ base, steps, emotes }: { base: GameState; steps: readonly Step[]; emotes?: Readonly<Record<string, EmoteSignal>> }) {
  const [state, setState] = useState(base);
  useEffect(() => {
    if (!steps.length) return;
    const timers: number[] = [];
    // Das Brett lädt im Dev-Modus unterschiedlich schnell; erst danach sollen die Schritte kommen.
    const waitForBoard = window.setInterval(() => {
      if (document.querySelector("canvas")?.dataset.boardReady !== "true") return;
      window.clearInterval(waitForBoard);
      steps.forEach((step, index) => timers.push(window.setTimeout(() => setState(previous => {
        const draft = structuredClone(previous);
        step(draft);
        return draft;
      }), FIRST_STEP_AFTER_READY_MS + index * STEP_INTERVAL_MS)));
    }, 100);
    return () => { window.clearInterval(waitForBoard); timers.forEach(timer => window.clearTimeout(timer)); };
  }, [steps]);
  return <GameExperience gameState={state} emotes={emotes} suppressIntro />;
}

const SCENES: Readonly<Record<LivingBoardScene, { steps: readonly Step[]; prepare?: Step; emotes?: Record<string, EmoteSignal> }>> = {
  chronist: {
    steps: [
      draft => { draft.propertyOwnerships.push({ tileIndex: 26, ownerId: "p3", mortgaged: false, buildingLevel: 0 }); log(draft, "purchase", ["p3"], "Ragna kauft Eisenklamm.", -260); },
      draft => { land(draft, "p1", 21, 24); log(draft, "rent", ["p1", "p3"], "Philipp zahlt Miete.", -1_100); draft.players[0]!.gold -= 1_100; },
      draft => { draft.lastTradeAction = { id: "qa-trade", type: "accepted", proposerId: "p2", recipientId: "p4", createdAt: Date.now() }; },
      draft => { draft.lastTurnAction = { id: "qa-double", kind: "double", playerId: "p2", createdAt: Date.now() }; }
    ]
  },
  emotes: {
    steps: [],
    emotes: { p1: emote("p1", "cheer", "violet"), p2: emote("p2", "awe", "green"), p3: emote("p3", "laugh", "red"), p4: emote("p4", "curse", "blue") }
  },
  "drama-rent": {
    steps: [draft => { land(draft, "p1", 21, 24); log(draft, "rent", ["p1", "p3"], "Philipp zahlt Miete.", -1_100); draft.players[0]!.gold -= 1_100; }]
  },
  "drama-bankrupt": {
    prepare: draft => {
      draft.currentPlayerId = "p2"; draft.currentTurnIndex = 1; draft.players[1]!.gold = 120;
      land(draft, "p2", 20, 24);
      draft.turnPhase = "paymentRequired";
      draft.pendingPayment = { payerId: "p2", payeeId: "p3", amount: 1_100, reason: "Miete für Rotfels", creditorType: "player", reasonType: "rent" };
    },
    steps: []
  },
  "drama-dragon": {
    prepare: draft => { draft.wanderingDragon = { tileIndex: 16, nextMoveRound: 9, encounterSequence: 0 }; },
    steps: [draft => { land(draft, "p1", 12, 16); log(draft, "dragon", ["p1"], "Philipp begegnet dem Hüter der Relikte.", undefined, { relicId: "golden-feather" }); draft.players[0]!.relics = ["golden-feather"]; }]
  },
  "drama-trade": {
    steps: [draft => { draft.lastTradeAction = { id: "qa-trade", type: "accepted", proposerId: "p1", recipientId: "p2", createdAt: Date.now() }; }]
  },
  ambient: { steps: [] }
};

export function isLivingBoardScene(scene: string): scene is LivingBoardScene {
  return (LIVING_BOARD_SCENES as readonly string[]).includes(scene);
}

export function LivingBoardQa({ scene, createBase }: { scene: LivingBoardScene; createBase: () => GameState }) {
  const [base] = useState(() => {
    const state = createBase();
    SCENES[scene].prepare?.(state);
    return state;
  });
  const { steps, emotes } = SCENES[scene];
  // Im Spiel verschwindet eine Blase nach EMOTE_DISPLAY_MS; hier kommen die Reaktionen alle drei Sekunden neu.
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!emotes) return;
    const timer = window.setInterval(() => setRound(current => current + 1), 3_000);
    return () => window.clearInterval(timer);
  }, [emotes]);
  const cycled = emotes && Object.fromEntries(Object.entries(emotes).map(([playerId, signal]) => [playerId, { ...signal, id: `${signal.id}-${round}` }]));
  return <Replay base={base} steps={steps} {...(cycled ? { emotes: cycled } : {})} />;
}
