# Nexus Project

A browser game: Minecraft-style building, Factorio-style tech progression, Civilization-style empire
growth, and Pick Me Up-style autonomous expedition squads. A mysterious Nexus leads to other realms;
the endgame is escaping the sealed Overworld.

This folder is the starting point for rebuilding the game in VS Code with Claude Code.

## What is here

| Path | What it is |
| --- | --- |
| `docs/SPEC.md` | The full rebuild spec: structure, art pipeline, open world, data files, game rules, build order |
| `CLAUDE.md` | Rules Claude Code reads automatically every session |
| `reference/` | The working beta prototype (plain HTML/JS). Open `reference/index.html` in a browser to play it |

## Get started

1. Install Node.js 20 or newer and VS Code.
2. Open this folder in VS Code (`File > Open Folder`).
3. In the VS Code terminal run `claude` (install Claude Code first if you have not: https://docs.claude.com/en/docs/claude-code).
4. Paste this as your first message:

```text
Read docs/SPEC.md fully, then read the reference prototype in ./reference. Start with milestone M0 and
then M1 only. Do not start M2 until I have run the game and said so. Ask me before changing any rule in
the Systems reference. When M1 is done, run npm run sim and show me the win-rate table next to the
prototype's targets.
```

5. After each milestone, run the game (`npm run dev`), play it, then tell Claude Code to continue.

## Adding your own art

Once M2 is done, art goes in `public/assets/` and is listed in `public/assets/manifest.json`.
The checklist of every sprite, tile and sound is in `docs/SPEC.md` under "Art and asset pipeline".
Missing art always shows a placeholder, so you can add files whenever you like.
