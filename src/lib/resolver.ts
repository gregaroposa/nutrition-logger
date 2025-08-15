import { searchOFF } from './off'
import { searchNutritionix, hasNutritionix } from './nutritionix'
import { searchFDC, hasFDC } from './fdc'
import type { Product } from '../types'

export interface ParsedLike {
  name: string
  brand?: string
  qty?: number
  unit?: string
  grams?: number
}

export interface Candidate {
  product: Product & { nutriments: any }
  confidence: number
  label: string
}

export interface ResolveResult {
  status: 'ok' | 'choices' | 'ask'
  best?: Candidate
  choices?: Candidate[] // top-3
}

export async function resolveOne(p: ParsedLike): Promise<ResolveResult> {
  // Build a query "brand name" if brand exists; else just name
  const q = [p.brand, p.name].filter(Boolean).join(' ')
  const candidates: Candidate[] = []

  // OFF first
  const off = await searchOFF(q, 10).catch(() => [])
  for (const prod of off) candidates.push(scoreCandidate(prod, p))

  // Nutritionix optional
  if (hasNutritionix) {
    const nx = await searchNutritionix(q, 6).catch(() => [])
    for (const prod of nx) candidates.push(scoreCandidate(prod, p, -0.05)) // tiny penalty vs OFF
  }

  // FDC optional (generics)
  if (hasFDC) {
    const fdc = await searchFDC(q, 6).catch(() => [])
    for (const prod of fdc) candidates.push(scoreCandidate(prod, p, +0.05)) // tiny bonus to encourage generics
  }

  const withEnergy = candidates.filter(c =>
    typeof c.product.nutriments?.['energy-kcal_100g'] === 'number' ||
    typeof c.product.nutriments?.['energy-kcal_serving'] === 'number'
  )
  if (withEnergy.length > 0) {
    candidates.length = 0
    candidates.push(...withEnergy)
  }

  // Rank by confidence desc
  candidates.sort((a, b) => b.confidence - a.confidence)

  const top = candidates[0]
  if (!top) return { status: 'ask' }

  if (top.confidence >= 0.80) {
    return { status: 'ok', best: top }
  }
  if (top.confidence >= 0.60) {
    return { status: 'choices', choices: candidates.slice(0, 3) }
  }
  return { status: 'ask', choices: candidates.slice(0, 3) }
}

// --- scoring helpers

function norm(s?: string) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
function jaccard(a: string, b: string) {
  const A = new Set(norm(a).split(' ').filter(Boolean))
  const B = new Set(norm(b).split(' ').filter(Boolean))
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / new Set([...A, ...B]).size
}

function scoreCandidate(prod: Product & { nutriments: any }, p: ParsedLike, bias = 0) {
  const nameScore = jaccard([p.brand, p.name].filter(Boolean).join(' '), [prod.brand, prod.name].filter(Boolean).join(' '))
  const brandScore = p.brand ? jaccard(p.brand, prod.brand || '') : 0
  const labelCompleteness = completeness(prod)
  // combine
  let conf = 0.55 * nameScore + 0.15 * brandScore + 0.30 * labelCompleteness + bias

  // soft caps
  conf = Math.max(0, Math.min(1, conf))

  const label = [prod.brand, prod.name].filter(Boolean).join(' — ')
  return { product: prod, confidence: conf, label }
}

function completeness(prod: Product & { nutriments: any }) {
  const n = prod.nutriments || {}
  const pairs: [string, string][] = [
    ['energy-kcal_100g', 'energy-kcal_serving'],
    ['proteins_100g',    'proteins_serving'],
    ['carbohydrates_100g','carbohydrates_serving'],
    ['fat_100g',         'fat_serving']
  ]
  let have = 0
  for (const [per100, perServ] of pairs) {
    if (typeof n[per100] === 'number' || typeof n[perServ] === 'number') have++
  }
  return have / pairs.length // 0..1
}

