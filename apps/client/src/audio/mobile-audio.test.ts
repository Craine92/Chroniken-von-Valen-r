import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { AudioManager } from "./AudioManager";
import { AUDIO_CUES, type AudioEvent } from "./audio-config";

function environment(t: TestContext, missing = false) {
  const originals = ["window", "document", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const starts: number[][] = [], requested: string[] = [], stored = new Map<string, string>();
  const gain = () => ({
    connect: (target: unknown) => target,
    gain: { value: 1, setTargetAtTime() {} }
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
    return new Response(missing ? null : new ArrayBuffer(8), { status: missing ? 404 : 200 });
  } });
  t.mock.method(console, "warn", () => undefined);
  t.after(() => originals.forEach(([key, descriptor]) => descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key)));
  return { starts, requested, stored };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("board music reuses one element and resumes its position across lifecycle pauses, toggles and mute",async(t)=>{
  environment(t);
  const previous=Object.getOwnPropertyDescriptor(globalThis,"Audio");
  const tracks: Array<{currentTime:number;paused:boolean;plays:number;loop:boolean}> = [];
  class Track {
    currentTime=0;paused=true;plays=0;loop=false;preload="";volume=1;
    constructor(_path:string){tracks.push(this);}
    addEventListener(){}
    play(){this.paused=false;this.plays++;return Promise.resolve();}
    pause(){this.paused=true;}
  }
  Object.defineProperty(globalThis,"Audio",{configurable:true,value:Track});
  Object.assign(window,{setInterval,clearInterval,setTimeout,clearTimeout});
  t.after(()=>previous?Object.defineProperty(globalThis,"Audio",previous):Reflect.deleteProperty(globalThis,"Audio"));
  const manager=new AudioManager();manager.setGameActive(true);await manager.unlock();await flush();
  assert.equal(tracks.length,1);const track=tracks[0]!;assert.equal(track.loop,true);
  track.currentTime=300;const plays=track.plays;manager.setGameActive(true);await flush();assert.equal(track.plays,plays);
  manager.setGameActive(false);assert.equal(track.currentTime,300);assert.equal(track.paused,true);
  manager.setGameActive(true);await flush();assert.equal(track.currentTime,300);assert.equal(tracks.length,1);
  manager.updateSettings({musicEnabled:false});assert.equal(track.paused,true);
  manager.updateSettings({musicEnabled:true});await flush();assert.equal(track.currentTime,300);
  manager.updateSettings({masterMuted:true});assert.equal(track.paused,true);
  manager.updateSettings({masterMuted:false});await flush();assert.equal(track.currentTime,300);
  manager.setOutputRole("controller");assert.equal(track.paused,true);manager.setGameActive(true);await flush();assert.equal(tracks.length,1);assert.equal(track.paused,true);
  manager.resetMusic();assert.equal(track.currentTime,0);manager.dispose();
});

test("controller role never requests or starts audio while TV cues remain available", async (t) => {
  const env = environment(t), manager = new AudioManager();
  manager.setOutputRole("controller");
  await manager.unlock();
  await flush();
  for (const event of Object.keys(AUDIO_CUES) as AudioEvent[]) manager.play(event);
  await flush();
  assert.deepEqual(env.requested, []);
  assert.deepEqual(env.starts, []);

  manager.updateSettings({ hapticsEnabled: false });
  assert.equal(JSON.parse([...env.stored.values()][0]!).hapticsEnabled, false);
  manager.setOutputRole("board");
  manager.play("DICE_ROLL");
  await flush();
  assert.equal(env.starts.length, 1);
});

test("six immediate movement steps are not deduplicated and stay silent on the controller", async (t) => {
  const env = environment(t), manager = new AudioManager();
  manager.setOutputRole("board");
  await manager.unlock();
  await flush();
  for (let step = 0; step < 6; step += 1) {
    manager.play("TOKEN_MOVE");
    await flush();
  }
  assert.equal(env.starts.length, 6);
  manager.setOutputRole("controller");
  for (let step = 0; step < 6; step += 1) {
    manager.play("TOKEN_MOVE");
    await flush();
  }
  assert.equal(env.starts.length, 6);
});

test("missing TV audio files resolve safely without starting a source", async (t) => {
  const env = environment(t, true), manager = new AudioManager();
  manager.setOutputRole("board");
  await manager.unlock();
  manager.play("UI_ERROR");
  await flush();
  await flush();
  assert.equal(env.starts.length, 0);
  assert.ok(env.requested.includes("/assets/audio/sfx/ui/error.ogg"));
});

test("audio manifest contains no mobile cue and assigns every sound to TV", () => {
  assert.equal(Object.keys(AUDIO_CUES).some((name) => name.startsWith("MOBILE_")), false);
  assert.ok(Object.values(AUDIO_CUES).every((cue) => cue.audience === "board"));
  assert.equal(AUDIO_CUES.TOKEN_MOVE.cooldownMs, 0);
});
