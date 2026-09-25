import mongoose, { Schema, type Model } from 'mongoose'
import { canClaimDaily } from '@/lib/economy'
import type { BoxProgress } from '@/data/gachaBoxes'
import type { Rarity } from '@/types/game'

export type PublicUser = {
  id: string
  username: string
  inventory: Record<string, number>
  /** Evolved copy counts per cardId (0 ≤ evolved ≤ inventory) */
  evolved: Record<string, number>
  coins: number
  gems: number
  dailyStreak: number
  canClaimDaily: boolean
  /** Dev accounts may open preview-only gacha boxes */
  isDev: boolean
}

export type GachaHistoryEntry = {
  boxId: string
  at: Date
  cost: number
  packIndex: number
  reboxCount: number
  cards: { cardId: string; rarity: Rarity }[]
}

type UserMethods = {
  toPublic(): PublicUser
}

type UserModel = Model<UserAttrs, object, UserMethods>

type UserAttrs = {
  username: string
  passwordHash: string
  inventory: Map<string, number> | Record<string, number>
  evolved: Map<string, number> | Record<string, number>
  coins: number
  gems: number
  dailyStreak: number
  lastDailyClaimAt?: Date | null
  gachaBoxes: Map<string, BoxProgress> | Record<string, BoxProgress>
  gachaHistory: GachaHistoryEntry[]
  /** Mongo field `is_dev` — unlocks unreleased gacha boxes */
  is_dev?: boolean
}

function mapToRecord(
  value: Map<string, number> | Record<string, number> | undefined | null,
): Record<string, number> {
  const out: Record<string, number> = {}
  if (!value) return out
  if (value instanceof Map) {
    for (const [k, v] of value.entries()) out[k] = v
  } else if (typeof value === 'object') {
    Object.assign(out, value)
  }
  return out
}

const boxProgressSchema = new Schema(
  {
    packsOpened: { type: Number, default: 0 },
    urGot: { type: Number, default: 0 },
    srGot: { type: Number, default: 0 },
    reboxCount: { type: Number, default: 0 },
  },
  { _id: false },
)

const historyCardSchema = new Schema(
  {
    cardId: { type: String, required: true },
    rarity: { type: String, required: true },
  },
  { _id: false },
)

const historyEntrySchema = new Schema(
  {
    boxId: { type: String, required: true },
    at: { type: Date, default: Date.now },
    cost: { type: Number, required: true },
    packIndex: { type: Number, required: true },
    reboxCount: { type: Number, default: 0 },
    cards: { type: [historyCardSchema], default: [] },
  },
  { _id: false },
)

const userSchema = new Schema<UserAttrs, UserModel, UserMethods>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-zA-Z0-9_]+$/,
    },
    passwordHash: { type: String, required: true },
    inventory: {
      type: Map,
      of: Number,
      default: {},
    },
    evolved: {
      type: Map,
      of: Number,
      default: {},
    },
    coins: { type: Number, default: 0, min: 0 },
    gems: { type: Number, default: 0, min: 0 },
    dailyStreak: { type: Number, default: 0, min: 0 },
    lastDailyClaimAt: { type: Date, default: null },
    gachaBoxes: {
      type: Map,
      of: boxProgressSchema,
      default: {},
    },
    gachaHistory: {
      type: [historyEntrySchema],
      default: [],
    },
    is_dev: { type: Boolean, default: false },
  },
  { timestamps: true },
)

userSchema.methods.toPublic = function toPublic(): PublicUser {
  const inventory = mapToRecord(this.inventory)
  const evolvedRaw = mapToRecord(this.evolved)
  const evolved: Record<string, number> = {}
  for (const [id, n] of Object.entries(evolvedRaw)) {
    const owned = inventory[id] ?? 0
    const evo = Math.min(Math.max(0, Math.floor(n)), owned)
    if (evo > 0) evolved[id] = evo
  }
  return {
    id: this._id.toString(),
    username: this.username,
    inventory,
    evolved,
    coins: this.coins ?? 0,
    gems: this.gems ?? 0,
    dailyStreak: this.dailyStreak ?? 0,
    canClaimDaily: canClaimDaily(this.lastDailyClaimAt ?? null),
    isDev: !!this.is_dev,
  }
}

if (mongoose.models.User) {
  delete mongoose.models.User
  delete (mongoose.connection.models as Record<string, unknown>).User
}

export const User = mongoose.model<UserAttrs, UserModel>('User', userSchema)

export function getBoxProgress(
  user: { gachaBoxes?: Map<string, BoxProgress> | Record<string, BoxProgress> },
  boxId: string,
): BoxProgress {
  const raw = user.gachaBoxes
  let p: BoxProgress | undefined
  if (raw instanceof Map) p = raw.get(boxId)
  else if (raw && typeof raw === 'object') {
    p = (raw as Record<string, BoxProgress>)[boxId]
  }
  return {
    packsOpened: p?.packsOpened ?? 0,
    urGot: p?.urGot ?? 0,
    srGot: p?.srGot ?? 0,
    reboxCount: p?.reboxCount ?? 0,
  }
}

export function setBoxProgress(
  user: {
    gachaBoxes: Map<string, BoxProgress> | Record<string, BoxProgress>
    markModified?: (path: string) => void
  },
  boxId: string,
  progress: BoxProgress,
) {
  if (user.gachaBoxes instanceof Map) {
    user.gachaBoxes.set(boxId, progress)
  } else {
    ;(user.gachaBoxes as Record<string, BoxProgress>)[boxId] = progress
    user.markModified?.('gachaBoxes')
  }
}

export function addToInventory(
  user: {
    inventory: Map<string, number> | Record<string, number>
    markModified?: (path: string) => void
  },
  cardId: string,
  amount = 1,
) {
  if (user.inventory instanceof Map) {
    user.inventory.set(cardId, (user.inventory.get(cardId) ?? 0) + amount)
  } else {
    const inv = user.inventory as Record<string, number>
    inv[cardId] = (inv[cardId] ?? 0) + amount
    user.markModified?.('inventory')
  }
}

/** Returns false if inventory does not have enough copies. */
export function removeFromInventory(
  user: {
    inventory: Map<string, number> | Record<string, number>
    evolved?: Map<string, number> | Record<string, number>
    markModified?: (path: string) => void
  },
  cardId: string,
  amount = 1,
): boolean {
  const n = Math.max(0, Math.floor(amount))
  if (n <= 0) return true
  if (user.inventory instanceof Map) {
    const cur = user.inventory.get(cardId) ?? 0
    if (cur < n) return false
    const next = cur - n
    if (next <= 0) user.inventory.delete(cardId)
    else user.inventory.set(cardId, next)
    clampEvolvedToInventory(user, cardId)
    return true
  }
  const inv = user.inventory as Record<string, number>
  const cur = inv[cardId] ?? 0
  if (cur < n) return false
  const next = cur - n
  if (next <= 0) delete inv[cardId]
  else inv[cardId] = next
  user.markModified?.('inventory')
  clampEvolvedToInventory(user, cardId)
  return true
}

export function getEvolvedCount(
  user: {
    evolved?: Map<string, number> | Record<string, number>
  },
  cardId: string,
): number {
  if (!user.evolved) return 0
  if (user.evolved instanceof Map) return user.evolved.get(cardId) ?? 0
  return (user.evolved as Record<string, number>)[cardId] ?? 0
}

export function getInventoryCount(
  user: {
    inventory: Map<string, number> | Record<string, number>
  },
  cardId: string,
): number {
  if (user.inventory instanceof Map) return user.inventory.get(cardId) ?? 0
  return (user.inventory as Record<string, number>)[cardId] ?? 0
}

/** Increment evolved copies (caller must validate gems / available unevolved). */
export function addEvolved(
  user: {
    evolved: Map<string, number> | Record<string, number>
    markModified?: (path: string) => void
  },
  cardId: string,
  amount = 1,
) {
  const n = Math.max(0, Math.floor(amount))
  if (n <= 0) return
  if (user.evolved instanceof Map) {
    user.evolved.set(cardId, (user.evolved.get(cardId) ?? 0) + n)
  } else {
    const evo = user.evolved as Record<string, number>
    evo[cardId] = (evo[cardId] ?? 0) + n
    user.markModified?.('evolved')
  }
}

/** Decrement evolved copies (does not touch inventory). */
export function removeEvolved(
  user: {
    evolved?: Map<string, number> | Record<string, number>
    markModified?: (path: string) => void
  },
  cardId: string,
  amount = 1,
): boolean {
  const n = Math.max(0, Math.floor(amount))
  if (n <= 0) return true
  if (!user.evolved) return false
  const cur = getEvolvedCount(user, cardId)
  if (cur < n) return false
  const next = cur - n
  if (user.evolved instanceof Map) {
    if (next <= 0) user.evolved.delete(cardId)
    else user.evolved.set(cardId, next)
  } else {
    const evo = user.evolved as Record<string, number>
    if (next <= 0) delete evo[cardId]
    else evo[cardId] = next
    user.markModified?.('evolved')
  }
  return true
}

/** Keep evolved ≤ inventory after salvage / removals. */
export function clampEvolvedToInventory(
  user: {
    inventory: Map<string, number> | Record<string, number>
    evolved?: Map<string, number> | Record<string, number>
    markModified?: (path: string) => void
  },
  cardId?: string,
) {
  if (!user.evolved) return
  const ids = cardId
    ? [cardId]
    : user.evolved instanceof Map
      ? [...user.evolved.keys()]
      : Object.keys(user.evolved as Record<string, number>)

  for (const id of ids) {
    const owned = getInventoryCount(user, id)
    const cur = getEvolvedCount(user, id)
    const next = Math.min(cur, owned)
    if (next === cur) continue
    if (user.evolved instanceof Map) {
      if (next <= 0) user.evolved.delete(id)
      else user.evolved.set(id, next)
    } else {
      const evo = user.evolved as Record<string, number>
      if (next <= 0) delete evo[id]
      else evo[id] = next
      user.markModified?.('evolved')
    }
  }
}
