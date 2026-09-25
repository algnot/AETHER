import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { jsonError, signToken } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { User } from '@/lib/models/User'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      username?: string
      password?: string
    }
    const username = String(body.username ?? '').trim()
    const password = String(body.password ?? '')

    await connectDb()
    const user = await User.findOne({ username })
    if (!user) {
      return jsonError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401)
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      return jsonError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401)
    }

    const token = signToken(user._id.toString())
    return NextResponse.json({ token, user: user.toPublic() })
  } catch (err) {
    console.error('login', err)
    return jsonError('เข้าสู่ระบบไม่สำเร็จ', 500)
  }
}
