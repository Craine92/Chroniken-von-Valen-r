import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_TILES } from "@valenor/shared";
import { CHRONICLE_LINES, REALM_FLOURISHES } from "./chronicle-lines";
import { CHRONICLE_LINES_PER_UPDATE, ChronicleTracker, Chronicler, getInitialChronicleLines, pickVariant } from "./chronicler";
import { deriveGameMoments, type GameMoment } from "./moments";
import { livingTestState, logEntry, nextState } from "./living-fixtures";

/** Liefert reihum die angegebenen Zufallswerte. */
const sequence = (...values: number[]) => { let index = 0; return () => values[index++ % values.length]!; };

test("pickVariant never returns the previous variant twice in a row", () => {
  const options = ["a", "b", "c", "d"] as const;
  for (const value of [0, .2, .49, .5, .74, .99]) assert.notEqual(pickVariant(options, "b", () => value), "b");
  assert.equal(pickVariant(["only"], "only", () => .5), "only", "with a single variant there is no choice");
  assert.equal(pickVariant(options, "unknown", () => 0), "a", "an unknown previous variant does not shrink the pool");
  assert.equal(pickVariant(options, undefined, () => .99), "d");
});

test("every event type has several variants and every realm several flourishes", () => {
  for (const [kind, lines] of Object.entries(CHRONICLE_LINES)) {
    assert.ok(lines.length >= 3, `${kind} has only ${lines.length} variants`);
    assert.equal(new Set(lines).size, lines.length, `${kind} repeats itself`);
  }
  for (const [realm, flourishes] of Object.entries(REALM_FLOURISHES)) assert.ok(flourishes.length >= 4, realm);
});

test("a long run of the same event never repeats the sentence or the flourish directly", () => {
  const state = livingTestState();
  const chronicler = new Chronicler(sequence(.1, .7, .3, .9, .5, 0, .99));
  const moment: GameMoment = { kind: "purchase", playerId: "p3", tileIndex: 24, amount: 240 };
  let previous = "";
  const seen = new Set<string>();
  for (let index = 0; index < 60; index += 1) {
    const text = chronicler.narrate(moment, state)!.text;
    const [sentence, flourish] = text.split(" – ");
    const [lastSentence, lastFlourish] = previous.split(" – ");
    assert.notEqual(sentence, lastSentence, `sentence repeated: ${text}`);
    assert.notEqual(flourish, lastFlourish, `flourish repeated: ${text}`);
    previous = text;
    seen.add(sentence!);
  }
  assert.ok(seen.size >= 4, "the chronicler draws on several variants");
});

test("purchases name the player, the tile and a flourish from the tile's realm", () => {
  const state = livingTestState();
  const line = new Chronicler(() => 0).narrate({ kind: "purchase", playerId: "p3", tileIndex: 24, amount: 240 }, state)!;
  assert.equal(line.text, `Rotfels fällt an Ragna – ${REALM_FLOURISHES.orcs[0]}.`);
  assert.equal(line.tone, "gain");
  assert.equal(BOARD_TILES[24]!.region, "orcs");
});

test("templates whose placeholders have no value are skipped, e.g. rent without a landing tile", () => {
  const state = livingTestState();
  const chronicler = new Chronicler(sequence(0, .2, .4, .6, .8, .99));
  for (let index = 0; index < 20; index += 1) {
    const text = chronicler.narrate({ kind: "rent", payerId: "p1", ownerId: "p2", amount: 20, payerGoldBefore: 1_000 }, state)!.text;
    assert.doesNotMatch(text, /\{|\}|undefined/);
    assert.match(text, /20 Gold/);
  }
});

test("high rents use the harsher sentences, small rents the calm ones", () => {
  const state = livingTestState();
  const high = new Chronicler(() => 0).narrate({ kind: "rent", payerId: "p1", ownerId: "p3", amount: 450, tileIndex: 24, payerGoldBefore: 1_000 }, state)!;
  assert.equal(high.text, "Ein harter Tag für Philipp: 450 Gold an Ragna.");
  const calm = new Chronicler(() => 0).narrate({ kind: "rent", payerId: "p1", ownerId: "p3", amount: 20, tileIndex: 24, payerGoldBefore: 1_000 }, state)!;
  assert.equal(calm.text, "Philipp zahlt 20 Gold an Ragna.");
});

test("victories with several winners list all names", () => {
  const line = new Chronicler(() => 0).narrate({ kind: "victory", winnerIds: ["p1", "p2", "p4"] }, livingTestState())!;
  assert.equal(line.text, "Philipp, Justine und Eldric teilen sich den Thron von Valenør.");
  assert.equal(line.tone, "triumph");
  assert.equal(new Chronicler(() => 0).narrate({ kind: "victory", winnerIds: ["p2"] }, livingTestState())!.text, "Justine krönt die Chronik von Valenør.");
});

test("deriveGameMoments recognises a purchase that completes a group and orders the moments by importance", () => {
  const before = livingTestState();
  before.propertyOwnerships = [{ tileIndex: 21, ownerId: "p3", mortgaged: false, buildingLevel: 0 }, { tileIndex: 23, ownerId: "p3", mortgaged: false, buildingLevel: 0 }];
  const after = nextState(before, draft => {
    draft.propertyOwnerships.push({ tileIndex: 24, ownerId: "p3", mortgaged: false, buildingLevel: 0 });
    draft.economyLog.push(logEntry("buy", "purchase", ["p3"], -240));
    draft.lastMomentumCelebration = { id: "group", type: "completeGroup", playerId: "p3", groupId: "group_aschelande", title: "", subtitle: "", createdAt: 1 };
  });
  assert.deepEqual(deriveGameMoments(before, after), [
    { kind: "groupComplete", playerId: "p3", groupId: "group_aschelande" },
    { kind: "purchase", playerId: "p3", tileIndex: 24, amount: 240 }
  ]);
});

test("deriveGameMoments tells auction wins from bids and reports rent with the landing tile", () => {
  const before = livingTestState();
  before.auction = { tileIndex: 34, currentBid: 300, highestBidderId: "p2", participantIds: ["p1", "p2"], withdrawnPlayerIds: [], pausedForPlayerIds: [], revision: 3 };
  const bidding = nextState(before, draft => { draft.economyLog.push(logEntry("bid", "auction", ["p2"], -310)); });
  assert.deepEqual(deriveGameMoments(before, bidding), [], "a bid alone is no story yet");
  const won = nextState(bidding, draft => {
    delete draft.auction;
    draft.economyLog.push(logEntry("won", "auction", ["p2"], -310));
    draft.propertyOwnerships.push({ tileIndex: 34, ownerId: "p2", mortgaged: false, buildingLevel: 0 });
  });
  assert.deepEqual(deriveGameMoments(bidding, won), [{ kind: "auctionWon", playerId: "p2", tileIndex: 34, amount: 310 }]);

  const rent = nextState(won, draft => {
    draft.lastMovement = { kind: "normal", playerId: "p1", from: 30, to: 34, path: [31, 32, 33, 34], passedStart: false, landedTile: BOARD_TILES[34]! };
    draft.economyLog.push(logEntry("rent", "rent", ["p1", "p2"], -150));
  });
  assert.deepEqual(deriveGameMoments(won, rent), [{ kind: "rent", payerId: "p1", ownerId: "p2", amount: 150, tileIndex: 34, payerGoldBefore: 1_000 }]);
});

test("deriveGameMoments reports dungeon, double, bankruptcy, last round and victory", () => {
  const before = livingTestState();
  before.quickGameClock = { durationMs: 1, startedAt: 0, totalPausedMs: 0, expired: false, serverNow: 0, remainingMs: 1 };
  const after = nextState(before, draft => {
    draft.players[0]!.dungeon.inDungeon = true;
    draft.players[1]!.isBankrupt = true;
    draft.lastTurnAction = { id: "turn", kind: "double", playerId: "p3", createdAt: 1 };
    draft.quickGameClock!.expired = true;
  });
  assert.deepEqual(deriveGameMoments(before, after).map(moment => moment.kind), ["bankrupt", "dungeonEnter", "double", "lastRound"]);
  const finished = nextState(after, draft => { draft.status = "finished"; draft.gameResult = { finishReason: "quickGameTimeExpired", winnerIds: ["p4"], finishedAt: 1, roundsPlayed: 7 }; });
  assert.deepEqual(deriveGameMoments(after, finished), [{ kind: "victory", winnerIds: ["p4"] }]);
});

test("the tracker narrates at most two moments per state, ignores the first state and an unchanged state", () => {
  const before = livingTestState();
  const tracker = new ChronicleTracker(before, new Chronicler(() => 0));
  assert.deepEqual(tracker.update(before), []);
  const busy = nextState(before, draft => {
    draft.players[0]!.dungeon.inDungeon = true;
    draft.players[1]!.isBankrupt = true;
    draft.lastTurnAction = { id: "turn", kind: "double", playerId: "p3", createdAt: 1 };
  });
  const lines = tracker.update(busy);
  assert.equal(lines.length, CHRONICLE_LINES_PER_UPDATE);
  assert.deepEqual(lines.map(line => line.kind), ["bankrupt", "dungeonEnter"]);
  assert.notEqual(lines[0]!.id, lines[1]!.id);
  assert.deepEqual(new ChronicleTracker().update(busy), [], "without a previous state there is nothing to compare");
});

test("one chronicle: what the chronicler does not tell appears as a plain log line, nothing twice", () => {
  const start = livingTestState();
  const tracker = new ChronicleTracker(start, new Chronicler(() => 0));
  const next = nextState(start, draft => {
    draft.economyLog.push(
      logEntry("Philipp kauft Mondpfad.", "purchase", ["p1"], -60),
      logEntry("Justine belehnt Rosenhain für 80 Gold.", "mortgage", ["p2"], 80),
      logEntry("Ragna erfüllt den Auftrag „Landkäufer“.", "quest", ["p3"])
    );
    draft.propertyOwnerships.push({ tileIndex: 1, ownerId: "p1", buildingLevel: 0, mortgaged: false });
  });
  const lines = tracker.update(next);
  assert.deepEqual(lines.map(line => line.kind), ["purchase", "fact", "fact"]);
  assert.deepEqual(lines.filter(line => line.kind === "fact").map(line => line.text), ["Justine belehnt Rosenhain für 80 Gold.", "Ragna erfüllt den Auftrag „Landkäufer“."]);
  assert.ok(!lines.some(line => line.kind === "fact" && line.text.includes("kauft")), "purchases are told, not repeated as a fact");
  assert.deepEqual(tracker.update(next), [], "an unchanged state adds nothing");
});

test("a sold building level shows up as a fact, a new building is told by the chronicler", () => {
  const start = livingTestState();
  start.propertyOwnerships.push({ tileIndex: 1, ownerId: "p1", buildingLevel: 2, mortgaged: false });
  const tracker = new ChronicleTracker(start, new Chronicler(() => 0));
  const sold = nextState(start, draft => {
    draft.economyLog.push(logEntry("Philipp verkauft eine Baustufe auf Mondpfad.", "building", ["p1"], 25));
    draft.lastBuildingAction = { id: "sell-1", type: "sell", playerId: "p1", tileIndex: 1, fromLevel: 2, toLevel: 1, buildingName: "Baumhaus", amount: 25, createdAt: 2 };
  });
  assert.deepEqual(tracker.update(sold).map(line => [line.kind, line.text]), [["fact", "Philipp verkauft eine Baustufe auf Mondpfad."]]);
  const built = nextState(sold, draft => {
    draft.economyLog.push(logEntry("Philipp baut auf Mondpfad.", "building", ["p1"], -50));
    draft.lastBuildingAction = { id: "build-1", type: "build", playerId: "p1", tileIndex: 1, fromLevel: 1, toLevel: 2, buildingName: "Baumhaus", amount: 50, createdAt: 3 };
  });
  assert.deepEqual(tracker.update(built).map(line => line.kind), ["build"]);
});

test("a TV joining mid-game starts the chronicle with the three newest log lines", () => {
  const state = livingTestState();
  state.economyLog = ["a", "b", "c", "d"].map(id => logEntry(`Eintrag ${id}`, "system", []));
  assert.deepEqual(getInitialChronicleLines(state).map(line => line.text), ["Eintrag b", "Eintrag c", "Eintrag d"]);
  assert.ok(getInitialChronicleLines(state).every(line => line.kind === "fact"));
  assert.deepEqual(getInitialChronicleLines(livingTestState()), []);
});
