import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DICE_ARENA, DICE_FPS, DIE_SIZE, FACE_VALUES, type DiceTrajectory, type Quat } from "./dice-physics";

export interface DicePlayback {
  trajectory: DiceTrajectory;
  remaps: readonly [Quat, Quat];
  double: boolean;
  onImpact?: (frame: number) => void;
  onSettled?: () => void;
}

/** Anteil der Brettbreite, den die Würfel-Leinwand einnimmt (CSS .dice-stage: links und rechts je 20 %). */
const DICE_STAGE_SHARE = .6;

const PIPS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]],
  4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]],
  6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]]
};
/** Kleine Rune in einer Ecke jeder Seite – Steinwürfel aus Valenør. */
const RUNES = ["ᚱ", "ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚷ"];

/** Seitenbild: dunkler Stein mit eingelassenen, goldenen Augen und einer Rune. */
function faceTexture(value: number): THREE.CanvasTexture {
  const size = 256, canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const stone = context.createRadialGradient(size * .35, size * .3, size * .1, size * .5, size * .5, size * .75);
  stone.addColorStop(0, "#6d6255"); stone.addColorStop(.6, "#463d34"); stone.addColorStop(1, "#2b241e");
  context.fillStyle = stone; context.fillRect(0, 0, size, size);
  // Feine Maserung, damit der Stein nicht wie Plastik wirkt.
  for (let index = 0; index < 140; index += 1) {
    context.fillStyle = `rgba(${index % 2 ? "255,240,210" : "0,0,0"},${.03 + (index % 5) * .01})`;
    context.fillRect((index * 73) % size, (index * 151) % size, 2 + (index % 4), 1 + (index % 3));
  }
  context.strokeStyle = "rgba(216,185,104,.55)"; context.lineWidth = 6;
  context.strokeRect(14, 14, size - 28, size - 28);
  context.fillStyle = "rgba(216,185,104,.38)"; context.font = "bold 30px serif"; context.textAlign = "center"; context.textBaseline = "middle";
  context.fillText(RUNES[value - 1]!, size - 38, 40);
  for (const [x, y] of PIPS[value]!) {
    const cx = x * size, cy = y * size, radius = value === 1 ? 30 : 21;
    context.fillStyle = "rgba(0,0,0,.6)"; context.beginPath(); context.arc(cx + 2, cy + 3, radius + 2, 0, Math.PI * 2); context.fill();
    const gold = context.createRadialGradient(cx - radius * .35, cy - radius * .35, 1, cx, cy, radius);
    gold.addColorStop(0, "#fff1b8"); gold.addColorStop(.55, "#e1b955"); gold.addColorStop(1, "#8a6420");
    context.fillStyle = gold; context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

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
  private readonly glow: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private frameHandle = 0;
  private resizeObserver: ResizeObserver;

  constructor(private readonly container: HTMLElement, private readonly quality: "high" | "medium") {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.domElement.className = "dice-stage__canvas";
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xfff1d6, 0x2a1d12, 1.2));
    const sun = new THREE.DirectionalLight(0xffe2a8, 2.4);
    sun.position.set(-4, 12, 5);
    sun.castShadow = true;
    // Die Würfel sind klein im Bild: 1024 bzw. 512 reichen für weiche Schatten und schonen die Bildrate.
    sun.shadow.mapSize.set(quality === "high" ? 1024 : 512, quality === "high" ? 1024 : 512);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const rim = new THREE.PointLight(0xb98cff, 9, 18);
    rim.position.set(5, 4, -4);
    this.scene.add(rim);

    // Nur der Schatten wird auf das Brett gezeichnet; der Boden selbst bleibt unsichtbar.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(DICE_ARENA.width * 1.6, DICE_ARENA.depth * 1.6), new THREE.ShadowMaterial({ opacity: .42 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const geometry = new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 4, .13);
    const textures = FACE_VALUES.map(value => faceTexture(value));
    for (let index = 0; index < 2; index += 1) {
      // Reihenfolge der Materialien wie die Seiten von BoxGeometry: +x, -x, +y, -y, +z, -z (= FACE_NORMALS).
      const materials = textures.map(texture => new THREE.MeshStandardMaterial({ map: texture, roughness: .62, metalness: .08, emissive: new THREE.Color(0xf3c25a), emissiveIntensity: 0, transparent: true }));
      const die = new THREE.Mesh(geometry, materials);
      die.castShadow = true;
      die.visible = false;
      this.dice.push(die);
      this.materials.push(materials);
      this.scene.add(die);
    }
    this.glow = new THREE.Mesh(new THREE.RingGeometry(.8, 1.15, 48), new THREE.MeshBasicMaterial({ color: 0xffd77a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = .02;
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
      });
      for (const impact of trajectory.impacts) if (impact <= index && impact > heardImpact) { heardImpact = impact; playback.onImpact?.(impact); }
      if (!settled && index >= lastFrame) { settled = true; playback.onSettled?.(); }
      const afterSettle = elapsed - lastFrame / DICE_FPS * 1_000;
      if (playback.double && afterSettle > 0) {
        // Pasch: goldener Schimmer auf beiden Würfeln und ein Lichtring.
        const glow = Math.max(0, Math.sin(Math.min(1, afterSettle / 700) * Math.PI));
        this.materials.flat().forEach(material => { material.emissiveIntensity = glow * .55; });
        this.glow.position.set((this.dice[0]!.position.x + this.dice[1]!.position.x) / 2, .02, (this.dice[0]!.position.z + this.dice[1]!.position.z) / 2);
        this.glow.scale.setScalar(1 + afterSettle / 900);
        this.glow.material.opacity = glow * .55;
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
    this.materials.flat().forEach(material => { material.emissiveIntensity = 0; });
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
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => { (material as THREE.MeshStandardMaterial).map?.dispose(); material.dispose(); });
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private setOpacity(opacity: number): void {
    this.materials.flat().forEach(material => { material.opacity = opacity; });
  }

  /**
   * Die Würfelfläche liegt mittig über dem Brett und nimmt etwa 55 % seiner Breite ein. Die Leinwand selbst deckt nur
   * die Mitte (DICE_STAGE_SHARE der Breite, siehe .dice-stage) – weniger Pixel, gleiche Würfelgröße.
   */
  private resize(): void {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const visibleWidth = DICE_ARENA.width / (.55 / DICE_STAGE_SHARE);
    const distance = visibleWidth / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / this.camera.aspect;
    this.camera.position.set(0, distance * .86, distance * .5);
    this.camera.lookAt(0, 0, .2);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
}
