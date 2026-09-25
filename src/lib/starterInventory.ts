import defaultDeck from '@/data/defaultDeck.json'

/** Flatten tribe/spell/trap groups into cardId → count (starter inventory). */
export function starterInventory(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, group] of Object.entries(defaultDeck)) {
    if (key === 'name' || !group || typeof group !== 'object') continue
    for (const [id, n] of Object.entries(group)) {
      if (typeof n === 'number' && n > 0) {
        out[id] = (out[id] ?? 0) + n
      }
    }
  }
  return out
}
