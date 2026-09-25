import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { resolveGachaBoxList } from '@/lib/resolveGachaBox'
import { serializeGachaBox } from '@/lib/serializeGachaBox'
import { User } from '@/lib/models/User'

export async function GET(req: NextRequest) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    const boxes = (await resolveGachaBoxList()).map((box) =>
      serializeGachaBox(box, user),
    )

    return NextResponse.json({ coins: user.coins ?? 0, boxes })
  } catch (err) {
    console.error('gacha boxes', err)
    return jsonError('โหลดกล่องกาชาไม่สำเร็จ', 500)
  }
}
