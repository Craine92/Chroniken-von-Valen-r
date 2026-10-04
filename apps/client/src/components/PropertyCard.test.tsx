import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOARD_TILES, type GamePlayerState, type PropertyOwnership } from "@valenor/shared";
import { PropertyCard } from "./PropertyCard";

const owner: GamePlayerState = {
  id: "p1", name: "Philipp", type: "human", color: "violet", connectionState: "connected",
  gold: 1_400, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }
};

test("an owned property card shows its building, cost and complete rent schedule", () => {
  const ownership: PropertyOwnership = { tileIndex: 1, ownerId: "p1", mortgaged: false, buildingLevel: 2 };
  const markup = renderToStaticMarkup(
    <PropertyCard tile={BOARD_TILES[1]!} ownership={ownership} owner={owner} compact completeGroup />
  );
  assert.match(markup, /Baumhaus/);
  assert.match(markup, /Baustufe/);
  assert.match(markup, /50 Gold/);
  assert.match(markup, /Sternenzitadelle/);
  assert.match(markup, /250 Gold/);
  assert.match(markup, /Vollständige Region/);
});

test("harbor cards never expose building controls or rent tiers", () => {
  const ownership: PropertyOwnership = { tileIndex: 5, ownerId: "p1", mortgaged: false, buildingLevel: 0 };
  const markup = renderToStaticMarkup(<PropertyCard tile={BOARD_TILES[5]!} ownership={ownership} owner={owner} />);
  assert.doesNotMatch(markup, /Baustufe/);
  assert.doesNotMatch(markup, /Mietstaffel/);
});

test("mortgaged cards show their sealed state and authoritative redemption cost", () => {
  const ownership: PropertyOwnership = { tileIndex: 11, ownerId: "p1", mortgaged: true, buildingLevel: 0 };
  const markup = renderToStaticMarkup(<PropertyCard tile={BOARD_TILES[11]!} ownership={ownership} owner={owner} />);
  assert.match(markup, /Verpfändet/);
  assert.match(markup, /Auslösung/);
  assert.match(markup, /83 Gold/);
});
