import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DICE_ARENA, DICE_FPS, DIE_SIZE, type DiceTrajectory, type Quat } from "./dice-physics";
import { RUNE_GLOW_DOUBLE, RUNE_GLOW_IDLE, contactShadowTexture, createFaceMaterials, doubleGlowTexture } from "./dice-material";

export interface DicePlayback {
  trajectory: DiceTrajectory;
  remaps: readonly [Quat, Quat];
  double: boolean;
  onImpact?: (frame: number) => void;
  onSettled?: () => void;
}

/** Anteil der Brettbreite, den die Würfel-Leinwand einnimmt (CSS .dice-stage: links und rechts je 20 %). */
const DICE_STAGE_SHARE = .6;

/** Die Würfel wirken etwas kleiner: Die Kamera zeigt so viel mehr Fläche als die Arena selbst. */
const DICE_VIEW_MARGIN = 1.2;

/**
 * Zwei Steinwürfel auf einer durchsichtigen Ebene über dem Brett. Gezeichnet wird nur, solange ein Wurf läuft;
 * danach ruht die Schleife, damit das Brett keine Rechenzeit verliert.
 */
export class DiceRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, .1, 100);
  private readonly dice: THREE.Mesh[] = [];
  private readonly materials: THREE.MeshStandardMaterial[][] = [];
  /** Pasch: dezenter Lichtschein unter den Würfeln. */
  private readonly glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly shadows: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private frameHandle = 0;
  private resizeObserver: ResizeObserver;

  constructor(private readonly container: HTMLElement, private readonly quality: "high" | "medium") {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.domElement.className = "dice-stage__canvas";
    container.appendChild(this.renderer.domElement);

    // Weiches Umgebungslicht für glaubwürdige Reflexe auf dem Stein; dazu warmes Licht von schräg oben.
    const environment = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = environment.fromScene(new RoomEnvironment(), .04).texture;
    environment.dispose();
    this.scene.add(new THREE.HemisphereLight(0xfff1d6, 0x2a1d12, .3));
    const sun = new THREE.DirectionalLight(0xffe2b0, 1.7);
    // Licht von hinten links: Der Schatten fällt nach vorn rechts, wo die Kamera ihn sieht.
    sun.position.set(-6, 10, -2);
    sun.castShadow = true;
    // Die Würfel sind klein im Bild: 1024 bzw. 512 reichen für weiche Schatten und schonen die Bildrate.
    sun.shadow.mapSize.set(quality === "high" ? 1024 : 512, quality === "high" ? 1024 : 512);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const rim = new THREE.PointLight(0xb98cff, 4, 18);
    rim.position.set(5, 4, -4);
    this.scene.add(rim);

    // Nur der Schatten wird auf das Brett gezeichnet; der Boden selbst bleibt unsichtbar.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(DICE_ARENA.width * 1.6, DICE_ARENA.depth * 1.6), new THREE.ShadowMaterial({ opacity: .42 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Kräftig abgerundete Kanten: alt und abgegriffen statt scharfkantig.
    const geometry = new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 5, .17);
    const shadowTexture = contactShadowTexture();
    for (let index = 0; index < 2; index += 1) {
      // Reihenfolge der Materialien wie die Seiten von BoxGeometry: +x, -x, +y, -y, +z, -z (= FACE_NORMALS).
      const materials = createFaceMaterials();
      const die = new THREE.Mesh(geometry, materials);
      die.castShadow = true;
      die.visible = false;
      this.dice.push(die);
      this.materials.push(materials);
      this.scene.add(die);
      // Weicher Kontaktschatten direkt unter dem Würfel, zusätzlich zum Schatten des Lichts.
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0 }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = .01;
      this.shadows.push(shadow);
      this.scene.add(shadow);
    }
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: doubleGlowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = .015;
    this.scene.add(this.glow);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    // Shader schon jetzt übersetzen, damit der erste Wurf nicht ruckelt.
    this.dice.forEach(die => { die.visible = true; });
    this.renderer.compile(this.scene, this.camera);
    this.dice.forEach(die => { die.visible = false; });
    this.renderer.domElement.style.visibility = "hidden";
  }

  /** Spielt den vorab simulierten Wurf ab: Bahn Bild für Bild, das Würfelbild um `remaps` gedreht. */
  play(playback: DicePlayback): void {
    cancelAnimationFrame(this.frameHandle);
    const { trajectory, remaps } = playback;
    const remapQuats = remaps.map(([x, y, z, w]) => new THREE.Quaternion(x, y, z, w));
    const body = new THREE.Quaternion(), next = new THREE.Quaternion();
    this.renderer.domElement.style.visibility = "visible";
    this.dice.forEach(die => { die.visible = true; });
    this.setOpacity(1);
    this.glow.material.opacity = 0;
    const lastFrame = trajectory.frames.length - 1;
    const holdMs = 1_100, fadeMs = 320;
    let heardImpact = -1, settled = false;
    const started = performance.now();
    const tick = (now: number) => {
      // Der erste Zeitstempel des Browsers kann knapp vor `started` liegen.
      const elapsed = Math.max(0, now - started), exact = Math.min(lastFrame, elapsed / 1_000 * DICE_FPS);
      const index = Math.floor(exact), blend = exact - index;
      const current = trajectory.frames[index]!, following = trajectory.frames[Math.min(lastFrame, index + 1)]!;
      this.dice.forEach((die, dieIndex) => {
        const a = current[dieIndex]!, b = following[dieIndex]!;
        die.position.set(a.position[0] + (b.position[0] - a.position[0]) * blend, a.position[1] + (b.position[1] - a.position[1]) * blend, a.position[2] + (b.position[2] - a.position[2]) * blend);
        body.set(...a.quaternion);
        next.set(...b.quaternion);
        body.slerp(next, blend);
        die.quaternion.copy(body).multiply(remapQuats[dieIndex]!);
        // Je höher der Würfel fliegt, desto größer und blasser sein Schatten.
        const shadow = this.shadows[dieIndex]!, lift = Math.max(0, die.position.y - DIE_SIZE / 2);
        shadow.position.set(die.position.x + .3 + lift * .6, .01, die.position.z + .1 + lift * .2);
        shadow.scale.setScalar(1.05 + lift * .35);
        shadow.material.opacity = this.opacity * Math.max(.15, .85 - lift * .3);
      });
      for (const impact of trajectory.impacts) if (impact <= index && impact > heardImpact) { heardImpact = impact; playback.onImpact?.(impact); }
      if (!settled && index >= lastFrame) { settled = true; playback.onSettled?.(); }
      const afterSettle = elapsed - lastFrame / DICE_FPS * 1_000;
      if (playback.double && afterSettle > 0) {
        // Pasch: Die Runen glühen golden auf, darunter ein dezenter Lichtschein.
        const glow = Math.min(1, afterSettle / 380) * (afterSettle < 900 ? 1 : Math.max(.35, 1 - (afterSettle - 900) / 600));
        this.materials.flat().forEach(material => { material.emissiveIntensity = RUNE_GLOW_IDLE + (RUNE_GLOW_DOUBLE - RUNE_GLOW_IDLE) * glow; });
        this.glow.position.set((this.dice[0]!.position.x + this.dice[1]!.position.x) / 2, .015, (this.dice[0]!.position.z + this.dice[1]!.position.z) / 2);
        this.glow.material.opacity = glow * .32 * this.opacity;
      }
      if (afterSettle > holdMs) this.setOpacity(Math.max(0, 1 - (afterSettle - holdMs) / fadeMs));
      this.renderer.render(this.scene, this.camera);
      this.container.dataset.diceFrame = String(index);
      if (afterSettle < holdMs + fadeMs) this.frameHandle = requestAnimationFrame(tick);
      else this.hide();
    };
    this.frameHandle = requestAnimationFrame(tick);
  }

  hide(): void {
    cancelAnimationFrame(this.frameHandle);
    this.dice.forEach(die => { die.visible = false; });
    this.glow.material.opacity = 0;
    this.shadows.forEach(shadow => { shadow.material.opacity = 0; });
    this.materials.flat().forEach(material => { material.emissiveIntensity = RUNE_GLOW_IDLE; });
    this.renderer.render(this.scene, this.camera);
    // Ohne Wurf muss der Browser die durchsichtige Ebene nicht über das Brett legen.
    this.renderer.domElement.style.visibility = "hidden";
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => {
          const standard = material as THREE.MeshStandardMaterial;
          [standard.map, standard.bumpMap, standard.emissiveMap].forEach(map => map?.dispose());
          material.dispose();
        });
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private opacity = 1;

  private setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.materials.flat().forEach(material => { material.opacity = opacity; });
  }

  /**
   * Die Würfelfläche liegt mittig über dem Brett und nimmt etwa 55 % / DICE_VIEW_MARGIN seiner Breite ein. Die Leinwand selbst deckt nur
   * die Mitte (DICE_STAGE_SHARE der Breite, siehe .dice-stage) – weniger Pixel, gleiche Würfelgröße.
   */
  private resize(): void {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const visibleWidth = DICE_ARENA.width / (.55 / DICE_STAGE_SHARE) * DICE_VIEW_MARGIN;
    const distance = visibleWidth / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / this.camera.aspect;
    this.camera.position.set(0, distance * .86, distance * .5);
    this.camera.lookAt(0, 0, .2);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
}
