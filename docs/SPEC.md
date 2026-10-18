# Nexus Project — Claude Code Rebuild Spec

Last updated 2026-10-18

## How to use this doc

This spec tells Claude Code how to turn the single-folder beta prototype into a clean VS Code project with a larger open world and a drop-in art pipeline. Save it into the repo as `docs/SPEC.md` (export as Markdown), give Claude Code the first prompt from the last section, and have it build one milestone at a time.

**Tech decision: Vite + vanilla JavaScript (ES modules), Canvas 2D, JSON data files, Vitest.** The prototype avoided ES modules only because browsers block them on `file://`. A Vite dev server removes that limit, adds hot reload, and builds a static folder you can host on GitHub Pages or itch.io. No UI framework: the game is one canvas plus a handful of DOM panels. If you would rather use Phaser 3 for its built-in tilemaps and animation, say so before Claude Code starts. Everything below still applies, but the render layer changes.

**Rules Claude Code must follow**

- Game content lives in JSON under `src/data/`. Logic files never contain a resource, enemy, trait or zone name.
- All randomness goes through one seeded RNG module, so the world, the missions and the tests are reproducible.
- All art goes through the asset manifest. A missing file draws a placeholder and never throws.
- `GameState` is one plain, serializable object. Save and load are a JSON round trip with a version number and migrations.
- Only `src/render/` and `src/ui/` touch the DOM or canvas. Systems are pure logic that the tests can run in Node.
- Keep the mission math in the Systems section exactly as written unless you change it in this doc first.
- Design pillars: permadeath, rarity is not power, expeditions are the Pick Me Up borrow and realms, knowledge fragments, bonds and Axiom Magic are the differentiator.

**Reference material:** the working beta is `nexus_project_beta.zip` (treat it as the reference implementation), and the design intent lives in the [Game Master Design Document](https://claude.ai/code/artifact/a9895bb6-fc48-4db7-bce9-b1712485a348).

## What exists today

The beta is a plain HTML, CSS and JS game with no build step: ten script files share one `window.Game` namespace and draw to a fixed 900 by 560 canvas. It is playable from first gather to the Grove Warden boss, but the whole overworld is one screen, which is the main thing this rebuild changes.

| Prototype file | What it does | Becomes |
| --- | --- | --- |
| `js/config.js` | All content: resources, tech, recipes, buildings, classes, traits, talents, enemies, realm and zone data, art manifests | Split into JSON files in `src/data/` |
| `js/assets.js` | Loads sprites and icons, falls back to placeholders | `src/render/assets.js` plus a JSON manifest |
| `js/state.js` | The single state object, a reset function, a `rand` hook | `src/core/state.js`, `rng.js` |
| `js/characters.js` | Roster, generation, traits, talents, XP and growth, bonds, gear, recruiting, permadeath | `src/systems/characters.js` |
| `js/missions.js` | Combat Power, synergy, the encounter loop, injuries, deaths, grief, rewards | `src/systems/missions.js` |
| `js/world.js` | Overworld gathering, combat, crafting, building, tech, Nexus stages, day clock | Split into `systems/` modules; world generation is new |
| `js/save.js` | Autosave to localStorage, JSON export and import | `src/core/save.js` with migrations |
| `js/ui.js` | Resource bar, panels, roster, Expedition Hall, report screen, menu | `src/ui/` one file per panel |
| `js/render.js` | Canvas drawing with placeholder art | `src/render/` with camera and tilemap |
| `js/main.js` | Input and the game loop | `src/main.js` |

**What works:** gathering and wolf combat, the six-step tech tree, crafting and building, digging out and awakening the Nexus through Shrines, a four-character starter roster with traits, talents, bonds and recruiting, autonomous squad missions through four Verdant Wilds zones with a boss, permadeath with a memorial, and autosave. A headless simulation of 300 runs per zone and objective gave sensible win rates, and a save and load round trip matched exactly.

**Known gaps**

- The world is one fixed screen: no scrolling, no collision, no map, nowhere to discover.
- Every sprite is a placeholder shape. There are no animations and no audio.
- Controls are keyboard only, and the canvas does not resize to the window.
- A human has not played it through. Balance is checked by simulation only.
- Mage recruits exist but have no spell UI. Axiom Magic, the invention minigame loop (a separate prototype, `invention_loop_modular.zip`) and diplomacy are not connected to it.
- `villager.png` is in the manifest but nothing draws it.

## Project structure

One rule organizes the repo: **art and data are outside the code.** You add art by dropping files into `public/assets/` and a line into its manifest. You add content by editing JSON in `src/data/`. Neither needs a code change.

```text
nexus-project/
  index.html
  package.json            scripts: dev, build, preview, test, sim, check:assets, check:data
  vite.config.js
  CLAUDE.md               rules for Claude Code (text in the last section)
  docs/SPEC.md            this document
  public/assets/          YOUR ART GOES HERE, served as-is
    manifest.json         key -> file, size, anchor, animation frames
    sprites/              characters/, enemies/, resources/, buildings/, nexus/
    tiles/                tilesets: ground, forest, city, water, hills
    icons/                resource and item icons
    portraits/            character portraits for the roster
    ui/                   panel frames, buttons, cursors
    audio/                sfx/, music/
  src/
    main.js               boot: load assets, load data, new game or load save, start loop
    core/                 state.js, rng.js, events.js, loop.js, save.js, migrations.js
    data/                 JSON content (see Data files)
    world/                worldgen.js, chunks.js, biomes.js, landmarks.js, collision.js, fog.js
    systems/              gathering.js, combat.js, crafting.js, building.js, tech.js,
                          nexus.js, characters.js, bonds.js, missions.js, recruiting.js
    render/               assets.js, camera.js, tilemap.js, sprites.js, minimap.js, effects.js
    ui/                   one file per panel: hud, craft, build, tech, roster, hall, report, menu
  tests/                  Vitest: missions, characters, save, worldgen, data validation
  tools/                  sim.js (win-rate simulation), check-assets.js, check-data.js
```

**Module boundaries** keep the game testable and mod-friendly.

| Layer | May import | Must not |
| --- | --- | --- |
| `core/` | nothing from other layers | touch the DOM, canvas or `Math.random` |
| `data/` | nothing (JSON only) | contain logic |
| `world/`, `systems/` | `core/`, `data/` | touch the DOM or canvas; call `ui/` or `render/` |
| `render/` | `core/`, `world/` (read only) | change game state |
| `ui/` | `core/`, `systems/`, `render/` | hold game state of its own |

Systems talk to the UI through a small event bus in `core/events.js` (`emit('log', text)`, `emit('mission:report', report)`), so a system never needs a reference to a panel.

**Tooling for VS Code:** Vite for dev and build, Vitest for tests, ESLint and Prettier for style. Install the ESLint and Prettier VS Code extensions; no preview extension is needed because Vite serves the game. `npm run check:data` validates every cross-reference between JSON files (a zone listing an enemy that does not exist fails the check). `npm run check:assets` lists which manifest entries have no file yet, which is your art to-do list.

## Art and asset pipeline

To replace a placeholder, save your PNG at the path the manifest lists and reload. To add something new, save the file and add one manifest entry. The game never needs a code change for art, and a missing file always draws a colored placeholder so the game stays playable while you paint.

**Art rules**

- Format: PNG with transparency. Draw with `imageSmoothingEnabled = false` so pixel art stays sharp at any zoom.
- Base unit: a 32 by 32 pixel tile. Characters and enemies use 32 by 32 frames. Trees and tall props are 64 by 96. Buildings are multiples of 32.
- Anchor: standing objects anchor at bottom center, and the renderer draws everything sorted by its anchor's Y so a character walks behind a tree and in front of a wall.
- Spritesheets: one PNG per character or enemy, one row per direction in the order down, left, right, up, one column per frame. The manifest says how many frames each animation has.
- Terrain: a tileset PNG of 32 pixel tiles with four or more variants per terrain. Version one uses variants only. Smooth transitions between terrains come from optional edge overlay tiles, added later.

**`public/assets/manifest.json`** is fetched at startup. Example entries:

```json
{
  "tileSize": 32,
  "sprites": {
    "player": { "file": "sprites/characters/player.png", "frameW": 32, "frameH": 32,
                "anchor": [0.5, 1.0],
                "anims": { "idle": { "frames": 2, "fps": 3 }, "walk": { "frames": 4, "fps": 8 } } },
    "tree_pine": { "file": "sprites/resources/tree_pine.png", "frameW": 64, "frameH": 96, "anchor": [0.5, 0.95] },
    "ruin_pillar": { "file": "sprites/city/ruin_pillar.png", "frameW": 32, "frameH": 64, "anchor": [0.5, 1.0] }
  },
  "tilesets": {
    "forest_floor": { "file": "tiles/forest_floor.png", "variants": 6 },
    "city_stone":   { "file": "tiles/city_stone.png",   "variants": 6 }
  },
  "icons": { "wood": "icons/wood.png", "stone": "icons/stone.png" },
  "audio": { "sfx_gather": "audio/sfx/gather.ogg", "music_day": "audio/music/day.ogg" }
}
```

Sprite keys come from the game data. A resource type `tree` in `resources.json` names its sprite with `"sprite": "tree_pine"`, so you can add `tree_dead` as a new variant by adding a manifest entry and one data line.

**Art checklist** (everything the game can show; `npm run check:assets` reports which are still placeholders)

| Group | Keys | Size | Notes |
| --- | --- | --- | --- |
| Player and roster | `player`, `villager_*` | 32 by 32 per frame | Idle 2, walk 4, attack 3 per direction. Roster members are not drawn in the world in version one |
| Portraits | `portrait_<characterId or class>` | 96 by 96 | Shown in Roster and reports. One per class is enough to start |
| Enemies | `wolf`, `boar`, `sprite`, `goblin` | 32 by 32 per frame | Overworld enemies. Realm enemies appear only as report art, see below |
| Resources | `tree_pine`, `tree_dead`, `rock`, `bush`, `berrybush`, `salvage_pile` | 64 by 96 trees, 32 by 32 others | Depleted state is a second frame |
| Buildings | `campfire`, `hut`, `palisade`, `farm_plot`, `shrine` | 32 to 64 wide | Anchor bottom center |
| The Nexus | `nexus_buried`, `nexus_excavated`, `nexus_awake` | 96 by 96 | Three states. Awake can animate with 4 frames |
| Ruined city props | `ruin_wall`, `ruin_pillar`, `ruin_rubble`, `ruin_statue`, `ruin_arch`, `ruin_fountain` | 32 to 96 | Used by the city prefab and landmarks |
| Landmarks | `lm_watchtower`, `lm_den`, `lm_standing_stones`, `lm_cave`, `lm_old_road_sign` | 64 to 128 | One per landmark type in the world section |
| Terrain tiles | `forest_floor`, `meadow`, `city_stone`, `dirt_road`, `water`, `hills_rock`, `marsh` | 32 tiles, 6 variants | Water and rock are blocking tiles |
| Icons | one per resource and item | 24 by 24 | 12 resources now, plus gear |
| Realm report banners | `realm_verdant_fringe`, `_groves`, `_warrens`, `_old_grove` | 560 by 160 | Optional. Shown at the top of an expedition report |
| UI | `panel_frame`, `button`, `cursor`, `minimap_frame` | 9-slice | Optional. Default is the current parchment CSS |
| Audio | `sfx_gather`, `sfx_hit`, `sfx_build`, `sfx_craft`, `sfx_levelup`, `sfx_death`, `sfx_nexus_awaken`, `sfx_click`; `music_day`, `music_night`, `music_hall`, `music_boss` | OGG | Audio plays only after the first click, which the engine handles |

## Open world redesign

The overworld becomes a scrolling map of 160 by 112 tiles (5,120 by 3,584 pixels), about 36 times the area of today's single screen. You start in the overgrown fringe of a ruined city, forest closes in on every side, and the city's heart, with the buried Nexus, is something you find by exploring. Everything below is generated from a seed plus a few hand-authored pieces, so it stays small to save and easy to tune.

**One assumption to confirm:** you start on the city's overgrown edge, not deep inside it and not in the forest. If you meant waking in a forest clearing and finding the city later, set `spawn.zone` to `outskirts` in `src/data/world.json`. Nothing else changes, and finding the city becomes the first goal.

### Layout

The world is read as rings around the Old City. Danger rises with distance, and the edge of the map is the Seal, the boundary that keeps the Overworld closed. The Seal is impassable now and is where the Ascension Engine story lands later.

```text
+--------------------------- THE SEAL (impassable map edge) ---------------------------+
|        ,-------------------- DEEP FOREST (60% to 97% of the way out) -----------,    |
|     ,'    wolf dens, packs, boars, hills patch (NE), river crossing the SW        `.  |
|    /     ,------------------ OUTSKIRTS (out to 60%) ------------------.            \ |
|   |     /     light forest, meadows, old road, lone wolves              \            | |
|   |    |            +------------------+                                |           | |
|   |    |            |     OLD CITY     |   Nexus under the plaza        |           | |
|   |    |            |   (Sunken Hall)  |                                |           | |
|   |    |            +------------------+                                |           | |
|   |    |               [ Mossgate ]  <- you start here                  |           | |
|    \    \                                                             /           /  |
|     `.    `-------------------------------------------------------'          ,'     |
|       `-.______  river with three fords ____________________________,-'             |
+----------------------------------------------------------------------------------+
Danger rises outward: city and Mossgate calm, Outskirts lone wolves, Deep Forest packs and dens.
Watchtowers (3) and wolf dens (6) are scattered per seed; positions here are illustrative.
```

The Nexus lies under the Old City's plaza, and you start at Mossgate on its south edge. Tower and den positions are illustrative and change with each seed.

### Biomes and zones

| Zone | Where | Ground and look | Resources | Overworld threats |
| --- | --- | --- | --- | --- |
| Mossgate (start) | South edge of the city | Cracked paving, broken walls, moss | Stone, fiber, salvage piles | None at first; a lone wolf after day 2 |
| Old City | Center, 48 by 36 tiles | Plaza, market row, collapsed hall, cistern, four gatehouses | Salvage piles, relics, stone | Wolves near the edges; the Nexus plaza is quiet |
| Outskirts | Ring out to 60% of the way to the map edge | Light forest, meadows, an old road | Wood, berries, fiber, stone | Wolves, seldom in packs |
| Deep Forest | 60% to 97% of the way to the edge | Dense trees that block movement, narrow paths | Wood in bulk, berries, hide from kills | Wolf packs, boars, dens |
| Hills | Patches in the Deep Forest | Rock faces that block, stony ground | Stone, later ore | Boars |
| Marsh and river | One river crossing the map | Water that blocks, with three fords | Fiber, food, later fish | Few; the fords are chokepoints |
| The Seal | Map edge | Shimmering wall, impassable | None | None |

### Landmarks and discovery

Landmarks are hand-placed by the generator at fixed spots per seed. Finding one the first time shows a banner and pays out Knowledge Points, which makes exploring a second way to progress besides the passive trickle.

| Landmark | Count | Effect on first discovery | Repeatable effect |
| --- | --- | --- | --- |
| Sunken Hall (Nexus) | 1 | +10 Knowledge, reveals the Nexus prompt | Dig and awaken as today |
| Watchtower | 3 | +6 Knowledge, reveals a 30 tile radius of the map | None |
| Standing Stones | 3 | +6 Knowledge | A Shrine built within 6 tiles gathers Awareness at double speed |
| Wolf Den | 6 | None | Spawns wolves; clearing it pays hide and fiber and stops respawns |
| Ancient Cache | 5 | +4 Knowledge | One-time chest of stone, fiber and a relic |
| Spring | 3 | None | Restores health when you stand in it |
| Abandoned Camp | 4 | +3 Knowledge | One-time Expedition Supply or food |
| Old Road Sign | 6 | None | Points toward the nearest undiscovered landmark |

Ruin salvage piles in the city give stone and fiber, and one in ten holds a relic. Picking up a relic grants 3 Knowledge at once, so the city rewards study without adding a new crafting resource.

### Rules for the world systems

- **Camera:** follows the player with smoothing and clamps to the map. The viewport is the window divided by an integer zoom (default 2, options 1 to 3), so pixel art stays crisp. Mouse positions convert from screen to world through the camera.
- **Rendering:** the ground is drawn from pre-rendered 32 by 32 tile chunks on offscreen canvases, and objects are drawn only inside the viewport, sorted by anchor Y.
- **Collision:** the player is a circle of radius 8 pixels. Water, rock faces, city walls, tree trunks and rubble block movement, and axes resolve separately so the player slides along walls.
- **Fog of war:** unexplored areas are drawn dark. Walking reveals a 10 tile radius. Exploration is stored as a bitmask per 4 by 4 tile cell, and a minimap in the top right shows the revealed map and discovered landmarks.
- **Enemies:** overworld enemies come from dens and ambient spawns, only within two chunks of the player, and despawn when far away. Each enemy type lists its biomes in `enemies.json`.
- **Building:** placement snaps to the tile grid, cannot overlap blocking tiles or objects, and must be within 6 tiles of the player.
- **Day and night:** a later milestone adds a tint overlay and more wolves at night. The existing day counter and clock stay as they are.
- **Seed:** new games take a random seed, or one the player types in the New Game dialog.

### Save format change

The world is regenerated from its seed on load, so the save stores only the seed and what changed: depleted nodes, cleared dens, discovered landmarks, the fog bitmask, buildings and the player. Enemies are not saved. The save version goes from 1 to 2. The migration cannot convert the old single-screen map, so it keeps the roster, bonds, tech, Knowledge, inventory, armory and mission log and generates a new world.

## Data files

All content moves out of `config.js` into JSON files, one per concept. Logic reads them through a small loader, and `npm run check:data` fails the build if any id is misspelled or missing.

| File in `src/data/` | Holds | From prototype config |
| --- | --- | --- |
| `world.json` | Map size, spawn zone, city prefab, ring radii, landmark counts, seed rules | new |
| `biomes.json` | Per zone: ground tileset, tree, bush and rock density, ambient enemies | new |
| `landmarks.json` | Landmark types, counts, discovery rewards, repeatable effects | new |
| `resources.json` | Gatherable nodes: sprite, yield, amount, respawn, collision | `RESOURCE_TYPES` |
| `materials.json` | Inventory items: label, fallback icon, whether the resource bar always shows it, starting amount | `INVENTORY_DEFAULTS`, `RES_LABEL`, `CORE_RES`, `RES_ICON_FALLBACK` |
| `nexus.json` | The Nexus: position, dig steps and cost, Awareness needed and cap, what awakening grants | `NEXUS` |
| `game.json` | Overworld and clock constants: player speed and vitals, gather range, day length, Knowledge, hunger and eating rules, autosave interval | `CANVAS_*`, `PLAYER_SPEED`, `GATHER_RANGE`, constants in `world.js` and `state.js` |
| `tech.json` | Technologies: cost, arcane cost, extra materials, prerequisites, Nexus requirement | `TECH` |
| `recipes.json`, `items.json` | Craftable items and gear stats | `RECIPES`, `ITEMS` |
| `buildings.json` | Placeable buildings and their timers | `BUILDINGS` |
| `classes.json`, `traits.json`, `talents.json`, `backgrounds.json` | Character content and growth tables | `CLASSES`, `TRAITS`, `TALENTS`, `TALENT_TABLES`, `BACKGROUNDS` |
| `tiers.json`, `bonds.json`, `names.json` | Recruit tiers and budgets, bond tiers, name lists | `TIERS`, `BOND_TIERS`, `FIRST_NAMES`, `SURNAMES` |
| `starter_roster.json` | The four hand-authored opening characters | `STARTER_ROSTER` |
| `enemies.json` | Overworld stats and expedition Threat Rating per enemy | `ENEMIES`, wolf constants |
| `mission.json` | Mission rule constants: injury and death base, loss multipliers, grief, retreat options, XP | `MISSION` |
| `realms/verdant_wilds.json` | One file per realm: zones, steps, encounter tables, resources, unlock rules | `REALMS` |

Milestones M9 to M11 add `vectors.json`, `forms.json`, `knowledge_tiers.json`, `specializations.json` and `growth_tables.json` (the Vector, Form and talent tables), and two logic modules, `systems/growth.js` and `systems/magic.js`. See the Axiom Magic and character abilities section.

Example entries showing the new shapes:

```json
// world.json
{
  "tileSize": 32, "size": { "w": 160, "h": 112 }, "chunk": 32,
  "spawn": { "zone": "mossgate" },
  "city": { "prefab": "old_city", "center": [80, 56], "size": [48, 36] },
  "rings": [ { "zone": "outskirts", "to": 0.6 }, { "zone": "deep_forest", "to": 0.97 } ],
  "seal": { "from": 0.97 }
}

// biomes.json
"outskirts": {
  "ground": "forest_floor",
  "density": { "tree_pine": 0.10, "bush": 0.02, "berrybush": 0.01, "rock": 0.01 },
  "enemies": [ { "id": "wolf", "weight": 100 } ],
  "ambient": { "max": 2 }
}

// landmarks.json
"standing_stones": {
  "sprite": "lm_standing_stones", "count": 3,
  "zones": ["outskirts", "deep_forest"], "minSpacing": 30,
  "discover": { "kp": 6 },
  "effect": { "shrineAwarenessMul": 2, "radius": 6 }
}

// enemies.json
"wolf": {
  "overworld": { "hp": 8, "dmg": 2, "speed": 1.4, "aggro": 120, "leash": 260,
                 "drops": { "fiber": 1, "food": 1, "hide": 1 } },
  "sprite": "wolf"
}
```

**Conventions**

- Ids are `snake_case` and unique within their file. Files refer to each other by id only.
- Every `sprite` value must exist as a key in `public/assets/manifest.json`, or the checker warns and the placeholder is used.
- Positions in `world.json` are in tiles. Radii in `rings` are fractions of the distance from the map center to its edge, measured on an ellipse, so rings follow the map's shape.
- Unknown fields are kept and ignored, so you can add notes or future fields without breaking anything.
- Later, a `public/mods/<name>/data/` folder can overlay these files by deep merge. Design the loader so that is a small change, but do not build it yet.

## Systems reference

These are the rules the game implements, written so the code can be checked against them. Numbers live in the data files; the names in backticks are their keys. The tests in the last section should assert all of this. M1 ported the beta's rules exactly (git tag `beta-port`); M9 replaced the synergy, bond, growth, gathering and hunting rules with the full design below, and each replaced rule says so.

### Mission math

```latex
CP = 4 \cdot Level + 1.5 \cdot (Stat_1 + Stat_2) + Gear + Skill + Arcane
SP = \left(\sum CP\right)\left(1 + Synergy\right)
P_{win} = \frac{SP}{SP + ETR}
Closeness = \max\left(0.1,\ 1 - 2\,\lvert P_{win} - 0.5\rvert\right)
P_{injury} = Closeness \cdot 0.35 \cdot (1 - ConMod) \cdot (1 - ArmorMod)
```

- **Combat Power inputs:** Stat 1 and 2 are the class's two primary stats, with trait bonuses added to CON and PER. Skill is the class skill for the objective plus the `cp` effect of all traits and talents plus the objective's own effect (`exploreCp`, `huntCp`, `gatherCp`), plus 2 per point of proficiency the character has in that objective (M9). A talent's effects scale with its rank (see XP and growth). Arcane is the class base, plus trait and talent arcane, plus floor((INT + WIL) / 3) for mage classes. Grief multiplies Combat Power by 0.85.
- **Matchups:** for each Vector a character carries, +4 Combat Power against an enemy weak to it and -3 against one that resists it. A character wounded earlier in the same mission fights at 0.8.
- **Squad Power floor:** after matchups and the wounded multiplier, each member contributes at least 1 Combat Power to the sum.
- **Synergy (M9):** team chemistry plus composition. Team chemistry is the sum of every pair's bond tier modifier divided by the number of pairs. Composition adds +0.10 when the squad has a front-liner (`front`) and a back-liner (`back`), +0.08 when it has a support (`support`), -0.15 when it has a caster (`caster`) but no front-liner, and +0.03 for a Natural Leader (one per squad counts). Clamped to -0.4 through +0.6. Trait pairs no longer add to synergy; they shape how bonds grow. Only the `support` role counts as a support; a mage is a caster.
- **Injury:** ConMod is min(0.3, max(0, (CON - 5) x 0.03)). Trait injury multipliers apply. A lost fight multiplies by 1.6. Capped at 0.9.
- **Death, given an injury:** 0.2 x the zone's `deathScale` x talent multipliers. A lost fight multiplies by 1.5, a living support character by 0.6, and an already-wounded character by 2. Capped at 0.9. The talent multipliers are the character's own `deathMul` (Second Wind) times the `squadDeathMul` (Field Medic) of every member still standing in that fight, the character included.
- **Vigor:** starts at 100. A won fight costs 8, a lost fight 25, a quiet step 3. When vigor is at or below the chosen threshold (25, 35, 50 or 70) before the last step, the squad retreats. A Hunt mission's last step is a fight with the zone's quarry, and losing it ends the mission as a retreat. The quarry is the first enemy in the zone's `hunt` list, and the Hall's preview uses the same one.
- **Hunt locate check (M9):** before the quarry fight, the squad must find it. P_locate = min(0.95, 0.35 + 0.05 x the highest effective PER in the squad + 0.05 x the best hunt proficiency). The squad gets 3 attempts; each failed attempt costs 6 vigor. If every attempt fails, or vigor falls to the threshold while searching, the mission ends as a retreat without the fight.
- **Encounters:** each non-final step is an encounter with probability `encounterChance` times every member's `encounterMul`, with the enemy drawn by weight from the zone.

### Rewards and aftermath

- **Resources (M9):** every completed step yields each zone resource at base x a random 0.6 to 1.4 x (1 + total yield bonus) x PerceptionMod, rounded at random. PerceptionMod = 1 + 0.04 x (the squad's average effective PER - 6), clamped to 0.8 through 1.4. Gather missions use the full amount and other objectives 30%. Enemy drops roll on every won fight.
- **Exploration:** an Explore mission adds 40 percentage points to the zone, scaled by the share of steps completed. Other objectives add 10. A zone opens when the previous zone is at 60% or more.
- **Arcane Knowledge and Renown:** Explore missions pay `exploreArcane` x the share completed, at least 1 on success. Renown is the zone value x share completed, halved when the mission does not fully succeed, times the `renownMul` (Silver-Tongued) of every surviving member, rounded. A wiped squad earns no exploration, Arcane Knowledge or Renown.
- **Boss:** the first kill of a zone's boss grants its Knowledge Fragment once.
- **Costs and time:** 1 Expedition Supply per squad member. A mission advances the clock by a quarter day.
- **Injury and death:** a wounded survivor is unavailable until day + 2 on success or day + 3 otherwise. A dead character moves to the memorial, their bonds are deleted, and their gear returns to the armory. Every squad member's existing grief counts down by one mission before new grief is applied.
- **Witnessed Death (M9):** every survivor of a mission in which someone died grieves (unless Stoic) for the next 2 missions, or 3 if their bond with the dead was 41 or more. The survivors of that mission each gain +10 bond with each other, once per mission. Grief multiplies Combat Power by 0.85.
- **Bonds (M9):** after a mission each surviving pair gains round(BaseGain x TraitCompat x Outcome), clamped to -100 through +100. BaseGain comes from the mission's Closeness, the highest Closeness of any fight in it (0 if there was no fight): under 0.3 gives 3, 0.3 to 0.6 gives 6, 0.6 to 0.85 gives 10, and over 0.85 gives 18. TraitCompat is 0.7 if the pair has any clashing trait pair, else 1.25 if it has a synergizing pair, else 1. Outcome is 1 on success and 0.6 otherwise. A death applies Witnessed Death on top.
- **Bond decay (M9):** at each dawn, a pair that has not shared a mission for 10 or more days moves 1 point toward 0, once every 10 days. Bonds of 86 or more never decay. A pair's clock starts when they meet.
- **Life Debt (M9):** when a wounded member's death roll falls between their death chance with and without another member's help (that member's Field Medic, or a living support), the helper saved them. The pair gains +30 bond and a `life_debt` flag, and the saved character's next growth roll weights Protective talents x3.
- **Mentor and Romance (M9):** a pair with a level gap of 15 or more, 3 or more shared missions and a bond of 41 or more becomes mentor and apprentice; the apprentice's growth rolls weight talents the mentor knows x1.5. A pair at 66 or more with no clashing traits gains a `romance` flag. Both flags are recorded in each character's history.
- **XP and growth (M9):** XP is 14 x the share completed, plus the enemy XP of every fight won, plus 10 on success, times the character's XP multiplier. Level n needs 20 x n XP, to level 20. Each level adds 2 stat points, weighted 3 to 1 toward primary stats and capped at 15. Then the growth rolls: a Primary roll every level, a Secondary roll on even levels, and a Breakthrough on every 5th level.
- **Growth rolls (M9):** a Primary or Secondary roll draws from the class's talent table over all of its talents. An unknown talent is learned at rank 1; a known talent below rank 3 gains a rank; a talent already at rank 3 becomes +1 proficiency instead (in the objective its effect favors, else the character's most-run objective). Talents not yet known get +1% weight for each 2 points of INT above 10. Pity: if a character has learned no new talent in their last 3 levels, the next roll draws only from talents they do not know, still by weight. A Breakthrough gives +1 proficiency in the character's most-run objective (casters change this in M10). A talent at rank r adds its `perRank` effects r - 1 times: added for bonuses, multiplied for multipliers.

### Characters

- **Recruits:** tier is drawn 70 / 25 / 5 for Common, Uncommon and Rare. Stats start at 3 and receive 24, 32 or 42 points, capped at 14, weighted toward the class's primary stats and the background's nudge. Traits number 1, 2 or 3, and each is drawn from a pool that is 70% common, 27% uncommon and 3% notable regardless of tier, so rarity gives more stats and traits, not a better chance at the best ones. Clashing traits are rerolled.
- **Cost and limits:** recruits cost 6, 12 or 24 food. The roster holds 8. One candidate is offered per day once the Nexus is awake.
- **Gear:** each character has a weapon and an armor slot. Crafted items go to a shared armory and are equipped from the Roster.

### Nexus and time

- **Digging:** needs Foundation Engineering and 3 digs of 4 stone and 2 wood each.
- **Awakening:** once excavated, each Shrine adds 1 Awareness every 180 frames. At 40 Awareness the Nexus wakes and grants 4 Expedition Supplies and 10 Renown. Elemental Attunement needs the awake Nexus, 25 Knowledge, 8 Arcane Knowledge and 3 Mana Crystals.
- **Clock:** a day is 3,600 frames. Passive Knowledge is +1 per 90 frames. Hunger falls 1 per 200 frames, and the player eats automatically below 40. If the player's health reaches zero they wake at the center of the map at half health, and nothing is lost. A frame is one fixed 1/60 second simulation step, whatever the display's refresh rate.
- **Autosave:** every 900 frames and when the page closes, plus manual save, export and import.

## Axiom Magic and character abilities

The Systems reference above is what the beta does. This section is the full design it was simplified from: the Vector idea, how characters gain abilities, and the complete bond rules. Claude Code builds the beta rules first (M1), then replaces them with these in M9 and M10. Until a milestone replaces a rule, the Systems reference wins.

### Where the beta differs from the full design

| Area | Beta (built) | Full design (to build) | Milestone |
| --- | --- | --- | --- |
| Spells | A mage has one fixed Vector and gets +4 or -3 Combat Power against weak or resistant enemies | Spells are Vector + Form + Magnitude, and Combat Power adds a repertoire bonus | M10 |
| Casting cost | None | Focus Points, with an Instability check on big casts | M10 |
| Level-up | 2 stat points, then a 55% talent roll with pity after 3 dry levels | Primary roll every level, Secondary on even levels, Breakthrough on every 5th, pity after 3 dry levels | M9 (built) |
| Squad synergy | Bond average plus 0.03 flags, trait pairs add or subtract 0.03 | Bond average plus composition rules (front and back +10%, support +8%, casters without a front-liner -15%) | M9 (built) |
| Bond gain | +3 after a success, +1 after a retreat | Scaled by how close the fight was, trait compatibility and outcome, with decay and special events | M9 (built) |
| Gathering and hunting | Fixed share per step, last step is the fight | Perception scales yield, and hunts need a locate check before the fight | M9 (built) |
| Character sheet | One card per character in the Roster | Four tabs: Overview, Growth, Bonds, History | M9 (built) |

### The Vector idea

Every spell is three choices. A **Vector** is what kind of force it is, a **Form** is the shape it takes, and a **Magnitude** is how big it is. Characters do not pick spells from a menu. They learn Vectors and Forms through weighted rolls as they level, so two mages of the same class end up different.

| Part | Values | Notes |
| --- | --- | --- |
| Vector | Tier 1: Heat, Cold, Force, Motion. Tier 2: Binding, Light. Tier 3: Transmutation, Vitality, Corrosion | The old Fire, Water, Earth and Air are the first four Vectors renamed |
| Form | Tier 1: Bolt, Burst, Shield, Weapon Infusion. Tier 2 opens Line, Sphere, Projectile, Touch, Aura, Construct, Glyph | The set lives in `forms.json` |
| Magnitude | Minor 5, Standard 10, Major 20, Grand 35 | The number is the Magnitude value used in Combat Power. Knowledge Tier caps the highest Magnitude a character can use |
| Focus Points (FP) | A per-character pool that scales with level, WIL and INT | Casting spends FP. Rest refills it. A short rest (Meditation) lets a caster retune which Vector and Form loadout their FP is set to |

**Knowledge Tiers are the game's eras.** Tier 1 Runic Literacy is the first four Vectors. Tier 2 Vector Dynamics adds Magnitude scaling, Instability, Binding and Light, and the specializations. Tier 3 Conservation Axioms adds Transmutation, Vitality and Corrosion, plus fuel-powered Grand effects. Tier 4 Dimensional Calculus adds teleportation and Realm-anchor magic. Tier 5 Grand Unification is true reality rewriting, and it is how the Ascension Engine breaks the Overworld's seal. Refined Mana is not spent on casting. It fuels lasting things: enchantments, reactors and rituals.

**Vector matchups** give the mission simulator something to reason about and give players a reason to mix Vectors in a squad:

| Vector | Strong against | Weak against |
| --- | --- | --- |
| Heat | Binding, organic armor | Cold-resistant and aquatic enemies |
| Cold | Fast and agile enemies | Heat-resistant and fire enemies |
| Force | Armored and constructed enemies | Agile and evasive enemies |
| Motion | Evasive enemies | Armored and heavy enemies |
| Binding | Beasts and swarms | Constructs, Corrosion users |
| Light | Undead, shadow-aligned and stealthed enemies | Few resistances at this tier |

**Combat Power gets a repertoire bonus** once spells exist:

```latex
CP = 4 \cdot Level + 1.5 \cdot (Stat_1 + Stat_2) + Gear + Skill + Repertoire
Repertoire = \sum_{spell} MagnitudeValue \cdot Matchup, \quad Matchup \in \{1.5, 1.0, 0.6\}
```

The matchup multiplier is 1.5 against an enemy the Vector is strong against, 1.0 if neutral and 0.6 if weak. Enemy data lists the Vectors it is strong or weak to.

### Instability

A cast that costs more than 50% of the caster's current FP triggers a Stability Check. Autonomous casters decide to risk it by weighing it against their current win probability, so a caster who is losing badly will gamble and one who is comfortably ahead will not. The result folds into that encounter's Squad Power.

```latex
StabilityRoll = d20 + INTmod + 2 \cdot KnowledgeTier
DC = 10 + \operatorname{round}\left(\frac{FPspent\% - 50}{2}\right)
```

| Failed the DC by | Result |
| --- | --- |
| 1 to 3 | Reduced Effect: Magnitude down 30% |
| 4 to 6 | Misfire: the spell fails and the FP is still spent |
| 7 to 9 | Backlash: the caster takes damage equal to the FP spent |
| 10 or more | Wild Surge: a random Vector and Form at Minor Magnitude, centered on the caster. It can help or hurt, and it is the one place randomness is meant to be good |

### How characters gain abilities

The same roll engine drives casters and non-casters, so adding a class means writing a new weighted table, not new code.

1. **Primary roll, every level.** A caster rolls on the Vector Affinity Table: raise a known Vector or unlock a new one. A non-caster rolls on the Talent Table.
2. **Secondary roll, every even level.** A caster rolls on the Form Affinity Table. A non-caster rolls the Talent Table again.
3. **Breakthrough, every 5th level.** Unlocks the next Magnitude for the character's most-used Vector and Form pair. This is not random. It follows which spells the character cast most in expeditions, so characters specialize in what they are used for.
4. **Pity.** If a character has gained no new talent or Vector in the last 3 levels, the next roll is guaranteed to unlock something new. Which one is still weighted.
5. **Duplicates.** A talent rolled again beyond a sensible cap (about 3) becomes a proficiency increase in that talent instead of being wasted.

| Base mage Vector table | Weight |
| --- | --- |
| Heat | 20% |
| Cold | 20% |
| Force | 15% |
| Motion | 15% |
| Binding | 15% |
| Light | 15% |

**Stat and trait influence on rolls:** each 2 points of INT above 10 adds 1% weight toward new or rare outcomes. WIL does not change the roll but lowers future Instability DC. *Mana Sensitive* adds 10% to the chance of a new unlock on Vector rolls. *Arcane Affinity* gives +1 max FP per level.

**Specializations** are real evolutions of existing classes, unlocked with Knowledge Tier 2. They add modifiers to the base table, which is then renormalized.

| Specialization | Evolves from | Roll modifiers | Hook |
| --- | --- | --- | --- |
| Runeforger | Enchanter | Binding +15%, Light +10% | Cheaper Refined Mana for enchantments, can build permanent Glyph items |
| Alchemical Theorist | Alchemist | Cold +10%, Force +10% | Pre-casts a spell into a potion anyone can use without FP |
| Kinetic Logician | Mage | Force +15%, Motion +15% | Spends a reaction to redirect an incoming Force or Motion attack |
| Contemplative Axiom Monk | Shaman or Mage | Light +15% | Flat FP cost reduction, flat -20% Instability DC, auto-succeeds low-DC checks |

Other evolutions: Knight from Warrior (Iron Working and surviving an expedition), Pathfinder from Scout (first successful Realm 1 expedition), Enchanter from Toolmaker. Non-caster talent tables for Knight and Artificer are in `growth_tables.json` and follow the same shape as the beta's tables.

### Bonds, in full

Every pair of characters who have shared a mission has a Bond Value from -100 to +100. The tier names and synergy modifiers are the ones already in `bonds.json`. A pair at Blood Feud will refuse to deploy together without a Commander override.

```latex
\Delta BV = BaseGain(Closeness) \cdot TraitCompat \cdot Outcome
```

| Input | Values |
| --- | --- |
| BaseGain by Closeness | Under 0.3: +3. 0.3 to 0.6: +6. 0.6 to 0.85: +10. Over 0.85 with both surviving: +18 |
| TraitCompat | Synergizing traits x1.25, neutral x1.0, clashing x0.7 |
| Outcome | Success x1.0, failed with both surviving x0.6. A death replaces this formula (see events) |
| Decay | After 10 or more days without a shared mission, 1 point toward 0 per 10 days. Bonds of 86 or more never decay |

Team chemistry in Squad Power is the sum of every pair's tier modifier divided by the number of pairs.

**Special events** bypass the formula:

- **Life Debt:** if one character's action stops another from dying (Second Wind, a redirect, a heal), the pair gets +30 BV and a `life_debt` flag. The saved character's next Growth Roll may lean toward a Loyal or Protective talent.
- **Witnessed Death:** a squadmate who sees another die gets Grief (a stat penalty for the next 2 to 3 missions), and survivors of that mission get a one-time +10 BV with each other. If a Commander's live order caused the fatal risk, survivors get -15 BV with that Commander.
- **Mentor and Apprentice:** a character 15 or more levels above another and paired with them for 3 or more missions becomes a mentor once the pair reaches Trusted. The apprentice's roll weights shift slightly toward the mentor's strongest Vectors and talents.
- **Romantic Bond:** between Close Bond pairs with no conflicting trait. Flavor and relationship log only for now, as the seed of a later families system.

### Character record and sheet

The record below is the target shape. The beta stores a subset (`cls`, `bg`, `vectors`, `injuredUntil`, `grief`, `pity` and the rest of what the prototype's `characters.js` builds), and the M9 and M10 migration fills in the new fields.

```json
{
  "id": "char_0031", "seed": "a91f-0031", "name": "Kael", "epithet": null,
  "tier": "uncommon", "origin": "overworld_village", "background": "hunter",
  "class": "hunter", "specialization": null, "level": 6, "xp": 14, "commander": false,
  "stats": { "str": 5, "con": 8, "dex": 12, "int": 4, "per": 11, "wil": 3 },
  "traits": ["brave", "keen_eyed"], "talents": ["keen_tracking"],
  "skills": { "tracking": 9 },
  "knowledge": { "vectors": { "motion": 8, "force": 5 }, "forms": { "projectile": 6 },
                 "pairUses": { "motion+projectile": 12 } },
  "fp": { "max": 30, "current": 30 },
  "gear": { "weapon": null, "armor": null },
  "status": { "injuredUntil": 0, "grief": 0 },
  "history": [ { "day": 88, "event": "first_expedition", "zone": "fringe" } ],
  "generatedAtStepLog": { "background": "hunter (25%)", "traits": ["brave (common)", "keen_eyed (uncommon)"] }
}
```

The character sheet has four tabs. **Overview** shows stats, traits, top skills, gear and status. **Growth** shows Knowledge Tier, Vector and Form bars, the next Breakthrough with a progress bar fed by `pairUses`, and recent level-ups. **Bonds** lists every squadmate with tier, value, missions shared and flags, with filled dots for positive bonds and hollow for negative. **History** lists recruitment, first expedition, deaths witnessed, life debts and bond milestones, assembled automatically from events.

### Values the design leaves open

These are not specified anywhere yet. Claude Code should put them in data files and tune them with `npm run sim`, starting from these proposed defaults.

| Value | Proposed default |
| --- | --- |
| FP pool | 5 + 2 x level + WIL + INT, plus 1 per level with Arcane Affinity |
| FP cost of a cast | The Magnitude value: 5, 10, 20 or 35 |
| Highest Magnitude by Knowledge Tier | Tier 1 Standard, Tier 2 Major, Tier 3 and up Grand |
| INT modifier | floor((INT - 10) / 2), as in the tabletop game |
| Spells that count in Repertoire | Only the character's equipped loadout of 3, so a big spellbook is not a runaway bonus |
| Proficiency (M9, chosen) | +2 Combat Power per point in that objective. Breakthroughs and talents past rank 3 grant it |
| Talent ranks (M9, chosen) | Up to 3. Each talent's `perRank` in `talents.json` says what a rank adds |
| Perception and locate (M9, chosen) | PerceptionMod 1 + 0.04 x (average PER - 6), clamped 0.8 to 1.4. P_locate 0.35 + 0.05 x best PER + 0.05 x hunt proficiency, at most 0.95, 3 tries at 6 vigor each |
| Grief length (M9, chosen) | 2 missions, or 3 if the bond with the dead was 41 or more |
| Protective talent (M9, added) | Guardian: squadmates' deaths 10% less likely. Life Debt leans the saved character's next roll toward it |

## Recruitment and the Expedition Hall

The Nexus is also how new people reach your settlement. Recruitment is the game's lore-framed gacha: there is no currency purchase and no random pack. Wandering recruits arrive because your Renown is high, and the Expedition Hall is where you meet them, equip them and send them out. I took "summon hall" to mean this pair of ideas; if you meant something different, comment on this section and I will rewrite it.

### Recruitment

- **Rarity is about origin and potential, not power.** A Common recruit has the same stat ceiling over a career as a Rare one. What differs is the starting position and the number of traits. Every trait roll for every tier has the same 3% chance of a Notable trait (Mana Sensitive, Dragon Blood, Genius, Prodigy), so a Common farmer with Dragon Blood is rare but possible.
- **Sources.** Overworld Village recruits come from Renown. Realm Embassy and Realm Colony recruits come from the diplomacy pipeline in the master doc, with faction-specific backgrounds. Only the village source exists until diplomacy is built.
- **Pipeline.** Seven steps, each seeded and logged so a character can be reproduced and any step can be overridden by a mod: tier, origin and background, base stats, starting class, traits, name, then the recruitment card.
- **Stats.** Keep the beta's allocation, where stats start at 3 and the tier's points (24, 32 or 42) are spent in full. This keeps the promise that tier sets total power in one place. Do not add the design doc's random per-stat variance, which would break that guarantee.
- **The first four characters are hand-authored** and never generated, so the opening is fair. Generation takes over from the first arrival.

**The recruitment card** shows the tier, name, class and origin, the six stats, traits, skills, a one-line flavor text, and the cost with Recruit and Dismiss buttons. The flavor line is assembled from a template using the background and the highest-rarity trait, so content cost stays flat however many recruits exist.

| Part | Beta (built) | Full design (to build in M11) |
| --- | --- | --- |
| Cost | 6, 12 or 24 food by tier | Renown. The design shows an Uncommon costing 40 Renown, so propose 20, 40 and 80 for Common, Uncommon and Rare |
| Arrival | A new candidate each dawn, replaced if not recruited | One candidate waits at the Hall. Each dawn with none waiting, an arrival chance of min(0.9, 0.25 + Renown / 200) |
| Dismiss | Not available | Dismiss sends them away, and the next arrival rolls on the next dawn |
| Tier odds | Fixed 70 / 25 / 5 | Renown raises the Uncommon and Rare shares, never past a stated cap, so Common stays the most frequent |
| Origin and background | Four overworld backgrounds | Add origin to the record and the faction backgrounds once diplomacy exists |
| Epithets | None | Earned later in play (first notable trait, first realm boss kill), never rolled at generation |

### Expedition Hall

The Hall opens when the Nexus awakens and is where squads are recruited, equipped and organized. The beta Hall already does the core job: choose a realm and zone, an objective (Explore, Gather or Hunt), a retreat threshold and 2 to 4 healthy characters, see squad Combat Power, synergy and odds, launch, and read a report.

**To build after M8:**

- **Chemistry preview.** Selecting a squad shows each pair's bond tier and the team chemistry bonus before launch. A pair at Blood Feud is shown as unable to deploy together unless a Commander overrides it.
- **Saved squads.** Name a squad and reuse it, so veterans who have bonded stay together by choice. Breaking up a long-running squad is a real trade-off, not a free action.
- **Missions that take time.** A mission runs over game hours with a return time, the squad is away until then, and reports queue in the Hall in the order they finish. Several squads can be out at once. This is also what makes Explore and Hunt use time-based rules (Perception drives map revealed per hour, and hunts begin with a locate check).
- **Better reports.** The event feed is grouped by step, level-ups appear as cards showing the talent and a one-line description, and deaths link to the memorial.
- **Equipment and character sheet access** from the Hall, so a squad can be built in one place.

**Out of scope for this spec:** live tactical control, the War Room and Commanders. The master doc covers them. They change the inputs to the same mission math and do not replace it.

## Build order

Claude Code should build these milestones in order and stop after each one: run the tests, commit, and ask you to play it. The order puts the logic port first, because the missions and characters are the part that already works and must not change, and the world second, because it is the biggest change.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Scaffold: Vite project, folders from the Project structure section, ESLint, Prettier, Vitest, `CLAUDE.md` | `npm run dev`, `build`, `test` and `lint` all run, and the page shows an empty canvas |
| M1 | Port the logic without changing behavior: ES modules, JSON data files, seeded RNG, event bus, characters, missions, tech, crafting, v1 save | Tests assert the Systems reference. `npm run sim` reproduces the prototype win rates within 3 points: for a fresh starter squad (all four starters, 35% retreat), Fringe Explore about 99.6%, Warrens Hunt about 44%, Old Grove Hunt about 21% (measured from the prototype over 20,000 runs per row; the earlier 99 / 40 / 18 came from 300-run samples). `check:data` passes |
| M2 | Asset pipeline: manifest loader, placeholder fallback, spritesheet animation, `check:assets` | Dropping a sprite sheet at a manifest path animates it with no code change. A missing file never throws. `check:assets` lists what is still a placeholder |
| M3 | World foundation: `world.json`, seeded generation of rings, biomes, forest density and the river, chunked tile rendering, camera, zoom, collision, window resize | The same seed gives the same map (a test). The player crosses the map smoothly at 60 frames per second and cannot pass water, rock, walls or trees |
| M4 | The Old City and start: city prefab, Mossgate spawn, the Nexus in the Sunken Hall, salvage piles and relics, dig and awaken at the new location | A new game starts at Mossgate. The Nexus can be reached, dug and awakened, and the whole Stage 1 loop plays through to the Expedition Hall |
| M5 | Exploration: fog of war, minimap, landmarks and discovery rewards, dens and ambient enemies, springs, caches, road signs | Discovery pays Knowledge once. Fog and discoveries persist across a reload. Clearing a den stops its spawns |
| M6 | Grid building: snapping, validity, range, mouse to world conversion, interaction prompts | Buildings cannot overlap blocked tiles or objects, and each Shrine's Awareness speed doubles near Standing Stones |
| M7 | Save v2 and migration: seed plus changes, v1 import | A save and load round trip matches exactly. A v1 file imports with its roster, tech and inventory and starts a new world |
| M8 | Polish: audio engine, day and night tint, settings (zoom, volume), optional touch controls | Sound plays after the first click, and the settings persist |
| M9 | Character depth: Primary, Secondary and Breakthrough growth rolls with pity after 3 levels, the full bond rules and events, composition synergy, Perception-scaled gathering, hunt locate checks, the four-tab character sheet | Each formula in the Axiom Magic and character abilities section has a test, including bond decay and the Life Debt and Witnessed Death events. All four sheet tabs show real data |
| M10 | Axiom Magic: `vectors.json`, `forms.json`, Magnitude caps by Knowledge Tier, Focus Points, Instability, the repertoire bonus, caster growth tables, specializations, a spell loadout screen | Tests cover the Stability Check and the failure table. `npm run sim` shows how Vector matchups change win rates. A caster's loadout changes their Combat Power in the Hall preview |
| M11 | Recruitment and Hall v2: Renown cost and arrival chance, Dismiss, the recruitment card with flavor text, chemistry preview, saved squads | A Blood Feud pair cannot be added to one squad. Arrival odds rise with Renown but Common stays the most frequent tier in a large sample |
| M12 | Timed missions: duration, several squads out at once, a queue of reports, time-based Explore | A save made mid-mission loads with the squad still out and returns on time. Reports arrive in the order squads return |

Planned after M12, covered in the [Game Master Design Document](https://claude.ai/code/artifact/a9895bb6-fc48-4db7-bce9-b1712485a348): Realm 2, the invention minigame loop, diplomacy, live tactical control and the Ascension Engine.

## Tests, tools and the first prompt

The tests protect the parts that took the most tuning, the mission math and the save format, so Claude Code can change everything else freely.

| Test or tool | What it checks |
| --- | --- |
| `tests/missions.test.js` | Each formula in the Systems reference with fixed inputs and a seeded RNG, including every multiplier and cap |
| `tests/characters.test.js` | Recruit stat totals equal 18 plus the tier budget, no clashing trait pairs, level-up gains, the talent pity rule |
| `tests/save.test.js` | Serialize, reset, load and serialize again gives identical JSON. A v1 file migrates. A bad file is rejected with a message |
| `tests/worldgen.test.js` | Same seed gives the same map. Spawn and the Nexus are reachable by walking. Landmark counts and spacing match `landmarks.json` |
| `tools/sim.js` | Runs 300 missions per zone and objective for a fresh starter squad and prints the win, retreat, wipe and death rates, plus a greedy-player campaign to the first boss kill |
| `tools/check-data.js` | Every id referenced in one JSON file exists in another |
| `tools/check-assets.js` | Every manifest entry and every sprite named in the data has a file, and lists what is missing |

The prototype's balance targets, for `sim.js` to reproduce after M1: a greedy player kills the Grove Warden in about 15 expeditions and loses 1 to 5 characters on the way.

### CLAUDE.md for the repo

Paste this into `CLAUDE.md` at the repo root.

```markdown
# Nexus Project

A browser game: Minecraft-style building, Factorio-style tech, Civilization-style growth, and
Pick Me Up-style autonomous expedition squads. Read docs/SPEC.md before changing anything.

## Stack
Vite, vanilla JavaScript (ES modules), Canvas 2D, JSON data, Vitest. No UI framework.

## Commands
npm run dev | build | test | lint | sim | check:data | check:assets

## Rules
- Content lives in src/data/*.json. Logic files never name a resource, enemy, trait or zone.
- All randomness comes from src/core/rng.js. Never call Math.random in game code.
- All art goes through public/assets/manifest.json. A missing file draws a placeholder; never throw.
- GameState is one plain serializable object. Changing its shape needs a save version bump and a migration.
- Only src/render and src/ui touch the DOM or canvas. src/systems and src/world are pure logic.
- Mission math must match the Systems reference in docs/SPEC.md. Change the doc first, then the code and tests.
- Design pillars: permadeath is real; rarity gives more stats and traits, never a better chance at the best traits.
- Build one milestone at a time (docs/SPEC.md, Build order). After each: tests pass, commit, summarize, stop.
- Do not add features outside the current milestone.
```

### First prompt for Claude Code

```text
Read docs/SPEC.md fully, then read the reference prototype in ./reference (the unzipped
nexus_project_beta folder). Start with milestone M0 and then M1 only. Do not start M2 until I
have run the game and said so. Ask me before changing any rule in the Systems reference. When M1
is done, run npm run sim and show me the win-rate table next to the prototype's targets.
```

Put the unzipped prototype in a `reference/` folder and add it to `.gitignore` or keep it, as you prefer. Your own art goes in `public/assets/` following the checklist, at any point, because placeholders cover everything that is missing.
