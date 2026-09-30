# Codex Handoff

- Phase: UI redesign / polish
- Player outcome: enter the game through an immersive world screen, understand the next action, and keep navigation consistent with an arcade-style game.
- Latest work: added a five-slot square bottom navigation bar for 角色、背包、宠物、技能、设置 with consistent icon tiles, touch/hover feedback, and a compact translucent dock. 背包 opens the existing shop, 技能 and 设置 keep their existing flows, while 角色/宠物 show an in-game coming-soon toast until those systems exist. After the dock and mode grid were moved upward, the expedition objective strip was also raised above the challenge card with dedicated default, short-height, and desktop offsets so it remains visible.
- Important files: `src/components/MainMenu.vue`, `src/components/HeroArt.vue`, `src/components/Leaderboard.vue`, `src/components/icons.js`, `src/core/audio.js`, `src/core/storage.js`, `src/core/store.js`, `src/App.vue`.
- Verification: `& .\\node_modules\\.bin\\vite.cmd build` passed on 2026-09-30; `git diff --check` passed; fresh localhost tab confirmed the five bottom buttons in order and the mode cards after the spacing adjustment.
- Current risks: visual sizing has not been verified against 720x1280, 1080x2400, short-height, or locale expansion profiles; leaderboard is intentionally local preview data until an online service exists.
- Next safest task: run responsive screenshots for 720x1280 and a short-height phone profile, then tune mode-card spacing and settings modal touch targets.
