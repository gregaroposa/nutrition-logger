// src/lib/nutrition.ts
type Maybe = number | null
const num = (v: any): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Prefer per‑100g; fall back to per‑serving using serving grams. */
export function macrosFromPer100g(
  nutriments: Record<string, any>,
  grams: number,
  servingG?: number
) {
  function calc(k100: string, kserv: string): Maybe {
    const v100 = num(nutriments[`${k100}_100g`])
    if (v100 !== null) return (v100 * grams) / 100

    const vserv = num(nutriments[`${kserv}_serving`])
    const sg = servingG ?? num((nutriments as any)['serving_size_g']) ?? null
    if (vserv !== null && sg !== null && sg > 0) return vserv * (grams / sg)

    return null
  }

  return {
    kcal:      calc('energy-kcal', 'energy-kcal'),
    protein_g: calc('proteins',    'proteins'),
    carbs_g:   calc('carbohydrates','carbohydrates'),
    fat_g:     calc('fat',         'fat'),
    fiber_g:   calc('fiber',       'fiber')
  }
}