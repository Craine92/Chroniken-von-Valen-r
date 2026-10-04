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
  titleFont: .174,
  secondaryFont: .087,
  priceFont: .139,
  icon: .278
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
      title: { x: 0, y: 27, width: place.width - 22, fontSize: 20, maxLines: 2 },
      accent: { x: 0, y: 0, width: 0, height: 0 },
      emblem: { x: 0, y: -27, size: 56 },
      footer: { x: 0, y: 53, width: place.width - 24, fontSize: 10.5 },
      price: { x: 0, y: 0, width: 0, fontSize: 0 }
    };
  }
  const sizes = getNormalFieldSizes(place.width, place.height);
  if (landscape) {
    return {
      x: place.x, y: place.y, width: place.width, height: place.height, kind: "landscape",
      title: { x: 0, y: -39, width: place.width - 24, fontSize: sizes.titleFontSize, maxLines: 2 },
      accent: { x: 0, y: -17, width: place.width - 32, height: 4 },
      emblem: { x: -place.width / 2 + 17, y: 6, size: sizes.iconSize },
      footer: { x: 13, y: 6, width: place.width - 53, fontSize: sizes.secondaryFontSize },
      price: { x: 0, y: 40, width: place.width - 34, fontSize: sizes.priceFontSize }
    };
  }
  return {
    x: place.x, y: place.y, width: place.width, height: place.height, kind: "portrait",
    title: { x: 0, y: -47, width: place.width - 18, fontSize: sizes.titleFontSize, maxLines: 2 },
    accent: { x: 0, y: -25, width: place.width - 30, height: 4 },
    emblem: { x: -place.width / 2 + 15, y: 5, size: sizes.iconSize },
    footer: { x: 10, y: 5, width: place.width - 36, fontSize: sizes.secondaryFontSize },
    price: { x: 0, y: 50, width: place.width - 30, fontSize: sizes.priceFontSize }
  };
}
