import {
  canOpenGacha,
  isGachaEnabled,
  remainingInBox,
  type GachaBoxDef,
} from '@/data/gachaBoxes'
import { boxPoolSummary } from '@/lib/gacha'
import { getBoxProgress } from '@/lib/models/User'
import type { BoxProgress } from '@/data/gachaBoxes'

type GachaUser = {
  is_dev?: boolean
  isDev?: boolean
  gachaBoxes?: Map<string, BoxProgress> | Record<string, BoxProgress>
  coins?: number
}

export function serializeGachaBox(box: GachaBoxDef, user: GachaUser) {
  const progress = getBoxProgress(user, box.id)
  return {
    id: box.id,
    name: box.name,
    nameTh: box.nameTh,
    prefix: box.prefix,
    packCost: box.packCost,
    packsPerBox: box.packsPerBox,
    cardsPerPack: box.cardsPerPack,
    commonsPerPack: box.commonsPerPack,
    urPerBox: box.urPerBox,
    srPerBox: box.srPerBox,
    rareRates: box.rareRates,
    pool: boxPoolSummary(box),
    progress: remainingInBox(box, progress),
    /** Whether this account may open packs (public OR is_dev) */
    gachaEnabled: canOpenGacha(box, user),
    /** Raw public switch after static+DB merge */
    publicEnabled: isGachaEnabled(box),
  }
}
