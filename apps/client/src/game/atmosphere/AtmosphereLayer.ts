import Phaser from "phaser";
import type { GameState } from "@valenor/shared";
import { BOARD_HEIGHT, BOARD_INNER_HALF_HEIGHT, BOARD_INNER_HALF_WIDTH, BOARD_WIDTH, getBuildingSeat, getTilePlacement } from "../board-layout";
import { BOARD_DEPTHS } from "../layers/board-depths";
import type { GraphicsQuality } from "../visual-config";
import { getAtmosphere, mixColor, type Atmosphere, type Mood } from "./atmosphere";

/** Am freien Himmel über der Sonnensteppe: nicht auf Reichsnamen, Bauplätzen oder Kartenstapeln. */
const MOON_POSITION = { x: 575, y: 40 } as const;

/**
 * Licht und Stimmung des ganzen Bretts. Ein ruhiger Farbschleier liegt über Feldern und Reichen (nie stärker als
 * MAX_TINT_ALPHA), dazu auf WebGL eine Farbstimmung, eine Vignette (CSS über der Leinwand, kostet keine Bildrate) und auf
 * „high“ ein weiches Glühen. Das Glühen sitzt nur an Lichtquellen (Mond, Fenster, Fackeln, Funken) statt als Bloom über dem
 * ganzen Bild: Ein bildschirmweiter Bloom halbierte auf Laptop-Grafik in 1920×1080 die Bildrate.
 * Unter dem Schleier bleiben Figuren, Wappen und Gebäude unberührt, damit Besitz und Spieler immer klar zu sehen sind.
 */
export class AtmosphereLayer {
  private readonly multiply: Phaser.GameObjects.Rectangle;
  private readonly screen: Phaser.GameObjects.Rectangle;
  private readonly moon: Phaser.GameObjects.Container;
  private readonly sparkles: Phaser.GameObjects.Arc[] = [];
  private readonly lights: Phaser.GameObjects.GameObject[] = [];
  private colorMatrix: Phaser.FX.ColorMatrix | undefined;
  private readonly frame: HTMLElement | null;
  private current: Mood | undefined;
  private atmosphere: Atmosphere | undefined;
  private lightSignature = "";
  private readonly proxy = { t: 1 };

  constructor(private readonly scene: Phaser.Scene, private readonly quality: GraphicsQuality, private readonly reducedMotion: boolean) {
    const width = BOARD_WIDTH + 120, height = BOARD_HEIGHT + 120;
    // Über Feldern und Reichsbildern, unter Gruppenleisten, Besitz, Gebäuden und Figuren.
    this.multiply = scene.add.rectangle(0, 0, width, height, 0xffffff, 1).setAlpha(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(BOARD_DEPTHS.decorations + 5).setName("mood-multiply");
    this.screen = scene.add.rectangle(0, 0, width, height, 0xffffff, 1).setAlpha(0).setBlendMode(Phaser.BlendModes.SCREEN).setDepth(BOARD_DEPTHS.decorations + 5).setName("mood-screen");
    this.moon = scene.add.container(MOON_POSITION.x, MOON_POSITION.y).setDepth(BOARD_DEPTHS.decorations + 4).setAlpha(0).setName("mood-moon");
    this.moon.add([
      scene.add.circle(0, 0, 70, 0xffffff, .12).setBlendMode(Phaser.BlendModes.ADD).setName("moon-halo"),
      scene.add.circle(0, 0, 44, 0xffffff, .18).setBlendMode(Phaser.BlendModes.ADD).setName("moon-glow"),
      scene.add.circle(0, 0, 26, 0xffffff, .95).setName("moon-disc"),
      scene.add.circle(-7, -5, 6, 0x000000, .12), scene.add.circle(8, 6, 4, 0x000000, .1)
    ]);
    const camera = scene.cameras.main;
    if (scene.game.renderer.type === Phaser.WEBGL && camera.postFX && quality !== "low") this.colorMatrix = camera.postFX.addColorMatrix();
    this.frame = scene.game.canvas.closest<HTMLElement>(".game-canvas");
  }

  sync(state: GameState): void {
    const atmosphere = getAtmosphere(state.currentRound, state.activeChronicleEvent?.id, this.quality, this.reducedMotion);
    this.syncLights(state, atmosphere);
    if (atmosphere.key === this.atmosphere?.key) return;
    const from = this.current ?? atmosphere.mood;
    this.atmosphere = atmosphere;
    this.scene.game.canvas.dataset.atmosphere = atmosphere.key;
    this.scene.game.canvas.dataset.timeOfDay = atmosphere.timeOfDay;
    this.frame?.style.setProperty("--mood-transition", `${atmosphere.transitionMs}ms`);
    this.frame?.style.setProperty("--mood-vignette", atmosphere.vignette ? (atmosphere.mood.vignette * .85).toFixed(3) : "0");
    this.moon.list.slice(0, 2).forEach((halo, index) => (halo as Phaser.GameObjects.Arc).setScale(atmosphere.bloom ? 1.25 + index * .1 : 1));
    this.scene.tweens.killTweensOf(this.proxy);
    const to = atmosphere.mood;
    if (!this.current) { this.apply(from, to, 1); this.current = to; this.syncSparkles(to); return; }
    this.proxy.t = 0;
    this.scene.tweens.add({ targets: this.proxy, t: 1, duration: atmosphere.transitionMs, ease: "Sine.InOut",
      onUpdate: () => this.apply(from, to, this.proxy.t), onComplete: () => { this.current = to; } });
    this.syncSparkles(to);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.proxy, ...this.sparkles, ...this.lights]);
    [this.multiply, this.screen, this.moon, ...this.sparkles, ...this.lights].forEach(object => object.destroy());
    if (this.colorMatrix) this.scene.cameras.main.postFX?.remove(this.colorMatrix as unknown as Phaser.FX.Controller);
    this.frame?.style.removeProperty("--mood-vignette");
    this.frame?.style.removeProperty("--mood-transition");
  }

  private apply(from: Mood, to: Mood, t: number): void {
    const lerp = (a: number, b: number) => a + (b - a) * t;
    // Schleier: Der jeweils passende Mischmodus blendet ein, der andere aus.
    const multiplyAlpha = lerp(from.blend === "multiply" ? from.tintAlpha : 0, to.blend === "multiply" ? to.tintAlpha : 0);
    const screenAlpha = lerp(from.blend === "screen" ? from.tintAlpha : 0, to.blend === "screen" ? to.tintAlpha : 0);
    this.multiply.setFillStyle(mixColor(from.blend === "multiply" ? from.tint : to.tint, to.tint, t)).setAlpha(multiplyAlpha);
    this.screen.setFillStyle(mixColor(from.blend === "screen" ? from.tint : to.tint, to.tint, t)).setAlpha(screenAlpha);
    if (this.colorMatrix) {
      this.colorMatrix.reset();
      this.colorMatrix.saturate(lerp(from.saturation, to.saturation), true);
      this.colorMatrix.brightness(lerp(from.brightness, to.brightness), true);
    }
    const moonColor = to.moon ?? from.moon;
    const moonAlpha = lerp(from.moon ? 1 : 0, to.moon ? 1 : 0);
    this.moon.setAlpha(moonAlpha);
    if (moonColor !== undefined) this.moon.list.slice(0, 3).forEach(part => (part as Phaser.GameObjects.Arc).setFillStyle(moonColor, (part as Phaser.GameObjects.Arc).fillAlpha));
  }

  private syncSparkles(mood: Mood): void {
    this.scene.tweens.killTweensOf(this.sparkles);
    this.sparkles.splice(0).forEach(sparkle => sparkle.destroy());
    if (!mood.sparkles || this.reducedMotion || this.quality === "low") return;
    const count = this.quality === "high" ? 18 : 9;
    for (let index = 0; index < count; index += 1) {
      const x = Phaser.Math.Between(-BOARD_INNER_HALF_WIDTH + 90, BOARD_INNER_HALF_WIDTH - 90), y = Phaser.Math.Between(-BOARD_INNER_HALF_HEIGHT + 80, BOARD_INNER_HALF_HEIGHT - 80);
      const sparkle = this.scene.add.circle(x, y, Phaser.Math.FloatBetween(1.6, 3.2), mood.sparkles, 1).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(BOARD_DEPTHS.decorations + 6).setName("mood-sparkle");
      // Auf „high“ glüht jeder Funke weich nach.
      if (this.atmosphere?.bloom) sparkle.setStrokeStyle(5, mood.sparkles, .22);
      this.sparkles.push(sparkle);
      this.scene.tweens.add({ targets: sparkle, alpha: { from: 0, to: .85 }, y: y - 14, duration: 1_400 + index * 90, delay: index * 160, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
  }

  /** Nachts leuchten Fenster und Fackeln der Gebäude; bei „Baumeister“ und „Konjunktur“ glühen sie auch am Tag. */
  private syncLights(state: GameState, atmosphere: Atmosphere): void {
    const buildings = state.propertyOwnerships.filter(entry => entry.buildingLevel > 0);
    const glow = atmosphere.mood.buildingGlow;
    const signature = `${atmosphere.windowLights}:${glow ?? ""}:${buildings.map(entry => `${entry.tileIndex}.${entry.buildingLevel}`).join(",")}`;
    if (signature === this.lightSignature) return;
    this.lightSignature = signature;
    this.scene.tweens.killTweensOf(this.lights);
    this.lights.splice(0).forEach(light => light.destroy());
    const intensity = Math.max(atmosphere.windowLights, glow ? .7 : 0);
    if (!intensity) return;
    const color = glow ?? 0xffc46b;
    buildings.forEach((entry, index) => {
      const place = getTilePlacement(entry.tileIndex), seat = getBuildingSeat(entry.tileIndex);
      const x = place.x + seat.x, y = place.y + seat.y - seat.height * .42;
      const halo = this.scene.add.circle(x, y, 18 + entry.buildingLevel * 4, color, .16 * intensity).setBlendMode(Phaser.BlendModes.ADD).setDepth(BOARD_DEPTHS.buildings + 1).setName("night-light");
      const windows = [-.18, .14, .02].slice(0, entry.buildingLevel >= 3 ? 3 : 2).map((offset, windowIndex) =>
        this.scene.add.circle(x + offset * seat.width, y + (windowIndex - 1) * 7, 2.2, 0xffe2a0, .9 * intensity).setBlendMode(Phaser.BlendModes.ADD).setDepth(BOARD_DEPTHS.buildings + 1).setName("night-window"));
      this.lights.push(halo, ...windows);
      // „high“: weiches Glühen um die Lichtquelle (statt Bloom über dem ganzen Bild).
      if (atmosphere.bloom) this.lights.push(this.scene.add.circle(x, y, 40 + entry.buildingLevel * 7, color, .07 * intensity).setBlendMode(Phaser.BlendModes.ADD).setDepth(BOARD_DEPTHS.buildings).setName("night-glow"));
      if (this.reducedMotion || this.quality === "low") return;
      // Fackelschein flackert leicht.
      this.scene.tweens.add({ targets: halo, alpha: .1 * intensity, scale: 1.08, duration: 420 + (index % 5) * 90, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    });
  }
}
