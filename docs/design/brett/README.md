# Brett und Bilder

Tiefere Felder mit eigenem Feldbild, Figuren direkt auf ihrem Feld, ein Bild je Baustufe und das Titelbild in der TV-Lobby. Die Spielregeln sind unverändert. TV-Ansichten in 1920 × 1080 sind auf 960 px verkleinert, Ansichten in 1366 × 768 auf 1024 px; Ausschnitte sind doppelt vergrößert.

## Feldmaße

Das Brett ist 1700 × 1000 Weltpixel groß (vorher 1700 × 960). Auf einem 1920er-Bildschirm entspricht ein Weltpixel fast einem Bildschirmpixel.

| | vorher | nachher |
| --- | --- | --- |
| Felder oben und unten | 115 × 135 | 110 × 190 |
| Felder links und rechts | 135 × 115 | 190 × 103 |
| Ecken | 160 × 135 | 190 × 190 |
| Mittelbild | 1430 × 690 | 1320 × 620 |

Namens- und Preisband bedecken zusammen höchstens ein Drittel eines Feldes (oben/unten 40 + 22 von 190 px, Seiten 30 von 103 px, Ecken 56 von 190 px). Die Gruppenfarbe sitzt als Leiste an der Innenkante, der Besitz als Rahmen in Spielerfarbe mit Wappen im Preisband.

## Figuren

Bis zu sechs Figuren stehen in ein bis drei Reihen auf der Standfläche ihres Feldes. Die aktive Figur steht vorne in der Mitte und ist bis zu 15 % größer, ohne in den Feldnamen zu ragen. Je voller ein Feld, desto kleiner die Figuren. Ein Namensschild trägt nur, wer allein auf dem Feld steht oder am Zug ist. Ein dunkler Schein hinter jeder Figur hebt sie vom Feldbild ab.

## Gebäude je Baustufe

★ = neues Bild. Die vorhandenen Bilder füllen die übrigen Stufen.

| Stufe | Elfen | Menschen | Orks | Steppe |
| --- | --- | --- | --- | --- |
| 1 | ★ Wurzelhütte | Hütte (`cottage`) | Kriegshütte (`hut`) | ★ Wanderzelt |
| 2 | Baumhaus (`treehouse-sanctuary`) | ★ Gehöft | ★ Raiderlager | Clanlager (`yurt-hall`) |
| 3 | Hainheiligtum (`glowing-shrine`) | ★ Herrenhaus | ★ Kriegslager | Totemsiedlung (`totem-hall`) |
| 4 | ★ Baumhalle | Wehrturm (`keep-tower`) | Bollwerk (`fortress-tower`) | ★ Große Halle |
| 5 | ★ Sternenzitadelle | ★ Königsburg | ★ Eisenfestung | ★ Himmelsfeste |

Gebäude stehen am inneren Rand des Feldes, hinter den Figuren. Auf den Seitenfeldern bleibt ihr Bauplatz frei, oben und unten stehen die Figuren davor.

## Vorher und nachher

| Ansicht | vorher | nachher |
| --- | --- | --- |
| Brett mit Gebäuden, 1920 | ![](vorher-brett-1920.jpg) | ![](nachher-brett-1920.jpg) |
| Brett mit Gebäuden, 1366 | ![](vorher-brett-1366.jpg) | ![](nachher-brett-1366.jpg) |
| Vier Figuren auf einem Feld | ![](vorher-figuren-1920.jpg) | ![](nachher-figuren-4-1920.jpg) |
| Figuren in der Ecke | ![](vorher-ecke-1920.jpg) | ![](nachher-ecke-6-1920.jpg) |
| Handels-Meldung | ![](../living/tv-handel-siegel.jpg) | ![](nachher-handel-1920.jpg) |
| Chronist und „Letzte Aktionen“ | ![](../living/tv-chronist.jpg) | ![](detail-chronik.jpg) |
| Lobby | ![](vorher-lobby-1920.jpg) | ![](nachher-lobby-1920.jpg) |

## Weitere Ansichten

| Ansicht | Bild |
| --- | --- |
| Leeres Brett | ![](nachher-brett-leer-1920.jpg) |
| Eine Figur | ![](nachher-figuren-1-1920.jpg) |
| Sechs Figuren auf Stufe 5 (oben), 1920 und 1366 | ![](nachher-figuren-6-stufe5-1920.jpg) ![](nachher-figuren-6-stufe5-1366.jpg) |
| Ausschnitt: sechs Figuren auf Stufe 5 | ![](detail-stufe5-6-figuren.jpg) |
| Ausschnitt: sechs Figuren auf Stufe 5 (Seitenfeld) | ![](detail-seite-stufe5-6-figuren.jpg) |
| Ausschnitt: sechs Figuren in der Ecke | ![](detail-ecke-6-figuren.jpg) |
| Ausschnitt: Gebäude der Stufen 1 bis 5 | ![](detail-gebaeude-stufen.jpg) |
| Alle Ecken, 1920 und 1366 | ![](nachher-ecken-1920.jpg) ![](nachher-ecken-1366.jpg) |
| Handels-Meldung, 1366 | ![](nachher-handel-1366.jpg) |
| Lobby, 1366 | ![](nachher-lobby-1366.jpg) |
| Ohne Feldbilder (Fallback) | ![](nachher-ohne-feldbilder-1920.jpg) |

## Neu erzeugen

Dev-Server starten (`npm run dev`) und unter `http://localhost:5173/visual-qa?scene=<name>` aufnehmen: `board-empty`, `board-tokens-1`, `board-tokens-4`, `board-tokens-6`, `board-tokens-6-side`, `board-corners`, `board-corner-6`, `board-buildings`, `lobby`, `lobby-empty` und für die Handels-Meldung `drama-trade`. Mit `&fieldArt=off` lädt das Brett keine Feldbilder und zeigt den Fallback. Die Lobby-Szenen verbinden sich nicht mit dem Spielserver.

Die Quellbilder liegen im nicht eingecheckten Ordner `assets-neu/`. Feldbilder werden mittig auf 512 × 512 px gebracht, Gebäude auf ihren Umriss zugeschnitten und auf höchstens 256 × 384 px verkleinert (WebP mit Transparenz), das Titelbild bleibt in Originalgröße.
