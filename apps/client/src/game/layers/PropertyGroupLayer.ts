import Phaser from "phaser";
import {
  PROPERTY_GROUPS,
  getPropertyGroupTiles,
  type GameState,
  type PropertyGroupDefinition,
  type PropertyGroupId
} from "@valenor/shared";
import { getBoardTileVisualLayout } from "../tiles/board-tile-layout";
import { BOARD_DEPTHS } from "./board-depths";

function colorNumber(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

export class PropertyGroupLayer {
  private readonly root: Phaser.GameObjects.Container;
  private readonly groups = new Map<PropertyGroupId, Phaser.GameObjects.Container>();
  private state: GameState;
  private hoveredGroupId: PropertyGroupId | undefined;
  private pinnedGroupId: PropertyGroupId | undefined;
  private externalGroupId: PropertyGroupId | undefined;

  constructor(private readonly scene: Phaser.Scene, initialState: GameState) {
    this.state = initialState;
    this.root = scene.add.container(0, 0).setName("property-group-bars").setDepth(BOARD_DEPTHS.propertyGroups);
    this.render();
  }

  sync(state: GameState): void {
    this.state = state;
    this.render();
  }

  focus(groupId: PropertyGroupId, mode: "hover" | "toggle" | "leave"): void {
    if (mode === "toggle") this.pinnedGroupId = this.pinnedGroupId === groupId ? undefined : groupId;
    else if (mode === "hover") this.hoveredGroupId = groupId;
    else if (this.hoveredGroupId === groupId) this.hoveredGroupId = undefined;
    this.applyFocus();
  }

  setExternalFocus(groupId: PropertyGroupId | undefined): void {
    this.externalGroupId = groupId;
    this.applyFocus();
  }

  destroy(): void {
    this.root.destroy(true);
    this.groups.clear();
  }

  setVisualScale(_scale: number): void {}

  private render(): void {
    this.root.removeAll(true);
    this.groups.clear();
    PROPERTY_GROUPS.forEach((group) => {
      const container = this.drawGroup(group);
      this.root.add(container);
      this.groups.set(group.id, container);
    });
    this.applyFocus();
  }

  private drawGroup(group: PropertyGroupDefinition): Phaser.GameObjects.Container {
    const tiles = getPropertyGroupTiles(group.id);
    const placements = tiles.map((tile) => ({ tile, placement: getBoardTileVisualLayout(tile.index) }));
    const container = this.scene.add.container(0, 0);
    const groupColor = colorNumber(group.accent);
    const accent = Phaser.Display.Color.GetColor(Math.round((groupColor>>>16 & 255)*.68),Math.round((groupColor>>>8 & 255)*.68),Math.round((groupColor & 255)*.68));
    placements.forEach(({ tile, placement }) => {
      const glow = this.scene.add.rectangle(placement.x, placement.y, placement.width - 12, placement.height - 12, accent, .01)
        .setStrokeStyle(5, accent, .08)
        .setName(`group-highlight-${group.id}`)
        .setData("tileIndex",tile.index)
        .setVisible(false);
      const contour = this.scene.add.rectangle(placement.x, placement.y, placement.width - 8, placement.height - 8, accent, 0)
        .setStrokeStyle(3.5,accent,.85).setName(`group-highlight-${group.id}`).setData("tileIndex",tile.index).setVisible(false);
      const gold=this.scene.add.rectangle(placement.x,placement.y,placement.width-14,placement.height-14,0x000000,0)
        .setStrokeStyle(1.2,0xd8b968,.65).setName(`group-highlight-${group.id}`).setData("tileIndex",tile.index).setVisible(false);
      container.add([glow,contour,gold]);
    });
    return container;
  }

  private applyFocus(): void {
    const activeId = this.hoveredGroupId ?? this.pinnedGroupId ?? this.externalGroupId;
    this.groups.forEach((container, groupId) => {
      const active = groupId === activeId;
      container.setAlpha(activeId ? active ? 1 : .34 : .9);
      container.list.forEach((child) => {
        if (child.name === `group-highlight-${groupId}` && child instanceof Phaser.GameObjects.Rectangle) child.setVisible(active);
      });
    });
    this.scene.game.canvas.dataset.focusedPropertyGroup = activeId ?? "";
  }
}
