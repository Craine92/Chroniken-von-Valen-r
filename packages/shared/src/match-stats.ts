import { BOARD_TILES } from "./board";
import type { GameState } from "./game";

/**
 * Statistik einer Partie. Sie entsteht nur während des Spiels im Arbeitsspeicher des Servers, indem jeder neue
 * Spielstand mit dem vorigen verglichen wird (recordMatchStats). Nichts davon wird dauerhaft gespeichert, und keine
 * Spielregel liest sie: Sie dient allein der Siegerehrung.
 */
export interface PlayerMatchStats {
  rentPaid: number;
  rentReceived: number;
  purchases: number;
  purchaseSpent: number;
  buildingsBuilt: number;
  tradesCompleted: number;
  dungeonVisits: number;
  /** Eigene Züge, die der Spieler im Kerker verbracht hat. */
  dungeonTurns: number;
  longestDungeonStay: number;
  currentDungeonStay: number;
  dragonEncounters: number;
  relicsFound: number;
  taxesPaid: number;
  cardsDrawn: number;
  doubles: number;
  runegatePasses: number;
  peakNetWorth: number;
  /** Zug, in dem der Spieler bankrott ging (für die Reihenfolge der Ausgeschiedenen). */
  bankruptAtTurn?: number;
}

export interface MatchRecordEntry {
  amount: number;
  playerId: string;
  otherPlayerId?: string;
  tileIndex?: number;
}

export interface WealthSnapshot {
  /** 0 = Spielbeginn, danach die jeweilige Runde (Wert am Ende der Runde bzw. zuletzt gesehen). */
  round: number;
  values: Record<string, number>;
}

export interface MatchStats {
  players: Record<string, PlayerMatchStats>;
  wealthByRound: WealthSnapshot[];
  highestRent?: MatchRecordEntry;
  priciestPurchase?: MatchRecordEntry;
  peakWealth?: MatchRecordEntry & { round: number };
}

type CountedStat = Exclude<keyof PlayerMatchStats, "bankruptAtTurn">;

export function emptyPlayerStats(): PlayerMatchStats {
  return {
    rentPaid: 0, rentReceived: 0, purchases: 0, purchaseSpent: 0, buildingsBuilt: 0, tradesCompleted: 0, dungeonVisits: 0,
    dungeonTurns: 0, longestDungeonStay: 0, currentDungeonStay: 0, dragonEncounters: 0, relicsFound: 0, taxesPaid: 0,
    cardsDrawn: 0, doubles: 0, runegatePasses: 0, peakNetWorth: 0
  };
}

/** Vermögen: Gold, Kaufwert der Grundstücke und Gebäude, abzüglich offener Hypotheken. */
export function getNetWorth(state: Pick<GameState, "players" | "propertyOwnerships">, playerId: string): number {
  const player = state.players.find(entry => entry.id === playerId);
  if (!player || player.isBankrupt) return 0;
  return state.propertyOwnerships.filter(entry => entry.ownerId === playerId).reduce((sum, entry) => {
    const economy = BOARD_TILES[entry.tileIndex]?.economy;
    if (!economy) return sum;
    const value = economy.purchasePrice + entry.buildingLevel * (economy.buildCost ?? 0);
    return sum + (entry.mortgaged ? value - Math.floor(economy.purchasePrice / 2) : value);
  }, player.gold);
}

/**
 * Nimmt den neuen Spielstand in die Statistik auf. `previous` ist der zuletzt aufgenommene Spielstand (oder undefined
 * beim ersten Mal). Gibt eine neue Statistik zurück, die alte bleibt unverändert.
 */
export function recordMatchStats(stats: MatchStats | undefined, previous: GameState | undefined, next: GameState): MatchStats {
  const result: MatchStats = structuredClone(stats ?? { players: {}, wealthByRound: [] });
  if (next.status !== "playing" && next.status !== "finished") return result;
  for (const player of next.players) result.players[player.id] ??= emptyPlayerStats();
  const add = (playerId: string | undefined, key: CountedStat, value = 1) => {
    const stats = playerId ? result.players[playerId] : undefined;
    if (stats) stats[key] += value;
  };

  // Neue Einträge im Wirtschaftsprotokoll (es hält nur die letzten Einträge, daher der Vergleich mit dem vorigen Stand).
  const seen = new Set(previous?.economyLog.map(entry => entry.id) ?? []);
  const fresh = previous ? next.economyLog.filter(entry => !seen.has(entry.id)) : [];
  for (const entry of fresh) {
    const amount = Math.abs(entry.amount ?? 0);
    if (entry.kind === "rent" && entry.playerIds.length >= 2 && amount > 0) {
      const [payerId, payeeId] = entry.playerIds as [string, string];
      add(payerId, "rentPaid", amount);
      add(payeeId, "rentReceived", amount);
      if (amount > (result.highestRent?.amount ?? 0)) {
        const tileIndex = next.lastMovement?.playerId === payerId ? next.lastMovement.to : undefined;
        result.highestRent = { amount, playerId: payeeId, otherPlayerId: payerId, ...(tileIndex === undefined ? {} : { tileIndex }) };
      }
    }
    if (entry.kind === "tax" && amount > 0) add(entry.playerIds[0], "taxesPaid", amount);
    if (entry.kind === "dragon") add(entry.playerIds[0], "dragonEncounters");
    if (entry.kind === "relic") add(entry.playerIds[0], "relicsFound");
    if (entry.kind === "start") add(entry.playerIds[0], "runegatePasses");
  }

  if (previous) {
    // Käufe: neu entstandener Besitz (direkt oder ersteigert); Handel überträgt nur und zählt hier nicht.
    const ownedBefore = new Set(previous.propertyOwnerships.map(entry => entry.tileIndex));
    for (const ownership of next.propertyOwnerships.filter(entry => !ownedBefore.has(entry.tileIndex))) {
      const priceEntry = fresh.filter(entry => (entry.kind === "purchase" || entry.kind === "auction") && entry.playerIds[0] === ownership.ownerId && (entry.amount ?? 0) < 0)
        .sort((left, right) => (left.amount ?? 0) - (right.amount ?? 0))[0];
      const price = Math.abs(priceEntry?.amount ?? 0);
      if (!result.players[ownership.ownerId]) continue;
      add(ownership.ownerId, "purchases");
      add(ownership.ownerId, "purchaseSpent", price);
      if (price > (result.priciestPurchase?.amount ?? 0)) result.priciestPurchase = { amount: price, playerId: ownership.ownerId, tileIndex: ownership.tileIndex };
    }
    if (next.lastBuildingAction && next.lastBuildingAction.id !== previous.lastBuildingAction?.id && next.lastBuildingAction.type === "build") {
      add(next.lastBuildingAction.playerId, "buildingsBuilt");
    }
    for (const trade of next.trades) {
      if (trade.status !== "accepted" || previous.trades.find(entry => entry.id === trade.id)?.status === "accepted") continue;
      for (const id of [trade.proposerId, trade.recipientId]) add(id, "tradesCompleted");
    }
    if (next.activeCard && (next.activeCard.cardId !== previous.activeCard?.cardId || next.activeCard.playerId !== previous.activeCard?.playerId)) {
      add(next.activeCard.playerId, "cardsDrawn");
    }
    if (next.lastTurnAction?.kind === "double" && next.lastTurnAction.id !== previous.lastTurnAction?.id) {
      add(next.lastTurnAction.playerId, "doubles");
    }
    const newTurn = next.turnNumber !== previous.turnNumber;
    for (const player of next.players) {
      const stats = result.players[player.id]!, before = previous.players.find(entry => entry.id === player.id);
      if (player.dungeon.inDungeon && !before?.dungeon.inDungeon) { stats.dungeonVisits += 1; stats.currentDungeonStay = 0; }
      if (!player.dungeon.inDungeon && before?.dungeon.inDungeon) stats.currentDungeonStay = 0;
      if (newTurn && player.dungeon.inDungeon && next.currentPlayerId === player.id) {
        stats.dungeonTurns += 1;
        stats.currentDungeonStay += 1;
        stats.longestDungeonStay = Math.max(stats.longestDungeonStay, stats.currentDungeonStay);
      }
      if (player.isBankrupt && !before?.isBankrupt) stats.bankruptAtTurn = next.turnNumber;
    }
  }

  // Vermögen: Startwert als Runde 0, danach je Runde der zuletzt gesehene Wert.
  const values = Object.fromEntries(next.players.map(player => [player.id, getNetWorth(next, player.id)]));
  if (!result.wealthByRound.length) result.wealthByRound.push({ round: 0, values: Object.fromEntries(next.players.map(player => [player.id, values[player.id]!])) });
  const last = result.wealthByRound.at(-1)!;
  const round = Math.max(1, next.currentRound);
  if (last.round === round) last.values = values;
  else if (round > last.round) result.wealthByRound.push({ round, values });
  for (const player of next.players) {
    const stats = result.players[player.id]!, value = values[player.id]!;
    stats.peakNetWorth = Math.max(stats.peakNetWorth, value);
    if (value > (result.peakWealth?.amount ?? 0)) result.peakWealth = { amount: value, playerId: player.id, round };
  }
  return result;
}

/** Endstand: Sieger zuerst, dann nach Vermögen; Ausgeschiedene zuletzt, wer später bankrott ging, steht weiter vorn. */
export function getMatchRanking(state: Pick<GameState, "players" | "propertyOwnerships" | "winnerIds" | "winnerId" | "finalScores" | "matchStats">): string[] {
  const winners = state.winnerIds ?? (state.winnerId ? [state.winnerId] : []);
  const scoreOrder = state.finalScores?.map(score => score.playerId) ?? [];
  const position = (id: string) => scoreOrder.includes(id) ? scoreOrder.indexOf(id) : Number.MAX_SAFE_INTEGER;
  return [...state.players].sort((left, right) => {
    const winner = Number(winners.includes(right.id)) - Number(winners.includes(left.id));
    if (winner) return winner;
    if (left.isBankrupt !== right.isBankrupt) return left.isBankrupt ? 1 : -1;
    if (left.isBankrupt) return (state.matchStats?.players[right.id]?.bankruptAtTurn ?? 0) - (state.matchStats?.players[left.id]?.bankruptAtTurn ?? 0);
    return position(left.id) - position(right.id) || getNetWorth(state, right.id) - getNetWorth(state, left.id);
  }).map(player => player.id);
}

export interface MatchAward {
  id: string;
  title: string;
  /** Kurz, warum: „1.850 Gold Miete gezahlt“. */
  reason: string;
}

interface AwardDefinition {
  id: string;
  title: string;
  metric: (stats: PlayerMatchStats, state: Pick<GameState, "propertyOwnerships">, playerId: string) => number;
  reason: (value: number) => string;
}

const gold = (value: number) => `${value.toLocaleString("de-DE")} Gold`;
const plural = (value: number, one: string, many: string) => `${value.toLocaleString("de-DE")} ${value === 1 ? one : many}`;

/** Reihenfolge = Vorrang: Bei mehreren Gewinnen bekommt jede Auszeichnung genau einen Träger (bei Gleichstand der Besserplatzierte). */
export const MATCH_AWARDS: readonly AwardDefinition[] = [
  { id: "grossgrundbesitzer", title: "Großgrundbesitzer", metric: (_, state, id) => state.propertyOwnerships.filter(entry => entry.ownerId === id).length, reason: value => `${plural(value, "Grundstück", "Grundstücke")} am Ende` },
  { id: "baumeister", title: "Baumeister", metric: stats => stats.buildingsBuilt, reason: value => `${plural(value, "Bauwerk", "Bauwerke")} errichtet` },
  { id: "pechvogel", title: "Pechvogel", metric: stats => stats.rentPaid, reason: value => `${gold(value)} Miete gezahlt` },
  { id: "haendlerkoenig", title: "Händlerkönig", metric: stats => stats.tradesCompleted, reason: value => `${plural(value, "Handelsgeschäft", "Handelsgeschäfte")} besiegelt` },
  { id: "kerker", title: "Stammgast im Kerker", metric: stats => stats.dungeonTurns, reason: value => `${plural(value, "Zug", "Züge")} hinter Gittern` },
  { id: "drachenfreund", title: "Drachenfreund", metric: stats => stats.dragonEncounters, reason: value => `${plural(value, "Begegnung", "Begegnungen")} mit dem Drachen` },
  { id: "mietkoenig", title: "Mietkönig", metric: stats => stats.rentReceived, reason: value => `${gold(value)} Miete kassiert` },
  { id: "schnaeppchenjaeger", title: "Schnäppchenjäger", metric: stats => stats.purchases, reason: value => `${plural(value, "Kauf", "Käufe")}` },
  { id: "runenwanderer", title: "Runenwanderer", metric: stats => stats.runegatePasses, reason: value => `${value.toLocaleString("de-DE")}× am Runentor vorbei` },
  { id: "kartenleser", title: "Schicksalsleser", metric: stats => stats.cardsDrawn, reason: value => `${plural(value, "Karte", "Karten")} gezogen` },
  { id: "glueckskind", title: "Glückskind", metric: stats => stats.doubles, reason: value => `${plural(value, "Pasch", "Pasche")} gewürfelt` },
  { id: "steuerzahler", title: "Treuer Steuerzahler", metric: stats => stats.taxesPaid, reason: value => `${gold(value)} an Krone und Pott` }
];

/**
 * Auszeichnungen für alle: Jede Auszeichnung geht an den Spieler mit dem höchsten Wert (mindestens 1). Wer danach
 * noch keine hat, bekommt eine Ehrenauszeichnung – so geht niemand leer aus.
 */
export function getMatchAwards(state: Pick<GameState, "players" | "propertyOwnerships" | "winnerIds" | "winnerId" | "finalScores" | "matchStats">): Record<string, MatchAward[]> {
  const ranking = getMatchRanking(state);
  const awards: Record<string, MatchAward[]> = Object.fromEntries(ranking.map(id => [id, []]));
  const statsOf = (id: string) => state.matchStats?.players[id] ?? emptyPlayerStats();
  for (const award of MATCH_AWARDS) {
    let best: string | undefined, bestValue = 0;
    for (const id of ranking) {
      const value = award.metric(statsOf(id), state, id);
      if (value > bestValue) { best = id; bestValue = value; }
    }
    if (best) awards[best]!.push({ id: award.id, title: award.title, reason: award.reason(bestValue) });
  }
  for (const id of ranking) {
    if (awards[id]!.length) continue;
    const player = state.players.find(entry => entry.id === id)!;
    awards[id]!.push(player.isBankrupt
      ? { id: "tapfer", title: "Tapfer gefallen", reason: "bis zum letzten Goldstück gekämpft" }
      : { id: "standhaft", title: "Standhafter Gefährte", reason: "bis zum Ende der Chronik dabei" });
  }
  return awards;
}

export interface MatchRecord {
  id: string;
  label: string;
  value: string;
  detail: string;
}

/** Ein paar Zahlen zur Partie; nur Rekorde, die es tatsächlich gibt. */
export function getMatchRecords(state: Pick<GameState, "players" | "matchStats" | "currentRound">): MatchRecord[] {
  const stats = state.matchStats;
  const name = (id: string | undefined) => state.players.find(player => player.id === id)?.name ?? "–";
  const tile = (index: number | undefined) => (index === undefined ? "" : BOARD_TILES[index]?.name ?? "");
  const records: MatchRecord[] = [];
  if (stats?.highestRent) records.push({ id: "highestRent", label: "Höchste Miete", value: gold(stats.highestRent.amount), detail: `${name(stats.highestRent.otherPlayerId)} an ${name(stats.highestRent.playerId)}${stats.highestRent.tileIndex !== undefined ? ` · ${tile(stats.highestRent.tileIndex)}` : ""}` });
  if (stats?.priciestPurchase) records.push({ id: "priciestPurchase", label: "Teuerster Kauf", value: gold(stats.priciestPurchase.amount), detail: `${name(stats.priciestPurchase.playerId)} · ${tile(stats.priciestPurchase.tileIndex)}` });
  const jailed = Object.entries(stats?.players ?? {}).sort(([, left], [, right]) => right.longestDungeonStay - left.longestDungeonStay)[0];
  if (jailed && jailed[1].longestDungeonStay > 0) records.push({ id: "longestDungeon", label: "Längste Zeit im Kerker", value: plural(jailed[1].longestDungeonStay, "Zug", "Züge"), detail: name(jailed[0]) });
  if (stats?.peakWealth) records.push({ id: "peakWealth", label: "Größter Reichtum", value: gold(stats.peakWealth.amount), detail: `${name(stats.peakWealth.playerId)} · Runde ${stats.peakWealth.round}` });
  records.push({ id: "rounds", label: "Gespielte Runden", value: String(state.currentRound), detail: "bis die Chronik entschieden war" });
  return records;
}
