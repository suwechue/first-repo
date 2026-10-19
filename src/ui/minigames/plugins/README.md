# Crafting minigames

Each file here is one minigame. It is registered automatically by being in this folder, so adding a
minigame needs no other code change.

A file exports one definition:

```js
export default {
  key: 'my_game', // the name recipes and the archetype rules use
  label: 'My Game', // shown above the canvas
  vectorHint: ['heat'], // documentation only
  run(ctx) {
    // play, then call ctx.finish(performance) once, with 0 to 1
    return cleanup; // optional: called if the player closes the minigame early
  },
};
```

`ctx` is described at the top of `../registry.js`. Use `ctx.rand()` for randomness (never
`Math.random`), `ctx.now()` for time, `ctx.schedule(fn)` for the next frame, and `ctx.point(e)` to turn
a mouse event into canvas coordinates.

To make a recipe use it, set `"minigame": "my_game"` on the recipe in `src/data/recipes.json`. To let
Invention pick it, add a rule for it to `archetypeRules` in `src/data/minigames.json`. A rule for a
minigame that is not registered is skipped, so the rule and the file can arrive in either order.

| File | Key | What it tests |
| --- | --- | --- |
| `thermal.js` | `thermal` | Steering a marker to stay inside a drifting band (the simplest; copy it) |
| `precision.js` | `precision` | Timing clicks as a marker sweeps through a zone, 5 passes |
| `alignment.js` | `alignment` | Memorizing and reproducing a symbol sequence |
| `forge.js` | `forge` | Rhythm: hitting each beat as it reaches the anvil |
| `synthesis.js` | `synthesis` | Steering with a limited set of ingredient nudges |
