# The Primitive Age — Stage 1 Prototype

A playable slice of Stage 1 from the design docs: walk around, gather Wood/Stone/Fiber/Food, unlock a small tech tree with Knowledge Points, craft tools, cook food at a Campfire, place buildings, and fight off the occasional wolf. Runs entirely in the browser, no build step, no server required.

## Running it

Open `index.html` directly in a browser (double-click it, or drag it into a browser window). No installation, no local server needed — everything loads via plain `<script>` tags, which is deliberate (see "Why no build tools" below).

## Controls

- **WASD** — move
- **E** — gather the nearest resource node, attack the nearest enemy, or cook food if standing at a lit Campfire
- **ESC** — cancel building placement
- Bottom buttons — open Craft / Build / Knowledge panels

## Project structure

```
index.html          the page shell — just structure, no logic
css/style.css        all visual styling for the UI (not the game world itself)
js/config.js          ALL GAME DATA — resources, tech tree, recipes, buildings,
                       asset file paths. Edit this file to change content.
js/assets.js           loads your art, tracks what succeeded/failed to load
js/state.js             the single game-state object + small shared helpers
js/world.js              world generation, gathering, combat, tech/craft/build
                          logic, and the per-frame update loop (no DOM/canvas)
js/ui.js                   DOM rendering — resource bar, panels, vitals, log
js/render.js                 canvas drawing, with automatic art fallback
js/main.js                    input wiring + the game loop + startup
assets/sprites/                drop your world-object art here (see its README)
assets/icons/                   drop your resource-bar icons here (see its README)
```

## Adding your own art

Every sprite and icon the game draws is loaded from a file path listed in
`js/config.js` (`SPRITE_MANIFEST` / `ICON_MANIFEST`). On startup, the game
tries to load every one of those files:

- **Found it?** Uses your image, drawn at the size specified in `SPRITE_SIZES`.
- **404 / missing?** Falls back automatically to a simple built-in placeholder
  shape (a colored circle, triangle, etc.) drawn in `js/render.js`.

This means you can drop in art **one file at a time** — replace `tree.png`
today, leave everything else as placeholder shapes, and the game keeps
running the whole time. See `assets/sprites/README.txt` and
`assets/icons/README.txt` for the exact filenames and recommended sizes.

Nothing else in the codebase needs to change when you add art — that's the
whole point of separating `config.js` (data), `assets.js` (loading), and
`render.js` (drawing-with-fallback) into their own files.

## Why no build tools / ES modules

This deliberately avoids `import`/`export` and bundlers. Browsers block ES
module imports from the `file://` protocol (a CORS restriction), which
would mean you couldn't just double-click `index.html` — you'd need a local
web server running. Plain `<script>` tags loaded in order, sharing one
`window.Game` namespace object, avoid that entirely and keep "just open the
file" working. If this grows into a bigger project later, moving to a real
bundler (Vite, esbuild, etc.) is a reasonable next step, but wasn't worth
the setup friction for a prototype meant to be immediately playable.

## What this is (and isn't)

This is the Stage 1 "Prototype 1" slice from the design docs — proving the
gather → craft → build → tech loop is fun before anything else (Nexus,
expeditions, magic, realms) gets layered on top. Combat here uses the
simple direct-control formula from the demo-systems doc, not the
autonomous-expedition math from the mission-resolution deep dive — that
system activates once the Nexus and Expedition Hall exist, which isn't
built yet in this slice.

## Known limitations (prototype scope)

- No save/load — state resets on page reload (see demo_systems_gaps.md)
- World is a single fixed-size clearing, not a real explorable map
- Hut and Palisade are currently cosmetic/decorative (no gameplay effect yet)
- No sound
