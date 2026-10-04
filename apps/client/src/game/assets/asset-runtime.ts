import Phaser from "phaser";
import type { ValenorAssetDefinition } from "./asset-manifest";

export type AssetFit = "contain" | "cover";

export function hasLoadedAsset(scene: Phaser.Scene, asset: ValenorAssetDefinition): boolean {
  return asset.availability === "ready" && scene.textures.exists(asset.key);
}

export function fitImage(
  image: Phaser.GameObjects.Image,
  width: number,
  height: number,
  fit: AssetFit = "contain"
): Phaser.GameObjects.Image {
  const scaleX = width / image.width;
  const scaleY = height / image.height;
  return image.setScale(fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY));
}

export function addFittedImage(
  scene: Phaser.Scene,
  asset: ValenorAssetDefinition,
  x: number,
  y: number,
  width: number,
  height: number,
  depth: number,
  fit: AssetFit = "contain"
): Phaser.GameObjects.Image | undefined {
  if (asset.kind !== "image" || !hasLoadedAsset(scene, asset)) return undefined;
  return fitImage(scene.add.image(x, y, asset.key), width, height, fit).setDepth(depth);
}
