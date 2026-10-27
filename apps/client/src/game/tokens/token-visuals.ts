import { BOARD_CELL_SIZE } from "../board-layout";

export const TOKEN_VISUAL_CONFIG = {
  miniatureScale: 1,
  assetWidth: Math.round(BOARD_CELL_SIZE * .49),
  assetHeight: Math.round(BOARD_CELL_SIZE * .68),
  outlineExpansion: 6,
  shadow: { softWidth: 56, softHeight: 23, coreWidth: 46, coreHeight: 16 },
  base: { centerY: 10, outerWidth: 48, outerHeight: 25, innerWidth: 35, innerHeight: 17 },
  /** Namensschild und Reliktmarken behalten auf dem Feld eine feste, lesbare Größe, auch wenn die Figur kleiner steht. */
  labelScale: .78,
  relicScale: .8,
  activeAuraRadius: 34,
  activeRingRadius: 30
} as const;

/** Teilen sich Figuren ein Feld, trägt nur die aktive ihr Namensschild; sonst überdecken sich die Schilder. */
export function showsTokenName(occupants: number, active: boolean): boolean {
  return occupants <= 1 || active;
}
