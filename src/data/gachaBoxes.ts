import type { Rarity } from '../types/game'

export type GachaBoxId = 'S00'

export type GachaBoxDef = {
  id: GachaBoxId
  /** Display name */
  name: string
  nameTh: string
  /** Card id prefix, e.g. S00 → S0001…S0054 */
  prefix: string
  /** Pack / page art under public/ */
  coverArt: string
  /** Full-bleed screen background (wide scene, not pack product) */
  backgroundArt: string
  packsPerBox: number
  cardsPerPack: number
  commonsPerPack: number
  /** Guaranteed UR/SR in the rare slot across one box */
  urPerBox: number
  srPerBox: number
  packCost: number
  /** Soft rates for the rare slot (before pity) — must sum to 1 */
  rareRates: { R: number; SR: number; UR: number }
}

export const GACHA_BOXES: Record<GachaBoxId, GachaBoxDef> = {
  S00: {
    id: 'S00',
    name: 'Welcome to AETHER',
    nameTh: 'Welcome to AETHER',
    prefix: 'S00',
    coverArt: '/gacha/box-s00-pack.png',
    backgroundArt: '/gacha/box-s00-bg.png',
    packsPerBox: 20,
    cardsPerPack: 5,
    commonsPerPack: 4,
    urPerBox: 2,
    srPerBox: 4,
    packCost: 20,
    // Expected over 20 packs ≈ 14 R / 4 SR / 2 UR
    rareRates: { R: 0.7, SR: 0.2, UR: 0.1 },
  },
}

export const GACHA_BOX_LIST: GachaBoxDef[] = Object.values(GACHA_BOXES)

export function getGachaBox(boxId: string): GachaBoxDef | null {
  return (GACHA_BOXES as Record<string, GachaBoxDef>)[boxId] ?? null
}

export function cardBelongsToBox(cardId: string, box: GachaBoxDef): boolean {
  return cardId.startsWith(box.prefix)
}

export type BoxProgress = {
  packsOpened: number
  urGot: number
  srGot: number
  reboxCount: number
}

export function defaultBoxProgress(): BoxProgress {
  return { packsOpened: 0, urGot: 0, srGot: 0, reboxCount: 0 }
}

export type RarityStock = Record<Rarity, number>

export function remainingInBox(box: GachaBoxDef, progress: BoxProgress) {
  const packsLeft = Math.max(0, box.packsPerBox - progress.packsOpened)
  const urLeft = Math.max(0, box.urPerBox - progress.urGot)
  const srLeft = Math.max(0, box.srPerBox - progress.srGot)
  const rareSlotsLeft = packsLeft
  const rLeft = Math.max(0, rareSlotsLeft - urLeft - srLeft)
  return {
    packsLeft,
    packsOpened: progress.packsOpened,
    packsTotal: box.packsPerBox,
    urLeft,
    srLeft,
    rLeft,
    urGot: progress.urGot,
    srGot: progress.srGot,
    reboxCount: progress.reboxCount,
    isEmpty: packsLeft === 0,
  }
}
