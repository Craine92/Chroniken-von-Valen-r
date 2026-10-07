import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BOARD_TILES, type GamePlayerState, type PropertyOwnership } from "@valenor/shared";
import { PropertyGroupOverview } from "./PropertyGroupOverview";

const players: GamePlayerState[] = [
  { id: "p1", name: "Philipp", type: "human", color: "violet", characterId: "elvenSpellweaver" as const, connectionState: "connected", gold: 1_500, position: 1, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
  { id: "p2", name: "Justine", type: "human", color: "green", characterId: "humanKnight" as const, connectionState: "connected", gold: 1_500, position: 3, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
];

const mondhain = BOARD_TILES.filter((tile) => tile.propertyGroup === "Mondhain");

test("a property overview names every member and distinguishes own and rival ownership", () => {
  const ownerships: PropertyOwnership[] = [
    { tileIndex: 1, ownerId: "p1", mortgaged: false, buildingLevel: 0 },
    { tileIndex: 3, ownerId: "p2", mortgaged: false, buildingLevel: 0 }
  ];
  const markup = renderToStaticMarkup(
    <PropertyGroupOverview
      propertyGroup="Mondhain"
      tiles={mondhain}
      ownerships={ownerships}
      players={players}
      viewerId="p1"
      buildAvailable={false}
      economicallyActive={false}
    />
  );
  assert.match(markup, /2ER-SET/);
  assert.match(markup, /1\/2/);
  assert.match(markup, /Mondpfad/);
  assert.match(markup, /Sternenlichtung/);
  assert.match(markup, /Dein Besitz/);
  assert.match(markup, /Besitz: Justine/);
  assert.match(markup, /1\/2 · Fehlt: Sternenlichtung/);
});

test("a complete group exposes the immediate build-ready state", () => {
  const ownerships: PropertyOwnership[] = mondhain.map((tile) => ({ tileIndex: tile.index, ownerId: "p1", mortgaged: false, buildingLevel: 0 }));
  const markup = renderToStaticMarkup(
    <PropertyGroupOverview
      propertyGroup="Mondhain"
      tiles={mondhain}
      ownerships={ownerships}
      players={players}
      viewerId="p1"
      buildAvailable
      economicallyActive
    />
  );
  assert.match(markup, /2\/2/);
  assert.match(markup, /Bauen jetzt möglich/);
  assert.match(markup, /can-build/);
});
