import { getCard } from '../data/cards'
import type { GameState } from '../types/game'
import {
  advancePhase,
  canAttack,
  canSummon,
  canTargetMonster,
  declareAttack,
  summonMonster,
} from './gameEngine'
import type { AiChoice } from './ai'

/**
 * Scripted tutorial bot: summon one monster, attack once, then pass.
 * Keeps the lesson on rails while still showing real plays.
 */
export function chooseTutorialAiAction(state: GameState): AiChoice | null {
  if (state.activePlayer !== 'opponent' || state.winner) return null
  if (state.awaitingTrap) return null
  if (
    state.interaction.type !== 'idle' &&
    state.interaction.type !== 'attack'
  ) {
    return null
  }

  const phase = state.phase
  const me = state.players.opponent
  const hasMonster = me.field.some((m) => m !== null)

  if (phase === 'main1' || phase === 'main2') {
    if (!hasMonster) {
      const prefer = ['S0010', 'S0009', 'S0011']
      for (const id of prefer) {
        const card = me.hand.find(
          (c) => c.cardId === id && canSummon(state, 'opponent', c.instanceId),
        )
        if (card) {
          return {
            apply: (s) => summonMonster(s, 'opponent', card.instanceId),
          }
        }
      }
      const any = me.hand.find(
        (c) =>
          getCard(c.cardId).type === 'monster' &&
          canSummon(state, 'opponent', c.instanceId),
      )
      if (any) {
        return {
          apply: (s) => summonMonster(s, 'opponent', any.instanceId),
        }
      }
    }
    return { apply: (s) => advancePhase(s) }
  }

  if (phase === 'battle') {
    for (const m of me.field) {
      if (!m || !canAttack(state, 'opponent', m.instanceId)) continue
      const enemies = state.players.player.field.filter(
        (t): t is NonNullable<typeof t> =>
          t !== null && canTargetMonster(state, 'opponent', t.instanceId),
      )
      if (enemies.length > 0) {
        const target = [...enemies].sort(
          (a, b) => (getCard(a.cardId).atk ?? 0) - (getCard(b.cardId).atk ?? 0),
        )[0]!
        return {
          apply: (s) =>
            declareAttack(s, 'opponent', m.instanceId, target.instanceId),
          attack: {
            attackerId: m.instanceId,
            targetId: target.instanceId,
          },
        }
      }
      break
    }
    return { apply: (s) => advancePhase(s) }
  }

  return { apply: (s) => advancePhase(s) }
}
