import Phaser from "phaser";
import type { BoardTile, PropertyGroupId } from "@valenor/shared";
import { FIELD_BASE_ASSETS, SPECIAL_TILE_ASSETS } from "../assets/asset-manifest";
import { fitImage, hasLoadedAsset } from "../assets/asset-runtime";
import type { BoardArtLayer } from "../layers/BoardArtLayer";
import { BOARD_DEPTHS } from "../layers/board-depths";
import { getBoardTileVisualLayout, type BoardTileVisualLayout } from "./board-tile-layout";
import { getPropertyGroupVisual, getRegionAccent, getTileFooter, getTilePalette, getTilePrimaryAction, getTileTitle, type TilePalette } from "./board-tile-theme";

export interface BoardTileRendererOptions {
  artLayer?: BoardArtLayer;
  onPropertyGroupFocus?: (groupId: PropertyGroupId, mode: "hover" | "toggle" | "leave") => void;
}

export class BoardTileRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: BoardTileRendererOptions
  ) {}

  renderAll(tiles: readonly BoardTile[]): Phaser.GameObjects.Layer {
    const cellSize = 256;
    const columns = 10;
    const rows = Math.ceil(tiles.length / columns);
    const atlas = this.scene.add.renderTexture(0, 0, columns * cellSize, rows * cellSize)
      .setOrigin(0)
      .setVisible(false);
    const atlasSource = this.scene.add.container(0, 0);
    tiles.forEach((tile, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const source = this.createTileSource(tile);
      source.setPosition(column * cellSize + cellSize / 2, row * cellSize + cellSize / 2);
      atlasSource.add(source);
    });
    atlas.draw(atlasSource);
    const atlasKey = "board-tile-atlas-v2";
    if (this.scene.textures.exists(atlasKey)) this.scene.textures.remove(atlasKey);
    const atlasTexture = atlas.saveTexture(atlasKey);

    const tileLayer = this.scene.add.layer()
      .setName("board-tile-fields")
      .setDepth(BOARD_DEPTHS.tileFields)
      .setAlpha(1)
      .setVisible(true);
    const rendered = tiles.map((tile, index) => {
      const layout = getBoardTileVisualLayout(tile.index);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const frameName = `board-tile-${tile.index}`;
      atlasTexture.add(
        frameName,
        0,
        column * cellSize + (cellSize - layout.width) / 2,
        row * cellSize + (cellSize - layout.height) / 2,
        layout.width,
        layout.height
      );
      const image = this.scene.add.image(layout.x, layout.y, atlasTexture.key, frameName).setDepth(0);
      if (tile.type === "property" && tile.propertyGroupId && this.options.onPropertyGroupFocus) {
        image.setInteractive({ useHandCursor: true })
          .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.options.onPropertyGroupFocus?.(tile.propertyGroupId!, "hover"))
          .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.options.onPropertyGroupFocus?.(tile.propertyGroupId!, "leave"))
          .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.options.onPropertyGroupFocus?.(tile.propertyGroupId!, "toggle"));
      }
      return image;
    });
    tileLayer.add(rendered);
    atlasSource.removeAll(true);
    atlasSource.destroy();
    return tileLayer;
  }

  private createTileSource(tile: BoardTile): Phaser.GameObjects.Container {
    const layout = getBoardTileVisualLayout(tile.index);
    const palette = getTilePalette(tile);
    const source = this.scene.add.container(0, 0);
    const plate = this.createPlateImage(tile, layout, palette);
    const assetAccent = layout.kind === "corner" || !hasLoadedAsset(this.scene, FIELD_BASE_ASSETS[layout.kind])
      ? undefined
      : this.createAssetAccent(tile, layout, palette);

    const emblemObjects = this.drawEmblem(tile, layout, palette);
    const tileTitle = getTileTitle(tile.name);
    const title = this.scene.add.text(layout.title.x, layout.title.y, tileTitle, {
      color: palette.text,
      fontFamily: "Trebuchet MS, Arial, sans-serif",
      fontSize: `${layout.title.fontSize}px`,
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: layout.title.width },
      lineSpacing: -5,
      stroke: "#080706",
      strokeThickness: 3,
      shadow: { color: "#000000", blur: 2, fill: true, offsetY: 1 }
    }).setOrigin(.5).setMaxLines(layout.title.maxLines).setResolution(2);
    const footer = this.scene.add.text(layout.footer.x, layout.footer.y, getTileFooter(tile), {
      color: palette.mutedText,
      fontFamily: "Arial, sans-serif",
      fontSize: `${layout.footer.fontSize}px`,
      fontStyle: "bold",
      align: "center",
      letterSpacing: .2,
      wordWrap: { width: layout.footer.width },
      stroke: "#080706",
      strokeThickness: 2,
      lineSpacing: 1
    }).setOrigin(.5).setMaxLines(1).setResolution(2);
    const price = this.scene.add.text(layout.price.x, layout.price.y, getTilePrimaryAction(tile), {
      color: "#ffebad",
      fontFamily: "Arial, sans-serif",
      fontSize: `${layout.price.fontSize}px`,
      fontStyle: "bold",
      align: "center",
      letterSpacing: .8,
      wordWrap: { width: layout.price.width },
      stroke: "#080706",
      strokeThickness: 3,
      shadow: { color: "#000000", blur: 2, fill: true, offsetY: 1 }
    }).setOrigin(.5).setMaxLines(2).setResolution(2);
    const objects: Phaser.GameObjects.GameObject[] = [plate];
    if (assetAccent) objects.push(assetAccent);
    objects.push(...emblemObjects, title, footer, price);
    if (layout.kind === "corner") {
      objects.push(this.scene.add.text(-layout.width / 2 + 8, -layout.height / 2 + 6, String(tile.index).padStart(2, "0"), {
        color: "#b9aa83",
        fontFamily: "Arial, sans-serif",
        fontSize: "6.5px",
        fontStyle: "bold",
        stroke: "#090807",
        strokeThickness: 2
      }).setOrigin(0, 0));
    }
    source.add(objects);
    return source;
  }

  private createAssetAccent(
    tile: BoardTile,
    layout: BoardTileVisualLayout,
    palette: TilePalette
  ): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    const accent = tile.type === "property" ? getPropertyGroupVisual(tile.propertyGroup).accent : getRegionAccent(tile.region);
    const badge = layout.kind === "portrait"
      ? { x: -layout.width / 2 + 19, y: -layout.height / 2 + 50 }
      : { x: -layout.width / 2 + 10, y: 0 };
    const size = tile.type === "property" ? 5 : 3.5;
    graphics.fillStyle(accent, tile.type === "property" ? .34 : .2)
      .fillCircle(badge.x, badge.y, size + 4);
    graphics.lineStyle(tile.type === "property" ? 2 : 1.25, accent, .92)
      .strokePoints([
        { x: badge.x, y: badge.y - size },
        { x: badge.x + size, y: badge.y },
        { x: badge.x, y: badge.y + size },
        { x: badge.x - size, y: badge.y }
      ], true);
    graphics.fillStyle(accent, tile.type === "property" ? .18 : .1)
      .fillRoundedRect(
        layout.accent.x - layout.accent.width / 2 - 2,
        layout.accent.y - layout.accent.height,
        layout.accent.width + 4,
        layout.accent.height * 2,
        layout.accent.height
      );
    graphics.fillStyle(accent, tile.type === "property" ? .96 : .72)
      .fillRoundedRect(
        layout.accent.x - layout.accent.width / 2,
        layout.accent.y - layout.accent.height / 2,
        layout.accent.width,
        layout.accent.height,
        layout.accent.height / 2
      );
    graphics.lineStyle(1, palette.accent, tile.type === "property" ? .28 : .18)
      .strokeRoundedRect(-layout.width / 2 + 8, -layout.height / 2 + 8, layout.width - 16, layout.height - 16, 4);
    return graphics;
  }

  private drawPlate(
    graphics: Phaser.GameObjects.Graphics,
    tile: BoardTile,
    layout: BoardTileVisualLayout,
    palette: TilePalette,
    offsetX = 0,
    offsetY = 0
  ): void {
    const { width, height, kind } = layout;
    const left = offsetX - width / 2;
    const top = offsetY - height / 2;
    const right = left + width;
    const bottom = top + height;
    const radius = kind === "corner" ? 9 : 6;
    graphics.fillStyle(0x000000, .55).fillRoundedRect(left + 3, top + 4, width, height, radius);
    graphics.fillGradientStyle(palette.surfaceTop, palette.surfaceTop, palette.surfaceBottom, palette.surfaceBottom, 1);
    graphics.fillRoundedRect(left, top, width, height, radius);
    graphics.lineStyle(3, 0x17120d, 1).strokeRoundedRect(left + 1, top + 1, width - 2, height - 2, radius);
    graphics.lineStyle(palette.specialFrame ? 2 : 1.5, palette.rim, palette.specialFrame ? .96 : .76)
      .strokeRoundedRect(left + 4, top + 4, width - 8, height - 8, Math.max(3, radius - 2));
    graphics.lineStyle(1, palette.highlight, .34)
      .strokeRoundedRect(left + 7, top + 7, width - 14, height - 14, Math.max(2, radius - 3));

    if (kind === "portrait") {
      graphics.fillStyle(palette.header, .98).fillRoundedRect(left + 7, top + 7, width - 14, 48, 5);
      graphics.fillStyle(palette.accent, .96).fillRect(left + 7, top + 52, width - 14, 6);
      graphics.fillStyle(palette.panel, .78).fillRoundedRect(left + 8, top + 63, width - 16, height - 96, 5);
      graphics.fillStyle(palette.accent, .86).fillRoundedRect(left + 8, bottom - 30, width - 16, 22, 4);
    } else if (kind === "landscape") {
      graphics.fillStyle(palette.header, .98).fillRoundedRect(left + 7, top + 7, width - 14, 42, 5);
      graphics.fillStyle(palette.accent, .96).fillRect(left + 7, top + 46, width - 14, 6);
      graphics.fillStyle(palette.panel, .82).fillRoundedRect(left + 8, top + 57, width - 16, height - 65, 5);
      graphics.fillStyle(palette.accent, .86).fillRoundedRect(left + 48, bottom - 22, width - 56, 15, 3);
    } else {
      graphics.fillStyle(palette.panel, .68).fillRoundedRect(left + 8, top + 8, width - 16, height - 16, 6);
      graphics.fillStyle(palette.header, .94).fillRoundedRect(left + 9, top + height - 43, width - 18, 28, 4);
      graphics.fillStyle(palette.accent, .78).fillRect(left + 11, top + height - 45, width - 22, 2);
    }

    const markerAccent = tile.type === "property" ? getPropertyGroupVisual(tile.propertyGroup).accent : getRegionAccent(tile.region);
    graphics.fillStyle(markerAccent, tile.type === "property" ? .96 : .62)
      .fillRoundedRect(left + 8, top + 8, tile.type === "property" ? 7 : 4, height - 16, 2);
    ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).forEach(([sx, sy]) => {
      const x = offsetX + sx * (width / 2 - 7);
      const y = offsetY + sy * (height / 2 - 7);
      graphics.fillStyle(0x15120f, .9).fillCircle(x, y, 1.5);
      graphics.fillStyle(palette.highlight, .42).fillCircle(x - .4, y - .4, .6);
    });

    if (palette.specialFrame) {
      graphics.lineStyle(1, palette.accent, .5);
      const inset = 11;
      const mark = 7;
      graphics.beginPath()
        .moveTo(left + inset, top + inset + mark).lineTo(left + inset, top + inset).lineTo(left + inset + mark, top + inset)
        .moveTo(right - inset - mark, top + inset).lineTo(right - inset, top + inset).lineTo(right - inset, top + inset + mark)
        .moveTo(left + inset, bottom - inset - mark).lineTo(left + inset, bottom - inset).lineTo(left + inset + mark, bottom - inset)
        .moveTo(right - inset - mark, bottom - inset).lineTo(right - inset, bottom - inset).lineTo(right - inset, bottom - inset - mark)
        .strokePath();
    }
  }

  private createPlateImage(
    tile: BoardTile,
    layout: BoardTileVisualLayout,
    palette: TilePalette
  ): Phaser.GameObjects.Image {
    if (layout.kind !== "corner") {
      const asset = FIELD_BASE_ASSETS[layout.kind];
      if (hasLoadedAsset(this.scene, asset)) {
        return fitImage(this.scene.add.image(0, 0, asset.key), layout.width, layout.height, "contain");
      }
    }
    const textureKey = `board-tile-plate-v4-${layout.kind}-${tile.type}-${tile.region ?? "neutral"}-${tile.propertyGroup ?? "special"}`;
    if (!this.scene.textures.exists(textureKey)) {
      const source = this.scene.make.graphics({ x: 0, y: 0 }, false);
      this.drawPlate(source, tile, layout, palette, layout.width / 2, layout.height / 2);
      source.generateTexture(textureKey, layout.width, layout.height);
      source.destroy();
    }
    return this.scene.add.image(0, 0, textureKey);
  }

  private drawEmblem(tile: BoardTile, layout: BoardTileVisualLayout, palette: TilePalette): Phaser.GameObjects.GameObject[] {
    const { x, y, size } = layout.emblem;
    const graphics = this.scene.add.graphics().setPosition(x, y);
    const radius = size * .38;
    graphics.fillStyle(0x070709, .66).fillCircle(2, 3, radius + 2);
    graphics.fillStyle(palette.panel, .95).fillCircle(0, 0, radius);
    graphics.lineStyle(2, palette.rim, .9).strokeCircle(0, 0, radius);
    graphics.lineStyle(1, palette.accent, .48).strokeCircle(0, 0, radius - 4);
    const objects: Phaser.GameObjects.GameObject[] = [graphics];
    const artAsset = SPECIAL_TILE_ASSETS[tile.index];
    if (artAsset && this.options.artLayer) {
      const image = this.options.artLayer.addImage(
        artAsset,
        x,
        y,
        size * .92,
        size * .92,
        BOARD_DEPTHS.tileFields,
        "contain"
      );
      if (image) return [...objects, image];
    }

    graphics.lineStyle(2.2, palette.accent, .95);
    graphics.fillStyle(palette.accent, .9);
    if (tile.type === "start") {
      graphics.strokeCircle(0, 0, radius - 7).lineStyle(1.5, palette.highlight, .85).strokeCircle(0, 0, radius - 12);
      graphics.fillCircle(0, 0, 4);
    } else if (tile.type === "dungeon") {
      graphics.fillStyle(0x343136, 1).fillRect(-14, -7, 28, 20).fillRect(-9, -15, 6, 28).fillRect(3, -15, 6, 28);
      graphics.lineStyle(2, palette.accent, .9).strokeRoundedRect(-7, -7, 14, 20, 3).lineBetween(-2, -6, -2, 12).lineBetween(3, -6, 3, 12);
    } else if (tile.type === "rest") {
      graphics.fillStyle(0x694128, 1).fillRect(-14, -4, 28, 17);
      graphics.fillStyle(palette.accent, .9).fillTriangle(-18, -4, 0, -17, 18, -4).fillRect(-7, 3, 5, 7).fillRect(4, 3, 5, 7);
    } else if (tile.type === "goToDungeon") {
      graphics.strokeCircle(0, 0, radius - 7).beginPath().moveTo(-11, -11).lineTo(11, 11).moveTo(11, -11).lineTo(-11, 11).strokePath();
    } else if (tile.type === "harbor") {
      graphics.lineStyle(2.2, 0xdacb9c, .95).lineBetween(-6, -15, -6, 10);
      graphics.fillStyle(palette.accent, .92).fillTriangle(-4, -13, -4, 5, 12, 5);
      graphics.lineStyle(2, palette.accent, .8).beginPath().moveTo(-17, 11).lineTo(-7, 8).lineTo(3, 11).lineTo(15, 8).strokePath();
    } else if (tile.type === "utility" && tile.id === "windmuehle") {
      graphics.lineStyle(3, 0x9c8056, 1).lineBetween(0, -6, 0, 15);
      const blades = this.scene.add.graphics().setPosition(x, y - 7);
      blades.lineStyle(2.5, palette.accent, .95).lineBetween(-14, 0, 14, 0).lineBetween(0, -14, 0, 14);
      blades.lineStyle(1, palette.highlight, .65).strokeCircle(0, 0, 4);
      objects.push(blades);
    } else if (tile.type === "utility") {
      graphics.fillStyle(0x67625a, 1).fillEllipse(0, 7, 30, 12);
      graphics.lineStyle(3, palette.accent, .9).strokeEllipse(0, 3, 29, 12).lineBetween(-12, 4, -12, -13).lineBetween(-12, -13, 7, -13).lineBetween(7, -13, 7, -5);
      graphics.fillStyle(0x62afbd, .8).fillEllipse(0, 3, 20, 6);
    } else if (tile.type === "tax") {
      graphics.fillPoints([{ x: -13, y: 7 }, { x: -10, y: -10 }, { x: -3, y: -3 }, { x: 0, y: -14 }, { x: 5, y: -3 }, { x: 12, y: -10 }, { x: 13, y: 7 }], true);
      graphics.fillStyle(palette.highlight, .9).fillRect(-13, 9, 26, 4);
    } else if (tile.type === "adventure") {
      graphics.lineStyle(3, palette.accent, .95).lineBetween(-10, 11, 10, -11).lineBetween(5, -11, 11, -5);
      graphics.lineStyle(3, palette.highlight, .9).lineBetween(10, 11, -10, -11).lineBetween(-5, -11, -11, -5);
      graphics.fillStyle(0x17110b, 1).fillCircle(0, 0, 4);
    } else if (tile.type === "fate") {
      graphics.fillStyle(0xe7e4ff, .95).fillCircle(-2, 0, 13);
      graphics.fillStyle(palette.panel, 1).fillCircle(4, -4, 13);
      graphics.fillStyle(0xffffff, .9).fillCircle(-13, -8, 1.4).fillCircle(13, 7, 1.2);
    } else {
      graphics.fillPoints([{ x: 0, y: -15 }, { x: 12, y: 0 }, { x: 0, y: 15 }, { x: -12, y: 0 }], true);
      graphics.fillStyle(palette.highlight, .82).fillPoints([{ x: 0, y: -9 }, { x: 7, y: 0 }, { x: 0, y: 9 }, { x: -7, y: 0 }], true);
      graphics.fillStyle(palette.panel, 1).fillCircle(0, 0, 3);
    }
    return objects;
  }
}
