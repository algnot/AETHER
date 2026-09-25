import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { GACHA_BOX_LIST, remainingInBox, canOpenGacha } from '@/data/gachaBoxes'
import { boxPoolSummary } from '@/lib/gacha'
import { getBoxProgress, User } from '@/lib/models/User'

export async function GET(req: NextRequest) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    const boxes = GACHA_BOX_LIST.map((box) => {
      const progress = getBoxProgress(user, box.id)
      return {
        id: box.id,
        name: box.name,
        nameTh: box.nameTh,
        prefix: box.prefix,
        packCost: box.packCost,
        packsPerBox: box.packsPerBox,
        cardsPerPack: box.cardsPerPack,
        urPerBox: box.urPerBox,
        srPerBox: box.srPerBox,
        rareRates: box.rareRates,
        pool: boxPoolSummary(box),
        progress: remainingInBox(box, progress),
        gachaEnabled: canOpenGacha(box, user),
      }
    })

    return NextResponse.json({ coins: user.coins ?? 0, boxes })
  } catch (err) {
    console.error('gacha boxes', err)
    return jsonError('โหลดกล่องกาชาไม่สำเร็จ', 500)
  }
}
