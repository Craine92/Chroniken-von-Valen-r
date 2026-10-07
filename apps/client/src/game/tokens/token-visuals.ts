import { BOARD_CELL_SIZE, getTilePlacement, getTokenSlotOffset } from "../board-layout";

export const TOKEN_VISUAL_CONFIG = {
  miniatureScale: 1,
  assetWidth: Math.round(BOARD_CELL_SIZE * .49),
  assetHeight: Math.round(BOARD_CELL_SIZE * .68),
  outlineExpansion: 6,
  shadow: { softWidth: 56, softHeight: 23, coreWidth: 46, coreHeight: 16 },
  base: { centerY: 10, outerWidth: 48, outerHeight: 25, innerWidth: 35, innerHeight: 17 },
  pointer: {
    settledTokenYOffset: -5,
    edgeFanSpacing: 18,
    arrowLength: 7,
    halfWidth: 3.25,
    outlineWidth: 4,
    lineWidth: 2,
    activeAlpha: .55,
    inactiveAlpha: .1
  },
  activeAuraRadius: 34,
  activeRingRadius: 30
} as const;

export interface TokenPointerGeometry {
  start: { x: number; y: number };
  lineEnd: { x: number; y: number };
  tip: { x: number; y: number };
  wingA: { x: number; y: number };
  wingB: { x: number; y: number };
}

const SIDE_FAN_FACTORS = {
  1: [0],
  2: [-.7, .7],
  3: [-1, 1, 0],
  4: [-1, 1, -.35, .35]
} as const;

function getCornerTip(tileIndex: number, count: number, index: number, center: { x: number; y: number }, width: number, height: number) {
  const normalized = ((tileIndex % 40) + 40) % 40;
  const sx = normalized === 0 || normalized === 33 ? -1 : 1;
  const sy = normalized === 0 || normalized === 13 ? -1 : 1;
  const corner = { x: center.x + sx * width / 2, y: center.y + sy * height / 2 };
  const spacing = TOKEN_VISUAL_CONFIG.pointer.edgeFanSpacing;
  if (count <= 1) return corner;
  if (count === 2) return index === 0
    ? { x: corner.x - sx * spacing * .7, y: corner.y }
    : { x: corner.x, y: corner.y - sy * spacing * .7 };
  if (count === 3) {
    if (index === 0) return corner;
    return index === 1
      ? { x: corner.x - sx * spacing, y: corner.y }
      : { x: corner.x, y: corner.y - sy * spacing };
  }
  if (index < 2) return { x: corner.x - sx * spacing * (index === 0 ? .55 : 1.35), y: corner.y };
  return { x: corner.x, y: corner.y - sy * spacing * (index === 2 ? .55 : 1.35) };
}

export function getTokenPointerGeometry(tileIndex: number, count: number, index: number, visualScale = 1, occupiedByBuilding = false): TokenPointerGeometry {
  const offset = getTokenSlotOffset(tileIndex, count, index, occupiedByBuilding);
  const place = getTilePlacement(tileIndex);
  const renderedOffset = { x: offset.x, y: offset.y + TOKEN_VISUAL_CONFIG.pointer.settledTokenYOffset };
  const center = { x: -renderedOffset.x, y: -renderedOffset.y };
  const factors = SIDE_FAN_FACTORS[Math.min(4, Math.max(1, count)) as keyof typeof SIDE_FAN_FACTORS];
  const fan = (factors[index] ?? 0) * TOKEN_VISUAL_CONFIG.pointer.edgeFanSpacing;
  const tip = place.side === "corner"
    ? getCornerTip(tileIndex, count, index, center, place.width, place.height)
    : place.side === "bottom"
      ? { x: center.x + fan, y: center.y - place.height / 2 }
      : place.side === "top"
        ? { x: center.x + fan, y: center.y + place.height / 2 }
        : place.side === "left"
          ? { x: center.x + place.width / 2, y: center.y + fan }
          : { x: center.x - place.width / 2, y: center.y + fan };
  const baseCenter = { x: 0, y: TOKEN_VISUAL_CONFIG.base.centerY * visualScale };
  const targetDistance = Math.hypot(tip.x - baseCenter.x, tip.y - baseCenter.y) || 1;
  const direction = { x: (tip.x - baseCenter.x) / targetDistance, y: (tip.y - baseCenter.y) / targetDistance };
  const perpendicular = { x: -direction.y, y: direction.x };
  const radiusX = TOKEN_VISUAL_CONFIG.base.outerWidth * visualScale / 2;
  const radiusY = TOKEN_VISUAL_CONFIG.base.outerHeight * visualScale / 2;
  const baseRadius = 1 / Math.sqrt(direction.x ** 2 / radiusX ** 2 + direction.y ** 2 / radiusY ** 2);
  const start = { x: baseCenter.x + direction.x * baseRadius, y: baseCenter.y + direction.y * baseRadius };
  const { arrowLength, halfWidth } = TOKEN_VISUAL_CONFIG.pointer;
  const lineEnd = { x: tip.x - direction.x * arrowLength, y: tip.y - direction.y * arrowLength };
  return {
    start,
    lineEnd,
    tip,
    wingA: { x: lineEnd.x + perpendicular.x * halfWidth, y: lineEnd.y + perpendicular.y * halfWidth },
    wingB: { x: lineEnd.x - perpendicular.x * halfWidth, y: lineEnd.y - perpendicular.y * halfWidth }
  };
}
