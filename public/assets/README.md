# Art goes here

Save a PNG at the path `manifest.json` lists for its key and reload. No code change is needed.
Anything missing draws a placeholder shape, and `npm run check:assets` lists what is still missing.

- **Sprites:** frames of `frameW` by `frameH`. With `"dirs": 4` there is one row per direction in the
  order down, left, right, up. Animations sit side by side in the order the manifest lists them, so
  `idle` (2 frames) then `walk` (4 frames) puts walk in columns 3 to 6. Set `"start"` on an animation
  to name its first column yourself.
- **Resources and caches:** two animations, `full` then `depleted`, one frame each.
- **Anchor:** `[0.5, 1.0]` means the bottom center of the frame stands on the object's position.
- **Tilesets:** one row of 32 by 32 tiles, `variants` of them, picked per tile by position.
- **Icons:** 24 by 24. **Portraits:** 96 by 96, keyed `portrait_<class>` or `portrait_<characterId>`.
- **Audio:** OGG. Sound starts after the first click.
