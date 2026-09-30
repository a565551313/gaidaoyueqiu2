export const ATTACK_CONFIG = {
  durability: { minWidth: 24, maxWidth: 120, min: 18, max: 46, materialMultiplier: 0.18 },
  schedule: { maxConcurrent: 3, baseInterval: 8.5, minInterval: 3.2, warning: 0.9 },
  bird: { damage: 13, speed: 250, warning: 0.8, radius: 16, unlock: 0.08 },
  ufo: { warning: 1.15, lock: 0.7, absorbMin: 2.6, absorbMax: 5.2, unlock: 0.35, hover: 110 },
  plane: {
    warning: 1.0,
    speed: 180,
    unlock: 0.5,
    widthLoss: { rain: 0.06, hail: 0.12, storm: 0.2 },
    secondMultiplier: 0.45
  }
}

export const MATERIAL_ATTACK_MODIFIERS = {
  soil: { durability: 1, bird: 1, ufo: 1, plane: 1 },
  concrete: { durability: 1.18, bird: 0.92, ufo: 1.08, plane: 0.92 },
  steel: { durability: 1.28, bird: 0.8, ufo: 1.18, plane: 0.82 },
  bronze: { durability: 1.12, bird: 0.88, ufo: 0.86, plane: 1.08 },
  blackgold: { durability: 1.35, bird: 0.75, ufo: 0.72, plane: 0.62 }
}

export function durabilityForWidth(width, materialId = 'soil') {
  const cfg = ATTACK_CONFIG.durability
  const m = MATERIAL_ATTACK_MODIFIERS[materialId] || MATERIAL_ATTACK_MODIFIERS.soil
  const ratio = Math.max(0, Math.min(1, (width - cfg.minWidth) / (cfg.maxWidth - cfg.minWidth)))
  return Math.round((cfg.min + ratio * (cfg.max - cfg.min)) * m.durability)
}
