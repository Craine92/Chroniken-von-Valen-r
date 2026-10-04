# Audio-Assets für Chroniken von Valenør

Lege die Dateien im Projekt exakt unter `apps/client/public/assets/audio/` ab. Im gebauten Spiel werden sie wie vorgesehen unter `/assets/audio/` ausgeliefert. Es ist keine Codeänderung nötig. Fehlende Dateien werden einmalig intern gemeldet und ansonsten übersprungen. Bei Varianten nutzt das Spiel automatisch nur erfolgreich geladene Dateien und vermeidet, soweit möglich, dieselbe Variante zweimal nacheinander.

Bevorzugte Lizenz: **CC0** oder eine vergleichbar eindeutige, kommerziell nutzbare Lizenz. Lizenznachweis und Quelle bitte außerhalb des Spiels archivieren. Kurze Effekte werden als `.ogg`, die lange Musik als vorhandene `.mp3` erwartet.

| Datei ab `apps/client/public/assets/audio/` | Einsatz | Gesuchter Klang | Länge | Wiedergabe / Lizenz |
|---|---|---|---|---|
| `music/valenor-main.mp3` | Während einer laufenden Partie | Instrumentale, ruhige Dark-Fantasy-Musik ohne Sprache | ca. 60 min | Endloser Loop, gestreamt · CC0/eindeutig lizenziert |
| `sfx/dice/dice-01.ogg` | Würfelanimation, Variante 1 | Zwei Würfel auf Holz | 0,5–2 s | One-shot · CC0 |
| `sfx/dice/dice-02.ogg` | Würfelanimation, Variante 2 | Etwas schwererer Würfelwurf | 0,5–2 s | One-shot · CC0 |
| `sfx/dice/dice-03.ogg` | Würfelanimation, Variante 3 | Kurzer trockener Wurf | 0,5–2 s | One-shot · CC0 |
| `sfx/dice/dice-04.ogg` | Würfelanimation, Variante 4 | Mehrere Würfel, dezentes Rollen | 0,5–2 s | One-shot · CC0 |
| `sfx/dice/dice-05.ogg` | Würfelanimation, Variante 5 | Tiefer Holztischklang | 0,5–2 s | One-shot · CC0 |
| `sfx/movement/token-01.ogg` | Sichtbare Figurenbewegung, Variante 1 | Leichter Holzstein-Schritt | 0,1–0,6 s | One-shot · CC0 |
| `sfx/movement/token-02.ogg` | Sichtbare Figurenbewegung, Variante 2 | Sanftes Setzen einer Spielfigur | 0,1–0,6 s | One-shot · CC0 |
| `sfx/movement/token-03.ogg` | Sichtbare Figurenbewegung, Variante 3 | Kurzer gedämpfter Tritt | 0,1–0,6 s | One-shot · CC0 |
| `sfx/economy/coins-gain-01.ogg` | Goldgewinn, Variante 1 | Helles Münzklimpern | 0,3–1,5 s | One-shot · CC0 |
| `sfx/economy/coins-gain-02.ogg` | Goldgewinn, Variante 2 | Kleiner gefüllter Münzbeutel | 0,3–1,5 s | One-shot · CC0 |
| `sfx/economy/coins-pay-01.ogg` | Zahlung, Variante 1 | Münzen werden abgelegt | 0,3–1,5 s | One-shot · CC0 |
| `sfx/economy/coins-pay-02.ogg` | Zahlung, Variante 2 | Münzen aus einem Beutel | 0,3–1,5 s | One-shot · CC0 |
| `sfx/property/property-buy.ogg` | Erfolgreicher Ortskauf/Auktionsgewinn | Kurzes Siegel oder Vertragsschlag | 0,5–2 s | One-shot · CC0 |
| `sfx/property/property-upgrade.ogg` | Erfolgreicher Ausbau | Kurzer Bau-/Hammerakzent | 0,5–2 s | One-shot · CC0 |
| `sfx/property/property-rent.ogg` | Fällige Besitzmiete | Dezente Übergabe von Münzen | 0,4–1,5 s | One-shot · CC0 |
| `sfx/cards/card-draw-01.ogg` | Karte ziehen, Variante 1 | Pergament über Holz | 0,3–1,2 s | One-shot · CC0 |
| `sfx/cards/card-draw-02.ogg` | Karte ziehen, Variante 2 | Kurzes Kartenfächern | 0,3–1,2 s | One-shot · CC0 |
| `sfx/cards/card-reveal.ogg` | Neutrale Kartenenthüllung | Magischer Pergament-Akzent | 0,5–1,5 s | One-shot · CC0 |
| `sfx/events/event-positive-01.ogg` | Positive Karte, Variante 1 | Heller magischer Erfolg | 0,5–3 s | One-shot · CC0 |
| `sfx/events/event-positive-02.ogg` | Positive Karte, Variante 2 | Warmer kurzer Glanz | 0,5–3 s | One-shot · CC0 |
| `sfx/events/event-negative-01.ogg` | Negative Karte/Bankrott, Variante 1 | Dunkler kurzer Schlag | 0,5–3 s | One-shot · CC0 |
| `sfx/events/event-negative-02.ogg` | Negative Karte/Bankrott, Variante 2 | Unheilvoller tiefer Akzent | 0,5–3 s | One-shot · CC0 |
| `sfx/events/event-epic.ogg` | Seltenes Großereignis/letzte Runde | Mächtiger, nicht zu langer Fantasy-Stinger | 1–4 s | One-shot, Musik-Ducking · CC0 |
| `sfx/prison/prison-enter.ogg` | Eintritt in den Kerker | Schwere Metalltür | 1–3 s | One-shot, Musik-Ducking · CC0 |
| `sfx/prison/prison-exit.ogg` | Befreiung aus dem Kerker | Tor öffnet sich, erleichternder Akzent | 1–3 s | One-shot · CC0 |
| `sfx/prison/chains-01.ogg` | Alternative für Kerkereintritt | Kurzes gedämpftes Kettenrasseln | 1–3 s | One-shot, Musik-Ducking · CC0 |
| `sfx/world/realm-transition-01.ogg` | Größerer Reichswechsel, Variante 1 | Atmosphärischer Wind-/Portalübergang | 1–4 s | One-shot · CC0 |
| `sfx/world/realm-transition-02.ogg` | Größerer Reichswechsel, Variante 2 | Sanfter magischer Übergang | 1–4 s | One-shot · CC0 |
| `sfx/world/start-pass.ogg` | Runentor passiert und Belohnung erhalten | Kurzer triumphaler Tor-/Goldakzent | 0,7–2,5 s | One-shot · CC0 |
| `sfx/ui/click-01.ogg` | Normaler UI-Klick, Variante 1 | Sehr dezenter Holz-/Runenklick | 0,05–0,4 s | One-shot · CC0 |
| `sfx/ui/click-02.ogg` | Normaler UI-Klick, Variante 2 | Leichter alternativer Klick | 0,05–0,4 s | One-shot · CC0 |
| `sfx/ui/confirm.ogg` | Wichtige Bestätigung | Kurzer positiver Bestätigungston | 0,1–0,6 s | One-shot · CC0 |
| `sfx/ui/cancel.ogg` | Abbruch/Schließen/Stummschalten | Gedämpfter Rücknahmeton | 0,1–0,6 s | One-shot · CC0 |
| `sfx/ui/error.ogg` | Tatsächlich abgelehnte Aktion | Kurzer unaufdringlicher Fehlerton | 0,1–0,7 s | One-shot · CC0 |
| `sfx/victory/victory.ogg` | Lokaler Sieg/Spielende am Hauptbildschirm | Feierlicher Fantasy-Stinger | 3–10 s | One-shot, Musik-Ducking · CC0 |
| `sfx/victory/defeat.ogg` | Lokale Niederlage am Controller | Ruhiger, würdevoller Abschluss | 3–8 s | One-shot, Musik-Ducking · CC0 |

## Verhalten

- `valenor-main.mp3` wird über ein speicherschonendes HTML5-Audioelement gestreamt, geloopt und nie parallel dupliziert.
- Kurze Effekte werden nach der ersten Verwendung geladen, per Web Audio dekodiert und anschließend wiederverwendet.
- Varianten dürfen teilweise fehlen. Beispielsweise funktionieren `dice-01.ogg`, `dice-03.ogg` und `dice-05.ogg` automatisch als Dreierpool.
- Hauptbildschirm: Musik, Brett-SFX und UI-Sounds. Smartphone: standardmäßig nur UI-Sounds sowie das persönliche Sieg-/Niederlage-Signal.
- Lautstärken, Mute- und Aktivierungszustände werden lokal im Browser gespeichert; sie sind niemals Teil des Netzwerk-GameStates.
- Spätere Ambient-Spuren können als eigene Gruppe ergänzt werden, ohne Spielereignisse oder Serverlogik zu ändern.
