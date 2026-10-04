import Phaser from "phaser";
import {
  PROPERTY_GROUPS,
  getPropertyGroupTiles,
  type GameState,
  type PropertyGroupDefinition,
  type PropertyGroupId
} from "@valenor/shared";
import { getTilePlacement } from "../board-layout";
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
    const placements = tiles.map((tile) => ({ tile, placement: getTilePlacement(tile.index) }));
    const container = this.scene.add.container(0, 0);
    const accent = colorNumber(group.accent);
    placements.forEach(({ placement }) => {
      const glow = this.scene.add.rectangle(placement.x, placement.y, placement.width - 5, placement.height - 5, accent, .08)
        .setStrokeStyle(5, accent, .94)
        .setName(`group-highlight-${group.id}`)
        .setVisible(false);
      container.add(glow);
    });
    return container;
  }

  private applyFocus(): void {
    const activeId = this.hoveredGroupId ?? this.pinnedGroupId ?? this.externalGroupId;
    this.groups.forEach((container, groupId) => {
      const active = groupId === activeId;
      container.setAlpha(activeId ? active ? 1 : .34 : .9);
      container.setScale(active ? 1.018 : 1);
      container.list.forEach((child) => {
        if (child.name === `group-highlight-${groupId}` && child instanceof Phaser.GameObjects.Rectangle) child.setVisible(active);
      });
    });
    this.scene.game.canvas.dataset.focusedPropertyGroup = activeId ?? "";
  }
}
