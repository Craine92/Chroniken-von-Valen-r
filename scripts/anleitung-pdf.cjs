// Erzeugt desktop/Anleitung.pdf aus der Seite /anleitung des gebauten Spiels (vorher: npm run build).
// Läuft mit Electron, das ohnehin für die Desktop-Version installiert ist:  npm run anleitung:pdf
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const PORT = "3091";
const OUTPUT = path.join(ROOT, "desktop", "Anleitung.pdf");

app.whenReady().then(async () => {
  process.env.NODE_ENV = "production";
  process.env.PORT = PORT;
  const server = await import(pathToFileURL(path.join(ROOT, "apps", "server", "dist", "index.js")).href);
  await server.serverReady;
  const page = new BrowserWindow({ show: false, width: 900, height: 1270, webPreferences: { sandbox: true } });
  await page.loadURL(`http://127.0.0.1:${PORT}/anleitung`);
  // Schriften und Layout fertig laden lassen.
  await page.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
  const pdf = await page.webContents.printToPDF({ pageSize: "A4", printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(OUTPUT, pdf);
  console.log(`Anleitung gespeichert: ${OUTPUT} (${Math.round(pdf.length / 1024)} KB)`);
  app.exit(0);
}).catch(error => {
  console.error(error);
  app.exit(1);
});
