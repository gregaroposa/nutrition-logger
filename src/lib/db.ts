import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { Entry, Item, Product, Serving, Totals } from '../types'

interface Schema extends DBSchema {
  entries: { key: string; value: Entry; indexes: { date_local: string } }
  items: { key: string; value: Item; indexes: { by_entry: string; by_date: string } }
  products: { key: string; value: Product; indexes: { by_barcode: string } }
  servings: { key: string; value: Serving; indexes: { by_product: string } }
  totals: { key: string; value: Totals }
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null

export function db() {
  if (!dbp) {
    dbp = openDB<Schema>('nutrition-logger', 1, {
      upgrade(d) {
        const entries = d.createObjectStore('entries', { keyPath: 'id' })
        entries.createIndex('date_local', 'date_local')

        const items = d.createObjectStore('items', { keyPath: 'id' })
        items.createIndex('by_entry', 'entry_id')
        items.createIndex('by_date', 'date_local' as any) // denormalized at write

        const products = d.createObjectStore('products', { keyPath: 'id' })
        products.createIndex('by_barcode', 'barcode_ean')

        const servings = d.createObjectStore('servings', { keyPath: ['product_id', 'label'] })
        servings.createIndex('by_product', 'product_id')

        d.createObjectStore('totals', { keyPath: 'date_local' })
      }
    })
  }
  return dbp!
}

export async function putProduct(p: Product) {
  return (await db()).put('products', p)
}
export async function getProductByBarcode(ean: string) {
  return (await db()).getFromIndex('products', 'by_barcode', ean)
}
export async function putServing(s: Serving) {
  return (await db()).put('servings', s)
}
export async function getServings(product_id: string) {
  return (await db()).getAllFromIndex('servings', 'by_product', product_id)
}

export async function createEntry(e: Entry) {
  return (await db()).put('entries', e)
}
export async function putItem(i: Item & { date_local: string }) {
  // denormalize date index onto item for quick day queries
  return (await db()).put('items', i as any)
}
export async function dayItems(date_local: string) {
  const idx = (await db()).transaction('items').store.index('by_date')
  const all = await idx.getAll(date_local as any)
  return all as Item[]
}

export async function putTotals(t: Totals) {
  return (await db()).put('totals', t)
}
export async function getTotals(date_local: string) {
  return (await db()).get('totals', date_local)
}
