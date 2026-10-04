import type { AiDecision, AiDecisionContext } from "./ai-types";

export interface AiController<TGameState = unknown> {
  decide(context: AiDecisionContext<TGameState>): Promise<AiDecision>;
}

// A concrete controller is intentionally deferred until the actual rules exist.
