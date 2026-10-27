import Phaser from "phaser";
import type { GameState, RegionType } from "@valenor/shared";
import { BOARD_HALF_HEIGHT, BOARD_HALF_WIDTH, BOARD_INNER_HALF_HEIGHT, BOARD_INNER_HALF_WIDTH, getBuildingSeat, getTilePlacement } from "../board-layout";
import { codexColor } from "../design-tokens";
import type { AmbientLifeBudget } from "../visual-config";
import { chooseChimneyTiles } from "../living/ambient";
import { BOARD_DEPTHS } from "./board-depths";

/** Viertel des Innenfelds je Reich, in Brettkoordinaten. */
export const REALM_QUADRANTS: Readonly<Record<RegionType, { x: number; y: number; width: number; height: number }>> = {
  humans: { x: -BOARD_INNER_HALF_WIDTH, y: -BOARD_INNER_HALF_HEIGHT, width: BOARD_INNER_HALF_WIDTH, height: BOARD_INNER_HALF_HEIGHT },
  orcs: { x: 0, y: -BOARD_INNER_HALF_HEIGHT, width: BOARD_INNER_HALF_WIDTH, height: BOARD_INNER_HALF_HEIGHT },
  elves: { x: -BOARD_INNER_HALF_WIDTH, y: 0, width: BOARD_INNER_HALF_WIDTH, height: BOARD_INNER_HALF_HEIGHT },
  steppe: { x: 0, y: 0, width: BOARD_INNER_HALF_WIDTH, height: BOARD_INNER_HALF_HEIGHT }
};

/**
 * Dezente Lebenszeichen je Reich: Rauch über gebauten Siedlungen, Glut in der Eisenöde, Glühwürmchen im
 * Amethystwald, ziehende Wolkenschatten und ab und zu ein Vogelzug. Alles schwebt unter Gebäuden und Figuren,
 * fängt keine Eingaben ab und ist bei Stufe „low“ oder reduzierter Bewegung gar nicht erst da.
 */
/**
 * Fortschritt der aktuellen Runde eines endlos wiederholten Tweens (0 bis 1). `tween.progress` bezieht sich auf die
 * Gesamtdauer und bleibt bei repeat: -1 deshalb immer 0.
 */
const loopProgress = (tween: Phaser.Tweens.Tween) => tween.data[0]?.progress ?? 0;

export class AmbientLifeLayer {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly smoke: Phaser.GameObjects.Arc[] = [];
  private chimneySignature = "";

  constructor(private readonly scene: Phaser.Scene, private readonly budget: AmbientLifeBudget) {}

  /** Für die Diagnose am Canvas: wie viele Lebenszeichen gerade existieren. */
  get objectCount(): number {
    return this.objects.length + this.smoke.length;
  }

  get isActive(): boolean {
    const { smoke, embers, fireflies, cloudShadows, birds } = this.budget;
    return smoke + embers + fireflies + cloudShadows > 0 || birds;
  }

  render(): void {
    if (!this.isActive || this.objects.length) return;
    for (let index = 0; index < this.budget.embers; index += 1) this.addEmber(index);
    for (let index = 0; index < this.budget.fireflies; index += 1) this.addFirefly(index);
    for (let index = 0; index < this.budget.cloudShadows; index += 1) this.addCloudShadow(index);
    if (this.budget.birds) this.addBirds();
  }

  /** Rauch folgt den Bauten; nur bei geänderter Auswahl wird neu verteilt. */
  sync(state: GameState): void {
    if (!this.budget.smoke) return;
    const tiles = chooseChimneyTiles(state, this.budget.smoke);
    const signature = tiles.join(",");
    if (signature === this.chimneySignature) return;
    this.chimneySignature = signature;
    this.smoke.forEach(puff => { this.scene.tweens.killTweensOf(puff); puff.destroy(); });
    this.smoke.length = 0;
    tiles.forEach((tileIndex, index) => {
      const place = getTilePlacement(tileIndex);
      const seat = getBuildingSeat(tileIndex);
      // Drei versetzte Schwaden je Schornstein; sie bleiben im Bildbereich und ziehen nicht über den Feldnamen.
      for (let puffIndex = 0; puffIndex < 3; puffIndex += 1) this.addSmokePuff(place.x + seat.x, place.y + seat.y - seat.height * .55, index * 3 + puffIndex);
    });
  }

  destroy(): void {
    [...this.objects, ...this.smoke].forEach(object => { this.scene.tweens.killTweensOf(object); object.destroy(); });
    this.objects.length = 0;
    this.smoke.length = 0;
    this.chimneySignature = "";
  }

  private randomIn(region: RegionType, margin = 40) {
    const quadrant = REALM_QUADRANTS[region];
    return {
      x: Phaser.Math.Between(quadrant.x + margin, quadrant.x + quadrant.width - margin),
      y: Phaser.Math.Between(quadrant.y + margin, quadrant.y + quadrant.height - margin)
    };
  }

  private addSmokePuff(x: number, y: number, index: number): void {
    // Volle Füllung, unsichtbar über die Objekt-Deckkraft: Nur so kann onUpdate sie einblenden.
    const puff = this.scene.add.circle(x, y, 8, codexColor("parchment200"), 1).setAlpha(0).setDepth(BOARD_DEPTHS.buildings + 1).setName("ambient-smoke");
    this.smoke.push(puff);
    this.scene.tweens.add({
      targets: puff, y: y - 24, x: x + 8, scale: 1.8, duration: 3_600, delay: index * 1_200 % 3_600, repeat: -1, ease: "Sine.Out",
      onRepeat: () => puff.setPosition(x, y),
      // Sichtbar nur in der Mitte des Wegs: auftauchen, ziehen, vergehen.
      onUpdate: tween => puff.setAlpha(Math.sin(loopProgress(tween) * Math.PI) * .3)
    });
  }

  private addEmber(index: number): void {
    const start = this.randomIn("orcs");
    const ember = this.scene.add.circle(start.x, start.y, Phaser.Math.FloatBetween(2.4, 3.8), index % 3 ? codexColor("oxblood300") : codexColor("gold200"), 1)
      .setAlpha(0).setDepth(BOARD_DEPTHS.decorations + 3).setBlendMode(Phaser.BlendModes.ADD).setName("ambient-ember");
    this.objects.push(ember);
    const restart = () => { const next = this.randomIn("orcs"); ember.setPosition(next.x, next.y); };
    this.scene.tweens.add({
      targets: ember, y: `-=${Phaser.Math.Between(40, 80)}`, x: `+=${Phaser.Math.Between(-12, 12)}`,
      duration: Phaser.Math.Between(2_600, 4_200), delay: index * 410, repeat: -1, ease: "Sine.Out",
      onRepeat: restart,
      onUpdate: tween => ember.setAlpha(Math.sin(loopProgress(tween) * Math.PI))
    });
  }

  private addFirefly(index: number): void {
    const start = this.randomIn("elves", 60);
    const color = index % 2 ? codexColor("gold200") : codexColor("arcane300");
    // Kern und Hof: ein Punkt allein verschwindet auf dem bemalten Wald.
    const firefly = this.scene.add.container(start.x, start.y).setDepth(BOARD_DEPTHS.decorations + 3).setName("ambient-firefly");
    firefly.add([this.scene.add.circle(0, 0, 9, color, .22).setBlendMode(Phaser.BlendModes.ADD), this.scene.add.circle(0, 0, 3, color, 1).setBlendMode(Phaser.BlendModes.ADD)]);
    this.objects.push(firefly);
    this.scene.tweens.add({ targets: firefly, x: `+=${Phaser.Math.Between(-28, 28)}`, y: `+=${Phaser.Math.Between(-22, 22)}`, duration: Phaser.Math.Between(2_400, 4_000), yoyo: true, repeat: -1, ease: "Sine.InOut", delay: index * 170 });
    this.scene.tweens.add({ targets: firefly, alpha: .1, duration: Phaser.Math.Between(700, 1_400), yoyo: true, repeat: -1, ease: "Sine.InOut", delay: index * 230 });
  }

  private addCloudShadow(index: number): void {
    const y = -BOARD_INNER_HALF_HEIGHT * .5 + index * BOARD_INNER_HALF_HEIGHT * 1.1;
    const cloud = this.scene.add.container(-BOARD_HALF_WIDTH - 320, y).setDepth(BOARD_DEPTHS.decorations + 4).setName("ambient-cloud");
    // Drei Ellipsen übereinander ersetzen einen weichen Rand, den Phaser ohne Shader nicht billig hat.
    ([[440, 180, .05], [330, 130, .05], [220, 88, .06]] as const).forEach(([width, height, alpha]) => cloud.add(this.scene.add.ellipse(0, 0, width, height, 0x000000, alpha)));
    this.objects.push(cloud);
    const drift = this.scene.tweens.add({ targets: cloud, x: BOARD_HALF_WIDTH + 320, duration: 70_000, repeat: -1, ease: "Linear" });
    // Nicht alle Wolken starten am Rand: jede beginnt an einer anderen Stelle ihres Wegs.
    drift.seek(20_000 + index * 31_000);
  }

  private addBirds(): void {
    const flock = this.scene.add.container(-BOARD_HALF_WIDTH - 80, -BOARD_HALF_HEIGHT * .45).setDepth(BOARD_DEPTHS.effects - 1).setName("ambient-birds").setAlpha(.75);
    ([[0, 0], [-22, 12], [-20, -14], [-44, 22], [-42, -26]] as const).forEach(([x, y], index) => {
      const bird = this.scene.add.graphics({ x, y });
      bird.lineStyle(2, codexColor("ink900"), .9).beginPath().moveTo(-7, -2).lineTo(0, 3).lineTo(7, -2).strokePath();
      flock.add(bird);
      this.scene.tweens.add({ targets: bird, scaleY: .35, duration: 210 + index * 15, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    });
    this.objects.push(flock);
    // Selten genug, um ein kleiner Moment zu bleiben: alle gut 20 Sekunden ein Zug, der erste nach wenigen Sekunden.
    const cross = (delay: number) => {
      flock.setPosition(-BOARD_HALF_WIDTH - 80, Phaser.Math.Between(-BOARD_HALF_HEIGHT * .6, BOARD_HALF_HEIGHT * .4));
      this.scene.tweens.add({ targets: flock, x: BOARD_HALF_WIDTH + 80, y: `+=${Phaser.Math.Between(-90, 90)}`, duration: 16_000, ease: "Linear", delay, onComplete: () => cross(22_000) });
    };
    cross(4_000);
  }
}
