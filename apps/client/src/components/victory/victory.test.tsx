import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { livingTestState, nextState } from "../../game/living/living-fixtures";
import { showcaseMatchStats } from "../../pages/victory-showcase";
import { MobileVictorySummary } from "./MobileVictorySummary";
import { VictoryCeremony, podiumOrder } from "./VictoryCeremony";
import { WealthChart, niceScale, placeEndLabels } from "./WealthChart";

const finished = nextState(livingTestState(), draft => {
  draft.status = "finished"; draft.currentRound = 12; draft.winnerIds = ["p4"]; draft.players[2]!.isBankrupt = true;
  draft.gameResult = { finishReason: "quickGameTimeExpired", winnerIds: ["p4"], finishedAt: Date.now() - 60_000, roundsPlayed: 12 };
  draft.matchStats = showcaseMatchStats(draft);
});

test("the wealth scale ends just above the highest value, in round steps", () => {
  assert.deepEqual(niceScale(4_300), [0, 1_000, 2_000, 3_000, 4_000, 5_000]);
  assert.deepEqual(niceScale(2_400), [0, 500, 1_000, 1_500, 2_000, 2_500]);
  assert.equal(niceScale(0).at(-1)! > 0, true);
});

test("end labels never overlap and stay inside the plot", () => {
  const placed = placeEndLabels([{ id: "a", y: 100 }, { id: "b", y: 104 }, { id: "c", y: 300 }, { id: "d", y: 298 }], 30, 10, 310);
  const ys = Object.values(placed).sort((left, right) => left - right);
  for (let index = 1; index < ys.length; index += 1) assert.ok(ys[index]! - ys[index - 1]! >= 30);
  assert.ok(ys.every(y => y >= 10 && y <= 310));
});

test("the podium puts second left, first in the middle, third right", () => {
  assert.deepEqual(podiumOrder(["p4", "p1", "p2", "p3"]), [{ id: "p1", place: 2 }, { id: "p4", place: 1 }, { id: "p2", place: 3 }]);
  assert.deepEqual(podiumOrder(["p1", "p2"]), [{ id: "p2", place: 2 }, { id: "p1", place: 1 }]);
});

test("the ceremony shows podium, a line per player with legend and table, records and an award for everyone", () => {
  const html = renderToStaticMarkup(<VictoryCeremony gameState={finished} />);
  assert.match(html, /data-stage="ceremony"/);
  assert.match(html, /Siegerpodest/);
  assert.equal((html.match(/class="wealth-chart__line/g) ?? []).length, 4);
  assert.equal((html.match(/<li><i class="wealth-key/g) ?? []).length, 4, "legend for every player");
  assert.match(html, /<table class="visually-hidden">/);
  assert.match(html, /Höchste Miete/);
  assert.equal((html.match(/class="victory-award /g) ?? []).length, 4);
  for (const name of ["Philipp", "Justine", "Ragna", "Eldric"]) assert.match(html, new RegExp(`<strong>${name}</strong><p>`), `${name} has at least one award`);
});

test("the phone shows the personal summary: place, own awards and own numbers", () => {
  const winner = renderToStaticMarkup(<MobileVictorySummary gameState={finished} playerId="p4" />);
  assert.match(winner, /Du hast gewonnen!/);
  assert.match(winner, /Baumeister/);
  const other = renderToStaticMarkup(<MobileVictorySummary gameState={finished} playerId="p2" />);
  assert.match(other, /Platz \d von 4/);
  assert.match(other, /Pechvogel/);
  assert.match(other, /Miete gezahlt/);
});

test("a single snapshot is not a history: the chart still renders without crashing", () => {
  assert.match(renderToStaticMarkup(<WealthChart snapshots={[{ round: 0, values: { a: 100 } }]} series={[{ id: "a", name: "A", color: "violet" }]} />), /wealth-chart/);
});
