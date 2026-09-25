import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import {
  SALVAGE_GEMS_BY_RARITY,
  SALVAGE_KEEP_COPIES,
} from '@/lib/economy'
import {
  User,
  getEvolvedCount,
  removeEvolved,
  removeFromInventory,
} from '@/lib/models/User'
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

function evolvedRecord(
  user: {
    inventory?: Map<string, number> | Record<string, number>
    evolved?: Map<string, number> | Record<string, number>
  },
): Record<string, number> {
  const inv = inventoryRecord(user.inventory)
  const out: Record<string, number> = {}
  const keys =
    user.evolved instanceof Map
      ? [...user.evolved.keys()]
      : Object.keys((user.evolved as Record<string, number> | undefined) ?? {})
  for (const id of keys) {
    const n = Math.min(getEvolvedCount(user, id), inv[id] ?? 0)
    if (n > 0) out[id] = n
  }
  return out
}

export async function GET(req: NextRequest) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)

    const plan = buildSalvagePlan(
      inventoryRecord(user.inventory),
      evolvedRecord(user),
    )
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

    const plan = buildSalvagePlan(
      inventoryRecord(user.inventory),
      evolvedRecord(user),
    )
    if (plan.totalCards <= 0) {
      return jsonError(
        'ไม่มีการ์ดส่วนเกินให้ย่อย (เก็บได้สูงสุด 3 ใบปกติ + 3 ใบ Evo / ชนิด)',
        400,
      )
    }

    for (const line of plan.lines) {
      if (line.evolved) {
        const okEvo = removeEvolved(user, line.cardId, line.qty)
        if (!okEvo) {
          return jsonError('คลังการ์ดเปลี่ยนระหว่างดำเนินการ ลองใหม่อีกครั้ง', 409)
        }
      }
      const ok = removeFromInventory(user, line.cardId, line.qty)
      if (!ok) {
        return jsonError('คลังการ์ดเปลี่ยนระหว่างดำเนินการ ลองใหม่อีกครั้ง', 409)
      }
    }

    user.gems = (user.gems ?? 0) + plan.totalGems
    user.markModified('inventory')
    user.markModified('evolved')
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
