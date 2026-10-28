import Phaser from "phaser";
import { VALENOR_ASSETS, type ValenorAssetDefinition } from "../assets/asset-manifest";
import { fitImage } from "../assets/asset-runtime";
import { CODEX_FONTS, codexColor } from "../design-tokens";
import { addIconImage, type BoardIconName } from "../icon-textures";
import { BOARD_DEPTHS } from "./board-depths";
import type { GraphicsQuality } from "../visual-config";

export type DeckKind = "adventure" | "fate";

const CARD = { width: 112, height: 157 } as const;
/** So viele Kartenkanten zeigen die Dicke des Stapels. */
const EDGE_COUNT = 9;
/** Versatz je Kante nach rechts unten (Weltpixel): Der Stapel wirkt wie echtes Papier mit Dicke. */
const EDGE_STEP = { x: .9, y: 1.25 } as const;
/** Die oberste Karte hebt sich beim Ziehen sichtbar ab, bevor die große Karte zur Mitte fliegt. */
export const DECK_LIFT_MS = 280;
const DECK_COLORS: Readonly<Record<DeckKind, { glow: number; edge: readonly [number, number] }>> = {
  adventure: { glow: 0xe7c46e, edge: [0xd9c7a2, 0xb59a68] },
  fate: { glow: 0xb7a6f0, edge: [0xd3c8dc, 0x9d8db8] }
};

/**
 * Die zwei Kartenstapel in der Brettmitte: sichtbare Dicke aus vielen Kartenkanten, weicher Schatten, goldener Rahmen,
 * ruhiges Glühen und ab und zu ein Lichtschimmer über der obersten Karte. Auf „low“ und bei reduzierter Bewegung
 * bleibt der Stapel ruhig.
 */
export class CardDeckLayer {
  readonly decks = new Map<DeckKind, Phaser.GameObjects.Container>();
  private readonly tops = new Map<DeckKind, Phaser.GameObjects.Container>();
  private readonly glows = new Map<DeckKind, Phaser.GameObjects.Rectangle>();
  private readonly calm: boolean;

  constructor(private readonly scene: Phaser.Scene, private readonly hasAsset: (asset: ValenorAssetDefinition) => boolean, quality: GraphicsQuality, reducedMotion: boolean) {
    this.calm = quality === "low" || reducedMotion;
    this.create(-390, "ABENTEUER", "adventure", "adventure");
    this.create(390, "SCHICKSAL", "fate", "fate");
  }

  /** Die oberste Karte hebt sich an und gibt den Platz frei; der Stapel glüht kurz auf. */
  draw(kind: DeckKind): void {
    this.reset();
    const top = this.tops.get(kind), glow = this.glows.get(kind);
    if (!top || !glow) return;
    this.scene.tweens.killTweensOf(glow);
    glow.setAlpha(1);
    this.scene.tweens.add({ targets: glow, alpha: .35, duration: 900, ease: "Sine.Out", onComplete: () => this.breathe(kind) });
    if (this.calm) return;
    this.scene.tweens.add({ targets: top, y: -42, scale: 1.12, angle: kind === "adventure" ? -3 : 3, duration: DECK_LIFT_MS, ease: "Back.Out" });
    this.scene.tweens.add({ targets: top, alpha: 0, delay: DECK_LIFT_MS, duration: 140, ease: "Sine.In" });
  }

  /** Oberste Karte zurück auf den Stapel. */
  reset(): void {
    this.tops.forEach(top => { this.scene.tweens.killTweensOf(top); top.setPosition(0, 0).setScale(1).setAngle(0).setAlpha(1); });
  }

  destroy(): void {
    this.decks.forEach(deck => { this.scene.tweens.killTweensOf(deck.list); deck.destroy(); });
    this.decks.clear();
  }

  private create(x: number, label: string, kind: DeckKind, glyph: BoardIconName): void {
    const scene = this.scene, colors = DECK_COLORS[kind];
    const asset = kind === "adventure" ? VALENOR_ASSETS.cards.adventureFrame : VALENOR_ASSETS.cards.fateFrame;
    const deck = scene.add.container(x, 78).setName(`deck-${kind}`).setDepth(BOARD_DEPTHS.decorations + 4).setRotation(x < 0 ? -.035 : .035);
    const depth = { x: EDGE_COUNT * EDGE_STEP.x, y: EDGE_COUNT * EDGE_STEP.y };
    // Weicher Schatten: mehrere Ellipsen nach außen immer blasser.
    for (const [grow, alpha] of [[34, .07], [22, .1], [10, .16]] as const) {
      deck.add(scene.add.ellipse(depth.x + 6, depth.y + 8, CARD.width + grow, CARD.height + grow * .8, 0x000000, alpha));
    }
    const glow = scene.add.rectangle(depth.x / 2, depth.y / 2, CARD.width + 18, CARD.height + 18, colors.glow, .12)
      .setStrokeStyle(4, colors.glow, .55).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.35).setName("deck-glow");
    deck.add(glow);
    // Kartenkanten von unten nach oben: abwechselnd heller und dunkler, damit man einzelne Karten erkennt.
    for (let index = EDGE_COUNT; index >= 1; index -= 1) {
      const edge = scene.add.rectangle(index * EDGE_STEP.x, index * EDGE_STEP.y, CARD.width, CARD.height, colors.edge[index % 2]!, 1)
        .setStrokeStyle(1, 0x5d4528, .55);
      deck.add(edge);
    }
    // Die nächste Karte: Sie wird sichtbar, wenn sich die oberste abhebt.
    if (this.hasAsset(asset)) deck.add(fitImage(scene.add.image(EDGE_STEP.x, EDGE_STEP.y, asset.key), CARD.width, CARD.height, "contain").setTint(0xcfc2a6));
    deck.add(scene.add.rectangle(EDGE_STEP.x, EDGE_STEP.y, CARD.width + 2, CARD.height + 2, 0x000000, 0).setStrokeStyle(1.5, 0xc9a24f, .7));
    const top = scene.add.container(0, 0).setName(`deck-top-${kind}`);
    const face = this.hasAsset(asset)
      ? fitImage(scene.add.image(0, 0, asset.key), CARD.width, CARD.height, "contain")
      : scene.add.rectangle(0, 0, CARD.width, CARD.height, kind === "adventure" ? 0x5b321d : 0x272653);
    top.add(face);
    // Goldener Rahmen: kräftige Außenlinie und feine Innenlinie.
    top.add(scene.add.rectangle(0, 0, CARD.width, CARD.height, 0x000000, 0).setStrokeStyle(3, 0xd8b968, 1));
    top.add(scene.add.rectangle(0, 0, CARD.width - 12, CARD.height - 12, 0x000000, 0).setStrokeStyle(1, 0xf3d98f, .6));
    top.add(addIconImage(scene, 0, -4, glyph, 36, codexColor("leather600")));
    top.add(scene.add.text(0, 27, label, { color: "#352315", fontFamily: CODEX_FONTS.display, fontSize: "12px", fontStyle: "bold" }).setOrigin(.5).setResolution(2));
    if (!this.calm && scene.game.renderer.type === Phaser.WEBGL) this.addShimmer(top);
    deck.add(top);
    this.decks.set(kind, deck);
    this.tops.set(kind, top);
    this.glows.set(kind, glow);
    this.breathe(kind);
  }

  /** Ein schmaler Lichtstreif gleitet alle paar Sekunden schräg über die oberste Karte. */
  private addShimmer(top: Phaser.GameObjects.Container): void {
    const streak = this.scene.add.rectangle(-CARD.width, 0, 26, CARD.height * 1.6, 0xfff3c8, .22).setAngle(18).setBlendMode(Phaser.BlendModes.ADD);
    const shape = this.scene.make.graphics({}, false).fillRect(-CARD.width / 2, -CARD.height / 2, CARD.width, CARD.height);
    // Die Maske folgt dem Container nicht von selbst; sie wird je Bild an die Weltlage der Karte gesetzt.
    const mask = shape.createGeometryMask();
    streak.setMask(mask);
    top.add(streak);
    top.once(Phaser.GameObjects.Events.DESTROY, () => { mask.destroy(); shape.destroy(); });
    const follow = () => {
      const matrix = top.getWorldTransformMatrix();
      shape.setPosition(matrix.tx, matrix.ty).setRotation(matrix.rotation).setScale(matrix.scaleX, matrix.scaleY);
    };
    this.scene.events.on(Phaser.Scenes.Events.PRE_RENDER, follow);
    top.once(Phaser.GameObjects.Events.DESTROY, () => this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, follow));
    this.scene.tweens.add({ targets: streak, x: CARD.width, duration: 1_100, delay: 2_800 + Math.random() * 2_000, repeatDelay: 5_200, repeat: -1, ease: "Sine.InOut" });
  }

  private breathe(kind: DeckKind): void {
    const glow = this.glows.get(kind);
    if (!glow || this.calm) return;
    this.scene.tweens.add({ targets: glow, alpha: { from: .35, to: .6 }, duration: 2_400, yoyo: true, repeat: -1, ease: "Sine.InOut" });
  }
}
