const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const http = require("node:http");
const { pathToFileURL } = require("node:url");

function awaitServer(tries = 60) {
  return new Promise((resolve, reject) => {
    const check = (remaining) => {
      const request = http.get("http://127.0.0.1:3001/host", (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else retry();
      });
      const retry = () => remaining > 0
        ? setTimeout(() => check(remaining - 1), 300)
        : reject(new Error("Der Spielserver ist nicht erreichbar."));
      request.on("error", retry);
      request.setTimeout(1000, () => request.destroy());
    };
    check(tries);
  });
}

app.whenReady().then(async () => {
  process.env.NODE_ENV = "production";
  process.env.PORT = "3001";
  const entry = path.join(app.getAppPath(), "apps", "server", "dist", "index.js");
  await import(pathToFileURL(entry).href);
  await awaitServer();
  const win = new BrowserWindow({
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#080912",
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://127.0.0.1:3001/")) event.preventDefault();
  });
  await win.loadURL("http://127.0.0.1:3001/host");
}).catch((error) => {
  dialog.showErrorBox("Valenør", String(error));
  app.quit();
});
app.on("window-all-closed", () => app.quit());
