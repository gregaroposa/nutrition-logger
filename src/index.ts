// src/index.ts
import { z } from 'zod'

/** ---------- Schemas ---------- */

// REQUEST
const ReqSchema = z.object({
  text: z.string().min(1),
  tz: z.string().optional().default('Europe/Ljubljana')
})

// STRICT output we return to the client
const ItemStrict = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  qty: z.number().optional(),
  unit: z.string().optional(),
  grams: z.number().optional(),
  notes: z.string().optional()
})
const RespStrict = z.object({ items: z.array(ItemStrict).max(10) })

// LOOSE model output we accept, then sanitize → STRICT
const ItemLoose = z.object({
  name: z.string(),
  brand: z.string().optional().nullable(),
  qty: z.union([z.number(), z.string()]).optional().nullable(),
  unit: z.string().optional().nullable(),
  grams: z.union([z.number(), z.string()]).optional().nullable(),
  notes: z.union([z.string(), z.null()]).optional().nullable()
})
const RespLoose = z.object({ items: z.array(ItemLoose) })

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function sanitize(looseObj: unknown): z.infer<typeof RespStrict> {
  const parsed = RespLoose.safeParse(looseObj)
  if (!parsed.success) throw parsed.error

  const items = parsed.data.items
    .map((i) => {
      const out: Record<string, unknown> = { name: i.name.trim() }
      if (i.brand) out.brand = i.brand.trim()
      const qty = toNumber(i.qty)
      if (qty !== undefined) out.qty = qty
      if (i.unit) out.unit = i.unit.trim()
      const grams = toNumber(i.grams)
      if (grams !== undefined) out.grams = grams
      if (i.notes) out.notes = i.notes.trim()
      return out
    })
    .filter((i) => String(i.name || '').length > 0)

  // final strict validation
  return RespStrict.parse({ items })
}

/** ---------- Helpers ---------- */

function cors(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'content-type, authorization')
  return new Response(response.body, { ...response, headers })
}

function buildSystemPrompt() {
  return [
    'You are a nutrition free‑text parser.',
    'Return STRICT JSON with an "items" array.',
    'Each item: {name, brand?, qty?, unit?, grams?, notes?}.',
    'CRITICAL RULES:',
    '- qty and grams MUST be numbers (not strings).',
    '- If a field is unknown, OMIT it (do NOT use null).',
    '- Do NOT include calories or macros.',
    'If grams are explicitly stated (e.g., "200 g"), set grams.',
    'When only household units (e.g., "1 scoop") are present, keep qty/unit and OMIT grams.',
    'Split the text into multiple items if separated by "+" or commas.',
    'Return ONLY JSON, no prose.'
  ].join(' ')
}

function mockParse(text: string) {
  const parts = text.split('+').map((s) => s.trim()).filter(Boolean)
  return {
    items: parts.map((p) => {
      const m = p.match(/\b(\d+(?:\.\d+)?)\s*(g|ml)\b/i)
      const name = p.replace(/\b(\d+(?:\.\d+)?)\s*(g|ml)\b/i, '').trim().replace(/\s{2,}/g, ' ')
      return {
        name: name || 'item',
        ...(m ? { grams: Number(m[1]) } : {})
      }
    })
  }
}

/** ---------- Env ---------- */
export interface Env {
  OPENAI_API_KEY: string
  OPENAI_ORG_ID?: string
  MODEL?: string          // default set below
  MOCK_PARSER?: string    // "true" to bypass model for testing
}

const OPENAI_MODEL_DEFAULT = 'gpt-4o-mini'

/** ---------- Worker ---------- */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }))
    }
    if (req.method !== 'POST') {
      return cors(new Response(JSON.stringify({ error: 'Use POST /parse' }), { status: 405 }))
    }

    const url = new URL(req.url)
    if (url.pathname !== '/parse') {
      return cors(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }))
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return cors(new Response(JSON.stringify({ error: 'Bad JSON' }), { status: 400 }))
    }

    const reqOk = ReqSchema.safeParse(body)
    if (!reqOk.success) {
      return cors(
        new Response(JSON.stringify({ error: 'Bad request', issues: reqOk.error.issues }), { status: 400 })
      )
    }

    const { text } = reqOk.data

    // --- Mock mode (no API call) ---
    if (env.MOCK_PARSER === 'true') {
      try {
        const strict = sanitize(mockParse(text))
        return cors(new Response(JSON.stringify(strict), { headers: { 'Content-Type': 'application/json' } }))
      } catch (e: any) {
        return cors(new Response(JSON.stringify({ error: 'Mock sanitize failed', detail: String(e) }), { status: 500 }))
      }
    }

    // --- OpenAI call ---
    try {
      const system = buildSystemPrompt()
      const user = `Text: ${text}`

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          ...(env.OPENAI_ORG_ID ? { 'OpenAI-Organization': env.OPENAI_ORG_ID } : {})
        },
        body: JSON.stringify({
          model: env.MODEL || OPENAI_MODEL_DEFAULT,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0,
          response_format: { type: 'json_object' }
        })
      })

      const textBody = await r.text()
      if (!r.ok) {
        const retryHint = r.status === 429 || r.status >= 500 || textBody.includes('insufficient_quota')
        // Return upstream error; the client can decide what to do
        return cors(new Response(JSON.stringify({ error: 'OpenAI error', retryable: retryHint, detail: textBody }), { status: 502 }))
      }

      let modelObj: unknown
      try {
        const data = JSON.parse(textBody)
        const content = data?.choices?.[0]?.message?.content || '{}'
        modelObj = JSON.parse(content)
      } catch {
        return cors(new Response(JSON.stringify({ error: 'Invalid JSON from model' }), { status: 502 }))
      }

      // Sanitize & validate to strict schema before returning
      const strict = sanitize(modelObj)
      return cors(new Response(JSON.stringify(strict), { headers: { 'Content-Type': 'application/json' } }))
    } catch (e: any) {
      return cors(new Response(JSON.stringify({ error: 'Parser failed', detail: e?.message ?? 'unknown' }), { status: 500 }))
    }
  }
}
