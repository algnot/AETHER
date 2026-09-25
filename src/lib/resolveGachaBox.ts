import {
  GACHA_BOX_LIST,
  getGachaBox,
  type GachaBoxDef,
} from '@/data/gachaBoxes'
import {
  GachaBoxConfig,
  type GachaBoxConfigAttrs,
  type GachaBoxRareRates,
} from '@/lib/models/GachaBoxConfig'

export type GachaBoxConfigPatch = {
  gachaEnabled?: boolean
  urPerBox?: number
  srPerBox?: number
  packCost?: number
  rareRates?: Partial<GachaBoxRareRates>
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function normalizeRates(
  base: GachaBoxRareRates,
  patch?: Partial<GachaBoxRareRates> | null,
): GachaBoxRareRates {
  if (!patch) return { ...base }
  const R = isNum(patch.R) ? Math.max(0, patch.R) : base.R
  const SR = isNum(patch.SR) ? Math.max(0, patch.SR) : base.SR
  const UR = isNum(patch.UR) ? Math.max(0, patch.UR) : base.UR
  const sum = R + SR + UR
  if (sum <= 0) return { ...base }
  // Allow absolute weights or already-normalized rates
  if (Math.abs(sum - 1) < 0.001) return { R, SR, UR }
  return { R: R / sum, SR: SR / sum, UR: UR / sum }
}

export function mergeGachaBox(
  base: GachaBoxDef,
  override?: GachaBoxConfigAttrs | null,
): GachaBoxDef {
  if (!override) return { ...base, rareRates: { ...base.rareRates } }

  const next: GachaBoxDef = {
    ...base,
    rareRates: normalizeRates(base.rareRates, override.rareRates),
  }

  if (typeof override.gachaEnabled === 'boolean') {
    next.gachaEnabled = override.gachaEnabled
  }
  if (isNum(override.urPerBox) && override.urPerBox >= 0) {
    next.urPerBox = Math.floor(override.urPerBox)
  }
  if (isNum(override.srPerBox) && override.srPerBox >= 0) {
    next.srPerBox = Math.floor(override.srPerBox)
  }
  if (isNum(override.packCost) && override.packCost >= 0) {
    next.packCost = Math.floor(override.packCost)
  }

  return next
}

export async function loadGachaBoxOverrides(
  boxIds?: string[],
): Promise<Map<string, GachaBoxConfigAttrs>> {
  const filter =
    boxIds && boxIds.length > 0 ? { boxId: { $in: boxIds } } : {}
  const rows = await GachaBoxConfig.find(filter).lean()
  const map = new Map<string, GachaBoxConfigAttrs>()
  for (const row of rows) {
    map.set(row.boxId, row as GachaBoxConfigAttrs)
  }
  return map
}

export async function resolveGachaBox(
  boxId: string,
): Promise<GachaBoxDef | null> {
  const base = getGachaBox(boxId)
  if (!base) return null
  const override = await GachaBoxConfig.findOne({ boxId }).lean()
  return mergeGachaBox(base, override as GachaBoxConfigAttrs | null)
}

export async function resolveGachaBoxList(): Promise<GachaBoxDef[]> {
  const ids = GACHA_BOX_LIST.map((b) => b.id)
  const overrides = await loadGachaBoxOverrides(ids)
  return GACHA_BOX_LIST.map((base) =>
    mergeGachaBox(base, overrides.get(base.id) ?? null),
  )
}

export async function upsertGachaBoxConfig(
  boxId: string,
  patch: GachaBoxConfigPatch,
): Promise<GachaBoxDef> {
  const base = getGachaBox(boxId)
  if (!base) throw new Error('BOX_NOT_FOUND')

  const existing = await GachaBoxConfig.findOne({ boxId })
  const nextRates = patch.rareRates
    ? normalizeRates(
        existing?.rareRates
          ? normalizeRates(base.rareRates, existing.rareRates)
          : base.rareRates,
        patch.rareRates,
      )
    : undefined

  const update: Partial<GachaBoxConfigAttrs> = {}
  if (typeof patch.gachaEnabled === 'boolean') {
    update.gachaEnabled = patch.gachaEnabled
  }
  if (isNum(patch.urPerBox)) update.urPerBox = Math.floor(Math.max(0, patch.urPerBox))
  if (isNum(patch.srPerBox)) update.srPerBox = Math.floor(Math.max(0, patch.srPerBox))
  if (isNum(patch.packCost)) update.packCost = Math.floor(Math.max(0, patch.packCost))
  if (nextRates) update.rareRates = nextRates

  const doc = await GachaBoxConfig.findOneAndUpdate(
    { boxId },
    { $set: { boxId, ...update } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()

  return mergeGachaBox(base, doc as GachaBoxConfigAttrs | null)
}
