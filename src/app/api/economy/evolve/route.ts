import { NextRequest, NextResponse } from 'next/server'
import { getCard } from '@/data/cards'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { EVO_COST_BY_RARITY, evoCostForRarity } from '@/lib/economy'
import {
  User,
  addEvolved,
  getEvolvedCount,
  getInventoryCount,
} from '@/lib/models/User'

export async function GET() {
  return NextResponse.json({ costs: EVO_COST_BY_RARITY })
}

export async function POST(req: NextRequest) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    const body = (await req.json().catch(() => null)) as {
      cardId?: string
      amount?: number
    } | null
    const cardId = typeof body?.cardId === 'string' ? body.cardId.trim() : ''
    const amount = Math.max(1, Math.floor(Number(body?.amount) || 1))

    if (!cardId) return jsonError('ระบุรหัสการ์ด', 400)

    let def
    try {
      def = getCard(cardId)
    } catch {
      return jsonError('ไม่พบการ์ดนี้', 404)
    }

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    if (!user.evolved) {
      user.evolved = new Map()
    }

    const owned = getInventoryCount(user, cardId)
    const evolved = getEvolvedCount(user, cardId)
    const unevolved = owned - evolved
    if (unevolved < amount) {
      return jsonError(
        owned <= 0
          ? 'ยังไม่มีการ์ดใบนี้ในคลัง'
          : `วิวัฒนาการได้สูงสุด ${unevolved} ใบ (มี ${owned} · evo แล้ว ${evolved})`,
        400,
      )
    }

    const costEach = evoCostForRarity(def.rarity)
    const totalCost = costEach * amount
    const gems = user.gems ?? 0
    if (gems < totalCost) {
      return jsonError(
        `เพชรไม่พอ (ต้องการ ${totalCost.toLocaleString('th-TH')} · มี ${gems.toLocaleString('th-TH')})`,
        400,
      )
    }

    user.gems = gems - totalCost
    addEvolved(user, cardId, amount)
    user.markModified('evolved')
    await user.save()

    return NextResponse.json({
      cardId,
      amount,
      costEach,
      totalCost,
      rarity: def.rarity,
      user: user.toPublic(),
    })
  } catch (err) {
    console.error('evolve POST', err)
    return jsonError('วิวัฒนาการการ์ดไม่สำเร็จ', 500)
  }
}
