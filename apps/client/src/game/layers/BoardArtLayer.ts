import Phaser from "phaser";
import { getActiveChronicleEvent, getChronicleTargetRegions, type GameState, type RegionType } from "@valenor/shared";
import { BOARD_HEIGHT, BOARD_INNER_HALF_HEIGHT, BOARD_INNER_HALF_WIDTH, BOARD_INNER_HEIGHT, BOARD_INNER_WIDTH, BOARD_WIDTH, REALM_LABEL_ALTERNATIVES, REALM_LABEL_POSITIONS, REALM_LABEL_SAFE_ZONES, getTileWorldPosition } from "../board-layout";
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
  private readonly atmosphere: Phaser.GameObjects.GameObject[] = [];
  private readonly ambient = new Map<RegionType, Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics>();

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
      this.scene.add.graphics().setDepth(BOARD_DEPTHS.decorations + 1).setName(`realm-border-${realm}`)
        .lineStyle(8, 0x120e0c, .8).strokePoints(points, true)
        .lineStyle(2, 0xc3a264, .6).strokePoints(points, true);
      const names={elves:"AMETHYSTWALD",humans:"KRONENWALD",orcs:"EISENÖDE",steppe:"SONNENSTEPPE"};
      const {xFactor,yFactor}=REALM_LABEL_POSITIONS[realm];
      const x=Math.min(...points.map(point=>point.x!))+edgeX*xFactor;
      const y=Math.min(...points.map(point=>point.y!))+edgeY*yFactor;
      this.realmLabels.push(this.scene.add.text(x,y,names[realm],{fontFamily:"Georgia,serif",fontSize:"31px",fontStyle:"bold",color:"#eddbaf",letterSpacing:3,stroke:"#16130f",strokeThickness:4,shadow:{color:"#000000",blur:6,fill:true}}).setOrigin(.5).setAlpha(.92).setDepth(BOARD_DEPTHS.players-.5).setName(`realm-label-${realm}`));
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
    this.ambient.forEach(object => { this.scene.tweens.killTweensOf(object); object.destroy(); });
    this.ambient.clear();
    this.atmosphere.forEach(object => object.destroy());
    this.atmosphere.length = 0;
    this.clearChronicleMarkers();
    this.realmPoints.clear();
    this.realmLabels.forEach(label=>label.destroy());this.realmLabels.length=0;
    this.maskSources.forEach((source) => source.destroy());
    this.maskSources.length = 0;
  }

  syncChronicle(state: GameState, reducedMotion = false): void {
    const event = state.status === "playing" ? getActiveChronicleEvent(state) : undefined;
    const regions = getChronicleTargetRegions(event);
    const signature = regions.length ? `${event!.id}:${event!.startedAtRound}:${event!.effectType}:${[...regions].sort().join(",")}:${reducedMotion}` : "";
    if (signature === this.chronicleSignature) return;
    this.clearChronicleMarkers();
    this.chronicleSignature = signature;
    const aura = event && ["regionalRentBonus", "buildSurcharge"].includes(event.effectType) ? 0x9b263e : event && ["purchaseDiscount", "buildDiscount", "mortgageDiscount", "buildingSaleBonus"].includes(event.effectType) ? 0x87a466 : 0xb5c6d7;
    regions.forEach(region => {
      const points = this.realmPoints.get(region);
      if (!points) return;
      const graphics = this.scene.add.graphics().setName(`chronicle-realm-${region}`).setDepth(BOARD_DEPTHS.decorations + 2);
      graphics.fillStyle(0xe9c578, .04).fillPoints(points, true);
      graphics.fillStyle(aura, .045).fillPoints(points, true);
      graphics.lineStyle(16, 0xefc86d, .25).strokePoints(points, true);
      graphics.lineStyle(5, 0xf5d58a, .98).strokePoints(points, true);
      const minX = Math.min(...points.map(point => point.x!)), maxX = Math.max(...points.map(point => point.x!));
      const minY = Math.min(...points.map(point => point.y!)), maxY = Math.max(...points.map(point => point.y!));
      const inner = points.map(point => ({ x: point.x! + (point.x === minX ? 4 : point.x === maxX ? -4 : 0), y: point.y! + (point.y === minY ? 4 : point.y === maxY ? -4 : 0) }));
      graphics.lineStyle(1, 0xffe8af, .8).strokePoints(inner, true);
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
    const complete = new Set<RegionType>();
    (["elves", "humans", "orcs", "steppe"] as const).forEach((realm) => {
      const required = REALM_DECORATIONS.filter((placement) => placement.realm === realm).length;
      if (required > 0 && renderedCounts.get(realm) === required) complete.add(realm);
    });
    return complete;
  }

  renderRealmAtmosphere(reducedMotion: boolean, animate: boolean): void {
    if (this.atmosphere.length) return;
    this.realmPoints.forEach((points, realm) => {
      const minX = Math.min(...points.map(point => point.x!)), minY = Math.min(...points.map(point => point.y!));
      const width = BOARD_INNER_HALF_WIDTH, height = BOARD_INNER_HALF_HEIGHT;
      const shade = this.scene.add.graphics().setDepth(BOARD_DEPTHS.realmBackground + 2);
      // Four short gradients darken only the edges of each printed realm.
      shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, .2, .2, 0, 0).fillRect(minX,minY,width,38);
      shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, .2, .2).fillRect(minX,minY+height-38,width,38);
      shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, .16, 0, .16, 0).fillRect(minX,minY,38,height);
      shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, .16, 0, .16).fillRect(minX+width-38,minY,38,height);
      const colors = {humans:0xb3c989,orcs:0xea864a,elves:0xb291e2,steppe:0xf0cf81};
      const pool = this.scene.add.ellipse(minX+width*.55,minY+height*.5,180,80,colors[realm],.035).setDepth(BOARD_DEPTHS.realmBackground + 2);
      this.atmosphere.push(shade,pool);
    });
    ANIMATED_REALM_DECORATIONS.forEach(placement => {
      const x=placement.x*1.52,y=placement.y*.76;
      const sprite=this.addAtlasSprite(placement.asset,x,y,BOARD_DEPTHS.decorations + 1);
      if(sprite){
        sprite.setScale(placement.scale).setAlpha(.25).setName(`ambient-${placement.realm}`);
        sprite.anims.timeScale=.4;
        if(reducedMotion || !animate)sprite.anims.stop();
        this.ambient.set(placement.realm,sprite);
        return;
      }
      const accent=this.scene.add.graphics().setPosition(x,y).setAlpha(.2).setDepth(BOARD_DEPTHS.decorations + 1).setName(`ambient-${placement.realm}`);
      if(placement.realm === "humans"){
        accent.lineStyle(1,0xd9efdc,.8).strokeEllipse(0,0,58,9).lineBetween(-12,-3,3,-3).lineBetween(8,3,23,3);
      }else if(placement.realm === "orcs"){
        accent.fillStyle(0xef9b55,.8).fillTriangle(-7,9,0,-11,8,9).fillStyle(0xffd594,.8).fillTriangle(-3,8,1,-4,4,8);
      }else if(placement.realm === "elves"){
        accent.fillStyle(0xcba0ff,.8).fillTriangle(-10,10,-4,-8,0,10).fillTriangle(1,10,7,-3,11,10);
        accent.lineStyle(1,0xe9d2ff,.5).strokeEllipse(0,11,35,9);
      }else{
        accent.lineStyle(2,0x72654c,.8).lineBetween(-9,13,-9,-14);
        accent.fillStyle(0xd5b169,.75).fillPoints([{x:-8,y:-13},{x:15,y:-8},{x:10,y:0},{x:-8,y:-3}],true);
      }
      this.ambient.set(placement.realm,accent);
      if(!reducedMotion && animate)this.scene.tweens.add({targets:accent,alpha:placement.realm === "orcs" ? .12 : .09,
        ...(placement.realm === "humans" ? {scaleX:1.035,y:y-1} : placement.realm === "steppe" ? {angle:3} : {}),
        duration:placement.realm === "orcs" ? 2000 : 4200,yoyo:true,repeat:-1,ease:"Sine.InOut"});
    });
  }

  syncRealmLabels(blockers: readonly Phaser.Geom.Rectangle[]): void {
    this.realmLabels.forEach(label => {
      const realm=label.name.replace("realm-label-","") as RegionType;
      const points=this.realmPoints.get(realm)!;
      const minX=Math.min(...points.map(point=>point.x!)),minY=Math.min(...points.map(point=>point.y!));
      const preferred=REALM_LABEL_POSITIONS[realm];
      let best={x:minX+BOARD_INNER_HALF_WIDTH*preferred.xFactor,y:minY+BOARD_INNER_HALF_HEIGHT*preferred.yFactor,score:Infinity};
      for(const [xf,yf] of [[preferred.xFactor,preferred.yFactor],...REALM_LABEL_ALTERNATIVES[realm]]){
        const x=minX+BOARD_INNER_HALF_WIDTH*xf!,y=minY+BOARD_INNER_HALF_HEIGHT*yf!;
        const box=new Phaser.Geom.Rectangle(x-label.width/2-6,y-label.height/2-6,label.width+12,label.height+12);
        if(REALM_LABEL_SAFE_ZONES.some(zone=>Phaser.Geom.Intersects.RectangleToRectangle(box,new Phaser.Geom.Rectangle(zone.x,zone.y,zone.width,zone.height))))continue;
        const score=blockers.reduce((sum,blocker)=>sum+Math.max(0,Math.min(box.right,blocker.right)-Math.max(box.left,blocker.left))*Math.max(0,Math.min(box.bottom,blocker.bottom)-Math.max(box.top,blocker.top)),0);
        if(score<best.score)best={x,y,score};
      }
      label.setPosition(best.x,best.y);
    });
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
