import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { User } from '@/lib/models/User'

export async function GET(req: NextRequest) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    return NextResponse.json({ user: user.toPublic() })
  } catch (err) {
    console.error('me', err)
    return jsonError('โหลดโปรไฟล์ไม่สำเร็จ', 500)
  }
}
