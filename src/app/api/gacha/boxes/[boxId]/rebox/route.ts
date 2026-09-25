import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { getGachaBox, remainingInBox } from '@/data/gachaBoxes'
import { reboxProgress } from '@/lib/gacha'
import { getBoxProgress, setBoxProgress, User } from '@/lib/models/User'

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

    const progress = getBoxProgress(user, box.id)
    const next = reboxProgress(progress)
    setBoxProgress(user, box.id, next)
    user.markModified('gachaBoxes')
    await user.save()

    return NextResponse.json({
      progress: remainingInBox(box, next),
      user: user.toPublic(),
      message: 'เริ่มกล่องใหม่แล้ว (Rebox)',
    })
  } catch (err) {
    console.error('gacha rebox', err)
    return jsonError('Rebox ไม่สำเร็จ', 500)
  }
}
