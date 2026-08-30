# Startup Empire Tycoon — marketing video

A 30-second vertical spot (1080×1920, 30fps) built with [Remotion](https://remotion.dev).
It shows the HQ, Team and Market screens and a run progressing across them.

The whole folder is gitignored (same treatment as `app-store-screenshots/`).

## Why it looks like the app

The screens are not screenshots and not mockups — they are ports of the real
components (`src/components/game/*`, `src/app/(game)/(tabs)/*`) to the DOM,
using the app's own tokens from `src/constants/theme.ts`.

More importantly, the *numbers* are not invented. `src/data/run.json` was
produced by driving the shipped game engine week by week:

```bash
# from the repo root, not from video/
cp video/scripts/generate-run.test.ts src/game/__tests__/__sim-export.test.ts
npx vitest run src/game/__tests__/__sim-export.test.ts
rm src/game/__tests__/__sim-export.test.ts
```

It runs `newGame` → `reduce`/`tick` under a scripted founder policy, sweeps a
few policies and seeds, picks the run with the best arc, and writes a snapshot
per week. Every scene reads that one file (`src/app/run.ts`), which is what
keeps the HUD consistent when the video cuts between tabs — cash, runway, users
and week all belong to the same session.

The run in use: 44 weeks, $250K → $685K valuation, 0 → 969 users, Seed →
Series A → Growth, and a real $1.7M acquisition offer turned down in week 44.

## Working on it

```bash
npm run dev                      # Remotion Studio
npx remotion render StartupTycoon out/startup-tycoon.mp4
npx remotion still StartupTycoon --frame=300 --scale=0.5 out/check.png
```

Compositions: `StartupTycoon` is the full spot; each scene is also registered
on its own under the `Scenes` folder so it can be previewed and trimmed alone.

## Layout

Every phone scene parks the device at the same coordinates (`Stage.tsx`), so
the short cross-fades between scenes read as the *screen* changing rather than
as a cut. Headlines live in a fixed band above the phone.
