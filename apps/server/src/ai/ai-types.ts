export type AiAction =
  | "rollDice"
  | "buyProperty"
  | "declineProperty"
  | "bidAuction"
  | "build"
  | "mortgage"
  | "trade"
  | "useCard"
  | "endTurn";

export interface AiDecisionContext<TGameState = unknown> {
  playerId: string;
  gameState: Readonly<TGameState>;
}

export interface AiDecision<TPayload = unknown> {
  action: AiAction;
  payload?: TPayload;
}
