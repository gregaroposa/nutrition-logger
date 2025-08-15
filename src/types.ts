export type Source = 'off' | 'fdc' | 'nutrix' | 'custom'

export interface Entry {
  id: string
  timestamp_utc: string
  date_local: string
  text_raw?: string
  deleted?: boolean
}

export interface Product {
  id: string
  source: Source
  source_id: string
  brand?: string
  name: string
  barcode_ean?: string | null
  default_serving_g?: number | null
  flavor?: string | null
  version: number
  attribution?: string
}

export interface Serving {
  product_id: string
  label: string
  grams: number
}

export interface Item {
  id: string
  entry_id: string
  product_id: string
  food_name: string
  qty: number
  unit: string
  grams: number
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  notes?: string | null
  confidence?: number | null
}

export interface Totals {
  date_local: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

export interface Targets {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

export interface Alias {
  user_phrase: string           // normalized key (lowercased, trimmed)
  product_id: string            // maps to an existing product (off:/fdc:/nutrix:/custom:)
  serving_label?: string | null // optional household measure label (e.g., "serving", "scoop")
  grams_override?: number | null// if present, use this grams directly
}
