import { authHeaders, parseJson, type AuthUser } from './auth'
import type { Rarity } from '../types/game'

export type BoxProgressView = {
  packsLeft: number
  packsOpened: number
  packsTotal: number
  urLeft: number
  srLeft: number
  rLeft: number
  urGot: number
  srGot: number
  reboxCount: number
  isEmpty: boolean
}

export type GachaBoxView = {
  id: string
  name: string
  nameTh: string
  prefix: string
  packCost: number
  packsPerBox: number
  cardsPerPack: number
  commonsPerPack?: number
  urPerBox: number
  srPerBox: number
  rareRates: { R: number; SR: number; UR: number }
  pool: { C: number; R: number; SR: number; UR: number; total: number }
  progress: BoxProgressView
}

export type GachaPullCard = { cardId: string; rarity: Rarity }

export type GachaHistoryEntry = {
  boxId: string
  at: string
  cost: number
  packIndex: number
  reboxCount: number
  cards: GachaPullCard[]
}

export async function apiGachaBoxes(token: string) {
  const res = await fetch('/api/gacha/boxes', { headers: authHeaders(token) })
  return parseJson<{ coins: number; boxes: GachaBoxView[] }>(res)
}

export async function apiGachaBox(token: string, boxId: string) {
  const res = await fetch(`/api/gacha/boxes/${boxId}`, {
    headers: authHeaders(token),
  })
  return parseJson<{ coins: number; box: GachaBoxView }>(res)
}

export async function apiGachaOpen(token: string, boxId: string) {
  const res = await fetch(`/api/gacha/boxes/${boxId}/open`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  return parseJson<{
    cards: GachaPullCard[]
    cost: number
    packIndex: number
    autoReboxed?: boolean
    openedReboxCount?: number
    progress: BoxProgressView
    user: AuthUser
  }>(res)
}

export async function apiGachaOpenAll(token: string, boxId: string) {
  const res = await fetch(`/api/gacha/boxes/${boxId}/open-all`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  return parseJson<{
    packs: {
      packIndex: number
      reboxCount: number
      cards: GachaPullCard[]
      cost: number
    }[]
    packsOpened: number
    totalCost: number
    autoReboxed?: boolean
    progress: BoxProgressView
    user: AuthUser
  }>(res)
}

export async function apiGachaRebox(token: string, boxId: string) {
  const res = await fetch(`/api/gacha/boxes/${boxId}/rebox`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  return parseJson<{
    progress: BoxProgressView
    user: AuthUser
    message: string
  }>(res)
}

export async function apiGachaHistory(token: string, boxId: string, limit = 30) {
  const res = await fetch(
    `/api/gacha/boxes/${boxId}/history?limit=${limit}`,
    { headers: authHeaders(token) },
  )
  return parseJson<{ history: GachaHistoryEntry[] }>(res)
}
