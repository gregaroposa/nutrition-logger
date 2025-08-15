import type { Product } from '../types'
const FDC_API_KEY = import.meta.env.VITE_FDC_API_KEY
export const hasFDC = !!FDC_API_KEY

export async function searchFDC(query: string, pageSize = 10) {
  if (!hasFDC) return []
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
  url.searchParams.set('api_key', FDC_API_KEY!)
  url.searchParams.set('query', query)
  url.searchParams.set('pageSize', String(pageSize))
  url.searchParams.set('dataType', 'Branded,SR Legacy,Survey (FNDDS)')

  const res = await fetch(url.toString())
  if (!res.ok) return []
  const data = await res.json()
  const foods = data.foods || []

  const out: (Product & { nutriments: any })[] = foods.map((f: any) => {
    const kcal100 = pickNutrient(f, 1008) // Energy kcal
    const protein100 = pickNutrient(f, 1003)
    const carbs100 = pickNutrient(f, 1005)
    const fat100 = pickNutrient(f, 1004)
    const fiber100 = pickNutrient(f, 1079)

    return {
      id: `fdc:${f.fdcId}`,
      source: 'fdc',
      source_id: String(f.fdcId),
      brand: f.brandName || undefined,
      name: f.description || f.lowercaseDescription || 'Unknown',
      barcode_ean: null,
      default_serving_g: f.servingSizeUnit === 'g' ? f.servingSize : null,
      flavor: undefined,
      version: 1,
      attribution: 'USDA FDC (CC0)',
      nutriments: {
        'energy-kcal_100g': kcal100,
        'proteins_100g': protein100,
        'carbohydrates_100g': carbs100,
        'fat_100g': fat100,
        'fiber_100g': fiber100
      }
    }
  })
  return out
}

function pickNutrient(food: any, id: number): number | null {
  const n = (food.foodNutrients || []).find((x: any) => x.nutrient?.number == null ? x.nutrient?.id === id : false) // some responses
  if (n?.amount != null && food?.servingSize != null && food?.servingSizeUnit != null) {
    // many FDC search results are per 100g already; if not, leave as is (approx)
  }
  // FDC search frequently includes per 100g already; return amount or null
  return typeof n?.amount === 'number' ? n.amount : null
}
