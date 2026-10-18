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
