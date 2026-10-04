import type { RegionType } from "@valenor/shared";
import { VALENOR_ASSETS, type AtlasAssetDefinition, type ImageAssetDefinition } from "./asset-manifest";
import { BOARD_DEPTHS } from "../layers/board-depths";

export interface RealmDecorationPlacement {
  realm: RegionType;
  asset: ImageAssetDefinition;
  x: number;
  y: number;
  scale: number;
  depth: number;
  rotation?: number;
  flipX?: boolean;
}

export interface AnimatedDecorationPlacement extends Omit<RealmDecorationPlacement, "asset"> {
  asset: AtlasAssetDefinition;
}

export const REALM_DECORATIONS: readonly RealmDecorationPlacement[] = [
  { realm: "elves", asset: VALENOR_ASSETS.environment.elven.treeLarge, x: -330, y: 255, scale: .28, depth: BOARD_DEPTHS.decorations },
  { realm: "elves", asset: VALENOR_ASSETS.environment.elven.luminousPlants, x: -245, y: 305, scale: .22, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "elves", asset: VALENOR_ASSETS.environment.elven.runestone, x: -190, y: 215, scale: .2, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "elves", asset: VALENOR_ASSETS.environment.elven.treehouse, x: -315, y: 150, scale: .25, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "elves", asset: VALENOR_ASSETS.environment.elven.shrine, x: -175, y: 305, scale: .2, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "humans", asset: VALENOR_ASSETS.environment.human.tree, x: -330, y: -260, scale: .25, depth: BOARD_DEPTHS.decorations },
  { realm: "humans", asset: VALENOR_ASSETS.environment.human.house, x: -240, y: -215, scale: .23, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "humans", asset: VALENOR_ASSETS.environment.human.farm, x: -310, y: -135, scale: .2, depth: BOARD_DEPTHS.decorations },
  { realm: "humans", asset: VALENOR_ASSETS.environment.human.bridge, x: -175, y: -90, scale: .18, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "humans", asset: VALENOR_ASSETS.environment.human.castleTower, x: -150, y: -280, scale: .2, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "orcs", asset: VALENOR_ASSETS.environment.orc.rocks, x: 245, y: -275, scale: .25, depth: BOARD_DEPTHS.decorations },
  { realm: "orcs", asset: VALENOR_ASSETS.environment.orc.deadTree, x: 345, y: -215, scale: .22, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "orcs", asset: VALENOR_ASSETS.environment.orc.banner, x: 205, y: -175, scale: .2, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "orcs", asset: VALENOR_ASSETS.environment.orc.hut, x: 300, y: -115, scale: .24, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "orcs", asset: VALENOR_ASSETS.environment.orc.fortress, x: 160, y: -300, scale: .22, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "steppe", asset: VALENOR_ASSETS.environment.steppe.grass, x: 245, y: 315, scale: .28, depth: BOARD_DEPTHS.decorations },
  { realm: "steppe", asset: VALENOR_ASSETS.environment.steppe.rocks, x: 345, y: 255, scale: .22, depth: BOARD_DEPTHS.decorations },
  { realm: "steppe", asset: VALENOR_ASSETS.environment.steppe.tent, x: 240, y: 215, scale: .23, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "steppe", asset: VALENOR_ASSETS.environment.steppe.totem, x: 350, y: 135, scale: .18, depth: BOARD_DEPTHS.decorations + 1 },
  { realm: "steppe", asset: VALENOR_ASSETS.environment.steppe.greatHall, x: 145, y: 300, scale: .22, depth: BOARD_DEPTHS.decorations + 1 }
] as const;

export const ANIMATED_REALM_DECORATIONS: readonly AnimatedDecorationPlacement[] = [
  { realm: "elves", asset: VALENOR_ASSETS.effects.magicPlants, x: -275, y: 245, scale: .28, depth: BOARD_DEPTHS.effects },
  { realm: "humans", asset: VALENOR_ASSETS.effects.water, x: -190, y: -105, scale: .34, depth: BOARD_DEPTHS.effects },
  { realm: "orcs", asset: VALENOR_ASSETS.effects.fire, x: 285, y: -170, scale: .25, depth: BOARD_DEPTHS.effects },
  { realm: "steppe", asset: VALENOR_ASSETS.effects.banner, x: 310, y: 205, scale: .25, depth: BOARD_DEPTHS.effects }
] as const;
