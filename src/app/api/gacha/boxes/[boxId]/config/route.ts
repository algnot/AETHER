import { NextRequest, NextResponse } from 'next/server'
import { jsonError, userIdFromRequest } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { getGachaBox, isGachaEnabled } from '@/data/gachaBoxes'
import {
  resolveGachaBox,
  upsertGachaBoxConfig,
  type GachaBoxConfigPatch,
} from '@/lib/resolveGachaBox'
import { serializeGachaBox } from '@/lib/serializeGachaBox'
import { User } from '@/lib/models/User'

type Ctx = { params: Promise<{ boxId: string }> }

function parsePatch(body: unknown): GachaBoxConfigPatch | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'payload ไม่ถูกต้อง' }
  const raw = body as Record<string, unknown>
  const patch: GachaBoxConfigPatch = {}

  if ('gachaEnabled' in raw) {
    if (typeof raw.gachaEnabled !== 'boolean') {
      return { error: 'gachaEnabled ต้องเป็น boolean' }
    }
    patch.gachaEnabled = raw.gachaEnabled
  }

  for (const key of ['urPerBox', 'srPerBox', 'packCost'] as const) {
    if (key in raw) {
      const n = Number(raw[key])
      if (!Number.isFinite(n) || n < 0) {
        return { error: `${key} ต้องเป็นจำนวน ≥ 0` }
      }
      patch[key] = n
    }
  }

  if ('rareRates' in raw) {
    if (!raw.rareRates || typeof raw.rareRates !== 'object') {
      return { error: 'rareRates ไม่ถูกต้อง' }
    }
    const rr = raw.rareRates as Record<string, unknown>
    const rates: NonNullable<GachaBoxConfigPatch['rareRates']> = {}
    for (const k of ['R', 'SR', 'UR'] as const) {
      if (k in rr) {
        const n = Number(rr[k])
        if (!Number.isFinite(n) || n < 0) {
          return { error: `rareRates.${k} ต้องเป็นจำนวน ≥ 0` }
        }
        rates[k] = n
      }
    }
    if (Object.keys(rates).length === 0) {
      return { error: 'rareRates ว่าง' }
    }
    patch.rareRates = rates
  }

  if (Object.keys(patch).length === 0) {
    return { error: 'ไม่มีฟิลด์ให้อัปเดต' }
  }
  return patch
}

/** Dev-only: adjust rates / enable box (stored in Mongo GachaBoxConfig). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    const { boxId } = await ctx.params
    if (!getGachaBox(boxId)) return jsonError('ไม่พบกล่องนี้', 404)

    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)
    if (!user.is_dev) return jsonError('เฉพาะบัญชี is_dev เท่านั้น', 403)

    const parsed = parsePatch(await req.json().catch(() => null))
    if ('error' in parsed) return jsonError(parsed.error, 400)

    const box = await upsertGachaBoxConfig(boxId, parsed)
    return NextResponse.json({
      box: serializeGachaBox(box, user),
      config: {
        boxId,
        gachaEnabled: isGachaEnabled(box),
        urPerBox: box.urPerBox,
        srPerBox: box.srPerBox,
        packCost: box.packCost,
        rareRates: box.rareRates,
      },
    })
  } catch (err) {
    console.error('gacha box config patch', err)
    return jsonError('บันทึกค่ากล่องไม่สำเร็จ', 500)
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const userId = userIdFromRequest(req)
    if (!userId) return jsonError('ต้องเข้าสู่ระบบก่อน', 401)

    const { boxId } = await ctx.params
    await connectDb()
    const user = await User.findById(userId)
    if (!user) return jsonError('ไม่พบผู้ใช้', 401)
    if (!user.is_dev) return jsonError('เฉพาะบัญชี is_dev เท่านั้น', 403)

    const box = await resolveGachaBox(boxId)
    if (!box) return jsonError('ไม่พบกล่องนี้', 404)

    return NextResponse.json({
      box: serializeGachaBox(box, user),
      config: {
        boxId: box.id,
        gachaEnabled: isGachaEnabled(box),
        urPerBox: box.urPerBox,
        srPerBox: box.srPerBox,
        packCost: box.packCost,
        rareRates: box.rareRates,
      },
    })
  } catch (err) {
    console.error('gacha box config get', err)
    return jsonError('โหลดค่ากล่องไม่สำเร็จ', 500)
  }
}
