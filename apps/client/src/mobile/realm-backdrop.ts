import { BOARD_TILES, type GameState } from "@valenor/shared";
import { getFieldArtAsset } from "../game/assets/asset-manifest";

/**
 * Hintergrund des Handys: das Feldbild unter der eigenen Figur, stark abgedunkelt und unscharf. Die Werte sind so
 * gewählt, dass selbst ein rein weißes Bild hinter hellem Text genug Kontrast lässt (siehe Test).
 */
export const REALM_BACKDROP = {
  /** Helligkeit des Bildes (1 = unverändert). */
  brightness: .48,
  /** Unschärfe in Pixeln. */
  blurPx: 14,
  /** Dunkler Schleier darüber (Deckkraft). */
  veil: .3,
  /** Die halbtransparente Handykarte darüber dunkelt mindestens so stark ab (karten-und-sieg.css, oben .42). */
  cardVeil: .42
} as const;

export interface RealmBackdropImage {
  path: string;
  region?: string | undefined;
}

/** Das Bild des Feldes, auf dem die eigene Figur steht; ohne Bild (oder ohne Spiel) bleibt der bisherige Hintergrund. */
export function getRealmBackdrop(state: Pick<GameState, "status" | "players">, playerId: string): RealmBackdropImage | undefined {
  if (state.status !== "playing") return undefined;
  const player = state.players.find(entry => entry.id === playerId);
  const tile = player ? BOARD_TILES[player.position] : undefined;
  const art = tile ? getFieldArtAsset(tile) : undefined;
  return art ? { path: art.path, region: tile?.region } : undefined;
}

/** Relative Leuchtdichte eines sRGB-Farbwerts (0 … 1) nach WCAG. */
export function relativeLuminance([red, green, blue]: readonly [number, number, number]): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  };
  return .2126 * linear(red) + .7152 * linear(green) + .0722 * linear(blue);
}

/** Hellste mögliche Hintergrundfarbe: weißes Bild, abgedunkelt, darüber Schleier und Handykarte. */
export function brightestBackdrop(): [number, number, number] {
  const value = 255 * REALM_BACKDROP.brightness * (1 - REALM_BACKDROP.veil) * (1 - REALM_BACKDROP.cardVeil);
  return [value, value, value];
}

export function contrastRatio(foreground: readonly [number, number, number], background: readonly [number, number, number]): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + .05) / (dark + .05);
}
