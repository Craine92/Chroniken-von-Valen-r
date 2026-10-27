import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, statSync } from "node:fs";
import { BOARD_TILES, CHRONICLE_EVENTS, PLAYER_CHARACTERS, WORLD_IMPULSE_DEFINITIONS, type GameState } from "@valenor/shared";
import { HIGH_RENT_MIN_GOLD } from "../game/living/drama";
import type { GameMoment } from "../game/living/moments";
import { livingTestState, logEntry, nextState } from "../game/living/living-fixtures";
import { VOICE_FILES } from "./audio-config";
import { ChroniclerVoice, VOICE_MAX_WAIT_MS, VOICE_QUEUE_CAPACITY, VoiceQueue } from "./chronicler-voice";
import { deriveVoiceRequests, gameKey } from "./useChroniclerVoice";
import { CHRONICLE_EVENT_VOICE, getVoiceRequest, pickVoiceRequest, VICTORY_VOICE, VOICE_LINES, WORLD_IMPULSE_VOICE } from "./voice-lines";

const voiceFolder = new URL("../../public/assets/audio/voice/", import.meta.url);
const state = livingTestState();
const keyOf = (moment: GameMoment, game: GameState = state) => getVoiceRequest(moment, game)?.key;

test("every voice file in the folder is in the audio manifest and the whole set stays small", () => {
  const files = readdirSync(voiceFolder).filter(name => name.endsWith(".mp3")).map(name => name.replace(/\.mp3$/, "")).sort();
  assert.equal(files.length, 57);
  assert.deepEqual(files, [...VOICE_FILES].sort());
  const total = files.reduce((sum, name) => sum + statSync(new URL(`${name}.mp3`, voiceFolder)).size, 0);
  assert.ok(total < 2 * 1024 * 1024, `${(total / 1024 / 1024).toFixed(2)} MB`);
});

test("variants share one key and every mapped key has at least one file", () => {
  assert.deepEqual(VOICE_LINES.drache, ["/assets/audio/voice/drache-1.mp3", "/assets/audio/voice/drache-2.mp3", "/assets/audio/voice/drache-3.mp3"]);
  assert.equal(VOICE_LINES["sieg-troll"]?.length, 1);
  const mapped = [...Object.values(VICTORY_VOICE), ...Object.values(CHRONICLE_EVENT_VOICE), ...Object.values(WORLD_IMPULSE_VOICE),
    "sieg-gemeinsam", "bankrott", "drache", "handel", "auktion", "kerker-rein", "kerker-raus", "taverne-gewinn", "taverne-verlust", "pasch",
    "letzte-runde", "miete-hoch", "start", ...["elfen", "menschen", "orks", "steppe"].flatMap(realm => [`gruppe-${realm}`, `bau-max-${realm}`])];
  for (const key of mapped) assert.ok(VOICE_LINES[key]?.length, key);
  // Umgekehrt: Keine Datei bleibt ungenutzt.
  assert.deepEqual(Object.keys(VOICE_LINES).filter(key => !mapped.includes(key)), []);
});

test("every character, chronicle event and world impulse has its own sentence", () => {
  assert.deepEqual(Object.keys(VICTORY_VOICE).sort(), PLAYER_CHARACTERS.map(character => character.id).sort());
  assert.deepEqual(Object.keys(CHRONICLE_EVENT_VOICE).sort(), CHRONICLE_EVENTS.map(event => event.id).sort());
  assert.deepEqual(Object.keys(WORLD_IMPULSE_VOICE).sort(), WORLD_IMPULSE_DEFINITIONS.map(impulse => impulse.id).sort());
});

test("a single winner hears the sentence of their figure, several winners the shared one", () => {
  const game = structuredClone(state);
  for (const character of PLAYER_CHARACTERS) {
    game.players[1]!.characterId = character.id;
    assert.deepEqual(getVoiceRequest({ kind: "victory", winnerIds: ["p2"] }, game), { key: VICTORY_VOICE[character.id], priority: "high" });
  }
  assert.equal(keyOf({ kind: "victory", winnerIds: ["p1", "p2"] }), "sieg-gemeinsam");
});

test("building speaks only at level 5 and with the realm of the field", () => {
  const property = (region: string) => BOARD_TILES.find(tile => tile.type === "property" && tile.region === region)!.index;
  for (const [region, word] of [["elves", "elfen"], ["humans", "menschen"], ["orcs", "orks"], ["steppe", "steppe"]] as const) {
    assert.equal(keyOf({ kind: "build", playerId: "p1", tileIndex: property(region), buildingName: "x", level: 5 }), `bau-max-${word}`);
    for (const level of [1, 2, 3, 4] as const) assert.equal(keyOf({ kind: "build", playerId: "p1", tileIndex: property(region), buildingName: "x", level }), undefined);
  }
});

test("only a really high rent speaks, with the same threshold as the drama moment", () => {
  const rent = (amount: number, payerGoldBefore: number): GameMoment => ({ kind: "rent", payerId: "p1", ownerId: "p2", amount, payerGoldBefore });
  assert.equal(keyOf(rent(20, 1_000)), undefined);
  assert.equal(keyOf(rent(HIGH_RENT_MIN_GOLD - 1, 100)), undefined, "below the minimum even if it hurts");
  assert.equal(keyOf(rent(400, 2_000)), "miete-hoch");
  assert.equal(keyOf(rent(150, 300)), "miete-hoch", "a large share of the payer's gold");
});

test("groups, events, impulses and the other moments map to their sentences; purchases and taxes stay quiet", () => {
  assert.equal(keyOf({ kind: "groupComplete", playerId: "p1", groupId: "group_eisenoede" }), "gruppe-orks");
  assert.equal(keyOf({ kind: "groupComplete", playerId: "p1", groupId: "group_mondhain" }), "gruppe-elfen");
  assert.equal(keyOf({ kind: "chronicleEvent", title: "Blutmond", eventId: "blood-moon" }), "ereignis-blutmond");
  assert.equal(keyOf({ kind: "worldImpulse", title: "Hafenwind", impulseId: "harborWind" }), "impuls-hafenwind");
  assert.equal(keyOf({ kind: "dungeonEnter", playerId: "p1" }), "kerker-rein");
  assert.equal(keyOf({ kind: "tavernLoss", playerId: "p1", amount: 400 }), "taverne-verlust");
  assert.equal(getVoiceRequest({ kind: "dragon", playerId: "p1" }, state)?.priority, "high");
  assert.equal(getVoiceRequest({ kind: "bankrupt", playerId: "p1" }, state)?.priority, "high");
  assert.equal(getVoiceRequest({ kind: "double", playerId: "p1" }, state)?.priority, "normal");
  for (const moment of [{ kind: "purchase", playerId: "p1", tileIndex: 1, amount: 60 }, { kind: "tax", playerId: "p1", amount: 100 }, { kind: "startPass", playerId: "p1", amount: 200 }] as GameMoment[]) {
    assert.equal(getVoiceRequest(moment, state), undefined, moment.kind);
  }
});

test("one sentence per game state: the dragon wins over a trade, otherwise the most important moment speaks", () => {
  const trade: GameMoment = { kind: "tradeSealed", proposerId: "p1", recipientId: "p2" };
  const dragon: GameMoment = { kind: "dragon", playerId: "p1" };
  assert.equal(pickVoiceRequest([trade, dragon], state)?.key, "drache");
  assert.equal(pickVoiceRequest([{ kind: "purchase", playerId: "p1", tileIndex: 1, amount: 60 }, trade], state)?.key, "handel");
  assert.equal(pickVoiceRequest([{ kind: "purchase", playerId: "p1", tileIndex: 1, amount: 60 }], state), undefined);
});

test("the game start is announced once per game and only at the very beginning", () => {
  const fresh = { ...structuredClone(state), currentRound: 1, turnNumber: 0, turnPhase: "determiningOrder" as const };
  const announced = new Set<string>();
  assert.deepEqual(deriveVoiceRequests(undefined, fresh, key => announced.has(key)).map(request => request.key), ["start"]);
  announced.add(gameKey(fresh));
  assert.deepEqual(deriveVoiceRequests(undefined, fresh, key => announced.has(key)), [], "a reloaded TV stays quiet");
  assert.deepEqual(deriveVoiceRequests(undefined, state, () => false), [], "a game in round 7 is not new");
  const later = nextState(state, draft => { draft.economyLog.push(logEntry("dragon", "dragon", ["p1"])); });
  assert.deepEqual(deriveVoiceRequests(state, later, () => true).map(request => request.key), ["drache"]);
});

test("the queue puts important sentences first, drops stale ones and stays short", () => {
  const queue = new VoiceQueue();
  queue.enqueue({ key: "handel", priority: "normal" }, 0);
  queue.enqueue({ key: "pasch", priority: "normal" }, 100);
  queue.enqueue({ key: "drache", priority: "high" }, 200);
  assert.equal(queue.next(300)?.key, "drache");
  assert.equal(queue.next(300)?.key, "handel");
  queue.enqueue({ key: "auktion", priority: "normal" }, 400);
  assert.equal(queue.next(400 + VOICE_MAX_WAIT_MS.normal + 1)?.key, undefined, "pasch and auktion are stale by now");
  queue.enqueue({ key: "bankrott", priority: "high" }, 0);
  assert.equal(queue.next(VOICE_MAX_WAIT_MS.normal + 1)?.key, "bankrott", "important sentences may wait longer");
  for (let index = 0; index < VOICE_QUEUE_CAPACITY + 2; index += 1) queue.enqueue({ key: `n${index}`, priority: "normal" }, index);
  queue.enqueue({ key: "drache", priority: "high" }, 10);
  assert.equal(queue.size, VOICE_QUEUE_CAPACITY);
  assert.equal(queue.next(20)?.key, "drache", "a full queue drops the oldest normal sentence, never the important one");
});

test("the chronicler never speaks two sentences at once and never repeats a variant directly", async () => {
  let now = 0;
  const started: string[] = [];
  const finishers: Array<() => void> = [];
  const voice = new ChroniclerVoice({ playVoice: path => { started.push(path); return new Promise<void>(resolve => finishers.push(resolve)); } }, () => now, () => 0);
  voice.say({ key: "drache", priority: "high" });
  voice.say({ key: "drache", priority: "high" });
  voice.say({ key: "handel", priority: "normal" });
  assert.equal(started.length, 1, "only one sentence plays");
  assert.ok(voice.isSpeaking);
  finishers.shift()!(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(started.length, 2);
  assert.notEqual(started[1], started[0], "the second dragon sentence is another variant");
  now += VOICE_MAX_WAIT_MS.normal + 1;
  finishers.shift()!(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(started.length, 2, "the trade waited too long and is dropped");
  assert.equal(voice.isSpeaking, false);
  voice.say({ key: "gibt-es-nicht", priority: "high" });
  assert.equal(started.length, 2, "unknown keys are ignored");
});

test("voice has its own settings and a silent voice never blocks the queue", async () => {
  const { AudioManager, DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings } = await import("./AudioManager");
  assert.equal(DEFAULT_AUDIO_SETTINGS.voiceEnabled, true);
  const settings = normalizeAudioSettings({ voiceEnabled: false, voiceVolume: 3, musicEnabled: false });
  assert.equal(settings.voiceEnabled, false);
  assert.equal(settings.voiceVolume, 1, "volume is clamped");
  assert.equal(settings.musicEnabled, false, "voice settings stay separate from music");
  // Ohne Freischaltung (oder mit ausgeschalteter Stimme) ist ein Satz sofort „fertig“, damit die Schlange weiterläuft.
  const manager = new AudioManager();
  await manager.playVoice("/assets/audio/voice/pasch.mp3");
});
