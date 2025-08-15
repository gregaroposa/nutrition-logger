import { z } from 'zod'

const ItemSchema = z.object({
  name: z.string(),
  brand: z.string().optional(),
  qty: z.number().optional(),
  unit: z.string().optional(),
  grams: z.number().optional(),
  notes: z.string().optional()
})
const RespSchema = z.object({
  items: z.array(ItemSchema).max(10)
})

const PARSER_URL = import.meta.env.VITE_PARSER_URL // e.g., https://nutrition-parser.../parse

export type ParsedItem = z.infer<typeof ItemSchema>

export async function parseFreeText(text: string): Promise<ParsedItem[] | null> {
  if (!PARSER_URL) return null
  try {
    const res = await fetch(PARSER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    if (!res.ok) return null
    const data = await res.json()
    const ok = RespSchema.safeParse(data)
    if (!ok.success) return null
    return ok.data.items
  } catch {
    return null
  }
}
