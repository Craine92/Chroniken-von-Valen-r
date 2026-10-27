import { useEffect, useState, type CSSProperties } from "react";
import { EMOTE_COOLDOWN_MS, EMOTE_IDS, EMOTE_LABELS, type EmoteId, type EmoteResult } from "@valenor/shared";
import { EMOTE_ICONS, Icon } from "./icons/Icon";

/** Ganze Sekunden bis zum nächsten Emote, aufgerundet, damit „0 s“ nie neben einem gesperrten Knopf steht. */
export function emoteSecondsLeft(cooldownUntil: number, now: number): number {
  return Math.max(0, Math.ceil((cooldownUntil - now) / 1_000));
}

export type SendEmote = (emoteId: EmoteId, done: (result: EmoteResult) => void) => void;

/** Vier Reaktionen für den gemeinsamen Bildschirm. Der Server erzwingt die Abklingzeit; das Handy spiegelt sie nur. */
export function EmoteBar({ connected, onSend, initialCooldownUntil = 0 }: { connected: boolean; onSend: SendEmote; initialCooldownUntil?: number }) {
  const [cooldownUntil, setCooldownUntil] = useState(initialCooldownUntil);
  const [lastSent, setLastSent] = useState<EmoteId>();
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = emoteSecondsLeft(cooldownUntil, now);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= cooldownUntil) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const send = (emoteId: EmoteId) => {
    setPending(true);
    onSend(emoteId, (result) => {
      setPending(false);
      const sentAt = Date.now();
      setNow(sentAt);
      if (result.ok) {
        setLastSent(emoteId);
        setCooldownUntil(sentAt + EMOTE_COOLDOWN_MS);
      } else if (result.cooldownMs) setCooldownUntil(sentAt + result.cooldownMs);
    });
  };

  const disabled = !connected || pending || secondsLeft > 0;
  return <section className="emote-bar" aria-label="Reaktionen für den gemeinsamen Bildschirm"
    style={{ "--emote-cooldown": `${Math.max(0, cooldownUntil - now)}ms` } as CSSProperties}>
    <div className="emote-bar__buttons">
      {EMOTE_IDS.map(emoteId => <button key={emoteId} type="button" className={`emote-button emote-button--${emoteId}`} disabled={disabled}
        aria-label={`${EMOTE_LABELS[emoteId]} senden`} onClick={() => send(emoteId)}>
        <Icon name={EMOTE_ICONS[emoteId]} />
        <span>{EMOTE_LABELS[emoteId]}</span>
      </button>)}
    </div>
    <p className="emote-bar__status" role="status">
      {secondsLeft > 0
        ? <>{lastSent ? `${EMOTE_LABELS[lastSent]} erscheint auf dem Bildschirm` : "Kurz verschnaufen"} · wieder in {secondsLeft} s</>
        : "Reagiere auf das Geschehen am Brett"}
    </p>
    {secondsLeft > 0 && <i key={cooldownUntil} className="emote-bar__cooldown" aria-hidden="true" />}
  </section>;
}
