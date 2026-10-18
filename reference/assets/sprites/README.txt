Drop PNG files with these EXACT filenames in this folder to replace the
built-in placeholder shapes. Nothing else needs to change — config.js
already points at these paths, and the game checks for each file on
startup, falling back automatically to the placeholder art for anything
missing.

Recommended source resolution: draw at 2x-4x the "Draw size" below and let
the browser scale down — it'll look cleaner than drawing at exact size.
Transparent PNG background strongly recommended (these are drawn directly
onto the ground, not in a box).

  filename            draw size (px)   used for
  ----------------------------------------------------------
  player.png          26 x 26          the character you control
  wolf.png             32 x 22          overworld enemy
  tree.png             52 x 52          wood resource node
  rock.png             32 x 26          stone resource node
  bush.png              24 x 24          fiber resource node
  berrybush.png         24 x 24          food resource node
  campfire.png          26 x 26          placeable building
  hut.png                52 x 44          placeable building
  palisade.png            18 x 34          placeable building
  ground.png              (any square,     tiling background texture
                            e.g. 64x64)      (OPTIONAL — a flat color is
                                              used if this is missing)

To change a draw size, edit SPRITE_SIZES in js/config.js — the image will
be scaled to whatever box you set there, regardless of the source file's
actual pixel dimensions.

To ADD a new sprite (e.g. a new resource type or building), you'll add a
matching entry to RESOURCE_TYPES/BUILDINGS, SPRITE_MANIFEST, and
SPRITE_SIZES in js/config.js, and a placeholder-drawing branch in
js/render.js's drawResource()/drawBuilding() for when the art isn't
present yet. Everything else (world.js, ui.js) reads from config.js
automatically and needs no changes.
