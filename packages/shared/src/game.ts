export const PLAYER_COLORS = ["violet", "green", "red", "blue"] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export type PlayerType = "human" | "computer";
export type ConnectionState = "connected" | "disconnected";
export type GameMode = "chronicles" | "quick";
export type QuickGameDuration = 60 | 75 | 90;
export type GameStatus = "lobby" | "starting" | "playing" | "finished";
export type TurnPhase =
  | "determiningOrder"
  | "waitingForRoll"
  | "rolling"
  | "moving"
  | "landed"
  | "propertyDecision"
  | "auction"
  | "rentResolution"
  | "taxResolution"
  | "utilityResolution"
  | "harborResolution"
  | "dungeonDecision"
  | "dungeonRolling"
  | "dungeonTransfer"
  | "awaitingCardDraw"
  | "cardResolving"
  | "cardMoving"
  | "cardAcknowledgement"
  | "paymentRequired"
  | "waitingForEndTurn"
  | "turnTransition";

export interface DiceRoll {
  die1: number;
  die2: number;
  total: number;
  isDouble: boolean;
}

export interface OrderRollState {
  playerId: string;
  rolls: DiceRoll[];
}

export interface MovementResult {
  kind: "normal" | "dungeonTransfer" | "card";
  sequence?: number;
  playerId: string;
  from: number;
  to: number;
  path: number[];
  passedStart: boolean;
  landedTile: import("./board").BoardTile;
}

export interface GameConfig {
  mode: GameMode;
  quickGameDurationMinutes?: QuickGameDuration;
}

export const DEFAULT_GAME_CONFIG: GameConfig = { mode: "chronicles" };
export { STARTING_GOLD as NORMAL_STARTING_GOLD } from "./economy";

export type BuildingLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface BuildingBank {
  settlementUnitsAvailable: number;
  grandStructuresAvailable: number;
}

export interface PropertyOwnership {
  tileIndex: number;
  ownerId: string;
  mortgaged: boolean;
  buildingLevel: BuildingLevel;
}

export type EconomyLogKind = "purchase" | "rent" | "tax" | "auction" | "building" | "mortgage" | "trade" | "bankruptcy" | "start" | "tavern" | "dragon" | "relic" | "quest" | "system";

export interface EconomyLogEntry {
  id: string;
  kind: EconomyLogKind;
  relicId?: import("./relics").RelicId;
  questId?: import("./quests").QuestId;
  message: string;
  playerIds: string[];
  amount?: number;
  createdAt: number;
}

export interface AuctionState {
  tileIndex: number;
  currentBid: number;
  highestBidderId?: string;
  participantIds: string[];
  withdrawnPlayerIds: string[];
  pausedForPlayerIds: string[];
  revision: number;
  source?: "property" | "bankruptcy";
}

export interface PendingPayment {
  payerId: string;
  payeeId?: string;
  amount: number;
  reason: string;
  creditorType?: "player" | "bank";
  reasonType?: "rent" | "tax" | "dungeonRelease" | "card" | "cardRepair" | "other";
  weltenwegPotContribution?: boolean;
}

export interface DungeonState {
  inDungeon: boolean;
  failedAttempts: number;
}

export interface TurnContext {
  consecutiveDoubles: number;
  pendingExtraRoll: boolean;
  rollSequence: number;
  movementSequence?: number;
  awaitingRuneStoneDecision?: boolean;
  rollKind?: "normal" | "dungeonAttempt";
  pendingDungeonMovement?: DiceRoll;
}

export type TurnActionKind =
  | "double"
  | "thirdDouble"
  | "sentToDungeon"
  | "dungeonFailed"
  | "dungeonEscaped"
  | "dungeonPaid";

export interface TurnAction {
  id: string;
  kind: TurnActionKind;
  playerId: string;
  createdAt: number;
  attempt?: number;
}

export interface TradeAssets {
  gold: number;
  propertyTileIndices: number[];
  cardIds?: string[];
  relicIds?: import("./relics").RelicId[];
}

export interface HeldCard {
  cardId: string;
  deck: import("./cards").CardDeckType;
}

export interface PendingCardPayment {
  fromPlayerId: string;
  toPlayerId?: string;
  creditorType: "player" | "bank";
  amount: number;
  reason: string;
  reasonType: "card" | "cardRepair";
}

export type CardResolutionStatus = "resolving" | "waitingForPayment" | "waitingForMovement" | "waitingForLanding" | "readyToAcknowledge";

export interface CardResolutionState {
  cardId: string;
  deck: import("./cards").CardDeckType;
  playerId: string;
  effectIndex: number;
  status: CardResolutionStatus;
  chainDepth: number;
  pendingPayments: PendingCardPayment[];
}

export interface ActiveCardState {
  cardId: string;
  deck: import("./cards").CardDeckType;
  playerId: string;
  status: CardResolutionStatus;
}

export interface PublicDeckState {
  drawCount: number;
  discardCount: number;
}

export interface QuickGameClock {
  durationMs: number;
  startedAt: number;
  totalPausedMs: number;
  pausedAt?: number;
  stoppedAt?: number;
  expired: boolean;
  expiredAt?: number;
  finishAfterRound?: number;
  serverNow: number;
  remainingMs: number;
}

export interface QuickGameScore {
  playerId: string;
  goldValue: number;
  propertyValue: number;
  buildingValue: number;
  mortgageLiability: number;
  netPropertyValue: number;
  totalNetWorth: number;
  propertyCount: number;
  buildingCount: number;
  developedPropertyCount: number;
  completeGroupCount: number;
  highestBuildingLevel: BuildingLevel;
  heldCardCount: number;
}

export type FinishReason = "lastPlayerStanding" | "quickGameTimeExpired";

export interface GameResult {
  finishReason: FinishReason;
  winnerIds: string[];
  finishedAt: number;
  scores?: QuickGameScore[];
  roundsPlayed: number;
  durationPlayedMs?: number;
}

export type TradeOfferStatus = "pending" | "accepted" | "rejected" | "cancelled";

export interface TradeOffer {
  id: string;
  proposerId: string;
  recipientId: string;
  offer: TradeAssets;
  request: TradeAssets;
  status: TradeOfferStatus;
  createdAt: number;
}

export interface TradeAction {
  id: string;
  type: "created" | "accepted";
  proposerId: string;
  recipientId: string;
  createdAt: number;
}

export interface BankruptcyAuctionState {
  debtorId: string;
  pendingTileIndices: number[];
}

export interface BuildingAction {
  id: string;
  type: "build" | "sell";
  playerId: string;
  tileIndex: number;
  fromLevel: BuildingLevel;
  toLevel: BuildingLevel;
  buildingName: string;
  amount: number;
  createdAt: number;
}

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  color: PlayerColor;
  connectionState: ConnectionState;
  joinedAt: number;
}

export interface GamePlayerState {
  id: string;
  name: string;
  type: PlayerType;
  color: PlayerColor;
  connectionState: ConnectionState;
  gold: number;
  position: number;
  isBankrupt: boolean;
  dungeon: DungeonState;
  heldCards?: HeldCard[];
  relics?: import("./relics").RelicId[];
  armedRelics?: import("./relics").RelicId[];
  activeQuests?: import("./quests").PlayerQuest[];
  processedQuestEventIds?: string[];
}

export interface GameState {
  roomId: string;
  status: GameStatus;
  config: GameConfig;
  players: GamePlayerState[];
  turnOrder: string[];
  orderRolls: OrderRollState[];
  orderContenders: string[];
  orderRollTargetCount: number;
  currentPlayerId?: string;
  currentTurnIndex: number;
  currentRound: number;
  activeChronicleEvent?: import("./chronicle-events").ActiveChronicleEvent;
  chronicleEventHistory?: import("./chronicle-events").ActiveChronicleEvent[];
  weltenwegPot?: number;
  wanderingDragon?: { tileIndex: number; nextMoveRound: number; encounterSequence: number };
  lastDragonEncounterMovementSequence?: number;
  turnNumber: number;
  turnPhase: TurnPhase;
  turnContext: TurnContext;
  decks?: Record<import("./cards").CardDeckType, PublicDeckState>;
  activeCard?: ActiveCardState;
  cardResolution?: CardResolutionState;
  quickGameClock?: QuickGameClock;
  propertyOwnerships: PropertyOwnership[];
  buildingBank: BuildingBank;
  economyLog: EconomyLogEntry[];
  trades: TradeOffer[];
  auction?: AuctionState;
  bankruptcyAuction?: BankruptcyAuctionState;
  pendingPayment?: PendingPayment;
  lastBuildingAction?: BuildingAction;
  lastTradeAction?: TradeAction;
  lastTurnAction?: TurnAction;
  winnerId?: string;
  winnerIds?: string[];
  finishReason?: FinishReason;
  finalScores?: QuickGameScore[];
  gameResult?: GameResult;
  lastResolvedRollSequence?: number;
  lastResolvedMovementSequence?: number;
  lastRewardedStartMovementSequence?: number;
  lastDiceRoll?: DiceRoll;
  lastMovement?: MovementResult;
  startedAt: number;
}

export interface GameRoom {
  code: string;
  players: Player[];
  phase: GameStatus;
  config: GameConfig;
  gameState?: GameState;
  createdAt: number;
}

export interface MagicSignal {
  playerId: string;
  playerName: string;
  color: PlayerColor;
  sentAt: number;
}
