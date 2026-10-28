import Phaser from "phaser";
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from "../components/icons/icon-data";

/** Icons, die das Phaser-Brett braucht. Sie werden weiß gerastert und per Tint eingefärbt. */
export const BOARD_ICONS = ["adventure", "fate", "rune", "dungeon", "mortgage", "crown", "dragon", "gold", "seal", "feather", "amulet", "companion", "auction",
  "harbor", "utility", "tavern", "property", "group-mondhain", "group-amethystwald", "group-silberbach", "group-kronenwald",
  "group-aschelande", "group-eisenoede", "group-sonnensteppe", "group-himmelsweite"] as const satisfies readonly IconName[];
export type BoardIconName = typeof BOARD_ICONS[number];

const TEXTURE_SIZE = 128;
export const iconTextureKey = (name: IconName) => `codex-icon-${name}`;

export function iconDataUri(name: IconName): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}" width="${TEXTURE_SIZE}" height="${TEXTURE_SIZE}"><path fill="#ffffff" d="${ICON_PATHS[name]}"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function preloadIconTextures(load: Phaser.Loader.LoaderPlugin): void {
  BOARD_ICONS.forEach(name => load.svg(iconTextureKey(name), iconDataUri(name), { width: TEXTURE_SIZE, height: TEXTURE_SIZE }));
}

/**
 * Setzt ein eingefärbtes Icon. Ohne geladene Textur (Fallback ohne Bild-Assets) entsteht ein schlichter Kreis
 * in derselben Farbe, damit Layout und Bedeutung erhalten bleiben.
 */
export function addIconImage(scene: Phaser.Scene, x: number, y: number, name: BoardIconName, size: number, tint: number): Phaser.GameObjects.Image | Phaser.GameObjects.Arc {
  const key = iconTextureKey(name);
  if (!scene.textures.exists(key)) return scene.add.circle(x, y, size * .28, tint, .9);
  return scene.add.image(x, y, key).setDisplaySize(size, size).setTint(tint);
}
