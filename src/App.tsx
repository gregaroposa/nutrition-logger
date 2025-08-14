import React, { useEffect, useMemo, useState } from 'react'
import BarcodeScanner from './components/BarcodeScanner'
import { fetchOFFByBarcode } from './lib/off'
import { macrosFromPer100g } from './lib/nutrition'
import { nowLj, todayKey } from './lib/tz'
import { v4 as uuid } from './uuid4'
import {
  createEntry,
  dayItems,
  getProductByBarcode,
  getServings,
  getTotals,
  putItem,
  putProduct,
  putServing,
  putTotals
} from './lib/db'
import type { Entry, Item, Product, Totals } from './types'

export default function App() {
  const [showScanner, setShowScanner] = useState(false)
  const [freeText, setFreeText] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const today = todayKey()

  useEffect(() => {
    refreshDay()
    // refresh on visibility to keep totals fresh after PWA resume
    const onVis = () => document.visibilityState === 'visible' && refreshDay()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  async function refreshDay() {
    const it = await dayItems(today)
    setItems(it)
    const t = await getTotals(today)
    setTotals(t ?? { date_local: today, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 })
  }

  async function logFromBarcode(ean: string) {
    // 1) product from cache or OFF
    let product = await getProductByBarcode(ean)
    let nutriments: any | null = null

    if (!product) {
      const off = await fetchOFFByBarcode(ean)
      if (!off) {
        alert('Product not found on Open Food Facts. Please enter manual item.')
        return
      }
      // save product
      nutriments = off.nutriments
      const { nutriments: _n, ...prod } = off
      product = prod
      await putProduct(product)
      // seed serving if OFF provided a serving size
      if (off.default_serving_g) {
        await putServing({ product_id: product.id, label: 'serving', grams: off.default_serving_g })
      }
    } else {
      // for cached products we can’t assume nutriments exist locally; fetch once to compute macros
      const offAgain = await fetchOFFByBarcode(ean).catch(() => null)
      nutriments = offAgain?.nutriments ?? null
    }

    // 2) ask for grams (quick chips)
    const servings = await getServings(product.id)
    const quickGs = [
      100,
      product.default_serving_g || servings[0]?.grams || 0,
      250
    ].filter(Boolean) as number[]

    const grams = await promptGrams(quickGs)
    if (!grams) return

    // 3) compute macros & persist
    const entry: Entry = {
      id: uuid(),
      timestamp_utc: new Date().toISOString(),
      date_local: today,
      text_raw: `barcode:${ean}`
    }
    await createEntry(entry)

    const macros = nutriments ? macrosFromPer100g(nutriments, grams) : {
      kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null
    }

    const item: Item & { date_local: string } = {
      id: uuid(),
      entry_id: entry.id,
      product_id: product.id,
      food_name: [product.brand, product.name].filter(Boolean).join(' — '),
      qty: 1,
      unit: 'g',
      grams,
      ...macros,
      notes: macros.kcal == null ? 'Macros unavailable from source' : null,
      confidence: 1,
      date_local: today
    }
    await putItem(item)

    // 4) update totals
    const t = await getTotals(today) ?? { date_local: today, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
    t.kcal += item.kcal ?? 0
    t.protein_g += item.protein_g ?? 0
    t.carbs_g += item.carbs_g ?? 0
    t.fat_g += item.fat_g ?? 0
    t.fiber_g += item.fiber_g ?? 0
    await putTotals(t)

    await refreshDay()
  }

  async function promptGrams(chips: number[]): Promise<number | null> {
    // simple inline UI prompt
    const g = window.prompt(`Enter grams to log.\nQuick: ${chips.join('g, ')}g`, String(chips[0] ?? 100))
    if (!g) return null
    const v = Math.max(1, Math.round(Number(g)))
    return Number.isFinite(v) ? v : null
  }

  async function logFreeText() {
    if (!freeText.trim()) return
    // Phase 1: quick manual item; Phase 2: call parser → resolver
    const entry: Entry = {
      id: uuid(),
      timestamp_utc: new Date().toISOString(),
      date_local: today,
      text_raw: freeText.trim()
    }
    await createEntry(entry)

    // minimal manual dialog
    const name = window.prompt('Food name (for display):', freeText.trim()) || 'Manual item'
    const grams = Number(window.prompt('Grams:', '100') || '100')
    const kcal = Number(window.prompt('kcal (optional):', '') || '0')
    const protein = Number(window.prompt('protein g (optional):', '') || '0')
    const carbs = Number(window.prompt('carbs g (optional):', '') || '0')
    const fat = Number(window.prompt('fat g (optional):', '') || '0')
    const fiber = Number(window.prompt('fiber g (optional):', '') || '0')

    const item: Item & { date_local: string } = {
      id: uuid(),
      entry_id: entry.id,
      product_id: 'custom:' + uuid(),
      food_name: name,
      qty: 1,
      unit: 'g',
      grams,
      kcal, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: fiber,
      notes: 'manual',
      confidence: 1,
      date_local: today
    }
    await putItem(item)

    const t = await getTotals(today) ?? { date_local: today, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
    t.kcal += item.kcal ?? 0
    t.protein_g += item.protein_g ?? 0
    t.carbs_g += item.carbs_g ?? 0
    t.fat_g += item.fat_g ?? 0
    t.fiber_g += item.fiber_g ?? 0
    await putTotals(t)

    setFreeText('')
    await refreshDay()
  }

  const dayHeader = useMemo(() => {
    const d = nowLj()
    return d.toFormat('cccc, d LLL yyyy (ZZZZ)')
  }, [])

  return (
    <div className="container">
      <h1 style={{ margin: '8px 0 16px' }}>DIY Nutrition Logger</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <button onClick={() => setShowScanner(true)}>Scan barcode</button>
          <div style={{ flex: 1, minWidth: 280 }}>
            <input
              type="text"
              placeholder='What did you eat? e.g., "1 Lidl skyr + 1 scoop whey"'
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && logFreeText()}
            />
          </div>
          <button className="ghost" onClick={logFreeText}>Log</button>
        </div>
        <div className="small" style={{ marginTop: 6 }}>
          Timezone: Europe/Ljubljana — {dayHeader}
        </div>
      </div>

      {showScanner && (
        <div style={{ marginBottom: 12 }}>
          <BarcodeScanner
            onDetected={(code) => logFromBarcode(code)}
            onClose={() => setShowScanner(false)}
          />
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Today</h2>
          <button className="ghost" onClick={refreshDay}>Refresh</button>
        </div>
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Food</th>
              <th>g</th>
              <th>kcal</th>
              <th>P</th>
              <th>C</th>
              <th>F</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.food_name}</td>
                <td>{i.grams}</td>
                <td>{i.kcal ?? '—'}</td>
                <td>{i.protein_g ?? '—'}</td>
                <td>{i.carbs_g ?? '—'}</td>
                <td>{i.fat_g ?? '—'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="small">No items yet.</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="badge">kcal: {totals?.kcal ?? 0}</div>
          <div className="badge">P: {totals?.protein_g ?? 0} g</div>
          <div className="badge">C: {totals?.carbs_g ?? 0} g</div>
          <div className="badge">F: {totals?.fat_g ?? 0} g</div>
          <div className="badge">Fiber: {totals?.fiber_g ?? 0} g</div>
        </div>
      </div>

      <p className="small">
        Barcode data: Open Food Facts (ODbL). Personal app; data stored locally on device.
      </p>
    </div>
  )
}
