import type { AuctionBidIncrement } from "./economy";
import type { GameConfig, GameRoom, GameState, MagicSignal, Player, PlayerColor, PlayerCharacterId, TradeAssets, TavernChoice } from "./game";
import type { PropertyGroupId } from "./property-groups";
import type { RelicId } from "./relics";

export const SOCKET_EVENTS = {
  roomCreate: "room:create",
  roomJoin: "room:join",
  roomUpdate: "room:update",
  roomAddComputer: "room:addComputer",
  roomRemoveComputer: "room:removeComputer",
  roomRemovePlayer: "room:removePlayer",
  roomRemoved: "room:removed",
  roomUpdateConfig: "room:updateConfig",
  playerJoin: "player:join",
  playerDisconnect: "player:disconnect",
  playerReconnect: "player:reconnect",
  playerUpdateColor: "player:updateColor",
  playerUpdateCharacter: "player:updateCharacter",
  playerUpdateReady: "player:updateReady",
  playerMagicSignal: "player:magicSignal",
  propertyGroupFocus: "property:groupFocus",
  gameStart: "game:start",
  gameState: "game:state",
  gameRollOrder: "game:rollOrder",
  gameRollDice: "game:rollDice",
  gameUseRuneStone: "game:useRuneStone",
  gameKeepRoll: "game:keepRoll",
  relicActivate: "relic:activate",
  gameRollDungeon: "game:rollDungeon",
  gamePayDungeonRelease: "game:payDungeonRelease",
  gameUseDungeonCard: "game:useDungeonCard",
  gameDrawCard: "game:drawCard",
  gameAcknowledgeCard: "game:acknowledgeCard",
  gameEndTurn: "game:endTurn",
  gameBuyProperty: "game:buyProperty",
  gameDeclineProperty: "game:declineProperty",
  gameChooseTavern: "game:chooseTavern",
  propertyBuild: "property:build",
  propertySellBuilding: "property:sellBuilding",
  paymentSettle: "payment:settle",
  propertyMortgage: "property:mortgage",
  propertyRedeemMortgage: "property:redeemMortgage",
  tradeCreate: "trade:create",
  tradeAccept: "trade:accept",
  tradeReject: "trade:reject",
  tradeCancel: "trade:cancel",
  playerDeclareBankruptcy: "player:declareBankruptcy",
  gameNewChronicle: "game:newChronicle",
  gameReturnToLobby: "game:returnToLobby",
  auctionBid: "auction:bid",
  auctionWithdraw: "auction:withdraw",
  errorMessage: "error:message"
} as const;

export interface EventResult {
  ok: boolean;
  message?: string;
}

export interface RoomMutationResult extends EventResult {
  room?: GameRoom;
}

export interface CreateRoomRequest {
  roomCode?: string;
  hostToken?: string;
}

export interface CreateRoomResult extends EventResult {
  room?: GameRoom;
  hostToken?: string;
  controllerUrl?: string;
}

export interface JoinRoomRequest {
  roomCode: string;
  name: string;
  playerToken?: string;
}

export interface JoinRoomResult extends EventResult {
  room?: GameRoom;
  player?: Player;
  playerToken?: string;
  reconnected?: boolean;
}

export interface StartGameResult extends EventResult {
  gameState?: GameState;
}

export interface GameActionResult extends EventResult {
  gameState?: GameState;
}

export interface CreateTradeOfferRequest {
  counterToTradeId?: string;
  recipientId: string;
  offer: TradeAssets;
  request: TradeAssets;
}

export interface PropertyGroupFocusSignal {
  groupId: PropertyGroupId;
  playerId: string;
  color: Player["color"];
  active: boolean;
  sentAt: number;
}

export interface ClientToServerEvents {
  "room:create": (request: CreateRoomRequest, callback: (result: CreateRoomResult) => void) => void;
  "room:join": (request: JoinRoomRequest, callback: (result: JoinRoomResult) => void) => void;
  "room:addComputer": (callback: (result: RoomMutationResult) => void) => void;
  "room:removeComputer": (playerId: string, callback: (result: RoomMutationResult) => void) => void;
  "room:removePlayer": (playerId: string, callback: (result: RoomMutationResult) => void) => void;
  "room:updateConfig": (config: GameConfig, callback: (result: RoomMutationResult) => void) => void;
  "player:join": (request: JoinRoomRequest, callback: (result: JoinRoomResult) => void) => void;
  "player:magicSignal": (callback: (result: EventResult) => void) => void;
  "player:updateColor": (color: PlayerColor, callback: (result: RoomMutationResult) => void) => void;
  "player:updateCharacter": (characterId: PlayerCharacterId, callback: (result: RoomMutationResult) => void) => void;
  "player:updateReady": (ready: boolean, callback: (result: RoomMutationResult) => void) => void;
  "property:groupFocus": (groupId: PropertyGroupId, active: boolean, callback: (result: EventResult) => void) => void;
  "game:start": (callback: (result: StartGameResult) => void) => void;
  "game:rollOrder": (callback: (result: GameActionResult) => void) => void;
  "game:rollDice": (callback: (result: GameActionResult) => void) => void;
  "game:useRuneStone": (callback: (result: GameActionResult) => void) => void;
  "game:keepRoll": (callback: (result: GameActionResult) => void) => void;
  "relic:activate": (relicId: RelicId, callback: (result: GameActionResult) => void) => void;
  "game:rollDungeon": (callback: (result: GameActionResult) => void) => void;
  "game:payDungeonRelease": (callback: (result: GameActionResult) => void) => void;
  "game:useDungeonCard": (callback: (result: GameActionResult) => void) => void;
  "game:drawCard": (callback: (result: GameActionResult) => void) => void;
  "game:acknowledgeCard": (callback: (result: GameActionResult) => void) => void;
  "game:endTurn": (callback: (result: GameActionResult) => void) => void;
  "game:buyProperty": (callback: (result: GameActionResult) => void) => void;
  "game:declineProperty": (callback: (result: GameActionResult) => void) => void;
  "game:chooseTavern": (choice: TavernChoice, callback: (result: GameActionResult) => void) => void;
  "property:build": (tileIndex: number, callback: (result: GameActionResult) => void) => void;
  "property:sellBuilding": (tileIndex: number, callback: (result: GameActionResult) => void) => void;
  "payment:settle": (callback: (result: GameActionResult) => void) => void;
  "property:mortgage": (tileIndex: number, callback: (result: GameActionResult) => void) => void;
  "property:redeemMortgage": (tileIndex: number, callback: (result: GameActionResult) => void) => void;
  "trade:create": (request: CreateTradeOfferRequest, callback: (result: GameActionResult) => void) => void;
  "trade:accept": (tradeId: string, callback: (result: GameActionResult) => void) => void;
  "trade:reject": (tradeId: string, callback: (result: GameActionResult) => void) => void;
  "trade:cancel": (tradeId: string, callback: (result: GameActionResult) => void) => void;
  "player:declareBankruptcy": (callback: (result: GameActionResult) => void) => void;
  "game:newChronicle": (callback: (result: RoomMutationResult) => void) => void;
  "game:returnToLobby": (callback: (result: RoomMutationResult) => void) => void;
  "auction:bid": (increment: AuctionBidIncrement, callback: (result: GameActionResult) => void) => void;
  "auction:withdraw": (callback: (result: GameActionResult) => void) => void;
}

export interface ServerToClientEvents {
  "room:removed": (message: string) => void;
  "room:update": (room: GameRoom) => void;
  "player:join": (player: Player) => void;
  "player:disconnect": (player: Player) => void;
  "player:reconnect": (player: Player) => void;
  "player:magicSignal": (signal: MagicSignal) => void;
  "property:groupFocus": (signal: PropertyGroupFocusSignal) => void;
  "game:start": (gameState: GameState) => void;
  "game:state": (gameState: GameState) => void;
  "error:message": (message: string) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  role?: "host" | "player";
  roomCode?: string;
  playerId?: string;
}
