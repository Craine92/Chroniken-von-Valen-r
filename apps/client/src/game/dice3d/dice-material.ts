import * as THREE from "three";
import { FACE_VALUES, seededRandom } from "./dice-physics";

/**
 * Würfel aus dunklem, verwittertem Stein: gekörnt, mit feinen Rissen und hell abgeschlagenen Kanten. Die Augen sind
 * eingravierte Mulden, in denen eine Rune golden leuchtet.
 */
const STONE = {
  /** Grundfarbe von hell (Mitte) nach dunkel (Rand). */
  base: ["#3d3833", "#2b2723", "#1a1714"],
  /** Abgenutzte, hell abgeschlagene Kanten. */
  wear: "rgba(150,138,120,.5)",
  /** Körnung: dunkle und helle Sprenkel. */
  grain: ["rgba(0,0,0,.35)", "rgba(170,158,140,.2)"],
  crack: "rgba(0,0,0,.55)",
  roughness: .92,
  bump: .05
} as const;

/** Leuchtfarbe der Runen-Augen; beim Pasch glühen sie stärker. */
export const RUNE_GLOW = 0xf2b84b;
export const RUNE_GLOW_IDLE = .9;
export const RUNE_GLOW_DOUBLE = 2.6;

const PIPS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.28, .28], [.5, .5], [.72, .72]],
  4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
  6: [[.28, .25], [.72, .25], [.28, .5], [.72, .5], [.28, .75], [.72, .75]]
};
const SIZE = 256;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = element.height = SIZE;
  return [element, element.getContext("2d")!];
}

/** Ein Rune-Punkt: eingravierte Mulde mit der Rauten-Rune Ingwaz (ᛜ) darin. */
function runePip(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, fill: string | CanvasGradient, stroke: string): void {
  context.fillStyle = fill;
  context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill();
  context.strokeStyle = stroke; context.lineWidth = Math.max(2.2, radius * .22); context.lineCap = "round"; context.lineJoin = "round";
  const r = radius * .5;
  context.beginPath();
  context.moveTo(cx, cy - r); context.lineTo(cx + r * .78, cy); context.lineTo(cx, cy + r); context.lineTo(cx - r * .78, cy); context.closePath();
  context.stroke();
}

function pipRadius(value: number): number {
  return value === 1 ? 34 : 23;
}

/** Farbbild einer Seite: Material mit Struktur, abgenutzten Kanten und vertieften, goldenen Rune-Punkten. */
function colorMap(value: number): HTMLCanvasElement {
  const palette = STONE, [element, context] = canvas(), random = seededRandom(value * 977 + 23);
  const base = context.createRadialGradient(SIZE * .4, SIZE * .38, SIZE * .05, SIZE * .5, SIZE * .5, SIZE * .78);
  base.addColorStop(0, palette.base[0]); base.addColorStop(.62, palette.base[1]); base.addColorStop(1, palette.base[2]);
  context.fillStyle = base; context.fillRect(0, 0, SIZE, SIZE);
  // Körnung und Poren.
  for (let index = 0; index < 900; index += 1) {
    context.fillStyle = palette.grain[index % 2]!;
    const size = 1 + random() * 2.6;
    context.fillRect(random() * SIZE, random() * SIZE, size, size * (.5 + random()));
  }
  // Feine Risse.
  context.strokeStyle = palette.crack; context.lineWidth = 1.4;
  for (let crack = 0; crack < 9; crack += 1) {
    let x = random() * SIZE, y = random() * SIZE;
    context.beginPath(); context.moveTo(x, y);
    for (let step = 0; step < 6; step += 1) { x += (random() - .5) * 34; y += (random() - .5) * 34; context.lineTo(x, y); }
    context.stroke();
  }
  // Abgenutzte Kanten: zum Rand hin abgeschlagener, hellerer Stein.
  const wear = context.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * .34, SIZE / 2, SIZE / 2, SIZE * .74);
  wear.addColorStop(0, "rgba(0,0,0,0)"); wear.addColorStop(1, palette.wear);
  context.fillStyle = wear; context.fillRect(0, 0, SIZE, SIZE);
  for (const [x, y] of PIPS[value]!) {
    const cx = x * SIZE, cy = y * SIZE, radius = pipRadius(value);
    // Eingravierte Mulde mit goldenem Rand, darin die leuchtende Rune.
    context.fillStyle = "rgba(10,6,2,.75)"; context.beginPath(); context.arc(cx, cy, radius + 3, 0, Math.PI * 2); context.fill();
    const hollow = context.createRadialGradient(cx - radius * .25, cy - radius * .25, 1, cx, cy, radius);
    hollow.addColorStop(0, "#6b4a1c"); hollow.addColorStop(.75, "#3a260c"); hollow.addColorStop(1, "#b88a3a");
    runePip(context, cx, cy, radius, hollow, "#ffd98a");
  }
  return element;
}

/** Relief: Fläche hell, Augen tief, Kanten leicht abgesenkt (abgenutzt). */
function bumpMap(value: number): HTMLCanvasElement {
  const [element, context] = canvas(), random = seededRandom(value * 313 + 9);
  context.fillStyle = "#b4b4b4"; context.fillRect(0, 0, SIZE, SIZE);
  for (let index = 0; index < 700; index += 1) {
    context.fillStyle = index % 2 ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.18)";
    const size = 1 + random() * 3;
    context.fillRect(random() * SIZE, random() * SIZE, size, size);
  }
  const edge = context.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * .36, SIZE / 2, SIZE / 2, SIZE * .74);
  edge.addColorStop(0, "rgba(0,0,0,0)"); edge.addColorStop(1, "rgba(0,0,0,.45)");
  context.fillStyle = edge; context.fillRect(0, 0, SIZE, SIZE);
  for (const [x, y] of PIPS[value]!) runePip(context, x * SIZE, y * SIZE, pipRadius(value) + 2, "#1a1a1a", "#000000");
  return element;
}

/** Leuchtbild: nur die Rune-Punkte glühen golden. */
function emissiveMap(value: number): HTMLCanvasElement {
  const [element, context] = canvas();
  context.fillStyle = "#000"; context.fillRect(0, 0, SIZE, SIZE);
  for (const [x, y] of PIPS[value]!) {
    const cx = x * SIZE, cy = y * SIZE, radius = pipRadius(value);
    // Die Mulde schimmert nur schwach, die Rune selbst leuchtet.
    const glow = context.createRadialGradient(cx, cy, 1, cx, cy, radius);
    glow.addColorStop(0, "#5a5a5a"); glow.addColorStop(.8, "#262626"); glow.addColorStop(1, "#6a6a6a");
    runePip(context, cx, cy, radius, glow, "#ffffff");
  }
  return element;
}

function texture(element: HTMLCanvasElement, color: boolean): THREE.CanvasTexture {
  const result = new THREE.CanvasTexture(element);
  if (color) result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 4;
  return result;
}

/** Sechs Materialien in der Reihenfolge der Würfelseiten (+x, −x, +y, −y, +z, −z = FACE_VALUES). */
export function createFaceMaterials(): THREE.MeshStandardMaterial[] {
  return FACE_VALUES.map(value => new THREE.MeshStandardMaterial({
    map: texture(colorMap(value), true),
    bumpMap: texture(bumpMap(value), false),
    bumpScale: STONE.bump,
    emissiveMap: texture(emissiveMap(value), false),
    emissive: new THREE.Color(RUNE_GLOW),
    emissiveIntensity: RUNE_GLOW_IDLE,
    roughness: STONE.roughness,
    metalness: .02,
    envMapIntensity: .18,
    transparent: true
  }));
}

/** Weicher, runder Kontaktschatten direkt unter einem Würfel. */
export function contactShadowTexture(): THREE.CanvasTexture {
  const [element, context] = canvas();
  const shade = context.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  shade.addColorStop(0, "rgba(0,0,0,.62)"); shade.addColorStop(.45, "rgba(0,0,0,.3)"); shade.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = shade; context.fillRect(0, 0, SIZE, SIZE);
  return texture(element, false);
}

/** Dezenter, warmer Lichtschein für den Pasch (statt eines Rings). */
export function doubleGlowTexture(): THREE.CanvasTexture {
  const [element, context] = canvas();
  const glow = context.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  glow.addColorStop(0, "rgba(255,214,130,.55)"); glow.addColorStop(.5, "rgba(255,190,90,.16)"); glow.addColorStop(1, "rgba(255,180,80,0)");
  context.fillStyle = glow; context.fillRect(0, 0, SIZE, SIZE);
  return texture(element, true);
}
