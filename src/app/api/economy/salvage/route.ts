import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import {
  SALVAGE_GEMS_BY_RARITY,
  SALVAGE_KEEP_COPIES,
} from '@/lib/economy'
import { User, removeFromInventory } from '@/lib/models/User'
import { buildSalvagePlan } from '@/lib/salvage'

function inventoryRecord(
  inventory: Map<string, number> | Record<string, number> | undefined,
): Record<string, number> {
  if (!inventory) return {}
  if (inventory instanceof Map) {
    const out: Record<string, number> = {}
    for (const [k, v] of inventory.entries()) out[k] = v
    return out
  }
  return { ...inventory }
}

export async function GET(req: NextRequest) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    const plan = buildSalvagePlan(inventoryRecord(user.inventory))
    return NextResponse.json({
      keep: SALVAGE_KEEP_COPIES,
      rates: SALVAGE_GEMS_BY_RARITY,
      gems: user.gems ?? 0,
      plan,
    })
  } catch (err) {
    console.error('salvage GET', err)
    return jsonError('โหลดแผนย่อยการ์ดไม่สำเร็จ', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    const plan = buildSalvagePlan(inventoryRecord(user.inventory))
    if (plan.totalCards <= 0) {
      return jsonError('ไม่มีการ์ดส่วนเกินให้ย่อย (เก็บได้สูงสุด 3 ใบ/ชนิด)', 400)
    }

    for (const line of plan.lines) {
      const ok = removeFromInventory(user, line.cardId, line.qty)
      if (!ok) {
        return jsonError('คลังการ์ดเปลี่ยนระหว่างดำเนินการ ลองใหม่อีกครั้ง', 409)
      }
    }

    user.gems = (user.gems ?? 0) + plan.totalGems
    user.markModified('inventory')
    await user.save()

    return NextResponse.json({
      salvaged: plan.lines,
      totalCards: plan.totalCards,
      totalGems: plan.totalGems,
      byRarity: plan.byRarity,
      user: user.toPublic(),
    })
  } catch (err) {
    console.error('salvage POST', err)
    return jsonError('ย่อยการ์ดไม่สำเร็จ', 500)
  }
}
