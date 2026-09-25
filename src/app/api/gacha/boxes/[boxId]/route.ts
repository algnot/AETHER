import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { resolveGachaBox } from '@/lib/resolveGachaBox'
import { serializeGachaBox } from '@/lib/serializeGachaBox'
import { User } from '@/lib/models/User'

type Ctx = { params: Promise<{ boxId: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    const { boxId } = await ctx.params
    await connectDb()
    const box = await resolveGachaBox(boxId)
    if (!box) return jsonError('ไม่พบกล่องนี้', 404)

    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    return NextResponse.json({
      coins: user.coins ?? 0,
      box: serializeGachaBox(box, user),
    })
  } catch (err) {
    console.error('gacha box detail', err)
    return jsonError('โหลดกล่องไม่สำเร็จ', 500)
  }
}
