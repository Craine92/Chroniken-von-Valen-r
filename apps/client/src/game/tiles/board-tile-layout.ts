import { getTilePlacement } from "../board-layout";

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

function getNormalFieldSizes(width: number, height: number) {
  const unit = Math.min(width, height);
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
      title: { x: 0, y: 26, width: place.width - 20, fontSize: 22, maxLines: 2 },
      accent: { x: 0, y: 0, width: 0, height: 0 },
      emblem: { x: 0, y: -28, size: 62 },
      footer: { x: 0, y: 53, width: place.width - 24, fontSize: 10.5 },
      price: { x: 0, y: 0, width: 0, fontSize: 0 }
    };
  }
  const sizes = getNormalFieldSizes(place.width, place.height);
  if (landscape) {
    return {
      x: place.x, y: place.y, width: place.width, height: place.height, kind: "landscape",
      title: { x: 0, y: -29, width: place.width - 12, fontSize: sizes.titleFontSize - 2, maxLines: 2 },
      accent: { x: 0, y: -17, width: place.width - 32, height: 4 },
      emblem: { x: 0, y: 15, size: sizes.iconSize },
      footer: { x: 13, y: 6, width: place.width - 53, fontSize: sizes.secondaryFontSize },
      price: { x: 0, y: 44, width: place.width - 24, fontSize: sizes.priceFontSize }
    };
  }
  return {
    x: place.x, y: place.y, width: place.width, height: place.height, kind: "portrait",
    title: { x: 0, y: -35, width: place.width - 12, fontSize: sizes.titleFontSize, maxLines: 2 },
    accent: { x: 0, y: -25, width: place.width - 30, height: 4 },
    emblem: { x: 0, y: 14, size: sizes.iconSize },
    footer: { x: 10, y: 5, width: place.width - 36, fontSize: sizes.secondaryFontSize },
    price: { x: 0, y: 50, width: place.width - 30, fontSize: sizes.priceFontSize }
  };
}
