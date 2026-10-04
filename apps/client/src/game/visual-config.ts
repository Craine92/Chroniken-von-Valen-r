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

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
