# Asset attributions

## Valenør Core Asset Pack

The locally bundled board, realm, special-tile, character and building artwork under `apps/client/public/assets/` was supplied with this project as the Valenør Core Asset Pack. No runtime hotlinks or paid third-party services are used.

Creator, original source URL, license terms and modification history were not included in the supplied pack. Those provenance details must be confirmed by the project owner before redistribution outside this project.

The code-generated procedural board art and the system font fallbacks (Georgia, Segoe UI) remain available as runtime fallbacks and dynamic effects.

<!-- credits:skip-start: Hinweise für die Pflege dieser Datei, im Spiel ausgeblendet -->
For every future imported asset, record:

- file path and manifest key
- title and creator
- original source URL
- license name and license URL
- whether the file was modified
- date retrieved

Only locally present, reviewed files may be marked as `ready` in the asset manifest. Runtime hotlinks and paid assets are not allowed for the current project phase.
<!-- credits:skip-end -->

## Feld-, Gebäude- und Titelbilder

Vom Projektinhaber mit ChatGPT erstellt und für dieses Projekt bereitgestellt. Für die Anzeige verkleinert und nach WebP umgewandelt; Motive unverändert.

| Asset | Files | Creator | Source | License | Modified | Date |
| --- | --- | --- | --- | --- | --- | --- |
| Feldbilder (34 Felder sowie je ein gemeinsames Bild für Schicksal und Abenteuer) | `apps/client/public/assets/board/fields/*.webp` (Manifest: `VALENOR_ASSETS.fields`) | vom Projektinhaber mit ChatGPT erstellt | Projektinhaber | wie dieses Projekt | auf 512 × 512 px verkleinert, WebP | 2026-10-27 |
| Gebäude (12 Baustufen: Wurzelhütte, Baumhalle, Sternenzitadelle, Gehöft, Herrenhaus, Königsburg, Raiderlager, Kriegslager, Eisenfestung, Wanderzelt, Große Halle, Himmelsfeste) | `apps/client/public/assets/buildings/{elven,human,orc,steppe}/*.webp` (Manifest: `VALENOR_ASSETS.buildings`) | vom Projektinhaber mit ChatGPT erstellt | Projektinhaber | wie dieses Projekt | auf den Umriss zugeschnitten, auf 256 px Breite verkleinert, WebP mit Transparenz | 2026-10-27 |
| Titelbild der TV-Lobby | `apps/client/public/assets/ui/title/titelbild-valenor.webp` (Manifest: `LOBBY_ASSETS.title`) | vom Projektinhaber mit ChatGPT erstellt | Projektinhaber | wie dieses Projekt | WebP in Originalgröße (1536 × 1024 px) | 2026-10-27 |

## Fonts (design system "Codex")

Bundled locally under `apps/client/public/assets/fonts/`, loaded by `apps/client/src/styles/fonts.css`. No runtime hotlinks. The full license text sits next to each family as `OFL.txt`.

| Family | Files | Creator / copyright | Source | License | Modified | Retrieved |
| --- | --- | --- | --- | --- | --- | --- |
| Cinzel | `cinzel/cinzel-latin-{500,600,700}-normal.woff2` | Copyright 2020 The Cinzel Project Authors (Natanael Gama) | https://github.com/NDISCOVER/Cinzel, packaged by Fontsource (`@fontsource/cinzel` 5.3.0) | SIL Open Font License 1.1, https://openfontlicense.org | No (Latin subset as published by Fontsource) | 2026-10-27 |
| Alegreya Sans | `alegreya-sans/alegreya-sans-latin-{400-normal,400-italic,500-normal,700-normal,800-normal}.woff2` | Copyright 2013 The Alegreya Sans Project Authors (Huerta Tipográfica) | https://github.com/huertatipografica/Alegreya-Sans, packaged by Fontsource (`@fontsource/alegreya-sans` 5.3.0) | SIL Open Font License 1.1, https://openfontlicense.org | No (Latin subset as published by Fontsource) | 2026-10-27 |

## Icons (design system "Codex")

| Asset | Files | Creator | Source | License | Modified | Retrieved |
| --- | --- | --- | --- | --- | --- | --- |
| Game-icons.net set (50 icons, e.g. anchor, cog, castle, crown, two-coins, rolling-dices, dice-six-faces-*, manacles, padlock, dragon-head, rune-stone, moon, open-treasure-chest; emotes: glass-celebration, enrage, happy-skull, surprised) | `apps/client/src/components/icons/icon-data.ts` (SVG path data; the UI name → original icon name mapping is `ICON_SOURCES` in the same file). Also embedded as CSS masks in `apps/client/src/styles/tokens.css` (`--icon-crown`, `--icon-gold`, `--icon-magic`). | Lorc, Delapouite and other contributors of game-icons.net | https://game-icons.net, packaged as `@iconify-json/game-icons` 1.2.4 | Creative Commons Attribution 3.0 Unported (CC BY 3.0), https://creativecommons.org/licenses/by/3.0/ | Path data unchanged; recolored at runtime | 2026-10-27 |
| Navigation shapes `chevron-left`, `chevron-right`, `arrow-right`, `swap`, `close`, `plus`, `minus` | same file | Chroniken von Valenør project | own work | same license as this project | – | 2026-10-27 |

Attribution as required by CC BY 3.0: "Icons made by Lorc, Delapouite and contributors, available on https://game-icons.net, licensed under CC BY 3.0."
