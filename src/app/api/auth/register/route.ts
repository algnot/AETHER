import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { jsonError, signToken } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { User } from '@/lib/models/User'
import { starterInventory } from '@/lib/starterInventory'
import { STARTING_COINS } from '@/lib/economy'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      username?: string
      password?: string
    }
    const username = String(body.username ?? '').trim()
    const password = String(body.password ?? '')

    if (username.length < 3 || username.length > 24) {
      return jsonError('ชื่อผู้ใช้ยาว 3–24 ตัวอักษร (a-z, 0-9, _)', 400)
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return jsonError('ชื่อผู้ใช้ใช้ได้แค่ตัวอักษร ตัวเลข และ _', 400)
    }
    if (password.length < 6) {
      return jsonError('รหัสผ่านอย่างน้อย 6 ตัวอักษร', 400)
    }

    await connectDb()
    const exists = await User.findOne({ username })
    if (exists) return jsonError('ชื่อผู้ใช้นี้มีแล้ว', 409)

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      username,
      passwordHash,
      inventory: starterInventory(),
      coins: STARTING_COINS,
      dailyStreak: 0,
      lastDailyClaimAt: null,
    })
    const token = signToken(user._id.toString())
    return NextResponse.json({ token, user: user.toPublic() }, { status: 201 })
  } catch (err) {
    console.error('register', err)
    return jsonError('สมัครไม่สำเร็จ', 500)
  }
}
