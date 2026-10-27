import Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH, getTileWorldPosition } from "../board-layout";
import { CODEX_DURATIONS, CODEX_FONTS, codexColor } from "../design-tokens";
import { addIconImage } from "../icon-textures";
import { DRAMA_MAX_DURATION_MS, type DramaticMoment } from "../living/drama";
import { getBoardTileVisualLayout } from "../tiles/board-tile-layout";
import type { LivingBoardSettings } from "../visual-config";
import { BOARD_DEPTHS } from "./board-depths";

const { fast, base, slow } = CODEX_DURATIONS;

/**
 * Kurze Inszenierung besonderer Momente. Jeder Effekt räumt sich nach spätestens DRAMA_MAX_DURATION_MS selbst ab
 * und blockiert nichts: Der Server wartet nie auf ihn, Eingaben gehen durch.
 * „calm“ (reduzierte Bewegung, Stufe „low“) zeigt nur einen ruhigen Farbakzent ohne Bewegung und ohne Abdunkeln.
 */
export class DramaEffectsLayer {
  private readonly active = new Set<Phaser.GameObjects.GameObject>();

  constructor(private readonly scene: Phaser.Scene, private readonly mode: LivingBoardSettings["drama"]) {}

  play(moment: DramaticMoment): void {
    switch (moment.kind) {
      case "highRent":
        if (moment.tileIndex === undefined) return;
        this.dimAround(moment.tileIndex, .3);
        this.flashTile(moment.tileIndex, codexColor("oxblood400"));
        this.floatAmount(moment.tileIndex, `−${moment.amount.toLocaleString("de-DE")} GOLD`);
        return;
      case "dragon":
        if (moment.tileIndex === undefined) return;
        this.dimAround(moment.tileIndex, .38);
        this.ring(moment.tileIndex, codexColor("arcane300"));
        return;
      case "tradeSealed":
        this.seal();
        return;
      case "bankrupt":
        this.dimAround(undefined, .34);
        return;
    }
  }

  destroy(): void {
    this.active.forEach(object => { this.scene.tweens.killTweensOf(object); object.destroy(); });
    this.active.clear();
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.active.add(object);
    // Sicherheitsnetz: Nichts bleibt länger als die Höchstdauer stehen, auch wenn ein Tween abbricht.
    this.scene.time.delayedCall(DRAMA_MAX_DURATION_MS + 100, () => this.release(object));
    return object;
  }

  private release(object: Phaser.GameObjects.GameObject): void {
    if (!this.active.delete(object)) return;
    this.scene.tweens.killTweensOf(object);
    object.destroy();
  }

  /** Dunkelt das Brett kurz ab und spart das Feld aus. Nur mit WebGL und nur im vollen Modus. */
  private dimAround(tileIndex: number | undefined, strength: number): void {
    if (this.mode !== "full") return;
    const shade = this.track(this.scene.add.rectangle(0, 0, BOARD_WIDTH + 1_200, BOARD_HEIGHT + 800, codexColor("black"), 0)
      .setDepth(BOARD_DEPTHS.players - 1).setName("drama-shade"));
    if (tileIndex !== undefined) {
      if (this.scene.game.renderer.type !== Phaser.WEBGL) { this.release(shade); return; }
      const layout = getBoardTileVisualLayout(tileIndex);
      const hole = this.scene.make.graphics({}, false).fillStyle(0xffffff).fillRoundedRect(layout.x - layout.width / 2 - 10, layout.y - layout.height / 2 - 10, layout.width + 20, layout.height + 20, 10);
      const mask = hole.createGeometryMask();
      mask.setInvertAlpha(true);
      shade.setMask(mask).once(Phaser.GameObjects.Events.DESTROY, () => { mask.destroy(); hole.destroy(); });
    }
    this.scene.tweens.add({ targets: shade, fillAlpha: strength, duration: base, ease: "Sine.Out", yoyo: true, hold: slow + base, onComplete: () => this.release(shade) });
  }

  private flashTile(tileIndex: number, color: number): void {
    const layout = getBoardTileVisualLayout(tileIndex);
    const glow = this.track(this.scene.add.rectangle(layout.x, layout.y, layout.width - 6, layout.height - 6, color, .18)
      .setStrokeStyle(6, color, .95).setDepth(BOARD_DEPTHS.effects).setName("drama-tile"));
    if (this.mode === "calm") {
      this.scene.tweens.add({ targets: glow, alpha: 0, delay: slow, duration: slow, onComplete: () => this.release(glow) });
      return;
    }
    glow.setAlpha(0);
    this.scene.tweens.add({ targets: glow, alpha: 1, duration: fast, yoyo: true, repeat: 2, hold: base / 2, onComplete: () => this.release(glow) });
  }

  private floatAmount(tileIndex: number, label: string): void {
    // Ein Stück zur Brettmitte hin, damit der Betrag nicht über den Namen der Nachbarfelder liegt.
    const tile = getTileWorldPosition(tileIndex);
    const x = tile.x * .9, y = tile.y * .72;
    const text = this.track(this.scene.add.text(x, y, label, {
      fontFamily: CODEX_FONTS.display, fontSize: "34px", fontStyle: "bold", color: "#f0a59a", stroke: "#100c10", strokeThickness: 7
    }).setOrigin(.5).setDepth(BOARD_DEPTHS.ui).setName("drama-amount"));
    this.scene.tweens.add({
      targets: text, alpha: 0, delay: slow + base, duration: slow, ease: "Sine.In",
      ...(this.mode === "full" ? { y: y - 40 } : {}),
      onComplete: () => this.release(text)
    });
  }

  private ring(tileIndex: number, color: number): void {
    const position = getTileWorldPosition(tileIndex);
    const ring = this.track(this.scene.add.circle(position.x, position.y, 34, color, .12).setStrokeStyle(5, color, .9)
      .setDepth(BOARD_DEPTHS.effects).setBlendMode(Phaser.BlendModes.ADD).setName("drama-ring"));
    this.scene.tweens.add({
      targets: ring, alpha: 0, duration: slow * 2, ease: "Sine.Out",
      ...(this.mode === "full" ? { scale: 3.6 } : { delay: slow }),
      onComplete: () => this.release(ring)
    });
  }

  /** Ein Wachssiegel in der Brettmitte: drückt sich auf, bleibt kurz, verblasst. */
  private seal(): void {
    const seal = this.track(this.scene.add.container(0, 0).setDepth(BOARD_DEPTHS.ui).setName("drama-seal"));
    seal.add([
      this.scene.add.circle(4, 6, 70, codexColor("black"), .35),
      this.scene.add.circle(0, 0, 68, codexColor("oxblood500"), 1).setStrokeStyle(5, codexColor("gold400"), 1),
      this.scene.add.circle(0, 0, 54, codexColor("oxblood500"), 0).setStrokeStyle(2, codexColor("oxblood300"), .7),
      addIconImage(this.scene, 0, 0, "seal", 74, codexColor("gold200"))
    ]);
    seal.setAlpha(0);
    if (this.mode === "full") seal.setScale(1.7);
    this.scene.tweens.add({
      targets: seal, alpha: 1, scale: 1, duration: base, ease: this.mode === "full" ? "Back.Out" : "Linear",
      onComplete: () => this.scene.tweens.add({ targets: seal, alpha: 0, delay: slow, duration: slow, onComplete: () => this.release(seal) })
    });
  }
}
