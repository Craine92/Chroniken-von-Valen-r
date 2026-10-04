import Phaser from "phaser";
import { getPreloadAssets } from "../assets/asset-manifest";

export interface PreloadCallbacks {
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}

export class ValenorPreloadScene extends Phaser.Scene {
  constructor(private readonly callbacks: PreloadCallbacks = {}) {
    super("valenor-preload");
  }

  preload() {
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => this.callbacks.onProgress?.(progress));
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      if (file.key === "field-base-horizontal") {
        console.warn("[Board] Missing horizontal field asset – using fallback");
        return;
      }
      if (file.key === "field-base-vertical") {
        console.warn("[Board] Missing vertical field asset – using fallback");
        return;
      }
      console.warn(`Valenør asset unavailable; procedural fallback remains active: ${file.key}`);
    });
    getPreloadAssets().forEach((asset) => {
      if (asset.kind === "image") this.load.image(asset.key, asset.path);
      else this.load.atlas(asset.key, asset.texturePath, asset.atlasPath);
    });
  }

  create() {
    this.callbacks.onProgress?.(1);
    this.callbacks.onComplete?.();
    this.scene.start("valenor-board");
  }
}
