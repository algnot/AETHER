import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import {
  canClaimDaily,
  computeNewStreak,
  dailyRewardAmount,
  DAILY_BASE_REWARD,
  DAILY_STREAK_BONUS,
  DAILY_STREAK_CAP,
} from '@/lib/economy'
import { User } from '@/lib/models/User'

export async function GET(req: NextRequest) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    const claimable = canClaimDaily(user.lastDailyClaimAt ?? null)
    const previewStreak = claimable
      ? computeNewStreak(user.dailyStreak ?? 0, user.lastDailyClaimAt ?? null)
      : user.dailyStreak ?? 0

    return NextResponse.json({
      coins: user.coins ?? 0,
      dailyStreak: user.dailyStreak ?? 0,
      canClaim: claimable,
      nextReward: dailyRewardAmount(previewStreak || 1),
      baseReward: DAILY_BASE_REWARD,
      streakBonus: DAILY_STREAK_BONUS,
      streakCap: DAILY_STREAK_CAP,
    })
  } catch (err) {
    console.error('daily GET', err)
    return jsonError('โหลดสถานะรายวันไม่สำเร็จ', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    if (!canClaimDaily(user.lastDailyClaimAt ?? null)) {
      return jsonError('รับรางวัลรายวันนี้ไปแล้ว พรุ่งนี้ค่อยมาใหม่', 409)
    }

    const now = new Date()
    const newStreak = computeNewStreak(
      user.dailyStreak ?? 0,
      user.lastDailyClaimAt ?? null,
      now,
    )
    const reward = dailyRewardAmount(newStreak)

    user.coins = (user.coins ?? 0) + reward
    user.dailyStreak = newStreak
    user.lastDailyClaimAt = now
    await user.save()

    return NextResponse.json({
      rewarded: reward,
      streak: newStreak,
      user: user.toPublic(),
    })
  } catch (err) {
    console.error('daily POST', err)
    return jsonError('รับรางวัลรายวันไม่สำเร็จ', 500)
  }
}
