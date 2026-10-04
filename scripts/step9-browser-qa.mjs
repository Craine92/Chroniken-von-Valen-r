import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { io } from "socket.io-client";

const serverUrl = "http://127.0.0.1:3001";
const clientUrl = "http://127.0.0.1:5173";
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function connectSocket() {
  const socket = io(serverUrl, { transports: ["websocket"], forceNew: true });
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function emit(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    socket.emit(event, ...args, (result) => result?.ok ? resolve(result) : reject(new Error(result?.message ?? `${event} fehlgeschlagen`)));
  });
}

async function waitUntil(check, timeout = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await check();
    if (result) return result;
    await wait(150);
  }
  throw new Error("Browser-QA-Zeitlimit überschritten.");
}

async function launchBrowser(port, profileName) {
  const profile = path.join(process.env.TEMP ?? "C:\\Windows\\Temp", `${profileName}-${Date.now()}`);
  const child = spawn(edgePath, [
    "--headless=new", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, "--window-size=1440,1000", "about:blank"
  ], { windowsHide: true, stdio: "ignore" });
  const target = await waitUntil(async () => {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1_000) }).then((response) => response.json());
      return pages.find((page) => page.type === "page");
    } catch { return undefined; }
  });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params?.exceptionDetails?.text ?? "Runtime exception");
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") errors.push(message.params.entry.text);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve, reject });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  return { child, ws, send, errors };
}

async function evaluate(browser, expression) {
  const result = await browser.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function navigate(browser, url) {
  await browser.send("Page.navigate", { url });
  await wait(1_200);
}

async function capture(browser, filename) {
  const directory = path.resolve("qa", "screenshots");
  await mkdir(directory, { recursive: true });
  const result = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(directory, filename), Buffer.from(result.data, "base64"));
}

const sockets = [];
const browsers = [];
try {
  console.error("qa: sockets");
  const host = await connectSocket();
  const first = await connectSocket();
  const second = await connectSocket();
  sockets.push(host, first, second);
  const created = await emit(host, "room:create", {});
  const roomCode = created.room.code;
  const joinedFirst = await emit(first, "room:join", { roomCode, name: "Philipp" });
  const joinedSecond = await emit(second, "room:join", { roomCode, name: "Justine" });
  await emit(host, "room:addComputer");
  await emit(host, "room:updateConfig", { mode: "quick", quickGameDurationMinutes: 60 });
  let state;
  host.on("game:state", (next) => { state = next; });
  await emit(host, "game:start");

  const rolling = new Set();
  const orderDriver = setInterval(() => {
    if (state?.turnPhase !== "determiningOrder") return;
    for (const [socket, playerId] of [[first, joinedFirst.player.id], [second, joinedSecond.player.id]]) {
      const entry = state.orderRolls.find((roll) => roll.playerId === playerId);
      if (!state.orderContenders.includes(playerId) || (entry?.rolls.length ?? 0) >= state.orderRollTargetCount || rolling.has(playerId)) continue;
      rolling.add(playerId);
      emit(socket, "game:rollOrder").catch(() => {}).finally(() => rolling.delete(playerId));
    }
  }, 150);
  await waitUntil(() => state?.quickGameClock && state.turnPhase !== "determiningOrder" ? state : undefined, 20_000);
  clearInterval(orderDriver);
  console.error("qa: quick game running");

  const hostBrowser = await launchBrowser(9333, "valenor-step9-host");
  console.error("qa: host browser");
  const controllerBrowser = await launchBrowser(9334, "valenor-step9-controller");
  console.error("qa: controller browser");
  browsers.push(hostBrowser, controllerBrowser);
  await hostBrowser.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await controllerBrowser.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(hostBrowser, clientUrl);
  await capture(hostBrowser, "step10-lobby.png");
  await evaluate(hostBrowser, `localStorage.setItem("valenor:host-room",${JSON.stringify(roomCode)});localStorage.setItem("valenor:host-token",${JSON.stringify(created.hostToken)});true`);
  await hostBrowser.send("Page.reload", { ignoreCache: true });
  await wait(7_000);
  console.error("qa: host reconnected");

  await navigate(controllerBrowser, `${clientUrl}/controller?room=${roomCode}`);
  await evaluate(controllerBrowser, `localStorage.setItem("valenor:player-token:${roomCode}",${JSON.stringify(joinedFirst.playerToken)});localStorage.setItem("valenor:player-name:${roomCode}","Philipp");true`);
  await controllerBrowser.send("Page.reload", { ignoreCache: true });
  await waitUntil(() => evaluate(controllerBrowser, `(() => { const button=document.querySelector('form button[type="submit"]'); return !!button && !button.disabled; })()`));
  await evaluate(controllerBrowser, `(() => {
    const setValue=(selector,value)=>{const input=document.querySelector(selector);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};
    setValue('#room-code',${JSON.stringify(roomCode)});setValue('#player-name','Philipp');document.querySelector('form button[type="submit"]').click();return true;
  })()`);
  await waitUntil(() => evaluate(controllerBrowser, `!!document.querySelector('.controller-gold')`));
  console.error("qa: controller reconnected");

  const runningHost = await evaluate(hostBrowser, `({canvasCount:document.querySelectorAll("canvas").length,clock:document.querySelector(".quick-clock")?.textContent?.trim(),game:!!document.querySelector('[data-testid="valenor-game-view"]')})`);
  const runningController = await evaluate(controllerBrowser, `({clock:document.querySelector(".quick-clock")?.textContent?.trim(),gold:document.querySelector(".controller-gold")?.textContent?.trim()})`);
  await capture(hostBrowser, "step10-running-board.png");
  await capture(controllerBrowser, "step10-controller-turn.png");
  console.error("qa: running views inspected");

  await fetch(`${serverUrl}/api/dev/rooms/${roomCode}/expire-quick-clock`, { method: "POST" }).then((response) => {
    if (!response.ok) throw new Error("Ablaufsimulation fehlgeschlagen.");
  });
  await wait(1_000);
  const lastRound = await evaluate(hostBrowser, `document.querySelector(".last-round-banner")?.textContent?.trim()`);
  console.error("qa: last round inspected");
  await fetch(`${serverUrl}/api/dev/rooms/${roomCode}/complete-quick-final-round`, { method: "POST" }).then((response) => {
    if (!response.ok) throw new Error("Schlussrundensimulation fehlgeschlagen.");
  });
  await wait(1_500);
  const finishedHost = await evaluate(hostBrowser, `({canvasCount:document.querySelectorAll("canvas").length,result:document.querySelector(".game-result-panel")?.textContent?.replace(/\\s+/g," ").trim(),rows:document.querySelectorAll(".score-table > div").length})`);
  const finishedController = await evaluate(controllerBrowser, `({result:document.querySelector(".game-result-panel")?.textContent?.replace(/\\s+/g," ").trim(),own:document.querySelector(".own-result")?.textContent?.trim()})`);
  await capture(hostBrowser, "step10-quick-result.png");
  await capture(controllerBrowser, "step10-controller-result.png");
  console.error("qa: results inspected");
  await evaluate(hostBrowser, `document.querySelector('.game-result-panel button')?.click()`);
  const newChronicle = await waitUntil(() => evaluate(hostBrowser, `!document.querySelector('[data-testid="valenor-game-view"]') && document.body.textContent.includes('Abenteuer beginnen')`));

  const chronicleCreated = await emit(host, "room:create", {});
  const chronicleCode = chronicleCreated.room.code;
  const chronicleFirst = await emit(first, "room:join", { roomCode: chronicleCode, name: "Philipp" });
  const chronicleSecond = await emit(second, "room:join", { roomCode: chronicleCode, name: "Justine" });
  await emit(host, "room:addComputer");
  state = undefined;
  await emit(host, "game:start");
  const chronicleRolling = new Set();
  const chronicleOrderDriver = setInterval(() => {
    if (state?.turnPhase !== "determiningOrder") return;
    for (const [socket, playerId] of [[first, chronicleFirst.player.id], [second, chronicleSecond.player.id]]) {
      const entry = state.orderRolls.find((roll) => roll.playerId === playerId);
      if (!state.orderContenders.includes(playerId) || (entry?.rolls.length ?? 0) >= state.orderRollTargetCount || chronicleRolling.has(playerId)) continue;
      chronicleRolling.add(playerId);
      emit(socket, "game:rollOrder").catch(() => {}).finally(() => chronicleRolling.delete(playerId));
    }
  }, 150);
  await waitUntil(() => state?.turnPhase !== "determiningOrder" ? state : undefined, 20_000);
  clearInterval(chronicleOrderDriver);
  await evaluate(hostBrowser, `localStorage.setItem("valenor:host-room",${JSON.stringify(chronicleCode)});localStorage.setItem("valenor:host-token",${JSON.stringify(chronicleCreated.hostToken)});true`);
  await hostBrowser.send("Page.reload", { ignoreCache: true });
  await wait(7_000);
  const chroniclesHost = await evaluate(hostBrowser, `({canvasCount:document.querySelectorAll("canvas").length,hasClock:!!document.querySelector(".quick-clock"),game:!!document.querySelector('[data-testid="valenor-game-view"]')})`);

  const visualScenes = ["empty", "four", "buildings", "card", "dungeon", "auction"];
  const visualChecks = {};
  for (const scene of visualScenes) {
    await navigate(hostBrowser, `${clientUrl}/visual-qa?scene=${scene}`);
    await wait(5_200);
    visualChecks[scene] = await evaluate(hostBrowser, `({canvasCount:document.querySelectorAll("canvas").length,view:!!document.querySelector('[data-testid="valenor-game-view"]')})`);
    await capture(hostBrowser, `step10-${scene}.png`);
  }
  const responsiveChecks = {};
  for (const [width, height] of [[2560, 1440], [1920, 1080], [1366, 768], [1280, 800], [1280, 720]]) {
    await hostBrowser.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await wait(500);
    responsiveChecks[`${width}x${height}`] = await evaluate(hostBrowser, `(() => { const canvas=document.querySelector("canvas"); const rect=canvas?.getBoundingClientRect(); return {canvasCount:document.querySelectorAll("canvas").length,viewport:[innerWidth,innerHeight],canvas:[Math.round(rect?.width||0),Math.round(rect?.height||0)],horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1}; })()`);
  }
  await hostBrowser.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await navigate(hostBrowser, `${clientUrl}/visual-qa?scene=stress`);
  await wait(5_200);
  const performanceCheck = await evaluate(hostBrowser, `new Promise((resolve) => {
    const samples=[]; let frames=0; const started=performance.now();
    const sample=setInterval(()=>{const canvas=document.querySelector("canvas");samples.push({objects:Number(canvas?.dataset.activeDisplayObjects||0),tweens:Number(canvas?.dataset.activeTweens||0)});},750);
    const frame=(now)=>{frames+=1;if(now-started>=6000){clearInterval(sample);resolve({fps:Math.round(frames*1000/(now-started)),samples,canvasCount:document.querySelectorAll("canvas").length});}else requestAnimationFrame(frame);};
    requestAnimationFrame(frame);
  })`);
  await navigate(controllerBrowser, `${clientUrl}/visual-qa?scene=controller-property`);
  await wait(1_500);
  const controllerProperty = await evaluate(controllerBrowser, `({property:document.querySelector(".property-card")?.textContent?.replace(/\\s+/g," ").trim(),navItems:document.querySelectorAll(".controller-nav a").length})`);
  await capture(controllerBrowser, "step10-controller-property.png");
  await navigate(controllerBrowser, `${clientUrl}/visual-qa?scene=controller-turn`);
  await wait(1_500);
  const controllerTurn = await evaluate(controllerBrowser, `({action:document.querySelector(".turn-action-button")?.textContent?.trim(),navItems:document.querySelectorAll(".controller-nav a").length})`);
  await capture(controllerBrowser, "step10-controller-turn.png");
  const controllerResponsiveChecks = {};
  for (const width of [320, 375, 390, 430]) {
    await controllerBrowser.send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await wait(300);
    controllerResponsiveChecks[`${width}x844`] = await evaluate(controllerBrowser, `({viewport:[innerWidth,innerHeight],horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,navItems:document.querySelectorAll(".controller-nav a").length,actionVisible:document.querySelector(".turn-action-button")?.getBoundingClientRect().bottom<innerHeight})`);
  }

  console.log(JSON.stringify({ roomCode, participants: 3, runningHost, runningController, lastRound, finishedHost, finishedController, newChronicle, chroniclesHost, visualChecks, responsiveChecks, performanceCheck, controllerProperty, controllerTurn, controllerResponsiveChecks, consoleErrors: [...hostBrowser.errors, ...controllerBrowser.errors] }, null, 2));
} finally {
  for (const socket of sockets) socket.disconnect();
  for (const browser of browsers) { browser.ws.close(); browser.child.kill(); }
}
