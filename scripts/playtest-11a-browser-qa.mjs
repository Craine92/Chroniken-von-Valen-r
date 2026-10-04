import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = "http://127.0.0.1:4174/visual-qa";
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === "page");
      if (page) return page;
    } catch { /* Browser still starting. */ }
    await wait(100);
  }
  throw new Error("Edge debugging target was not ready.");
}

const port = 9441;
const profile = path.join(process.env.TEMP ?? "C:\\Windows\\Temp", `valenor-11a-cdp-${Date.now()}`);
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
const navigate = async (scene, waitMs) => {
  await send("Page.navigate", { url: `${baseUrl}?scene=${scene}` });
  await wait(waitMs);
};
const capture = async (name) => {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const directory = path.resolve("qa", "screenshots");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), Buffer.from(result.data, "base64"));
};

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  const desktop = {};
  for (const scene of ["tokens", "buildings", "fate-card", "result"]) {
    await navigate(scene, scene === "result" ? 1_500 : 5_500);
    desktop[scene] = await evaluate(`(() => {
      const canvas = document.querySelector("canvas")?.getBoundingClientRect();
      const rail = document.querySelector(".game-context-sidebar")?.getBoundingClientRect();
      const card = document.querySelector(".board-card-event .card-reveal")?.getBoundingClientRect();
      return { viewport:[innerWidth,innerHeight], canvas:canvas&&[canvas.x,canvas.y,canvas.width,canvas.height], rail:rail&&[rail.x,rail.width], card:card&&[card.x,card.y,card.width,card.height], overflow:document.documentElement.scrollWidth>innerWidth+1 };
    })()`);
    await capture(`playtest-11a-${scene}-1920.png`);
  }

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const mobile = {};
  for (const scene of ["controller-feedback", "controller-foreign"]) {
    await navigate(scene, 1_200);
    mobile[scene] = await evaluate(`(() => ({
      viewport:[innerWidth,innerHeight], overflow:document.documentElement.scrollWidth>innerWidth+1,
      turn:document.querySelector(".mobile-turn-notice")?.textContent?.replace(/\\s+/g," ").trim(),
      trade:document.querySelector(".mobile-trade-notice")?.textContent?.replace(/\\s+/g," ").trim(),
      decisions:[...document.querySelectorAll(".trade-card--received button")].map((button)=>button.textContent?.trim()),
      goldInputs:[...document.querySelectorAll('.trade-create input[type="number"]')].map((input)=>({value:input.value,placeholder:input.placeholder}))
    }))()`);
    await capture(`playtest-11a-${scene}-390.png`);
  }
  console.log(JSON.stringify({ desktop, mobile, consoleErrors: errors }, null, 2));
} finally {
  socket.close();
  edge.kill();
}
