import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { getGachaBox, remainingInBox } from '@/data/gachaBoxes'
import { openPack, reboxProgress } from '@/lib/gacha'
import {
  addToInventory,
  getBoxProgress,
  setBoxProgress,
  User,
} from '@/lib/models/User'

type Ctx = { params: Promise<{ boxId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    const { boxId } = await ctx.params
    const box = getGachaBox(boxId)
    if (!box) return jsonError('ไม่พบกล่องนี้', 404)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    let progress = getBoxProgress(user, box.id)
    // Stale empty box (e.g. older clients) — start a new box before opening
    if (remainingInBox(box, progress).isEmpty) {
      progress = reboxProgress(progress)
      setBoxProgress(user, box.id, progress)
    }

    const cost = box.packCost
    if ((user.coins ?? 0) < cost) {
      return jsonError(`เหรียญไม่พอ (ต้องการ ${cost})`, 400)
    }

    let result
    try {
      result = openPack(box, progress)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'BOX_EMPTY') {
        return jsonError('กล่องนี้เปิดครบแล้ว', 409)
      }
      throw e
    }

    const packIndex = result.progress.packsOpened
    const historyReboxCount = result.progress.reboxCount
    let savedProgress = result.progress
    let autoReboxed = false
    if (remainingInBox(box, result.progress).isEmpty) {
      savedProgress = reboxProgress(result.progress)
      autoReboxed = true
    }

    user.coins = (user.coins ?? 0) - cost
    setBoxProgress(user, box.id, savedProgress)
    for (const c of result.cards) {
      addToInventory(user, c.cardId, 1)
    }

    const entry = {
      boxId: box.id,
      at: new Date(),
      cost,
      packIndex,
      reboxCount: historyReboxCount,
      cards: result.cards,
    }
    const history = user.gachaHistory ?? []
    history.unshift(entry)
    user.gachaHistory = history.slice(0, 80)
    user.markModified('gachaHistory')
    user.markModified('gachaBoxes')
    user.markModified('inventory')
    await user.save()

    return NextResponse.json({
      cards: result.cards,
      cost,
      packIndex,
      autoReboxed,
      openedReboxCount: historyReboxCount,
      progress: remainingInBox(box, savedProgress),
      user: user.toPublic(),
    })
  } catch (err) {
    console.error('gacha open', err)
    return jsonError('เปิดซองไม่สำเร็จ', 500)
  }
}
