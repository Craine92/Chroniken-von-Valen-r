import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_TILES, type GameState, type TradeOffer } from "@valenor/shared";
import { DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings } from "../audio/AudioManager";
import { MobileFeedbackEventTracker } from "./mobile-feedback-events";
import { MobileFeedbackQueue, TOAST_FADE_MS, openControllerTrade, playMobileFeedback, type MobileFeedback } from "./mobile-feedback";

function state(): GameState {
  return {
    roomId: "VAL-MOBILE", startedAt: 1, status: "playing", config: { mode: "chronicles" },
    players: ["p1", "p2"].map((id, index) => ({ id, name: index ? "Tharok" : "Myrra", type: "human", color: index ? "green" : "violet",
      connectionState: "connected", gold: 1500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } })),
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p2", currentTurnIndex: 1, currentRound: 1, turnNumber: 1, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 },
    propertyOwnerships: [], buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 },
    economyLog: [], trades: []
  };
}
const trade = (id: string): TradeOffer => ({ id, proposerId: "p2", recipientId: "p1", status: "pending",
  offer: { gold: 50, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [] }, createdAt: 2 });
const notice = (id: string, type: MobileFeedback["type"] = "purchase"): MobileFeedback => ({
  id, type, title: id, message: id, sound: "MOBILE_PURCHASE"
});
function clock() {
  let now = 0, sequence = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    setTimeout(callback: () => void, ms: number) {
      const id = ++sequence; timers.set(id, { at: now + ms, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout(id: ReturnType<typeof setTimeout>) { timers.delete(id as unknown as number); },
    advance(ms: number) {
      const until = now + ms;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        now = next[1].at; timers.delete(next[0]); next[1].callback();
      }
      now = until;
    },
    count: () => timers.size
  };
}

test("incoming trade creates an actionable toast and opens the existing trade tab", (t) => {
  const tracker = new MobileFeedbackEventTracker(), before = state();
  tracker.update(before, "p1");
  const next = structuredClone(before); next.trades.push(trade("offer-1"));
  const events = tracker.update(next, "p1");
  assert.equal(events.length, 1);
  assert.equal(events[0]?.title, "HANDELSANGEBOT");
  assert.match(events[0]!.message, /Tharok möchte mit dir handeln/);
  assert.equal(events[0]?.actionLabel, "HANDEL ANSEHEN");
  assert.equal(events[0]?.action, openControllerTrade);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let scrolled = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hash: "" }, scrollTo: () => { scrolled = true; } } });
  t.after(() => previous ? Object.defineProperty(globalThis, "window", previous) : Reflect.deleteProperty(globalThis, "window"));
  events[0]!.action!();
  assert.equal(window.location.hash, "#controller-trade"); assert.ok(scrolled);
  assert.deepEqual(tracker.update(structuredClone(next), "p1"), []);
});

test("own turn feedback occurs once per turn number, including consecutive turns for the same player", () => {
  const tracker = new MobileFeedbackEventTracker(), next = state();
  tracker.update(next, "p1");
  next.currentPlayerId = "p1"; next.turnNumber = 2;
  assert.equal(tracker.update(structuredClone(next), "p1")[0]?.type, "turn");
  assert.deepEqual(tracker.update(structuredClone(next), "p1"), []);
  next.turnPhase = "rolling"; next.turnContext.rollSequence++;
  assert.deepEqual(tracker.update(structuredClone(next), "p1"), []);
  next.turnNumber = 3; next.turnPhase = "waitingForRoll";
  assert.equal(tracker.update(next, "p1")[0]?.type, "turn");
  next.turnPhase = "determiningOrder"; next.turnNumber++;
  assert.deepEqual(tracker.update(next, "p1"), []);
});

test("initial history is silent; pending offers and current own turn remain discoverable", () => {
  const next = state(); next.currentPlayerId = "p1";
  next.trades.push(trade("pending"), { ...trade("accepted"), status: "accepted" });
  next.economyLog.push({ id: "old", kind: "purchase", message: "Alter Kauf", playerIds: ["p1"], createdAt: 1 });
  const tracker = new MobileFeedbackEventTracker();
  assert.deepEqual(tracker.update(next, "p1").map((event) => event.type), ["tradeOffer", "turn"]);
  assert.deepEqual(tracker.update(structuredClone(next), "p1"), []);
  next.startedAt = 2;
  assert.equal(tracker.update(next, "p1").length, 2);
});

test("accepted and rejected trades are deduplicated by offer ID and status", () => {
  const next = state(), tracker = new MobileFeedbackEventTracker();
  next.trades = [trade("accepted"), trade("rejected")]; tracker.update(next, "p1");
  next.trades[0]!.status = "accepted"; next.trades[1]!.status = "rejected";
  const events = tracker.update(structuredClone(next), "p1");
  assert.deepEqual(events.map((event) => event.type), ["tradeAccepted", "tradeRejected"]);
  assert.equal(events[0]?.hapticPattern, 60); assert.equal(events[1]?.hapticPattern, undefined);
  assert.deepEqual(tracker.update(next, "p1"), []);
});

test("purchase, actual building name/level and settled rent come from confirmed records without mutation", () => {
  const before = state(), next = structuredClone(before), tracker = new MobileFeedbackEventTracker();
  tracker.update(before, "p1");
  const tile = BOARD_TILES.find((tile) => tile.id === "fluesterhain")!;
  next.propertyOwnerships.push({ tileIndex: tile.index, ownerId: "p1", mortgaged: false, buildingLevel: 1 });
  next.lastBuildingAction = { id: "build", type: "build", playerId: "p1", tileIndex: tile.index, fromLevel: 0, toLevel: 1, buildingName: "Wurzelhütte", amount: 50, createdAt: 2 };
  next.economyLog.push(
    { id: "buy", kind: "purchase", message: "Kauf", playerIds: ["p1"], amount: -100, createdAt: 2 },
    { id: "rent", kind: "rent", message: "Miete", playerIds: ["p2", "p1"], amount: -60, createdAt: 3 },
    { id: "pay", kind: "rent", message: "Miete", playerIds: ["p1", "p2"], amount: -20, createdAt: 4 },
    { id: "ambiguous", kind: "rent", message: "Nicht zuordenbar", playerIds: ["p1"], amount: -50, createdAt: 5 });
  const frozen = JSON.stringify(next), events = tracker.update(next, "p1");
  assert.match(events.find((event) => event.type === "build")!.message, /Wurzelhütte · Stufe 1/);
  const purchase = events.find((event) => event.type === "purchase")!;
  assert.match(purchase.message, /Flüsterhain gehört jetzt dir/); assert.equal(purchase.accent, "#9b5de5");
  assert.deepEqual(events.filter((event) => event.type === "coin").map((event) => event.message), ["+60 Gold von Tharok", "−20 Gold an Tharok"]);
  assert.equal(JSON.stringify(next), frozen);
  assert.deepEqual(tracker.update(structuredClone(next), "p1"), []);
});

test("double feedback waits for landing and never promises a bonus for third doubles or dungeon escape", () => {
  const next = state(), tracker = new MobileFeedbackEventTracker(); tracker.update(next, "p1");
  next.lastTurnAction = { id: "double", kind: "double", playerId: "p1", createdAt: 2 };
  next.turnContext.pendingExtraRoll = true; next.turnPhase = "moving";
  assert.deepEqual(tracker.update(structuredClone(next), "p1"), []);
  next.turnPhase = "waitingForEndTurn";
  assert.equal(tracker.update(structuredClone(next), "p1")[0]?.type, "double");
  assert.deepEqual(tracker.update(structuredClone(next), "p1"), []);
  next.lastTurnAction = { id: "third", kind: "thirdDouble", playerId: "p1", createdAt: 3 };
  assert.deepEqual(tracker.update(structuredClone(next), "p1"), []);
  next.lastTurnAction = { id: "escape", kind: "dungeonEscaped", playerId: "p1", createdAt: 4 };
  assert.deepEqual(tracker.update(next, "p1"), []);
});

test("own card-draw log IDs announce repeated cards once each, without duplicating effects", () => {
  const next = state(), tracker = new MobileFeedbackEventTracker(); tracker.update(next, "p1");
  const record = (id: string, message: string) => ({ id, kind: "system" as const, message, playerIds: ["p1"], createdAt: 2 });
  next.economyLog.push(record("card-a", "Myrra zieht Abenteuer: Der Weg."), record("effect", "Myrra erhält 100 Gold."));
  assert.deepEqual(tracker.update(structuredClone(next), "p1").map((event) => event.type), ["adventure"]);
  assert.deepEqual(tracker.update(structuredClone(next), "p1"), []);
  next.economyLog.push(record("card-b", "Myrra zieht Abenteuer: Der Weg."), record("card-c", "Myrra zieht Schicksal: Die Nacht."));
  assert.deepEqual(tracker.update(next, "p1").map((event) => event.type), ["adventure", "fate"]);
});

test("disabled effects and haptics suppress only their optional channels", () => {
  const calls: string[] = [];
  const feedback = { ...notice("turn"), hapticPattern: 80 };
  const manager = { getSettings: () => ({ ...DEFAULT_AUDIO_SETTINGS, sfxEnabled: false, hapticsEnabled: false }), play: () => { calls.push("sound"); } };
  const device = { vibrate: () => { calls.push("haptic"); return true; } };
  playMobileFeedback(feedback, manager, device); assert.deepEqual(calls, []);
  manager.getSettings = () => ({ ...DEFAULT_AUDIO_SETTINGS, sfxEnabled: true, hapticsEnabled: false });
  playMobileFeedback(feedback, manager, device); assert.deepEqual(calls, ["sound"]);
  assert.equal(normalizeAudioSettings({ hapticsEnabled: false }).hapticsEnabled, false);
  assert.equal(normalizeAudioSettings({ hapticsEnabled: "invalid" }).hapticsEnabled, true);
});

test("missing or rejecting vibration and blocked sound never throw", () => {
  const feedback = { ...notice("turn"), hapticPattern: 80 };
  const manager = { getSettings: () => ({ ...DEFAULT_AUDIO_SETTINGS }), play: () => { throw Error("blocked"); } };
  assert.doesNotThrow(() => playMobileFeedback(feedback, manager, {} as Pick<Navigator, "vibrate">));
  assert.doesNotThrow(() => playMobileFeedback(feedback, manager, { vibrate: () => { throw Error("blocked"); } }));
});

test("queue shows one toast, runs each effect once, then removes it after its duration and fade", () => {
  const time = clock(), shown: string[] = [], queue = new MobileFeedbackQueue((event) => shown.push(event.id), time);
  queue.showMobileFeedback(notice("first")); queue.showMobileFeedback(notice("second")); queue.showMobileFeedback(notice("first"));
  assert.equal(queue.getSnapshot().current?.id, "first"); assert.deepEqual(shown, ["first"]);
  time.advance(3500); assert.ok(queue.getSnapshot().exiting);
  time.advance(TOAST_FADE_MS); assert.equal(queue.getSnapshot().current?.id, "second");
  assert.deepEqual(shown, ["first", "second"]);
  time.advance(3500 + TOAST_FADE_MS); assert.equal(queue.getSnapshot().current, undefined);
  assert.equal(time.count(), 0);
});

test("trade priority interrupts a normal toast and actionable duration is six seconds", () => {
  const time = clock(), queue = new MobileFeedbackQueue(() => undefined, time);
  queue.showMobileFeedback(notice("normal")); queue.showMobileFeedback(notice("later"));
  queue.showMobileFeedback({ ...notice("urgent", "tradeOffer"), action: () => undefined });
  assert.ok(queue.getSnapshot().exiting);
  time.advance(TOAST_FADE_MS); assert.equal(queue.getSnapshot().current?.id, "urgent");
  time.advance(5999); assert.equal(queue.getSnapshot().exiting, false);
  time.advance(1 + TOAST_FADE_MS); assert.equal(queue.getSnapshot().current?.id, "later");
  queue.clear(); assert.equal(time.count(), 0); assert.equal(queue.getSnapshot().current, undefined);
});

test("queue bounds a notification burst and keeps urgent offers", () => {
  const time = clock(), shown: string[] = [], queue = new MobileFeedbackQueue((event) => shown.push(event.id), time);
  queue.showMobileFeedback(notice("active", "tradeOffer"));
  queue.showMobileFeedback(notice("urgent", "tradeOffer"));
  for (let index = 0; index < 30; index++) queue.showMobileFeedback(notice(String(index)));
  time.advance(60_000);
  assert.equal(shown.length, 7); assert.equal(shown[1], "urgent");
});
