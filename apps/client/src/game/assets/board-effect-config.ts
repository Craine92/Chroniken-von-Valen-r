import { VALENOR_ASSETS, type AtlasAssetDefinition } from "./asset-manifest";
import { BOARD_DEPTHS } from "../layers/board-depths";

export interface BoardEffectPlacement {
  tileIndex: number;
  asset: AtlasAssetDefinition;
  offsetX: number;
  offsetY: number;
  scale: number;
  depth: number;
}

export const BOARD_EFFECT_DECORATIONS: readonly BoardEffectPlacement[] = [
  { tileIndex: 0, asset: VALENOR_ASSETS.effects.portal, offsetX: 0, offsetY: -10, scale: .22, depth: BOARD_DEPTHS.effects },
  { tileIndex: 11, asset: VALENOR_ASSETS.effects.windmill, offsetX: 0, offsetY: -18, scale: .18, depth: BOARD_DEPTHS.effects }
] as const;
