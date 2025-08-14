import type { Product } from '../types'

// Try to fetch product by barcode from Open Food Facts
export async function fetchOFFByBarcode(ean: string) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json`
  const res = await fetch(url, { headers: { 'User-Agent': 'nutrition-logger/1.0 (personal app)' } })
  if (!res.ok) throw new Error(`OFF error ${res.status}`)
  const data = await res.json()
  if (data.status !== 1 || !data.product) return null

  const p = data.product
  const nutriments = p.nutriments ?? {}
  const brand = p.brands || p.brand_owner || undefined
  const name = p.product_name || p.generic_name || 'Unknown product'

  const product: Product & { nutriments: any } = {
    id: `off:${p.code}`,
    source: 'off',
    source_id: String(p.code),
    brand,
    name,
    barcode_ean: String(p.code),
    default_serving_g: parseServingToGrams(p.serving_size) ?? undefined,
    flavor: undefined,
    version: 1,
    attribution: 'Open Food Facts (ODbL)',
    nutriments
  }
  return product
}

function parseServingToGrams(s?: string): number | null {
  if (!s) return null
  // naive parse: "150 g", "1 cup (240 ml)" → only catch "NN g"
  const m = s.match(/(\d+(\.\d+)?)\s*g/i)
  if (m) return parseFloat(m[1])
  return null
}
