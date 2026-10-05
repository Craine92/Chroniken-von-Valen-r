import { getCardDefinition, type GameState } from "@valenor/shared";
import type { AudioEvent } from "./audio-config";

export interface ScheduledAudioEvent {
  event: AudioEvent;
  delayMs?: number;
}

function cardEvent(cardId: string): AudioEvent {
  const effect = getCardDefinition(cardId).effects[0];
  if (!effect) return "CARD_REVEAL";
  if (["receiveFromBank", "receiveFromEachPlayer"].includes(effect.type)) return "GOLD_GAIN";
  if (["payBank", "payEachPlayer"].includes(effect.type)) return "GOLD_PAY";
  if (effect.type === "keepDungeonRelease") return "EVENT_POSITIVE";
  if (["repair", "goToDungeon"].includes(effect.type)) return "EVENT_NEGATIVE";
  return "CARD_REVEAL";
}

function economyCue(previous: GameState, next: GameState): AudioEvent | undefined {
  const entry = next.economyLog.at(-1);
  if (!entry || entry.id === previous.economyLog.at(-1)?.id) return undefined;
  switch (entry.kind) {
    case "purchase": return "PROPERTY_BUY";
    case "rent": return "PROPERTY_RENT";
    case "tax": return "GOLD_PAY";
    case "auction": return "PROPERTY_BUY";
    // Passage audio comes from the visible field arrival, not the gold/state update.
    case "start": return undefined;
    case "bankruptcy": return "EVENT_NEGATIVE";
    case "mortgage": {
      const playerId = entry.playerIds[0];
      const oldGold = previous.players.find((player) => player.id === playerId)?.gold;
      const newGold = next.players.find((player) => player.id === playerId)?.gold;
      return oldGold !== undefined && newGold !== undefined && newGold > oldGold ? "GOLD_GAIN" : "GOLD_PAY";
    }
    default: return undefined;
  }
}

function resultCue(state: GameState, viewerId?: string): AudioEvent {
  if (!viewerId) return "VICTORY";
  const winners = state.gameResult?.winnerIds ?? state.winnerIds ?? (state.winnerId ? [state.winnerId] : []);
  return winners.includes(viewerId) ? "VICTORY" : "DEFEAT";
}

export function deriveGameAudioEvents(previous: GameState, next: GameState, viewerId?: string): ScheduledAudioEvent[] {
  const events: ScheduledAudioEvent[] = [];
  const previousDice = previous.lastDiceRoll ? `${previous.turnContext.rollSequence}:${previous.lastDiceRoll.die1}:${previous.lastDiceRoll.die2}` : "";
  const nextDice = next.lastDiceRoll ? `${next.turnContext.rollSequence}:${next.lastDiceRoll.die1}:${next.lastDiceRoll.die2}` : "";
  const diceChanged = Boolean(nextDice && nextDice !== previousDice);
  if (diceChanged) events.push({ event: "DICE_ROLL" });

  if (next.lastBuildingAction?.id && next.lastBuildingAction.id !== previous.lastBuildingAction?.id) {
    events.push({ event: next.lastBuildingAction.type === "build" ? "PROPERTY_UPGRADE" : "GOLD_GAIN" });
  } else {
    const economy = economyCue(previous, next);
    if (economy) events.push({ event: economy });
  }

  if (next.activeCard?.cardId && next.activeCard.cardId !== previous.activeCard?.cardId) {
    events.push({ event: "CARD_DRAW" }, { event: cardEvent(next.activeCard.cardId), delayMs: 480 });
  }

  if (next.lastTurnAction?.id && next.lastTurnAction.id !== previous.lastTurnAction?.id) {
    if (["thirdDouble", "sentToDungeon"].includes(next.lastTurnAction.kind)) events.push({ event: "PRISON_ENTER" });
    if (["dungeonEscaped", "dungeonPaid"].includes(next.lastTurnAction.kind)) events.push({ event: "PRISON_EXIT" });
  }

  if (next.quickGameClock?.expired && !previous.quickGameClock?.expired) events.push({ event: "EVENT_EPIC" });
  if (next.status === "finished" && previous.status !== "finished") events.push({ event: resultCue(next, viewerId), delayMs: 180 });
  return events;
}

export class GameAudioEventTracker {
  private previous: GameState | undefined;

  constructor(initialState?: GameState) {
    this.previous = initialState;
  }

  update(next: GameState, viewerId?: string): ScheduledAudioEvent[] {
    const events = this.previous ? deriveGameAudioEvents(this.previous, next, viewerId) : [];
    this.previous = next;
    return events;
  }

  reset(): void {
    this.previous = undefined;
  }
}
