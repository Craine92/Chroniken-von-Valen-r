import Phaser from "phaser";
import { BOARD_TILES, type GameState } from "@valenor/shared";
import { getTilePlacement } from "../board-layout";
import { getBoardTileVisualLayout } from "../tiles/board-tile-layout";
import { BOARD_DEPTHS } from "./board-depths";

export class MortgageOverlayLayer {
  private readonly overlays = new Map<number, Phaser.GameObjects.Container>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(state: GameState): void {
    const active = new Set(state.propertyOwnerships.filter((entry) => entry.mortgaged).map((entry) => entry.tileIndex));
    for (const tileIndex of active) if (!this.overlays.has(tileIndex)) this.overlays.set(tileIndex, this.create(tileIndex));
    for (const [tileIndex, overlay] of this.overlays) if (!active.has(tileIndex)) { overlay.destroy(); this.overlays.delete(tileIndex); }
  }

  destroy(): void {
    this.overlays.forEach((overlay) => overlay.destroy());
    this.overlays.clear();
  }

  private create(tileIndex: number): Phaser.GameObjects.Container {
    const tile = BOARD_TILES[tileIndex];
    const layout = getBoardTileVisualLayout(tileIndex);
    const rotation = getTilePlacement(tileIndex).rotation;
    const container = this.scene.add.container(layout.x, layout.y).setRotation(rotation).setDepth(BOARD_DEPTHS.buildings - 1);
    const graphics = this.scene.add.graphics();
    const halfWidth = Math.max(22, layout.width * .34);
    const halfHeight = Math.max(28, layout.height * .35);
    graphics.lineStyle(11, 0x160506, .94).beginPath().moveTo(-halfWidth, -halfHeight).lineTo(halfWidth, halfHeight).moveTo(halfWidth, -halfHeight).lineTo(-halfWidth, halfHeight).strokePath();
    graphics.lineStyle(6, 0xd73737, 1).beginPath().moveTo(-halfWidth, -halfHeight).lineTo(halfWidth, halfHeight).moveTo(halfWidth, -halfHeight).lineTo(-halfWidth, halfHeight).strokePath();
    const label = this.scene.add.text(0, layout.kind === "landscape" ? 0 : 21, "BELEHNT", { color: "#fff4e8", backgroundColor: "#7d1014", fontFamily: "Arial,sans-serif", fontSize: "10px", fontStyle: "bold", padding: { x: 4, y: 2 }, stroke: "#210000", strokeThickness: 2 }).setOrigin(.5).setRotation(-rotation).setResolution(2);
    container.setName(`mortgage-overlay-${tile?.type ?? "property"}-${tileIndex}`).add([graphics, label]);
    return container;
  }
}
