import { CARD_MAP } from '@/data/cards'
import {
  SALVAGE_GEMS_BY_RARITY,
  SALVAGE_KEEP_COPIES,
} from '@/lib/economy'
import type { Rarity } from '@/types/game'

export type SalvageLine = {
  cardId: string
  nameTh: string
  rarity: Rarity
  owned: number
  keep: number
  qty: number
  gemsEach: number
  gems: number
}

export type SalvagePlan = {
  lines: SalvageLine[]
  totalCards: number
  totalGems: number
  byRarity: Record<Rarity, { cards: number; gems: number }>
}

function emptyByRarity(): Record<Rarity, { cards: number; gems: number }> {
  return {
    C: { cards: 0, gems: 0 },
    R: { cards: 0, gems: 0 },
    SR: { cards: 0, gems: 0 },
    UR: { cards: 0, gems: 0 },
  }
}

/** Auto-select excess copies (owned − keep) for every card in inventory. */
export function buildSalvagePlan(
  inventory: Record<string, number> | Map<string, number>,
  keep = SALVAGE_KEEP_COPIES,
): SalvagePlan {
  const entries: [string, number][] =
    inventory instanceof Map
      ? [...inventory.entries()]
      : Object.entries(inventory)

  const lines: SalvageLine[] = []
  const byRarity = emptyByRarity()
  let totalCards = 0
  let totalGems = 0

  for (const [cardId, ownedRaw] of entries) {
    const owned = Math.max(0, Math.floor(Number(ownedRaw) || 0))
    const qty = Math.max(0, owned - keep)
    if (qty <= 0) continue
    const card = CARD_MAP[cardId]
    if (!card) continue
    const rarity = card.rarity
    const gemsEach = SALVAGE_GEMS_BY_RARITY[rarity]
    const gems = gemsEach * qty
    lines.push({
      cardId,
      nameTh: card.nameTh,
      rarity,
      owned,
      keep,
      qty,
      gemsEach,
      gems,
    })
    byRarity[rarity].cards += qty
    byRarity[rarity].gems += gems
    totalCards += qty
    totalGems += gems
  }

  lines.sort((a, b) => {
    const order: Record<Rarity, number> = { UR: 0, SR: 1, R: 2, C: 3 }
    const d = order[a.rarity] - order[b.rarity]
    if (d !== 0) return d
    return a.cardId.localeCompare(b.cardId)
  })

  return { lines, totalCards, totalGems, byRarity }
}
