import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { getGachaBox, remainingInBox, canOpenGacha } from '@/data/gachaBoxes'
import { openPack, reboxProgress, type PulledCard } from '@/lib/gacha'
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
    if (!canOpenGacha(box, user)) {
      return jsonError('กล่องนี้ยังไม่เปิดให้สุ่มซอง — ดูการ์ดได้จากแท็บในกล่อง', 403)
    }

    let progress = getBoxProgress(user, box.id)
    if (remainingInBox(box, progress).isEmpty) {
      progress = reboxProgress(progress)
      setBoxProgress(user, box.id, progress)
    }

    const rem = remainingInBox(box, progress)
    const packsToOpen = rem.packsLeft
    if (packsToOpen <= 0) {
      return jsonError('กล่องนี้ไม่มีซองเหลือ', 409)
    }

    const totalCost = packsToOpen * box.packCost
    if ((user.coins ?? 0) < totalCost) {
      return jsonError(
        `เหรียญไม่พอ (ต้องการ ${totalCost} สำหรับ ${packsToOpen} ซอง)`,
        400,
      )
    }

    const packs: {
      packIndex: number
      reboxCount: number
      cards: PulledCard[]
      cost: number
    }[] = []

    let cursor = progress
    for (let i = 0; i < packsToOpen; i++) {
      const result = openPack(box, cursor)
      packs.push({
        packIndex: result.progress.packsOpened,
        reboxCount: result.progress.reboxCount,
        cards: result.cards,
        cost: box.packCost,
      })
      cursor = result.progress
    }

    let savedProgress = cursor
    let autoReboxed = false
    if (remainingInBox(box, cursor).isEmpty) {
      savedProgress = reboxProgress(cursor)
      autoReboxed = true
    }

    user.coins = (user.coins ?? 0) - totalCost
    setBoxProgress(user, box.id, savedProgress)

    const history = user.gachaHistory ?? []
    for (let i = packs.length - 1; i >= 0; i--) {
      const p = packs[i]!
      for (const c of p.cards) {
        addToInventory(user, c.cardId, 1)
      }
      history.unshift({
        boxId: box.id,
        at: new Date(),
        cost: p.cost,
        packIndex: p.packIndex,
        reboxCount: p.reboxCount,
        cards: p.cards,
      })
    }
    user.gachaHistory = history.slice(0, 80)
    user.markModified('gachaHistory')
    user.markModified('gachaBoxes')
    user.markModified('inventory')
    await user.save()

    return NextResponse.json({
      packs,
      packsOpened: packs.length,
      totalCost,
      autoReboxed,
      progress: remainingInBox(box, savedProgress),
      user: user.toPublic(),
    })
  } catch (err) {
    console.error('gacha open-all', err)
    return jsonError('เปิดทั้งกล่องไม่สำเร็จ', 500)
  }
}
