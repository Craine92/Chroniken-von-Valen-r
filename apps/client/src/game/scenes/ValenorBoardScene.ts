import Phaser from "phaser";
import { BOARD_TILES, getPropertyGroupTiles, DUNGEON_TILE_INDEX, MAX_RELICS, RELIC_DEFINITIONS, isRelicArmed, type GameState, type PropertyGroupId, type RegionType } from "@valenor/shared";
import { BOARD_HEIGHT, BOARD_HALF_HEIGHT, BOARD_HALF_WIDTH, BOARD_INNER_HALF_HEIGHT, BOARD_INNER_HALF_WIDTH, BOARD_WIDTH, REALM_LABEL_SAFE_ZONES, getBoardFitZoom, getDragonAnchor, getTileInnerAnchor, getTilePlacement, getTileWorldPosition, getTokenLabelOffset, getTokenSlotOffset } from "../board-layout";
import { PropertyDevelopmentLayer } from "../layers/PropertyDevelopmentLayer";
import { MortgageOverlayLayer } from "../layers/MortgageOverlayLayer";
import { PropertyGroupLayer } from "../layers/PropertyGroupLayer";
import { BoardArtLayer } from "../layers/BoardArtLayer";
import { getCharacterAsset, DRAGON_ANIMATION, getAvailableDragonFrames, getDragonTerritoryVisuals, RELIC_ASSETS, VALENOR_ASSETS } from "../assets/asset-manifest";
import { fitImage } from "../assets/asset-runtime";
import { BOARD_DEPTHS } from "../layers/board-depths";
import { DEFAULT_GRAPHICS_QUALITY, VISUAL_QUALITY, prefersReducedMotion } from "../visual-config";
import { BoardTileRenderer } from "../tiles/BoardTileRenderer";
import { getBoardTileVisualLayout } from "../tiles/board-tile-layout";
import { CARD_DRAW_DURATION_MS, DEFAULT_BOARD_PRESENTATION_MODE, LANDING_CONNECTION_DURATION_MS, getBoardVisualScale, getCardPresentationKey, getBoardScreenLayout, type BoardPresentationMode } from "../board-presentation";
import { getTokenPointerGeometry, TOKEN_VISUAL_CONFIG } from "../tokens/token-visuals";
import { audioManager } from "../../audio/AudioManager";
import { deriveMovementStepAudioEvents } from "../../audio/game-audio-events";

function getMovementSignature(state: GameState): string {
  const movement = state.lastMovement;
  return movement ? `${movement.sequence ?? state.turnContext.rollSequence}-${movement.kind}-${movement.from}-${movement.to}` : "";
}

import { PLAYER_COLOR_VALUES as PLAYER_COLORS, PLAYER_CHARACTERS } from "@valenor/shared";

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
  private landingTimer: Phaser.Time.TimerEvent | undefined;
  private lastLandingSignature = "";
  private lastImpactSignature = "";
  private connectionTimer: Phaser.Time.TimerEvent | undefined;
  private connectionPlayerId: string | undefined;
  private activeField: Phaser.GameObjects.Graphics | undefined;
  private activeFieldSignature = "";
  private tavernGlow: Phaser.GameObjects.Graphics | undefined;
  private tavernGlowLevel = -1;
  private readonly cardDecks = new Map<string, Phaser.GameObjects.Container>();
  private cardSignature = "";
  private readonly temporaryVisuals = new Set<Phaser.GameObjects.Container>();
  private boardReady = false;
  private pendingState: GameState | undefined;
  private developmentLayer: PropertyDevelopmentLayer | undefined;
  private mortgageOverlayLayer: MortgageOverlayLayer | undefined;
  private artLayer: BoardArtLayer | undefined;
  private tileLayer: Phaser.GameObjects.Layer | undefined;
  private propertyGroupLayer: PropertyGroupLayer | undefined;
  private externalPropertyGroupFocus: PropertyGroupId | undefined;
  private currentPlayerId: string | undefined;
  private dragon: Phaser.GameObjects.Container | undefined;
  private readonly dragonVisuals: Phaser.GameObjects.Container[] = [];
  private dragonSprite: Phaser.GameObjects.Sprite | undefined;
  private dragonTileIndex: number | undefined;
  private dragonPlacementSignature = "";
  private lastWorldImpulseStartedAt = 0;
  private lastWorldImpulseResolvedAt = 0;
  private worldImpulseEffectSignature = "";
  private readonly worldImpulseMarkers: Phaser.GameObjects.Graphics[] = [];
  private lastCelebrationId = "";
  private readonly reducedMotion = prefersReducedMotion();
  private readonly visualQuality = VISUAL_QUALITY[DEFAULT_GRAPHICS_QUALITY];
  private lastDiagnosticAt = 0;
  private readonly handleResize = () => { this.fitCamera(); this.syncRealmNames(); };

  constructor(gameState: GameState, private readonly presentationMode: BoardPresentationMode = DEFAULT_BOARD_PRESENTATION_MODE) {
    super("valenor-board");
    this.state = gameState;
    this.lastMovementSignature = getMovementSignature(gameState);
  }

  create() {
    this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
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
    this.artLayer.renderRealmAtmosphere(this.reducedMotion, this.visualQuality.animateAmbient);
    this.drawRealmMiniatures(renderedRealmBackgrounds);
    this.artLayer.renderBoardEffects();
    this.drawCenterTitle();
    this.artLayer.syncChronicle(this.state, this.reducedMotion);
    this.drawCardDecks();
    this.syncCardDecks(this.state);
    this.drawPlayerTokens();
    this.syncTokenRelics(this.state);
    this.syncDragon(this.state);
    this.syncWorldImpulse(this.state);
    this.syncMomentumCelebration(this.state);
    this.syncActivePlayer(this.state.currentPlayerId);
    this.syncFieldFeedback();
    this.drawOwnershipMarkers();
    this.developmentLayer = new PropertyDevelopmentLayer(this);
    this.developmentLayer.sync(this.state, false);
    this.mortgageOverlayLayer = new MortgageOverlayLayer(this);
    this.mortgageOverlayLayer.sync(this.state);
    this.fitCamera();
    this.syncRealmNames();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.boardReady = true;
    this.game.canvas.dataset.boardReady = "true";
    this.game.canvas.dataset.boardTileCount = String(BOARD_TILES.length);
    this.game.canvas.dataset.boardWidth = String(BOARD_WIDTH);
    this.game.canvas.dataset.boardHeight = String(BOARD_HEIGHT);
    this.game.canvas.dataset.boardAspect = (BOARD_WIDTH / BOARD_HEIGHT).toFixed(4);
    this.game.canvas.dataset.boardPresentationMode = this.presentationMode;
    this.game.canvas.dataset.proceduralRealmFallbacks = String(4 - renderedRealmBackgrounds.size);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE,this.handleResize);
      this.clearLandingHighlight();
      this.clearLandingConnection();
      this.resetCardDecks();
      this.cardDecks.clear();
      this.cardSignature="";
      this.activeField=undefined;this.activeFieldSignature="";
      this.temporaryVisuals.forEach(visual => { this.tweens.killTweensOf(visual.list); visual.destroy(); });
      this.temporaryVisuals.clear();
      if(this.tavernGlow)this.tweens.killTweensOf(this.tavernGlow);
      this.tavernGlow=undefined;this.tavernGlowLevel=-1;
      this.boardReady = false;
      this.game.canvas.dataset.boardReady = "false";
      this.developmentLayer?.destroy();
      this.mortgageOverlayLayer?.destroy();
      this.propertyGroupLayer?.destroy();
      this.artLayer?.destroy();
      this.developmentLayer = undefined;
      this.mortgageOverlayLayer = undefined;
      this.propertyGroupLayer = undefined;
      this.artLayer = undefined;
      this.tileLayer = undefined;
      this.dragon = undefined;
      this.dragonSprite = undefined;
      this.dragonTileIndex = undefined;
      this.dragonVisuals.length = 0;
      this.dragonPlacementSignature="";
      this.clearWorldImpulseMarkers();
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
    this.syncCardDecks(next);
    this.propertyGroupLayer?.sync(next);
    this.artLayer?.syncChronicle(next, this.reducedMotion);
    this.syncActivePlayer(next.currentPlayerId);
    this.syncFieldFeedback();
    if (playerChanged && next.turnPhase === "waitingForRoll") this.focusActivePlayer(next.currentPlayerId);
    this.syncDungeonMarkers(next);
    this.syncTokenRelics(next);
    this.syncDragon(next);
    this.syncWorldImpulse(next);
    this.syncMomentumCelebration(next);
    this.developmentLayer?.sync(next, true);
    this.mortgageOverlayLayer?.sync(next);
    const ownershipSignature = next.propertyOwnerships.map((entry) => `${entry.tileIndex}:${entry.ownerId}:${entry.mortgaged}`).join("|");
    if (ownershipSignature !== this.ownershipSignature) this.drawOwnershipMarkers();
    if (next.lastMovement?.playerId === next.currentPlayerId && !["moving","cardMoving","rolling","dungeonRolling","dungeonTransfer","waitingForRoll","determiningOrder","turnTransition"].includes(next.turnPhase)) {
      this.arrangeTokens(true);
      if (next.lastMovement && movementSignature !== this.lastLandingSignature) {
        this.lastLandingSignature = movementSignature;
        const player = next.players.find(player => player.id === next.lastMovement!.playerId);
        this.highlightTile(next.lastMovement.to, player ? PLAYER_COLORS[player.color] : 0xf1d89b);
        this.showLandingConnection(next.lastMovement.playerId);
      }
    }
    if (next.turnPhase === "waitingForRoll" || next.turnPhase === "determiningOrder") {
      this.clearLandingHighlight();
      this.arrangeTokens(true);
    }
    this.syncRealmNames();
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
    stage.fillGradientStyle(0x050507, 0x08070a, 0x09070b, 0x030305, .32);
    stage.fillRect(-1_800, -1_300, 3_600, 2_600);
    this.add.circle(0, 20, 690, 0x8b5e36, .055).setDepth(BOARD_DEPTHS.table + 1);
    this.add.circle(-290, 170, 420, 0x5d397c, .045).setDepth(BOARD_DEPTHS.table + 1);
    const vignette = this.add.graphics().setDepth(BOARD_DEPTHS.table + 2);
    vignette.lineStyle(180, 0x010102, .42).strokeRect(-1_200, -900, 2_400, 1_800);
  }

  private drawBoardShadow() {
    const shadow = this.add.graphics().setDepth(BOARD_DEPTHS.shadow);
    shadow.fillStyle(0x000000, 0.62);
    shadow.fillRoundedRect(-BOARD_HALF_WIDTH - 34, -BOARD_HALF_HEIGHT - 6, BOARD_WIDTH + 80, BOARD_HEIGHT + 82, 22);
    const frame = this.add.graphics().setDepth(BOARD_DEPTHS.frame);
    frame.fillGradientStyle(0x4a3521, 0x29201b, 0x110e0c, 0x24180f, 1);
    frame.fillRoundedRect(-BOARD_HALF_WIDTH - 19, -BOARD_HALF_HEIGHT - 19, BOARD_WIDTH + 38, BOARD_HEIGHT + 38, 14);
    frame.lineStyle(5, 0x09090b, 1);
    frame.strokeRoundedRect(-BOARD_HALF_WIDTH - 17, -BOARD_HALF_HEIGHT - 17, BOARD_WIDTH + 34, BOARD_HEIGHT + 34, 12);
    frame.lineStyle(5, 0xb08b4b, 0.92);
    frame.strokeRoundedRect(-BOARD_HALF_WIDTH - 13, -BOARD_HALF_HEIGHT - 13, BOARD_WIDTH + 26, BOARD_HEIGHT + 26, 12);
    frame.lineStyle(2, 0xf0d994, 0.72);
    frame.strokeRoundedRect(-BOARD_HALF_WIDTH - 7, -BOARD_HALF_HEIGHT - 7, BOARD_WIDTH + 14, BOARD_HEIGHT + 14, 8);
    frame.lineStyle(3, 0x4a321e, 0.9);
    frame.strokeRect(-BOARD_HALF_WIDTH + 2, -BOARD_HALF_HEIGHT + 2, BOARD_WIDTH - 4, BOARD_HEIGHT - 4);

    const ornament = this.add.graphics().setDepth(BOARD_DEPTHS.frame + 1);
    ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as Array<[number, number]>).forEach(([sx, sy]) => {
      const x = sx * (BOARD_HALF_WIDTH + 4);
      const y = sy * (BOARD_HALF_HEIGHT + 4);
      ornament.fillStyle(0x1a1512, 1).fillCircle(x, y, 14);
      ornament.lineStyle(3, 0xc9a85f, 0.88).strokeCircle(x, y, 12);
      ornament.lineStyle(1, 0xf4dd9a, 0.65).strokeCircle(x, y, 8);
      ornament.fillStyle(0xd7bb78, 0.85).fillPoints([
        { x, y: y - 7 }, { x: x + 4, y }, { x, y: y + 7 }, { x: x - 4, y }
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
    const logo = this.add.container(0,0).setName("board-center-logo").setScale(.76).setAlpha(.9).setDepth(BOARD_DEPTHS.decorations + 3);
    const seal = this.add.graphics().setDepth(BOARD_DEPTHS.decorations + 2);
    seal.fillStyle(0x08080b, .58).fillCircle(0, 12, 146);
    seal.lineStyle(7, 0x171310, .95).strokeCircle(0, 12, 142);
    seal.lineStyle(3, 0xe0c180, .95).strokeCircle(0, 12, 142);
    seal.lineStyle(1, 0xffe5a5, .8).strokeCircle(0, 12, 134);
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI / 6;
      seal.fillStyle(0xd7bb78, .65).fillCircle(Math.cos(angle) * 138, 12 + Math.sin(angle) * 138, 2);
    }
    logo.add(seal);
    logo.add(this.add.text(0, -43, "CHRONIKEN", {
      color: "#fff0cc", fontFamily: "Georgia, serif", fontSize: "31px", letterSpacing: 7,
      stroke: "#3b2c18", strokeThickness: 3, shadow: { color: "#d5a94e", blur: 10, fill: true }
    }).setOrigin(0.5));
    logo.add(this.add.text(0, -3, "VON", {
      color: "#a88e58", fontFamily: "Georgia, serif", fontSize: "13px", letterSpacing: 8
    }).setOrigin(0.5));
    logo.add(this.add.text(0, 36, "VALENØR", {
      color: "#ffe7aa", fontFamily: "Georgia, serif", fontSize: "38px", letterSpacing: 8,
      stroke: "#3b2c18", strokeThickness: 3, shadow: { color: "#e3b759", blur: 14, fill: true }
    }).setOrigin(0.5));
    logo.add(this.add.text(0, 78, "VIER REICHE · EINE KRONE", {
      color: "#9b938a", fontFamily: "Arial, sans-serif", fontSize: "10px", letterSpacing: 4
    }).setOrigin(0.5));

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
    logo.add(compass);
  }

  private drawCardDecks() {
    const createDeck = (x: number, label: string, kind: "adventure" | "fate", glyph: string) => {
      const asset = kind === "adventure" ? VALENOR_ASSETS.cards.adventureFrame : VALENOR_ASSETS.cards.fateFrame;
      const deck = this.add.container(x, 78).setName(`deck-${kind}`).setDepth(BOARD_DEPTHS.decorations + 4).setRotation(x < 0 ? -.035 : .035);
      deck.add(this.add.ellipse(7, 13, 138, 165, 0x000000, .16));
      deck.add(this.add.rectangle(7, 10, 112, 157, 0x000000, .22));
      const glow=this.add.rectangle(0,0,120,165,kind === "adventure" ? 0xd8b968 : 0xafa1e5,.1).setStrokeStyle(3,0xe5cb8e,.45).setAlpha(.3).setName("deck-glow");
      deck.add(glow);
      for (const offset of [8, 4, 0]) {
        if(offset)deck.add(this.add.rectangle(offset,offset,112,157,0xd5c4a4,.9).setStrokeStyle(1,0x77613e,.8).setRotation(offset===8 ? -.026 : .017));
        const card = this.artLayer?.hasAsset(asset)
          ? fitImage(this.add.image(offset, offset, asset.key), 112, 157, "contain")
          : this.add.rectangle(offset, offset, 112, 157, kind === "adventure" ? 0x5b321d : 0x272653).setStrokeStyle(2, 0xd8bd78);
        card.setName(`deck-card-${offset}`);
        card.setRotation(offset===8 ? -.026 : offset===4 ? .017 : 0);
        if(card instanceof Phaser.GameObjects.Image)card.setTint(offset ? 0xd7c9af : 0xffffff);
        if(!offset)card.setY(-1.5);
        deck.add(card);
      }
      const symbol = this.add.text(0, -4, glyph, { color: "#62471f", fontFamily: "Georgia,serif", fontSize: "32px" }).setOrigin(.5);
      const title = this.add.text(0, 27, label, { color: "#352315", fontFamily: "Georgia,serif", fontSize: "12px", fontStyle: "bold" }).setOrigin(.5).setResolution(2);
      deck.add([symbol, title]);
      this.cardDecks.set(kind,deck);
      return deck;
    };
    createDeck(-390, "ABENTEUER", "adventure", "✦");
    createDeck(390, "SCHICKSAL", "fate", "☾");
  }

  private resetCardDecks() {
    this.cardDecks.forEach(deck => {
      const card=deck.getByName("deck-card-0") as Phaser.GameObjects.Image;
      const glow=deck.getByName("deck-glow") as Phaser.GameObjects.Rectangle;
      if(!card || !glow)return;
      this.tweens.killTweensOf([card,glow]);
      card.setPosition(0,-1.5).setVisible(true).setAlpha(1);
      glow.setAlpha(.3);
    });
  }

  private syncCardDecks(state: GameState) {
    const signature=getCardPresentationKey(state);
    if(signature === this.cardSignature)return;
    this.cardSignature=signature;
    this.resetCardDecks();
    if(!state.activeCard || this.reducedMotion)return;
    const deck=this.cardDecks.get(state.activeCard.deck);
    if(!deck)return;
    const card=deck.getByName("deck-card-0") as Phaser.GameObjects.Image;
    const glow=deck.getByName("deck-glow") as Phaser.GameObjects.Rectangle;
    glow.setAlpha(1);
    this.tweens.add({targets:glow,alpha:.3,duration:CARD_DRAW_DURATION_MS,ease:"Sine.Out"});
    this.tweens.add({targets:card,y:-8,alpha:0,duration:160,ease:"Sine.Out"});
  }

  private drawPlayerTokens() {
    this.state.players.forEach((player, index) => {
      const sameTile = this.state.players.filter((candidate) => candidate.position === player.position);
      const formationIndex = sameTile.findIndex((candidate) => candidate.id === player.id);
      const offset = this.getTokenOffset(player.position, sameTile.length, formationIndex);
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
      const baseRune = this.add.text(0, 5, "ᚱ", { color: "#fff1c7", fontSize: "9px", fontFamily: "Georgia,serif" }).setOrigin(.5);
      const miniatureAsset = getCharacterAsset(player.characterId);
      const miniatureVisual = this.add.container(0, 0).setName("token-character");
      if (miniatureAsset && this.artLayer?.hasAsset(miniatureAsset)) {
        const goldOutline = fitImage(
          this.add.image(0, -13, miniatureAsset.key),
          TOKEN_VISUAL_CONFIG.assetWidth + TOKEN_VISUAL_CONFIG.outlineExpansion + 5,
          TOKEN_VISUAL_CONFIG.assetHeight + TOKEN_VISUAL_CONFIG.outlineExpansion + 7,
          "contain"
        ).setOrigin(.5, .82).setTintFill(0xd9b95f).setAlpha(.98);
        const darkSeparator = fitImage(
          this.add.image(0, -13, miniatureAsset.key),
          TOKEN_VISUAL_CONFIG.assetWidth + TOKEN_VISUAL_CONFIG.outlineExpansion,
          TOKEN_VISUAL_CONFIG.assetHeight + TOKEN_VISUAL_CONFIG.outlineExpansion,
          "contain"
        ).setOrigin(.5, .82).setTintFill(0x050507).setAlpha(.96);
        const miniature = fitImage(
          this.add.image(0, -13, miniatureAsset.key),
          TOKEN_VISUAL_CONFIG.assetWidth,
          TOKEN_VISUAL_CONFIG.assetHeight,
          "contain"
        ).setOrigin(.5, .82);
        miniatureVisual.add([goldOutline, darkSeparator, miniature]);
      } else {
        const silhouette = this.add.ellipse(0, -15, 36, 55, 0x050507, .46);
        miniatureVisual.add([silhouette, this.createMiniature(PLAYER_CHARACTERS.findIndex(character=>character.id===player.characterId), color).setScale(TOKEN_VISUAL_CONFIG.miniatureScale)]);
      }
      const activeRing = this.add.container(0, 7).setVisible(false);
      activeRing.add([
        this.add.circle(0, 0, TOKEN_VISUAL_CONFIG.activeAuraRadius, color, .12),
        this.add.circle(0, 0, TOKEN_VISUAL_CONFIG.activeRingRadius, 0x000000, 0).setStrokeStyle(4, color, .98),
        this.add.circle(0, 0, TOKEN_VISUAL_CONFIG.activeRingRadius - 5, 0x000000, 0).setStrokeStyle(2, 0xffe3a0, .92)
      ]);
      const nameText = this.add.text(0, 0, player.name.toUpperCase(), {
        color: "#fff7df", fontFamily: "Arial,sans-serif", fontSize: "12px", fontStyle: "bold",
        stroke: "#050507", strokeThickness: 3
      }).setOrigin(.5).setResolution(2);
      const namePlate = this.add.graphics();
      if (nameText.width > 70) nameText.setScale(70 / nameText.width);
      const nameWidth = Math.min(84, Math.max(44, nameText.displayWidth + 14));
      namePlate.fillStyle(0x000000, .45).fillRoundedRect(-nameWidth / 2+2, -8, nameWidth, 22, 5);
      namePlate.fillStyle(0x07070a, .97).fillRoundedRect(-nameWidth / 2, -11, nameWidth, 22, 5);
      namePlate.lineStyle(2, color, 1).strokeRoundedRect(-nameWidth / 2, -11, nameWidth, 22, 5);
      const nameLabel = this.add.container(labelOffset.x,labelOffset.y,[namePlate,nameText]);
      nameLabel.setScale(sameTile.length > 1 ? .8 : 1);
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
      const offsets = sameTile.map((_, index) => this.getTokenOffset(player.position, sameTile.length, index));
      const minX = Math.min(...offsets.map(offset => offset.x));
      const maxX = Math.max(...offsets.map(offset => offset.x));
      const ownX = offsets[slot]!.x;
      const side = getTilePlacement(player.position).side;
      // Fan badges away from the neighboring miniature, using its existing slot.
      const direction = maxX > minX ? (ownX === minX ? -1 : 1) : side === "left" ? -1 : 1;
      const startX = Math.max(48, direction > 0 ? maxX - ownX + 48 : ownX - minX + 48);
      (player.relics ?? []).slice(0, MAX_RELICS).forEach((id, index) => {
        const size = this.relicBadgeSize;
        const crowded = sameTile.length >= 5;
        const badge = this.add.container(crowded ? (index - (Math.min(MAX_RELICS, (player.relics ?? []).length) - 1) / 2) * (size + 4) : direction * (startX + index * (size + 5)),
          crowded ? getTokenLabelOffset(player.position).y + 22 : -30).setName(`relic-${id}`);
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
    const visualScale=getBoardVisualScale(this.getBoardZoom(),this.scale.width).visualTokenScale;
    graphics.setScale(1/visualScale);
    const pointer = getTokenPointerGeometry(tileIndex,count,index,visualScale,this.hasBuilding(tileIndex));
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
    if(this.connectionPlayerId && this.connectionPlayerId !== playerId)this.clearLandingConnection();
    this.currentPlayerId = playerId;
    this.activeRings.forEach((ring, id) => {
      const active = id === playerId;
      const player = this.state.players.find(candidate => candidate.id === id);
      const crowded = this.state.players.filter(candidate => candidate.position === player?.position).length > 1;
      this.tokenNameLabels.get(id)?.setScale(crowded ? .8 : active ? 1.08 : 1).setAlpha(active ? 1 : .9);
      if(id !== this.connectionPlayerId)this.tokenPointers.get(id)?.setAlpha(active ? TOKEN_VISUAL_CONFIG.pointer.activeAlpha : TOKEN_VISUAL_CONFIG.pointer.inactiveAlpha);
      if(ring.getData("active") === active)return;
      ring.setData("active",active).setVisible(active).setScale(1).setAlpha(active ? .9 : 0);
      if (active && !this.reducedMotion) {
        this.tweens.killTweensOf(ring);
        this.tweens.add({ targets: ring, scale: 1.07, alpha: .8, duration: 1200, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      } else if (!active) this.tweens.killTweensOf(ring);
    });
  }

  private syncDungeonMarkers(state: GameState) {
    state.players.forEach((player) => this.dungeonMarkers.get(player.id)?.setVisible(player.dungeon.inDungeon));
  }

  private syncRealmNames() {
    const blockers=this.children.list.filter(object=>object instanceof Phaser.GameObjects.Container && object.depth === BOARD_DEPTHS.buildings).map(object=>(object as Phaser.GameObjects.Container).getBounds());
    this.cardDecks.forEach(deck=>blockers.push(deck.getBounds()));
    this.state.players.forEach(player=>{
      const token=this.tokens.get(player.id),visual=this.tokenVisuals.get(player.id);
      if(!token || !visual)return;
      const occupants=this.state.players.filter(candidate=>candidate.position === player.position);
      const slot=this.getTokenOffset(player.position,occupants.length,occupants.findIndex(candidate=>candidate.id === player.id));
      const field=getTileWorldPosition(player.position);
      const character=visual.getByName("token-character") as Phaser.GameObjects.Container;
      for(const object of [character,this.tokenNameLabels.get(player.id),this.tokenRelics.get(player.id)])if(object){
        const box=object.getBounds();box.x+=field.x+slot.x-token.x;box.y+=field.y+slot.y-5-token.y;
        blockers.push(box);
      }
    });
    this.artLayer?.syncRealmLabels(blockers);
  }

  private clearLandingConnection() {
    this.connectionTimer?.remove(false);this.connectionTimer=undefined;
    if(this.connectionPlayerId){const pointer=this.tokenPointers.get(this.connectionPlayerId);if(pointer){this.tweens.killTweensOf(pointer);pointer.setAlpha(0);}}
    this.connectionPlayerId=undefined;
  }

  private showLandingConnection(playerId: string) {
    this.clearLandingConnection();
    const pointer=this.tokenPointers.get(playerId);
    if(!pointer || this.reducedMotion)return;
    this.connectionPlayerId=playerId;
    pointer.setAlpha(.6);
    this.connectionTimer=this.time.delayedCall(LANDING_CONNECTION_DURATION_MS-500,()=>{
      this.connectionTimer=undefined;
      this.tweens.add({targets:pointer,alpha:playerId === this.state.currentPlayerId ? TOKEN_VISUAL_CONFIG.pointer.activeAlpha : TOKEN_VISUAL_CONFIG.pointer.inactiveAlpha,duration:500,ease:"Sine.Out",onComplete:()=>{this.connectionPlayerId=undefined;}});
    });
  }

  private syncFieldFeedback() {
    const current=this.state.players.find(player=>player.id === this.state.currentPlayerId);
    const signature=current && this.state.status === "playing" ? `${current.id}:${current.position}:${current.color}` : "";
    if(signature !== this.activeFieldSignature){
      this.activeFieldSignature=signature;
      this.activeField ??= this.add.graphics().setName("active-player-field").setDepth(BOARD_DEPTHS.tileFields+1);
      this.activeField.clear();
      if(signature && current){const tile=getTilePlacement(current.position),color=PLAYER_COLORS[current.color];
        this.activeField.setPosition(tile.x,tile.y).fillStyle(color,.055).fillRoundedRect(-tile.width/2+8,-tile.height/2+8,tile.width-16,tile.height-16,5)
          .lineStyle(4,color,.3).strokeRoundedRect(-tile.width/2+9,-tile.height/2+9,tile.width-18,tile.height-18,5);
      }
    }
    const pot=this.state.weltenwegPot ?? 0;
    const level=pot<200 ? 0 : pot<500 ? 1 : pot<800 ? 2 : 3;
    if(level === this.tavernGlowLevel)return;
    this.tavernGlowLevel=level;
    const tile=getTilePlacement(20);
    this.tavernGlow ??= this.add.graphics().setPosition(tile.x,tile.y).setName("tavern-pot-glow").setDepth(BOARD_DEPTHS.tileFields+2);
    this.tweens.killTweensOf(this.tavernGlow);
    this.tavernGlow.clear().setAlpha(1).setVisible(level>0);
    if(!level)return;
    this.tavernGlow.lineStyle(12,0xe9bf65,.035*level).strokeRoundedRect(-tile.width/2+7,-tile.height/2+7,tile.width-14,tile.height-14,7)
      .lineStyle(3,0xffd98a,.14*level).strokeRoundedRect(-tile.width/2+6,-tile.height/2+6,tile.width-12,tile.height-12,7);
    if(!this.reducedMotion)this.tweens.add({targets:this.tavernGlow,alpha:.65,duration:3600,yoyo:true,repeat:-1,ease:"Sine.InOut"});
  }

  private drawOwnershipMarkers() {
    const previous=new Map(this.ownershipMarkers);
    this.ownershipMarkers.forEach((marker) => { this.tweens.killTweensOf(marker);marker.destroy(); });
    this.ownershipMarkers.clear();
    this.ownershipSignature = this.state.propertyOwnerships.map((entry) => `${entry.tileIndex}:${entry.ownerId}:${entry.mortgaged}`).join("|");
    this.state.propertyOwnerships.forEach((ownership) => {
      const owner = this.state.players.find((player) => player.id === ownership.ownerId);
      if (!owner) return;
      const place = getTilePlacement(ownership.tileIndex);
      const marker = this.add.container(place.x, place.y).setScale(this.ownershipMarkerScale).setDepth(BOARD_DEPTHS.ownership);
      if(!previous.has(ownership.tileIndex) && this.boardReady && !this.reducedMotion){
        marker.setAlpha(0);this.tweens.add({targets:marker,alpha:1,duration:500,ease:"Sine.Out"});
      }
      const ownershipFrame = this.add.rectangle(0, 0, place.width - 7, place.height - 7, 0x000000, 0)
        .setName("ownership-frame").setStrokeStyle(5, PLAYER_COLORS[owner.color], 1);
      const inner = place.side === "bottom" ? {x:0,y:-place.height/2+9,w:place.width-14,h:4} : place.side === "top" ? {x:0,y:place.height/2-9,w:place.width-14,h:4} : place.side === "left" ? {x:place.width/2-9,y:0,w:4,h:place.height-14} : {x:-place.width/2+9,y:0,w:4,h:place.height-14};
      const strip = this.add.rectangle(inner.x,inner.y,inner.w,inner.h,PLAYER_COLORS[owner.color],.95).setName("ownership-strip");
      const badgeX = -place.width / 2 + 18;
      const badgeY = place.height / 2 - 17;
      const glow = this.add.circle(badgeX, badgeY, 14, PLAYER_COLORS[owner.color], .28);
      const banner = this.add.rectangle(badgeX, badgeY, 28, 21, 0x09090c, .96)
        .setStrokeStyle(3, PLAYER_COLORS[owner.color], 1);
      const initials = owner.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "✦";
      const rune = this.add.text(badgeX, badgeY, initials, { color: "#fff3cf", fontFamily: "Arial,sans-serif", fontSize: "10px", fontStyle: "bold", stroke: "#080709", strokeThickness: 2 }).setOrigin(.5);
      if(ownership.mortgaged)marker.add(this.add.rectangle(0,0,place.width-9,place.height-9,0x000000,.28).setName("mortgage-shade"));
      marker.add([ownershipFrame, strip, glow, banner, rune]);
      const group = BOARD_TILES[ownership.tileIndex]?.propertyGroup;
      if(group && getPropertyGroupTiles(group).every(tile=>this.state.propertyOwnerships.some(entry=>entry.tileIndex===tile.index && entry.ownerId===owner.id))) {
        const landscape=place.side === "left" || place.side === "right";
        marker.add(this.add.text(badgeX+35,landscape?19:26,"♛",{color:"#f1d99d",fontSize:landscape?"10px":"16px",stroke:`#${PLAYER_COLORS[owner.color].toString(16).padStart(6,"0")}`,strokeThickness:2}).setOrigin(.5).setName("complete-group-crown"));
      }
      if (ownership.mortgaged) {
        glow.setFillStyle(0x292a31, 0.65);
        banner.setAlpha(.85);
        rune.setAlpha(.9);
        marker.add(this.add.text(badgeX-3, 24, "⛓", { color: "#eee3cc", fontSize: "14px",stroke:"#080709",strokeThickness:2 }).setOrigin(0.5).setName("mortgage-lock"));
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
        const offset = this.getTokenOffset(tileIndex, players.length, index);
        const labelOffset = getTokenLabelOffset(tileIndex);
        this.tokenNameLabels.get(player.id)?.setPosition(labelOffset.x,labelOffset.y).setVisible(true).setScale(players.length > 1 ? .8 : player.id === this.state.currentPlayerId ? 1.08 : 1);
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
      const slot = this.getTokenOffset(tileIndex, 1, 0);
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

  private hasBuilding(tileIndex: number) {
    return this.state.propertyOwnerships.some(ownership=>ownership.tileIndex===tileIndex && ownership.buildingLevel>0);
  }

  private getTokenOffset(tileIndex: number, count: number, index: number) {
    return getTokenSlotOffset(tileIndex,count,index,this.hasBuilding(tileIndex));
  }

  private getDragonPosition(tileIndex: number, scale: number) {
    const field=getTilePlacement(tileIndex),unit=Math.min(field.width,field.height),anchor=getDragonAnchor(tileIndex,scale);
    const blockers=REALM_LABEL_SAFE_ZONES.map(zone=>new Phaser.Geom.Rectangle(zone.x,zone.y,zone.width,zone.height));
    this.state.propertyOwnerships.filter(ownership=>ownership.buildingLevel>0).forEach(ownership=>{
      const tile=getTilePlacement(ownership.tileIndex),offset=getTileInnerAnchor(ownership.tileIndex,"building"),size=Math.min(tile.width,tile.height);
      blockers.push(new Phaser.Geom.Rectangle(tile.x+offset.x-size*.4,tile.y+offset.y-size*.78,size*.8,size*1.05));
    });
    this.state.players.forEach(player=>{
      const occupants=this.state.players.filter(candidate=>candidate.position===player.position);
      const tile=getTilePlacement(player.position),offset=this.getTokenOffset(player.position,occupants.length,occupants.findIndex(candidate=>candidate.id===player.id));
      const size=Math.min(tile.width,tile.height);
      blockers.push(new Phaser.Geom.Rectangle(tile.x+offset.x-size*.48,tile.y+offset.y-size*.87,size*.96,size*1.35));
    });
    const nx=Math.sign(anchor.x),ny=Math.sign(anchor.y);
    const candidates=[{x:0,y:0},{x:nx*unit*.6,y:ny*unit*.6},{x:nx*unit*1.2,y:ny*unit*1.2},
      {x:ny ? -unit*.7 : nx*unit*.6,y:nx ? -unit*.7 : ny*unit*.6},
      {x:ny ? unit*.7 : nx*unit*.6,y:nx ? unit*.7 : ny*unit*.6},
      {x:ny ? -unit : nx*unit*.6,y:nx ? -unit : ny*unit*.6},
      {x:ny ? unit : nx*unit*.6,y:nx ? unit : ny*unit*.6},
      {x:nx*unit*2.4,y:0},{x:0,y:ny*unit*2.4},
      {x:nx*unit*1.8,y:ny*unit*1.8}];
    let best={x:field.x+anchor.x,y:field.y+anchor.y,score:Infinity};
    for(const shift of candidates){
      const x=field.x+anchor.x+shift.x,y=field.y+anchor.y+shift.y;
      const box=new Phaser.Geom.Rectangle(x-54*scale,y-70*scale,108*scale,112*scale);
      if(box.left < -BOARD_INNER_HALF_WIDTH || box.right > BOARD_INNER_HALF_WIDTH || box.top < -BOARD_INNER_HALF_HEIGHT || box.bottom > BOARD_INNER_HALF_HEIGHT)continue;
      const score=blockers.reduce((sum,blocker)=>sum+Math.max(0,Math.min(box.right,blocker.right)-Math.max(box.left,blocker.left))*Math.max(0,Math.min(box.bottom,blocker.bottom)-Math.max(box.top,blocker.top)),0);
      if(score<best.score)best={x,y,score};
      if(!score)break;
    }
    return best;
  }

  private syncDragon(state: GameState): void {
    const tileIndex = state.wanderingDragon?.tileIndex;
    if (tileIndex === undefined) {
      this.tweens.killTweensOf(this.dragonVisuals);
      this.dragonVisuals.forEach(visual => visual.setVisible(false));
      this.dragonTileIndex = undefined;
      this.dragonPlacementSignature="";
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
        const glow = this.add.circle(0, -4, 32, main ? 0xf0ae43 : 0x9c85d9, main ? .14 : .12).setName(main ? "dragon-ground-glow" : "dragon-echo-glow");
        if (frames.length) {
          const sprite = this.add.sprite(0, -16, frames[0]!.key).setDisplaySize(96, 96).play(DRAGON_ANIMATION.key);
          if (main) this.dragonSprite = sprite;
          const outlineSize=main ? 104 : 102;
          const outline=this.add.image(0,-16,frames[0]!.key).setTintFill(0xd8b968).setDisplaySize(outlineSize,outlineSize).setName("dragon-gold-outline");
          sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE,()=>outline.setTexture(sprite.texture.key).setDisplaySize(outlineSize,outlineSize));
          visual.add([shadow,glow,outline,sprite]);
          if (!this.reducedMotion) this.tweens.add({ targets: [sprite,outline,glow], y: "-=5", duration: 950, yoyo: true, repeat: -1, ease: "Sine.InOut" });
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
    const signature=`${tileIndex}:${state.players.map(player=>`${player.id}:${player.position}`).join(",")}:${state.propertyOwnerships.map(ownership=>`${ownership.tileIndex}:${ownership.buildingLevel}`).join(",")}`;
    if(this.dragonPlacementSignature === signature)return;
    this.dragonPlacementSignature=signature;
    const place = () => this.dragonVisuals.forEach((visual, index) => {
      const position=this.getDragonPosition(definitions[index]!.tileIndex,definitions[index]!.scale);
      visual.setPosition(position.x,position.y);
    });
    this.tweens.killTweensOf(this.dragonVisuals);
    if (this.dragonTileIndex === undefined || this.dragonTileIndex === tileIndex || this.reducedMotion) {
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

  private clearWorldImpulseMarkers(): void {
    this.worldImpulseMarkers.forEach(marker => { this.tweens.killTweensOf(marker); marker.destroy(); });
    this.worldImpulseMarkers.length = 0;
  }

  private syncWorldImpulse(state: GameState): void {
    const effects = state.worldImpulseEffects;
    const persistentSignature = `${effects?.runeSpark ? 1 : 0}:${effects?.harborWindUntilRound === state.currentRound ? state.currentRound : 0}`;
    if (persistentSignature !== this.worldImpulseEffectSignature) {
      this.worldImpulseEffectSignature = persistentSignature;
      this.clearWorldImpulseMarkers();
      const indices = [
        ...(effects?.runeSpark ? [0] : []),
        ...(effects?.harborWindUntilRound === state.currentRound ? BOARD_TILES.filter(tile => tile.type === "harbor").map(tile => tile.index) : [])
      ];
      indices.forEach(tileIndex => {
        const tile = getTilePlacement(tileIndex);
        const harbor = BOARD_TILES[tileIndex]?.type === "harbor";
        const marker = this.add.graphics().setName(harbor ? "harbor-wind-aura" : "rune-spark-aura").setDepth(BOARD_DEPTHS.effects);
        marker.lineStyle(5, harbor ? 0x63bfe8 : 0xc58cff, .7).strokeRoundedRect(tile.x - tile.width / 2 + 5, tile.y - tile.height / 2 + 5, tile.width - 10, tile.height - 10, 10);
        marker.fillStyle(harbor ? 0x5ab6dd : 0xd2a4ff, .06).fillRoundedRect(tile.x - tile.width / 2 + 5, tile.y - tile.height / 2 + 5, tile.width - 10, tile.height - 10, 10);
        this.worldImpulseMarkers.push(marker);
        if (!this.reducedMotion) this.tweens.add({ targets: marker, alpha: .35, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      });
    }
    const impulse = state.activeWorldImpulse;
    const resolution = state.lastWorldImpulseResolution;
    if (resolution?.resolvedAt && resolution.resolvedAt !== this.lastWorldImpulseResolvedAt) {
      this.lastWorldImpulseResolvedAt = resolution.resolvedAt;
      const token = resolution.targetPlayerId ? this.tokens.get(resolution.targetPlayerId) : undefined;
      if (token && resolution.resultGold !== undefined) {
        const popup = this.add.text(token.x, token.y - 68, `${resolution.resultGold > 0 ? "+" : ""}${resolution.resultGold} GOLD`, {
          color: resolution.resultGold > 0 ? "#ffe18a" : "#a9a49a", fontFamily: "Arial", fontSize: "22px", fontStyle: "bold",
          stroke: "#24160a", strokeThickness: 5
        }).setOrigin(.5).setDepth(BOARD_DEPTHS.ui);
        this.tweens.add({ targets: popup, y: popup.y - 34, alpha: 0, duration: this.reducedMotion ? 250 : 1250, ease: "Sine.Out", onComplete: () => popup.destroy() });
      }
    }
    if (!impulse || impulse.startedAt === this.lastWorldImpulseStartedAt) return;
    this.lastWorldImpulseStartedAt = impulse.startedAt;
    const flash = this.add.rectangle(0, 0, BOARD_WIDTH, BOARD_HEIGHT, 0xe8ba55, .12).setDepth(BOARD_DEPTHS.ui - 1);
    this.tweens.add({ targets: flash, alpha: 0, duration: this.reducedMotion ? 150 : 650, ease: "Sine.Out", onComplete: () => flash.destroy() });
    if (impulse.id === "dragonCall") {
      const shade = this.add.rectangle(0, 0, BOARD_WIDTH, BOARD_HEIGHT, 0x09070a, .12).setDepth(BOARD_DEPTHS.ui - 2);
      this.tweens.add({ targets: shade, alpha: 0, duration: this.reducedMotion ? 150 : 700, ease: "Sine.Out", onComplete: () => shade.destroy() });
    }
    const targetToken = impulse.targetPlayerId ? this.tokens.get(impulse.targetPlayerId) : undefined;
    if (targetToken) {
      const beam = this.add.circle(targetToken.x, targetToken.y, 28, 0xf0c663, .13).setDepth(BOARD_DEPTHS.effects + 2).setStrokeStyle(5, 0xf7da86, .9);
      this.tweens.add({ targets: beam, scale: 1.55, alpha: 0, duration: this.reducedMotion ? 180 : 900, ease: "Sine.Out", onComplete: () => beam.destroy() });
    }
    const targetIndex = impulse.targetTileIndex ?? (impulse.id === "dragonCall" ? state.wanderingDragon?.tileIndex : undefined);
    if (targetIndex === undefined) return;
    const tile = getTilePlacement(targetIndex);
    const pulse = this.add.graphics().setDepth(BOARD_DEPTHS.effects + 2);
    pulse.lineStyle(7, impulse.id === "dragonCall" ? 0xef784d : 0xf3ca67, .9).strokeRoundedRect(tile.x - tile.width / 2 + 3, tile.y - tile.height / 2 + 3, tile.width - 6, tile.height - 6, 10);
    this.tweens.add({ targets: pulse, alpha: 0, scaleX: 1.06, scaleY: 1.06, duration: this.reducedMotion ? 180 : 850, yoyo: !this.reducedMotion, repeat: this.reducedMotion ? 0 : 1, onComplete: () => pulse.destroy() });
  }

  private syncMomentumCelebration(state: GameState): void {
    const celebration = state.lastMomentumCelebration;
    if (!celebration || celebration.id === this.lastCelebrationId) return;
    this.lastCelebrationId = celebration.id;
    let indices: number[] = [];
    let color = 0xe8c66e;
    if (celebration.type === "completeGroup") {
      indices = getPropertyGroupTiles(celebration.groupId).map(tile => tile.index);
      const player = state.players.find(entry => entry.id === celebration.playerId);
      if (player) color = PLAYER_COLORS[player.color];
      const token = this.tokens.get(celebration.playerId);
      if (token) {
        const aura = this.add.circle(token.x, token.y, 31, color, .12)
          .setDepth(BOARD_DEPTHS.effects + 2)
          .setStrokeStyle(5, 0xf4d784, .95);
        this.tweens.add({
          targets: aura,
          scale: this.reducedMotion ? 1.08 : 1.45,
          alpha: 0,
          duration: this.reducedMotion ? 220 : 1100,
          ease: "Sine.Out",
          onComplete: () => aura.destroy()
        });
      }
    } else if (celebration.type === "maxBuilding") indices = [celebration.tileIndex];
    indices.forEach(tileIndex => {
      const tile = getTilePlacement(tileIndex);
      const glow = this.add.graphics().setDepth(BOARD_DEPTHS.effects + 2);
      glow.lineStyle(8, color, .9).strokeRoundedRect(tile.x - tile.width / 2 + 3, tile.y - tile.height / 2 + 3, tile.width - 6, tile.height - 6, 10);
      glow.lineStyle(3, 0xf4d784, 1).strokeRoundedRect(tile.x - tile.width / 2 + 9, tile.y - tile.height / 2 + 9, tile.width - 18, tile.height - 18, 8);
      this.tweens.add({ targets: glow, alpha: 0, duration: this.reducedMotion ? 200 : 1400, ease: "Sine.Out", onComplete: () => glow.destroy() });
      if (!this.reducedMotion) for (let index = 0; index < 8; index += 1) {
        const mote = this.add.circle(tile.x, tile.y, 2, 0xf4d784, .9).setDepth(BOARD_DEPTHS.effects + 3);
        const angle = Math.PI * 2 * index / 8;
        this.tweens.add({ targets: mote, x: tile.x + Math.cos(angle) * 50, y: tile.y + Math.sin(angle) * 38, alpha: 0, duration: 700, onComplete: () => mote.destroy() });
      }
    });
  }

  private animateLanding(tileIndex: number, color: number) {
    const signature=`${getMovementSignature(this.state)}:${tileIndex}`;
    if(signature === this.lastImpactSignature)return;
    this.lastImpactSignature=signature;
    const position = getTileWorldPosition(tileIndex);
    const impact = this.add.circle(position.x, position.y + 4, 8, 0xe9c77d, .1).setDepth(BOARD_DEPTHS.effects).setStrokeStyle(3, 0xf1d89b, .8);
    this.tweens.add({ targets: impact, scale: 3.8, alpha: 0, duration: this.reducedMotion ? 100 : 600, ease: "Sine.Out", onComplete: () => impact.destroy() });
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
    this.temporaryVisuals.forEach(visual=>{this.tweens.killTweensOf(visual.list);visual.destroy();});
    this.temporaryVisuals.clear();
    const rollVisual=this.add.container(0,0).setName("dice-roll-presentation").setDepth(BOARD_DEPTHS.ui);
    this.temporaryVisuals.add(rollVisual);
    const cup = this.add.circle(0, 10, 112, 0x120f0c, .76).setDepth(BOARD_DEPTHS.ui).setStrokeStyle(3, die1 === die2 ? 0xf1d89b : 0x8f7548, .72);
    const rune = this.add.text(0, 10, "ᚠ  ·  ᚱ  ·  ᛟ  ·  ᚷ", { color: die1 === die2 ? "#f5d685" : "#85704b", fontFamily: "Georgia,serif", fontSize: "13px", letterSpacing: 5 }).setOrigin(.5).setDepth(BOARD_DEPTHS.ui + 1);
    const first = this.createDie(die1, -62);
    const second = this.createDie(die2, 62);
    rollVisual.add([cup,rune,first,second]);
    const faces=this.game.canvas.parentElement?.closest(".board-stage")?.querySelectorAll(".dice-face");
    const canvasBounds=this.game.canvas.getBoundingClientRect();
    const layout=getBoardScreenLayout(this.scale.width,this.scale.height);
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
        onComplete: () => {
          const face=faces?.[index]?.getBoundingClientRect();
          const target=face ? this.cameras.main.getWorldPoint(face.x+face.width/2-canvasBounds.x,face.y+face.height/2-canvasBounds.y) : {x:index ? 22 : -22,y:-BOARD_HALF_HEIGHT-35};
          this.tweens.add({targets:die,x:target.x,y:target.y,angle:0,scale:Math.min(.55,Math.max(.25,layout.topSpace*.7/(74*layout.zoom))),duration:this.reducedMotion ? 100 : 400,delay:this.reducedMotion ? 0 : 300,ease:"Cubic.InOut",
            onComplete:()=>this.tweens.add({targets:die,alpha:0,duration:100,onComplete:()=>{die.setVisible(false);if(index === 1){this.tweens.killTweensOf(rollVisual.list);this.temporaryVisuals.delete(rollVisual);rollVisual.destroy();}}})});
        }
      });
    });
    this.tweens.add({ targets: [cup, rune], alpha: 0, scale: 1.08, duration: this.reducedMotion ? 100 : 600, delay: 450 });
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

  private clearLandingHighlight() {
    this.landingTimer?.remove(false); this.landingTimer=undefined;
    if(this.highlight){this.tweens.killTweensOf(this.highlight.list);this.tweens.killTweensOf(this.highlight);this.highlight.destroy();this.highlight=undefined;}
  }

  private highlightTile(index: number, color: number) {
    this.clearLandingHighlight();
    this.animateLanding(index,color);
    const layout = getBoardTileVisualLayout(index);
    const group = this.add.container(layout.x, layout.y).setName("landing-highlight").setDepth(BOARD_DEPTHS.effects);
    const glow = this.add.rectangle(0,0,layout.width-8,layout.height-8,color,.08).setStrokeStyle(10,color,.2);
    const outline = this.add.graphics();
    outline.lineStyle(5, 0xf1d89b, 1);
    outline.strokeRoundedRect(-layout.width / 2 + 4, -layout.height / 2 + 4, layout.width - 8, layout.height - 8, layout.kind === "corner" ? 8 : 5);
    group.add([glow,outline]);
    if (!this.reducedMotion) this.tweens.add({ targets: [glow,outline], alpha: .6, duration: 400, yoyo: true, repeat: 2 });
    this.highlight = group;
    this.landingTimer=this.time.delayedCall(2400,()=>this.clearLandingHighlight());
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
    this.state.players.forEach(player=>{const occupants=this.state.players.filter(candidate=>candidate.position===player.position);const pointer=this.tokenPointers.get(player.id);if(pointer)this.drawTokenPointer(pointer,player.position,occupants.length,occupants.findIndex(candidate=>candidate.id===player.id),PLAYER_COLORS[player.color]);});
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
