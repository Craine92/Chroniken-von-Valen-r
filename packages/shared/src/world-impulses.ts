export const WORLD_IMPULSE_DEFINITIONS = [
  { id: "runeSpark", title: "Runenfunke", description: "Der nächste Spieler am Runentor erhält einen Bonus.", effectSummary: "+75 Gold am Runentor", type: "instant", weight: 1 },
  { id: "marketCry", title: "Marktschrei", description: "Ein freies Grundstück wird sofort versteigert.", effectSummary: "Ein freies Grundstück wird versteigert.", type: "instant", weight: 1 },
  { id: "dragonCall", title: "Drachenruf", description: "Der Drache zieht weiter.", effectSummary: "Der Hüter zieht weiter.", type: "instant", weight: 1 },
  { id: "worldwayDonation", title: "Weltenweg-Spende", description: "Die Händler füllen den Weltenweg-Pott.", effectSummary: "+100 Gold in den Pott", type: "instant", weight: 1 },
  { id: "buildingFervor", title: "Baueifer", description: "Das nächste Bauwerk wird günstiger.", effectSummary: "Nächster Bau −20 %", type: "instant", weight: 1 },
  { id: "harborWind", title: "Hafenwind", description: "Die Häfen profitieren vom Handel.", effectSummary: "Hafenmieten +50 %", type: "round", weight: 1 },
  { id: "crownFavor", title: "Kronengunst", description: "Der Spieler mit dem wenigsten Gold erhält Unterstützung.", effectSummary: "+100 Gold für den Ärmsten", type: "instant", weight: 1 },
  { id: "twistOfFate", title: "Schicksalswende", description: "Der nächste Würfelwurf darf einmal wiederholt werden.", effectSummary: "Nächster normaler Wurf: Wiederholung möglich", type: "instant", weight: 1 },
  { id: "merchantLuck", title: "Händlerglück", description: "Der nächste Grundstückskauf wird günstiger.", effectSummary: "Nächster Direktkauf −15 %", type: "instant", weight: 1 },
  { id: "goldenMoment", title: "Goldener Augenblick", description: "Ein Spieler erhält eine riskante Chance.", effectSummary: "50 Gold sicher oder das Schicksal herausfordern", type: "instant", weight: 1 }
] as const;

export type WorldImpulseId = (typeof WORLD_IMPULSE_DEFINITIONS)[number]["id"];
export type WorldImpulseType = (typeof WORLD_IMPULSE_DEFINITIONS)[number]["type"];
export type WorldImpulseChoice = "keep" | "reroll" | "safe" | "risk";

export interface WorldImpulseDefinition {
  id: WorldImpulseId;
  title: string;
  description: string;
  effectSummary: string;
  type: WorldImpulseType;
  weight: number;
}

export interface ActiveWorldImpulse extends WorldImpulseDefinition {
  startedAfterRound: number;
  startedAtRound: number;
  startedAt: number;
  status: "active" | "resolved";
  targetTileIndex?: number;
  targetPlayerId?: string;
  expiresAtRound?: number;
  resultText?: string;
  resolvedAt?: number;
  resultDie?: number;
  resultGold?: number;
}

export interface WorldImpulseEffects {
  runeSpark?: true;
  buildingFervor?: true;
  harborWindUntilRound?: number;
  twistOfFate?: true;
  merchantLuck?: true;
}

export interface PendingWorldImpulseDecision {
  impulseId: "twistOfFate" | "goldenMoment";
  playerId: string;
  status: "decision" | "rolling";
  die?: number;
  payout?: number;
}

export interface WorldImpulseResolution {
  impulseId: WorldImpulseId;
  resolvedAt: number;
  targetPlayerId?: string;
  resultGold?: number;
  resultDie?: number;
  resultText?: string;
}

export type MomentumCelebration =
  | { id: string; type: "completeGroup"; playerId: string; groupId: import("./property-groups").PropertyGroupId; title: string; subtitle: string; createdAt: number }
  | { id: string; type: "maxBuilding"; playerId: string; tileIndex: number; title: string; subtitle: string; createdAt: number }
  | { id: string; type: "largeTrade"; playerId: string; otherPlayerId: string; title: string; subtitle: string; createdAt: number }
  | { id: string; type: "largePot"; threshold: 500 | 1000; title: string; subtitle: string; createdAt: number };

export function getWorldImpulseDefinition(id: WorldImpulseId): WorldImpulseDefinition {
  return WORLD_IMPULSE_DEFINITIONS.find((entry) => entry.id === id)!;
}
