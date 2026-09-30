# Codex Handoff

- Phase: UI redesign / polish
- Player outcome: enter the game through an immersive world screen, understand the next action, and keep navigation consistent with an arcade-style game.
- Latest work: strengthened the home screen's game-lobby identity: challenge mode is now the dominant launch card with a MAIN QUEST label, animated highlight, explicit departure action, daily expedition objective, segmented reward progress, and reward callout; endless/ranked remain subdued locked modes while leaderboard stays a secondary destination. Existing meteor animation, dark theme, version display, volume settings, and local leaderboard remain intact.
- Important files: `src/components/MainMenu.vue`, `src/components/HeroArt.vue`, `src/components/Leaderboard.vue`, `src/components/icons.js`, `src/core/audio.js`, `src/core/storage.js`, `src/core/store.js`, `src/App.vue`.
- Verification: `& .\\node_modules\\.bin\\vite.cmd build` passed on 2026-09-30; `git diff --check` passed; fresh localhost tab confirmed the expedition objective strip, challenge launch card, locked labels, leaderboard entry, utility navigation, and version label.
- Current risks: visual sizing has not been verified against 720x1280, 1080x2400, short-height, or locale expansion profiles; leaderboard is intentionally local preview data until an online service exists.
- Next safest task: run responsive screenshots for 720x1280 and a short-height phone profile, then tune mode-card spacing and settings modal touch targets.
