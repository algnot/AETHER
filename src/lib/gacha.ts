import { CARD_DATABASE } from '@/data/cards'
import {
  type BoxProgress,
  type GachaBoxDef,
  cardBelongsToBox,
  remainingInBox,
} from '@/data/gachaBoxes'
import type { Rarity } from '@/types/game'

export type PulledCard = { cardId: string; rarity: Rarity }

function poolByRarity(box: GachaBoxDef): Record<Rarity, string[]> {
  const pools: Record<Rarity, string[]> = { C: [], R: [], SR: [], UR: [] }
  for (const c of CARD_DATABASE) {
    if (!cardBelongsToBox(c.id, box)) continue
    pools[c.rarity].push(c.id)
  }
  return pools
}

/** Pick one id and remove it from the working pool so a pack has no duplicates. */
function pickUnique(ids: string[], rng: () => number): string {
  if (ids.length === 0) throw new Error('empty card pool')
  const i = Math.floor(rng() * ids.length)
  return ids.splice(i, 1)[0]!
}

function rollRareSlot(
  box: GachaBoxDef,
  progress: BoxProgress,
  rng: () => number,
): 'R' | 'SR' | 'UR' {
  const { packsLeft, urLeft, srLeft } = remainingInBox(box, progress)
  if (packsLeft <= 0) throw new Error('box empty')

  const mustForce = urLeft + srLeft >= packsLeft

  if (mustForce) {
    if (urLeft > 0 && srLeft > 0) {
      return rng() < urLeft / (urLeft + srLeft) ? 'UR' : 'SR'
    }
    if (urLeft > 0) return 'UR'
    if (srLeft > 0) return 'SR'
    return 'R'
  }

  const roll = rng()
  const { SR, UR } = box.rareRates
  let choice: 'R' | 'SR' | 'UR'
  if (roll < UR) choice = 'UR'
  else if (roll < UR + SR) choice = 'SR'
  else choice = 'R'

  // Clamp to remaining guarantees / stock
  if (choice === 'UR' && urLeft <= 0) {
    choice = srLeft > 0 ? 'SR' : 'R'
  } else if (choice === 'SR' && srLeft <= 0) {
    choice = 'R'
  }

  return choice
}

/**
 * Open one pack from the current box progress.
 * Returns cards + updated progress (does not mutate input).
 * Cards within a single pack are always unique by cardId.
 */
export function openPack(
  box: GachaBoxDef,
  progress: BoxProgress,
  rng: () => number = Math.random,
): { cards: PulledCard[]; progress: BoxProgress } {
  const rem = remainingInBox(box, progress)
  if (rem.isEmpty) throw new Error('BOX_EMPTY')

  const base = poolByRarity(box)
  // Working copies — picks splice out so this pack cannot repeat an id
  const pools: Record<Rarity, string[]> = {
    C: [...base.C],
    R: [...base.R],
    SR: [...base.SR],
    UR: [...base.UR],
  }

  if (pools.C.length === 0) throw new Error('NO_COMMON_POOL')
  if (pools.C.length < box.commonsPerPack) {
    throw new Error('COMMON_POOL_TOO_SMALL')
  }

  const cards: PulledCard[] = []

  for (let i = 0; i < box.commonsPerPack; i++) {
    const cardId = pickUnique(pools.C, rng)
    cards.push({ cardId, rarity: 'C' })
  }

  const rare = rollRareSlot(box, progress, rng)
  let rareRarity: Rarity = rare
  let rarePool = pools[rare]
  if (rarePool.length === 0) {
    const fallback =
      (rare === 'UR' && pools.SR.length && ('SR' as const)) ||
      (pools.R.length && ('R' as const)) ||
      (pools.C.length && ('C' as const)) ||
      null
    if (!fallback) throw new Error('NO_RARE_POOL')
    rareRarity = fallback
    rarePool = pools[fallback]
  }
  const rareId = pickUnique(rarePool, rng)
  cards.push({ cardId: rareId, rarity: rareRarity })

  // Put rare last for reveal flair; shuffle commons only
  const commons = cards.slice(0, box.commonsPerPack)
  for (let i = commons.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[commons[i], commons[j]] = [commons[j]!, commons[i]!]
  }
  const rareCard = cards[cards.length - 1]!
  const ordered = [...commons, rareCard]

  const next: BoxProgress = {
    packsOpened: progress.packsOpened + 1,
    urGot: progress.urGot + (rareCard.rarity === 'UR' ? 1 : 0),
    srGot: progress.srGot + (rareCard.rarity === 'SR' ? 1 : 0),
    reboxCount: progress.reboxCount,
  }

  return { cards: ordered, progress: next }
}

export function reboxProgress(progress: BoxProgress): BoxProgress {
  return {
    packsOpened: 0,
    urGot: 0,
    srGot: 0,
    reboxCount: progress.reboxCount + 1,
  }
}

export function boxPoolSummary(box: GachaBoxDef): RarityStockLike {
  const pools = poolByRarity(box)
  return {
    C: pools.C.length,
    R: pools.R.length,
    SR: pools.SR.length,
    UR: pools.UR.length,
    total: pools.C.length + pools.R.length + pools.SR.length + pools.UR.length,
  }
}

type RarityStockLike = Record<Rarity, number> & { total: number }
