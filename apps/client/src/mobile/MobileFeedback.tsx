import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { GameState } from "@valenor/shared";
import { MobileFeedbackEventTracker } from "./mobile-feedback-events";
import { MobileFeedbackQueue, type FeedbackSnapshot } from "./mobile-feedback";

export function useMobileFeedback(state: GameState | undefined, playerId: string | undefined) {
  const [queue] = useState(() => new MobileFeedbackQueue());
  const tracker = useRef(new MobileFeedbackEventTracker());
  const scope = useRef<string | undefined>(undefined);
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  useEffect(() => {
    const active = state?.status === "playing" && state.players.some((player) => player.id === playerId && !player.isBankrupt);
    const nextScope = active && state && playerId ? `${state.roomId}:${state.startedAt}:${playerId}` : undefined;
    if (scope.current !== nextScope) { queue.clear(); tracker.current.reset(); scope.current = nextScope; }
    if (active && state && playerId) tracker.current.update(state, playerId).forEach((event) => queue.showMobileFeedback(event));
  }, [state, playerId, queue]);
  useEffect(() => () => queue.clear(), [queue]);
  return { snapshot, dismiss: queue.dismiss };
}

export function MobileFeedbackToast({ snapshot, onDismiss, onHeightChange }: {
  snapshot: FeedbackSnapshot; onDismiss: () => void; onHeightChange: (height: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!snapshot.current || !ref.current) { onHeightChange(0); return; }
    const card = ref.current.closest(".controller-page")?.querySelector<HTMLElement>(".controller-card--started");
    const protectContent = () => {
      if (!card || !ref.current) return;
      const boundary = ref.current.getBoundingClientRect().bottom + 8;
      card.style.setProperty("--mobile-feedback-clip", `${Math.max(0, boundary - card.getBoundingClientRect().top)}px`);
    };
    const measure = () => {
      onHeightChange(ref.current?.getBoundingClientRect().height ?? 0);
      protectContent();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(ref.current);
    window.addEventListener("scroll", protectContent, true);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", protectContent, true);
      window.removeEventListener("resize", measure);
      card?.style.removeProperty("--mobile-feedback-clip");
    };
  }, [snapshot.current, onHeightChange]);
  const feedback = snapshot.current;
  if (!feedback) return null;
  return (
    <aside ref={ref} className={`mobile-feedback-toast ${snapshot.exiting ? "is-exiting" : ""}`}
      style={{ "--feedback-accent": feedback.accent ?? "#d8b968" } as CSSProperties}
      role="status" aria-live={feedback.type === "tradeOffer" ? "assertive" : "polite"} aria-atomic="true">
      <span className="mobile-feedback-toast__icon" aria-hidden="true">{feedback.icon ?? "✦"}</span>
      <div className="mobile-feedback-toast__content">
        <strong>{feedback.title}</strong><p>{feedback.message}</p>
        {feedback.action && <button type="button" onClick={() => { feedback.action?.(); onDismiss(); }}>{feedback.actionLabel}</button>}
      </div>
      <button className="mobile-feedback-toast__close" type="button" aria-label="Meldung schließen" onClick={onDismiss}>×</button>
    </aside>
  );
}
