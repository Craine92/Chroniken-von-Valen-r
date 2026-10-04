import { randomUUID } from "node:crypto";
import type { GameState, QuickGameClock } from "@valenor/shared";

const MINUTE_MS = 60_000;

export interface TimeSource {
  now(): number;
}

export class SystemTimeSource implements TimeSource {
  now(): number {
    return Date.now();
  }
}

export class FakeTimeSource implements TimeSource {
  constructor(private currentTime = 0) {}

  now(): number {
    return this.currentTime;
  }

  advance(milliseconds: number): void {
    this.currentTime += milliseconds;
  }

  set(time: number): void {
    this.currentTime = time;
  }
}

export class QuickGameClockService {
  constructor(private readonly time: TimeSource = new SystemTimeSource()) {}

  start(state: GameState): boolean {
    if (
      state.config.mode !== "quick"
      || state.quickGameClock
      || state.status !== "playing"
      || state.turnPhase !== "waitingForRoll"
      || state.currentRound !== 1
    ) return false;

    const durationMinutes = state.config.quickGameDurationMinutes;
    if (!durationMinutes) throw new Error("Für das schnelle Spiel fehlt die Spieldauer.");
    const now = this.time.now();
    state.quickGameClock = {
      durationMs: durationMinutes * MINUTE_MS,
      startedAt: now,
      totalPausedMs: 0,
      expired: false,
      serverNow: now,
      remainingMs: durationMinutes * MINUTE_MS
    };
    this.log(state, `Die Sanduhr über ${durationMinutes} Minuten beginnt zu laufen.`);
    return true;
  }

  sync(state: GameState): boolean {
    const clock = state.quickGameClock;
    if (!clock) return false;
    const now = this.time.now();
    clock.serverNow = now;
    clock.remainingMs = this.remaining(clock, now);
    if (clock.remainingMs > 0 || clock.expired) return false;

    clock.expired = true;
    clock.expiredAt = now;
    const roundAlreadyCompleted = state.turnPhase === "turnTransition"
      && state.currentTurnIndex === 0
      && state.currentRound > 1;
    clock.finishAfterRound = roundAlreadyCompleted ? state.currentRound - 1 : state.currentRound;
    this.log(state, `Die Zeit ist abgelaufen. Runde ${clock.finishAfterRound} wird vollständig beendet.`);
    return true;
  }

  pause(state: GameState): boolean {
    const clock = state.quickGameClock;
    if (!clock || clock.expired || clock.pausedAt !== undefined || clock.stoppedAt !== undefined) return false;
    this.sync(state);
    if (clock.expired) return false;
    clock.pausedAt = this.time.now();
    this.sync(state);
    this.log(state, "Die Sanduhr wartet auf die Rückkehr eines Gefährten.");
    return true;
  }

  resume(state: GameState): boolean {
    const clock = state.quickGameClock;
    if (!clock || clock.expired || clock.pausedAt === undefined || clock.stoppedAt !== undefined) return false;
    const now = this.time.now();
    clock.totalPausedMs += Math.max(0, now - clock.pausedAt);
    delete clock.pausedAt;
    this.sync(state);
    this.log(state, "Alle Gefährten sind zurück. Die Sanduhr läuft weiter.");
    return true;
  }

  stop(state: GameState): void {
    const clock = state.quickGameClock;
    if (!clock || clock.stoppedAt !== undefined) return;
    clock.stoppedAt = this.time.now();
    this.sync(state);
  }

  remaining(clock: QuickGameClock, now = this.time.now()): number {
    const effectiveNow = clock.stoppedAt ?? clock.pausedAt ?? now;
    const elapsed = Math.max(0, effectiveNow - clock.startedAt - clock.totalPausedMs);
    return Math.max(0, clock.durationMs - elapsed);
  }

  elapsed(state: GameState): number | undefined {
    const clock = state.quickGameClock;
    if (!clock) return undefined;
    const effectiveNow = clock.stoppedAt ?? clock.pausedAt ?? this.time.now();
    return Math.max(0, effectiveNow - clock.startedAt - clock.totalPausedMs);
  }

  now(): number {
    return this.time.now();
  }

  private log(state: GameState, message: string): void {
    state.economyLog.push({
      id: randomUUID(), kind: "system", message, playerIds: [], createdAt: this.time.now()
    });
    state.economyLog = state.economyLog.slice(-12);
  }
}
