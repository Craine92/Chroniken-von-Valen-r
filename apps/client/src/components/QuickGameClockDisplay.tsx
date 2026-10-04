import { useEffect, useState } from "react";
import type { QuickGameClock } from "@valenor/shared";

export function formatQuickGameTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, "0")).join(":");
}

export function QuickGameClockDisplay({ clock, compact = false }: { clock?: QuickGameClock | undefined; compact?: boolean }) {
  const [remaining, setRemaining] = useState(clock?.remainingMs ?? 0);

  useEffect(() => {
    if (!clock) return;
    const receivedAt = performance.now();
    const calculate = () => {
      if (clock.expired) return 0;
      if (clock.pausedAt !== undefined || clock.stoppedAt !== undefined) return clock.remainingMs;
      return Math.max(0, clock.remainingMs - Math.max(0, performance.now() - receivedAt));
    };
    setRemaining(calculate());
    const timer = window.setInterval(() => setRemaining(calculate()), 250);
    return () => window.clearInterval(timer);
  }, [clock?.startedAt, clock?.serverNow, clock?.remainingMs, clock?.pausedAt, clock?.stoppedAt, clock?.expired]);

  if (!clock) return null;
  const urgency = remaining <= 60_000 ? "critical" : remaining <= 5 * 60_000 ? "warning" : "normal";
  const label = clock.expired ? "ZEIT ABGELAUFEN" : clock.pausedAt !== undefined ? "PAUSIERT" : "VERBLEIBENDE ZEIT";
  return (
    <div className={`quick-clock quick-clock--${urgency} ${compact ? "quick-clock--compact" : ""}`} role="timer" aria-live="off">
      <i className="quick-clock__hourglass" aria-hidden="true">⌛</i>
      <span>{label}</span>
      <strong>{formatQuickGameTime(remaining)}</strong>
    </div>
  );
}
