# Chroniken von Valenør

Ein lokales Fantasy-Brettspiel in Entwicklung: Der Laptop zeigt Lobby und Spielbrett auf dem Fernseher, während menschliche Spieler per Smartphone beitreten. Insgesamt nehmen zwei bis vier Menschen und Computer in beliebiger Kombination teil.

## Voraussetzungen

- Windows, macOS oder Linux
- Node.js 20 oder neuer
- npm 10 oder neuer
- Laptop und Smartphones im selben WLAN

## Installation

Im Projektordner einmalig ausführen:

```bash
npm install
```

## Projekt starten

```bash
npm run dev
```

Der Befehl startet beide benötigten Dienste:

- Weboberfläche: Port `5173`
- Spielserver und Socket.IO: Port `3001`

## Host auf dem Laptop öffnen

Im Browser des Laptops öffnen:

```text
http://localhost:5173/host
```

Der Spielraum wird automatisch erstellt. Für den Fernseher den Browser per HDMI übertragen und bei Bedarf mit `F11` in den Vollbildmodus wechseln.

## Smartphone verbinden

1. Laptop und Smartphone müssen im selben WLAN sein.
2. Auf dem Fernseher den QR-Code scannen.
3. Den bereits eingetragenen Raumcode prüfen, einen Namen eingeben und **Valenør betreten** wählen.
4. Alternativ auf dem Smartphone `http://<IP-DES-LAPTOPS>:5173/controller` öffnen und den Raumcode manuell eingeben.

Die TV-Lobby aktualisiert sich sofort. Mit **Magisches Signal senden** lässt sich vor Spielbeginn die vollständige Verbindung vom Smartphone über den Server zum Fernseher testen. Nach dem Start steuert der aktive Mensch Startwurf, Würfelwurf und Zugende über das Smartphone.

## Einzelspieler und Computergegner

Mindestens ein menschlicher Spieler tritt per Smartphone bei. Der Host kann freie Plätze anschließend mit **Computer hinzufügen** füllen und Computer vor Spielbeginn wieder entfernen.

- Zwei bis vier Teilnehmer insgesamt
- Mindestens ein verbundener Mensch
- Ein bis drei serverseitig verwaltete Computer möglich
- Automatische eindeutige Namen und Farben
- Computer besitzen keine Socket-Verbindung und treffen noch keine Spielentscheidungen

## Spielmodi

In der TV-Lobby stehen zwei Konfigurationen bereit:

- **Chroniken-Modus:** vollständige Variante ohne Zeitlimit
- **Schnelles Abenteuer:** konfigurierbar auf 60, 75 oder 90 Minuten; Standard sind 75 Minuten

Die Auswahl wird serverseitig im Spielraum gespeichert. Im schnellen Abenteuer beginnt die Uhr erst, wenn die Startreihenfolge vollständig feststeht und Runde 1 zum ersten Wurf bereit ist.

## Schnelles Abenteuer und Endwertung

- Die 60-, 75- oder 90-Minuten-Uhr wird serverseitig aus Zeitstempeln berechnet; TV und Smartphones interpolieren die Anzeige lokal, ohne sekündliche GameState-Nachrichten.
- Trennt sich ein aktiver Mensch, pausiert die Uhr technisch bis zur Wiederverbindung. Ein Host-Refresh pausiert sie nicht.
- Bei Ablauf wird die aktuelle Runde einschließlich Extra-Zügen, Auktionen, Karten, Zahlungen und Kerkerauflösungen vollständig beendet. Eine neue Runde beginnt danach nicht mehr.
- Die Endwertung zählt Gold, Kaufpreise aller Besitztümer und volle Baukosten. Bei Hypotheken wird der Auslösebetrag als Schuld abgezogen; gehaltene Karten sind nur Statistik.
- Gleichstände werden über Gesamtvermögen, Gold, Nettobesitz und Bauwert gebrochen. Bleiben alle Werte gleich, zeigt das Spiel einen gemeinsamen Sieg.
- `LastPlayerStanding` beendet auch ein schnelles Abenteuer sofort und hat Vorrang vor der Zeitwertung.
- Die fertige Partie enthält einen unveränderlichen `GameResult` mit Grund, Gewinnern, Rundenzahl und gegebenenfalls vollständigem Score-Snapshot. Eine neue Chronik entfernt Uhr, Ergebnis und Endwerte gemeinsam mit dem alten GameState.

## Aktueller Stand des Spielbretts

Nach **Abenteuer beginnen** erscheint nach einer kurzen Übergangssequenz das Phaser-Spielbrett:

- Dunkler Holztisch, mehrlagiger Holz-/Steinrahmen und goldene Intarsien als physische Brettinszenierung
- 40 datengetriebene, aus TV-Blickrichtung aufrecht lesbare Felder mit vier großen Eckfeldern
- 22 Grundstücke in acht Gruppen
- Vier visuell klar getrennte Miniaturreiche: Elbenwald, Menschenland, Orkgebirge und Sonnensteppe
- Prozedural illustrierte Sonderfelder, physische Abenteuer-/Schicksalsstapel und ein zentrales Valenør-Siegel
- Vier eigenständige Fantasy-Miniaturen mit Sockeln, Runen, Schatten und aktiver Goldmarkierung
- Kulturell unterschiedliche Siedlungen, Türme und Großbauten direkt auf den Besitzfeldern
- Bogenförmige Figurenbewegung mit farbiger Spur, Landeeffekt sowie Knochenwürfel mit Runenbecher
- TV-HUD mit Gefährtenporträts, Status, Gold, Besitz und Schnellspiel-Sanduhr

Der sichtbare Zwischenstand besteht derzeit aus Phaser-Primitiven, SVG-/CSS-Formen und Text und dient künftig als belastbarer Fallback. Die finale Art Direction ist ausdrücklich ein asset-basiertes, gerendertes Fantasy-Brettspiel; noch wurden keine externen Art Assets eingebunden.

## Präsentationsarchitektur

- React besitzt Lobby, HUD, Karten, Ergebnisdarstellung und Smartphone-Controller; Phaser zeichnet ausschließlich das physische Brett und seine Miniaturen.
- Die langlebige `ValenorBoardScene` erhält weiterhin nur autoritative Zustände über die vorhandene `GameSceneBridge`. Weder UI-Updates noch Animationen erzeugen eine zweite `Phaser.Game`-Instanz oder ein zweites Canvas.
- `ValenorPreloadScene` lädt erst beim Spielstart ausschließlich Manifest-Einträge mit Status `ready`; die Lobby lädt keine Boardtexturen. Die React-Ladeanzeige zeigt dabei „Valenør erwacht …“ und den Phaser-Fortschritt.
- `asset-manifest.ts` enthält alle lokalen Bild- und Atlaspfade, Zielgrößen, Cache-Keys und Fallbackangaben. `BoardArtLayer` trennt Tisch, Rahmen, Regionshintergründe, Dekorationen und Atlasanimationen von der eigentlichen Board-Scene.
- Regionsdekorationen liegen in `realm-decoration-config.ts` mit Asset, Realm, Position, Skalierung, Rotation und Tiefe. Gebäude, Sonderfelder und vier Charakterminiaturen besitzen ebenfalls zentrale Austausch-Slots.
- Die lokale Struktur unter `apps/client/public/assets` trennt Brett, Umgebungen, Gebäude, Figuren, Karten, UI und Effekte. WebP ist für große Flächen vorgesehen, PNG/WebP-Alpha für Einzelobjekte und WebP+JSON-Atlanten für Animationen.
- Fehlende, nicht freigegebene oder technisch fehlerhafte Assets lösen keine Regeländerung aus: Der entsprechende prozedurale Layer bleibt sichtbar. Ein Slot wird erst nach lokaler Ablage und Lizenzdokumentation in `ATTRIBUTIONS.md` auf `ready` gesetzt.
- Designfarben, Abstände, Radien und Schatten liegen als zentrale CSS-Tokens in `apps/client/src/styles/global.css`. Phaser-Farben und Qualitätsstufen sind in der Scene beziehungsweise `visual-config.ts` gebündelt.
- Die Typografie nutzt ausschließlich lokal verfügbare Systemschriften (`Georgia`, `Arial` und generische Fallbacks); es werden keine Webfonts nachgeladen. Primäres TV-Ziel ist 1920×1080, geprüft werden außerdem 2560×1440, 1366×768 und 1280×720/800.
- `prefers-reduced-motion` reduziert sowohl CSS- als auch Phaser-Bewegungen. Die Qualitätsstufen `high`, `medium` und `low` begrenzen Partikel, Detaildichte und Glow, ohne Regeln oder GameState zu verändern.
- `/visual-qa` ist nur im Vite-Entwicklungsmodus erreichbar und stellt reproduzierbare Ansichten für leeres Brett, vier Figuren, Bauwerke, Karte, Kerker und Auktion bereit. Sie verändert keine Räume und ist im Produktionsmodus nicht verfügbar.

## Zug- und Würfelsystem

Nach der Intro-Sequenz bestimmen alle Teilnehmer ihre Reihenfolge mit zwei serverseitigen W6. Der höchste Gesamtwert beginnt; bei Gleichständen würfeln nur die betroffenen Teilnehmer erneut, beliebig oft bis zur eindeutigen Reihenfolge.

- Menschen führen Startwurf, regulären Wurf und Zugende auf dem Smartphone aus.
- Computer würfeln und beenden ihre Züge nach kurzen serverseitigen Verzögerungen automatisch.
- Würfelergebnisse entstehen ausschließlich über eine kryptografische Zufallsquelle auf dem Server.
- Die Zufallsquelle ist für Tests durch feste Würfelfolgen austauschbar.
- Figuren bewegen sich Feld für Feld und ordnen sich bei gemeinsamen Positionen automatisch als Formation an.
- Das Landefeld wird aus der zentralen Boardkonfiguration erkannt und auf Fernseher und Smartphone angezeigt.
- Beim Überschreiten des Runentors wird `passedStart` gesetzt, aber noch kein Gold vergeben.
- Runden-, Zug- und Phasenwechsel werden ausschließlich vom Server verwaltet.

Ein erkannter Pasch wird bereits als `isDouble` gespeichert. Sonderzüge, Kerkerregeln und wirtschaftliche Auswirkungen sind noch nicht aktiv.

## Wirtschaft, Besitz und Auktionen

Der aktuelle Stand enthÃ¤lt die erste vollstÃ¤ndige Wirtschaftsrunde:

- GrundstÃ¼cke, HÃ¤fen und Versorgungsfelder kÃ¶nnen auf dem Smartphone gekauft oder zur offenen Auktion freigegeben werden.
- Gebote erfolgen in Schritten von 10, 50 oder 100 Gold. Alle solventen Teilnehmer dÃ¼rfen mitbieten; Computer nutzen eine einfache, zentral gekapselte Kauf- und Gebotsstrategie.
- GrundstÃ¼cke berechnen ihre Grundmiete, HÃ¤fen 25/50/100/200 Gold und Versorgungsfelder das Vier- oder Zehnfache des letzten WÃ¼rfelwerts.
- Das Passieren des Runentors vergibt einmalig 200 Gold. Kronenzoll kostet 200, Drachenzehnt 100 Gold.
- Reicht das VermÃ¶gen fÃ¼r eine Pflichtzahlung nicht, pausiert der Zug in `paymentRequired`; Guthaben werden niemals negativ.
- Besitzmarker erscheinen auf dem TV-Spielbrett. Das Smartphone zeigt Kaufkarten, Auktionssteuerung und dauerhaft **Mein Besitz**.
- Auktionen pausieren bei einer unterbrochenen menschlichen Verbindung und werden nach der Wiederverbindung fortgesetzt.

Noch nicht enthalten sind Gefängnis-, Karten- und Pasch-Sonderregeln.

## Regionen, Bauwerke und Festungen

- Alle acht Grundstücksgruppen werden aus der zentralen Boardkonfiguration erkannt. Nur der vollständige Besitz einer Region erlaubt den Ausbau.
- Baukosten und die sechs Mietstufen aller 22 Grundstücke liegen typsicher in `packages/shared/src/board.ts`; `calculatePropertyRent` behandelt Vollgruppen und Baustufen zentral.
- Bauwerke werden innerhalb einer Region gleichmäßig gebaut und rückwärts gleichmäßig verkauft. Der Server validiert jede Smartphone-Aktion erneut und verändert Gold, Stufe und Bankreserve atomar.
- Die Bank startet mit 32 Siedlungseinheiten und 12 Großbauten. Der Schritt von Stufe 4 auf 5 tauscht vier Einheiten gegen eine Festung; beim Rückbau gilt der umgekehrte Tausch.
- **Mein Besitz** zeigt vollständige Regionen, Baustufen, Mietstaffeln, nächste Stufe, Baukosten, Bankbestand und verständliche Sperrgründe.
- Ein eigener `PropertyDevelopmentLayer` zeichnet kulturell unterschiedliche Miniatursiedlungen und Festungen direkt auf dem Phaser-Brett. State-Updates laufen weiter ausschließlich über die bestehende `GameSceneBridge`.
- Computer bauen mit einer zentralen Goldreserve und höchstens zwei Aktionen je stabiler Verwaltungsphase. Bei `paymentRequired` verkaufen sie nötigenfalls regelkonform; Menschen verkaufen bewusst und bestätigen anschließend die Forderung.

## Hypotheken, Handel und Bankrott

- Besitz kann in sicheren Verwaltungsphasen zum halben Kaufpreis beliehen und fuer 110 Prozent dieses Werts wieder ausgeloest werden. Die Bank rundet dabei immer auf volle Goldstuecke auf.
- Auf beliehenem Besitz wird keine Miete faellig. Bereits eine Hypothek deaktiviert den Vollgruppenbonus und sperrt den Ausbau der gesamten Region, bis alle Hypotheken dort ausgeloest sind.
- Menschliche Mitspieler koennen Gold und unbebaute Besitztuemer direkt tauschen. Angebote besitzen serverseitig erzeugte IDs, werden bei Annahme vollstaendig neu validiert und danach atomar ausgefuehrt. Hypotheken bleiben bei einer Uebertragung bestehen.
- Bei `paymentRequired` koennen Menschen Bauwerke verkaufen, Besitz beleihen, die Forderung begleichen oder Bankrott erklaeren. Computer verwenden dafuer lediglich einen technischen Fallback in derselben Reihenfolge; eine weitergehende strategische KI wurde nicht eingefuehrt.
- Bei Bankrott gegen einen Spieler werden Bauwerke zuerst zum Rueckkaufswert liquidiert; anschliessend gehen restliches Gold und Besitz samt Hypotheken an den Glaeubiger.
- Bei Bankrott gegen die Bank wird der Besitz lastenfrei und in aufsteigender Feldreihenfolge nacheinander versteigert. Bankrotte Teilnehmer werden bei allen weiteren Zuegen uebersprungen und sehen die Partie als Zuschauer.
- Sobald nur noch ein aktiver Teilnehmer uebrig ist, beendet der Server die Partie und setzt den Gewinner. Der Host kann danach eine neue Chronik mit denselben Raumteilnehmern starten.

Alle Finanz-, Handels-, Zahlungs- und Bankrottentscheidungen werden autoritativ auf dem Server geprueft. Client-Aktionen sind nur Anfragen und koennen keine Preise, Gebote, Eigentumswechsel oder Zahlungsbetraege vorgeben.

## Pasch, Extra-Zuege und Dunkler Kerker

- Normale Pasche werden innerhalb einer Spieler-Zugsequenz serverseitig gezaehlt. Nach vollstaendiger Aufloesung des Landefeldes darf derselbe Spieler erneut wuerfeln, ohne Runde, Zugindex oder Zugnummer zu erhoehen.
- Beim dritten Pasch erfolgt keine normale Bewegung. Die Figur wird mit einer eigenen Kerkertransfer-Bewegung direkt auf Feld 10 versetzt; Runentor-Gold und der hypothetische Landefeldeffekt entfallen.
- Feld 10 unterscheidet zwischen eingesperrten Spielern und normalen Besuchern. Nur ein regelbedingter Transfer setzt den strukturierten Kerkerstatus mit der Zahl fehlgeschlagener Fluchtversuche.
- Zu Beginn eines Kerkerzuges kann ein Mensch einen Pasch versuchen oder sich fuer zentral konfigurierte 50 Gold freikaufen. Computer verwenden ohne Strategie immer den festen Paschversuch-Fallback.
- Ein Kerker-Pasch befreit und bewegt mit demselben Wurf, erzeugt aber keinen Extra-Zug. Nach dem dritten Fehlversuch werden 50 Gold verpflichtend faellig und danach wird ebenfalls mit dem bereits gespeicherten Wurf gezogen.
- Reicht das Gold fuer diese Pflichtgebuehr nicht, uebernimmt das bestehende `paymentRequired`-System mit Verkauf, Hypothek, Begleichen oder Bankrott. Der ausstehende Wurf bleibt dabei im `TurnContext` erhalten.
- Kerkerinsassen behalten Besitz, Bauwerke, Hypotheken und Mieteinnahmen. Handel und Bauverwaltung bleiben in den vorhandenen sicheren Phasen moeglich, nicht jedoch parallel zur Kerkerentscheidung.
- TV und Smartphone zeigen Pasch, dritten Pasch, Kerkerentscheidung, Versuchszahl, Freikauf und den Unterschied zu "Nur zu Besuch". Phaser markiert Eingesperrte an ihrer bestehenden Figur und animiert den Transfer ohne neue Scene oder Canvas.

Der Turnzustand speichert Paschserie, Extra-Wurf, Wuerfelsequenz und eine eventuell ausstehende Kerkerbewegung gemeinsam. Reconnect, Host-Refresh, Bankrott und Neue Chronik erhalten beziehungsweise bereinigen diese Werte deterministisch.

## Stabiler Spielstart und Phaser-Bridge

Die Phaser-Instanz wird beim Wechsel von der Lobby in die Partie genau einmal erzeugt. Laufende `GameState`-Aktualisierungen werden über eine kleine Bridge an die bestehende `ValenorBoardScene` weitergegeben. Trifft ein State ein, bevor Phaser `create()` abgeschlossen hat, wird nur der neueste State vorgemerkt und unmittelbar nach der Scene-Initialisierung angewendet. Gold-, Besitz-, Auktions- und Reconnect-Updates erzeugen daher kein zusätzliches Canvas und starten Phaser nicht neu.

Vor dem Erstellen der Scene werden außerdem alle 40 Brettfelder und ihre eindeutigen Indizes 0 bis 39 validiert. Ein Host-Refresh stellt eine laufende In-Memory-Partie über das vorhandene Host-Token wieder her; ein Neustart des Servers verwirft den Raum weiterhin.

## Wie der QR-Code funktioniert

Der Node-Server ermittelt beim Start eine private IPv4-Adresse des Laptops, bevorzugt aus den Netzen `192.168.x.x`, `10.x.x.x` oder `172.16–31.x.x`. Der QR-Code enthält anschließend eine URL wie:

```text
http://192.168.178.50:5173/controller?room=VAL-7421
```

Falls mehrere Netzwerkadapter aktiv sind und die falsche Adresse gewählt wird, kann die gewünschte Adresse vor dem Start festgelegt werden:

```powershell
$env:PUBLIC_HOST="192.168.178.50"
npm run dev
```

## Windows-Firewall

Beim ersten Start kann Windows nach einer Freigabe für Node.js fragen. **Private Netzwerke** erlauben. Falls Smartphones die Seite trotzdem nicht erreichen:

1. Prüfen, ob das WLAN unter Windows als privates Netzwerk eingestuft ist.
2. Node.js in „Windows Defender Firewall → Eine App durch die Firewall zulassen“ für private Netzwerke freigeben.
3. Sicherstellen, dass die Ports `5173` und `3001` nicht blockiert werden.
4. Prüfen, ob Router oder Gast-WLAN die Kommunikation zwischen Geräten isolieren.

## Produktionsmodus im lokalen Netzwerk

Für einen gebauten Stand, bei dem Oberfläche und Server gemeinsam über Port `3001` laufen:

```bash
npm run build
$env:NODE_ENV="production"
npm run start
```

Danach die Host-Seite unter `http://localhost:3001/host` öffnen. Der QR-Code verwendet in diesem Modus ebenfalls Port `3001`.

## Verbindungsverhalten

- Der Server ist die autoritative Instanz für Räume, Spielerfarben und den Startzustand.
- Farben werden in der Reihenfolge Violett, Grün, Rot und Blau vergeben.
- Nach einem Verbindungsverlust bleibt ein Spieler fünf Minuten als **Getrennt** sichtbar.
- Kehrt dasselbe Smartphone zurück, wird sein Platz über ein lokal gespeichertes, zufälliges Token wiederhergestellt. Während einer gestarteten Partie bleibt der Spieler dauerhaft im GameState.
- Computer, Spielmodus, Startgold und Figurenpositionen werden ausschließlich vom Server verwaltet.
- Räume liegen derzeit nur im Arbeitsspeicher. Nach einem Neustart des Servers wird eine neue Lobby erstellt.

## Projektstruktur

```text
apps/
  client/                  React-, Vite- und Phaser-Oberfläche
    src/components/        Wiederverwendbare UI-Bausteine
    src/pages/             Host- und Controller-Ansicht
    src/game/              Phaser-Einstieg, Szenen, Entities, Systems
  server/                  Express- und Socket.IO-Server
    src/ai/                Schnittstellen für die spätere KI
    src/index.ts           HTTP- und Socket-Einstieg
    src/room-manager.ts    Autoritative Raum- und Spielerlogik
    src/network.ts         Erkennung der lokalen Netzwerkadresse
packages/
  shared/                  Events, GameState, Regeln und 40-Felder-Boarddaten
```

## Qualitätsprüfungen

```bash
npm run typecheck
npm test
npm run build
```

Dieser Stand enthält 24 Abenteuer- und 24 Schicksalskarten sowie den serverautoritativen Schnellspiel-Timer mit Schlussrunde und Vermögenswertung. Audio, fortgeschrittene strategische KI und Server-Persistenz sind weiterhin bewusst nicht enthalten.
