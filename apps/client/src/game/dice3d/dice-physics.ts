import * as CANNON from "cannon-es";

/**
 * Vorab simulierter Wurf zweier Würfel. Das Ergebnis kommt immer vom Server: Wir simulieren einen schönen Wurf,
 * schauen, welche Seite jedes Würfels oben landet, und drehen das Würfelbild im Körper so, dass genau dort die
 * Augenzahl des Servers steht. Abgespielt wird die aufgezeichnete Bahn – die Physik läuft nie live weiter.
 */

export type Vec3 = readonly [number, number, number];
/** Quaternion als [x, y, z, w]. */
export type Quat = readonly [number, number, number, number];

export interface DieFrame { position: Vec3; quaternion: Quat }
export interface DiceTrajectory {
  /** Bilder mit 60 pro Sekunde; das letzte Bild ist die Ruhelage. */
  frames: readonly (readonly [DieFrame, DieFrame])[];
  /** Bildnummern, bei denen ein Würfel hörbar aufschlägt. */
  impacts: readonly number[];
  /** Welche lokale Würfelseite nach der Simulation oben liegt (Index in FACE_NORMALS). */
  topFaces: readonly [number, number];
}

export const DICE_FPS = 60;
/** Die Würfel liegen spätestens nach so vielen Bildern (1,1 s); der Server zieht erst nach 1,25 s. */
export const DICE_SETTLE_FRAMES = 66;
export const DIE_SIZE = 1;
/** Spielfläche der Würfel in Würfelgrößen: so breit und tief, Boden bei y = 0. */
export const DICE_ARENA = { width: 9, depth: 5.5 } as const;

/** Lokale Seitennormalen; Index = Seite. */
export const FACE_NORMALS: readonly Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
/** Klassische Würfel-Belegung des Bildes: Gegenüberliegende Seiten ergeben 7. */
export const FACE_VALUES: readonly number[] = [1, 6, 2, 5, 3, 4];

/** Kleiner, reproduzierbarer Zufall (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function rotateVector(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

export function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
}

/** Welche lokale Seite zeigt bei dieser Lage nach oben, und wie gerade liegt sie (1 = flach)? */
export function topFace(q: Quat): { face: number; flatness: number } {
  let best = { face: 0, flatness: -Infinity };
  FACE_NORMALS.forEach((normal, face) => {
    const up = rotateVector(q, normal)[1];
    if (up > best.flatness) best = { face, flatness: up };
  });
  return best;
}

/** Alle 24 Drehungen eines Würfels als Quaternionen (Vielfache von 90° um die Achsen). */
export const CUBE_ROTATIONS: readonly Quat[] = (() => {
  const around = (axis: Vec3, angle: number): Quat => [axis[0] * Math.sin(angle / 2), axis[1] * Math.sin(angle / 2), axis[2] * Math.sin(angle / 2), Math.cos(angle / 2)];
  // Zuerst bringt man eine beliebige Seite nach +y, dann dreht man um +y.
  const toUp: Quat[] = [[0, 0, 0, 1], around([1, 0, 0], Math.PI / 2), around([1, 0, 0], Math.PI), around([1, 0, 0], -Math.PI / 2), around([0, 0, 1], Math.PI / 2), around([0, 0, 1], -Math.PI / 2)];
  const spins: Quat[] = [0, 1, 2, 3].map(step => around([0, 1, 0], step * Math.PI / 2));
  return toUp.flatMap(base => spins.map(spin => multiplyQuat(spin, base)));
})();

/**
 * Drehung des Würfelbildes im Körper, damit die gewünschte Augenzahl auf der Seite liegt, die nach dem Wurf oben ist:
 * Für Q gilt Q · n(value) = n(topFace). Das Bild wird mit Körperlage · Q gezeichnet.
 */
export function faceRemap(value: number, landedFace: number): Quat {
  const source = FACE_NORMALS[FACE_VALUES.indexOf(value)]!, target = FACE_NORMALS[landedFace]!;
  const rotation = CUBE_ROTATIONS.find(q => {
    const turned = rotateVector(q, source);
    return Math.abs(turned[0] - target[0]) + Math.abs(turned[1] - target[1]) + Math.abs(turned[2] - target[2]) < 1e-6;
  });
  if (!rotation) throw new Error(`Keine Würfeldrehung für ${value} → Seite ${landedFace}`);
  return rotation;
}

/** Welche Augenzahl liegt oben, wenn das Bild mit `remap` im Körper gedreht ist? (Für Tests und Kontrolle.) */
export function visibleValue(bodyQuaternion: Quat, remap: Quat): number {
  const visual = multiplyQuat(bodyQuaternion, remap);
  return FACE_VALUES[topFace(visual).face]!;
}

function simulateOnce(random: () => number): DiceTrajectory | undefined {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -38, 0) });
  world.allowSleep = false;
  const dieMaterial = new CANNON.Material("die"), floorMaterial = new CANNON.Material("floor");
  world.addContactMaterial(new CANNON.ContactMaterial(dieMaterial, floorMaterial, { friction: .32, restitution: .36 }));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMaterial, dieMaterial, { friction: .2, restitution: .4 }));
  const floor = new CANNON.Body({ mass: 0, material: floorMaterial, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  // Unsichtbare Banden halten die Würfel auf der Spielfläche.
  const halfW = DICE_ARENA.width / 2, halfD = DICE_ARENA.depth / 2;
  for (const [x, z, rotation] of [[halfW, 0, -Math.PI / 2], [-halfW, 0, Math.PI / 2], [0, halfD, Math.PI], [0, -halfD, 0]] as const) {
    const wall = new CANNON.Body({ mass: 0, material: floorMaterial, shape: new CANNON.Plane() });
    wall.position.set(x, 0, z);
    wall.quaternion.setFromEuler(0, rotation, 0);
    world.addBody(wall);
  }
  const half = DIE_SIZE / 2;
  const dice = [0, 1].map(index => {
    const body = new CANNON.Body({ mass: 1, material: dieMaterial, shape: new CANNON.Box(new CANNON.Vec3(half, half, half)), linearDamping: .12, angularDamping: .18 });
    body.position.set(-halfW + 1.2 + random() * .6, 2.2 + index * .5 + random() * .4, (index === 0 ? -.8 : .8) + (random() - .5) * .6);
    body.quaternion.setFromEuler(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2);
    body.velocity.set(6.5 + random() * 2.5, 1 + random() * 2, (random() - .5) * 3);
    body.angularVelocity.set((random() - .5) * 26, (random() - .5) * 26, (random() - .5) * 26);
    world.addBody(body);
    return body;
  });
  const frames: [DieFrame, DieFrame][] = [];
  const impacts: number[] = [];
  let lastVertical = dice.map(body => body.velocity.y);
  for (let frame = 0; frame < DICE_SETTLE_FRAMES; frame += 1) {
    world.step(1 / DICE_FPS);
    // Gegen Ende sanft abbremsen, damit die Würfel sicher vor dem Zug liegen.
    if (frame > DICE_SETTLE_FRAMES * .62) dice.forEach(body => { body.velocity.scale(.86, body.velocity); body.angularVelocity.scale(.82, body.angularVelocity); });
    dice.forEach((body, index) => {
      if (lastVertical[index]! < -2.5 && body.velocity.y > lastVertical[index]! + 2.5 && (impacts.at(-1) ?? -10) < frame - 3) impacts.push(frame);
    });
    lastVertical = dice.map(body => body.velocity.y);
    frames.push(dice.map(body => ({ position: [body.position.x, body.position.y, body.position.z] as Vec3, quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w] as Quat })) as [DieFrame, DieFrame]);
  }
  // Ruhig und flach liegen müssen beide; sonst nehmen wir den nächsten Wurf.
  const settled = dice.every(body => body.velocity.length() < .6 && body.angularVelocity.length() < .8);
  const last = frames.at(-1)!;
  const landed = last.map(die => topFace(die.quaternion));
  if (!settled || landed.some(entry => entry.flatness < .985)) return undefined;
  const lying = last.map(die => die.position[1]);
  if (lying.some(height => Math.abs(height - half) > .08)) return undefined;
  return { frames, impacts, topFaces: [landed[0]!.face, landed[1]!.face] };
}

/** Ein schöner, ruhig auslaufender Wurf; derselbe Startwert ergibt immer dieselbe Bahn. */
export function simulateThrow(seed: number): DiceTrajectory {
  const random = seededRandom(seed);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const trajectory = simulateOnce(random);
    if (trajectory) return trajectory;
  }
  throw new Error("Kein ruhiger Würfelwurf gefunden.");
}

/** Bahn plus Bild-Drehungen, sodass genau die Werte des Servers oben liegen. */
export function planThrow(die1: number, die2: number, seed: number) {
  const trajectory = simulateThrow(seed);
  return { trajectory, remaps: [faceRemap(die1, trajectory.topFaces[0]), faceRemap(die2, trajectory.topFaces[1])] as const };
}
