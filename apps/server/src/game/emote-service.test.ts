import assert from "node:assert/strict";
import test from "node:test";
import { EMOTE_COOLDOWN_MS, EMOTE_IDS, getEmoteCooldownRemaining, isEmoteId, LOCATE_COOLDOWN_MS, type EconomyLogEntry, type GameState, type Player } from "@valenor/shared";
import { COMPUTER_EMOTE_CHANCE, COMPUTER_EMOTE_RENT_THRESHOLD, EmoteGate, pickComputerEmotes, validateEmoteRequest, validateLocateRequest } from "./emote-service";

function game(): GameState {
  const ids = ["p1", "c1", "c2"];
  return {
    roomId: "VAL-EMOTE", status: "playing", config: { mode: "chronicles" },
    players: ids.map((id, index) => ({
      id, name: ["Lena", "Ragna", "Eldric"][index]!, type: index === 0 ? "human" as const : "computer" as const,
      color: (["violet", "red", "blue"] as const)[index]!, characterId: "humanKnight" as const, connectionState: "connected" as const,
      gold: 1_000, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }
    })),
    turnOrder: ids, orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 3, turnNumber: 7, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 1
  };
}

const log = (id: string, kind: EconomyLogEntry["kind"], playerIds: string[], extra: Partial<EconomyLogEntry> = {}): EconomyLogEntry =>
  ({ id, kind, playerIds, message: id, createdAt: 1, ...extra });

const player: Player = { id: "p1", name: "Lena", type: "human", color: "violet", characterId: "humanKnight", ready: true, connectionState: "connected", joinedAt: 1 };

test("the emote cooldown blocks a second emote for five seconds and then lets it through", () => {
  const gate = new EmoteGate();
  assert.deepEqual(gate.tryEmote("VAL-1", "p1", 10_000), { ok: true });
  assert.deepEqual(gate.tryEmote("VAL-1", "p1", 10_001), { ok: false, cooldownMs: EMOTE_COOLDOWN_MS - 1 });
  assert.deepEqual(gate.tryEmote("VAL-1", "p1", 10_000 + EMOTE_COOLDOWN_MS - 1), { ok: false, cooldownMs: 1 });
  assert.deepEqual(gate.tryEmote("VAL-1", "p1", 10_000 + EMOTE_COOLDOWN_MS), { ok: true });
});

test("a rejected emote does not extend the cooldown", () => {
  const gate = new EmoteGate();
  gate.tryEmote("VAL-1", "p1", 0);
  gate.tryEmote("VAL-1", "p1", 4_000);
  assert.deepEqual(gate.tryEmote("VAL-1", "p1", EMOTE_COOLDOWN_MS), { ok: true });
});

test("the cooldown is kept per player and per room and can be cleared with the room", () => {
  const gate = new EmoteGate();
  gate.tryEmote("VAL-1", "p1", 0);
  assert.equal(gate.tryEmote("VAL-1", "p2", 1).ok, true, "another player is not blocked");
  assert.equal(gate.tryEmote("VAL-2", "p1", 1).ok, true, "the same id in another room is not blocked");
  gate.clearRoom("VAL-1");
  assert.equal(gate.tryEmote("VAL-1", "p1", 2).ok, true);
  assert.equal(gate.tryEmote("VAL-2", "p1", 2).ok, false, "clearing one room leaves the others alone");
});

test("the shared cooldown helper reports the remaining time", () => {
  assert.equal(getEmoteCooldownRemaining(undefined, 99), 0);
  assert.equal(getEmoteCooldownRemaining(1_000, 2_000), EMOTE_COOLDOWN_MS - 1_000);
  assert.equal(getEmoteCooldownRemaining(1_000, 1_000 + EMOTE_COOLDOWN_MS + 50), 0);
});

test("only the four known emotes from a connected player during a running game are accepted", () => {
  assert.deepEqual([...EMOTE_IDS], ["cheer", "curse", "laugh", "awe"]);
  for (const id of EMOTE_IDS) assert.equal(validateEmoteRequest(id, player, "playing"), undefined, id);
  for (const id of ["dance", "", 3, null, undefined, { id: "cheer" }, "CHEER", "__proto__"]) {
    assert.equal(isEmoteId(id), false, String(id));
    assert.match(validateEmoteRequest(id, player, "playing")!, /kennt der Chronist nicht/);
  }
  assert.match(validateEmoteRequest("cheer", undefined, "playing")!, /Verbindung/);
  assert.match(validateEmoteRequest("cheer", { ...player, connectionState: "disconnected" }, "playing")!, /Verbindung/);
  assert.match(validateEmoteRequest("cheer", player, "lobby")!, /erst, wenn die Chronik läuft/);
  assert.match(validateEmoteRequest("cheer", player, "finished")!, /erst, wenn die Chronik läuft/);
});

test("computer opponents react to their own purchases, big rents, quests and relics, but only to new log entries", () => {
  const state = game();
  state.economyLog = [
    log("old", "purchase", ["c1"]),
    log("buy", "purchase", ["c1"]),
    log("rent", "rent", ["p1", "c2"], { amount: -COMPUTER_EMOTE_RENT_THRESHOLD }),
    log("human", "purchase", ["p1"])
  ];
  const always = () => 0;
  assert.deepEqual(pickComputerEmotes(state, new Set(["old"]), always), [
    { playerId: "c1", emoteId: "cheer" },
    { playerId: "c2", emoteId: "laugh" }
  ]);
  state.economyLog = [log("pay", "rent", ["c1", "p1"], { amount: -250 }), log("relic", "dragon", ["c2"], { relicId: "runestone" }), log("quest", "quest", ["c2"])];
  assert.deepEqual(pickComputerEmotes(state, new Set(), always), [
    { playerId: "c1", emoteId: "curse" },
    { playerId: "c2", emoteId: "awe" }
  ], "at most one reaction per computer and state; the first reason wins");
});

test("computer opponents stay quiet for small rents, empty dragon visits, bankrupt players and most of the time", () => {
  const state = game();
  state.economyLog = [log("small", "rent", ["c1", "p1"], { amount: -(COMPUTER_EMOTE_RENT_THRESHOLD - 1) }), log("dragon", "dragon", ["c1"])];
  assert.deepEqual(pickComputerEmotes(state, new Set(), () => 0), []);
  state.players[1]!.isBankrupt = true;
  state.economyLog = [log("buy", "purchase", ["c1"])];
  assert.deepEqual(pickComputerEmotes(state, new Set(), () => 0), []);
  state.players[1]!.isBankrupt = false;
  assert.deepEqual(pickComputerEmotes(state, new Set(), () => COMPUTER_EMOTE_CHANCE), [], "the dice decide: at or above the chance no emote");
  assert.ok(COMPUTER_EMOTE_CHANCE <= 0.35, "computer emotes stay rare");
});

test("'Wo bin ich?' works for connected players in a running game and has its own three-second cooldown", () => {
  assert.equal(validateLocateRequest(player, "playing"), undefined);
  assert.match(validateLocateRequest(undefined, "playing")!, /Verbindung/);
  assert.match(validateLocateRequest({ ...player, connectionState: "disconnected" }, "playing")!, /Verbindung/);
  assert.match(validateLocateRequest(player, "lobby")!, /erst auf dem Brett/);
  const gate = new EmoteGate(LOCATE_COOLDOWN_MS);
  assert.equal(LOCATE_COOLDOWN_MS, 3_000);
  assert.equal(gate.tryEmote("VAL-1", "p1", 0).ok, true);
  assert.deepEqual(gate.tryEmote("VAL-1", "p1", 1_000), { ok: false, cooldownMs: 2_000 });
  assert.equal(gate.tryEmote("VAL-1", "p1", LOCATE_COOLDOWN_MS).ok, true);
});
