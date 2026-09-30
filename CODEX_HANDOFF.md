# Codex Handoff

- Phase: vertical slice / presentation overhaul
- Player outcome: enter the game through an immersive world screen, understand the next action, and keep navigation consistent with an arcade-style game.
- Latest work: rebuilt the home screen into an orbital mission-control scene instead of the old card grid. Added local scene, player badge, and mode art under `public/assets/art/`; rebuilt `MainMenu.vue`; overhauled the in-game cockpit HUD; redrew Canvas atmosphere, building details, bird/plane/UFO silhouettes; and rewrote menu/battle music patterns. Existing attack, durability, pause, revive, score, and save flows remain in place.
- Important files: `src/components/MainMenu.vue`, `src/components/GameView.vue`, `src/components/HeroArt.vue`, `src/style.css`, `src/core/audio.js`, `src/core/gameEngine.js`, `public/assets/art/`, `ASSET_LICENSES.md`, `public/assets/audio/`.
- Verification: Vite production build passed on September 30, 2026; `git diff --check` passed. `pnpm run build` was blocked by the runtime's ignored esbuild build-script policy, so the local Vite binary was used directly.
- Current risks: the legacy enemy drawing/update helpers remain in `gameEngine.js` but are no longer called; high-floor/weather playtesting is still useful for balance tuning; UFO continuous absorption and collapse interactions should be observed in a full run.
- Next safest task: launch the dev server and visually/aurally review one menu-to-game run at 720x1280 and desktop width, then tune any remaining overlap or readability issues.
