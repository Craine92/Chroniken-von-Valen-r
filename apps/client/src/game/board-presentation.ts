export type BoardPresentationMode = "gameplay" | "tabletop";

export const DEFAULT_BOARD_PRESENTATION_MODE: BoardPresentationMode = "gameplay";

export interface BoardVisualScale {
  effectiveBoardScale: number;
  visualTokenScale: number;
  buildingScale: number;
  markerScale: number;
  groupMarkerScale: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getBoardVisualScale(effectiveBoardScale: number, viewportWidth: number): BoardVisualScale {
  if (viewportWidth <= 720) {
    return {
      effectiveBoardScale,
      visualTokenScale: .92,
      buildingScale: .9,
      markerScale: .92,
      groupMarkerScale: .94
    };
  }

  return {
    effectiveBoardScale,
    visualTokenScale: clamp(1.16 - Math.max(0, effectiveBoardScale - 1) * .06, 1.1, 1.16),
    buildingScale: clamp(1.14 - Math.max(0, effectiveBoardScale - 1) * .06, 1.08, 1.14),
    markerScale: clamp(1.11 - Math.max(0, effectiveBoardScale - 1) * .035, 1.07, 1.11),
    groupMarkerScale: clamp(1.09 - Math.max(0, effectiveBoardScale - 1) * .03, 1.06, 1.09)
  };
}
