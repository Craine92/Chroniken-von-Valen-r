import Phaser from "phaser";
import {
  PLAYER_COLOR_VALUES,
  PROPERTY_GROUPS,
  getPropertyGroupTiles,
  type GameState,
  type PropertyGroupDefinition,
  type PropertyGroupId
} from "@valenor/shared";
import { getGroupStripSlots } from "../board-layout";
import { getCompleteGroupOwner, getGroupOwnershipDots } from "../group-ownership";

export { getCompleteGroupOwner } from "../group-ownership";
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
  private signature = "";

  constructor(private readonly scene: Phaser.Scene, initialState: GameState, private readonly calm = false) {
    this.state = initialState;
    // Über den Besitzrahmen, damit die Besitzpunkte auf der Gruppenleiste immer sichtbar bleiben.
    this.root = scene.add.container(0, 0).setName("property-group-bars").setDepth(BOARD_DEPTHS.ownership + 1);
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

  /** Landet eine Figur auf einem Grundstück, leuchten alle Felder seiner Gruppe kurz auf. */
  pulseGroup(groupId: PropertyGroupId): void {
    const group = PROPERTY_GROUPS.find(entry => entry.id === groupId);
    if (!group) return;
    const color = colorNumber(group.accent);
    getPropertyGroupTiles(groupId).forEach(tile => {
      const place = getBoardTileVisualLayout(tile.index);
      const glow = this.scene.add.rectangle(place.x, place.y, place.width - 4, place.height - 4, color, .16)
        .setStrokeStyle(5, color, 1).setDepth(BOARD_DEPTHS.propertyGroups + 2).setName(`group-pulse-${groupId}`);
      if (this.calm) {
        // Ruhig: kurz sichtbar, dann weich aus – ohne Pulsieren.
        this.scene.tweens.add({ targets: glow, alpha: 0, delay: 1_100, duration: 400, onComplete: () => glow.destroy() });
        return;
      }
      glow.setAlpha(0);
      this.scene.tweens.add({ targets: glow, alpha: 1, duration: 220, yoyo: true, hold: 260, repeat: 1, ease: "Sine.InOut", onComplete: () => glow.destroy() });
    });
  }

  destroy(): void {
    this.groups.forEach(container => this.scene.tweens.killTweensOf(container.list));
    this.root.destroy(true);
    this.groups.clear();
  }

  setVisualScale(_scale: number): void {}

  private render(): void {
    const signature = this.state.propertyOwnerships.map(entry => `${entry.tileIndex}:${entry.ownerId}`).join("|")
      + this.state.players.map(player => `${player.id}:${player.color}`).join("|");
    if (signature === this.signature && this.groups.size) return;
    this.signature = signature;
    this.groups.forEach(container => this.scene.tweens.killTweensOf(container.list));
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
    const dots = getGroupOwnershipDots(this.state, group.id);
    const completeOwner = getCompleteGroupOwner(this.state, group.id);
    const ownerColor = completeOwner ? PLAYER_COLOR_VALUES[this.state.players.find(player => player.id === completeOwner)?.color ?? "violet"] : undefined;
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
      // Ein Punkt je Feld der Gruppe: gefüllt in der Farbe des Besitzers, leer wenn frei.
      const slots = getGroupStripSlots(tile.index, dots.length);
      slots.dots.forEach((dot, index) => {
        const color = dots[index];
        // Dunkler Rand trennt den Punkt von der Leiste, auch wenn Spieler- und Gruppenfarbe ähnlich sind.
        const backing = this.scene.add.circle(placement.x + dot.x, placement.y + dot.y, slots.dotRadius + 1.6, 0x07060a, .95);
        const mark = this.scene.add.circle(placement.x + dot.x, placement.y + dot.y, slots.dotRadius, color ? PLAYER_COLOR_VALUES[color] : 0x07060a, 1)
          .setStrokeStyle(1, color ? 0xfff3cf : 0xd8c9a0, color ? .9 : .7).setName("group-ownership-dot");
        container.add([backing, mark]);
      });
      // Komplette Gruppe: doppelter Rahmen in Gold und Besitzerfarbe, ruhig schimmernd.
      if (ownerColor !== undefined) {
        const outer = this.scene.add.rectangle(placement.x, placement.y, placement.width + 4, placement.height + 4, 0x000000, 0)
          .setStrokeStyle(3, 0xf3d681, .95).setName("complete-group-frame");
        const inner = this.scene.add.rectangle(placement.x, placement.y, placement.width - 2, placement.height - 2, 0x000000, 0)
          .setStrokeStyle(2, ownerColor, .9).setName("complete-group-frame");
        container.add([outer, inner]);
        if (!this.calm) this.scene.tweens.add({ targets: outer, alpha: .45, duration: 1_600, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      }
    });
    return container;
  }

  private applyFocus(): void {
    const activeId = this.hoveredGroupId ?? this.pinnedGroupId ?? this.externalGroupId;
    this.groups.forEach((container, groupId) => {
      const active = groupId === activeId;
      container.setAlpha(activeId ? active ? 1 : .34 : 1);
      container.list.forEach((child) => {
        if (child.name === `group-highlight-${groupId}` && child instanceof Phaser.GameObjects.Rectangle) child.setVisible(active);
      });
    });
    this.scene.game.canvas.dataset.focusedPropertyGroup = activeId ?? "";
  }
}
