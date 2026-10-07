import { randomInt, randomUUID } from "node:crypto";
import {
  BOARD_TILES,
  DUNGEON_TILE_INDEX,
  DUNGEON_RELEASE_COST,
  consumeRelic,
  type DiceRoll,
  type GamePlayerState,
  type GameState,
  type PlayerType,
  type TurnActionKind
} from "@valenor/shared";
import { DiceService } from "./dice-service";
import { advanceChronicleEvents, advanceWanderingDragon, preventDungeonWithAmulet, recordRelicUse } from "./chronicle-event-service";

export class TurnEngine {
  constructor(private readonly dice = new DiceService(), private readonly chooseWorldIndex: (count: number) => number = randomInt) {}

  rollForOrder(state: GameState, playerId: string, actorType: PlayerType): void {
    this.requirePhase(state, "determiningOrder");
    const player = this.requirePlayer(state, playerId);
    if (player.isBankrupt) throw new Error("Dieser Gefährte ist aus der Chronik ausgeschieden.");
    if (player.type !== actorType) throw new Error("Diese Aktion gehört einem anderen Spielertyp.");
    if (player.type === "human" && player.connectionState !== "connected") throw new Error("Der Spieler ist nicht verbunden.");
    if (!state.orderContenders.includes(playerId)) throw new Error("Dieser Spieler ist nicht zum Startwurf aufgefordert.");
    const entry = state.orderRolls.find((candidate) => candidate.playerId === playerId)!;
    if (entry.rolls.length >= state.orderRollTargetCount) throw new Error("Der Startwurf wurde bereits ausgeführt.");
    entry.rolls.push(this.dice.roll());

    const complete = state.orderContenders.every((id) => {
      const candidate = state.orderRolls.find((roll) => roll.playerId === id)!;
      return candidate.rolls.length >= state.orderRollTargetCount;
    });
    if (complete) this.resolveOrderRound(state);
  }

  rollTurn(state: GameState, playerId: string, actorType: PlayerType): void {
    this.requirePhase(state, "waitingForRoll");
    if (state.currentPlayerId !== playerId) throw new Error("Du bist gerade nicht am Zug.");
    const player = this.requireActor(state, playerId, actorType);
    if (player.dungeon.inDungeon) throw new Error("Im Dunklen Kerker musst du zuerst eine Kerkerentscheidung treffen.");

    const roll = this.dice.roll();
    state.turnContext.rollSequence += 1;
    state.turnContext.rollKind = "normal";
    state.lastDiceRoll = roll;
    delete state.lastMovement;
    delete state.lastTurnAction;
    state.turnContext.pendingExtraRoll = false;

    if (player.relics?.includes("runestone")) {
      state.turnContext.awaitingRuneStoneDecision = true;
      state.turnPhase = "rolling";
      return;
    }
    this.resolveNormalRoll(state, player);
  }

  private resolveNormalRoll(state: GameState, player: GamePlayerState): void {
    const roll = state.lastDiceRoll!;

    if (roll.isDouble) {
      const consecutiveDoubles = state.turnContext.consecutiveDoubles + 1;
      if (consecutiveDoubles >= 3) {
        state.turnContext.consecutiveDoubles = 0;
        state.turnContext.pendingExtraRoll = false;
        if (preventDungeonWithAmulet(state, player)) {
          delete state.lastTurnAction;
          state.turnPhase = "waitingForEndTurn";
          return;
        }
        player.dungeon = { inDungeon: true, failedAttempts: 0 };
        state.lastMovement = this.createDungeonTransfer(state, player.id, player.position);
        this.setTurnAction(state, "thirdDouble", player.id);
        this.log(state, `${player.name} würfelt den dritten Pasch in Folge und wird in den Dunklen Kerker gebracht.`, [player.id]);
        state.turnPhase = "dungeonTransfer";
        return;
      }
      state.turnContext.consecutiveDoubles = consecutiveDoubles;
      state.turnContext.pendingExtraRoll = true;
      this.setTurnAction(state, "double", player.id);
      this.log(state, `${player.name} würfelt einen Pasch und darf erneut ziehen.`, [player.id]);
    } else {
      state.turnContext.consecutiveDoubles = 0;
      state.turnContext.pendingExtraRoll = false;
      delete state.lastTurnAction;
    }

    state.lastMovement = this.createNormalMovement(state, player, roll);
    state.turnPhase = "rolling";
  }

  decideRuneStone(state: GameState, playerId: string, actorType: PlayerType, reroll: boolean): void {
    this.requirePhase(state, "rolling");
    if (state.currentPlayerId !== playerId || !state.turnContext.awaitingRuneStoneDecision || state.turnContext.rollKind !== "normal") throw new Error("Es gibt keinen normalen Wurf zur Reliktentscheidung.");
    const player = this.requireActor(state, playerId, actorType);
    if (player.dungeon.inDungeon || !player.relics?.includes("runestone") || !state.lastDiceRoll) throw new Error("Der Runenstein ist hier nicht nutzbar.");
    if (reroll) {
      const replacement = this.dice.roll();
      consumeRelic(player, "runestone");
      recordRelicUse(state, player, "runestone");
      state.lastDiceRoll = replacement;
      state.turnContext.rollSequence += 1;
    }
    delete state.turnContext.awaitingRuneStoneDecision;
    this.resolveNormalRoll(state, player);
  }

  rollDungeon(state: GameState, playerId: string, actorType: PlayerType): void {
    this.requirePhase(state, "dungeonDecision");
    if (state.currentPlayerId !== playerId) throw new Error("Du bist gerade nicht am Zug.");
    const player = this.requireActor(state, playerId, actorType);
    if (!player.dungeon.inDungeon) throw new Error("Dieser Gefährte sitzt nicht im Dunklen Kerker.");
    const roll = this.dice.roll();
    state.turnContext.rollSequence += 1;
    state.turnContext.rollKind = "dungeonAttempt";
    state.turnContext.consecutiveDoubles = 0;
    state.turnContext.pendingExtraRoll = false;
    state.lastDiceRoll = roll;
    delete state.lastMovement;
    delete state.lastTurnAction;
    state.turnPhase = "dungeonRolling";
  }

  resolveDungeonRoll(state: GameState): void {
    this.requirePhase(state, "dungeonRolling");
    const player = this.requireCurrentPlayer(state);
    const roll = state.lastDiceRoll;
    if (!roll || state.turnContext.rollKind !== "dungeonAttempt") throw new Error("Es liegt kein Kerkerwurf vor.");

    if (roll.isDouble) {
      player.dungeon = { inDungeon: false, failedAttempts: 0 };
      this.setTurnAction(state, "dungeonEscaped", player.id);
      this.log(state, `${player.name} würfelt einen Pasch und verlässt den Dunklen Kerker.`, [player.id]);
      state.lastMovement = this.createNormalMovement(state, player, roll);
      state.turnPhase = "moving";
      return;
    }

    player.dungeon.failedAttempts += 1;
    const attempt = player.dungeon.failedAttempts;
    this.setTurnAction(state, "dungeonFailed", player.id, attempt);
    if (attempt < 3) {
      this.log(state, `${player.name} scheitert beim ${attempt === 1 ? "ersten" : "zweiten"} Fluchtversuch.`, [player.id]);
      this.advanceTurn(state);
      return;
    }

    if (player.gold >= DUNGEON_RELEASE_COST) {
      player.gold -= DUNGEON_RELEASE_COST;
      player.dungeon = { inDungeon: false, failedAttempts: 0 };
      this.setTurnAction(state, "dungeonPaid", player.id, 3);
      this.log(state, `${player.name} zahlt ${DUNGEON_RELEASE_COST} Gold und verlässt den Dunklen Kerker.`, [player.id], -DUNGEON_RELEASE_COST);
      state.lastMovement = this.createNormalMovement(state, player, roll);
      state.turnPhase = "moving";
      return;
    }

    state.turnContext.pendingDungeonMovement = { ...roll };
    state.pendingPayment = {
      payerId: player.id,
      amount: DUNGEON_RELEASE_COST,
      reason: "Kerkergebühr",
      creditorType: "bank",
      reasonType: "dungeonRelease"
    };
    this.log(state, `Nach drei erfolglosen Versuchen fordert die Krone ${DUNGEON_RELEASE_COST} Gold von ${player.name}.`, [player.id]);
    state.turnPhase = "paymentRequired";
  }

  payDungeonRelease(state: GameState, playerId: string, actorType: PlayerType): void {
    this.requirePhase(state, "dungeonDecision");
    if (state.currentPlayerId !== playerId) throw new Error("Du bist gerade nicht am Zug.");
    const player = this.requireActor(state, playerId, actorType);
    if (!player.dungeon.inDungeon) throw new Error("Dieser Gefährte sitzt nicht im Dunklen Kerker.");
    if (player.gold < DUNGEON_RELEASE_COST) throw new Error("Nicht genügend Gold für die Kerkergebühr.");
    player.gold -= DUNGEON_RELEASE_COST;
    player.dungeon = { inDungeon: false, failedAttempts: 0 };
    state.turnContext.consecutiveDoubles = 0;
    state.turnContext.pendingExtraRoll = false;
    delete state.turnContext.rollKind;
    this.setTurnAction(state, "dungeonPaid", player.id);
    this.log(state, `${player.name} zahlt ${DUNGEON_RELEASE_COST} Gold und verlässt den Dunklen Kerker.`, [player.id], -DUNGEON_RELEASE_COST);
    state.turnPhase = "waitingForRoll";
  }

  continueAfterDungeonPayment(state: GameState, playerId: string): void {
    const player = this.requirePlayer(state, playerId);
    const roll = state.turnContext.pendingDungeonMovement;
    if (!roll) throw new Error("Die ausstehende Kerkerbewegung wurde nicht gefunden.");
    player.dungeon = { inDungeon: false, failedAttempts: 0 };
    state.lastDiceRoll = { ...roll };
    state.lastMovement = this.createNormalMovement(state, player, roll);
    delete state.turnContext.pendingDungeonMovement;
    state.turnContext.rollKind = "dungeonAttempt";
    state.turnContext.consecutiveDoubles = 0;
    state.turnContext.pendingExtraRoll = false;
    this.setTurnAction(state, "dungeonPaid", player.id, 3);
    state.turnPhase = "moving";
  }

  beginMovement(state: GameState): void {
    this.requirePhase(state, "rolling");
    if (state.turnContext.awaitingRuneStoneDecision) throw new Error("Der Wurf muss zuerst bestätigt werden.");
    state.turnPhase = "moving";
  }

  completeMovement(state: GameState): void {
    this.requirePhase(state, "moving");
    if (!state.lastMovement || state.lastMovement.kind !== "normal") throw new Error("Es liegt keine normale Bewegung vor.");
    this.requirePlayer(state, state.lastMovement.playerId).position = state.lastMovement.to;
    state.turnPhase = "landed";
  }

  sendCurrentPlayerToDungeon(state: GameState): void {
    this.requirePhase(state, "landed");
    const player = this.requireCurrentPlayer(state);
    if (preventDungeonWithAmulet(state, player)) {
      state.turnPhase = "waitingForEndTurn";
      return;
    }
    player.dungeon = { inDungeon: true, failedAttempts: 0 };
    state.turnContext.consecutiveDoubles = 0;
    state.turnContext.pendingExtraRoll = false;
    state.lastMovement = this.createDungeonTransfer(state, player.id, player.position);
    this.setTurnAction(state, "sentToDungeon", player.id);
    this.log(state, `Die Wachen führen ${player.name} in den Dunklen Kerker.`, [player.id]);
    state.turnPhase = "dungeonTransfer";
  }

  completeDungeonTransfer(state: GameState): void {
    this.requirePhase(state, "dungeonTransfer");
    const movement = state.lastMovement;
    if (!movement || movement.kind !== "dungeonTransfer") throw new Error("Es liegt kein Kerkertransfer vor.");
    this.requirePlayer(state, movement.playerId).position = DUNGEON_TILE_INDEX;
    this.advanceTurn(state);
  }

  finishCardDungeon(state: GameState): void {
    this.requirePhase(state, "cardAcknowledgement");
    this.advanceTurn(state);
  }

  awaitEndTurn(state: GameState): void {
    this.requirePhase(state, "landed");
    state.turnPhase = "waitingForEndTurn";
  }

  endTurn(state: GameState, playerId: string, actorType: PlayerType): void {
    this.requirePhase(state, "waitingForEndTurn");
    if (state.currentPlayerId !== playerId) throw new Error("Du kannst diesen Zug nicht beenden.");
    this.requireActor(state, playerId, actorType);
    if (state.turnContext.pendingExtraRoll) {
      state.turnContext.pendingExtraRoll = false;
      delete state.lastDiceRoll;
      delete state.lastMovement;
      state.turnPhase = "waitingForRoll";
      return;
    }
    this.advanceTurn(state);
  }

  beginNextTurn(state: GameState): void {
    this.requirePhase(state, "turnTransition");
    delete state.lastDiceRoll;
    delete state.lastMovement;
    delete state.lastTurnAction;
    const current = this.requireCurrentPlayer(state);
    state.turnPhase = current.dungeon.inDungeon ? "dungeonDecision" : "waitingForRoll";
  }

  private advanceTurn(state: GameState): void {
    state.turnPhase = "turnTransition";
    const previousIndex = state.currentTurnIndex;
    do state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
    while (state.players.find((candidate) => candidate.id === state.turnOrder[state.currentTurnIndex])?.isBankrupt);
    if (state.currentTurnIndex <= previousIndex) {
      state.currentRound += 1;
      advanceChronicleEvents(state, this.chooseWorldIndex);
      advanceWanderingDragon(state, this.chooseWorldIndex);
    }
    state.turnNumber += 1;
    state.currentPlayerId = state.turnOrder[state.currentTurnIndex]!;
    state.turnContext.consecutiveDoubles = 0;
    state.turnContext.pendingExtraRoll = false;
    delete state.turnContext.rollKind;
    delete state.turnContext.pendingDungeonMovement;
    delete state.turnContext.awaitingRuneStoneDecision;
  }

  private createNormalMovement(state: GameState, player: GamePlayerState, roll: DiceRoll) {
    const from = player.position;
    const path = Array.from({ length: roll.total }, (_, step) => (from + step + 1) % BOARD_TILES.length);
    const to = path.at(-1)!;
    return {
      kind: "normal" as const,
      sequence: this.nextMovementSequence(state),
      playerId: player.id,
      from,
      to,
      path,
      passedStart: from + roll.total >= BOARD_TILES.length,
      landedTile: { ...BOARD_TILES[to]! }
    };
  }

  private createDungeonTransfer(state: GameState, playerId: string, from: number) {
    return {
      kind: "dungeonTransfer" as const,
      sequence: this.nextMovementSequence(state),
      playerId,
      from,
      to: DUNGEON_TILE_INDEX,
      path: [DUNGEON_TILE_INDEX],
      passedStart: false,
      landedTile: { ...BOARD_TILES[DUNGEON_TILE_INDEX]! }
    };
  }

  private nextMovementSequence(state: GameState): number {
    state.turnContext.movementSequence = (state.turnContext.movementSequence ?? 0) + 1;
    return state.turnContext.movementSequence;
  }

  private setTurnAction(state: GameState, kind: TurnActionKind, playerId: string, attempt?: number): void {
    state.lastTurnAction = { id: randomUUID(), kind, playerId, createdAt: Date.now(), ...(attempt === undefined ? {} : { attempt }) };
  }

  private log(state: GameState, message: string, playerIds: string[], amount?: number): void {
    state.economyLog.push({ id: randomUUID(), kind: "system", message, playerIds, ...(amount === undefined ? {} : { amount }), createdAt: Date.now() });
    state.economyLog = state.economyLog.slice(-12);
  }

  private resolveOrderRound(state: GameState): void {
    const compareRolls = (leftId: string, rightId: string) => {
      const left = state.orderRolls.find((entry) => entry.playerId === leftId)!.rolls;
      const right = state.orderRolls.find((entry) => entry.playerId === rightId)!.rolls;
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        const difference = (right[index]?.total ?? -1) - (left[index]?.total ?? -1);
        if (difference !== 0) return difference;
      }
      return 0;
    };
    const sorted = [...state.players.map((player) => player.id)].sort(compareRolls);
    const tiedGroups: string[][] = [];
    for (let start = 0; start < sorted.length;) {
      let end = start + 1;
      while (end < sorted.length && compareRolls(sorted[start]!, sorted[end]!) === 0) end += 1;
      if (end - start > 1) tiedGroups.push(sorted.slice(start, end));
      start = end;
    }
    if (tiedGroups.length > 0) {
      state.orderContenders = tiedGroups[0]!;
      state.orderRollTargetCount = Math.max(...state.orderContenders.map((id) => state.orderRolls.find((entry) => entry.playerId === id)!.rolls.length)) + 1;
      return;
    }
    state.turnOrder = sorted;
    state.orderContenders = [];
    state.currentTurnIndex = 0;
    state.currentPlayerId = sorted[0]!;
    state.currentRound = 1;
    state.turnNumber = 1;
    state.turnPhase = "waitingForRoll";
  }

  private requireActor(state: GameState, playerId: string, actorType: PlayerType): GamePlayerState {
    const player = this.requirePlayer(state, playerId);
    if (player.isBankrupt) throw new Error("Dieser Gefährte ist aus der Chronik ausgeschieden.");
    if (player.type !== actorType) throw new Error("Diese Aktion gehört einem anderen Spielertyp.");
    if (player.type === "human" && player.connectionState !== "connected") throw new Error("Der Spieler ist nicht verbunden.");
    return player;
  }

  private requireCurrentPlayer(state: GameState): GamePlayerState {
    if (!state.currentPlayerId) throw new Error("Es gibt keinen aktiven Spieler.");
    return this.requirePlayer(state, state.currentPlayerId);
  }

  private requirePlayer(state: GameState, playerId: string): GamePlayerState {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new Error("Dieser Spieler wurde nicht gefunden.");
    return player;
  }

  private requirePhase(state: GameState, expected: GameState["turnPhase"]): void {
    if (state.status === "finished") throw new Error("Diese Chronik ist bereits entschieden.");
    if (state.turnPhase !== expected) throw new Error("Diese Aktion ist in der aktuellen Zugphase nicht erlaubt.");
  }
}
