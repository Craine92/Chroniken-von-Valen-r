export const BOARD_WIDTH = 1_700;
export const BOARD_HEIGHT = 960;
export const BOARD_HALF_WIDTH = BOARD_WIDTH / 2;
export const BOARD_HALF_HEIGHT = BOARD_HEIGHT / 2;
export const BOARD_CORNER_WIDTH = 160;
export const BOARD_CORNER_HEIGHT = 135;
export const BOARD_HORIZONTAL_FIELD_DEPTH = 135;
export const BOARD_SIDE_FIELD_DEPTH = 135;
export const BOARD_HORIZONTAL_FIELD_COUNT = 12;
export const BOARD_VERTICAL_FIELD_COUNT = 6;
export const BOARD_HORIZONTAL_CELL_WIDTH = (BOARD_WIDTH - BOARD_CORNER_WIDTH * 2) / BOARD_HORIZONTAL_FIELD_COUNT;
export const BOARD_VERTICAL_CELL_HEIGHT = (BOARD_HEIGHT - BOARD_CORNER_HEIGHT * 2) / BOARD_VERTICAL_FIELD_COUNT;
export const BOARD_INNER_WIDTH = BOARD_WIDTH - BOARD_SIDE_FIELD_DEPTH * 2;
export const BOARD_INNER_HEIGHT = BOARD_HEIGHT - BOARD_HORIZONTAL_FIELD_DEPTH * 2;
export const BOARD_INNER_HALF_WIDTH = BOARD_INNER_WIDTH / 2;
export const BOARD_INNER_HALF_HEIGHT = BOARD_INNER_HEIGHT / 2;

// Compatibility aliases for presentation code that only needs one scalar.
export const BOARD_CELL_SIZE = BOARD_HORIZONTAL_CELL_WIDTH;
export const BOARD_CORNER_SIZE = BOARD_CORNER_WIDTH;
export const BOARD_SIZE = BOARD_WIDTH;
export const BOARD_HALF = BOARD_HALF_WIDTH;
export const BOARD_CAMERA_PADDING = { horizontal: 40, vertical: 40 } as const;

export function getBoardFitZoom(viewportWidth: number, viewportHeight: number): number {
  return Math.min(
    viewportWidth / (BOARD_WIDTH + BOARD_CAMERA_PADDING.horizontal),
    viewportHeight / (BOARD_HEIGHT + BOARD_CAMERA_PADDING.vertical)
  );
}

export type BoardSide = "bottom" | "left" | "top" | "right" | "corner";
const TOKEN_INNER_CLEARANCE = 86;

export interface TilePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  side: BoardSide;
}

export function getTilePlacement(index: number): TilePlacement {
  const normalized = ((index % 40) + 40) % 40;
  const horizontalCell = BOARD_HORIZONTAL_CELL_WIDTH;
  const verticalCell = BOARD_VERTICAL_CELL_HEIGHT;
  const halfWidth = BOARD_HALF_WIDTH;
  const halfHeight = BOARD_HALF_HEIGHT;
  const cornerWidth = BOARD_CORNER_WIDTH;
  const cornerHeight = BOARD_CORNER_HEIGHT;

  if (normalized === 0) return { x: halfWidth - cornerWidth / 2, y: halfHeight - cornerHeight / 2, width: cornerWidth, height: cornerHeight, rotation: 0, side: "corner" };
  if (normalized < 13) return { x: halfWidth - cornerWidth - (normalized - 1) * horizontalCell - horizontalCell / 2, y: halfHeight - BOARD_HORIZONTAL_FIELD_DEPTH / 2, width: horizontalCell, height: BOARD_HORIZONTAL_FIELD_DEPTH, rotation: 0, side: "bottom" };
  if (normalized === 13) return { x: -halfWidth + cornerWidth / 2, y: halfHeight - cornerHeight / 2, width: cornerWidth, height: cornerHeight, rotation: 0, side: "corner" };
  if (normalized < 20) return { x: -halfWidth + BOARD_SIDE_FIELD_DEPTH / 2, y: halfHeight - cornerHeight - (normalized - 14) * verticalCell - verticalCell / 2, width: BOARD_SIDE_FIELD_DEPTH, height: verticalCell, rotation: 0, side: "left" };
  if (normalized === 20) return { x: -halfWidth + cornerWidth / 2, y: -halfHeight + cornerHeight / 2, width: cornerWidth, height: cornerHeight, rotation: 0, side: "corner" };
  if (normalized < 33) return { x: -halfWidth + cornerWidth + (normalized - 21) * horizontalCell + horizontalCell / 2, y: -halfHeight + BOARD_HORIZONTAL_FIELD_DEPTH / 2, width: horizontalCell, height: BOARD_HORIZONTAL_FIELD_DEPTH, rotation: 0, side: "top" };
  if (normalized === 33) return { x: halfWidth - cornerWidth / 2, y: -halfHeight + cornerHeight / 2, width: cornerWidth, height: cornerHeight, rotation: 0, side: "corner" };
  return { x: halfWidth - BOARD_SIDE_FIELD_DEPTH / 2, y: -halfHeight + cornerHeight + (normalized - 34) * verticalCell + verticalCell / 2, width: BOARD_SIDE_FIELD_DEPTH, height: verticalCell, rotation: 0, side: "right" };
}

export function getTileWorldPosition(index: number) {
  const { x, y } = getTilePlacement(index);
  return { x, y };
}

const FORMATIONS = {
  1: [{ x: 0, y: 0 }],
  2: [{ x: -23, y: 0 }, { x: 23, y: 0 }],
  3: [{ x: 0, y: -20 }, { x: -24, y: 19 }, { x: 24, y: 19 }],
  4: [{ x: -23, y: -19 }, { x: 23, y: -19 }, { x: -23, y: 19 }, { x: 23, y: 19 }]
} as const;

export function getTokenFormationOffset(count: number, index: number) {
  const formation = FORMATIONS[Math.min(4, Math.max(1, count)) as keyof typeof FORMATIONS];
  return formation[index] ?? { x: 0, y: 0 };
}

/** Fixed slots outside the information area, rotated toward the inner board. */
export function getTokenSlotOffset(tileIndex: number, count: number, index: number) {
  const normalized = ((tileIndex % 40) + 40) % 40;
  const place = getTilePlacement(normalized);
  if (place.side === "corner") {
    const sx = normalized === 0 || normalized === 33 ? -1 : 1;
    const sy = normalized === 0 || normalized === 13 ? -1 : 1;
    const baseX = place.width / 2 + TOKEN_INNER_CLEARANCE;
    const baseY = place.height / 2 + TOKEN_INNER_CLEARANCE;
    const slots = [{ x: 0, y: 0 }, { x: 58, y: 0 }, { x: 0, y: 58 }, { x: 58, y: 58 }];
    const slot = slots[index] ?? slots[0]!;
    return { x: sx * (baseX + slot.x), y: sy * (baseY + slot.y) };
  }
  const horizontal = place.side === "bottom" || place.side === "top";
  const tangent = horizontal ? Math.min(36, place.width * .25) : Math.min(22, place.height * .3);
  const radial = 58;
  const slots = count <= 1
    ? [{ tangent: 0, inward: 0 }]
    : count === 2
      ? [{ tangent: -tangent, inward: 0 }, { tangent, inward: 0 }]
      : count === 3
        ? [{ tangent: -tangent, inward: 0 }, { tangent, inward: 0 }, { tangent: 0, inward: radial }]
        : [{ tangent: -tangent, inward: 0 }, { tangent, inward: 0 }, { tangent: -tangent, inward: radial }, { tangent, inward: radial }];
  const slot = slots[index] ?? slots[0]!;
  const base = (horizontal ? place.height : place.width) / 2 + TOKEN_INNER_CLEARANCE;
  if (place.side === "bottom") return { x: slot.tangent, y: -base - slot.inward };
  if (place.side === "left") return { x: base + slot.inward, y: slot.tangent };
  if (place.side === "top") return { x: slot.tangent, y: base + slot.inward };
  return { x: -base - slot.inward, y: slot.tangent };
}

export function getInnerEdgeOffset(tileIndex: number, extra = 12) {
  const place = getTilePlacement(tileIndex);
  if (place.side === "corner") {
    const normalized = ((tileIndex % 40) + 40) % 40;
    return {
      x: (normalized === 0 || normalized === 33 ? -1 : 1) * (place.width / 2 + extra),
      y: (normalized === 0 || normalized === 13 ? -1 : 1) * (place.height / 2 + extra)
    };
  }
  if (place.side === "bottom") return { x: 0, y: -place.height / 2 - extra };
  if (place.side === "left") return { x: place.width / 2 + extra, y: 0 };
  if (place.side === "top") return { x: 0, y: place.height / 2 + extra };
  return { x: -place.width / 2 - extra, y: 0 };
}

export function getTokenLabelOffset(tileIndex: number) {
  const place = getTilePlacement(tileIndex);
  if (place.side === "bottom") return { x: 0, y: -58 };
  if (place.side === "left") return { x: 58, y: 0 };
  if (place.side === "top") return { x: 0, y: 58 };
  if (place.side === "right") return { x: -58, y: 0 };
  return { x: 0, y: -58 };
}
