import { getWorldImpulseDefinition, type BuildingLevel, type GameState, type PropertyGroupId, type RelicId, type WorldImpulseId } from "@valenor/shared";

/**
 * Was zwischen zwei Spielständen passiert ist, in einer Form, aus der Chronist und Effekte lesen.
 * Rein darstellend: Die Funktion liest nur und verändert keinen Spielstand.
 */
export type GameMoment =
  | { kind: "victory"; winnerIds: string[] }
  | { kind: "bankrupt"; playerId: string }
  | { kind: "groupComplete"; playerId: string; groupId: PropertyGroupId }
  | { kind: "tradeSealed"; proposerId: string; recipientId: string }
  | { kind: "dragon"; playerId: string; tileIndex?: number; relicId?: RelicId }
  | { kind: "auctionWon"; playerId: string; tileIndex: number; amount: number }
  | { kind: "purchase"; playerId: string; tileIndex: number; amount: number }
  | { kind: "build"; playerId: string; tileIndex: number; buildingName: string; level: BuildingLevel }
  | { kind: "rent"; payerId: string; ownerId: string; amount: number; tileIndex?: number; payerGoldBefore: number }
  | { kind: "dungeonEnter"; playerId: string }
  | { kind: "dungeonLeave"; playerId: string }
  | { kind: "tavernWin"; playerId: string; amount: number }
  | { kind: "tavernLoss"; playerId: string; amount: number }
  | { kind: "tax"; playerId: string; amount: number }
  | { kind: "startPass"; playerId: string; amount: number }
  | { kind: "double"; playerId: string }
  | { kind: "chronicleEvent"; title: string; eventId: string }
  | { kind: "worldImpulse"; title: string; impulseId: WorldImpulseId }
  | { kind: "lastRound" };

export type GameMomentKind = GameMoment["kind"];

/** Wichtigste zuerst. Der Chronist erzählt nur die vordersten Momente eines Spielstands. */
export const MOMENT_PRIORITY: readonly GameMomentKind[] = [
  "victory", "bankrupt", "groupComplete", "tradeSealed", "dragon", "auctionWon", "purchase", "build", "rent",
  "dungeonEnter", "dungeonLeave", "tavernWin", "tavernLoss", "tax", "startPass", "double", "chronicleEvent", "worldImpulse", "lastRound"
];

const byPriority = (a: GameMoment, b: GameMoment) => MOMENT_PRIORITY.indexOf(a.kind) - MOMENT_PRIORITY.indexOf(b.kind);

export function deriveGameMoments(previous: GameState, next: GameState): GameMoment[] {
  const moments: GameMoment[] = [];
  const seenLog = new Set(previous.economyLog.map(entry => entry.id));
  const newLog = next.economyLog.filter(entry => !seenLog.has(entry.id));
  const ownerBefore = new Map(previous.propertyOwnerships.map(entry => [entry.tileIndex, entry.ownerId]));
  const acquired = next.propertyOwnerships.filter(entry => ownerBefore.get(entry.tileIndex) !== entry.ownerId);
  const goldBefore = (playerId: string) => previous.players.find(player => player.id === playerId)?.gold ?? 0;

  for (const entry of newLog) {
    const [first, second] = entry.playerIds;
    const amount = Math.abs(entry.amount ?? 0);
    if (!first) continue;
    if (entry.kind === "purchase") {
      const tileIndex = acquired.find(ownership => ownership.ownerId === first)?.tileIndex ?? next.lastMovement?.to;
      if (tileIndex !== undefined) moments.push({ kind: "purchase", playerId: first, tileIndex, amount });
    } else if (entry.kind === "rent" && second && amount > 0) {
      const landing = next.lastMovement?.to;
      const tileIndex = landing !== undefined && next.propertyOwnerships.some(ownership => ownership.tileIndex === landing && ownership.ownerId === second) ? landing : undefined;
      moments.push({ kind: "rent", payerId: first, ownerId: second, amount, payerGoldBefore: goldBefore(first), ...(tileIndex === undefined ? {} : { tileIndex }) });
    } else if (entry.kind === "tax" && amount > 0) {
      moments.push({ kind: "tax", playerId: first, amount });
    } else if (entry.kind === "start" && amount > 0) {
      moments.push({ kind: "startPass", playerId: first, amount });
    } else if (entry.kind === "dragon") {
      const tileIndex = next.lastMovement?.playerId === first ? next.lastMovement.to : undefined;
      moments.push({ kind: "dragon", playerId: first, ...(entry.relicId ? { relicId: entry.relicId } : {}), ...(tileIndex === undefined ? {} : { tileIndex }) });
    }
  }

  // Auktionen protokollieren jedes Gebot; gewonnen hat, wer danach ein Grundstück ohne Kauf erhält.
  for (const ownership of acquired) {
    const buyer = ownership.ownerId;
    if (newLog.some(entry => entry.kind === "purchase" && entry.playerIds[0] === buyer)) continue;
    const lastBid = newLog.filter(entry => entry.kind === "auction" && entry.playerIds[0] === buyer && entry.amount).at(-1);
    if (lastBid && !next.auction) moments.push({ kind: "auctionWon", playerId: buyer, tileIndex: ownership.tileIndex, amount: Math.abs(lastBid.amount!) });
  }

  const building = next.lastBuildingAction;
  if (building && building.id !== previous.lastBuildingAction?.id && building.type === "build") {
    moments.push({ kind: "build", playerId: building.playerId, tileIndex: building.tileIndex, buildingName: building.buildingName, level: building.toLevel });
  }
  const celebration = next.lastMomentumCelebration;
  if (celebration && celebration.id !== previous.lastMomentumCelebration?.id && celebration.type === "completeGroup") {
    moments.push({ kind: "groupComplete", playerId: celebration.playerId, groupId: celebration.groupId });
  }
  const trade = next.lastTradeAction;
  if (trade && trade.id !== previous.lastTradeAction?.id && trade.type === "accepted") {
    moments.push({ kind: "tradeSealed", proposerId: trade.proposerId, recipientId: trade.recipientId });
  }

  for (const player of next.players) {
    const before = previous.players.find(entry => entry.id === player.id);
    if (!before) continue;
    if (player.isBankrupt && !before.isBankrupt) moments.push({ kind: "bankrupt", playerId: player.id });
    else if (player.dungeon.inDungeon && !before.dungeon.inDungeon) moments.push({ kind: "dungeonEnter", playerId: player.id });
    else if (!player.dungeon.inDungeon && before.dungeon.inDungeon && !player.isBankrupt) moments.push({ kind: "dungeonLeave", playerId: player.id });
  }

  const turn = next.lastTurnAction;
  if (turn && turn.id !== previous.lastTurnAction?.id && turn.kind === "double") moments.push({ kind: "double", playerId: turn.playerId });

  const tavern = next.tavern;
  if (tavern?.status === "resolved" && (previous.tavern?.id !== tavern.id || previous.tavern.status !== "resolved")) {
    moments.push(tavern.payout ? { kind: "tavernWin", playerId: tavern.playerId, amount: tavern.payout } : { kind: "tavernLoss", playerId: tavern.playerId, amount: tavern.pot });
  }

  const chronicle = next.activeChronicleEvent;
  if (chronicle && chronicle.startedAt !== previous.activeChronicleEvent?.startedAt) moments.push({ kind: "chronicleEvent", title: chronicle.title, eventId: chronicle.id });
  const impulse = next.activeWorldImpulse;
  if (impulse?.startedAt && impulse.startedAt !== previous.activeWorldImpulse?.startedAt) moments.push({ kind: "worldImpulse", title: impulse.title || getWorldImpulseDefinition(impulse.id).title, impulseId: impulse.id });
  if (next.quickGameClock?.expired && !previous.quickGameClock?.expired && next.status === "playing") moments.push({ kind: "lastRound" });
  if (next.status === "finished" && previous.status !== "finished") {
    const winnerIds = next.gameResult?.winnerIds ?? next.winnerIds ?? (next.winnerId ? [next.winnerId] : []);
    if (winnerIds.length) moments.push({ kind: "victory", winnerIds });
  }
  return moments.sort(byPriority);
}
