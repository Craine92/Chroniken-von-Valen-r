import { randomInt, randomUUID } from "node:crypto";
import { BOARD_TILES, CHRONICLE_REGIONS, CHRONICLE_EVENTS, MAX_RELICS, RELIC_DEFINITIONS, RELIC_USE_MESSAGES, consumeRelic, isRelicArmed, getChronicleTargetRegions, getRegionalChronicleDefinition, isBuyableTile,
  type GamePlayerState, type GameState, type RegionType, type RelicId } from "@valenor/shared";
import { completeQuests } from "./quest-service";

/** The existing chooseIndex source supplies a value in [0, 1). */
export function pickAffectedRegionCount(random: number): number {
  return random < .5 ? 1 : random < .8 ? 2 : random < .95 ? 3 : 4;
}

export function pickChronicleRegions(chooseIndex: (count: number) => number = randomInt, previous: readonly RegionType[] = []): RegionType[] {
  const count = pickAffectedRegionCount(chooseIndex(100) / 100);
  const regions = Object.keys(CHRONICLE_REGIONS) as RegionType[];
  const combinations = Array.from({ length: 15 }, (_, index) => regions.filter((_, bit) => ((index + 1) & (1 << bit)) !== 0)).filter(combination => combination.length === count);
  const previousKey = [...previous].sort().join(",");
  const alternatives = combinations.filter(combination => [...combination].sort().join(",") !== previousKey);
  // Four regions have only one combination; retain the weighted count in that case.
  const candidates = alternatives.length ? alternatives : combinations;
  return [...candidates[chooseIndex(candidates.length)]!];
}

/** Called once the server advances to the round following a completed round. */
export function advanceChronicleEvents(state: GameState, chooseIndex: (count: number) => number = randomInt): void {
  if (state.status !== "playing") return;
  if (state.activeChronicleEvent && state.currentRound >= state.activeChronicleEvent.expiresAtRound) delete state.activeChronicleEvent;
  const completedRound = state.currentRound - 1;
  const previous = state.chronicleEventHistory?.at(-1);
  if (completedRound <= 0 || completedRound % 3 !== 0 || state.activeChronicleEvent || (previous && previous.startedAfterRound >= completedRound)) return;
  const candidates = CHRONICLE_EVENTS.filter((event) => event.id !== previous?.id);
  let definition = candidates[chooseIndex(candidates.length)]!;
  if (definition.effectType !== "startPassBonus") {
    const lastSameEvent = state.chronicleEventHistory?.filter(event => event.id === definition.id).at(-1);
    definition = getRegionalChronicleDefinition(definition, pickChronicleRegions(chooseIndex, getChronicleTargetRegions(lastSameEvent)));
  }
  const event = { ...definition, startedAfterRound: completedRound, startedAtRound: state.currentRound,
    expiresAtRound: state.currentRound + definition.durationRounds, startedAt: Date.now() };
  state.activeChronicleEvent = event;
  (state.chronicleEventHistory ??= []).push(event);
}

function chooseDragonTile(previous: number | undefined, chooseIndex: (count: number) => number): number {
  const candidates = BOARD_TILES.filter(tile => isBuyableTile(tile) && (previous === undefined ||
    Math.min(Math.abs(tile.index - previous), BOARD_TILES.length - Math.abs(tile.index - previous)) >= 5));
  return candidates[chooseIndex(candidates.length)]!.index;
}

export function initializeWanderingDragon(state: GameState, chooseIndex: (count: number) => number = randomInt): void {
  state.wanderingDragon = { tileIndex: chooseDragonTile(undefined, chooseIndex), nextMoveRound: state.currentRound + 2, encounterSequence: 0 };
}

export function advanceWanderingDragon(state: GameState, chooseIndex: (count: number) => number = randomInt): void {
  const dragon = state.wanderingDragon;
  if (state.status !== "playing" || !dragon || state.currentRound < dragon.nextMoveRound) return;
  dragon.tileIndex = chooseDragonTile(dragon.tileIndex, chooseIndex);
  dragon.nextMoveRound = state.currentRound + 2;
}

export function resolveDragonEncounter(state: GameState, chooseIndex: (count: number) => number = randomInt): void {
  const dragon = state.wanderingDragon, movement = state.lastMovement;
  if (state.status !== "playing" || !dragon || state.turnPhase !== "landed" || movement?.kind !== "normal" ||
      movement.landedTile.type === "goToDungeon" || !isDragonEncounterTile(movement.to, dragon.tileIndex)) return;
  const sequence = movement.sequence ?? state.turnContext.rollSequence;
  if (state.lastDragonEncounterMovementSequence === sequence) return;
  state.lastDragonEncounterMovementSequence = sequence;
  const player = state.players.find(player => player.id === movement.playerId)!;
  const relics = player.relics ??= [];
  const candidates = (Object.keys(RELIC_DEFINITIONS) as RelicId[]).filter(id => !relics.includes(id));
  const relicId = relics.length < MAX_RELICS ? candidates[chooseIndex(candidates.length)]! : undefined;
  if (relicId) relics.push(relicId);
  dragon.encounterSequence += 1;
  state.economyLog.push({ id: randomUUID(), kind: "dragon", playerIds: [player.id], createdAt: Date.now(),
    ...(relicId ? { relicId } : {}), message: relicId ? `${player.name} begegnet dem Hüter der Relikte und erhält ${RELIC_DEFINITIONS[relicId].name}.`
      : `Der Drache mustert ${player.name}s bereits gefüllte Reliktplätze und zieht weiter.` });
  state.economyLog = state.economyLog.slice(-12);
  dragon.tileIndex = chooseDragonTile(dragon.tileIndex, chooseIndex);
  dragon.nextMoveRound = state.currentRound + 2;
  completeQuests(state, player.id, `dragon:${sequence}`, ["dragonEncounter"]);
}

export function preventDungeonWithAmulet(state: GameState, player: GamePlayerState): boolean {
  return consumeArmedRelic(state, player, "dungeon-amulet");
}

/** Only the final normal landing is checked; the route is cyclic. */
export function isDragonEncounterTile(tileIndex: number, dragonTileIndex: number): boolean {
  const distance = Math.abs(tileIndex - dragonTileIndex);
  return Math.min(distance, BOARD_TILES.length - distance) <= 1;
}

export function activateRelic(state: GameState, playerId: string, id: RelicId): void {
  const player = state.players.find(player => player.id === playerId);
  if (state.status !== "playing" || !player || player.isBankrupt || player.connectionState !== "connected") throw new Error("Dieses Relikt kann gerade nicht aktiviert werden.");
  if (id === "runestone" || !Object.hasOwn(RELIC_DEFINITIONS, id) || !player.relics?.includes(id)) throw new Error("Du besitzt kein aktivierbares Relikt dieser Art.");
  if (isRelicArmed(player, id)) throw new Error("Dieses Relikt ist bereits aktiv.");
  (player.armedRelics ??= []).push(id);
}

export function recordRelicUse(state: GameState, player: GamePlayerState, id: RelicId): void {
  state.economyLog.push({ id: randomUUID(), kind: "relic", relicId: id, playerIds: [player.id], createdAt: Date.now(),
    message: RELIC_USE_MESSAGES[id] });
  state.economyLog = state.economyLog.slice(-12);
}

export function consumeArmedRelic(state: GameState, player: GamePlayerState, id: RelicId): boolean {
  if (!isRelicArmed(player, id) || !consumeRelic(player, id)) return false;
  recordRelicUse(state, player, id);
  return true;
}
