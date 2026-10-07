import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QUEST_DEFINITIONS, type GameState, type QuestId } from "@valenor/shared";
import { ControllerQuestLog } from "./ControllerQuestLog";

test("quest journal renders three personal cards with central titles, short objectives and rewards", () => {
  for (const ids of [["traveler","landbuyer","seafarer"],["builder","landlord","dragonfriend"],["fortunehunter","tollpayer","traveler"]] as QuestId[][]) {
    const state = { players:[{id:"p1",activeQuests:ids.map(id=>({id,assignedAtTurn:1}))},{id:"p2",activeQuests:[]}] } as unknown as GameState;
    const markup = renderToStaticMarkup(<ControllerQuestLog state={state} playerId="p1" />);
    assert.match(markup,/DEINE AUFTRÄGE/); assert.match(markup,/3 \/ 3/); assert.equal((markup.match(/<article>/g)??[]).length,3);
    for (const id of ids) { const quest = QUEST_DEFINITIONS[id]; assert.ok(markup.includes(quest.title)); assert.ok(markup.includes(quest.description)); assert.ok(markup.includes(`Belohnung: ${quest.rewardGold} Gold`)); }
    const other = renderToStaticMarkup(<ControllerQuestLog state={state} playerId="p2" />); assert.doesNotMatch(other,/<article>/);
  }
});
