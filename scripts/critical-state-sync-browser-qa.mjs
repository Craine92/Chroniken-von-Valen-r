import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = "http://127.0.0.1:5173/visual-qa";
const outputDirectory = path.resolve("qa", "screenshots", "critical-state-sync");
const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      const page = pages.find(entry => entry.type === "page");
      if (page) return page;
    } catch { /* Browser still starting. */ }
    await wait(100);
  }
  throw new Error("Edge debugging target was not ready.");
}

const port = 9452;
const profile = path.join(process.env.TEMP ?? "C:\\Windows\\Temp", `valenor-critical-sync-${Date.now()}`);
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
const consoleErrors = [];
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") consoleErrors.push(message.params?.exceptionDetails?.text ?? "Runtime exception");
  if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") consoleErrors.push(message.params.entry.text);
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
const evaluate = async expression => {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
};
const capture = async name => {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, name), Buffer.from(result.data, "base64"));
};

const scenes = ["mobile-trade-counter", "mobile-dungeon-payment", "mobile-runestone", "mobile-possessions-groups", "mobile-finance"];
const widths = [375, 390, 393, 430];
const results = {};

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  for (const width of widths) {
    results[width] = {};
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: true });
    for (const scene of scenes) {
      await send("Page.navigate", { url: `${baseUrl}?scene=${scene}` });
      await wait(800);
      results[width][scene] = await evaluate(`(() => {
        const rect = selector => { const value = document.querySelector(selector)?.getBoundingClientRect(); return value && { left:value.left, right:value.right, width:value.width }; };
        const text = document.body.textContent?.replace(/\\s+/g, " ").trim() ?? "";
        return {
          viewport: [innerWidth, innerHeight],
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          nav: rect(".controller-nav"), actionBar: rect(".controller-action-bar"), header: rect(".controller-player-bar"),
          hasIncomingTrade: text.includes("HANDELSANGEBOT VON JUSTINE"),
          hasDungeonPayment: text.includes("Drei Fluchtversuche gescheitert") && text.includes("Kerkergebühr"),
          hasRuneStoneDecision: text.includes("RUNENSTEIN") && text.includes("WURF BEHALTEN") && text.includes("NEU WÜRFELN"),
          relicsReady: text.includes("Goldene Feder") && text.includes("BEREIT") && !text.toLowerCase().includes("aktivieren"),
          hasMortgageState: text.includes("SOFORT BELEIHEN") && text.includes("Hypotheken")
        };
      })()`);
      await capture(`${scene}-${width}.png`);
    }
  }
  console.log(JSON.stringify({ results, consoleErrors }, null, 2));
} finally {
  socket.close();
  edge.kill();
}
