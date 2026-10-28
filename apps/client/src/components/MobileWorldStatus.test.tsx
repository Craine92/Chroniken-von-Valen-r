import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHRONICLE_EVENTS, getRegionalChronicleDefinition } from "@valenor/shared";
import { livingTestState, nextState } from "../game/living/living-fixtures";
import { MobileWorldStatus, getWorldStatus } from "./MobileWorldStatus";

const blessing = nextState(livingTestState(), draft => {
  const definition = getRegionalChronicleDefinition(CHRONICLE_EVENTS.find(event => event.id === "builders-blessing")!, ["humans", "orcs"]);
  draft.activeChronicleEvent = { ...definition, startedAfterRound: 6, startedAtRound: 7, expiresAtRound: 9, startedAt: 1 };
});

test("a chronicle event tells every phone its name, effect, realms and how long it lasts", () => {
  const [entry] = getWorldStatus(blessing);
  assert.deepEqual(entry, {
    kind: "chronicle", title: "Segen der Baumeister", effect: "Baukosten: −25 %",
    description: "Bauwerke in den betroffenen Reichen kosten 25 % weniger.",
    regions: ["Kronenwald", "Eisenöde"], duration: "noch 2 Runden"
  });
  assert.equal(getWorldStatus(nextState(blessing, draft => { draft.currentRound = 8; }))[0]?.duration, "endet mit dieser Runde");
  assert.deepEqual(getWorldStatus(nextState(blessing, draft => { draft.currentRound = 9; })), [], "an expired event is gone");
});

test("waiting world impulses are listed until they are used up", () => {
  const state = nextState(livingTestState(), draft => { draft.worldImpulseEffects = { buildingFervor: true, harborWindUntilRound: 7 }; });
  assert.deepEqual(getWorldStatus(state).map(entry => [entry.title, entry.duration]), [["Baueifer", "bis zum nächsten Bau"], ["Hafenwind", "bis Rundenende"]]);
  assert.deepEqual(getWorldStatus(nextState(state, draft => { draft.currentRound = 8; draft.worldImpulseEffects = { harborWindUntilRound: 7 }; })), []);
});

test("the phone shows a small hint while something is active, nothing otherwise", () => {
  assert.equal(renderToStaticMarkup(<MobileWorldStatus state={livingTestState()} />), "");
  const html = renderToStaticMarkup(<MobileWorldStatus state={nextState(blessing, draft => { draft.worldImpulseEffects = { merchantLuck: true }; })} />);
  assert.match(html, /<summary>.*Segen der Baumeister.*noch 2 Runden · \+1/);
  assert.match(html, /Kronenwald · Eisenöde/);
  assert.match(html, /Händlerglück/);
});
