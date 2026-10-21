# Desktop-Version (Windows)

Chroniken von Valenør startet direkt im Vollbild. Der lokale HTTP-/Socket.IO-Spielserver ist integriert; Smartphones verbinden sich wie bisher über den QR-Code im selben WLAN.

## Windows-Dateien erzeugen

Auf Windows im Repository:

```powershell
npm install
npm run build
npm run dist:win
```

Die Ergebnisse liegen unter `release/`: Portable-EXE und Setup-EXE. Auf dem Ziel-PC ist kein Node.js nötig.

Alternativ im GitHub-Repository unter **Actions → Windows Desktop Builds → Run workflow** den Windows-Build starten. Die Dateien anschließend als Actions-Artefakt herunterladen.

## Hinweise

- Die Windows-Firewall muss eingehende lokale Verbindungen zum Spiel erlauben; TCP-Port 3001 wird genutzt.
- Alle Spieler-Smartphones müssen sich im gleichen WLAN wie der Spiel-PC befinden.
- `Alt+F4` beendet die Desktop-Anwendung.
- Das Paket ist bislang nicht codesigniert. Windows SmartScreen kann warnen.
- Ein gleichzeitiger anderer Dienst auf Port 3001 verhindert den Start.
- Die Electron-Paketierung sollte vor der Weitergabe auf einem Windows-Rechner einschließlich QR-Verbindung getestet werden.
