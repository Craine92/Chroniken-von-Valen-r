import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = 9444;
const sceneName = process.argv[2] ?? "four";
const blockedAsset = process.argv[3];
const profile = path.join(process.env.TEMP ?? "C:\\Windows\\Temp", `valenor-assets-${Date.now()}`);
const browser = spawn(edgePath, [
  "--headless=new", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`, "--window-size=1920,1080", "about:blank"
], { windowsHide: true, stdio: "ignore" });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  let target;
  for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      target = targets.find((entry) => entry.type === "page");
    } catch { await wait(100); }
  }
  if (!target) throw new Error("Headless Edge did not expose a page target.");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  const assetFailures = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") consoleErrors.push(message.params?.exceptionDetails?.text ?? "Runtime exception");
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") consoleErrors.push(message.params.entry.text);
    if (message.method === "Network.loadingFailed" && message.params?.type === "Image") assetFailures.push(message.params.errorText ?? "Image request failed");
    if (message.method === "Network.responseReceived" && message.params?.type === "Image" && message.params.response.status >= 400) {
      assetFailures.push(`${message.params.response.status} ${message.params.response.url}`);
    }
    if (!message.id || !pending.has(message.id)) return;
    const callback = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve, reject });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  if (blockedAsset) await send("Network.setBlockedURLs", { urls: [`*${blockedAsset}*`] });
  await send("Page.navigate", { url: `http://127.0.0.1:5173/visual-qa?scene=${encodeURIComponent(sceneName)}` });
  await wait(7_000);
  const evaluation = await send("Runtime.evaluate", {
    expression: `(() => { const canvas=document.querySelector("canvas"); return {
      canvasCount: document.querySelectorAll("canvas").length,
      gameView: Boolean(document.querySelector('[data-testid="valenor-game-view"]')),
      loadingVisible: Boolean(document.querySelector('.asset-loading')),
      activeDisplayObjects: Number(canvas?.dataset.activeDisplayObjects || 0),
      missingAssetRequests: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/assets/') && entry.transferSize === 0).length
    }; })()`,
    returnByValue: true
  });
  const performanceEvaluation = await send("Runtime.evaluate", {
    expression: `new Promise((resolve) => {
      let frames=0; const started=performance.now();
      const frame=(now)=>{frames+=1;if(now-started>=3000)resolve(Math.round(frames*1000/(now-started)));else requestAnimationFrame(frame);};
      requestAnimationFrame(frame);
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const screenshotDirectory = path.resolve("qa", "screenshots");
  await mkdir(screenshotDirectory, { recursive: true });
  const screenshotSuffix = blockedAsset ? `${sceneName}-fallback` : sceneName;
  await writeFile(path.join(screenshotDirectory, `step10b-${screenshotSuffix}.png`), Buffer.from(screenshot.data, "base64"));
  const responsiveChecks = {};
  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await wait(300);
    const check = await send("Runtime.evaluate", {
      expression: `(() => { const canvas=document.querySelector("canvas"); const rect=canvas?.getBoundingClientRect(); return {
        viewport:[innerWidth,innerHeight], canvas:[Math.round(rect?.width||0),Math.round(rect?.height||0)],
        horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1
      }; })()`,
      returnByValue: true
    });
    responsiveChecks[`${width}x${height}`] = check.result.value;
  }
  console.log(JSON.stringify({ sceneName, blockedAsset, ...evaluation.result.value, fps: performanceEvaluation.result?.value, responsiveChecks, assetFailures, consoleErrors }, null, 2));
  socket.close();
} finally {
  browser.kill();
}
