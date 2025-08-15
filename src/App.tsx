import React, { useEffect, useMemo, useState } from 'react'
import BarcodeScanner from './components/BarcodeScanner'
import RemainingToday from './components/RemainingToday'
import DisambiguationModal from './components/DisambiguationModal'
import { fetchOFFByBarcode } from './lib/off'
import { macrosFromPer100g } from './lib/nutrition'
import { nowLj, todayKey } from './lib/tz'
import { resolveOne, type Candidate } from './lib/resolver'
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
  putTotals,
  getTargets,
  setTargets,
  getAlias,
  setAlias,
  listAliases,
  deleteAlias
} from './lib/db'
import { normalizePhrase, tryParseQtyUnit } from './lib/aliases'
import { parseFreeText } from './lib/parser'
import type { Entry, Item, Totals, Targets, Alias } from './types'

export default function App() {
  const [showScanner, setShowScanner] = useState(false)
  const [freeText, setFreeText] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [targets, setTargetsState] = useState<Targets | null>(null)
  const [showTable, setShowTable] = useState(false) // hidden by default
  const [aliases, setAliases] = useState<Alias[]>([])
  const [pendingChoice, setPendingChoice] = useState<{
    phrase: string
    parsed: { name: string; brand?: string; grams?: number }
    choices: Candidate[]
    resume: (picked: Candidate | null) => void
  } | null>(null)



  const today = todayKey()

  useEffect(() => {
    (async () => {
      setTargetsState(await getTargets())
      await refreshDay()
    })()
    const onVis = () => document.visibilityState === 'visible' && refreshDay()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const [showAliases, setShowAliases] = useState(false)

  async function refreshAliases() {
    const a = await listAliases()
    setAliases(a)
  }

  useEffect(() => {
    if (showAliases) {
      refreshAliases()
    }
  }, [showAliases])
  
  async function handleDeleteAlias(phrase: string) {
    const ok = window.confirm(`Delete alias "${phrase}"?`)
    if (!ok) return
    await deleteAlias(phrase)
    await refreshAliases()
  }

  async function refreshDay() {
    const it = await dayItems(today)
    setItems(it)
    const t = await getTotals(today)
    setTotals(t ?? { date_local: today, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 })
  }

  async function editTargets() {
    const current = targets ?? { kcal: 2400, protein_g: 160, carbs_g: 260, fat_g: 80, fiber_g: 30 }
    // quick inline editor (mobile friendly enough for now)
    const kcal = Number(window.prompt('Daily kcal target', String(current.kcal)) || current.kcal)
    const p = Number(window.prompt('Protein (g)', String(current.protein_g)) || current.protein_g)
    const c = Number(window.prompt('Carbs (g)', String(current.carbs_g)) || current.carbs_g)
    const f = Number(window.prompt('Fat (g)', String(current.fat_g)) || current.fat_g)
    const fi = Number(window.prompt('Fiber (g)', String(current.fiber_g)) || current.fiber_g)
    const next: Targets = { kcal, protein_g: p, carbs_g: c, fat_g: f, fiber_g: fi }
    await setTargets(next)
    setTargetsState(next)
  }

  async function logFromBarcode(ean: string) {
    let product = await getProductByBarcode(ean)
    let nutriments: any | null = null

    if (!product) {
      const off = await fetchOFFByBarcode(ean)
      if (!off) {
        alert('Product not found on Open Food Facts. Please enter manual item.')
        return
      }
      nutriments = off.nutriments
      const { nutriments: _n, ...prod } = off
      product = prod
      await putProduct(product)
      if (off.default_serving_g) {
        await putServing({ product_id: product.id, label: 'serving', grams: off.default_serving_g })
      }
    } else {
      const offAgain = await fetchOFFByBarcode(ean).catch(() => null)
      nutriments = offAgain?.nutriments ?? null
    }

    const servings = await getServings(product.id)
    const quickGs = [100, product.default_serving_g || servings[0]?.grams || 0, 250].filter(Boolean) as number[]
    const grams = await promptGrams(quickGs)
    if (!grams) return

    const entry: Entry = {
      id: uuid(),
      timestamp_utc: new Date().toISOString(),
      date_local: today,
      text_raw: `barcode:${ean}`
    }
    await createEntry(entry)

    const macros = nutriments
      ? macrosFromPer100g(nutriments, grams, product.default_serving_g ?? undefined)
      : { kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null }


    const item: Item & { date_local: string } = {
      id: uuid(),
      entry_id: entry.id,
      product_id: product.id,
      food_name: [product.brand, product.name].filter(Boolean).join(' — '),
      qty: 1,
      unit: 'g',
      grams,
      kcal: (macros.kcal ?? null),
      protein_g: (macros.protein_g ?? null),
      carbs_g: (macros.carbs_g ?? null),
      fat_g: (macros.fat_g ?? null),
      fiber_g: (macros.fiber_g ?? null),
      notes: (macros.kcal ?? null) === null ? 'Macros unavailable from source' : null,
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

    await refreshDay()
  }

  async function promptGrams(chips: number[]): Promise<number | null> {
    const g = window.prompt(`Enter grams to log.\nQuick: ${chips.join('g, ')}g`, String(chips[0] ?? 100))
    if (!g) return null
    const v = Math.max(1, Math.round(Number(g)))
    return Number.isFinite(v) ? v : null
  }

async function logResolvedProduct(entryId: string, phraseForDisplay: string, picked: Candidate, grams: number) {
  // cache product if not present locally (by id key)
  await putProduct({
    id: picked.product.id,
    source: picked.product.source,
    source_id: picked.product.source_id,
    brand: picked.product.brand,
    name: picked.product.name,
    barcode_ean: picked.product.barcode_ean ?? null,
    default_serving_g: picked.product.default_serving_g ?? null,
    flavor: picked.product.flavor ?? null,
    version: 1,
    attribution: picked.product.attribution
  })

  const macros = macrosFromPer100g(
    picked.product.nutriments || {},
    grams,
    picked.product.default_serving_g ?? undefined
  )

  const item: Item & { date_local: string } = {
    id: uuid(),
    entry_id: entryId,
    product_id: picked.product.id,
    food_name: [picked.product.brand, picked.product.name].filter(Boolean).join(' — ') || phraseForDisplay,
    qty: 1,
    unit: 'g',
    grams,
    kcal: macros.kcal ?? null,
    protein_g: macros.protein_g ?? null,
    carbs_g: macros.carbs_g ?? null,
    fat_g: macros.fat_g ?? null,
    fiber_g: macros.fiber_g ?? null,
    notes: (macros.kcal ?? null) === null ? 'Macros unavailable from source' : null,
    confidence: picked.confidence,
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
}


async function logFreeText() {
  const phraseRaw = freeText.trim()
  if (!phraseRaw) return
  const phraseNorm = normalizePhrase(phraseRaw)

  // 1) Alias short-circuit (2A)
  const hit = await getAlias(phraseNorm)
  if (hit) {
    let grams: number | null = hit.grams_override ?? null
    if (!grams && hit.serving_label) {
      const servings = await getServings(hit.product_id)
      const s = servings.find(x => x.label.toLowerCase() === hit.serving_label!.toLowerCase())
      if (s) grams = s.grams
    }
    if (!grams) {
      const maybe = window.prompt(`Enter grams for "${phraseRaw}"`, '100')
      if (!maybe) return
      grams = Math.max(1, Math.round(Number(maybe)))
    }

    const entry: Entry = { id: uuid(), timestamp_utc: new Date().toISOString(), date_local: today, text_raw: phraseRaw }
    await createEntry(entry)

    const item: Item & { date_local: string } = {
      id: uuid(), entry_id: entry.id, product_id: hit.product_id,
      food_name: phraseRaw, qty: 1, unit: 'g', grams,
      kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null,
      notes: 'alias (macros pending resolver)', confidence: 1, date_local: today
    }
    await putItem(item)
    const t = await getTotals(today) ?? { date_local: today, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
    await putTotals(t)
    setFreeText('')
    await refreshDay()
    return
  }

  // 2) No alias → try LLM parser (2B) + resolver (2C)
  const parsed = await parseFreeText(phraseRaw)

  if (parsed && parsed.length > 0) {
    const entry: Entry = { id: uuid(), timestamp_utc: new Date().toISOString(), date_local: today, text_raw: phraseRaw }
    await createEntry(entry)

    for (const p of parsed) {
      // grams: from parser if present else ask once
      let grams = p.grams
      if (!grams) {
        const ask = window.prompt(`Grams for "${[p.brand, p.name].filter(Boolean).join(' — ') || p.name}"`, '100')
        if (!ask) continue
        grams = Math.max(1, Math.round(Number(ask)))
      }
      
      
      // resolve to a product
      const result = await resolveOne({ name: p.name, brand: p.brand, qty: p.qty, unit: p.unit, grams })

      if (result.status === 'ok' && result.best) {
        await logResolvedProduct(entry.id, p.name, result.best, grams)
        // auto‑save alias for the full phrase on confident hits
        if (result.best.confidence >= 0.80) {
          await setAlias({
            user_phrase: normalizePhrase(phraseRaw),
            product_id: result.best.product.id,
            serving_label: null,
            grams_override: grams
          })
        }
      } else if (result.status === 'choices' && result.choices && result.choices.length > 0) {
        // show modal and wait for user pick
        const picked = await new Promise<Candidate | null>((resolve) => {
          setPendingChoice({
            phrase: p.name,
            parsed: { name: p.name, brand: p.brand, grams },
            choices: result.choices!,
            resume: resolve
          })
        })
        setPendingChoice(null)
        if (picked) {
          await logResolvedProduct(entry.id, p.name, picked, grams)
          // save alias on user confirmation too
          await setAlias({
            user_phrase: normalizePhrase(phraseRaw),
            product_id: picked.product.id,
            serving_label: null,
            grams_override: grams
          })
        } else {
          // user cancelled; skip this item
          continue
        }
      } else {
        // ask for more info (brand/variant)
        const more = window.prompt(`Couldn’t resolve "${p.name}". Add brand/variant and try again:`, [p.brand, p.name].filter(Boolean).join(' '))
        if (more) {
          const again = await resolveOne({ name: more, grams })
          if (again.status === 'ok' && again.best) {
            await logResolvedProduct(entry.id, more, again.best, grams)
          } else {
            // fallback to manual item with unknown macros
            const item: Item & { date_local: string } = {
              id: uuid(),
              entry_id: entry.id,
              product_id: 'parsed:' + uuid(),
              food_name: more,
              qty: 1,
              unit: 'g',
              grams,
              kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null,
              notes: 'unresolved',
              confidence: 0.3,
              date_local: today
            }
            await putItem(item)
          }
        }
      }
    }

    setFreeText('')
    await refreshDay()
    return
  }


  // 3) Parser failed → fallback to your manual prompts (keeps you productive)
  const qtyUnit = tryParseQtyUnit(phraseRaw)
  const name = window.prompt('Food name (for display):', phraseRaw) || 'Manual item'
  const grams = Number(window.prompt('Grams:', qtyUnit ? String(Math.round(qtyUnit.qty)) : '100') || '100')
  const kcal = Number(window.prompt('kcal (optional):', '') || '0')
  const protein = Number(window.prompt('protein g (optional):', '') || '0')
  const carbs = Number(window.prompt('carbs g (optional):', '') || '0')
  const fat = Number(window.prompt('fat g (optional):', '') || '0')
  const fiber = Number(window.prompt('fiber g (optional):', '') || '0')

  const entry: Entry = { id: uuid(), timestamp_utc: new Date().toISOString(), date_local: today, text_raw: phraseRaw }
  await createEntry(entry)

  const productId = 'custom:' + uuid()
  const item: Item & { date_local: string } = {
    id: uuid(), entry_id: entry.id, product_id: productId,
    food_name: name, qty: 1, unit: 'g', grams,
    kcal, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: fiber,
    notes: 'manual', confidence: 1, date_local: today
  }
  await putItem(item)
  const t = await getTotals(today) ?? { date_local: today, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
  t.kcal += item.kcal ?? 0; t.protein_g += item.protein_g ?? 0; t.carbs_g += item.carbs_g ?? 0; t.fat_g += item.fat_g ?? 0; t.fiber_g += item.fiber_g ?? 0
  await putTotals(t)
  setFreeText('')
  await refreshDay()

  const save = window.confirm(`Save alias so "${phraseRaw}" logs automatically next time?`)
  if (save) {
    const gramsOverride = window.confirm('Bind grams to this alias so it logs without asking?') ? grams : null
    await setAlias({
      user_phrase: phraseNorm,
      product_id: productId,
      serving_label: null,
      grams_override: gramsOverride
    })
  }
}



  const dayHeader = useMemo(() => nowLj().toFormat('cccc, d LLL yyyy (ZZZZ)'), [])

  return (
    <div className="container">
      <h1 style={{ margin: '8px 0 16px' }}>DIY Nutrition Logger</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <button onClick={() => setShowScanner(true)}>Scan barcode</button>
          <div style={{ flex: 1, minWidth: 280 }}>
            <input
              type="text"
              placeholder='What did you eat? e.g., "1 skyr + 1 scoop whey"'
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

      {targets && <RemainingToday targets={targets} totals={totals} onEdit={editTargets} />}

      {showScanner && (
        <div style={{ marginBottom: 12 }}>
          <BarcodeScanner onDetected={(code) => logFromBarcode(code)} onClose={() => setShowScanner(false)} />
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Logged items</h2>
          <button className="ghost" onClick={() => setShowTable(!showTable)}>{showTable ? 'Hide' : 'Show'}</button>
        </div>
        {showTable && (
          <>
            <table className="table" style={{ marginTop: 8 }}>
              <thead>
                <tr><th>Food</th><th>g</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr>
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
                {items.length === 0 && (<tr><td colSpan={6} className="small">No items yet.</td></tr>)}
              </tbody>
            </table>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div className="badge">kcal: {totals?.kcal ?? 0}</div>
              <div className="badge">P: {totals?.protein_g ?? 0} g</div>
              <div className="badge">C: {totals?.carbs_g ?? 0} g</div>
              <div className="badge">F: {totals?.fat_g ?? 0} g</div>
              <div className="badge">Fiber: {totals?.fiber_g ?? 0} g</div>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: '2rem', borderTop: '1px solid #ccc', paddingTop: '1rem' }}>
        <button onClick={() => setShowAliases(s => !s)}>
          {showAliases ? 'Hide' : 'Show'} Aliases
        </button>

        {showAliases && (
          <div style={{ marginTop: '1rem' }}>
            <h3>Saved Aliases</h3>
            {aliases.length === 0 && <p><em>No aliases saved.</em></p>}
            {aliases.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Phrase</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Product ID</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Serving Label</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Grams Override</th>
                    <th style={{ borderBottom: '1px solid #ccc' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {aliases.map(a => (
                    <tr key={a.user_phrase}>
                      <td>{a.user_phrase}</td>
                      <td>{a.product_id}</td>
                      <td>{a.serving_label || '-'}</td>
                      <td>{a.grams_override ?? '-'}</td>
                      <td>
                        <button onClick={() => handleDeleteAlias(a.user_phrase)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      
      {pendingChoice && (
        <DisambiguationModal
          userPhrase={
            pendingChoice.parsed.brand
              ? `${pendingChoice.parsed.brand} ${pendingChoice.parsed.name}`
              : pendingChoice.parsed.name
          }
          choices={pendingChoice.choices}
          onPick={(c) => pendingChoice.resume(c)}
          onCancel={() => pendingChoice.resume(null)}
        />
      )}

      <p className="small">Barcode data: Open Food Facts (ODbL). Personal app; data stored locally on device.</p>
    </div>
  )
}
