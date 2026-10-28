import Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../board-layout";
import { CAMERA_EASE, CAMERA_MAX_ZOOM, CAMERA_SHOTS, CAMERA_TIMING, CameraDirector, FOLLOW, GRAND_START, clampToBoard, followTarget, type CameraShotKind } from "./camera-director";

/**
 * Führt die Kamera des Bretts: kurze Fahrten auf große Momente, leichtes Mitgehen beim Ziehen und der Flug über die
 * vier Reiche zum Spielstart. Jede Fahrt endet in der Gesamtansicht und lässt sich jederzeit abbrechen.
 */
export class CameraRig {
  private readonly director: CameraDirector;
  private timers: Phaser.Time.TimerEvent[] = [];
  private mode: "overview" | "shot" | "follow" | "grandStart" = "overview";
  private grandStartDone: (() => void) | undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fitZoom: () => number,
    /** Bei „low“, reduzierter Bewegung oder ausgeschaltetem Schalter bleibt die Kamera stehen. */
    private readonly allowed: () => boolean
  ) {
    this.director = new CameraDirector(allowed);
  }

  get busy(): boolean {
    return this.mode !== "overview";
  }

  get currentMode() {
    return this.mode;
  }

  /** Kurze Fahrt auf einen Punkt der Welt; hält höchstens 0,9 s und kehrt zur Gesamtansicht zurück. */
  shot(kind: CameraShotKind, x: number, y: number): boolean {
    if (this.mode === "grandStart" || !this.director.request(kind, this.scene.time.now)) return false;
    this.clearTimers();
    this.mode = "shot";
    const zoom = Math.min(CAMERA_MAX_ZOOM, CAMERA_SHOTS[kind].zoom) * this.fitZoom();
    const camera = this.scene.cameras.main;
    const target = clampToBoard({ x, y }, zoom, { width: camera.width, height: camera.height }, { width: BOARD_WIDTH, height: BOARD_HEIGHT });
    this.moveTo(target.x, target.y, zoom, CAMERA_TIMING.inMs);
    this.mark(kind);
    this.after(CAMERA_TIMING.inMs + CAMERA_SHOTS[kind].holdMs, () => this.returnToOverview(CAMERA_TIMING.outMs));
    return true;
  }

  /** Beim Ziehen geht die Kamera leicht mit der Figur mit (höchstens ein Viertel des Weges, kaum Zoom). */
  follow(x: number, y: number, durationMs: number): void {
    if (!this.allowed() || this.mode === "shot" || this.mode === "grandStart") return;
    this.clearTimers();
    this.mode = "follow";
    const target = followTarget({ x, y });
    this.moveTo(target.x, target.y, this.fitZoom() * FOLLOW.zoom, Math.max(160, durationMs));
    this.mark("follow");
  }

  endFollow(): void {
    if (this.mode === "follow") this.returnToOverview(CAMERA_TIMING.outMs);
  }

  /** Flug über Elfen, Menschen, Orks und Steppe, dann zurück aufs ganze Brett. */
  grandStart(onDone?: () => void): boolean {
    if (!this.allowed()) return false;
    this.clearTimers();
    this.mode = "grandStart";
    this.grandStartDone = onDone;
    this.mark("grand-start");
    const zoom = GRAND_START.zoom * this.fitZoom();
    let at = 0;
    const camera = this.scene.cameras.main;
    GRAND_START.stops.forEach((stop, index) => {
      this.after(at, () => {
        const target = clampToBoard(stop, zoom, { width: camera.width, height: camera.height }, { width: BOARD_WIDTH, height: BOARD_HEIGHT });
        this.moveTo(target.x, target.y, zoom, GRAND_START.flyMs);
        this.scene.game.canvas.dataset.cameraRealm = stop.realm;
      });
      at += GRAND_START.flyMs + GRAND_START.holdMs;
      if (index === GRAND_START.stops.length - 1) this.after(at, () => this.returnToOverview(GRAND_START.returnMs));
    });
    return true;
  }

  /** Jemand handelt oder überspringt: sofort (0,25 s) zurück zur Gesamtansicht. */
  interrupt(): void {
    if (this.mode !== "overview") this.returnToOverview(CAMERA_TIMING.interruptMs);
  }

  /** Größenänderung des Fensters: ohne Fahrt in die Gesamtansicht. */
  reset(): void {
    this.clearTimers();
    this.finish();
  }

  destroy(): void {
    this.clearTimers();
  }

  private returnToOverview(durationMs: number): void {
    this.clearTimers();
    this.moveTo(0, 0, this.fitZoom(), durationMs);
    this.after(durationMs, () => this.finish());
  }

  private finish(): void {
    const camera = this.scene.cameras.main;
    camera.zoomEffect.reset();
    camera.panEffect.reset();
    camera.setZoom(this.fitZoom());
    camera.centerOn(0, 0);
    const wasGrandStart = this.mode === "grandStart";
    this.mode = "overview";
    this.director.release();
    this.mark("overview");
    if (wasGrandStart) { const done = this.grandStartDone; this.grandStartDone = undefined; done?.(); }
  }

  private moveTo(x: number, y: number, zoom: number, durationMs: number): void {
    const camera = this.scene.cameras.main;
    camera.pan(x, y, durationMs, CAMERA_EASE, true);
    camera.zoomTo(zoom, durationMs, CAMERA_EASE, true);
  }

  private after(delayMs: number, callback: () => void): void {
    this.timers.push(this.scene.time.delayedCall(delayMs, callback));
  }

  private clearTimers(): void {
    this.timers.forEach(timer => timer.remove(false));
    this.timers = [];
  }

  private mark(state: string): void {
    this.scene.game.canvas.dataset.camera = state;
  }
}
