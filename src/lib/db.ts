import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { Entry, Item, Product, Serving, Totals, Targets, Alias } from '../types'

interface Schema extends DBSchema {
  entries: { key: string; value: Entry; indexes: { date_local: string } }
  items: { key: string; value: Item; indexes: { by_entry: string; by_date: string } }
  products: { key: string; value: Product; indexes: { by_barcode: string } }
  servings: { key: string; value: Serving; indexes: { by_product: string } }
  totals: { key: string; value: Totals }
  settings: { key: string; value: any }
  aliases: { key: string; value: Alias } // key = user_phrase (normalized)
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null

export function db() {
  if (!dbp) {
    dbp = openDB<Schema>('nutrition-logger', 3, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const entries = d.createObjectStore('entries', { keyPath: 'id' })
          entries.createIndex('date_local', 'date_local')

          const items = d.createObjectStore('items', { keyPath: 'id' })
          items.createIndex('by_entry', 'entry_id')
          items.createIndex('by_date', 'date_local' as any)

          const products = d.createObjectStore('products', { keyPath: 'id' })
          products.createIndex('by_barcode', 'barcode_ean')

          const servings = d.createObjectStore('servings', { keyPath: ['product_id', 'label'] })
          servings.createIndex('by_product', 'product_id')

          d.createObjectStore('totals', { keyPath: 'date_local' })
        }
        if (oldVersion < 2) {
          d.createObjectStore('settings', { keyPath: 'key' })
        }
        if (oldVersion < 3) {
          d.createObjectStore('aliases', { keyPath: 'user_phrase' })
        }
      }
    })
  }
  return dbp!
}

// products/servings
export async function putProduct(p: Product) { return (await db()).put('products', p) }
export async function getProductByBarcode(ean: string) { return (await db()).getFromIndex('products', 'by_barcode', ean) }
export async function putServing(s: Serving) { return (await db()).put('servings', s) }
export async function getServings(product_id: string) { return (await db()).getAllFromIndex('servings', 'by_product', product_id) }

// entries/items
export async function createEntry(e: Entry) { return (await db()).put('entries', e) }
export async function putItem(i: Item & { date_local: string }) { return (await db()).put('items', i as any) }
export async function dayItems(date_local: string) {
  const idx = (await db()).transaction('items').store.index('by_date')
  const all = await idx.getAll(date_local as any)
  return all as Item[]
}

// totals
export async function putTotals(t: Totals) { return (await db()).put('totals', t) }
export async function getTotals(date_local: string) { return (await db()).get('totals', date_local) }

// settings: targets
import type { Targets as TTargets } from '../types'
const DEFAULT_TARGETS: TTargets = { kcal: 2400, protein_g: 160, carbs_g: 260, fat_g: 80, fiber_g: 30 }
export async function getTargets(): Promise<TTargets> {
  const rec = await (await db()).get('settings', 'targets')
  if (!rec) {
    await setTargets(DEFAULT_TARGETS)
    return DEFAULT_TARGETS
  }
  return rec.value as TTargets
}
export async function setTargets(t: TTargets) {
  return (await db()).put('settings', { key: 'targets', value: t })
}

// aliases
export async function getAlias(phraseNorm: string) {
  return (await db()).get('aliases', phraseNorm)
}
export async function setAlias(a: Alias) {
  return (await db()).put('aliases', a)
}
export async function deleteAlias(phraseNorm: string) {
  return (await db()).delete('aliases', phraseNorm)
}
export async function listAliases(): Promise<Alias[]> {
  return (await db()).getAll('aliases')
}
