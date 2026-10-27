import { BOARD_HORIZONTAL_CELL_WIDTH, BOARD_VERTICAL_CELL_HEIGHT, getTilePlacement } from "../board-layout";

export type TileLayoutKind = "corner" | "portrait" | "landscape";

export interface BoardTileVisualLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: TileLayoutKind;
  title: { x: number; y: number; width: number; fontSize: number; maxLines: number };
  accent: { x: number; y: number; width: number; height: number };
  emblem: { x: number; y: number; size: number };
  footer: { x: number; y: number; width: number; fontSize: number };
  price: { x: number; y: number; width: number; fontSize: number };
}

const NORMAL_FIELD_SCALE = {
  titleFont: .191,
  secondaryFont: .087,
  priceFont: .157,
  icon: .383
} as const;

// Gleiche Schriftgrößen in allen Reihen: Maß ist die schmalere der beiden Feldbreiten.
const NORMAL_FIELD_UNIT = Math.min(BOARD_HORIZONTAL_CELL_WIDTH, BOARD_VERTICAL_CELL_HEIGHT);

function getNormalFieldSizes() {
  const unit = NORMAL_FIELD_UNIT;
  return {
    titleFontSize: Math.round(unit * NORMAL_FIELD_SCALE.titleFont),
    secondaryFontSize: Math.round(unit * NORMAL_FIELD_SCALE.secondaryFont),
    priceFontSize: Math.round(unit * NORMAL_FIELD_SCALE.priceFont),
    iconSize: Math.round(unit * NORMAL_FIELD_SCALE.icon)
  };
}

export function getBoardTileVisualLayout(index: number): BoardTileVisualLayout {
  const place = getTilePlacement(index);
  const corner = place.side === "corner";
  const landscape = place.side === "left" || place.side === "right";
  if (corner) {
    return {
      x: place.x, y: place.y, width: place.width, height: place.height, kind: "corner",
      title: { x: 0, y: place.height / 2 - 52, width: place.width - 20, fontSize: 22, maxLines: 2 },
      accent: { x: 0, y: 0, width: 0, height: 0 },
      emblem: { x: 0, y: -place.height * .2, size: 78 },
      footer: { x: 0, y: place.height / 2 - 18, width: place.width - 24, fontSize: 10.5 },
      price: { x: 0, y: 0, width: 0, fontSize: 0 }
    };
  }
  const sizes = getNormalFieldSizes();
  if (landscape) {
    return {
      x: place.x, y: place.y, width: place.width, height: place.height, kind: "landscape",
      title: { x: 0, y: -place.height / 2 + 26, width: place.width - 12, fontSize: sizes.titleFontSize - 2, maxLines: 2 },
      accent: { x: 0, y: -place.height / 2 + 41, width: place.width - 32, height: 4 },
      emblem: { x: 0, y: 12, size: sizes.iconSize },
      footer: { x: 13, y: 6, width: place.width - 53, fontSize: sizes.secondaryFontSize },
      price: { x: 0, y: place.height / 2 - 14, width: place.width - 24, fontSize: sizes.priceFontSize }
    };
  }
  return {
    x: place.x, y: place.y, width: place.width, height: place.height, kind: "portrait",
    title: { x: 0, y: -place.height / 2 + 32, width: place.width - 12, fontSize: sizes.titleFontSize, maxLines: 2 },
    accent: { x: 0, y: -place.height / 2 + 42, width: place.width - 30, height: 4 },
    emblem: { x: 0, y: 14, size: sizes.iconSize },
    footer: { x: 10, y: 5, width: place.width - 36, fontSize: sizes.secondaryFontSize },
    price: { x: 0, y: place.height / 2 - 17, width: place.width - 30, fontSize: sizes.priceFontSize }
  };
}
