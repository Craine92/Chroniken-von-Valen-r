import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = "http://127.0.0.1:4174/visual-qa";
const step11 = process.env.VALENOR_QA_STEP11 === "1";
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === "page");
      if (page) return page;
    } catch { /* Browser is still starting. */ }
    await wait(100);
  }
  throw new Error("Edge debugging target was not ready.");
}

const port = 9442;
const profile = path.join(process.env.TEMP ?? "C:\\Windows\\Temp", `valenor-step10-cdp-${Date.now()}`);
const edge = spawn(edgePath, [
  "--headless=new", "--hide-scrollbars", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"
], { windowsHide: true, stdio: "ignore" });

const target = await waitForTarget(port);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let id = 0;
const pending = new Map();
const errors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params?.exceptionDetails?.text ?? "Runtime exception");
  if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") errors.push(message.params.entry.text);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  pending.set(requestId, { resolve, reject });
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
};
const capture = async (name) => {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const directory = path.resolve("qa", "screenshots", step11 ? "step11-widescreen" : "step10-tv-ui");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), Buffer.from(result.data, "base64"));
};

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  const report = {};
  const quick = process.env.VALENOR_QA_QUICK === "1";
  const resolutions = quick ? [[1920, 1080]] : [[1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]];
  const standardScenes = ["buildings", "tokens", "corner-tokens", "dice", "property-landing", "auction", "dungeon", "fate-card"];
  const fullStep11Scenes = [...standardScenes, "one", "purchase", "rent", "tax", "start", "movement-corner", "movement-multi", "movement-wrap"];
  const quickScenes = ["buildings", "tokens", "corner-tokens", "dice", "landing"];
  for (const [width, height] of resolutions) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    report[`${width}x${height}`] = {};
    const scenes = quick ? quickScenes : step11 && width === 1920 ? fullStep11Scenes : standardScenes;
    for (const scene of scenes) {
      await send("Page.navigate", { url: `${baseUrl}?scene=${scene}` });
      await wait(quick ? 5_600 : 5_400);
      report[`${width}x${height}`][scene] = await evaluate(`(() => {
        const rect = (selector) => { const value=document.querySelector(selector)?.getBoundingClientRect(); return value&&[value.x,value.y,value.width,value.height]; };
        return {
          viewport:[innerWidth,innerHeight], canvas:rect("canvas"), sidebar:rect(".game-sidebar"), rightRail:!!document.querySelector(".game-context-sidebar"),
          event:rect(".board-event-layer .dice-result,.board-event-layer .landed-card,.board-event-layer .economy-overlay,.board-event-layer .dungeon-status,.board-card-event .card-reveal"),
          overflowX:document.documentElement.scrollWidth>innerWidth+1, overflowY:document.documentElement.scrollHeight>innerHeight+1,
          boardReady:document.querySelector("canvas")?.dataset.boardReady, tileCount:document.querySelector("canvas")?.dataset.boardTileCount,
          boardWidth:document.querySelector("canvas")?.dataset.boardWidth, boardHeight:document.querySelector("canvas")?.dataset.boardHeight,
          boardAspect:document.querySelector("canvas")?.dataset.boardAspect, activeTweens:document.querySelector("canvas")?.dataset.activeTweens
        };
      })()`);
      if (width === 1920 || ["buildings", "tokens", "corner-tokens"].includes(scene)) await capture(`${step11 ? "step11" : "step10"}-${scene}-${width}x${height}.png`);
    }
  }
  if (step11 && !quick) {
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    report.mobile = {};
    for (const scene of ["controller-feedback", "controller-property"]) {
      await send("Page.navigate", { url: `${baseUrl}?scene=${scene}` });
      await wait(1_500);
      report.mobile[scene] = await evaluate(`(() => ({
        viewport:[innerWidth,innerHeight], overflowX:document.documentElement.scrollWidth>innerWidth+1,
        hasController:!!document.querySelector(".controller-page"), hasBoard:!!document.querySelector("canvas")
      }))()`);
      await capture(`step11-${scene}-390x844.png`);
    }
  }
  console.log(JSON.stringify({ report, consoleErrors: errors }, null, 2));
} finally {
  socket.close();
  edge.kill();
}
