import { randomUUID } from "node:crypto";
import { BOARD_TILES, getEffectiveBuildingSaleValue, type GameState } from "@valenor/shared";
import { advanceChronicleEvents, advanceWanderingDragon } from "./chronicle-event-service";
import { advanceWorldImpulses } from "./world-impulse-service";
import { recordNewCompleteGroups } from "./momentum-celebration-service";

export function completeBankruptcyTurn(state: GameState): void {
  delete state.pendingPayment;
  const activePlayers = state.players.filter((player) => !player.isBankrupt);
  if (activePlayers.length === 1) {
    state.status = "finished";
    state.winnerId = activePlayers[0]!.id;
    state.winnerIds = [activePlayers[0]!.id];
    state.finishReason = "lastPlayerStanding";
    state.currentPlayerId = activePlayers[0]!.id;
    state.turnContext.consecutiveDoubles = 0;
    state.turnContext.pendingExtraRoll = false;
    delete state.turnContext.pendingDungeonMovement;
    state.economyLog.push({
      id: randomUUID(), kind: "bankruptcy",
      message: `${activePlayers[0]!.name} ist der letzte verbliebene Herrscher von Valenør.`,
      playerIds: [activePlayers[0]!.id], createdAt: Date.now()
    });
    state.economyLog = state.economyLog.slice(-12);
    return;
  }
  const currentIndex = Math.max(0, state.turnOrder.indexOf(state.currentPlayerId ?? ""));
  let nextIndex = currentIndex;
  do nextIndex = (nextIndex + 1) % state.turnOrder.length;
  while (state.players.find((player) => player.id === state.turnOrder[nextIndex])?.isBankrupt);
  const wrappedRound = nextIndex <= currentIndex;
  let chronicleStarted = false;
  if (wrappedRound) {
    state.currentRound += 1;
    chronicleStarted = advanceChronicleEvents(state);
    advanceWanderingDragon(state);
  }
  state.currentTurnIndex = nextIndex;
  state.currentPlayerId = state.turnOrder[nextIndex]!;
  state.turnNumber += 1;
  delete state.lastDiceRoll;
  delete state.lastMovement;
  state.turnContext.consecutiveDoubles = 0;
  state.turnContext.pendingExtraRoll = false;
  delete state.turnContext.rollKind;
  delete state.turnContext.pendingDungeonMovement;
  const nextPlayer = state.players.find((player) => player.id === state.currentPlayerId);
  state.turnPhase = nextPlayer?.dungeon.inDungeon ? "dungeonDecision" : "waitingForRoll";
  if (wrappedRound && advanceWorldImpulses(state, chronicleStarted) && state.pendingWorldImpulseActivation) state.turnPhase = "turnTransition";
}

export function startNextBankruptcyAuction(state: GameState): boolean {
  const bankruptcy = state.bankruptcyAuction;
  if (!bankruptcy) return false;
  const tileIndex = bankruptcy.pendingTileIndices.shift();
  if (tileIndex === undefined) {
    const debtorId = bankruptcy.debtorId;
    delete state.bankruptcyAuction;
    if (state.cardResolution && state.currentPlayerId !== debtorId) {
      delete state.pendingPayment;
      state.turnPhase = "cardResolving";
      return false;
    }
    completeBankruptcyTurn(state);
    return false;
  }
  const participants = state.players.filter((player) => !player.isBankrupt).map((player) => player.id);
  state.auction = {
    tileIndex, currentBid: 0, participantIds: participants,
    withdrawnPlayerIds: [], pausedForPlayerIds: [], revision: 0, source: "bankruptcy"
  };
  state.turnPhase = "auction";
  const tile = BOARD_TILES[tileIndex]!;
  state.economyLog.push({ id: randomUUID(), kind: "auction", message: `Bankrottauktion: ${tile.name} fällt an die Krone.`, playerIds: [], createdAt: Date.now() });
  state.economyLog = state.economyLog.slice(-12);
  return true;
}

export class BankruptcyService {
  declare(state: GameState, playerId: string): void {
    if (state.status !== "playing" || state.turnPhase !== "paymentRequired" || state.pendingPayment?.payerId !== playerId) {
      throw new Error("Du kannst derzeit keinen Bankrott erklären.");
    }
    const debtor = state.players.find((player) => player.id === playerId);
    if (!debtor || debtor.isBankrupt) throw new Error("Dieser Gefährte ist bereits ausgeschieden.");
    const payment = state.pendingPayment;
    const possessions = state.propertyOwnerships.filter((entry) => entry.ownerId === playerId);

    let buildingProceeds = 0;
    possessions.forEach((ownership) => {
      const tile = BOARD_TILES[ownership.tileIndex];
      if (tile?.type !== "property" || ownership.buildingLevel === 0) return;
      buildingProceeds += ownership.buildingLevel * getEffectiveBuildingSaleValue(state, tile);
      ownership.buildingLevel = 0;
    });
    debtor.gold += buildingProceeds;
    debtor.isBankrupt = true;
    debtor.dungeon = { inDungeon: false, failedAttempts: 0 };
    state.turnContext.consecutiveDoubles = 0;
    state.turnContext.pendingExtraRoll = false;
    delete state.turnContext.pendingDungeonMovement;
    state.trades.forEach((trade) => {
      if (trade.status === "pending" && (trade.proposerId === playerId || trade.recipientId === playerId)) trade.status = "cancelled";
    });
    this.log(state, `${debtor.name} kann seine Schuld nicht begleichen und scheidet aus der Chronik aus.`, [debtor.id]);

    if (payment.creditorType === "player" && payment.payeeId) {
      const creditor = state.players.find((player) => player.id === payment.payeeId);
      if (!creditor || creditor.isBankrupt) throw new Error("Der Gläubiger ist nicht mehr aktiv.");
      creditor.gold += debtor.gold;
      debtor.gold = 0;
      possessions.forEach((ownership) => { ownership.ownerId = creditor.id; });
      recordNewCompleteGroups(state, creditor.id);
      if (state.cardResolution && state.currentPlayerId !== debtor.id) {
        delete state.pendingPayment;
        state.turnPhase = "cardResolving";
        return;
      }
      this.log(state, `${debtor.name}s Besitz fällt an ${creditor.name}.`, [debtor.id, creditor.id]);
      completeBankruptcyTurn(state);
      return;
    }

    debtor.gold = 0;
    const tileIndices = possessions.map((entry) => entry.tileIndex).sort((left, right) => left - right);
    state.propertyOwnerships = state.propertyOwnerships.filter((entry) => entry.ownerId !== debtor.id);
    this.log(state, `Die Krone versteigert ${debtor.name}s Besitz.`, [debtor.id]);
    delete state.pendingPayment;
    const activePlayers = state.players.filter((player) => !player.isBankrupt);
    if (activePlayers.length <= 1 || tileIndices.length === 0) {
      if (activePlayers.length > 1 && state.cardResolution && state.currentPlayerId !== debtor.id) {
        state.turnPhase = "cardResolving";
        return;
      }
      completeBankruptcyTurn(state);
      return;
    }
    state.bankruptcyAuction = { debtorId: debtor.id, pendingTileIndices: tileIndices };
    startNextBankruptcyAuction(state);
  }

  private log(state: GameState, message: string, playerIds: string[]): void {
    state.economyLog.push({ id: randomUUID(), kind: "bankruptcy", message, playerIds, createdAt: Date.now() });
    state.economyLog = state.economyLog.slice(-12);
  }
}
