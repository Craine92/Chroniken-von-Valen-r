import assert from "node:assert/strict";
import test from "node:test";
import type { GameState, RelicId, TradeAssets, TradeOffer } from "@valenor/shared";
import { TradeService } from "./trade-service";

const service = new TradeService();

function game(): GameState {
  return {
    roomId: "VAL-RELIC-TRADE", status: "playing", config: { mode: "chronicles" },
    players: ["p1", "p2"].map(id => ({ id, name: id, type: "human", color: "violet", characterId: "elvenSpellweaver" as const,
      connectionState: "connected", gold: 1500, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 }, relics: [] })),
    turnOrder: ["p1", "p2"], orderRolls: [], orderContenders: [], orderRollTargetCount: 1,
    currentPlayerId: "p1", currentTurnIndex: 0, currentRound: 1, turnNumber: 1, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 0 }, propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: 32, grandStructuresAvailable: 12 }, economyLog: [], trades: [], startedAt: 1
  };
}

const assets = (relicIds: RelicId[] = [], gold = 0): TradeAssets => ({ gold, propertyTileIndices: [], relicIds });

test("trade creation rejects relics on either side without mutating state", () => {
  for (const side of ["offer", "request"] as const) {
    const state = game(); state.players[0]!.relics = ["runestone"]; state.players[1]!.relics = ["golden-feather"];
    const request = { recipientId: "p2", offer: assets(side === "offer" ? ["runestone"] : [], 100), request: assets(side === "request" ? ["golden-feather"] : [], 50) };
    const before = structuredClone(state);
    assert.throws(() => service.create(state, "p1", request), /Relikte können nicht gehandelt werden/);
    assert.deepEqual(state, before);
  }
});

test("legacy pending relic trades are cancelled and cannot transfer a relic", () => {
  const state = game(); state.players[0]!.relics = ["runestone"];
  const legacy: TradeOffer = { id: "legacy", proposerId: "p1", recipientId: "p2", status: "pending", createdAt: 1,
    offer: assets(["runestone"], 100), request: assets([], 50) };
  state.trades.push(legacy);
  assert.throws(() => service.accept(state, "p2", legacy.id), /Relikte können nicht gehandelt werden/);
  assert.equal(legacy.status, "cancelled");
  assert.deepEqual(state.players[0]!.relics, ["runestone"]);
  assert.deepEqual(state.players[1]!.relics, []);
  assert.deepEqual(state.players.map(player => player.gold), [1500, 1500]);
});

test("schema-compatible empty relic arrays remain valid", () => {
  const state = game();
  const trade = service.create(state, "p1", { recipientId: "p2", offer: assets([], 100), request: assets([], 50) });
  assert.deepEqual(trade.offer.relicIds, []); assert.deepEqual(trade.request.relicIds, []);
  service.accept(state, "p2", trade.id);
  assert.equal(trade.status, "accepted");
});
