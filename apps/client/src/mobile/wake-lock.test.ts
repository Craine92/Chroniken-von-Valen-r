import assert from "node:assert/strict";
import test from "node:test";
import { ScreenWakeLock, type VisibilitySource, type WakeLockApi } from "./wake-lock";

function fakes(rejects = false) {
  const log: string[] = [];
  let listener: (() => void) | undefined;
  const visibility: VisibilitySource & { visibilityState: DocumentVisibilityState } = {
    visibilityState: "visible",
    addEventListener: (_type, callback) => { listener = callback; },
    removeEventListener: () => { listener = undefined; }
  };
  const api: WakeLockApi = {
    request: async () => {
      if (rejects) throw new Error("NotAllowedError");
      log.push("request");
      const sentinel = { released: false, release: async () => { sentinel.released = true; log.push("release"); } };
      return sentinel;
    }
  };
  return { log, api, visibility, fire: () => listener?.() };
}

test("the screen stays awake while in the game and is released afterwards", async () => {
  const { log, api, visibility } = fakes();
  const lock = new ScreenWakeLock(api, visibility);
  await lock.setActive(true);
  assert.ok(lock.held);
  await lock.setActive(true);
  assert.deepEqual(log, ["request"], "no second request while held");
  await lock.setActive(false);
  assert.deepEqual(log, ["request", "release"]);
  assert.equal(lock.held, false);
});

test("returning to the page renews the lock the browser dropped in the background", async () => {
  const { log, api, visibility, fire } = fakes();
  const lock = new ScreenWakeLock(api, visibility);
  await lock.setActive(true);
  // Der Browser gibt die Sperre beim Wechsel in den Hintergrund selbst frei.
  await (lock as unknown as { sentinel: { release(): Promise<void> } }).sentinel.release();
  visibility.visibilityState = "hidden"; fire();
  visibility.visibilityState = "visible"; fire();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(log, ["request", "release", "request"]);
  lock.dispose();
});

test("without the API or with a refused request nothing breaks", async () => {
  const missing = new ScreenWakeLock(undefined, undefined);
  await assert.doesNotReject(missing.setActive(true));
  assert.equal(missing.supported, false);
  const { api, visibility } = fakes(true);
  const refused = new ScreenWakeLock(api, visibility);
  await assert.doesNotReject(refused.setActive(true));
  assert.equal(refused.held, false);
});
