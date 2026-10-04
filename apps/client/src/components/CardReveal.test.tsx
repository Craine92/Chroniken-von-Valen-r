import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardReveal } from "./CardReveal";

test("adventure reveal renders fantasy title, flavor and transparent gold effect", () => {
  const markup = renderToStaticMarkup(<CardReveal activeCard={{ cardId: "adv_001", deck: "adventure", playerId: "p1", status: "readyToAcknowledge" }} />);
  assert.match(markup, /ABENTEUER/);
  assert.match(markup, /Lohn des Runenschmieds/);
  assert.match(markup, /Du erhältst 100 Gold/);
  assert.match(markup, /card-reveal--adventure/);
  assert.match(markup, /card-reveal__illustration/);
  assert.match(markup, /card-reveal__corner--top/);
});

test("fate reveal uses moon styling and exposes a repair rule", () => {
  const markup = renderToStaticMarkup(<CardReveal activeCard={{ cardId: "fate_021", deck: "fate", playerId: "p1", status: "readyToAcknowledge" }} />);
  assert.match(markup, /SCHICKSAL/);
  assert.match(markup, /Riss im Schicksalsgewebe/);
  assert.match(markup, /25 Gold je Baueinheit/);
  assert.match(markup, /card-reveal--fate/);
  assert.match(markup, /card-reveal__illustration/);
});

test("movement, dungeon and keepable effects are readable without hidden rules", () => {
  const movement = renderToStaticMarkup(<CardReveal activeCard={{ cardId: "adv_011", deck: "adventure", playerId: "p1", status: "waitingForMovement" }} />);
  const dungeon = renderToStaticMarkup(<CardReveal activeCard={{ cardId: "adv_022", deck: "adventure", playerId: "p1", status: "waitingForMovement" }} />);
  const keepable = renderToStaticMarkup(<CardReveal activeCard={{ cardId: "fate_024", deck: "fate", playerId: "p1", status: "readyToAcknowledge" }} />);
  assert.match(movement, /nächsten Hafen/);
  assert.match(dungeon, /Dunklen Kerker/);
  assert.match(keepable, /Behalte diese Karte/);
});
