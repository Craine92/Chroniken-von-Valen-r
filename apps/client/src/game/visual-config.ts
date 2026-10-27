export type GraphicsQuality = "high" | "medium" | "low";

export interface VisualQualitySettings {
  ambientMotes: number;
  realmDetails: number;
  glowAlpha: number;
  animateAmbient: boolean;
}

export const VISUAL_QUALITY: Record<GraphicsQuality, VisualQualitySettings> = {
  high: { ambientMotes: 30, realmDetails: 1, glowAlpha: 1, animateAmbient: true },
  medium: { ambientMotes: 18, realmDetails: 0.72, glowAlpha: 0.72, animateAmbient: true },
  low: { ambientMotes: 8, realmDetails: 0.45, glowAlpha: 0.45, animateAmbient: false }
};

export const DEFAULT_GRAPHICS_QUALITY: GraphicsQuality = "high";
export const GRAPHICS_QUALITY_STORAGE_KEY = "valenor:graphics-quality";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return value === "high" || value === "medium" || value === "low";
}

/** `?quality=low` in der Adresse gewinnt vor dem gespeicherten Wert; ohne beides gilt „high“. */
export function resolveGraphicsQuality(search: string, stored: string | null | undefined): GraphicsQuality {
  const requested = new URLSearchParams(search).get("quality");
  if (isGraphicsQuality(requested)) return requested;
  return isGraphicsQuality(stored) ? stored : DEFAULT_GRAPHICS_QUALITY;
}

/** Liest die Stufe im Browser und merkt sich eine per Adresse gewählte Stufe für den nächsten Start. */
export function getGraphicsQuality(): GraphicsQuality {
  if (typeof window === "undefined") return DEFAULT_GRAPHICS_QUALITY;
  let stored: string | null = null;
  try { stored = window.localStorage.getItem(GRAPHICS_QUALITY_STORAGE_KEY); } catch { /* Speicher gesperrt: Standard nutzen. */ }
  const quality = resolveGraphicsQuality(window.location?.search ?? "", stored);
  if (quality !== stored && new URLSearchParams(window.location?.search ?? "").has("quality")) {
    try { window.localStorage.setItem(GRAPHICS_QUALITY_STORAGE_KEY, quality); } catch { /* Nur Komfort. */ }
  }
  return quality;
}

/** Dezente Lebenszeichen je Reich. Anzahl gleichzeitig sichtbarer Objekte. */
export interface AmbientLifeBudget {
  smoke: number;
  embers: number;
  fireflies: number;
  cloudShadows: number;
  birds: boolean;
}

export interface LivingBoardSettings {
  ambient: AmbientLifeBudget;
  /** Hüpfer beim Landen, Jubelsprung beim Kauf. */
  tokenReactions: boolean;
  /** „full“: Licht, Abdunkeln und Bewegung; „calm“: nur ein kurzer Farbakzent ohne Bewegung. */
  drama: "full" | "calm";
}

const NO_AMBIENT: AmbientLifeBudget = { smoke: 0, embers: 0, fireflies: 0, cloudShadows: 0, birds: false };

/** Was das lebendige Brett je Qualitätsstufe zeigt. Reduzierte Bewegung schaltet alles Bewegte ab. */
export function getLivingBoardSettings(quality: GraphicsQuality, reducedMotion: boolean): LivingBoardSettings {
  if (reducedMotion || quality === "low") return { ambient: NO_AMBIENT, tokenReactions: false, drama: "calm" };
  if (quality === "medium") return { ambient: { smoke: 3, embers: 5, fireflies: 7, cloudShadows: 1, birds: false }, tokenReactions: true, drama: "full" };
  return { ambient: { smoke: 6, embers: 10, fireflies: 14, cloudShadows: 2, birds: true }, tokenReactions: true, drama: "full" };
}
