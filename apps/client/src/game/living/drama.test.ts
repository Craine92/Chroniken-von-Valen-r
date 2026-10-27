import assert from "node:assert/strict";
import test from "node:test";
import { DRAMA_MAX_DURATION_MS, HIGH_RENT_ABSOLUTE_GOLD, HIGH_RENT_MIN_GOLD, getPlayersInDanger, isHighRent, selectDramaticMoments } from "./drama";
import { livingTestState } from "./living-fixtures";

test("a rent is high from 300 gold, or from 100 gold when it eats at least 35 % of the payer's gold", () => {
  assert.equal(isHighRent(HIGH_RENT_ABSOLUTE_GOLD, 100_000), true);
  assert.equal(isHighRent(HIGH_RENT_ABSOLUTE_GOLD - 1, 2_000), false);
  assert.equal(isHighRent(HIGH_RENT_MIN_GOLD, 285), true, "100 of 285 gold is more than 35 %");
  assert.equal(isHighRent(HIGH_RENT_MIN_GOLD, 286), false);
  assert.equal(isHighRent(HIGH_RENT_MIN_GOLD - 1, 50), false, "small sums never become drama");
});

test("only high rents, dragons, sealed trades and bankruptcies are staged", () => {
  const staged = selectDramaticMoments([
    { kind: "rent", payerId: "p1", ownerId: "p2", amount: 450, tileIndex: 24, payerGoldBefore: 1_000 },
    { kind: "rent", payerId: "p1", ownerId: "p2", amount: 20, tileIndex: 24, payerGoldBefore: 1_000 },
    { kind: "dragon", playerId: "p3", tileIndex: 12 },
    { kind: "tradeSealed", proposerId: "p1", recipientId: "p4" },
    { kind: "bankrupt", playerId: "p2" },
    { kind: "purchase", playerId: "p1", tileIndex: 6, amount: 100 },
    { kind: "double", playerId: "p1" }
  ]);
  assert.deepEqual(staged, [
    { kind: "highRent", payerId: "p1", amount: 450, tileIndex: 24 },
    { kind: "dragon", playerId: "p3", tileIndex: 12 },
    { kind: "tradeSealed", proposerId: "p1", recipientId: "p4" },
    { kind: "bankrupt", playerId: "p2" }
  ]);
  assert.ok(DRAMA_MAX_DURATION_MS <= 1_200, "effects stay short so turns never feel slower");
});

test("bankruptcy danger means an open payment exceeds the payer's gold", () => {
  const state = livingTestState();
  assert.deepEqual([...getPlayersInDanger(state)], []);
  state.players[1]!.gold = 120;
  state.pendingPayment = { payerId: "p2", payeeId: "p3", amount: 450, reason: "Miete", reasonType: "rent" };
  assert.deepEqual([...getPlayersInDanger(state)], ["p2"]);
  state.players[1]!.gold = 450;
  assert.deepEqual([...getPlayersInDanger(state)], [], "exactly enough gold is no danger");
  delete state.pendingPayment;
  state.cardResolution = { cardId: "fate_001", deck: "fate", playerId: "p4", effectIndex: 0, status: "waitingForPayment", chainDepth: 0,
    pendingPayments: [{ fromPlayerId: "p4", creditorType: "bank", amount: 2_000, reason: "Karte", reasonType: "card" }] };
  assert.deepEqual([...getPlayersInDanger(state)], ["p4"], "card payments count too");
  state.status = "finished";
  assert.deepEqual([...getPlayersInDanger(state)], [], "after the game nobody is in danger any more");
});
