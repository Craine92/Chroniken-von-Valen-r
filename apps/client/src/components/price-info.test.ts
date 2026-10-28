import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_TILES, CHRONICLE_EVENTS, describeRent, getEffectiveBuildCost, getEffectiveBuildingSaleValue, getEffectiveMortgageRedemptionCost,
  getEffectivePurchasePrice, getEffectiveRent, getPriceInfo, getRegionalChronicleDefinition, type GameState, type PriceKind, type RegionType
} from "@valenor/shared";
import { livingTestState, nextState } from "../game/living/living-fixtures";

const REGIONS: RegionType[] = ["elves", "humans", "orcs", "steppe"];
const BUYABLE = BOARD_TILES.filter(tile => tile.economy);

function withEvent(state: GameState, eventId: string, regions: RegionType[]): GameState {
  return nextState(state, draft => {
    const definition = getRegionalChronicleDefinition(CHRONICLE_EVENTS.find(event => event.id === eventId)!, regions);
    draft.activeChronicleEvent = { ...definition, startedAfterRound: 6, startedAtRound: 7, expiresAtRound: 9, startedAt: 1 };
  });
}

/** Ragna besitzt alles, Grundstücke mit einer Baustufe. */
const owned = nextState(livingTestState(), draft => {
  draft.propertyOwnerships = BUYABLE.map(tile => ({ tileIndex: tile.index, ownerId: "p3", buildingLevel: tile.type === "property" ? 1 as const : 0 as const, mortgaged: false }));
  draft.lastDiceRoll = { die1: 3, die2: 4, total: 7, isDouble: false };
});

const effectiveFor: Record<PriceKind, (state: GameState, tile: (typeof BUYABLE)[number]) => number> = {
  purchase: (state, tile) => getEffectivePurchasePrice(state, tile),
  build: getEffectiveBuildCost,
  rent: (state, tile) => { const owner = state.propertyOwnerships.find(entry => entry.tileIndex === tile.index)?.ownerId; return owner ? getEffectiveRent(state, tile, owner) : tile.economy?.baseRent ?? 0; },
  mortgageRedemption: getEffectiveMortgageRedemptionCost,
  buildingSale: getEffectiveBuildingSaleValue
};

test("the shown price is always the price the server charges, and every change names its reason", () => {
  for (const event of CHRONICLE_EVENTS) for (const regions of [...REGIONS.map(region => [region]), REGIONS]) {
    for (const base of [livingTestState(), owned]) {
      const state = withEvent(base, event.id, regions);
      for (const tile of BUYABLE) for (const kind of Object.keys(effectiveFor) as PriceKind[]) {
        const info = getPriceInfo(state, tile, kind);
        assert.equal(info.effective, effectiveFor[kind](state, tile), `${event.id} ${tile.name} ${kind}`);
        if (info.changed) assert.ok(info.modifiers.length > 0, `${event.id} ${tile.name} ${kind}: change without a reason`);
        if (!info.modifiers.length) assert.equal(info.effective, info.base, `${event.id} ${tile.name} ${kind}`);
      }
    }
  }
});

test("builders' blessing lowers building costs only in its realms – that is why prices elsewhere stayed the same", () => {
  const state = withEvent(owned, "builders-blessing", ["humans"]);
  const human = BOARD_TILES.find(tile => tile.type === "property" && tile.region === "humans")!;
  const orc = BOARD_TILES.find(tile => tile.type === "property" && tile.region === "orcs")!;
  const inRealm = getPriceInfo(state, human, "build");
  assert.equal(inRealm.effective, Math.round(inRealm.base * .75));
  assert.deepEqual(inRealm.modifiers, [{ label: "Segen der Baumeister", effect: "−25 %", source: "chronicle" }]);
  const outside = getPriceInfo(state, orc, "build");
  assert.equal(outside.changed, false);
  assert.deepEqual(outside.modifiers, []);
  const shortage = getPriceInfo(withEvent(owned, "resource-shortage", ["orcs"]), orc, "build");
  assert.equal(shortage.effective, Math.round(shortage.base * 1.25));
  assert.equal(shortage.modifiers[0]?.effect, "+25 %");
});

test("purchase, rent, mortgage and building sale show their event, world impulses and relics too", () => {
  const harbor = BOARD_TILES.find(tile => tile.type === "harbor")!;
  const property = BOARD_TILES.find(tile => tile.type === "property" && tile.region === "elves")!;
  const blood = getPriceInfo(withEvent(owned, "blood-moon", ["elves"]), property, "rent");
  assert.equal(blood.modifiers[0]?.label, "Blutmond");
  const wind = getPriceInfo(nextState(owned, draft => { draft.worldImpulseEffects = { harborWindUntilRound: 7 }; }), harbor, "rent");
  assert.deepEqual(wind.modifiers.map(modifier => modifier.label), ["Hafenwind"]);
  assert.equal(wind.effective, Math.round(wind.base * 1.5));
  const fervor = getPriceInfo(nextState(owned, draft => { draft.worldImpulseEffects = { buildingFervor: true }; }), property, "build");
  assert.deepEqual(fervor.modifiers.map(modifier => modifier.label), ["Baueifer"]);
  const purchase = getPriceInfo(nextState(withEvent(livingTestState(), "traders-festival", ["elves"]), draft => {
    draft.worldImpulseEffects = { merchantLuck: true };
    draft.players[0]!.relics = ["merchant-seal"];
  }), property, "purchase");
  assert.deepEqual(purchase.modifiers.map(modifier => modifier.label), ["Fest der Händler", "Siegel des Händlers", "Händlerglück"]);
  assert.equal(purchase.effective, getEffectivePurchasePrice(nextState(withEvent(livingTestState(), "traders-festival", ["elves"]), draft => {
    draft.worldImpulseEffects = { merchantLuck: true };
    draft.players[0]!.relics = ["merchant-seal"];
  }), property));
  assert.equal(getPriceInfo(withEvent(owned, "crown-decree", ["elves"]), property, "mortgageRedemption").modifiers[0]?.effect, "−25 %");
  assert.equal(getPriceInfo(withEvent(owned, "golden-building-boom", ["elves"]), property, "buildingSale").modifiers[0]?.effect, "75 % statt 50 %");
});

test("the rent explains itself: building, complete group, harbors and utilities", () => {
  const property = BOARD_TILES.find(tile => tile.type === "property" && tile.propertyGroupId)!;
  assert.match(describeRent(owned, property)[0]!, /\(Stufe 1\)$/);
  const bare = nextState(owned, draft => { draft.propertyOwnerships.forEach(entry => { entry.buildingLevel = 0; }); });
  assert.deepEqual(describeRent(bare, property), ["Gruppe komplett – doppelte Miete"]);
  assert.deepEqual(describeRent(bare, BOARD_TILES.find(tile => tile.type === "harbor")!), ["4 Häfen"]);
  assert.deepEqual(describeRent(bare, BOARD_TILES.find(tile => tile.type === "utility")!), ["Wurf 7 × 10"]);
  const mortgaged = nextState(bare, draft => { draft.propertyOwnerships[0]!.mortgaged = true; });
  assert.deepEqual(describeRent(mortgaged, BOARD_TILES[mortgaged.propertyOwnerships[0]!.tileIndex]!), ["Belehnt – keine Miete"]);
});
