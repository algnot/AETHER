import { getCard } from '../data/cards'
import type { CardInstance, GameState, PlayerId, PlayerState } from '../types/game'
import { v4 as uuid } from 'uuid'

/** Bot HP in practice so the lesson ends with a real kill. */
export const TUTORIAL_BOT_HP = 8

/** Opening: vanilla + effect monster + spell + trap */
export const TUTORIAL_OPENING_HAND = [
  'S0009', // ทหารใหม่ (vanilla)
  'S0024', // หน่วยสนับสนุน (effect)
  'S0021', // ชาร์จพลังงาน (spell)
  'S0029', // ระเบิดความตาย (trap)
  'S0010', // อัศวินดาบ
] as const

/** Turn 2: finisher line */
export const TUTORIAL_TURN2_HAND = [
  'S0011', // กัปตันโล่
  'S0010', // อัศวินดาบ
  'S0009',
  'S0021',
  'S0029',
] as const

/** Bot opening — enough Blade Knights to summon on its turn */
export const TUTORIAL_BOT_OPENING_HAND = [
  'S0010',
  'S0010',
  'S0009',
  'S0009',
  'S0021',
] as const

export function makeMockInstance(
  cardId: string,
  turn = 0,
  originalOwnerId?: PlayerId,
): CardInstance {
  return {
    instanceId: uuid(),
    cardId,
    canAttack: false,
    hasAttacked: false,
    summonTurn: turn,
    ...(originalOwnerId ? { originalOwnerId } : {}),
  }
}

/** Replace hand with scripted cards (pull from deck when possible). */
export function mockHand(player: PlayerState, cardIds: readonly string[]): PlayerState {
  let deck = [...player.deck]
  const hand: CardInstance[] = []
  for (const id of cardIds) {
    const i = deck.findIndex((c) => c.cardId === id)
    if (i >= 0) hand.push(deck.splice(i, 1)[0]!)
    else hand.push(makeMockInstance(id, 0, player.id))
  }
  for (const c of player.hand) {
    if (!hand.some((h) => h.instanceId === c.instanceId)) {
      deck.push({
        ...c,
        canAttack: false,
        hasAttacked: false,
        faceDown: false,
      })
    }
  }
  return { ...player, deck, hand }
}

export function describeHandLines(
  game: GameState,
  canSummonFn: (instanceId: string) => boolean,
  canPlaySpellFn: (instanceId: string) => boolean,
): string[] {
  const energy = game.players.player.energy
  const mainOk = game.phase === 'main1' || game.phase === 'main2'
  return game.players.player.hand.map((c) => {
    const def = getCard(c.cardId)
    if (def.type === 'trap') {
      return `• ${def.nameTh} — กับดักเก็บในมือ ใช้ตอนโดนตี`
    }
    if (def.type === 'monster') {
      if (canSummonFn(c.instanceId))
        return `• ${def.nameTh} (ค่าร่าย ${def.cost}) — ลงได้`
      if (!mainOk) return `• ${def.nameTh} — รอ Main`
      if (energy < def.cost)
        return `• ${def.nameTh} (ค่าร่าย ${def.cost}) — พลังงานไม่พอ (มี ${energy})`
      return `• ${def.nameTh} — ลงไม่ได้`
    }
    if (canPlaySpellFn(c.instanceId))
      return `• ${def.nameTh} (ค่าร่าย ${def.cost}) — ใช้เวทย์ได้`
    if (energy < def.cost)
      return `• ${def.nameTh} (ค่าร่าย ${def.cost}) — พลังงานไม่พอ`
    return `• ${def.nameTh} — ใช้ไม่ได้ตอนนี้`
  })
}
