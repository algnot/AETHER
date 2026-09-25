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
  /** Which pool this line dismantles */
  evolved: boolean
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

function toRecord(
  value: Record<string, number> | Map<string, number> | undefined | null,
): Record<string, number> {
  if (!value) return {}
  if (value instanceof Map) {
    const out: Record<string, number> = {}
    for (const [k, v] of value.entries()) out[k] = v
    return out
  }
  return { ...value }
}

function pushLine(
  lines: SalvageLine[],
  byRarity: Record<Rarity, { cards: number; gems: number }>,
  totals: { cards: number; gems: number },
  cardId: string,
  evolved: boolean,
  owned: number,
  keep: number,
) {
  const qty = Math.max(0, owned - keep)
  if (qty <= 0) return
  const card = CARD_MAP[cardId]
  if (!card) return
  const rarity = card.rarity
  const gemsEach = SALVAGE_GEMS_BY_RARITY[rarity]
  const gems = gemsEach * qty
  lines.push({
    cardId,
    nameTh: card.nameTh,
    rarity,
    evolved,
    owned,
    keep,
    qty,
    gemsEach,
    gems,
  })
  byRarity[rarity].cards += qty
  byRarity[rarity].gems += gems
  totals.cards += qty
  totals.gems += gems
}

/**
 * Excess copies per variant: keep up to `keep` normals and `keep` evolved
 * of each cardId independently.
 */
export function buildSalvagePlan(
  inventory: Record<string, number> | Map<string, number>,
  evolved?: Record<string, number> | Map<string, number> | null,
  keep = SALVAGE_KEEP_COPIES,
): SalvagePlan {
  const inv = toRecord(inventory)
  const evoMap = toRecord(evolved)
  const lines: SalvageLine[] = []
  const byRarity = emptyByRarity()
  const totals = { cards: 0, gems: 0 }

  for (const [cardId, ownedRaw] of Object.entries(inv)) {
    const owned = Math.max(0, Math.floor(Number(ownedRaw) || 0))
    if (owned <= 0) continue
    const evoOwned = Math.min(
      owned,
      Math.max(0, Math.floor(Number(evoMap[cardId]) || 0)),
    )
    const normalOwned = owned - evoOwned
    pushLine(lines, byRarity, totals, cardId, false, normalOwned, keep)
    pushLine(lines, byRarity, totals, cardId, true, evoOwned, keep)
  }

  lines.sort((a, b) => {
    const order: Record<Rarity, number> = { UR: 0, SR: 1, R: 2, C: 3 }
    const d = order[a.rarity] - order[b.rarity]
    if (d !== 0) return d
    const idCmp = a.cardId.localeCompare(b.cardId)
    if (idCmp !== 0) return idCmp
    return Number(b.evolved) - Number(a.evolved)
  })

  return {
    lines,
    totalCards: totals.cards,
    totalGems: totals.gems,
    byRarity,
  }
}
