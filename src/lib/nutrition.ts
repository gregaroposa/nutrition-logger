type Nutriments = Record<string, any>

export function macrosFromPer100g(n: Nutriments, grams: number) {
  // OFF fields (when available). Fallback converts kJ→kcal.
  const kcal100 =
    n['energy-kcal_100g'] ??
    (typeof n['energy_100g'] === 'number' ? n['energy_100g'] * 0.239006 : null)

  const protein100 = n['proteins_100g'] ?? null
  const carbs100 = n['carbohydrates_100g'] ?? null
  const fat100 = n['fat_100g'] ?? null
  const fiber100 = n['fiber_100g'] ?? null

  const scale = grams / 100
  const round = (v: number | null) => (v == null ? null : Math.round(v * scale))

  return {
    kcal: round(kcal100),
    protein_g: vround(protein100, scale),
    carbs_g: vround(carbs100, scale),
    fat_g: vround(fat100, scale),
    fiber_g: vround(fiber100, scale)
  }
}

function vround(v: number | null, scale: number) {
  if (v == null) return null
  const x = v * scale
  return Math.round(x * 10) / 10
}
