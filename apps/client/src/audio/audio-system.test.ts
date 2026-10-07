import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BOARD_TILES, DUNGEON_TILE_INDEX, type GameState } from "@valenor/shared";
import { AUDIO_CUES, MUSIC_TRACK, isAudioEventAllowedForRole, type AudioEvent } from "./audio-config";
import { DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings, selectAudioVariant } from "./AudioManager";
import { GameAudioEventTracker, deriveGameAudioEvents, deriveMovementStepAudioEvents } from "./game-audio-events";

function gameState(): GameState {
  return {
    roomId: "VAL-AUDIO",
    status: "playing",
    config: { mode: "chronicles" },
    players: [
      { id: "p1", name: "A", type: "human", color: "violet", connectionState: "connected", gold: 1_500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
      { id: "p2", name: "B", type: "human", color: "green", connectionState: "connected", gold: 1_500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
    ],
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1,
    turnPhase: "waitingForRoll", turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [], trades: [], startedAt: 1
  };
}

const clone = (state: GameState): GameState => structuredClone(state);
const names = (events: ReturnType<typeof deriveGameAudioEvents>) => events.map(({ event }) => event);

test("audio manifest declares streaming music and all five automatic dice variants", () => {
  assert.equal(MUSIC_TRACK.path, "/assets/audio/music/valenor-main.mp3");
  assert.equal(MUSIC_TRACK.loop, true);
  assert.equal(MUSIC_TRACK.preload, "metadata");
  assert.deepEqual(AUDIO_CUES.DICE_ROLL.paths, [1, 2, 3, 4, 5].map((number) => `/assets/audio/sfx/dice/dice-0${number}.ogg`));
  assert.equal(AUDIO_CUES.UI_CLICK.group, "UI");
  assert.equal(AUDIO_CUES.VICTORY.duckMusic, true);
});

test("every registered SFX path resolves to an installed public asset", () => {
  for (const [event, cue] of Object.entries(AUDIO_CUES)) {
    for (const path of cue.paths) {
      const asset = fileURLToPath(new URL(`../../public${path}`, import.meta.url));
      assert.equal(existsSync(asset), true, `${event} references missing asset ${path}`);
    }
  }
});

test("audio roles keep every sound on TV and the controller silent", () => {
  const boardEvents = Object.keys(AUDIO_CUES) as AudioEvent[];
  for (const event of boardEvents) {
    assert.equal(isAudioEventAllowedForRole(event, "board"), true, `${event} must play on TV`);
    assert.equal(isAudioEventAllowedForRole(event, "controller"), false, `${event} must stay silent on smartphones`);
  }
});

test("settings validation restores defaults and clamps persisted values", () => {
  assert.deepEqual(normalizeAudioSettings(undefined), DEFAULT_AUDIO_SETTINGS);
  const settings = normalizeAudioSettings({ masterVolume: 8, musicVolume: -2, sfxVolume: Number.NaN, uiVolume: 0.31, musicEnabled: false, sfxEnabled: "no" });
  assert.equal(settings.masterVolume, 1);
  assert.equal(settings.musicVolume, 0);
  assert.equal(settings.sfxVolume, 0.8);
  assert.equal(settings.uiVolume, 0.31);
  assert.equal(settings.musicEnabled, false);
  assert.equal(settings.sfxEnabled, true);
});

test("variant selection uses only available files and avoids an immediate repeat", () => {
  const available = ["dice-01.ogg", "dice-03.ogg", "dice-05.ogg"];
  for (let index = 0; index < 20; index += 1) {
    assert.notEqual(selectAudioVariant(available, "dice-03.ogg", () => index / 20), "dice-03.ogg");
  }
  assert.equal(selectAudioVariant(["dice-03.ogg"], "dice-03.ogg", () => 0), "dice-03.ogg");
  assert.equal(selectAudioVariant([], undefined), undefined);
});

test("dice, movement and start passage stay out of generic state-sync audio", () => {
  const previous = gameState();
  const dice = clone(previous);
  dice.lastDiceRoll = { die1: 3, die2: 5, total: 8, isDouble: false };
  dice.turnContext.rollSequence = 1;
  assert.deepEqual(names(deriveGameAudioEvents(previous, dice)), []);

  const movement = clone(dice);
  movement.lastMovement = { kind: "normal", sequence: 1, playerId: "p1", from: 39, to: 2, path: [0, 1, 2], passedStart: true, landedTile: BOARD_TILES[2]! };
  assert.deepEqual(names(deriveGameAudioEvents(dice, movement)), []);
  movement.economyLog.push({ id: "start", kind: "start", message: "Runentor", playerIds: ["p1"], amount: 200, createdAt: 2 });
  assert.deepEqual(names(deriveGameAudioEvents(dice, movement)), []);
});

test("state sync never emits movement or realm audio and leaves game state unchanged", () => {
  const previous = gameState();
  const original = JSON.stringify(previous);
  const realmIndices = BOARD_TILES.filter((tile) => tile.region);
  const from = realmIndices[0]!;
  const to = realmIndices.find((tile) => tile.region !== from.region)!;
  const next = clone(previous);
  next.lastMovement = { kind: "normal", sequence: 1, playerId: "p1", from: from.index, to: to.index, path: [to.index], passedStart: false, landedTile: to };
  assert.deepEqual(names(deriveGameAudioEvents(previous, next)), []);
  assert.equal(JSON.stringify(previous), original);

  const ordinary = clone(previous);
  ordinary.lastMovement = { kind: "normal", sequence: 2, playerId: "p1", from: from.index, to: from.index, path: [from.index], passedStart: false, landedTile: from };
  assert.deepEqual(names(deriveGameAudioEvents(previous, ordinary)), []);
  const sync = clone(previous);
  sync.players[0]!.position = to.index;
  assert.deepEqual(names(deriveGameAudioEvents(previous, sync)), []);
});

test("movement variants retain all three local files and avoid consecutive repeats", () => {
  const paths = AUDIO_CUES.TOKEN_MOVE.paths;
  assert.deepEqual(paths, [1, 2, 3].map((number) => `/assets/audio/sfx/movement/token-0${number}.ogg`));
  let previous: string | undefined;
  const selected = new Set<string>();
  for (let index = 0; index < 12; index += 1) {
    const next = selectAudioVariant(paths, previous, () => (index % 3) / 3);
    assert.notEqual(next, previous);
    selected.add(next!);
    previous = next;
  }
  assert.equal(selected.size, 3);
  assert.equal(AUDIO_CUES.TOKEN_MOVE.cooldownMs, 0);
});

test("each visible field arrival emits one movement cue, including all six steps", () => {
  const oneStep = deriveMovementStepAudioEvents(1, false);
  assert.equal(oneStep.filter((event) => event === "TOKEN_MOVE").length, 1);

  const sixSteps = [1, 2, 3, 4, 5, 6].flatMap((tileIndex) => deriveMovementStepAudioEvents(tileIndex, false));
  assert.equal(sixSteps.filter((event) => event === "TOKEN_MOVE").length, 6);
});

test("ordinary corners and their region boundaries emit only movement audio", () => {
  for (const path of [[9, 10, 11, 12], [19, 20, 21, 22], [29, 30, 31, 32]]) {
    const events = path.flatMap((tileIndex) => deriveMovementStepAudioEvents(tileIndex, false));
    assert.deepEqual(events, path.map(() => "TOKEN_MOVE"));
  }
});

test("38 to 4 emits six movement cues and exactly one start cue at the runegate", () => {
  const arrivals = [39, 0, 1, 2, 3, 4].map((tileIndex) => deriveMovementStepAudioEvents(tileIndex, true));
  assert.deepEqual(arrivals, [
    ["TOKEN_MOVE"], ["TOKEN_MOVE", "START_PASS"],
    ["TOKEN_MOVE"], ["TOKEN_MOVE"], ["TOKEN_MOVE"], ["TOKEN_MOVE"]
  ]);
  assert.deepEqual(deriveMovementStepAudioEvents(0, false), ["TOKEN_MOVE"]);
});

test("landing on the dungeon as a visitor emits no prison or corner effect", () => {
  const previous = gameState();
  const visit = clone(previous);
  visit.players[0]!.position = DUNGEON_TILE_INDEX;
  visit.lastMovement = { kind: "normal", sequence: 1, playerId: "p1", from: 9, to: DUNGEON_TILE_INDEX,
    path: [DUNGEON_TILE_INDEX], passedStart: false, landedTile: BOARD_TILES[DUNGEON_TILE_INDEX]! };
  assert.deepEqual(deriveMovementStepAudioEvents(DUNGEON_TILE_INDEX, false), ["TOKEN_MOVE"]);
  assert.deepEqual(names(deriveGameAudioEvents(previous, visit)), []);
});

for (const kind of ["sentToDungeon", "thirdDouble", "cardTransfer"] as const) {
  test(`${kind} emits prison entry once, including later transfer snapshots`, () => {
    const previous = gameState();
    previous.players[0]!.position = 30;
    const transfer = clone(previous);
    transfer.turnPhase = kind === "cardTransfer" ? "cardMoving" : "dungeonTransfer";
    transfer.players[0]!.dungeon.inDungeon = true;
    transfer.lastMovement = { kind: "dungeonTransfer", sequence: 1, playerId: "p1", from: 30, to: DUNGEON_TILE_INDEX,
      path: [DUNGEON_TILE_INDEX], passedStart: false, landedTile: BOARD_TILES[DUNGEON_TILE_INDEX]! };
    if (kind !== "cardTransfer") transfer.lastTurnAction = { id: "entry", kind, playerId: "p1", createdAt: 2 };
    const tracker = new GameAudioEventTracker(previous);
    assert.deepEqual(names(tracker.update(transfer)), ["PRISON_ENTER"]);
    assert.deepEqual(tracker.update(clone(transfer)), []);
    const arrived = clone(transfer);
    arrived.players[0]!.position = DUNGEON_TILE_INDEX;
    arrived.turnPhase = "waitingForRoll";
    assert.deepEqual(tracker.update(arrived), []);
    // A late action update must not replay the already observed detention.
    const lateAction = clone(arrived);
    lateAction.lastTurnAction = { id: "late-entry", kind: "sentToDungeon", playerId: "p1", createdAt: 3 };
    assert.deepEqual(tracker.update(lateAction), []);
    assert.deepEqual(new GameAudioEventTracker().update(transfer), []);
  });
}

test("cards receive draw plus one delayed, action-specific result cue", () => {
  const previous = gameState();
  const positive = clone(previous);
  positive.activeCard = { cardId: "adv_001", deck: "adventure", playerId: "p1", status: "resolving" };
  assert.deepEqual(names(deriveGameAudioEvents(previous, positive)), ["CARD_DRAW", "GOLD_GAIN"]);
  assert.equal(deriveGameAudioEvents(previous, positive)[1]?.delayMs, 480);

  const negative = clone(previous);
  negative.activeCard = { cardId: "fate_008", deck: "fate", playerId: "p1", status: "resolving" };
  assert.deepEqual(names(deriveGameAudioEvents(previous, negative)), ["CARD_DRAW", "GOLD_PAY"]);

  const neutral = clone(previous);
  neutral.activeCard = { cardId: "adv_010", deck: "adventure", playerId: "p1", status: "resolving" };
  assert.deepEqual(names(deriveGameAudioEvents(previous, neutral)), ["CARD_DRAW", "CARD_REVEAL"]);

  const beneficial = clone(previous);
  beneficial.activeCard = { cardId: "adv_024", deck: "adventure", playerId: "p1", status: "resolving" };
  assert.deepEqual(names(deriveGameAudioEvents(previous, beneficial)), ["CARD_DRAW", "EVENT_POSITIVE"]);

  const harmful = clone(previous);
  harmful.activeCard = { cardId: "adv_020", deck: "adventure", playerId: "p1", status: "resolving" };
  assert.deepEqual(names(deriveGameAudioEvents(previous, harmful)), ["CARD_DRAW", "EVENT_NEGATIVE"]);
});

test("economy and dungeon changes are prioritized as one action cue", () => {
  const previous = gameState();
  const purchase = clone(previous);
  purchase.players[0]!.gold -= 100;
  purchase.economyLog.push({ id: "buy", kind: "purchase", message: "Ort gekauft", playerIds: ["p1"], amount: 100, createdAt: 2 });
  assert.deepEqual(names(deriveGameAudioEvents(previous, purchase)), ["PROPERTY_BUY"]);

  const build = clone(previous);
  build.lastBuildingAction = { id: "build", type: "build", playerId: "p1", tileIndex: 1, fromLevel: 0, toLevel: 1, buildingName: "Hütte", amount: 50, createdAt: 2 };
  build.economyLog.push({ id: "build-log", kind: "building", message: "Ausgebaut", playerIds: ["p1"], amount: 50, createdAt: 2 });
  assert.deepEqual(names(deriveGameAudioEvents(previous, build)), ["PROPERTY_UPGRADE"]);

  const dungeon = clone(previous);
  dungeon.players[0]!.dungeon.inDungeon = true;
  dungeon.lastTurnAction = { id: "prison", kind: "sentToDungeon", playerId: "p1", createdAt: 2 };
  assert.deepEqual(names(deriveGameAudioEvents(previous, dungeon)), ["PRISON_ENTER"]);
});

test("result audio is viewer-aware and tracker never replays an initial snapshot", () => {
  const previous = gameState();
  const tracker = new GameAudioEventTracker();
  assert.deepEqual(tracker.update(previous, "p1"), []);
  const finished = clone(previous);
  finished.status = "finished";
  finished.winnerIds = ["p1"];
  assert.deepEqual(names(deriveGameAudioEvents(previous, finished, "p1")), ["VICTORY"]);
  assert.deepEqual(names(deriveGameAudioEvents(previous, finished, "p2")), ["DEFEAT"]);
});

test("a tavern win reuses one TV gold-gain cue and never replays a snapshot", () => {
  const previous = gameState(), tracker = new GameAudioEventTracker(previous);
  const next = clone(previous);
  next.economyLog.push({ id: "tavern-win", kind: "tavern", message: "A gewinnt 500 Gold.", playerIds: ["p1"], amount: 500, createdAt: 2 });
  assert.deepEqual(names(tracker.update(next)), ["GOLD_GAIN"]);
  assert.deepEqual(tracker.update(clone(next)), []);
  assert.deepEqual(new GameAudioEventTracker().update(next), []);
  assert.equal(isAudioEventAllowedForRole("GOLD_GAIN", "controller"), false);
});
