import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChroniclePanel } from "./ChroniclePanel";
import { CHRONICLE_IDLE_LINE } from "../game/living/chronicle-lines";

test("the chronicle panel shows the newest line first and waits quietly before the first event", () => {
  assert.match(renderToStaticMarkup(<ChroniclePanel lines={[]} />), new RegExp(CHRONICLE_IDLE_LINE));
  const html = renderToStaticMarkup(<ChroniclePanel lines={[
    { id: "a", kind: "purchase", tone: "gain", text: "Rotfels fällt an Ragna – die Trommeln schweigen." },
    { id: "b", kind: "rent", tone: "neutral", text: "Philipp zahlt 20 Gold an Ragna." }
  ]} />);
  assert.ok(html.indexOf("Philipp zahlt") < html.indexOf("Rotfels fällt"), "newest first");
  assert.match(html, /chronicle-line--neutral" data-age="0">Philipp zahlt/);
  assert.match(html, /chronicle-line--gain" data-age="1">Rotfels/);
  assert.match(html, /DIE CHRONIK/);
  const facts = renderToStaticMarkup(<ChroniclePanel lines={[{ id: "f", kind: "fact", tone: "neutral", text: "Ragna belehnt Rotfels." }]} />);
  assert.match(facts, /chronicle-line--fact" data-age="0">Ragna belehnt Rotfels/);
});
