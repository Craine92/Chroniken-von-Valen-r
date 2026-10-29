import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardReveal } from "./CardReveal";

/** Markup ohne weiche Trennstriche: Titel enthalten Trennstellen an den Wortfugen. */
const plain = (markup: string) => markup.replaceAll("­", "");

test("adventure reveal renders fantasy title, flavor and transparent gold effect", () => {
  const markup = plain(renderToStaticMarkup(<CardReveal activeCard={{ cardId: "adv_001", deck: "adventure", playerId: "p1", status: "readyToAcknowledge" }} />));
  assert.match(markup, /ABENTEUER/);
  assert.match(markup, /Lohn des Runenschmieds/);
  assert.match(markup, /Du erhältst 100 Gold/);
  assert.match(markup, /card-reveal--adventure/);
  assert.match(markup, /src="\/assets\/cards\/CardAbenteuer.png"/);
  assert.match(markup, /width="1058" height="1487"/);
});

test("fate reveal uses moon styling and exposes a repair rule", () => {
  const markup = plain(renderToStaticMarkup(<CardReveal activeCard={{ cardId: "fate_021", deck: "fate", playerId: "p1", status: "readyToAcknowledge" }} />));
  assert.match(markup, /SCHICKSAL/);
  assert.match(markup, /Riss im Schicksalsgewebe/);
  assert.match(markup, /25 Gold je Baueinheit/);
  assert.match(markup, /card-reveal--fate/);
  assert.match(markup, /src="\/assets\/cards\/CardSchicksal.png"/);
});

test("movement, dungeon and keepable effects are readable without hidden rules", () => {
  const movement = plain(renderToStaticMarkup(<CardReveal activeCard={{ cardId: "adv_011", deck: "adventure", playerId: "p1", status: "waitingForMovement" }} />));
  const dungeon = plain(renderToStaticMarkup(<CardReveal activeCard={{ cardId: "adv_022", deck: "adventure", playerId: "p1", status: "waitingForMovement" }} />));
  const keepable = plain(renderToStaticMarkup(<CardReveal activeCard={{ cardId: "fate_024", deck: "fate", playerId: "p1", status: "readyToAcknowledge" }} />));
  assert.match(movement, /nächsten Hafen/);
  assert.match(dungeon, /Dunklen Kerker/);
  assert.match(keepable, /Behalte diese Karte/);
});

test("the card shows its theme picture with title and text, on the TV and compact on the phone", () => {
  for (const compact of [false, true]) {
    const markup = plain(renderToStaticMarkup(<CardReveal activeCard={{ cardId: "fate_010", deck: "fate", playerId: "p1", status: "readyToAcknowledge" }} compact={compact} />));
    assert.match(markup, /card-reveal--illustrated/);
    assert.match(markup, /<img src="\/assets\/cards\/art\/14-dunkles-omen.webp"/);
    assert.match(markup, /Zerbrochener Weissagungsspiegel/);
    assert.match(markup, /card-reveal__text/);
  }
});

test("the frame lies on top: picture and parchment fill exactly the inner opening measured from the frame image", async () => {
  const { CARD_FRAME_OPENINGS } = await import("../game/assets/card-frame-openings");
  const { existsSync } = await import("node:fs");
  for (const [deck, cardId] of [["adventure", "adv_025"], ["fate", "fate_010"]] as const) {
    const opening = CARD_FRAME_OPENINGS[deck];
    // Die Öffnung liegt innen im Rahmen: oben Platz für das Medaillon, ringsum für Ranken und Goldlinie.
    assert.ok(opening.inset.top > .2 && opening.inset.top < .26, `${deck} top`);
    for (const side of ["left", "right", "bottom"] as const) assert.ok(opening.inset[side] > .12 && opening.inset[side] < .18, `${deck} ${side}`);
    // Der Text hält unten Abstand zum Medaillon.
    assert.ok(opening.textBottom > .08 && opening.textBottom < .16, `${deck} text`);
    for (const path of [opening.overlay, opening.mask]) assert.ok(existsSync(new URL(`../../public${path}`, import.meta.url)), path);
    const markup = plain(renderToStaticMarkup(<CardReveal activeCard={{ cardId, deck, playerId: "p1", status: "readyToAcknowledge" }} />));
    // Reihenfolge der Ebenen: Rahmen, Inhalt in der Öffnung, Rahmen-Deckschicht ganz vorn.
    const frame = markup.indexOf("card-reveal__frame\""), content = markup.indexOf("card-reveal__content"), overlay = markup.indexOf("card-reveal__frame-overlay");
    assert.ok(frame >= 0 && frame < content && content < overlay, `${deck}: frame, content, overlay`);
    assert.match(markup, new RegExp(`--opening-top:${(opening.inset.top * 100).toFixed(2)}%`));
    assert.ok(markup.includes(`--opening-mask:url(&quot;${opening.mask}&quot;)`), `${deck}: mask`);
  }
});

test("long title words break only at their joints, and every card view shows the flavor text", async () => {
  const { CARD_DEFINITIONS } = await import("@valenor/shared");
  const { LONG_TITLE_WORD, TITLE_BREAKS, hyphenateTitle } = await import("./card-title");
  const longWords = new Set(CARD_DEFINITIONS.flatMap(card => card.title.match(/\p{L}+/gu) ?? []).filter(word => word.length >= LONG_TITLE_WORD));
  for (const word of longWords) assert.ok(TITLE_BREAKS[word], `${word} needs a break point`);
  for (const [word, breaks] of Object.entries(TITLE_BREAKS)) assert.equal(breaks.replaceAll("|", ""), word, `${word}: break points must not change the word`);
  assert.equal(hyphenateTitle("Zerbrochener Weissagungsspiegel"), "Zer­brochener Weis­sagungs­spiegel");
  assert.equal(hyphenateTitle("Greifenfeder"), "Greifen­feder");
  for (const compact of [false, true]) {
    const markup = plain(renderToStaticMarkup(<CardReveal activeCard={{ cardId: "fate_010", deck: "fate", playerId: "p1", status: "readyToAcknowledge" }} compact={compact} />));
    assert.match(markup, /<p>Sieben Jahre Pech/, compact ? "compact" : "large");
  }
});
