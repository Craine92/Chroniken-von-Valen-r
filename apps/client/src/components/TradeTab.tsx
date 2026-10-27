import { useEffect, useState } from "react";
import type { CreateTradeOfferRequest, GameState, QuickTradeRequest } from "@valenor/shared";
import { QuickTradePanel } from "./QuickTradePanel";
import { TradePanel } from "./TradePanel";

export interface QuickTradeIntent {
  id: number;
  tileIndex: number;
}

/** Handel auf dem Smartphone: Schnellhandel ist der Einstieg, der bisherige Mehrfach-Tausch bleibt als „Erweiterter Handel“. */
export function TradeTab({ state, playerId, connected, onCreate, onQuickCreate, onDecision, quickIntent, onQuickIntentHandled, initialMode = "quick" }: {
  state: GameState; playerId: string; connected: boolean;
  onCreate: (request: CreateTradeOfferRequest) => void;
  onQuickCreate: (request: QuickTradeRequest) => void;
  onDecision: (action: "accept" | "reject" | "cancel", tradeId: string) => void;
  quickIntent?: QuickTradeIntent | undefined;
  onQuickIntentHandled?: () => void;
  initialMode?: "quick" | "advanced";
}) {
  const [mode, setMode] = useState(initialMode);
  useEffect(() => { if (quickIntent) setMode("quick"); }, [quickIntent?.id]);
  if (mode === "advanced") return <>
    <button type="button" className="quick-trade-back" onClick={() => setMode("quick")}>← Zurück zum Schnellhandel</button>
    <TradePanel state={state} playerId={playerId} connected={connected} onCreate={onCreate} onDecision={onDecision} />
  </>;
  return <QuickTradePanel state={state} playerId={playerId} connected={connected} onQuickCreate={onQuickCreate} onDecision={onDecision}
    onOpenAdvanced={() => setMode("advanced")} draftIntent={quickIntent} {...(onQuickIntentHandled ? { onDraftIntentHandled: onQuickIntentHandled } : {})} />;
}
