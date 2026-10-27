import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreditsDialog } from "./CreditsDialog";
import { parseCreditsInline, parseCreditsMarkdown } from "./credits-markdown";

const attributions = readFileSync(new URL("../../../../../ATTRIBUTIONS.md", import.meta.url), "utf8");

test("the credits read ATTRIBUTIONS.md and skip the maintainer notes", () => {
  const blocks = parseCreditsMarkdown(attributions);
  const headings = blocks.filter(block => block.kind === "heading").map(block => block.kind === "heading" ? block.text : "");
  assert.deepEqual(headings, ["Asset attributions", "Valenør Core Asset Pack", "Feld-, Gebäude- und Titelbilder", "Fonts (design system \"Codex\")", "Icons (design system \"Codex\")"]);
  const images = blocks.find(block => block.kind === "table" && block.rows.some(row => row[0]?.startsWith("Feldbilder")));
  assert.ok(images && images.kind === "table");
  assert.ok(images.rows.every(row => row[2] === "vom Projektinhaber mit ChatGPT erstellt" && row[6] === "2026-10-27"));
  assert.ok(!blocks.some(block => block.kind === "list"), "the 'record for every future asset' checklist stays hidden");
  assert.ok(!JSON.stringify(blocks).includes("For every future imported asset"));
  const fonts = blocks.find(block => block.kind === "table" && block.rows.some(row => row[0] === "Cinzel"));
  assert.ok(fonts && fonts.kind === "table");
  assert.deepEqual(fonts.headers, ["Family", "Files", "Creator / copyright", "Source", "License", "Modified", "Retrieved"]);
  assert.deepEqual(fonts.rows.map(row => row[0]), ["Cinzel", "Alegreya Sans"]);
});

test("addresses stay plain text so the packaged game never navigates away", () => {
  assert.deepEqual(parseCreditsInline("see https://game-icons.net, licensed under `CC BY 3.0`."), [
    { kind: "text", text: "see " }, { kind: "url", text: "https://game-icons.net" }, { kind: "text", text: ", licensed under " }, { kind: "code", text: "CC BY 3.0" }, { kind: "text", text: "." }
  ]);
  assert.deepEqual(parseCreditsInline("[Fontsource](https://fontsource.org)"), [{ kind: "text", text: "Fontsource (" }, { kind: "url", text: "https://fontsource.org" }, { kind: "text", text: ")" }]);
});

test("the dialog shows fonts, icons with the CC BY attribution and the asset pack", () => {
  const markup = renderToStaticMarkup(<CreditsDialog markdown={attributions} onClose={() => undefined} />);
  assert.match(markup, /role="dialog" aria-modal="true" aria-labelledby="credits-title"/);
  assert.match(markup, /Mitwirkende &amp; Lizenzen/);
  assert.match(markup, /Valenør Core Asset Pack/);
  assert.match(markup, /<h4><span>Cinzel<\/span><\/h4>/);
  assert.match(markup, /<h4><span>Alegreya Sans<\/span><\/h4>/);
  assert.match(markup, /SIL Open Font License 1\.1/);
  assert.match(markup, /Icons made by Lorc, Delapouite and contributors/);
  assert.match(markup, /Creative Commons Attribution 3\.0 Unported \(CC BY 3\.0\)/);
  assert.match(markup, /<span class="credits__url">https:\/\/game-icons\.net<\/span>/);
  assert.doesNotMatch(markup, /<a\s/, "no navigating links");
  assert.match(markup, /<\/svg> Schließen<\/button>/);
});
