// Desktop-Version von Chroniken von Valenør: startet den Spielserver im selben Prozess und zeigt den TV im Vollbild.
// Handys verbinden sich über den QR-Code im selben WLAN. Alles läuft ohne Internet.
const { app, BrowserWindow, dialog, session, shell } = require("electron");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_ID = "de.valenor.chroniken";
const TITLE = "Chroniken von Valenør";
// Name für Fenster, Meldungen und den Datenordner: %APPDATA%/Chroniken von Valenør, dort liegt logs/valenor.log.
app.setName(TITLE);
/** Bevorzugter Port; ist er von einem anderen Programm belegt, weicht das Spiel auf die nächsten aus. */
const PORTS = [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010];

let mainWindow;
let logFile;

/** Alles, was der Server meldet, landet auch in einer Datei – hilfreich, wenn ein Freund ein Problem hat. */
function startLog() {
  const folder = app.getPath("logs");
  fs.mkdirSync(folder, { recursive: true });
  logFile = path.join(folder, "valenor.log");
  fs.writeFileSync(logFile, `${TITLE} ${app.getVersion()} – gestartet ${new Date().toLocaleString("de-DE")}\n`);
  for (const level of ["log", "warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...parts) => {
      original(...parts);
      try { fs.appendFileSync(logFile, `${level === "log" ? "" : `[${level}] `}${parts.map(String).join(" ")}\n`); } catch { /* Protokoll ist nur Hilfe. */ }
    };
  }
}

/** Freundliches Fenster mit Tipp; bei schweren Fehlern lässt sich das Protokoll öffnen. */
async function tellUser({ title, message, tip, fatal = false }) {
  const buttons = fatal ? ["Beenden", "Protokoll öffnen"] : ["Verstanden"];
  const { response } = await dialog.showMessageBox(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, {
    type: fatal ? "error" : "warning", title: TITLE, message: title, detail: tip ? `${message}\n\nTipp: ${tip}` : message, buttons, noLink: true
  });
  if (fatal && response === 1 && logFile) await shell.openPath(logFile);
}

function isPortFree(port) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "0.0.0.0");
  });
}

async function choosePort() {
  for (const port of PORTS) if (await isPortFree(port)) return port;
  return undefined;
}

/** Nur der eigene Spielserver ist erlaubt; das Spiel lädt nie etwas aus dem Internet. */
function allowOnlyLocal(port) {
  const origin = `http://127.0.0.1:${port}/`;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const local = details.url.startsWith(origin) || details.url.startsWith(`ws://127.0.0.1:${port}/`) || /^(data|blob|devtools|chrome-extension):/.test(details.url);
    if (!local) console.warn(`Blockiert (kein Internet nötig): ${details.url}`);
    callback({ cancel: !local });
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === "fullscreen" || permission === "wake-lock"));
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    title: TITLE,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#080912",
    icon: path.join(__dirname, "build", "icon.png"),
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  const origin = `http://127.0.0.1:${port}/`;
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => { if (!url.startsWith(origin)) event.preventDefault(); });
  // F11: Vollbild an/aus (z. B. um kurz an ein anderes Fenster zu kommen). Alt+F4 beendet wie gewohnt.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") { mainWindow.setFullScreen(!mainWindow.isFullScreen()); event.preventDefault(); }
  });
  mainWindow.webContents.on("render-process-gone", async (_event, details) => {
    if (details.reason === "clean-exit") return;
    console.error(`Anzeige abgestürzt: ${details.reason}`);
    await tellUser({ title: "Die Anzeige wurde neu geladen.", message: "Die Spielanzeige ist unerwartet stehen geblieben. Der Spielstand bleibt erhalten, die Handys verbinden sich von selbst neu.", tip: "Passiert das öfter, den Laptop ans Netzteil anschließen und andere Programme schließen." });
    if (!mainWindow.isDestroyed()) mainWindow.reload();
  });
  mainWindow.webContents.on("unresponsive", () => console.warn("Anzeige reagiert gerade nicht."));
  return mainWindow.loadURL(`${origin}host`);
}

async function start() {
  startLog();
  app.setAppUserModelId(APP_ID);
  const port = await choosePort();
  if (!port) {
    await tellUser({ fatal: true, title: "Valenør kann nicht starten.", message: `Die Ports ${PORTS[0]} bis ${PORTS.at(-1)} sind alle belegt.`, tip: "Den PC neu starten und Valenør danach als Erstes öffnen." });
    return app.quit();
  }
  if (port !== PORTS[0]) console.warn(`Port ${PORTS[0]} ist belegt, das Spiel nutzt Port ${port}.`);
  process.env.NODE_ENV = "production";
  process.env.PORT = String(port);
  const server = await import(pathToFileURL(path.join(app.getAppPath(), "apps", "server", "dist", "index.js")).href);
  try {
    await server.serverReady;
  } catch (error) {
    await tellUser({ fatal: true, title: "Der Spielserver konnte nicht starten.", message: String(error.message ?? error), tip: "Valenør schließen und neu öffnen. Hilft das nicht, den PC neu starten." });
    return app.quit();
  }
  allowOnlyLocal(port);
  await createWindow(port);
  const network = server.getNetworkStatus();
  if (!network.reachableByPhones) {
    await tellUser({ title: "Kein WLAN gefunden.", message: "Der Laptop ist mit keinem Netzwerk verbunden. Das Spiel läuft, aber die Handys können noch nicht beitreten.", tip: "Den Laptop mit dem WLAN verbinden, in dem auch die Handys sind, und Valenør danach neu starten." });
  }
}

// Ein zweiter Start holt das offene Fenster nach vorn, statt am belegten Port zu scheitern.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(start).catch(async error => {
    console.error(error?.stack ?? String(error));
    await tellUser({ fatal: true, title: "Valenør ist auf einen Fehler gestoßen.", message: String(error?.message ?? error), tip: "Valenør neu starten. Bleibt der Fehler, das Protokoll an die Person schicken, von der du das Spiel hast." });
    app.quit();
  });
  process.on("uncaughtException", error => console.error(`Unerwarteter Fehler: ${error?.stack ?? error}`));
  app.on("window-all-closed", () => app.quit());
}
