import Phaser from "phaser";
import { getPreloadAssets } from "../assets/asset-manifest";
import { CODEX_FONT_FACES } from "../design-tokens";

/** Lädt die Schriften des Design-Systems, bevor Phaser Text rastert; ohne Schrift-API (Tests) sofort fertig. */
export function loadCodexFonts(timeoutMs = 2_500): Promise<void> {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts?.load) return Promise.resolve();
  const loaded = Promise.all(CODEX_FONT_FACES.map(face => fonts.load(face))).then(() => undefined, () => undefined);
  // Fehlt eine Schrift, zeichnet Phaser nach kurzer Wartezeit mit dem Fallback weiter.
  return Promise.race([loaded, new Promise<void>(resolve => window.setTimeout(resolve, timeoutMs))]);
}

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
      if (file.key.startsWith("dragon-frame-")) {
        if (import.meta.env.DEV) console.warn(`[Dragon] Missing frame ${file.key}: ${file.url}; remaining frames or procedural fallback will be used.`);
        return;
      }
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
    void loadCodexFonts().then(() => {
      this.callbacks.onProgress?.(1);
      this.callbacks.onComplete?.();
      this.scene.start("valenor-board");
    });
  }
}
