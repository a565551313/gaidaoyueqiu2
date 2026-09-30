# Codex Handoff

- Phase: gameplay systems / combat threats
- Player outcome: enter the game through an immersive world screen, understand the next action, and keep navigation consistent with an arcade-style game.
- Latest work: implemented the first vertical slice of the in-game threat system. Added centralized attack/durability config, per-floor durability and damage state, a standalone AttackSystem for visible-layer bird dashes, material-timed UFO absorption, weather-gated plane crashes, target exclusivity, attack warnings, layer health bars, damage flashes/cracks, local collapse, and pause freezing. Existing weather, failure, revive, score, and save flows remain in place.
- Important files: `src/core/attackSystem.js`, `src/data/attacks.js`, `src/core/gameEngine.js`, `src/core/weather.js`, `src/components/GameView.vue`, `src/data/materials.js`.
- Verification: `& .\\node_modules\\.bin\\vite.cmd build` passed on 2026-09-30; `git diff --check` passed; Node smoke test created an engine and verified initial durability; a direct AttackSystem smoke test spawned a bird and reduced a target layer's durability.
- Current risks: the legacy enemy drawing/update helpers remain in `gameEngine.js` but are no longer called; attack rendering uses a lightweight Canvas silhouette and needs extended manual playtesting at higher floors/weather; UFO continuous absorption and collapse interactions need balance tuning.
- Next safest task: play through a high-floor run to observe bird/UFO/plane events under rain, hail, and storm, then tune attack intervals, damage, and collapse readability.
