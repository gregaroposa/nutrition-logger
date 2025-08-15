import type { Product } from '../types'

// Existing: fetch by barcode
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

export async function searchOFF(query: string, pageSize = 10) {
  const url = new URL('https://world.openfoodfacts.org/api/v2/search')
  url.searchParams.set('search', query) // free‑text
  url.searchParams.set('fields', 'code,product_name,brands,nutriments,serving_size')
  url.searchParams.set('page_size', String(pageSize))
  url.searchParams.set('sort_by', 'unique_scans_n')

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'nutrition-logger/1.0 (personal app)' }
  })
  if (!res.ok) throw new Error(`OFF search error ${res.status}`)
  const data = await res.json()

  const products: (Product & { nutriments: any })[] = (data.products || []).map((p: any) => ({
    id: `off:${p.code}`,
    source: 'off',
    source_id: String(p.code),
    brand: p.brands || undefined,
    name: p.product_name || 'Unknown product',
    barcode_ean: String(p.code),
    default_serving_g: parseServingToGrams(p.serving_size) ?? undefined,
    flavor: undefined,
    version: 1,
    attribution: 'Open Food Facts (ODbL)',
    nutriments: p.nutriments ?? {}
  }))
  return products
}

function parseServingToGrams(s?: string): number | null {
  if (!s) return null
  const m = s.match(/(\d+(\.\d+)?)\s*g/i)
  if (m) return parseFloat(m[1])
  return null
}
