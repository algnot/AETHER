import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { getGachaBox } from '@/data/gachaBoxes'
import { User } from '@/lib/models/User'

type Ctx = { params: Promise<{ boxId: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    const { boxId } = await ctx.params
    const box = getGachaBox(boxId)
    if (!box) return jsonError('ไม่พบกล่องนี้', 404)

    const limit = Math.min(
      50,
      Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 30) || 30),
    )

    await connectDb()
    const user = await User.findById(userId).select('gachaHistory')
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    const history = (user.gachaHistory ?? [])
      .filter((h) => h.boxId === box.id)
      .slice(0, limit)
      .map((h) => ({
        boxId: h.boxId,
        at: h.at,
        cost: h.cost,
        packIndex: h.packIndex,
        reboxCount: h.reboxCount,
        cards: h.cards,
      }))

    return NextResponse.json({ history })
  } catch (err) {
    console.error('gacha history', err)
    return jsonError('โหลดประวัติไม่สำเร็จ', 500)
  }
}
