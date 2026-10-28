import type { GraphicsQuality } from "../visual-config";

/**
 * Stimmung des Bretts: Chronik-Ereignisse färben das Licht, Tageszeiten wandern mit den Runden.
 * Alles bleibt dezent – die Felder müssen immer gut lesbar sein.
 */

export type TimeOfDay = "morning" | "day" | "evening" | "night";

export interface Mood {
  /** Farbschleier über dem Brett. */
  tint: number;
  /** Deckkraft des Schleiers; höchstens MAX_TINT_ALPHA. */
  tintAlpha: number;
  /** „multiply“ dunkelt und färbt, „screen“ hellt warm auf. */
  blend: "multiply" | "screen";
  /** Farbsättigung: −1 grau … 0 unverändert … +1 kräftig. */
  saturation: number;
  /** Helligkeit: 1 unverändert. */
  brightness: number;
  /** Stärke des dunklen Bildrands (0 … 1). */
  vignette: number;
  /** Mond am Himmel (Blutmond rot, nachts blass). */
  moon?: number | undefined;
  /** Funkelnde Lichtpunkte (Fest, Konjunktur). */
  sparkles?: number | undefined;
  /** Gebäude glühen warm (Baumeister, Konjunktur). */
  buildingGlow?: number | undefined;
}

/** Kräftigster Schleier im Inneren der Reiche. */
export const MAX_TINT_ALPHA = .34;
/** Über dem Feldring wirkt der Schleier nur halb so stark: Namen und Preise bleiben so lesbar wie ohne Ereignis-Stimmung. */
export const FIELD_RING_FACTOR = .5;
/** Höchstens so viel Schleier liegt über den Feldern. */
export const MAX_FIELD_TINT_ALPHA = .18;
/** Weicher Übergang zwischen Stimmungen; auf „low“ und bei reduzierter Bewegung kurz und ruhig. */
export const MOOD_TRANSITION_MS = { full: 1_500, calm: 200 } as const;
/** Zwei Runden je Tageszeit: Morgen, Tag, Abend, Nacht – ein Umlauf dauert acht Runden. */
export const ROUNDS_PER_DAYTIME = 2;

const NEUTRAL: Mood = { tint: 0xffffff, tintAlpha: 0, blend: "multiply", saturation: 0, brightness: 1, vignette: .25 };

export const CHRONICLE_MOODS: Readonly<Record<string, Mood>> = {
  // Etwa doppelt so deutlich wie die erste Fassung; über den Feldern wirkt der Schleier nur halb (FIELD_RING_FACTOR).
  "blood-moon": { tint: 0xc0242c, tintAlpha: .32, blend: "multiply", saturation: -.1, brightness: .9, vignette: .66, moon: 0xd8352c },
  "four-realms-peace": { tint: 0xffcf6e, tintAlpha: .24, blend: "screen", saturation: .16, brightness: 1.07, vignette: .26 },
  "traders-festival": { tint: 0xffb347, tintAlpha: .22, blend: "screen", saturation: .24, brightness: 1.05, vignette: .3, sparkles: 0xffd77a },
  "runegate-blessing": { tint: 0x5aa8ff, tintAlpha: .22, blend: "screen", saturation: .08, brightness: 1.04, vignette: .34, sparkles: 0x9fd2ff },
  "builders-blessing": { tint: 0xffe08a, tintAlpha: .2, blend: "screen", saturation: .12, brightness: 1.05, vignette: .3, buildingGlow: 0xffd27a },
  "resource-shortage": { tint: 0x7d8b96, tintAlpha: .28, blend: "multiply", saturation: -.6, brightness: .9, vignette: .58 },
  "crown-decree": { tint: 0x8c8466, tintAlpha: .26, blend: "multiply", saturation: -.24, brightness: .92, vignette: .52 },
  "golden-building-boom": { tint: 0xffc23a, tintAlpha: .24, blend: "screen", saturation: .3, brightness: 1.07, vignette: .26, sparkles: 0xffe08a, buildingGlow: 0xffc85a }
};

export const DAYTIME_MOODS: Readonly<Record<TimeOfDay, Mood>> = {
  morning: { tint: 0xffc6a0, tintAlpha: .07, blend: "screen", saturation: .02, brightness: 1.02, vignette: .22 },
  day: NEUTRAL,
  evening: { tint: 0xd9783a, tintAlpha: .1, blend: "multiply", saturation: .04, brightness: .97, vignette: .32 },
  night: { tint: 0x23356e, tintAlpha: .16, blend: "multiply", saturation: -.12, brightness: .92, vignette: .45, moon: 0xdfe6ff }
};

export function getTimeOfDay(round: number): TimeOfDay {
  const phases: readonly TimeOfDay[] = ["morning", "day", "evening", "night"];
  return phases[Math.floor(Math.max(0, round - 1) / ROUNDS_PER_DAYTIME) % phases.length]!;
}

export interface Atmosphere {
  mood: Mood;
  timeOfDay: TimeOfDay;
  /** Nachts (und abends schwach) leuchten Fenster und Fackeln der Gebäude. */
  windowLights: number;
  /** Weiches Glühen an Lichtquellen (nur „high“); kein bildschirmweiter Bloom, der kostet zu viel Bildrate. */
  bloom: boolean;
  vignette: boolean;
  colorGrading: boolean;
  transitionMs: number;
  key: string;
}

/**
 * Was das Brett gerade zeigt. Ein Chronik-Ereignis bestimmt die Stimmung; die Tageszeit klingt darunter mit.
 * „high“: Bloom, Vignette, Farbstimmung. „medium“: ohne Bloom. „low“ und reduzierte Bewegung: nur ruhiger Schleier.
 */
export function getAtmosphere(round: number, chronicleEventId: string | undefined, quality: GraphicsQuality, reducedMotion: boolean): Atmosphere {
  const timeOfDay = getTimeOfDay(round);
  const daytime = DAYTIME_MOODS[timeOfDay];
  const chronicle = chronicleEventId ? CHRONICLE_MOODS[chronicleEventId] : undefined;
  const base = chronicle ?? daytime;
  // Nachts bleibt auch eine Ereignis-Stimmung etwas dunkler, der Mond bleibt sichtbar.
  const mood: Mood = chronicle && timeOfDay === "night"
    ? { ...chronicle, brightness: Math.min(chronicle.brightness, .95), moon: chronicle.moon ?? daytime.moon, vignette: Math.max(chronicle.vignette, .4) }
    : base;
  const calm = quality === "low" || reducedMotion;
  return {
    mood: { ...mood, tintAlpha: Math.min(MAX_TINT_ALPHA, mood.tintAlpha) },
    timeOfDay,
    windowLights: timeOfDay === "night" ? 1 : timeOfDay === "evening" ? .45 : 0,
    bloom: quality === "high" && !reducedMotion,
    vignette: quality !== "low",
    colorGrading: quality !== "low",
    transitionMs: calm ? MOOD_TRANSITION_MS.calm : MOOD_TRANSITION_MS.full,
    key: `${chronicleEventId ?? "none"}:${timeOfDay}`
  };
}

/** Farbmischung für weiche Übergänge (0 → a, 1 → b). */
export function mixColor(a: number, b: number, t: number): number {
  const mix = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
