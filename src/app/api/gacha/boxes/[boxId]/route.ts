import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { getGachaBox, remainingInBox } from '@/data/gachaBoxes'
import { boxPoolSummary } from '@/lib/gacha'
import { getBoxProgress, User } from '@/lib/models/User'

type Ctx = { params: Promise<{ boxId: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    const { boxId } = await ctx.params
    const box = getGachaBox(boxId)
    if (!box) return jsonError('ไม่พบกล่องนี้', 404)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    const progress = getBoxProgress(user, box.id)
    return NextResponse.json({
      coins: user.coins ?? 0,
      box: {
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
      },
    })
  } catch (err) {
    console.error('gacha box detail', err)
    return jsonError('โหลดกล่องไม่สำเร็จ', 500)
  }
}
