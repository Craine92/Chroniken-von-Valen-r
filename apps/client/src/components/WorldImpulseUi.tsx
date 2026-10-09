import { useEffect, useState } from "react";
import type { ActiveWorldImpulse, GameState, MomentumCelebration, WorldImpulseChoice } from "@valenor/shared";

const IMPULSE_NOTICE_MS = 3_200;
const CELEBRATION_NOTICE_MS = 2_400;

function useRecentEvent<T extends { id?: string; startedAt?: number; resolvedAt?: number; createdAt?: number }>(event: T | undefined, duration: number, useResolution = false): T | undefined {
  const [visibleKey, setVisibleKey] = useState<string>();
  const timestamp = useResolution ? event?.resolvedAt ?? event?.startedAt ?? event?.createdAt : event?.startedAt ?? event?.createdAt;
  const key = event ? `${event.id ?? "event"}:${timestamp ?? 0}` : undefined;
  useEffect(() => {
    if (!key || !timestamp || Date.now() - timestamp > duration) return;
    setVisibleKey(key);
    const timer = window.setTimeout(() => setVisibleKey(undefined), Math.max(0, duration - (Date.now() - timestamp)));
    return () => window.clearTimeout(timer);
  }, [key, duration]);
  return key && key === visibleKey ? event : undefined;
}

export function WorldImpulseBanner({ impulse }: { impulse: ActiveWorldImpulse | undefined }) {
  const visible = useRecentEvent(impulse, IMPULSE_NOTICE_MS, true);
  if (!visible) return null;
  return <>
    <div className="world-impulse-flash" aria-hidden="true" />
    <aside className="world-impulse-banner" role="status" data-impulse={visible.id}>
      <div className="world-impulse-particles" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
      <i className="world-impulse-sigil" aria-hidden="true">✦</i>
      <small>WELTIMPULS</small>
      <strong>{visible.title}</strong>
      <span>{visible.effectSummary}</span>
      {visible.id === "worldwayDonation" && <div className="world-impulse-coins" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <i key={index}>●</i>)}</div>}
      {visible.resultDie !== undefined && <b className={`world-impulse-result ${visible.resultGold ? "is-win" : "is-empty"}`}><i aria-hidden="true">{["","⚀","⚁","⚂","⚃","⚄","⚅"][visible.resultDie]}</i>{visible.resultGold ? `+${visible.resultGold} GOLD` : "0 GOLD"}</b>}
    </aside>
  </>;
}

export function MomentumCelebrationBanner({ celebration, state }: { celebration: MomentumCelebration | undefined; state: GameState }) {
  const visible = useRecentEvent(celebration, CELEBRATION_NOTICE_MS);
  if (!visible) return null;
  const player = "playerId" in visible ? state.players.find(entry => entry.id === visible.playerId) : undefined;
  return <aside className={`momentum-celebration momentum-celebration--${visible.type}`} role="status">
    <i aria-hidden="true">✦</i><small>{visible.type === "completeGroup" ? player?.name : undefined}</small>
    <strong>{visible.title}</strong><span>{visible.subtitle}</span>
  </aside>;
}

export function MobileWorldImpulseToast({ impulse }: { impulse: ActiveWorldImpulse | undefined }) {
  const visible = useRecentEvent(impulse, 3_000);
  if (!visible) return null;
  return <aside className="mobile-world-impulse-toast" role="status">
    <small>WELTIMPULS</small><strong>{visible.title}</strong><span>{visible.effectSummary}</span>
  </aside>;
}

export function WorldImpulseDecisionPanel({ state, playerId, connected, onChoose, showActions = true }: {
  state: GameState;
  playerId: string;
  connected: boolean;
  onChoose: (choice: WorldImpulseChoice) => void;
  showActions?: boolean;
}) {
  const pending = state.pendingWorldImpulseDecision;
  if (!pending || pending.playerId !== playerId) return null;
  if (pending.impulseId === "twistOfFate") return <section className="controller-world-impulse-decision" aria-live="polite">
    <small>WELTIMPULS · SCHICKSALSWENDE</small>
    <h2>Den Wurf behalten?</h2>
    <p>Du darfst diesen normalen Wurf einmal vollständig ersetzen.</p>
    {showActions && <><button className="controller-primary-action" type="button" disabled={!connected} onClick={() => onChoose("keep")}>Wurf behalten</button>
    <button type="button" disabled={!connected} onClick={() => onChoose("reroll")}>Schicksal herausfordern</button></>}
  </section>;
  return <section className="controller-world-impulse-decision controller-world-impulse-decision--golden" aria-live="polite">
    <small>WELTIMPULS</small><h2>Goldener Augenblick</h2>
    {pending.status === "rolling" ? <><div className="golden-ritual" aria-hidden="true">✦</div><p>Das Schicksal entscheidet …</p></> : <>
      <p>50 Gold sicher nehmen oder das Schicksal herausfordern?</p>
      {showActions && <><button className="controller-primary-action" type="button" disabled={!connected} onClick={() => onChoose("safe")}>50 Gold sicher</button>
      <button type="button" disabled={!connected} onClick={() => onChoose("risk")}>Risiko: 0 / 75 / 150 Gold</button></>}
    </>}
  </section>;
}
