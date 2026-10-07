import Phaser from "phaser";
import { BOARD_TILES, DUNGEON_TILE_INDEX, MAX_RELICS, RELIC_DEFINITIONS, isRelicArmed, type GameState, type PropertyGroupId, type RegionType } from "@valenor/shared";
import { BOARD_HEIGHT, BOARD_HALF_HEIGHT, BOARD_HALF_WIDTH, BOARD_INNER_HALF_HEIGHT, BOARD_INNER_HALF_WIDTH, BOARD_WIDTH, getBoardFitZoom, getInnerEdgeOffset, getTilePlacement, getTileWorldPosition, getTokenLabelOffset, getTokenSlotOffset } from "../board-layout";
import { PropertyDevelopmentLayer } from "../layers/PropertyDevelopmentLayer";
import { PropertyGroupLayer } from "../layers/PropertyGroupLayer";
import { BoardArtLayer } from "../layers/BoardArtLayer";
import { CHARACTER_ASSETS, DRAGON_ANIMATION, getAvailableDragonFrames, getDragonTerritoryVisuals, RELIC_ASSETS, VALENOR_ASSETS } from "../assets/asset-manifest";
import { fitImage } from "../assets/asset-runtime";
import { BOARD_DEPTHS } from "../layers/board-depths";
import { DEFAULT_GRAPHICS_QUALITY, VISUAL_QUALITY, prefersReducedMotion } from "../visual-config";
import { BoardTileRenderer } from "../tiles/BoardTileRenderer";
import { getBoardTileVisualLayout } from "../tiles/board-tile-layout";
import { DEFAULT_BOARD_PRESENTATION_MODE, getBoardVisualScale, type BoardPresentationMode } from "../board-presentation";
import { getTokenPointerGeometry, TOKEN_VISUAL_CONFIG } from "../tokens/token-visuals";
import { audioManager } from "../../audio/AudioManager";
import { deriveMovementStepAudioEvents } from "../../audio/game-audio-events";

function getMovementSignature(state: GameState): string {
  const movement = state.lastMovement;
  return movement ? `${movement.sequence ?? state.turnContext.rollSequence}-${movement.kind}-${movement.from}-${movement.to}` : "";
}

const PLAYER_COLORS = {
  violet: 0xa16deb,
  green: 0x5ec58a,
  red: 0xdc5f67,
  blue: 0x5f9ddd
} as const;

const REGION_TRAIL: Record<RegionType, number> = {
  elves: 0xbd8cff,
  humans: 0x9ee28f,
  orcs: 0xff7048,
  steppe: 0xf5d47d
};

export class ValenorBoardScene extends Phaser.Scene {
  private state: GameState;
  private readonly tokens = new Map<string, Phaser.GameObjects.Container>();
  private readonly tokenVisuals = new Map<string, Phaser.GameObjects.Container>();
  private readonly tokenNameLabels = new Map<string, Phaser.GameObjects.Container>();
  private readonly tokenPointers = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly tokenRelics = new Map<string, Phaser.GameObjects.Container>();
  private relicSignature = "";
  private relicBadgeSize = 24;
  private readonly dungeonMarkers = new Map<string, Phaser.GameObjects.Container>();
  private readonly activeRings = new Map<string, Phaser.GameObjects.Container>();
  private readonly ownershipMarkers = new Map<number, Phaser.GameObjects.Container>();
  private ownershipMarkerScale = 1;
  private ownershipSignature = "";
  private lastDiceSignature = "";
  private lastMovementSignature = "";
  private highlight: Phaser.GameObjects.Container | undefined;
  private boardReady = false;
  private pendingState: GameState | undefined;
  private developmentLayer: PropertyDevelopmentLayer | undefined;
  private artLayer: BoardArtLayer | undefined;
  private tileLayer: Phaser.GameObjects.Layer | undefined;
  private propertyGroupLayer: PropertyGroupLayer | undefined;
  private externalPropertyGroupFocus: PropertyGroupId | undefined;
  private currentPlayerId: string | undefined;
  private dragon: Phaser.GameObjects.Container | undefined;
  private readonly dragonVisuals: Phaser.GameObjects.Container[] = [];
  private dragonSprite: Phaser.GameObjects.Sprite | undefined;
  private dragonTileIndex: number | undefined;
  private readonly reducedMotion = prefersReducedMotion();
  private readonly visualQuality = VISUAL_QUALITY[DEFAULT_GRAPHICS_QUALITY];
  private lastDiagnosticAt = 0;

  constructor(gameState: GameState, private readonly presentationMode: BoardPresentationMode = DEFAULT_BOARD_PRESENTATION_MODE) {
    super("valenor-board");
    this.state = gameState;
    this.lastMovementSignature = getMovementSignature(gameState);
  }

  create() {
    this.cameras.main.setBackgroundColor(0x080706);
    this.artLayer = new BoardArtLayer(this);
    if (this.presentationMode === "tabletop") {
      if (!this.artLayer.renderTable()) this.drawTableSurface();
    } else {
      this.drawGameplayStage();
    }
    // The legacy frame is square. A native procedural widescreen frame avoids texture distortion.
    this.drawBoardShadow();
    this.drawWorldMap();
    const renderedRealmBackgrounds = this.artLayer.renderRealmBackgrounds();
    const tileRenderer = new BoardTileRenderer(this, {
      artLayer: this.artLayer,
      onPropertyGroupFocus: (groupId, mode) => this.propertyGroupLayer?.focus(groupId, mode)
    });
    this.tileLayer = tileRenderer.renderAll(BOARD_TILES);
    this.propertyGroupLayer = new PropertyGroupLayer(this, this.state);
    this.propertyGroupLayer.setExternalFocus(this.externalPropertyGroupFocus);
    this.artLayer.renderRealmDecorations();
    this.drawRealmMiniatures(renderedRealmBackgrounds);
    this.artLayer.renderBoardEffects();
    this.drawCenterTitle();
    this.artLayer.syncChronicle(this.state, this.reducedMotion);
    this.drawCardDecks();
    this.drawMotes();
    this.drawPlayerTokens();
    this.syncTokenRelics(this.state);
    this.syncDragon(this.state);
    this.syncActivePlayer(this.state.currentPlayerId);
    this.drawOwnershipMarkers();
    this.developmentLayer = new PropertyDevelopmentLayer(this);
    this.developmentLayer.sync(this.state, false);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitCamera());
    this.boardReady = true;
    this.game.canvas.dataset.boardReady = "true";
    this.game.canvas.dataset.boardTileCount = String(BOARD_TILES.length);
    this.game.canvas.dataset.boardWidth = String(BOARD_WIDTH);
    this.game.canvas.dataset.boardHeight = String(BOARD_HEIGHT);
    this.game.canvas.dataset.boardAspect = (BOARD_WIDTH / BOARD_HEIGHT).toFixed(4);
    this.game.canvas.dataset.boardPresentationMode = this.presentationMode;
    this.game.canvas.dataset.proceduralRealmFallbacks = String(4 - renderedRealmBackgrounds.size);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.boardReady = false;
      this.game.canvas.dataset.boardReady = "false";
      this.developmentLayer?.destroy();
      this.propertyGroupLayer?.destroy();
      this.artLayer?.destroy();
      this.developmentLayer = undefined;
      this.propertyGroupLayer = undefined;
      this.artLayer = undefined;
      this.tileLayer = undefined;
      this.dragon = undefined;
      this.dragonSprite = undefined;
      this.dragonTileIndex = undefined;
      this.dragonVisuals.length = 0;
      this.tokenRelics.clear();
      this.relicSignature = "";
    });
    if (import.meta.env.DEV) {
      console.info("ValenorBoardScene created");
      console.info(`Board tiles created: ${BOARD_TILES.length}`);
      console.info(`Player tokens created: ${this.tokens.size}`);
    }
    const pendingState = this.pendingState;
    this.pendingState = undefined;
    if (pendingState) this.applyGameState(pendingState);
  }

  applyGameState(next: GameState) {
    if (!this.boardReady) {
      this.pendingState = next;
      // Keep the constructor snapshot as the visual origin. A newer pending snapshot may
      // contain the first real move and must still be animated once the board is ready.
      return;
    }
    const diceSignature = next.lastDiceRoll
      ? `${next.turnContext.rollSequence}-${next.lastDiceRoll.die1}-${next.lastDiceRoll.die2}`
      : "";
    if (["rolling", "dungeonRolling", "dungeonTransfer"].includes(next.turnPhase) && diceSignature && diceSignature !== this.lastDiceSignature) {
      this.lastDiceSignature = diceSignature;
      this.animateDice(next.lastDiceRoll!.die1, next.lastDiceRoll!.die2);
    }

    const movementSignature = getMovementSignature(next);
    if (["moving", "dungeonTransfer", "cardMoving"].includes(next.turnPhase) && movementSignature && movementSignature !== this.lastMovementSignature) {
      this.lastMovementSignature = movementSignature;
      if (next.lastMovement?.kind === "dungeonTransfer") this.animateDungeonTransfer(next);
      else this.animateMovement(next);
    }
    const playerChanged = this.currentPlayerId !== next.currentPlayerId;
    this.state = next;
    this.propertyGroupLayer?.sync(next);
    this.artLayer?.syncChronicle(next, this.reducedMotion);
    this.syncActivePlayer(next.currentPlayerId);
    if (playerChanged && next.turnPhase === "waitingForRoll") this.focusActivePlayer(next.currentPlayerId);
    this.syncDungeonMarkers(next);
    this.syncTokenRelics(next);
    this.syncDragon(next);
    this.developmentLayer?.sync(next, true);
    const ownershipSignature = next.propertyOwnerships.map((entry) => `${entry.tileIndex}:${entry.ownerId}:${entry.mortgaged}`).join("|");
    if (ownershipSignature !== this.ownershipSignature) this.drawOwnershipMarkers();
    if (next.turnPhase === "landed" || next.turnPhase === "waitingForEndTurn" || next.turnPhase === "turnTransition") {
      this.arrangeTokens(true);
      if (next.lastMovement) this.highlightTile(next.lastMovement.to);
    }
    if (next.turnPhase === "waitingForRoll" || next.turnPhase === "determiningOrder") {
      this.highlight?.destroy();
      this.highlight = undefined;
      this.arrangeTokens(true);
    }
  }

  focusPropertyGroup(groupId: PropertyGroupId | undefined): void {
    this.externalPropertyGroupFocus = groupId;
    this.propertyGroupLayer?.setExternalFocus(groupId);
  }

  update(time: number) {
    if (!import.meta.env.DEV || time - this.lastDiagnosticAt < 500) return;
    this.lastDiagnosticAt = time;
    this.game.canvas.dataset.activeDisplayObjects = String(this.children.list.filter((object) => object.active).length);
    this.game.canvas.dataset.activeTweens = String(this.tweens.getTweens().length);
    this.game.canvas.dataset.dragonFrame = this.dragonSprite?.texture.key ?? "fallback";
  }

  private drawTableSurface() {
    const table = this.add.graphics().setDepth(BOARD_DEPTHS.table);
    table.fillGradientStyle(0x17100b, 0x100c09, 0x080706, 0x110c09, 1);
    table.fillRect(-BOARD_HALF_WIDTH - 260, -BOARD_HALF_HEIGHT - 180, BOARD_WIDTH + 520, BOARD_HEIGHT + 360);
    for (let index = 0; index < 22; index += 1) {
      const y = -BOARD_HALF_HEIGHT - 160 + index * 54;
      table.lineStyle(index % 4 === 0 ? 2 : 1, index % 3 === 0 ? 0x6b4327 : 0x3a271a, 0.18);
      table.beginPath();
      table.moveTo(-BOARD_HALF_WIDTH - 250, y);
      table.lineTo(BOARD_HALF_WIDTH + 250, y + Math.sin(index * 1.7) * 13);
      table.strokePath();
    }
    const light = this.add.ellipse(0, 0, BOARD_WIDTH + 300, BOARD_HEIGHT + 280, 0x8b5e36, 0.08).setDepth(BOARD_DEPTHS.table + 1);
    const vignette = this.add.graphics().setDepth(BOARD_DEPTHS.table + 2);
    vignette.lineStyle(90, 0x020202, 0.3);
    vignette.strokeRect(-BOARD_HALF_WIDTH - 205, -BOARD_HALF_HEIGHT - 125, BOARD_WIDTH + 410, BOARD_HEIGHT + 250);
    if (!this.reducedMotion && this.visualQuality.animateAmbient) {
      this.tweens.add({ targets: light, alpha: 0.13, duration: 4200, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
  }

  private drawGameplayStage() {
    const stage = this.add.graphics().setDepth(BOARD_DEPTHS.table);
    stage.fillGradientStyle(0x050507, 0x08070a, 0x09070b, 0x030305, 1);
    stage.fillRect(-1_800, -1_300, 3_600, 2_600);
    const warmGlow = this.add.circle(0, 20, 690, 0x8b5e36, .055).setDepth(BOARD_DEPTHS.table + 1);
    const violetGlow = this.add.circle(-290, 170, 420, 0x5d397c, .045).setDepth(BOARD_DEPTHS.table + 1);
    const vignette = this.add.graphics().setDepth(BOARD_DEPTHS.table + 2);
    vignette.lineStyle(180, 0x010102, .42).strokeRect(-1_200, -900, 2_400, 1_800);
    if (!this.reducedMotion && this.visualQuality.animateAmbient) {
      this.tweens.add({ targets: [warmGlow, violetGlow], alpha: .075, duration: 4_800, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
  }

  private drawBoardShadow() {
    const shadow = this.add.graphics().setDepth(BOARD_DEPTHS.shadow);
    shadow.fillStyle(0x000000, 0.62);
    shadow.fillRoundedRect(-BOARD_HALF_WIDTH - 34, -BOARD_HALF_HEIGHT - 6, BOARD_WIDTH + 80, BOARD_HEIGHT + 82, 22);
    const frame = this.add.graphics().setDepth(BOARD_DEPTHS.frame);
    frame.fillStyle(0x17120e, 1);
    frame.fillRoundedRect(-BOARD_HALF_WIDTH - 24, -BOARD_HALF_HEIGHT - 24, BOARD_WIDTH + 48, BOARD_HEIGHT + 48, 18);
    frame.lineStyle(10, 0x322418, 1);
    frame.strokeRoundedRect(-BOARD_HALF_WIDTH - 21, -BOARD_HALF_HEIGHT - 21, BOARD_WIDTH + 42, BOARD_HEIGHT + 42, 16);
    frame.lineStyle(5, 0x8c6a35, 0.92);
    frame.strokeRoundedRect(-BOARD_HALF_WIDTH - 13, -BOARD_HALF_HEIGHT - 13, BOARD_WIDTH + 26, BOARD_HEIGHT + 26, 12);
    frame.lineStyle(2, 0xf0d994, 0.72);
    frame.strokeRoundedRect(-BOARD_HALF_WIDTH - 7, -BOARD_HALF_HEIGHT - 7, BOARD_WIDTH + 14, BOARD_HEIGHT + 14, 8);
    frame.lineStyle(3, 0x4a321e, 0.9);
    frame.strokeRect(-BOARD_HALF_WIDTH + 2, -BOARD_HALF_HEIGHT + 2, BOARD_WIDTH - 4, BOARD_HEIGHT - 4);

    const ornament = this.add.graphics().setDepth(BOARD_DEPTHS.frame + 1);
    ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as Array<[number, number]>).forEach(([sx, sy]) => {
      const x = sx * (BOARD_HALF_WIDTH + 11);
      const y = sy * (BOARD_HALF_HEIGHT + 11);
      ornament.fillStyle(0x1a1512, 1).fillCircle(x, y, 27);
      ornament.lineStyle(3, 0xc9a85f, 0.78).strokeCircle(x, y, 22);
      ornament.lineStyle(1, 0xf4dd9a, 0.5).strokeCircle(x, y, 14);
      ornament.fillStyle(0xd7bb78, 0.85).fillPoints([
        { x, y: y - 10 }, { x: x + 5, y }, { x, y: y + 10 }, { x: x - 5, y }
      ], true);
    });
  }

  private drawWorldMap() {
    const edgeX = BOARD_INNER_HALF_WIDTH;
    const edgeY = BOARD_INNER_HALF_HEIGHT;
    const map = this.add.graphics().setDepth(BOARD_DEPTHS.realmBackground - 1);
    map.fillGradientStyle(0x151528, 0x241a27, 0x162019, 0x21170f, 1);
    map.fillRect(-edgeX, -edgeY, edgeX * 2, edgeY * 2);

    map.fillStyle(0x392a58, 0.82);
    map.fillRect(-edgeX, 0, edgeX, edgeY);
    map.fillStyle(0x24503d, 0.8);
    map.fillRect(-edgeX, -edgeY, edgeX, edgeY);
    map.fillStyle(0x67372f, 0.78);
    map.fillRect(0, -edgeY, edgeX, edgeY);
    map.fillStyle(0x59633a, 0.8);
    map.fillRect(0, 0, edgeX, edgeY);

    map.lineStyle(7, 0x18333c, 0.45);
    const river = new Phaser.Curves.Spline([
      -edgeX * 0.72, -edgeY * 0.85,
      -edgeX * 0.2, -edgeY * 0.28,
      edgeX * 0.05, 20,
      edgeX * 0.5, edgeY * 0.28,
      edgeX * 0.72, edgeY * 0.82
    ]);
    river.draw(map, 64);
    map.lineStyle(2, 0x8ac4ce, 0.38);
    river.draw(map, 64);

    map.lineStyle(1, 0xd7bb78, 0.12);
    map.strokeEllipse(0, 0, 420, 230);
    map.strokeEllipse(0, 0, 500, 275);
  }

  private drawRealmMiniatures(assetRealms: ReadonlySet<RegionType> = new Set()) {
    const edgeX = BOARD_INNER_HALF_WIDTH - 10;
    const edgeY = BOARD_INNER_HALF_HEIGHT - 10;
    const terrain = this.add.graphics().setDepth(BOARD_DEPTHS.decorations);
    terrain.lineStyle(2, 0xd9c27f, 0.16);
    const paths: Array<[RegionType, number[][]]> = [
      ["elves", [[-edgeX + 25, edgeY * .35], [-380, 70], [-220, 22], [-80, -12]]],
      ["humans", [[-edgeX + 15, -edgeY * .35], [-390, -78], [-240, -42], [-85, -15]]],
      ["orcs", [[edgeX - 25, -edgeY * .35], [390, -70], [250, -30], [82, -8]]],
      ["steppe", [[edgeX - 20, edgeY * .38], [400, 88], [250, 45], [88, 14]]]
    ];
    paths.filter(([region]) => !assetRealms.has(region)).forEach(([, points]) => {
      terrain.beginPath();
      terrain.moveTo(points[0]![0]!, points[0]![1]!);
      points.slice(1).forEach(([x, y]) => terrain.lineTo(x!, y!));
      terrain.strokePath();
    });

    const trees: Array<[number, number, RegionType, number]> = [
      [-340, 270, "elves", 1.15], [-290, 325, "elves", .82], [-250, 245, "elves", .95], [-360, 190, "elves", .78], [-205, 300, "elves", .68],
      [-340, -270, "humans", 1], [-275, -320, "humans", .76], [-220, -255, "humans", .88], [-360, -185, "humans", .68], [-170, -310, "humans", .62],
      [340, -265, "orcs", .85], [285, -325, "orcs", .68], [225, -265, "orcs", .72],
      [345, 275, "steppe", .62], [280, 330, "steppe", .5], [210, 280, "steppe", .55]
    ];
    trees.filter(([, , region]) => !assetRealms.has(region)).forEach(([x, y, region, scale]) => this.drawTree(x, y, region, scale * this.visualQuality.realmDetails));

    if (!assetRealms.has("humans")) ([[-305, -205], [-245, -205], [-190, -145]] as Array<[number, number]>).forEach(([x, y], index) => this.drawHumanHouse(x, y, index));
    if (!assetRealms.has("orcs")) ([[238, -245], [300, -205], [352, -145]] as Array<[number, number]>).forEach(([x, y], index) => this.drawOrcCamp(x, y, index));
    if (!assetRealms.has("steppe")) ([[240, 235], [305, 195], [350, 125]] as Array<[number, number]>).forEach(([x, y], index) => this.drawSteppeCamp(x, y, index));
    if (!assetRealms.has("elves")) ([[-300, 205], [-235, 165], [-175, 230]] as Array<[number, number]>).forEach(([x, y], index) => this.drawElvenShrine(x, y, index));

    if (!assetRealms.has("orcs")) ([[140, -315], [190, -285], [100, -255], [330, -70]] as Array<[number, number]>).forEach(([x, y], index) => this.drawMountain(x, y, index % 2 === 0 ? 1 : .75));
    if (!assetRealms.has("steppe")) ([[120, 315], [175, 280], [335, 55]] as Array<[number, number]>).forEach(([x, y]) => this.drawHill(x, y));

    if (!assetRealms.has("humans")) {
      const lake = this.add.graphics().setDepth(BOARD_DEPTHS.decorations);
      lake.fillStyle(0x214b55, 0.7).fillEllipse(-190, -105, 110, 48);
      lake.lineStyle(2, 0x91c9cd, 0.35).strokeEllipse(-190, -105, 94, 35);
    }
    if (!assetRealms.has("orcs")) {
      const embers = this.add.circle(285, -170, 5, 0xff6a39, 0.72).setDepth(BOARD_DEPTHS.effects);
      if (!this.reducedMotion && this.visualQuality.animateAmbient) {
        this.tweens.add({ targets: embers, alpha: 0.25, scale: 1.35, duration: 520, yoyo: true, repeat: -1 });
      }
    }
  }

  private drawTree(x: number, y: number, region: RegionType, scale: number) {
    const tree = this.add.graphics().setPosition(x, y).setScale(scale).setDepth(BOARD_DEPTHS.decorations);
    const crown = region === "elves" ? 0x7650a3 : region === "humans" ? 0x376d43 : region === "orcs" ? 0x4a3b2d : 0x6f7841;
    const trunk = region === "elves" ? 0xb5acc4 : region === "orcs" ? 0x483126 : 0x5c432c;
    tree.lineStyle(region === "elves" ? 5 : 4, trunk, 1).lineBetween(0, 14, 0, -9);
    if (region === "orcs") {
      tree.lineStyle(3, trunk, 1).beginPath().moveTo(0, -4).lineTo(-10, -16).moveTo(0, 0).lineTo(11, -10).strokePath();
    } else {
      tree.fillStyle(crown, .96).fillCircle(0, -15, region === "elves" ? 14 : 11);
      tree.fillStyle(region === "elves" ? 0xb899e2 : 0x638b50, .72).fillCircle(-8, -10, 8).fillCircle(8, -10, 8);
      if (region === "elves") tree.fillStyle(0xe6d9ff, .9).fillCircle(4, -20, 2);
    }
  }

  private drawMountain(x: number, y: number, scale: number) {
    const mountain = this.add.graphics().setPosition(x, y).setScale(scale).setDepth(BOARD_DEPTHS.decorations);
    mountain.fillStyle(0x302d2c, 1).fillTriangle(-28, 18, 0, -28, 28, 18);
    mountain.fillStyle(0x51473f, .9).fillTriangle(-18, 18, 0, -28, 7, 18);
    mountain.fillStyle(0xd8c7ab, .65).fillTriangle(-8, -14, 0, -28, 8, -14);
  }

  private drawHill(x: number, y: number) {
    const hill = this.add.graphics().setPosition(x, y).setDepth(BOARD_DEPTHS.decorations);
    hill.fillStyle(0x657243, .9).fillEllipse(0, 0, 64, 27);
    hill.lineStyle(2, 0xc9a85f, .3).beginPath().moveTo(-20, 1).lineTo(0, -8).lineTo(22, 2).strokePath();
  }

  private drawHumanHouse(x: number, y: number, index: number) {
    const house = this.add.graphics().setPosition(x, y).setDepth(BOARD_DEPTHS.decorations + 1);
    house.fillStyle(0x81796a, 1).fillRect(-10, -4, 20, 17);
    house.fillStyle(index === 2 ? 0xb99354 : 0x77472f, 1).fillTriangle(-14, -4, 0, -18, 14, -4);
    house.fillStyle(0xffd57c, .9).fillRect(-3, 2, 6, 7);
  }

  private drawOrcCamp(x: number, y: number, index: number) {
    const camp = this.add.graphics().setPosition(x, y).setDepth(BOARD_DEPTHS.decorations + 1);
    camp.fillStyle(0x343332, 1).fillTriangle(-13, 12, -8, -15, 12, 12);
    camp.lineStyle(3, 0x62442e, 1).lineBetween(-15, 13, -16, -18).lineBetween(15, 13, 16, -18);
    camp.fillStyle(0xc94d2f, .95).fillTriangle(-15, -17, -5, -13, -15, -8);
    if (index === 1) camp.fillStyle(0xff8b48, .85).fillCircle(0, 7, 3);
  }

  private drawSteppeCamp(x: number, y: number, index: number) {
    const tent = this.add.graphics().setPosition(x, y).setDepth(BOARD_DEPTHS.decorations + 1);
    tent.fillStyle(0xb7894d, 1).fillTriangle(-14, 12, 0, -17, 14, 12);
    tent.lineStyle(2, 0xe5c47e, .8).strokeTriangle(-14, 12, 0, -17, 14, 12);
    tent.lineStyle(2, 0x62462d, 1).lineBetween(0, -17, 0, 14);
    tent.fillStyle(index % 2 ? 0x6c4a88 : 0xb84636, 1).fillTriangle(2, -15, 13, -11, 2, -6);
  }

  private drawElvenShrine(x: number, y: number, index: number) {
    const shrine = this.add.graphics().setPosition(x, y).setDepth(BOARD_DEPTHS.decorations + 1);
    shrine.lineStyle(4, 0xa89eb6, .9).beginPath().moveTo(-10, 12).lineTo(-5, -9).lineTo(0, -18).lineTo(5, -9).lineTo(10, 12).strokePath();
    shrine.fillStyle(index % 2 ? 0xba8df0 : 0x78c8bb, .9).fillCircle(0, -16, 3);
    shrine.lineStyle(1, 0xe6d3ff, .55).strokeCircle(0, -2, 9);
  }

  private drawCenterTitle() {
    const seal = this.add.graphics().setDepth(BOARD_DEPTHS.decorations + 2);
    seal.fillStyle(0x08080b, .58).fillCircle(0, 12, 146);
    seal.lineStyle(3, 0x7f6537, .54).strokeCircle(0, 12, 142);
    seal.lineStyle(1, 0xe0c477, .36).strokeCircle(0, 12, 133);
    this.add.text(0, -43, "CHRONIKEN", {
      color: "#eadcb9", fontFamily: "Georgia, serif", fontSize: "31px", letterSpacing: 7,
      stroke: "#3b2c18", strokeThickness: 3, shadow: { color: "#d5a94e", blur: 10, fill: true }
    }).setOrigin(0.5).setDepth(BOARD_DEPTHS.decorations + 3);
    this.add.text(0, -3, "VON", {
      color: "#a88e58", fontFamily: "Georgia, serif", fontSize: "13px", letterSpacing: 8
    }).setOrigin(0.5).setDepth(BOARD_DEPTHS.decorations + 3);
    this.add.text(0, 36, "VALENØR", {
      color: "#f1d89b", fontFamily: "Georgia, serif", fontSize: "38px", letterSpacing: 8,
      stroke: "#3b2c18", strokeThickness: 3, shadow: { color: "#e3b759", blur: 14, fill: true }
    }).setOrigin(0.5).setDepth(BOARD_DEPTHS.decorations + 3);
    this.add.text(0, 78, "VIER REICHE · EINE KRONE", {
      color: "#9b938a", fontFamily: "Arial, sans-serif", fontSize: "10px", letterSpacing: 4
    }).setOrigin(0.5).setDepth(BOARD_DEPTHS.decorations + 3);

    const compass = this.add.graphics();
    compass.lineStyle(1, 0xd7bb78, 0.32);
    compass.strokeCircle(0, 12, 121);
    compass.beginPath();
    compass.moveTo(0, -114);
    compass.lineTo(10, -92);
    compass.lineTo(0, -101);
    compass.lineTo(-10, -92);
    compass.closePath();
    compass.strokePath();
    compass.setDepth(BOARD_DEPTHS.decorations + 3);
  }

  private drawCardDecks() {
    const createDeck = (x: number, y: number, label: string, color: number, glyph: string) => {
      const deck = this.add.container(x, y).setDepth(BOARD_DEPTHS.decorations + 4).setRotation(x < 0 ? -.035 : .035);
      const shadow = this.add.rectangle(5, 5, 76, 104, 0x000000, .35);
      const lower = this.add.rectangle(2, 2, 76, 104, 0x201812, 1).setStrokeStyle(2, 0x6b5435, .8);
      const card = this.add.rectangle(0, 0, 76, 104, color, .92).setStrokeStyle(2, 0xd8bd78, .76);
      const inner = this.add.rectangle(0, 0, 64, 92, 0x06070c, .32).setStrokeStyle(1, 0xf0d68e, .25);
      const symbol = this.add.text(0, -10, glyph, { color: "#f0d794", fontFamily: "Georgia,serif", fontSize: "24px" }).setOrigin(.5);
      const title = this.add.text(0, 28, label, { color: "#d8c9a4", fontFamily: "Arial,sans-serif", fontSize: "7px", fontStyle: "bold", letterSpacing: 1 }).setOrigin(.5);
      deck.add([shadow, lower, card, inner, symbol, title]);
      return deck;
    };
    createDeck(-390, 78, "ABENTEUER", 0x5b321d, "✦");
    createDeck(390, 78, "SCHICKSAL", 0x272653, "☾");
  }

  private drawMotes() {
    const edgeX = BOARD_INNER_HALF_WIDTH - 18;
    const edgeY = BOARD_INNER_HALF_HEIGHT - 18;
    for (let index = 0; index < this.visualQuality.ambientMotes; index += 1) {
      const x = -edgeX + ((index * 197) % (edgeX * 2));
      const y = -edgeY + ((index * 83) % (edgeY * 2));
      const mote = this.add.circle(x, y, index % 3 === 0 ? 2 : 1.2, index % 2 ? 0xd7bb78 : 0x9f75dc, 0.45).setDepth(BOARD_DEPTHS.effects);
      if (!this.reducedMotion && this.visualQuality.animateAmbient) this.tweens.add({
        targets: mote,
        y: y - 18 - (index % 5) * 4,
        alpha: 0.08,
        duration: 2400 + (index % 7) * 260,
        yoyo: true,
        repeat: -1,
        delay: index * 65
      });
    }
  }

  private drawPlayerTokens() {
    this.state.players.forEach((player, index) => {
      const sameTile = this.state.players.filter((candidate) => candidate.position === player.position);
      const formationIndex = sameTile.findIndex((candidate) => candidate.id === player.id);
      const offset = getTokenSlotOffset(player.position, sameTile.length, formationIndex);
      const labelOffset = getTokenLabelOffset(player.position);
      const position = getTileWorldPosition(player.position);
      const color = PLAYER_COLORS[player.color];
      const token = this.add.container(position.x + offset.x, position.y + offset.y).setAlpha(0).setDepth(BOARD_DEPTHS.players);
      const pointer = this.add.graphics().setAlpha(player.id === this.state.currentPlayerId
        ? TOKEN_VISUAL_CONFIG.pointer.activeAlpha
        : TOKEN_VISUAL_CONFIG.pointer.inactiveAlpha);
      this.drawTokenPointer(pointer, player.position, sameTile.length, formationIndex, color);
      const shadowSoft = this.add.ellipse(4, 15, TOKEN_VISUAL_CONFIG.shadow.softWidth, TOKEN_VISUAL_CONFIG.shadow.softHeight, 0x000000, .32);
      const shadowCore = this.add.ellipse(3, 14, TOKEN_VISUAL_CONFIG.shadow.coreWidth, TOKEN_VISUAL_CONFIG.shadow.coreHeight, 0x000000, .65);
      const glow = this.add.circle(0, 7, 29, color, 0.14 * this.visualQuality.glowAlpha);
      const baseLower = this.add.ellipse(0, 13, 44, 12, 0x050507, .92);
      const baseOuter = this.add.ellipse(0, 10, TOKEN_VISUAL_CONFIG.base.outerWidth, TOKEN_VISUAL_CONFIG.base.outerHeight, 0x15151a, 1).setStrokeStyle(4, color, 1);
      const baseInner = this.add.ellipse(0, 7, TOKEN_VISUAL_CONFIG.base.innerWidth, TOKEN_VISUAL_CONFIG.base.innerHeight, color, .94).setStrokeStyle(2, 0xffedbd, .9);
      const baseRune = this.add.text(0, 5, ["ᚱ", "ᛉ", "ᚨ", "ᛏ"][index] ?? "✦", { color: "#fff1c7", fontSize: "9px", fontFamily: "Georgia,serif" }).setOrigin(.5);
      const miniatureAsset = CHARACTER_ASSETS[index];
      const miniatureVisual = this.add.container(0, 0);
      if (miniatureAsset && this.artLayer?.hasAsset(miniatureAsset)) {
        const outline = fitImage(
          this.add.image(0, -13, miniatureAsset.key),
          TOKEN_VISUAL_CONFIG.assetWidth + TOKEN_VISUAL_CONFIG.outlineExpansion,
          TOKEN_VISUAL_CONFIG.assetHeight + TOKEN_VISUAL_CONFIG.outlineExpansion,
          "contain"
        ).setOrigin(.5, .82).setTint(0x050507).setAlpha(.9);
        const miniature = fitImage(
          this.add.image(0, -13, miniatureAsset.key),
          TOKEN_VISUAL_CONFIG.assetWidth,
          TOKEN_VISUAL_CONFIG.assetHeight,
          "contain"
        ).setOrigin(.5, .82);
        miniatureVisual.add([outline, miniature]);
      } else {
        const silhouette = this.add.ellipse(0, -15, 36, 55, 0x050507, .46);
        miniatureVisual.add([silhouette, this.createMiniature(index, color).setScale(TOKEN_VISUAL_CONFIG.miniatureScale)]);
      }
      const activeRing = this.add.container(0, 7).setVisible(false);
      activeRing.add([
        this.add.circle(0, 0, TOKEN_VISUAL_CONFIG.activeAuraRadius, color, .12),
        this.add.circle(0, 0, TOKEN_VISUAL_CONFIG.activeRingRadius, 0x000000, 0).setStrokeStyle(4, color, .98),
        this.add.circle(0, 0, TOKEN_VISUAL_CONFIG.activeRingRadius - 5, 0x000000, 0).setStrokeStyle(1, 0xffe3a0, .82)
      ]);
      const nameText = this.add.text(0, 0, player.name.toUpperCase(), {
        color: "#fff7df", fontFamily: "Arial,sans-serif", fontSize: "10px", fontStyle: "bold",
        stroke: "#050507", strokeThickness: 3
      }).setOrigin(.5).setResolution(2);
      const namePlate = this.add.graphics();
      const nameWidth = Math.min(82, Math.max(38, nameText.width + 14));
      namePlate.fillStyle(0x07070a, .94).fillRoundedRect(-nameWidth / 2, -9, nameWidth, 18, 5);
      namePlate.lineStyle(2, color, 1).strokeRoundedRect(-nameWidth / 2, -9, nameWidth, 18, 5);
      const nameLabel = this.add.container(labelOffset.x, labelOffset.y, [namePlate, nameText]);
      nameLabel.setVisible(sameTile.length === 1);
      const dungeonMarker = this.add.container(0, -4).setVisible(player.dungeon.inDungeon);
      const bars = this.add.graphics();
      bars.lineStyle(2, 0xc56464, 0.95);
      bars.strokeRoundedRect(-14, -20, 28, 32, 4);
      [-7, 0, 7].forEach((x) => bars.lineBetween(x, -18, x, 10));
      const chain = this.add.text(0, -28, "⛓", { color: "#d88b85", fontSize: "12px" }).setOrigin(0.5);
      dungeonMarker.add([bars, chain]);
      const tokenVisual = this.add.container(0, 0).setName("token-visual");
      tokenVisual.add([pointer, shadowSoft, shadowCore, glow, baseLower, baseOuter, baseInner, baseRune, miniatureVisual, dungeonMarker, activeRing, nameLabel]);
      const relicBadges = this.add.container(0, 0).setName(`relics-${player.id}`);
      tokenVisual.add(relicBadges);
      this.tokenRelics.set(player.id, relicBadges);
      token.add(tokenVisual);
      this.tokens.set(player.id, token);
      this.tokenVisuals.set(player.id, tokenVisual);
      this.tokenNameLabels.set(player.id, nameLabel);
      this.tokenPointers.set(player.id, pointer);
      this.activeRings.set(player.id, activeRing);
      this.dungeonMarkers.set(player.id, dungeonMarker);
      this.tweens.add({ targets: token, alpha: 1, y: token.y - 5, duration: this.reducedMotion ? 80 : 700, delay: this.reducedMotion ? 0 : 2500 + index * 180, ease: "Back.Out" });
      if (!this.reducedMotion) {
        this.tweens.add({ targets: glow, alpha: 0.24, scale: 1.14, duration: 1300, yoyo: true, repeat: -1, delay: 3200 + index * 120 });
        this.tweens.add({ targets: miniatureVisual, y: -4, duration: 1500 + index * 170, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      }
    });
  }

  private syncTokenRelics(state: GameState): void {
    const signature = state.players.map(player => `${player.id}:${player.position}:${player.relics?.join(",")}:${player.armedRelics?.join(",")}`).join("|") + this.relicBadgeSize;
    if (signature === this.relicSignature) return;
    this.relicSignature = signature;
    let iconCount = 0;
    state.players.forEach(player => {
      const row = this.tokenRelics.get(player.id);
      if (!row) return;
      row.removeAll(true);
      const sameTile = state.players.filter(other => other.position === player.position);
      const slot = sameTile.findIndex(other => other.id === player.id);
      const offsets = sameTile.map((_, index) => getTokenSlotOffset(player.position, sameTile.length, index));
      const minX = Math.min(...offsets.map(offset => offset.x));
      const maxX = Math.max(...offsets.map(offset => offset.x));
      const ownX = offsets[slot]!.x;
      const side = getTilePlacement(player.position).side;
      // Fan badges away from the neighboring miniature, using its existing slot.
      const direction = maxX > minX ? (ownX === minX ? -1 : 1) : side === "left" ? -1 : 1;
      const startX = Math.max(48, direction > 0 ? maxX - ownX + 48 : ownX - minX + 48);
      (player.relics ?? []).slice(0, MAX_RELICS).forEach((id, index) => {
        const size = this.relicBadgeSize;
        const badge = this.add.container(direction * (startX + index * (size + 5)), -30).setName(`relic-${id}`);
        const shadow = this.add.circle(1, 3, size / 2 + 2, 0x000000, .5);
        const armed = isRelicArmed(player, id);
        if (armed) badge.add(this.add.circle(0, 0, size / 2 + 5, 0xeabc5c, .16).setStrokeStyle(2, 0xf5d17c, .9));
        const frame = this.add.circle(0, 0, size / 2 + 1, 0x0b0911, .96).setStrokeStyle(1, 0xd8b968, .85);
        const asset = RELIC_ASSETS[id];
        const icon = this.textures.exists(asset.key) ? fitImage(this.add.image(0, 0, asset.key), size - 3, size - 3, "contain") :
          this.add.text(0, 0, RELIC_DEFINITIONS[id].symbol, { color: "#f1d99d", fontSize: `${size * .7}px` }).setOrigin(.5);
        badge.add([shadow, frame, icon]);
        row.add(badge); iconCount++;
      });
    });
    if (import.meta.env.DEV) this.game.canvas.dataset.relicIconCount = String(iconCount);
  }

  private drawTokenPointer(
    graphics: Phaser.GameObjects.Graphics,
    tileIndex: number,
    count: number,
    index: number,
    color: number
  ) {
    const pointer = getTokenPointerGeometry(tileIndex, count, index);
    graphics.clear();
    graphics.lineStyle(TOKEN_VISUAL_CONFIG.pointer.outlineWidth, 0x020204, .62).lineBetween(pointer.start.x, pointer.start.y, pointer.lineEnd.x, pointer.lineEnd.y);
    graphics.lineStyle(TOKEN_VISUAL_CONFIG.pointer.lineWidth, color, 1).lineBetween(pointer.start.x, pointer.start.y, pointer.lineEnd.x, pointer.lineEnd.y);
    graphics.fillStyle(color, 1).fillTriangle(pointer.tip.x, pointer.tip.y, pointer.wingA.x, pointer.wingA.y, pointer.wingB.x, pointer.wingB.y);
    graphics.lineStyle(1, 0x07070a, .72).strokeTriangle(pointer.tip.x, pointer.tip.y, pointer.wingA.x, pointer.wingA.y, pointer.wingB.x, pointer.wingB.y);
  }

  private createMiniature(index: number, playerColor: number): Phaser.GameObjects.Container {
    const miniature = this.add.container(0, -8);
    const body = this.add.graphics();
    const metal = index === 0 ? 0xaaa9a2 : index === 1 ? 0x756f61 : index === 2 ? 0x4b4a58 : 0x67605a;
    const cloth = index === 0 ? 0x3e4451 : index === 1 ? 0x344d39 : index === 2 ? 0x34305b : 0x67372f;
    body.fillStyle(0x151518, .55).fillEllipse(2, 13, 25, 8);
    body.fillStyle(cloth, 1).fillTriangle(-9, 9, 0, -14, 9, 9);
    body.fillStyle(metal, 1).fillCircle(0, -16, 7);
    body.fillStyle(playerColor, .95).fillRect(-7, -5, 14, 5);
    body.lineStyle(2, 0xd8c78f, .75);
    if (index === 0) {
      body.strokeCircle(0, -16, 8);
      body.lineBetween(8, -8, 15, 9);
      body.fillStyle(0xc1b492, 1).fillTriangle(12, -11, 18, -4, 10, -3);
    } else if (index === 1) {
      body.lineStyle(2, 0x8d6338, 1).strokeCircle(9, -8, 8);
      body.lineBetween(7, -15, 14, 2);
      body.fillStyle(playerColor, .9).fillTriangle(-8, -10, -2, -22, 1, -10);
    } else if (index === 2) {
      body.lineStyle(2, 0x8c6a45, 1).lineBetween(8, -9, 13, 11);
      body.fillStyle(playerColor, 1).fillCircle(8, -12, 4);
      body.lineStyle(1, 0xe9ddff, .8).strokeCircle(8, -12, 6);
      body.fillStyle(0x454165, 1).fillTriangle(-8, -18, 0, -29, 8, -18);
    } else {
      body.lineStyle(3, 0x3a3028, 1).lineBetween(-10, -7, -17, 8).lineBetween(10, -7, 17, 8);
      body.fillStyle(0x9a9a92, 1).fillTriangle(-20, 8, -13, -2, -9, 10).fillTriangle(20, 8, 13, -2, 9, 10);
      body.fillStyle(playerColor, .92).fillTriangle(-8, -10, 0, -24, 8, -10);
    }
    const highlight = this.add.circle(-2, -18, 2, 0xffffff, .55);
    miniature.add([body, highlight]);
    return miniature;
  }

  private syncActivePlayer(playerId: string | undefined) {
    this.currentPlayerId = playerId;
    this.activeRings.forEach((ring, id) => {
      const active = id === playerId;
      this.tokenNameLabels.get(id)?.setScale(active ? 1.08 : 1).setAlpha(active ? 1 : .9);
      this.tokenPointers.get(id)?.setAlpha(active ? TOKEN_VISUAL_CONFIG.pointer.activeAlpha : TOKEN_VISUAL_CONFIG.pointer.inactiveAlpha);
      ring.setVisible(active).setScale(1).setAlpha(active ? .9 : 0);
      if (active && !this.reducedMotion) {
        this.tweens.killTweensOf(ring);
        this.tweens.add({ targets: ring, scale: 1.25, alpha: .28, duration: 900, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      } else if (!active) this.tweens.killTweensOf(ring);
    });
  }

  private syncDungeonMarkers(state: GameState) {
    state.players.forEach((player) => this.dungeonMarkers.get(player.id)?.setVisible(player.dungeon.inDungeon));
  }

  private drawOwnershipMarkers() {
    this.ownershipMarkers.forEach((marker) => marker.destroy());
    this.ownershipMarkers.clear();
    this.ownershipSignature = this.state.propertyOwnerships.map((entry) => `${entry.tileIndex}:${entry.ownerId}:${entry.mortgaged}`).join("|");
    this.state.propertyOwnerships.forEach((ownership) => {
      const owner = this.state.players.find((player) => player.id === ownership.ownerId);
      if (!owner) return;
      const place = getTilePlacement(ownership.tileIndex);
      const marker = this.add.container(place.x, place.y).setScale(this.ownershipMarkerScale).setDepth(BOARD_DEPTHS.ownership);
      const ownershipFrame = this.add.rectangle(0, 0, place.width - 7, place.height - 7, 0x000000, 0)
        .setStrokeStyle(4, PLAYER_COLORS[owner.color], .98);
      const badgeX = -place.width / 2 + 18;
      const badgeY = place.height / 2 - 17;
      const glow = this.add.circle(badgeX, badgeY, 14, PLAYER_COLORS[owner.color], .28);
      const banner = this.add.rectangle(badgeX, badgeY, 28, 21, 0x09090c, .96)
        .setStrokeStyle(3, PLAYER_COLORS[owner.color], 1);
      const initials = owner.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "✦";
      const rune = this.add.text(badgeX, badgeY, initials, { color: "#fff3cf", fontFamily: "Arial,sans-serif", fontSize: "10px", fontStyle: "bold", stroke: "#080709", strokeThickness: 2 }).setOrigin(.5);
      marker.add([ownershipFrame, glow, banner, rune]);
      if (ownership.mortgaged) {
        glow.setFillStyle(0x292a31, 0.65);
        banner.setAlpha(.38);
        rune.setAlpha(0.42);
        marker.add(this.add.text(badgeX, badgeY - 17, "⛓", { color: "#c6c2b8", fontSize: "12px" }).setOrigin(0.5));
      }
      this.ownershipMarkers.set(ownership.tileIndex, marker);
    });
  }

  private arrangeTokens(animate: boolean) {
    const byPosition = new Map<number, typeof this.state.players>();
    this.state.players.forEach((player) => {
      const group = byPosition.get(player.position) ?? [];
      group.push(player);
      byPosition.set(player.position, group);
    });
    byPosition.forEach((players, tileIndex) => {
      const position = getTileWorldPosition(tileIndex);
      players.forEach((player, index) => {
        const token = this.tokens.get(player.id);
        if (!token) return;
        const offset = getTokenSlotOffset(tileIndex, players.length, index);
        const labelOffset = getTokenLabelOffset(tileIndex);
        this.tokenNameLabels.get(player.id)?.setPosition(labelOffset.x, labelOffset.y).setVisible(players.length === 1);
        const pointer = this.tokenPointers.get(player.id);
        if (pointer) this.drawTokenPointer(pointer, tileIndex, players.length, index, PLAYER_COLORS[player.color]);
        const target = { x: position.x + offset.x, y: position.y + offset.y - 5 };
        if (animate) this.tweens.add({ targets: token, ...target, duration: 280, ease: "Sine.Out" });
        else token.setPosition(target.x, target.y);
      });
    });
  }

  private animateMovement(next: GameState) {
    const movement = next.lastMovement;
    if (!movement) return;
    const token = this.tokens.get(movement.playerId);
    if (!token) return;
    let startPassPlayed = false;
    const step = (index: number) => {
      const tileIndex = movement.path[index];
      if (tileIndex === undefined) return;
      const fieldPosition = getTileWorldPosition(tileIndex);
      const slot = getTokenSlotOffset(tileIndex, 1, 0);
      const movingPlayer = next.players.find((player) => player.id === movement.playerId);
      const pointer = this.tokenPointers.get(movement.playerId);
      if (pointer && movingPlayer) this.drawTokenPointer(pointer, tileIndex, 1, 0, PLAYER_COLORS[movingPlayer.color]);
      const position = { x: fieldPosition.x + slot.x, y: fieldPosition.y + slot.y };
      const region = BOARD_TILES[tileIndex]?.region;
      const playArrivalAudio = () => {
        deriveMovementStepAudioEvents(tileIndex, movement.passedStart && !startPassPlayed)
          .forEach((event) => {
            if (event === "START_PASS") startPassPlayed = true;
            audioManager.play(event);
          });
      };
      const trailColor = region ? REGION_TRAIL[region] : 0xd7bb78;
      const trail = this.add.circle(token.x, token.y, region === "orcs" ? 3.5 : 4.5, trailColor, 0.42).setDepth(BOARD_DEPTHS.effects);
      this.tweens.add({ targets: trail, alpha: 0, scale: region === "orcs" ? 3 : 2.2, y: trail.y - 8, duration: 420, onComplete: () => trail.destroy() });
      if (this.reducedMotion) {
        token.setPosition(position.x, position.y - 5);
        playArrivalAudio();
        if (index === movement.path.length - 1) this.animateLanding(tileIndex, trailColor);
        else step(index + 1);
        return;
      }
      const middleX = (token.x + position.x) / 2;
      const middleY = (token.y + position.y - 5) / 2 - 12;
      this.tweens.add({
        targets: token,
        x: middleX,
        y: middleY,
        scaleX: .94,
        scaleY: 1.08,
        duration: 90,
        ease: "Sine.Out",
        onComplete: () => {
          this.tweens.add({
            targets: token,
            x: position.x,
            y: position.y - 5,
            scaleX: 1.05,
            scaleY: .94,
            duration: 100,
            ease: "Sine.In",
            onComplete: () => {
              token.setScale(1);
              playArrivalAudio();
              if (index === movement.path.length - 1) this.animateLanding(tileIndex, trailColor);
              else step(index + 1);
            }
          });
        }
      });
    };
    step(0);
  }

  private syncDragon(state: GameState): void {
    const tileIndex = state.wanderingDragon?.tileIndex;
    if (tileIndex === undefined) {
      this.tweens.killTweensOf(this.dragonVisuals);
      this.dragonVisuals.forEach(visual => visual.setVisible(false));
      this.dragonTileIndex = undefined;
      return;
    }
    const definitions = getDragonTerritoryVisuals(tileIndex);
    if (!this.dragon) {
      const frames = getAvailableDragonFrames(key => this.textures.exists(key));
      if (import.meta.env.DEV) this.game.canvas.dataset.dragonFrameCount = String(frames.length);
      if (frames.length && !this.anims.exists(DRAGON_ANIMATION.key)) this.anims.create({ ...DRAGON_ANIMATION, frames });
      definitions.forEach((definition, index) => {
        const main = index === 0;
        const visual = this.add.container(0, 0).setName(main ? "dragon-main" : `dragon-projection-${index}`)
          .setDepth(BOARD_DEPTHS.players - 1).setScale(definition.scale).setAlpha(definition.alpha);
        this.dragonVisuals.push(visual);
        if (main) {
          this.dragon = visual;
          const territory = this.add.ellipse(0, 27, 96, 34, 0xe8aa46, .05).setStrokeStyle(1, 0xf0bd68, .25);
          visual.add(territory);
          if (!this.reducedMotion) this.tweens.add({ targets: territory, alpha: .45, scale: 1.1, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.InOut" });
        }
        const shadow = this.add.ellipse(0, 31, 65, 18, 0x000000, main ? .3 : .2);
        const glow = this.add.circle(0, -4, 32, 0xf0ae43, main ? .14 : .08);
        if (frames.length) {
          const sprite = this.add.sprite(0, -16, frames[0]!.key).setDisplaySize(96, 96).play(DRAGON_ANIMATION.key);
          if (main) this.dragonSprite = sprite;
          visual.add([shadow, glow, sprite]);
          if (!this.reducedMotion) this.tweens.add({ targets: [sprite, glow], y: "-=5", duration: 950, yoyo: true, repeat: -1, ease: "Sine.InOut" });
        } else {
          visual.add([shadow, glow, this.add.text(0, -16, "🐉", { color: "#f5bd6c", fontSize: "40px" }).setOrigin(.5)]);
        }
      });
      if (import.meta.env.DEV && this.dragonSprite) {
        this.game.canvas.dataset.dragonFrameRate = String(this.dragonSprite.anims.currentAnim!.frameRate);
        this.game.canvas.dataset.dragonRepeat = String(this.dragonSprite.anims.currentAnim!.repeat);
      }
    }
    this.dragonVisuals.forEach(visual => visual.setVisible(true));
    if (this.dragonTileIndex === tileIndex) return;
    const place = () => this.dragonVisuals.forEach((visual, index) => {
      const field = getTileWorldPosition(definitions[index]!.tileIndex), offset = getInnerEdgeOffset(definitions[index]!.tileIndex, index === 0 ? 95 : 155);
      visual.setPosition(field.x + offset.x, field.y + offset.y - (index === 0 ? 0 : 36));
    });
    this.tweens.killTweensOf(this.dragonVisuals);
    if (this.dragonTileIndex === undefined || this.reducedMotion) {
      place(); this.dragonVisuals.forEach((visual, index) => visual.setAlpha(definitions[index]!.alpha));
    } else this.tweens.add({ targets: this.dragonVisuals, alpha: 0, duration: 220, onComplete: () => {
      place(); this.dragonVisuals.forEach((visual, index) => this.tweens.add({ targets: visual, alpha: definitions[index]!.alpha, duration: 280 }));
    } });
    this.dragonTileIndex = tileIndex;
    if (import.meta.env.DEV) {
      this.game.canvas.dataset.dragonTileIndex = String(tileIndex);
      this.game.canvas.dataset.dragonVisualTiles = JSON.stringify(definitions.map(definition => definition.tileIndex));
    }
  }

  private animateLanding(tileIndex: number, color: number) {
    const position = getTileWorldPosition(tileIndex);
    const impact = this.add.circle(position.x, position.y + 4, 8, color, .12).setDepth(BOARD_DEPTHS.effects).setStrokeStyle(3, color, .8);
    this.tweens.add({ targets: impact, scale: 3.8, alpha: 0, duration: this.reducedMotion ? 100 : 520, ease: "Sine.Out", onComplete: () => impact.destroy() });
    for (let index = 0; index < (this.reducedMotion ? 0 : 5); index += 1) {
      const mote = this.add.circle(position.x, position.y, 1.5, color, .8).setDepth(BOARD_DEPTHS.effects + 1);
      const angle = (Math.PI * 2 * index) / 5;
      this.tweens.add({ targets: mote, x: position.x + Math.cos(angle) * 23, y: position.y + Math.sin(angle) * 17, alpha: 0, duration: 430, onComplete: () => mote.destroy() });
    }
  }

  private animateDungeonTransfer(next: GameState) {
    const movement = next.lastMovement;
    if (!movement) return;
    const token = this.tokens.get(movement.playerId);
    if (!token) return;
    const source = getTileWorldPosition(movement.from);
    const target = getTileWorldPosition(DUNGEON_TILE_INDEX);
    const sourceRune = this.add.circle(source.x, source.y, 34, 0x8f2530, 0.12).setDepth(BOARD_DEPTHS.effects).setStrokeStyle(3, 0xd15f63, 0.7);
    const targetRune = this.add.circle(target.x, target.y, 38, 0x5b1823, 0.18).setDepth(BOARD_DEPTHS.effects).setStrokeStyle(3, 0xc6535c, 0.8);
    const chains = this.add.text(source.x, source.y - 34, "⛓", { color: "#d27372", fontSize: "24px" }).setOrigin(0.5).setDepth(BOARD_DEPTHS.effects + 1);
    this.tweens.add({ targets: [sourceRune, targetRune], alpha: 0.85, scale: 1.35, duration: 480, yoyo: true, repeat: 1 });
    this.tweens.add({
      targets: token,
      alpha: 0,
      scale: 0.45,
      angle: 24,
      duration: 420,
      ease: "Sine.In",
      onComplete: () => {
        token.setPosition(target.x, target.y - 5).setAngle(-18);
        this.tweens.add({
          targets: token,
          alpha: 1,
          scale: 1,
          angle: 0,
          duration: 520,
          ease: "Back.Out",
          onComplete: () => {
            sourceRune.destroy();
            targetRune.destroy();
            chains.destroy();
          }
        });
      }
    });
  }

  private animateDice(die1: number, die2: number) {
    const cup = this.add.circle(0, 10, 112, 0x120f0c, .76).setDepth(BOARD_DEPTHS.ui).setStrokeStyle(3, die1 === die2 ? 0xf1d89b : 0x8f7548, .72);
    const rune = this.add.text(0, 10, "ᚠ  ·  ᚱ  ·  ᛟ  ·  ᚷ", { color: die1 === die2 ? "#f5d685" : "#85704b", fontFamily: "Georgia,serif", fontSize: "13px", letterSpacing: 5 }).setOrigin(.5).setDepth(BOARD_DEPTHS.ui + 1);
    const first = this.createDie(die1, -62);
    const second = this.createDie(die2, 62);
    [first, second].forEach((die, index) => {
      die.setDepth(BOARD_DEPTHS.ui + 2).setAlpha(0).setScale(0.35).setAngle(index === 0 ? -35 : 35);
      this.tweens.add({
        targets: die,
        alpha: 1,
        scale: 1,
        angle: index === 0 ? 360 : -360,
        y: -18 + index * 5,
        duration: this.reducedMotion ? 120 : 700 + index * 100,
        ease: "Back.Out",
        yoyo: true,
        hold: 650,
        onComplete: () => this.tweens.add({ targets: die, alpha: 0, duration: 350, onComplete: () => die.destroy() })
      });
    });
    this.tweens.add({ targets: [cup, rune], alpha: 0, scale: 1.08, duration: this.reducedMotion ? 300 : 1750, delay: 450, onComplete: () => { cup.destroy(); rune.destroy(); } });
  }

  private createDie(value: number, x: number) {
    const die = this.add.container(x, 12);
    const shadow = this.add.rectangle(7, 9, 74, 74, 0x000000, 0.42).setAngle(3);
    const rim = this.add.rectangle(0, 0, 74, 74, 0x9c7b3f, 1).setStrokeStyle(2, 0xf4d994, .9);
    const face = this.add.rectangle(0, -2, 64, 64, 0xe8ddc4, 1).setStrokeStyle(2, 0xb99a5b, 0.9);
    const shine = this.add.rectangle(-20, -24, 20, 3, 0xffffff, .25);
    die.add([shadow, rim, face, shine]);
    const positions: Record<number, Array<[number, number]>> = {
      1: [[0, 0]], 2: [[-18, -18], [18, 18]], 3: [[-18, -18], [0, 0], [18, 18]],
      4: [[-18, -18], [18, -18], [-18, 18], [18, 18]],
      5: [[-18, -18], [18, -18], [0, 0], [-18, 18], [18, 18]],
      6: [[-18, -20], [18, -20], [-18, 0], [18, 0], [-18, 20], [18, 20]]
    };
    positions[value]!.forEach(([pipX, pipY]) => {
      die.add(this.add.circle(pipX, pipY - 2, 6, 0x5a4228, .35));
      die.add(this.add.circle(pipX, pipY - 2, 4, 0x241e19, 1).setStrokeStyle(1, 0x8c734c, .7));
    });
    return die;
  }

  private highlightTile(index: number) {
    this.highlight?.destroy();
    const layout = getBoardTileVisualLayout(index);
    const group = this.add.container(layout.x, layout.y).setDepth(BOARD_DEPTHS.effects);
    const outline = this.add.graphics();
    outline.lineStyle(4, 0xf1d89b, 0.9);
    outline.strokeRoundedRect(-layout.width / 2 + 4, -layout.height / 2 + 4, layout.width - 8, layout.height - 8, layout.kind === "corner" ? 8 : 5);
    group.add(outline);
    if (!this.reducedMotion) this.tweens.add({ targets: outline, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    this.highlight = group;
  }

  private focusActivePlayer(playerId: string | undefined) {
    if (!playerId) return;
    // The active token ring carries focus without cropping the full widescreen board.
    this.currentPlayerId = playerId;
  }

  private getBoardZoom() {
    return getBoardFitZoom(this.scale.width, this.scale.height);
  }

  private applyBoardVisualScale(boardZoom: number) {
    const scale = getBoardVisualScale(boardZoom, this.scale.width);
    this.ownershipMarkerScale = scale.markerScale;
    this.tokenVisuals.forEach((visual) => visual.setScale(scale.visualTokenScale));
    this.relicBadgeSize = Math.max(18, Math.min(34, 22 / (boardZoom * scale.visualTokenScale)));
    this.syncTokenRelics(this.state);
    this.ownershipMarkers.forEach((marker) => marker.setScale(scale.markerScale));
    this.developmentLayer?.setVisualScale(scale.buildingScale);
    this.propertyGroupLayer?.setVisualScale(scale.groupMarkerScale);
    this.game.canvas.dataset.effectiveBoardScale = scale.effectiveBoardScale.toFixed(4);
    this.game.canvas.dataset.visualTokenScale = scale.visualTokenScale.toFixed(4);
    this.game.canvas.dataset.buildingScale = scale.buildingScale.toFixed(4);
  }

  private fitCamera() {
    const camera = this.cameras.main;
    const finalZoom = this.getBoardZoom();
    this.applyBoardVisualScale(finalZoom);
    camera.centerOn(0, 0);
    camera.setZoom(finalZoom);
    camera.setAlpha(1);
  }
}
