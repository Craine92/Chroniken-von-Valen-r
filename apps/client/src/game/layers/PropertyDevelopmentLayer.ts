import Phaser from "phaser";
import { BOARD_TILES, type BuildingLevel, type GameState, type RegionType } from "@valenor/shared";
import { getInnerEdgeOffset, getTilePlacement } from "../board-layout";
import { getBuildingAsset } from "../assets/asset-manifest";
import { fitImage, hasLoadedAsset } from "../assets/asset-runtime";
import { BOARD_DEPTHS } from "./board-depths";

const REALM_LIGHT: Record<RegionType, number> = {
  elves: 0xb98cff,
  humans: 0xf0cf72,
  orcs: 0xff7545,
  steppe: 0xf3b85b
};

export class PropertyDevelopmentLayer {
  private readonly developments = new Map<number, Phaser.GameObjects.Container>();
  private readonly levels = new Map<number, BuildingLevel>();
  private visualScale = 1;

  constructor(private readonly scene: Phaser.Scene) {}

  sync(state: GameState, animate: boolean): void {
    const active = new Set<number>();
    state.propertyOwnerships.forEach((ownership) => {
      const tile = BOARD_TILES[ownership.tileIndex];
      if (!tile?.region || tile.type !== "property" || ownership.buildingLevel === 0) return;
      active.add(tile.index);
      const previous = this.levels.get(tile.index) ?? 0;
      if (previous === ownership.buildingLevel && this.developments.has(tile.index)) return;
      const previousDevelopment = this.developments.get(tile.index);
      if (previousDevelopment && animate && previous === 4 && ownership.buildingLevel === 5) {
        this.scene.tweens.add({ targets: previousDevelopment, alpha: 0, duration: 220, onComplete: () => previousDevelopment.destroy() });
      } else {
        previousDevelopment?.destroy();
      }
      const development = this.createDevelopment(tile.index, tile.region, ownership.buildingLevel);
      this.developments.set(tile.index, development);
      this.levels.set(tile.index, ownership.buildingLevel);
      if (animate && ownership.buildingLevel > previous) this.animateBuild(development, tile.region, ownership.buildingLevel === 5);
    });
    [...this.developments.keys()].forEach((tileIndex) => {
      if (active.has(tileIndex)) return;
      this.developments.get(tileIndex)?.destroy();
      this.developments.delete(tileIndex);
      this.levels.delete(tileIndex);
    });
  }

  destroy(): void {
    this.developments.forEach((development) => development.destroy());
    this.developments.clear();
    this.levels.clear();
  }

  setVisualScale(scale: number): void {
    this.visualScale = scale;
    this.developments.forEach((development) => development.setScale(scale));
  }

  private createDevelopment(tileIndex: number, region: RegionType, level: BuildingLevel): Phaser.GameObjects.Container {
    const place = getTilePlacement(tileIndex);
    const inner = getInnerEdgeOffset(tileIndex, 34);
    const container = this.scene.add.container(place.x + inner.x, place.y + inner.y).setRotation(place.rotation).setScale(this.visualScale).setDepth(BOARD_DEPTHS.buildings);
    const shadow = this.scene.add.ellipse(2, 10, level === 5 ? 48 : 37, level === 5 ? 19 : 13, 0x000000, .42);
    const ground = this.scene.add.ellipse(0, 7, level === 5 ? 44 : 34, level === 5 ? 16 : 11, region === "orcs" ? 0x583426 : region === "steppe" ? 0x74613b : 0x2d3a2d, .92).setStrokeStyle(1, REALM_LIGHT[region], .42);
    const glow = this.scene.add.circle(0, 0, level === 5 ? 26 : 19, REALM_LIGHT[region], level === 5 ? 0.24 : 0.13);
    container.add([shadow, ground, glow]);
    const artAsset = getBuildingAsset(region, level);
    if (artAsset && hasLoadedAsset(this.scene, artAsset)) {
      const building = fitImage(
        this.scene.add.image(0, -10, artAsset.key),
        level === 5 ? 46 : 38 + level,
        level === 5 ? 62 : 50 + level,
        "contain"
      ).setOrigin(.5, .78).setRotation(-place.rotation);
      const rank = this.scene.add.graphics().setPosition(0, 10).setRotation(-place.rotation);
      const pipCount = level === 5 ? 1 : level;
      for (let index = 0; index < pipCount; index += 1) {
        const x = (index - (pipCount - 1) / 2) * 7;
        rank.fillStyle(level === 5 ? 0xf3d681 : REALM_LIGHT[region], .95).fillCircle(x, 0, level === 5 ? 3.5 : 2.2);
      }
      container.add([building, rank]);
      this.addLevelBadge(container, place.rotation, level);
      return container;
    }
    if (level === 5) this.drawGrandStructure(container, region);
    else this.drawSettlement(container, region, level);
    this.addLevelBadge(container, place.rotation, level);
    return container;
  }

  private addLevelBadge(container: Phaser.GameObjects.Container, rotation: number, level: BuildingLevel): void {
    const badge = this.scene.add.graphics().setPosition(18, 12).setRotation(-rotation);
    badge.fillStyle(0x08080b, .94).fillRoundedRect(-11, -7, 22, 14, 4);
    badge.lineStyle(1.5, level === 5 ? 0xf3d681 : 0xd8bd78, .98).strokeRoundedRect(-11, -7, 22, 14, 4);
    const label = this.scene.add.text(18, 12, `L${level}`, {
      color: level === 5 ? "#fff0a8" : "#fff7dc", fontFamily: "Arial,sans-serif", fontSize: "9px", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 2
    }).setOrigin(.5).setRotation(-rotation).setResolution(2);
    container.add([badge, label]);
  }

  private drawSettlement(container: Phaser.GameObjects.Container, region: RegionType, level: BuildingLevel): void {
    const positions: Array<[number, number]> = [[0, 0], [-15, 5], [15, 5], [0, -8]];
    positions.slice(0, level).forEach(([x, y], index) => {
      const graphics = this.scene.add.graphics().setPosition(x, y);
      if (region === "elves") {
        graphics.lineStyle(3, 0x6c4b80, 1).beginPath().moveTo(0, 8).lineTo(-5, -2).lineTo(1, -13).strokePath();
        graphics.fillStyle(0x9b6dc4, 1).fillEllipse(2, -8, 9, 14);
        graphics.fillStyle(0xe2c7ff, 0.9).fillCircle(index % 2 ? -3 : 4, -12, 2);
      } else if (region === "humans") {
        graphics.fillStyle(0x8e897c, 1).fillRect(-6, -4, 12, 12);
        graphics.fillStyle(0xb3844e, 1).fillTriangle(-8, -4, 0, -13, 8, -4);
        graphics.fillStyle(0xf4cf70, 0.9).fillRect(-2, 1, 4, 5);
      } else if (region === "orcs") {
        graphics.fillStyle(0x3c3b38, 1).fillTriangle(-8, 8, -6, -9, 7, 8);
        graphics.lineStyle(2, 0x7c5a3b, 1).lineBetween(-9, 8, -10, -11).lineBetween(9, 8, 10, -11);
        graphics.fillStyle(0xff6a35, 0.95).fillTriangle(-3, 5, 0, -4, 3, 5);
      } else {
        graphics.fillStyle(0xb69155, 1).fillTriangle(-9, 7, 0, -11, 9, 7);
        graphics.lineStyle(2, 0x694f32, 1).lineBetween(0, -11, 0, 8);
        graphics.fillStyle(0xf6c766, 0.9).fillCircle(0, 1, 2);
        if (index > 1) graphics.fillStyle(0xc65f3d, 1).fillTriangle(1, -9, 8, -6, 1, -3);
      }
      container.add(graphics);
    });
    if (level >= 3) {
      const detail = this.scene.add.graphics();
      detail.lineStyle(1, 0xe4cf91, .55).beginPath().moveTo(-22, 11).lineTo(-22, -3).lineTo(-17, -7).moveTo(22, 11).lineTo(22, -3).lineTo(17, -7).strokePath();
      if (level === 4) detail.lineStyle(2, REALM_LIGHT[region], .72).strokeCircle(0, 1, 23);
      container.add(detail);
    }
  }

  private drawGrandStructure(container: Phaser.GameObjects.Container, region: RegionType): void {
    const graphics = this.scene.add.graphics();
    if (region === "elves") {
      graphics.lineStyle(3, 0xc09aff, 0.9).strokeCircle(0, 2, 17);
      graphics.fillStyle(0x6e4d93, 1).fillTriangle(-15, 13, 0, -22, 15, 13);
      graphics.fillStyle(0xe1ceff, 0.95).fillCircle(0, -17, 4);
      graphics.lineStyle(2, 0xa972e8, 0.8).beginPath().moveTo(-15, 10).lineTo(-22, -4).lineTo(-11, -14).strokePath();
      graphics.beginPath().moveTo(15, 10).lineTo(22, -4).lineTo(11, -14).strokePath();
    } else if (region === "humans") {
      graphics.fillStyle(0x77756f, 1).fillRect(-17, -8, 34, 23);
      graphics.fillStyle(0xaca796, 1).fillRect(-14, -20, 9, 35).fillRect(5, -20, 9, 35);
      graphics.fillStyle(0xd6ac52, 1).fillTriangle(-17, -20, -9, -30, -2, -20).fillTriangle(2, -20, 9, -30, 17, -20);
      graphics.fillStyle(0xf4d776, 1).fillRect(-3, 1, 6, 14);
    } else if (region === "orcs") {
      graphics.fillStyle(0x353738, 1).fillRect(-18, -9, 36, 24);
      graphics.fillStyle(0x55514a, 1).fillTriangle(-21, -9, -12, -28, -5, -9).fillTriangle(5, -9, 12, -28, 21, -9);
      graphics.lineStyle(3, 0x74543a, 1).lineBetween(-22, 16, -25, -22).lineBetween(22, 16, 25, -22);
      graphics.fillStyle(0xff6335, 1).fillTriangle(-4, 13, 0, -5, 4, 13);
    } else {
      graphics.fillStyle(0xa87842, 1).fillTriangle(-22, 14, 0, -24, 22, 14);
      graphics.lineStyle(3, 0xe0b96d, 0.9).strokeTriangle(-22, 14, 0, -24, 22, 14);
      graphics.lineStyle(2, 0x64442b, 1).lineBetween(0, -24, 0, 16);
      graphics.fillStyle(0xd65f3e, 1).fillTriangle(2, -22, 18, -16, 2, -9);
      graphics.fillStyle(0xffda78, 1).fillCircle(0, 2, 4);
    }
    const light = this.scene.add.circle(0, -5, 5, REALM_LIGHT[region], .62);
    const rune = this.scene.add.circle(0, 4, 27, 0x000000, 0).setStrokeStyle(2, REALM_LIGHT[region], .55);
    container.add([rune, graphics, light]);
    this.scene.tweens.add({ targets: light, alpha: .22, scale: 1.35, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.InOut" });
  }

  private animateBuild(container: Phaser.GameObjects.Container, region: RegionType, grand: boolean): void {
    container.setAlpha(0).setScale(this.visualScale * (grand ? 0.35 : 0.55));
    const duration = grand ? 1_050 : 540;
    this.scene.tweens.add({ targets: container, alpha: 1, scale: this.visualScale, duration, ease: "Back.Out" });
    if (grand) this.scene.cameras.main.flash(180, 217, 187, 120, false, undefined, this);
    const ring = this.scene.add.circle(container.x, container.y, grand ? 9 : 5, REALM_LIGHT[region], 0)
      .setStrokeStyle(grand ? 3 : 2, REALM_LIGHT[region], 0.9)
      .setDepth(BOARD_DEPTHS.effects);
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scale: grand ? 5 : 3,
      duration: grand ? 1_200 : 650,
      onComplete: () => ring.destroy()
    });
    const particleCount = grand ? 10 : 4;
    for (let index = 0; index < particleCount; index += 1) {
      const mote = this.scene.add.circle(container.x, container.y, grand ? 2 : 1.5, REALM_LIGHT[region], 0.9).setDepth(BOARD_DEPTHS.effects + 1);
      const angle = (Math.PI * 2 * index) / particleCount;
      this.scene.tweens.add({
        targets: mote,
        x: container.x + Math.cos(angle) * (grand ? 35 : 20),
        y: container.y + Math.sin(angle) * (grand ? 35 : 20),
        alpha: 0,
        duration,
        onComplete: () => mote.destroy()
      });
    }
  }
}
