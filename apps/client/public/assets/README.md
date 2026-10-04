# Valenør art assets

This directory contains only locally bundled, reviewed game art. Asset paths and intended pixel sizes are defined centrally in `src/game/assets/asset-manifest.ts`.

- Large board and realm surfaces: WebP, normally 1024–1920 px at their longest edge.
- Transparent scenery, buildings and miniatures: alpha WebP or PNG, normally 256–768 px.
- Repeating animation: WebP texture atlas plus Phaser-compatible JSON.
- Never hotlink runtime assets. Mark a manifest entry as `ready` only after its file and attribution have been added.
- Missing or failed assets deliberately fall back to procedural rendering.

Do not add temporary low-quality art merely to fill a slot.
