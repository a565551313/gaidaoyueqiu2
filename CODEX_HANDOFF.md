# Codex Handoff

- Phase: vertical slice / presentation overhaul
- Player outcome: enter the game through an immersive world screen, understand the next action, and keep navigation consistent with an arcade-style game.
- Latest work: completed the shared Aetherfall Command visual pass across menu surfaces. Global tokens now unify dark-space panels, cyan energy accents, gold mission highlights, cut-corner terminal geometry, scanline texture, responsive widths, touch targets, and card/button states. Menu, level, shop, skills, leaderboard, prep, and gameplay surfaces inherit the same language. Audio now exposes `setScene()` and refreshes battle scheduling immediately when intensity changes.
- Important files: `src/components/MainMenu.vue`, `src/components/GameView.vue`, `src/components/HeroArt.vue`, `src/style.css`, `src/core/audio.js`, `src/core/gameEngine.js`, `public/assets/art/`, `public/assets/sprites/`, `ASSET_LICENSES.md`, `public/assets/audio/`.
- Verification: Vite dev server is running at `http://127.0.0.1:5175/`; browser accessibility tree and screenshot confirm the redesigned main menu renders without overlap at a mobile viewport. `git diff --check` remains the next static check. Production build is currently blocked by the local pnpm policy rejecting the ignored `esbuild` install script.
- Current risks: the legacy enemy drawing/update helpers remain in `gameEngine.js` but are no longer called; high-floor/weather playtesting is still useful for balance tuning; full production build needs the workspace package manager to allow the existing esbuild script.
- Next safest task: run the menu-to-game flow at 720x1280 and desktop width, then perform a final visual pass on the battle HUD and result modal.
