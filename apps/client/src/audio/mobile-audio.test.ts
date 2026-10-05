import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { AudioManager } from "./AudioManager";
import { AUDIO_CUES } from "./audio-config";

function environment(t: TestContext, missing = false) {
  const originals = ["window", "document", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const starts: number[][] = [], requested: string[] = [], stored = new Map<string, string>();
  const gain = () => ({
    connect: (target: unknown) => target,
    gain: { value: 1, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }
  });
  class Context {
    state = "running"; currentTime = 0; destination = {};
    createGain = gain;
    createBufferSource() {
      return { buffer: undefined, detune: { value: 0 }, onended: undefined, connect: (node: unknown) => node,
        start: (...args: number[]) => { starts.push(args); }, stop() {} };
    }
    decodeAudioData() { return Promise.resolve({ duration: 3 }); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    AudioContext: Context, localStorage: { getItem: () => null, setItem: (key: string, value: string) => stored.set(key, value) }
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: { dataset: {} } } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (path: string) => {
    requested.push(path);
    const absent = missing || path.includes("/mobile/");
    return new Response(absent ? null : new ArrayBuffer(8), { status: absent ? 404 : 200 });
  } });
  t.mock.method(console, "warn", () => undefined);
  t.after(() => originals.forEach(([key, descriptor]) => descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key)));
  return { starts, requested, stored };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("mobile audio uses installed fallback assets, respects SFX toggle and caps playback", async (t) => {
  const env = environment(t), manager = new AudioManager();
  manager.setOutputRole("controller"); await manager.unlock(); await flush();
  manager.updateSettings({ sfxEnabled: false });
  manager.play("MOBILE_TURN"); await flush(); assert.equal(env.starts.length, 0);
  manager.updateSettings({ sfxEnabled: true, hapticsEnabled: false });
  manager.play("MOBILE_TURN"); await flush();
  assert.deepEqual(env.starts, [[0, 0, 0.7]]);
  assert.ok(env.requested.includes("/assets/audio/sfx/mobile/turn.ogg"));
  assert.ok(env.requested.includes("/assets/audio/sfx/ui/confirm.ogg"));
  assert.equal(JSON.parse([...env.stored.values()][0]!).hapticsEnabled, false);
  manager.play("TOKEN_MOVE"); await flush(); assert.equal(env.starts.length, 1);
  manager.setOutputRole("primary"); manager.play("MOBILE_TRADE_OFFER"); await flush();
  assert.equal(env.starts.length, 1);
});

test("missing optional and fallback audio files resolve safely without starting a source", async (t) => {
  const env = environment(t, true), manager = new AudioManager();
  manager.setOutputRole("controller"); await manager.unlock(); manager.play("MOBILE_PURCHASE");
  await flush(); await flush();
  assert.equal(env.starts.length, 0);
  assert.ok(env.requested.includes("/assets/audio/sfx/property/property-buy.ogg"));
});

test("a valid optional mobile recording takes precedence over fallback files", async (t) => {
  const env = environment(t), manager = new AudioManager();
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (path: string) => {
    env.requested.push(path); return new Response(new ArrayBuffer(8));
  } });
  manager.setOutputRole("controller"); await manager.unlock(); await flush();
  assert.ok(env.requested.includes("/assets/audio/sfx/mobile/turn.ogg"));
  assert.ok(!env.requested.includes("/assets/audio/sfx/ui/confirm.ogg"));
  manager.play("MOBILE_TURN"); await flush(); assert.equal(env.starts.length, 1);
});

test("mobile manifest remains quieter and shorter than TV cues", () => {
  const mobile = Object.entries(AUDIO_CUES).filter(([name]) => name.startsWith("MOBILE_"));
  assert.equal(mobile.length, 10);
  for (const [, cue] of mobile) {
    assert.equal(cue.controllerOnly, true); assert.equal(cue.group, "SFX");
    assert.ok(cue.volume <= 0.3); assert.ok(cue.maxDurationMs! >= 200 && cue.maxDurationMs! <= 1500);
  }
  assert.equal(AUDIO_CUES.TOKEN_MOVE.cooldownMs, 160);
});
