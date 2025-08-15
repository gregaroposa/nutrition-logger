// Minimal normalization + lightweight quantity parsing for aliases

export function normalizePhrase(s: string): string {
  // trim, collapse spaces, lower-case
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Try to extract a qty + unit in simple patterns:
 *  - "1 scoop whey" → { qty:1, unit:"scoop" }
 *  - "200 g skyr"   → { qty:200, unit:"g" }
 *  - "250ml milk"   → { qty:250, unit:"ml" }
 *  - "2x skyr"      → { qty:2, unit:"x" }
 * Returns null if nothing clear is found.
 */
export function tryParseQtyUnit(s: string): { qty: number; unit: string } | null {
  const t = s.toLowerCase()
  // 200 g / 250g / 250 ml / 250ml
  let m = t.match(/\b(\d+(?:\.\d+)?)\s*(g|gram|grams|ml|milliliter|milliliters)\b/)
  if (m) {
    const qty = Number(m[1]); const unit = m[2].replace(/s$/, '')
    return { qty, unit }
  }
  // 1 scoop / 2 scoops
  m = t.match(/\b(\d+(?:\.\d+)?)\s*(scoop|scoops|serving|servings|slice|slices|cup|cups)\b/)
  if (m) {
    const qty = Number(m[1]); const unit = singular(m[2])
    return { qty, unit }
  }
  // 2x …
  m = t.match(/\b(\d+(?:\.\d+)?)\s*x\b/)
  if (m) {
    return { qty: Number(m[1]), unit: 'x' }
  }
  return null
}

function singular(u: string) {
  return u.endsWith('s') ? u.slice(0, -1) : u
}
