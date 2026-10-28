/**
 * Regeln der Kamera: welche Fahrt darf jetzt, welche ist wichtiger, wie lange darf sie dauern.
 * Rein darstellend – die Kamera ändert nie den Spielstand.
 */

export type CameraShotKind = "dragon" | "build5" | "bankrupt" | "victory" | "highRent" | "groupComplete" | "auction";

/** Einheitliches Timing aller Fahrten (Regie-Konzept): hin, halten, zurück – zusammen höchstens 2 s. */
export const CAMERA_TIMING = { inMs: 500, maxHoldMs: 900, outMs: 600, interruptMs: 250, maxShotMs: 2_000 } as const;
export const CAMERA_EASE = "Sine.easeInOut";
/** Nie näher als so viel über der Gesamtansicht, damit man die Orientierung behält. */
export const CAMERA_MAX_ZOOM = 1.35;
/** Gleiche Art von Fahrt frühestens nach so langer Zeit erneut. */
export const CAMERA_KIND_COOLDOWN_MS = 30_000;

export interface CameraShotSpec { zoom: number; holdMs: number; priority: number; always: boolean }

/** Je größer `priority`, desto wichtiger. Drache, Stufe 5, Bankrott und Sieg dürfen immer. */
export const CAMERA_SHOTS: Readonly<Record<CameraShotKind, CameraShotSpec>> = {
  victory: { zoom: 1.2, holdMs: 900, priority: 7, always: true },
  bankrupt: { zoom: 1.2, holdMs: 900, priority: 6, always: true },
  dragon: { zoom: 1.3, holdMs: 700, priority: 5, always: true },
  build5: { zoom: 1.3, holdMs: 700, priority: 4, always: true },
  groupComplete: { zoom: 1.2, holdMs: 700, priority: 3, always: false },
  highRent: { zoom: 1.25, holdMs: 500, priority: 2, always: false },
  auction: { zoom: 1.2, holdMs: 300, priority: 1, always: false }
};

export function shotDurationMs(kind: CameraShotKind): number {
  return CAMERA_TIMING.inMs + CAMERA_SHOTS[kind].holdMs + CAMERA_TIMING.outMs;
}

/** Entscheidet über Fahrten: Schalter, Abklingzeit je Art und Vorrang des Wichtigeren. */
export class CameraDirector {
  private readonly lastShotAt = new Map<CameraShotKind, number>();
  private current: { kind: CameraShotKind; endsAt: number } | undefined;

  constructor(private enabled: () => boolean) {}

  /** Darf diese Fahrt jetzt starten? Bei Ja wird sie als laufend vermerkt. */
  request(kind: CameraShotKind, now: number): boolean {
    if (!this.enabled()) return false;
    const spec = CAMERA_SHOTS[kind];
    if (!spec.always && now - (this.lastShotAt.get(kind) ?? -Infinity) < CAMERA_KIND_COOLDOWN_MS) return false;
    if (this.current && this.current.endsAt > now && CAMERA_SHOTS[this.current.kind].priority >= spec.priority) return false;
    this.lastShotAt.set(kind, now);
    this.current = { kind, endsAt: now + shotDurationMs(kind) };
    return true;
  }

  /** Ein Spieler handelt oder die Fahrt ist vorbei: nichts läuft mehr. */
  release(): void {
    this.current = undefined;
  }

  get active(): CameraShotKind | undefined {
    return this.current?.kind;
  }
}

const STORAGE_KEY = "valenor:camera-moves";
export const CAMERA_SETTING_EVENT = "valenor:camera-moves-changed";

/** Schalter „Kamerafahrten an/aus“ in den TV-Einstellungen; ohne Speicher gilt „an“. */
export function getCameraMovesEnabled(): boolean {
  try { return window.localStorage.getItem(STORAGE_KEY) !== "off"; } catch { return true; }
}

export function setCameraMovesEnabled(enabled: boolean): void {
  try { window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off"); } catch { /* Nur Komfort. */ }
  window.dispatchEvent(new CustomEvent(CAMERA_SETTING_EVENT, { detail: enabled }));
}

/** Seitenblick beim Ziehen: höchstens so viel Versatz zur Figur und so viel Zoom – damit niemandem schlecht wird. */
export const FOLLOW = { share: .25, zoom: 1.08 } as const;

export function followTarget(token: { x: number; y: number }): { x: number; y: number } {
  return { x: token.x * FOLLOW.share, y: token.y * FOLLOW.share };
}

/**
 * Kurze Fahrten bleiben im Brett: Die Kamera rückt nur so weit Richtung Ziel, dass der Bildrand nie über den Brettrand
 * hinausschaut (kein leerer Tisch im Bild). Liegt das Ziel am Rand, steht es dann eben etwas außerhalb der Bildmitte.
 */
export function clampToBoard(point: { x: number; y: number }, zoom: number, view: { width: number; height: number }, board: { width: number; height: number }): { x: number; y: number } {
  const room = (boardSize: number, viewSize: number) => Math.max(0, boardSize / 2 - viewSize / (2 * zoom));
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value)) + 0; // + 0: aus -0 wird 0
  return { x: clamp(point.x, room(board.width, view.width)), y: clamp(point.y, room(board.height, view.height)) };
}

/** Wo das Geschehen auf dem Bildschirm liegt: Meldungen weichen ihm aus (unten → Banner oben). */
export type FocusZone = "upper" | "lower";

/** Bildschirmhöhe eines Weltpunkts bei gegebener Kameramitte und Zoom; unterhalb von 55 % gilt er als „unten“. */
export function getFocusZone(worldY: number, cameraCenterY: number, zoom: number, viewHeight: number): FocusZone {
  const screenY = (worldY - cameraCenterY) * zoom + viewHeight / 2;
  return screenY > viewHeight * .55 ? "lower" : "upper";
}

/** Großer Spielstart: Flug über die vier Reiche (Mittelpunkte der Viertel im Brettinneren), dann zurück. */
export const GRAND_START = {
  stops: [{ realm: "elves", x: -330, y: 155 }, { realm: "humans", x: -330, y: -155 }, { realm: "orcs", x: 330, y: -155 }, { realm: "steppe", x: 330, y: 155 }],
  // Wie die kurzen Fahrten bleibt der Flug im Brett (clampToBoard); der stärkste erlaubte Zoom gibt ihm genug Weg.
  zoom: CAMERA_MAX_ZOOM, flyMs: 700, holdMs: 600, returnMs: 900
} as const;

export function grandStartDurationMs(): number {
  return GRAND_START.stops.length * (GRAND_START.flyMs + GRAND_START.holdMs) + GRAND_START.returnMs;
}
