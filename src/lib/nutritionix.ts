import type { Product } from '../types'

const APP_ID = import.meta.env.VITE_NUTRITIONIX_APP_ID
const API_KEY = import.meta.env.VITE_NUTRITIONIX_API_KEY

export const hasNutritionix = !!(APP_ID && API_KEY)

export async function searchNutritionix(query: string, limit = 10) {
  if (!hasNutritionix) return []
  const url = 'https://trackapi.nutritionix.com/v2/search/instant'
  const res = await fetch(`${url}?query=${encodeURIComponent(query)}&detailed=true&self=true&nix_item_id=1`, {
    headers: {
      'x-app-id': APP_ID!,
      'x-app-key': API_KEY!
    }
  })
  if (!res.ok) return []
  const data = await res.json()
  const branded = (data.branded || []).slice(0, limit)
  const out: (Product & { nutriments: any })[] = branded.map((b: any) => {
    const nutriments = {
      // normalize to OFF-like per 100g if possible; Nutritionix gives per serving mostly.
      // We’ll compute per 100g approximately when possible; else we’ll fallback to per serving below in resolver.
      'energy-kcal_100g': b.nf_calories ? (b.serving_weight_grams ? (b.nf_calories / (b.serving_weight_grams / 100)) : null) : null,
      'proteins_100g': b.nf_protein ? (b.serving_weight_grams ? (b.nf_protein / (b.serving_weight_grams / 100)) : null) : null,
      'carbohydrates_100g': b.nf_total_carbohydrate ? (b.serving_weight_grams ? (b.nf_total_carbohydrate / (b.serving_weight_grams / 100)) : null) : null,
      'fat_100g': b.nf_total_fat ? (b.serving_weight_grams ? (b.nf_total_fat / (b.serving_weight_grams / 100)) : null) : null,
      'fiber_100g': b.nf_dietary_fiber ? (b.serving_weight_grams ? (b.nf_dietary_fiber / (b.serving_weight_grams / 100)) : null) : null
    }
    return {
      id: `nutrix:${b.nix_item_id || b.item_id || b.food_name}`,
      source: 'nutrix',
      source_id: String(b.nix_item_id || b.item_id || b.food_name),
      brand: b.brand_name || undefined,
      name: b.food_name || 'Unknown',
      barcode_ean: null,
      default_serving_g: b.serving_weight_grams || null,
      flavor: undefined,
      version: 1,
      attribution: 'Nutritionix',
      nutriments
    }
  })
  return out
}
