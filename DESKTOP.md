# Desktop-Version (Windows)

Chroniken von Valenør läuft als Windows-Programm im Vollbild. Der Spielserver steckt im Programm; Handys verbinden sich über den QR-Code im selben WLAN. Es wird nichts aus dem Internet geladen, und es gibt keine Datenbank.

## Was Freunde bekommen

| Datei | Wofür |
| --- | --- |
| `Chroniken-von-Valenor-Setup-<Version>.exe` | Installations-Assistent: Installationsordner wählbar, Verknüpfung auf dem Desktop und im Startmenü, Deinstallation über Windows → Einstellungen → Apps. Legt eine Firewall-Regel für **private** Netzwerke an, damit Handys beitreten können (und entfernt sie bei der Deinstallation). Fragt dafür einmal nach Administratorrechten. |
| `Chroniken-von-Valenor-Portable-<Version>.exe` | Ohne Installation, z. B. vom USB-Stick. Windows fragt beim ersten Start nach der Firewall: „Private Netzwerke“ erlauben. |
| `Anleitung.pdf` | Kurze Anleitung für Freunde: installieren, Windows-Warnung, Firewall, WLAN, QR-Code, Netzteil. Dieselbe Anleitung steckt im Spiel (Lobby → „Anleitung“) und liegt nach der Installation im Programmordner. |

## Eine neue Version bauen

1. **Versionsnummer erhöhen**, z. B. von 0.1.0 auf 0.2.0. Sie steht in der `package.json` im Hauptordner (`"version"`) und erscheint im Dateinamen, im Assistenten und unter Windows → Apps.
2. **Auf dem eigenen PC bauen** (Windows):

   ```powershell
   npm install
   npm run build
   npm run dist:win
   ```

   `dist:win` erzeugt zuerst `desktop/Anleitung.pdf` neu und dann die beiden EXE-Dateien unter `release/`. Das dauert etwa 5 Minuten. Auf dem Ziel-PC ist kein Node.js nötig.
3. **Oder auf GitHub bauen:** *Actions → Windows Desktop Builds → Run workflow*. Der Workflow prüft typecheck und Tests, baut, kontrolliert das Paket und stellt Setup-EXE, Portable-EXE und `Anleitung.pdf` als Artefakt „Valenor-Windows“ bereit. Er startet auch automatisch, wenn ein Tag wie `v0.2.0` hochgeladen wird:

   ```powershell
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. **Weitergeben:** Setup-EXE (oder Portable-EXE) und `Anleitung.pdf` an Freunde schicken.

## Was die Desktop-Version tut

- **Port:** Sie nutzt Port 3001. Ist er von einem anderen Programm belegt, weicht sie auf 3002 bis 3010 aus; der QR-Code zeigt dann automatisch den richtigen Port.
- **Nur einmal starten:** Ein zweiter Start holt das offene Fenster nach vorn.
- **Freundliche Hinweise statt Absturz:**
  - „Kein WLAN gefunden“, wenn der Laptop mit keinem Netzwerk verbunden ist.
  - Eine Erklärung mit Tipp, wenn der Server nicht starten kann.
  - Neu laden, falls die Anzeige abstürzt.
- **Offline:** Das Spiel lädt nur vom eigenen Spielserver; alles andere wird blockiert.
- **Tasten:** F11 wechselt zwischen Vollbild und Fenster, Alt+F4 beendet das Spiel.
- **Protokoll für die Fehlersuche:** `%APPDATA%\Chroniken von Valenør\logs\valenor.log`.

## Werkzeuge

- `scripts/desktop-icon.py` zeichnet das Programm-Symbol (Valenør-Siegel) nach `desktop/build/icon.ico` und `icon.png` (benötigt Python mit Pillow).
- `scripts/anleitung-pdf.cjs` druckt die Seite `/anleitung` des gebauten Spiels als `desktop/Anleitung.pdf` (`npm run anleitung:pdf`, nach `npm run build`).
- `desktop/build/installer.nsh` enthält die Firewall-Regel des Installations-Assistenten.

## Hinweise

- Das Paket ist nicht codesigniert (ein Zertifikat kostet Geld); deshalb warnt Windows SmartScreen beim ersten Start. Die Anleitung erklärt „Weitere Informationen → Trotzdem ausführen“.
- Ist das WLAN in Windows als „Öffentliches Netzwerk“ eingestellt, greift die Firewall-Regel für private Netzwerke nicht. Dann in den WLAN-Einstellungen auf „Privates Netzwerk“ umstellen.
- Vor der Weitergabe einer neuen Version einmal auf einem Windows-PC mit einem Handy im selben WLAN testen.
