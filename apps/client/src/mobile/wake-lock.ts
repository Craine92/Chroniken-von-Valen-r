import { useEffect, useState } from "react";

/** Der Teil der Wake Lock API, den wir brauchen; fehlt sie, bleibt alles wie bisher. */
export interface WakeLockSentinelLike {
  released?: boolean;
  release(): Promise<void>;
}
export interface WakeLockApi {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}
export interface VisibilitySource {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/**
 * Hält den Bildschirm des Handys wach, solange man im Spiel ist. Der Browser gibt die Sperre frei, sobald die Seite
 * im Hintergrund ist; kommt sie zurück, wird sie neu angefordert. Ohne API oder bei Ablehnung passiert nichts.
 */
export class ScreenWakeLock {
  private active = false;
  private sentinel: WakeLockSentinelLike | undefined;
  private requesting = false;

  constructor(private readonly api: WakeLockApi | undefined, private readonly visibility: VisibilitySource | undefined) {
    this.visibility?.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  get supported(): boolean {
    return Boolean(this.api);
  }

  get held(): boolean {
    return Boolean(this.sentinel && !this.sentinel.released);
  }

  async setActive(active: boolean): Promise<void> {
    this.active = active;
    if (active) await this.acquire();
    else await this.release();
  }

  dispose(): void {
    this.visibility?.removeEventListener("visibilitychange", this.onVisibilityChange);
    void this.setActive(false);
  }

  private readonly onVisibilityChange = () => {
    if (this.active && this.visibility?.visibilityState === "visible") void this.acquire();
  };

  private async acquire(): Promise<void> {
    if (!this.api || this.held || this.requesting || this.visibility?.visibilityState === "hidden") return;
    this.requesting = true;
    try {
      const sentinel = await this.api.request("screen");
      // Wurde das Spiel inzwischen verlassen, die Sperre gleich wieder freigeben.
      if (!this.active) await sentinel.release().catch(() => undefined);
      else this.sentinel = sentinel;
    } catch {
      // Energiesparmodus oder fehlende Berechtigung: Das Handy darf dann wie gewohnt einschlafen.
    } finally {
      this.requesting = false;
    }
  }

  private async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = undefined;
    await sentinel?.release().catch(() => undefined);
  }
}

/** Bildschirm wach halten, solange `active` gilt. */
export function useScreenWakeLock(active: boolean): void {
  const [lock] = useState(() => typeof navigator === "undefined" || typeof document === "undefined"
    ? new ScreenWakeLock(undefined, undefined)
    : new ScreenWakeLock((navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock, document));
  useEffect(() => { void lock.setActive(active); }, [active, lock]);
  useEffect(() => () => lock.dispose(), [lock]);
}
