import { CARD_MAP, MAX_COPIES, countDeckCards } from './cards'

export const DECK_JSON_FORMAT = 'aether-duel-deck'

export type DeckExport = {
  format: typeof DECK_JSON_FORMAT
  version: 1
  name: string
  cards: Record<string, number>
}

export type ParsedDeckFile = {
  name: string
  cards: Record<string, number>
  skipped: string[]
  clamped: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCountMap(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false
  const vals = Object.values(value)
  return vals.length > 0 && vals.every((n) => typeof n === 'number' && Number.isFinite(n))
}

function countIds(ids: string[]): Record<string, number> {
  const cards: Record<string, number> = {}
  for (const id of ids) {
    if (!id) continue
    cards[id] = (cards[id] ?? 0) + 1
  }
  return cards
}

function extractCounts(data: unknown): Record<string, number> | null {
  if (Array.isArray(data) && data.every((x) => typeof x === 'string')) {
    return countIds(data)
  }
  if (!isRecord(data)) return null

  if ('cards' in data) {
    const nested = extractCounts(data.cards)
    if (nested) return nested
  }

  if (isCountMap(data)) return { ...data }

  const groups = Object.values(data).filter(isCountMap)
  if (groups.length > 0) return Object.assign({}, ...groups)

  return null
}

export function serializeDeck(deck: {
  name: string
  cards: Record<string, number>
}): string {
  const payload: DeckExport = {
    format: DECK_JSON_FORMAT,
    version: 1,
    name: deck.name,
    cards: { ...deck.cards },
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function deckFileName(name: string): string {
  const slug = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 48)
  return `${slug || 'deck'}.json`
}

export function parseDeckJson(text: string): ParsedDeckFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('ไฟล์ JSON ไม่ถูกต้อง')
  }

  const counts = extractCounts(raw)
  if (!counts) {
    throw new Error('ไม่พบรายการการ์ดในไฟล์ (ต้องมี cards เป็นรหัสการ์ด → จำนวน)')
  }

  const name =
    isRecord(raw) && typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : 'เด็คนำเข้า'

  const cards: Record<string, number> = {}
  const skipped: string[] = []
  const clamped: string[] = []

  for (const [id, n] of Object.entries(counts)) {
    if (!(id in CARD_MAP)) {
      skipped.push(id)
      continue
    }
    const rounded = Math.floor(n)
    if (rounded <= 0) continue
    const next = Math.min(MAX_COPIES, rounded)
    if (next < rounded) clamped.push(id)
    cards[id] = next
  }

  if (countDeckCards(cards) === 0) {
    throw new Error('ไฟล์ไม่มีรหัสการ์ดที่รู้จัก')
  }

  return { name, cards, skipped, clamped }
}
