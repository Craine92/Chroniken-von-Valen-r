import Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../board-layout";
import { BOARD_DEPTHS } from "./board-depths";

const SPARK_TEXTURE = "victory-spark";
/** So lange regnet es Funken; danach übernimmt die Siegerehrung (VICTORY_MOMENT_MS). */
const SPARK_RAIN_MS = 4_600;

/**
 * Bühne für den Sieg: Das Brett dunkelt ab und lässt einen Lichtkreis um die Siegerfigur frei, von oben fällt ein
 * Lichtkegel, goldene Funken regnen herab. Bei „calm“ (reduzierte Bewegung, „low“) nur ein ruhiger Lichtring.
 */
export class VictoryStageLayer {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly calm: boolean) {}

  celebrate(x: number, y: number): void {
    this.clear();
    const scene = this.scene;
    const ring = scene.add.ellipse(x, y + 18, 150, 54, 0xffd77a, .35).setBlendMode(Phaser.BlendModes.ADD).setDepth(BOARD_DEPTHS.players - 1).setName("victory-ring");
    this.objects.push(ring);
    if (this.calm) return;
    scene.tweens.add({ targets: ring, scaleX: 1.25, scaleY: 1.25, alpha: .2, duration: 900, yoyo: true, repeat: -1, ease: "Sine.InOut" });

    if (scene.game.renderer.type === Phaser.WEBGL) {
      const shade = scene.add.rectangle(0, 0, BOARD_WIDTH + 1_200, BOARD_HEIGHT + 800, 0x000000, 0).setDepth(BOARD_DEPTHS.players - 2).setName("victory-shade");
      const hole = scene.make.graphics({}, false).fillStyle(0xffffff).fillCircle(x, y, 120);
      const mask = hole.createGeometryMask();
      mask.setInvertAlpha(true);
      shade.setMask(mask).once(Phaser.GameObjects.Events.DESTROY, () => { mask.destroy(); hole.destroy(); });
      scene.tweens.add({ targets: shade, fillAlpha: .5, duration: 700, ease: "Sine.Out" });
      this.objects.push(shade);
    }

    // Lichtkegel: übereinanderliegende Dreiecke, nach außen blasser.
    const cone = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(BOARD_DEPTHS.effects).setAlpha(0).setName("victory-cone");
    for (const [spread, alpha] of [[1, .05], [.75, .07], [.5, .09], [.28, .12]] as const) {
      cone.fillStyle(0xfff0c0, alpha).fillTriangle(x - 26 * spread, y - 560, x + 26 * spread, y - 560, x + 170 * spread, y + 40);
      cone.fillTriangle(x - 26 * spread, y - 560, x - 170 * spread, y + 40, x + 170 * spread, y + 40);
    }
    scene.tweens.add({ targets: cone, alpha: 1, duration: 800, ease: "Sine.Out" });
    this.objects.push(cone);

    if (!scene.textures.exists(SPARK_TEXTURE)) {
      const dot = scene.make.graphics({}, false);
      dot.fillStyle(0xffffff, 1).fillCircle(6, 6, 6).fillStyle(0xffffff, .35).fillCircle(6, 6, 6);
      dot.generateTexture(SPARK_TEXTURE, 12, 12);
      dot.destroy();
    }
    const sparks = scene.add.particles(x, y - 360, SPARK_TEXTURE, {
      x: { min: -190, max: 190 }, speedY: { min: 60, max: 180 }, speedX: { min: -25, max: 25 }, gravityY: 90,
      lifespan: 2_800, scale: { start: .75, end: .15 }, alpha: { start: 1, end: 0 }, tint: [0xffe08a, 0xffc24a, 0xfff3c8],
      frequency: 45, blendMode: Phaser.BlendModes.ADD
    }).setDepth(BOARD_DEPTHS.effects + 1).setName("victory-sparks");
    scene.time.delayedCall(SPARK_RAIN_MS, () => sparks.stop());
    this.objects.push(sparks);
    scene.game.canvas.dataset.victoryStage = "true";
  }

  clear(): void {
    this.scene.tweens.killTweensOf(this.objects);
    this.objects.splice(0).forEach(object => object.destroy());
  }
}
