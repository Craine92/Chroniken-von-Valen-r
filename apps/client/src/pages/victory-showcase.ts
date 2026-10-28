import { emptyPlayerStats, getNetWorth, type GameState, type MatchStats } from "@valenor/shared";

/**
 * Feste, in sich stimmige Beispiel-Statistik für die Visual-QA der Siegerehrung: Jede Linie beginnt bei 1.500 Gold und
 * endet beim tatsächlichen Vermögen im Spielstand; wer bankrott ist, stürzt gegen Ende auf 0. Die übrigen Werte
 * vergeben jede Auszeichnung.
 */
export function showcaseMatchStats(state: GameState, rounds = 12): MatchStats {
  const ids = state.players.map(player => player.id);
  const finals = Object.fromEntries(ids.map(id => [id, getNetWorth(state, id)]));
  // Eigenheiten der Verläufe: früher Aufstieg, Wellen, später Sprung.
  const shapes = [(t: number) => t ** .7 + .25 * Math.sin(t * 5), (t: number) => t + .3 * Math.sin(t * 3.4), (t: number) => t, (t: number) => t ** 2.2];
  const valueAt = (id: string, index: number, round: number) => {
    const t = round / rounds, player = state.players.find(entry => entry.id === id)!;
    if (player.isBankrupt) return round >= rounds - 1 ? 0 : Math.round((1_500 + 900 * Math.sin(t * 2.6)) / 10) * 10;
    return Math.max(0, Math.round((1_500 + (finals[id]! - 1_500) * shapes[index % 4]!(t)) / 10) * 10);
  };
  const wealthByRound = Array.from({ length: rounds + 1 }, (_, round) => ({
    round, values: Object.fromEntries(ids.map((id, index) => [id, round === rounds ? finals[id]! : valueAt(id, index, round)]))
  }));
  const tune: Partial<ReturnType<typeof emptyPlayerStats>>[] = [
    { buildingsBuilt: 6, rentReceived: 1_480, purchases: 6, purchaseSpent: 1_640, runegatePasses: 5, cardsDrawn: 3, doubles: 2 },
    { rentPaid: 2_150, tradesCompleted: 4, purchases: 4, cardsDrawn: 6, dragonEncounters: 2, taxesPaid: 300 },
    { dungeonTurns: 5, dungeonVisits: 2, longestDungeonStay: 3, rentPaid: 1_900, taxesPaid: 450, doubles: 1 },
    { tradesCompleted: 2, purchases: 5, dragonEncounters: 1, doubles: 4, runegatePasses: 4, buildingsBuilt: 11, rentReceived: 3_480 }
  ];
  let peak = { amount: 0, playerId: ids[0]!, round: 0 };
  for (const snapshot of wealthByRound) for (const id of ids) {
    if ((snapshot.values[id] ?? 0) > peak.amount) peak = { amount: snapshot.values[id]!, playerId: id, round: snapshot.round };
  }
  return {
    players: Object.fromEntries(ids.map((id, index) => [id, { ...emptyPlayerStats(), ...tune[index % 4], peakNetWorth: Math.max(...wealthByRound.map(snapshot => snapshot.values[id] ?? 0)) }])),
    wealthByRound,
    highestRent: { amount: 1_100, playerId: ids[3] ?? ids[0]!, otherPlayerId: ids[1]!, tileIndex: 24 },
    priciestPurchase: { amount: 400, playerId: ids[3] ?? ids[0]!, tileIndex: 39 },
    peakWealth: peak
  };
}
