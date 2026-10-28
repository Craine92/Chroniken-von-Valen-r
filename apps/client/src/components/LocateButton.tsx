import { useEffect, useState } from "react";
import { LOCATE_COOLDOWN_MS, type EmoteResult } from "@valenor/shared";
import { Icon } from "./icons/Icon";

export type SendLocate = (done: (result: EmoteResult) => void) => void;

/** „Wo bin ich?“: Die eigene Figur pulsiert ein paar Sekunden auf dem TV. Die Abklingzeit erzwingt der Server. */
export function LocateButton({ connected, onLocate }: { connected: boolean; onLocate: SendLocate }) {
  const [glowingUntil, setGlowingUntil] = useState(0);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const glowing = glowingUntil > now;

  useEffect(() => {
    if (glowingUntil <= Date.now()) return;
    const timer = window.setTimeout(() => setNow(Date.now()), glowingUntil - Date.now() + 20);
    return () => window.clearTimeout(timer);
  }, [glowingUntil]);

  const locate = () => {
    setPending(true);
    onLocate((result) => {
      setPending(false);
      const sentAt = Date.now();
      setNow(sentAt);
      if (result.ok) setGlowingUntil(sentAt + LOCATE_COOLDOWN_MS);
      else if (result.cooldownMs) setGlowingUntil(sentAt + result.cooldownMs);
    });
  };

  return <button type="button" className={`locate-button${glowing ? " is-glowing" : ""}`} disabled={!connected || pending || glowing} onClick={locate} aria-live="polite">
    <Icon name="figure" />
    <span>{glowing ? "Deine Figur leuchtet auf dem TV …" : "Wo bin ich?"}</span>
  </button>;
}
