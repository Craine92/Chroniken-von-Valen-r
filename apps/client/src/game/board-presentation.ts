import type { GameState } from "@valenor/shared";
import { BOARD_HEIGHT, getBoardFitZoom } from "./board-layout";

export type BoardPresentationMode = "gameplay" | "tabletop";

export const DEFAULT_BOARD_PRESENTATION_MODE: BoardPresentationMode = "gameplay";

export const CARD_DRAW_DURATION_MS = 760;
export const DICE_SETTLE_DURATION_MS = 1_500;
export const LANDING_CONNECTION_DURATION_MS = 1_800;

export function getCardPresentationKey(state: GameState): string {
  const card = state.activeCard;
  return card ? `${state.turnNumber}:${card.playerId}:${card.deck}:${card.cardId}:${state.decks?.[card.deck].drawCount ?? 0}` : "";
}

export function getBoardScreenLayout(width: number, height: number) {
  const zoom = getBoardFitZoom(width, height);
  return { zoom, topSpace: Math.max(0, (height - (BOARD_HEIGHT + 40) * zoom) / 2),
    deckX: 390 * zoom, deckY: 78 * zoom,
    cardScale: 112 * zoom / Math.max(1, Math.min(520, (height - 112) * .7115, width - 48)) };
}

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
    visualTokenScale: clamp(1.16 - Math.max(0, effectiveBoardScale - 1) * .06, 1.1, 1.16) * 1.06,
    buildingScale: clamp(1.14 - Math.max(0, effectiveBoardScale - 1) * .06, 1.08, 1.14),
    markerScale: clamp(1.11 - Math.max(0, effectiveBoardScale - 1) * .035, 1.07, 1.11),
    groupMarkerScale: clamp(1.09 - Math.max(0, effectiveBoardScale - 1) * .03, 1.06, 1.09)
  };
}
