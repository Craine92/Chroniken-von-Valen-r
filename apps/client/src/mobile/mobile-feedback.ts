import { audioManager, type AudioSettings } from "../audio/AudioManager";
import type { AudioEvent } from "../audio/audio-config";

export type MobileFeedbackType = "turn" | "tradeOffer" | "tradeAccepted" | "tradeRejected" | "purchase" | "build" | "coin" | "adventure" | "fate" | "double";
export interface MobileFeedback {
  id: string;
  type: MobileFeedbackType;
  title: string;
  message: string;
  sound?: AudioEvent;
  hapticPattern?: number | number[] | undefined;
  duration?: number;
  accent?: string | undefined;
  icon?: string;
  actionLabel?: string;
  action?: () => void;
}

export function openControllerTrade(): void {
  window.location.hash = "#controller-trade";
  window.scrollTo({ top: 0, behavior: "auto" });
}

export function playMobileFeedback(
  feedback: MobileFeedback,
  manager: Pick<typeof audioManager, "getSettings" | "play"> = audioManager,
  device: Pick<Navigator, "vibrate"> | undefined = typeof navigator === "undefined" ? undefined : navigator
): void {
  const settings: AudioSettings = manager.getSettings();
  if (feedback.sound && settings.sfxEnabled && !settings.masterMuted) {
    try { manager.play(feedback.sound); } catch { /* Visual feedback still works without audio. */ }
  }
  if (feedback.hapticPattern && settings.hapticsEnabled && device && "vibrate" in device && typeof device.vibrate === "function") {
    try { device.vibrate(feedback.hapticPattern); } catch { /* Optional browser enhancement. */ }
  }
}

export const TOAST_FADE_MS = 220;
const MAX_PENDING = 6;
export interface FeedbackSnapshot { current?: MobileFeedback | undefined; exiting: boolean }
interface FeedbackClock {
  setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
}

// One visible toast. Effects run when that toast is presented, once per event ID.
export class MobileFeedbackQueue {
  private snapshot: FeedbackSnapshot = { exiting: false };
  private pending: MobileFeedback[] = [];
  private seen = new Set<string>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private effect: (feedback: MobileFeedback) => void = playMobileFeedback,
    private clock: FeedbackClock = {
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (timer) => clearTimeout(timer)
    }
  ) {}

  getSnapshot = (): FeedbackSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  showMobileFeedback(feedback: MobileFeedback): void {
    if (this.seen.has(feedback.id)) return;
    this.seen.add(feedback.id);
    if (feedback.type === "tradeOffer") this.pending.unshift(feedback);
    else this.pending.push(feedback);
    // Preserve urgent offers when a burst of low-priority events arrives.
    if (this.pending.length > MAX_PENDING) {
      let disposable = this.pending.length - 1;
      while (disposable >= 0 && this.pending[disposable]?.type === "tradeOffer") disposable -= 1;
      this.pending.splice(disposable < 0 ? this.pending.length - 1 : disposable, 1);
    }
    if (!this.snapshot.current) this.next();
    else if (feedback.type === "tradeOffer" && this.snapshot.current.type !== "tradeOffer") this.dismiss();
  }

  dismiss = (): void => {
    if (!this.snapshot.current || this.snapshot.exiting) return;
    this.stopTimer();
    this.publish({ ...this.snapshot, exiting: true });
    this.timer = this.clock.setTimeout(() => this.next(), TOAST_FADE_MS);
  };

  clear(): void {
    this.stopTimer();
    this.pending = [];
    this.seen.clear();
    this.publish({ exiting: false });
  }

  private next(): void {
    this.stopTimer();
    const current = this.pending.shift();
    this.publish({ current, exiting: false });
    if (!current) return;
    this.effect(current);
    this.timer = this.clock.setTimeout(this.dismiss, current.duration ?? (current.action ? 6000 : 3500));
  }

  private stopTimer(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }
  private publish(snapshot: FeedbackSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}
