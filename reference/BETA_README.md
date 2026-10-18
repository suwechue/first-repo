# The Nexus Project — Beta Prototype

Open `index.html` in a browser (no build step, works from file://).

## Loop
Gather -> research (Knowledge) -> build -> dig out the Nexus (Foundation Engineering) ->
build Shrines to awaken it -> recruit, equip and send squads through the Expedition Hall into the Verdant Wilds ->
open zones, gather realm materials, craft realm gear, kill the Grove Warden for the first Knowledge Fragment.

## Files (load order)
config.js (ALL data) · assets.js · state.js · characters.js (roster/growth/bonds) · missions.js (mission math) ·
world.js (overworld, Nexus) · save.js (autosave + export/import) · ui.js · render.js · main.js

## Moddability
- New realm/zone/enemy: add to REALMS / ENEMIES in config.js. The Hall and resolver pick it up.
- New class/trait/talent: CLASSES / TRAITS / TALENTS / TALENT_TABLES.
- Art: drop PNGs at the paths in SPRITE_MANIFEST / ICON_MANIFEST. Missing art falls back to placeholders.
- Tuning: MISSION (injury/death/grief), TIERS, BOND_TIERS, zone encounterChance/deathScale.

## Not in this beta
Tactical control, spellcasting, the invention minigame loop, diplomacy, Realms 2+, the Ascension Engine.
