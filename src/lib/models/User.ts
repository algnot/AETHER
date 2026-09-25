import mongoose, { Schema, type Model } from 'mongoose'
import { canClaimDaily } from '@/lib/economy'
import type { BoxProgress } from '@/data/gachaBoxes'
import type { Rarity } from '@/types/game'

export type PublicUser = {
  id: string
  username: string
  inventory: Record<string, number>
  coins: number
  gems: number
  dailyStreak: number
  canClaimDaily: boolean
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
  coins: number
  gems: number
  dailyStreak: number
  lastDailyClaimAt?: Date | null
  gachaBoxes: Map<string, BoxProgress> | Record<string, BoxProgress>
  gachaHistory: GachaHistoryEntry[]
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
  },
  { timestamps: true },
)

userSchema.methods.toPublic = function toPublic(): PublicUser {
  const inventory: Record<string, number> = {}
  if (this.inventory instanceof Map) {
    for (const [k, v] of this.inventory.entries()) inventory[k] = v
  } else if (this.inventory && typeof this.inventory === 'object') {
    Object.assign(inventory, this.inventory)
  }
  return {
    id: this._id.toString(),
    username: this.username,
    inventory,
    coins: this.coins ?? 0,
    gems: this.gems ?? 0,
    dailyStreak: this.dailyStreak ?? 0,
    canClaimDaily: canClaimDaily(this.lastDailyClaimAt ?? null),
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
    return true
  }
  const inv = user.inventory as Record<string, number>
  const cur = inv[cardId] ?? 0
  if (cur < n) return false
  const next = cur - n
  if (next <= 0) delete inv[cardId]
  else inv[cardId] = next
  user.markModified?.('inventory')
  return true
}
