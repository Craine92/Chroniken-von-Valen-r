/**
 * Design-System „Codex“ für Canvas und JavaScript (Phaser, QR-Code).
 * Spiegelt die primitiven Farben aus src/styles/tokens.css; beide Dateien gemeinsam ändern.
 */
export const CODEX_COLORS = {
  ink950: "#080609",
  ink900: "#100c10",
  ink850: "#161115",
  ink800: "#1d171b",
  ink750: "#251d22",
  ink700: "#2e252a",
  ink600: "#3d3237",
  ink500: "#54474c",
  leather900: "#1c140d",
  leather800: "#2a1d13",
  leather700: "#3b2a1b",
  leather600: "#4f3a26",
  leather500: "#6b5236",
  parchment50: "#fbf4e2",
  parchment100: "#f1e5c8",
  parchment200: "#e3d3ae",
  parchment300: "#cdbb94",
  parchment400: "#ad9c7d",
  parchment500: "#8d806a",
  parchment600: "#6b6152",
  gold200: "#fbe6b0",
  gold300: "#f2d796",
  gold400: "#e3c27a",
  gold500: "#c9a14f",
  gold600: "#a8823c",
  gold700: "#7d5f2b",
  gold800: "#4f3c1c",
  verdigris300: "#9fd8bd",
  verdigris500: "#5e9b84",
  verdigris800: "#1e3a30",
  oxblood300: "#f0a59a",
  oxblood400: "#d9675c",
  oxblood500: "#9c3d35",
  oxblood800: "#3f1a18",
  arcane300: "#c8b2f0",
  arcane500: "#8a63c9",
  arcane800: "#2e2142",
  tide300: "#9fc7ef",
  tide500: "#4f86c2",
  tide800: "#1a2c40",
  playerViolet: "#a16deb",
  playerGreen: "#5ec58a",
  playerRed: "#dc5f67",
  playerBlue: "#5f9ddd",
  playerOrange: "#ed8a3c",
  playerCyan: "#41d9d2",
  white: "#ffffff",
  black: "#000000"
} as const;

export type CodexColor = keyof typeof CODEX_COLORS;

/** Phaser erwartet Farben als Zahl (0xRRGGBB). */
export const codexColor = (name: CodexColor): number => Number.parseInt(CODEX_COLORS[name].slice(1), 16);

export const CODEX_FONTS = {
  display: "Cinzel, \"Trajan Pro\", Georgia, serif",
  text: "\"Alegreya Sans\", \"Segoe UI\", system-ui, sans-serif"
} as const;

/** Schriften, die vor dem ersten Phaser-Text geladen sein müssen. */
export const CODEX_FONT_FACES = ["600 32px Cinzel", "700 32px Cinzel", "400 16px \"Alegreya Sans\"", "700 16px \"Alegreya Sans\"", "800 16px \"Alegreya Sans\""] as const;
