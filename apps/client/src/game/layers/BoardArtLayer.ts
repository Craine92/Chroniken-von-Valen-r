import Phaser from "phaser";
import { getActiveChronicleEvent, getChronicleTargetRegions, type GameState, type RegionType } from "@valenor/shared";
import { BOARD_HEIGHT, BOARD_INNER_HALF_HEIGHT, BOARD_INNER_HALF_WIDTH, BOARD_INNER_HEIGHT, BOARD_INNER_WIDTH, BOARD_WIDTH, getTileWorldPosition } from "../board-layout";
import { VALENOR_ASSETS, type AtlasAssetDefinition, type ImageAssetDefinition } from "../assets/asset-manifest";
import { addFittedImage, hasLoadedAsset, type AssetFit } from "../assets/asset-runtime";
import { ANIMATED_REALM_DECORATIONS, REALM_DECORATIONS } from "../assets/realm-decoration-config";
import { BOARD_EFFECT_DECORATIONS } from "../assets/board-effect-config";
import { BOARD_DEPTHS } from "./board-depths";

interface RealmArtPlacement {
  realm: RegionType;
  asset: ImageAssetDefinition;
  points: Phaser.Types.Math.Vector2Like[];
}

export class BoardArtLayer {
  private readonly maskSources: Phaser.GameObjects.Graphics[] = [];
  private readonly realmPoints = new Map<RegionType, Phaser.Types.Math.Vector2Like[]>();
  private readonly chronicleMarkers = new Map<RegionType, Phaser.GameObjects.Graphics>();
  private chronicleSignature = "";
  private readonly realmLabels: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  hasAsset(asset: ImageAssetDefinition | AtlasAssetDefinition): boolean {
    return hasLoadedAsset(this.scene, asset);
  }

  addImage(
    asset: ImageAssetDefinition,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    fit: AssetFit = "contain"
  ): Phaser.GameObjects.Image | undefined {
    return addFittedImage(this.scene, asset, x, y, width, height, depth, fit);
  }

  renderTable(): boolean {
    return Boolean(this.addImage(
      VALENOR_ASSETS.board.table,
      0,
      0,
      BOARD_WIDTH + 1_200,
      BOARD_HEIGHT + 400,
      BOARD_DEPTHS.table,
      "cover"
    ));
  }

  renderRealmBackgrounds(): Set<RegionType> {
    const rendered = new Set<RegionType>();
    const edgeX = BOARD_INNER_HALF_WIDTH;
    const edgeY = BOARD_INNER_HALF_HEIGHT;
    if (this.addImage(VALENOR_ASSETS.board.innerBackground, 0, 0, BOARD_INNER_WIDTH, BOARD_INNER_HEIGHT, BOARD_DEPTHS.realmBackground, "cover")) {
      (["elves", "humans", "orcs", "steppe"] as const).forEach((realm) => rendered.add(realm));
    }
    const placements: readonly RealmArtPlacement[] = [
      {
        realm: "elves",
        asset: VALENOR_ASSETS.realms.elven.background,
        points: [{ x: -edgeX, y: 0 }, { x: 0, y: 0 }, { x: 0, y: edgeY }, { x: -edgeX, y: edgeY }]
      },
      {
        realm: "humans",
        asset: VALENOR_ASSETS.realms.human.background,
        points: [{ x: -edgeX, y: -edgeY }, { x: 0, y: -edgeY }, { x: 0, y: 0 }, { x: -edgeX, y: 0 }]
      },
      {
        realm: "orcs",
        asset: VALENOR_ASSETS.realms.orc.background,
        points: [{ x: 0, y: -edgeY }, { x: edgeX, y: -edgeY }, { x: edgeX, y: 0 }, { x: 0, y: 0 }]
      },
      {
        realm: "steppe",
        asset: VALENOR_ASSETS.realms.steppe.background,
        points: [{ x: 0, y: 0 }, { x: edgeX, y: 0 }, { x: edgeX, y: edgeY }, { x: 0, y: edgeY }]
      }
    ];
    placements.forEach(({ realm, asset, points }) => {
      this.realmPoints.set(realm, points);
      const names={elves:"AMETHYSTWALD",humans:"KRONENWALD",orcs:"EISENÖDE",steppe:"SONNENSTEPPE"};
      const x=(realm === "elves" || realm === "humans" ? -1 : 1)*edgeX*.62;
      const y=(realm === "humans" || realm === "orcs" ? -1 : 1)*edgeY*.8;
      this.realmLabels.push(this.scene.add.text(x,y,names[realm],{fontFamily:"Georgia,serif",fontSize:"28px",color:"#e2d2ac",letterSpacing:3,stroke:"#16130f",strokeThickness:4,shadow:{color:"#000000",blur:6,fill:true}}).setOrigin(.5).setAlpha(.85).setDepth(BOARD_DEPTHS.decorations+3).setName(`realm-label-${realm}`));
      const image = this.addMaskedRealmImage(asset, points);
      if (!image) return;
      rendered.add(realm);
      this.scene.add.graphics()
        .setDepth(BOARD_DEPTHS.realmBackground + 1)
        .fillStyle(0x08070a, .16)
        .fillPoints(points, true);
    });
    return rendered;
  }

  destroy(): void {
    this.clearChronicleMarkers();
    this.realmPoints.clear();
    this.realmLabels.forEach(label=>label.destroy());this.realmLabels.length=0;
    this.maskSources.forEach((source) => source.destroy());
    this.maskSources.length = 0;
  }

  syncChronicle(state: GameState, reducedMotion = false): void {
    const event = state.status === "playing" ? getActiveChronicleEvent(state) : undefined;
    const regions = getChronicleTargetRegions(event);
    const signature = regions.length ? `${event!.id}:${event!.startedAtRound}:${event!.effectType}:${[...regions].sort().join(",")}` : "";
    if (signature === this.chronicleSignature) return;
    this.clearChronicleMarkers();
    this.chronicleSignature = signature;
    const aura = event && ["regionalRentBonus", "buildSurcharge"].includes(event.effectType) ? 0x9b263e : event && ["purchaseDiscount", "buildDiscount", "mortgageDiscount", "buildingSaleBonus"].includes(event.effectType) ? 0x87a466 : 0xb5c6d7;
    regions.forEach(region => {
      const points = this.realmPoints.get(region);
      if (!points) return;
      const graphics = this.scene.add.graphics().setName(`chronicle-realm-${region}`).setDepth(BOARD_DEPTHS.decorations + 2);
      graphics.fillStyle(0xe9c578, .018).fillPoints(points, true);
      graphics.fillStyle(aura, .045).fillPoints(points, true);
      graphics.lineStyle(14, 0xefc86d, .12).strokePoints(points, true);
      graphics.lineStyle(3, 0xf5d58a, .85).strokePoints(points, true);
      this.chronicleMarkers.set(region, graphics);
      if (!reducedMotion) this.scene.tweens.add({ targets: graphics, alpha: .65, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    });
    if (import.meta.env.DEV) this.scene.game.canvas.dataset.chronicleRegions = JSON.stringify([...this.chronicleMarkers.keys()]);
  }

  private clearChronicleMarkers(): void {
    this.chronicleMarkers.forEach(marker => { this.scene.tweens.killTweensOf(marker); marker.destroy(); });
    this.chronicleMarkers.clear();
    this.chronicleSignature = "";
  }

  renderRealmDecorations(): Set<RegionType> {
    const renderedCounts = new Map<RegionType, number>();
    REALM_DECORATIONS.forEach((placement) => {
      if (!this.hasAsset(placement.asset)) return;
      this.scene.add.image(placement.x * 1.52, placement.y * .76, placement.asset.key)
        .setScale(placement.scale)
        .setDepth(placement.depth)
        .setRotation(placement.rotation ?? 0)
        .setFlipX(placement.flipX ?? false)
        .setOrigin(.5, .78);
      renderedCounts.set(placement.realm, (renderedCounts.get(placement.realm) ?? 0) + 1);
    });
    ANIMATED_REALM_DECORATIONS.forEach((placement) => {
      const sprite = this.addAtlasSprite(placement.asset, placement.x * 1.52, placement.y * .76, placement.depth);
      if (!sprite) return;
      sprite.setScale(placement.scale).setRotation(placement.rotation ?? 0).setFlipX(placement.flipX ?? false);
    });
    const complete = new Set<RegionType>();
    (["elves", "humans", "orcs", "steppe"] as const).forEach((realm) => {
      const required = REALM_DECORATIONS.filter((placement) => placement.realm === realm).length;
      if (required > 0 && renderedCounts.get(realm) === required) complete.add(realm);
    });
    return complete;
  }

  renderBoardEffects(): void {
    BOARD_EFFECT_DECORATIONS.forEach((placement) => {
      const position = getTileWorldPosition(placement.tileIndex);
      this.addAtlasSprite(
        placement.asset,
        position.x + placement.offsetX,
        position.y + placement.offsetY,
        placement.depth
      )?.setScale(placement.scale);
    });
  }

  addAtlasSprite(asset: AtlasAssetDefinition, x: number, y: number, depth: number): Phaser.GameObjects.Sprite | undefined {
    if (!this.hasAsset(asset)) return undefined;
    const frames = this.scene.anims.generateFrameNames(asset.key, {
      prefix: asset.animation.prefix,
      start: asset.animation.start,
      end: asset.animation.end,
      zeroPad: asset.animation.zeroPad
    });
    if (!frames.length) return undefined;
    if (!this.scene.anims.exists(asset.animation.key)) {
      this.scene.anims.create({ key: asset.animation.key, frames, frameRate: asset.animation.frameRate, repeat: -1 });
    }
    return this.scene.add.sprite(x, y, asset.key, frames[0]!.frame).setDepth(depth).play(asset.animation.key);
  }

  private addMaskedRealmImage(
    asset: ImageAssetDefinition,
    points: Phaser.Types.Math.Vector2Like[]
  ): Phaser.GameObjects.Image | undefined {
    if (!this.hasAsset(asset)) return undefined;
    const xs = points.map((point) => point.x ?? 0);
    const ys = points.map((point) => point.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const image = this.addImage(
      asset,
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      maxX - minX + 8,
      maxY - minY + 8,
      BOARD_DEPTHS.realmBackground,
      "cover"
    );
    if (!image) return undefined;
    const maskSource = this.scene.make.graphics({ x: 0, y: 0 }, false);
    maskSource.fillStyle(0xffffff, 1).fillPoints(points, true);
    image.setMask(maskSource.createGeometryMask());
    this.maskSources.push(maskSource);
    return image;
  }
}
