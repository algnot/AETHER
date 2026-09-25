import type { CardDefinition, Rarity } from '../types/game'

/** Card draft before rarity is filled in */
export type CardDraft = Omit<CardDefinition, 'rarity'> & { rarity?: Rarity }

type EffectId = NonNullable<CardDefinition['effectId']>

/** Extra power from known strong effects (beyond "has an effect") */
const EFFECT_BONUS: Partial<Record<EffectId, number>> = {
  energy_charge: 1,
  heavenly_voice: 3,
  light_shield: 4,
  death_blast: 4,
  call_reinforcements: 5,
  soul_drain: 5,
  emergency_reinforce: 6,
  frontline_warrior: 5,
  support_unit: 5,
  scout_unit: 5,
  iron_wall_warrior: 6,
  kona_draw: 7,
  soluy_swap: 7,
  sari_rally: 6,
  michael_scout: 6,
  mina_recruit: 9,
  sara_sacrifice: 7,
  sora_bomb: 8,
  sola_destroyer: 9,
  sigma_destroyer: 9,
  gamma_destroyer: 8,
  beta_destroyer: 9,
  omega_destroyer: 10,
  special_mod: 5,
  interference_signal: 5,
  signal_amplifier: 10,
  sorun_alkata: 9,
  sona_alkata: 7,
  zul_alkata: 9,
  yori_alkata: 10,
  mina_alkata: 10,
  hokana_alkata: 7,
  alkata_call: 8,
  alkata_plot: 6,
  shorin_mage: 8,
  agatha_mage: 9,
  noah_mage: 8,
  dynogr_mage: 9,
  saruka_mage: 8,
  ryuka_mage: 9,
  kata_guardian: 5,
  kata_prepare: 6,
  kata_buddy: 6,
  kata_hypnosis: 6,
  kata_blink: 7,
  kata_barrier: 6,
  kata_intercept: 7,
}

/**
 * Strength score used to derive C / R / SR / UR.
 * Weights effects and raw ATK more than raw cost-efficiency (avoids vanillas dominating).
 */
export function cardPowerScore(card: CardDraft): number {
  let score = 0

  if (card.type === 'monster') {
    const atk = card.atk ?? 0
    const cost = Math.max(card.cost, 0.5)
    score += atk * 1.15
    score += Math.min(atk / cost, 2.4) * 1.4
    if (card.tribe === 'god') score += 2
  } else {
    score += 2.5 + card.cost * 0.35
  }

  if (card.effectId) {
    score += 3.5 + (EFFECT_BONUS[card.effectId] ?? 4)
  }

  return score
}

/** Absolute thresholds tuned to the current card pool */
export function rarityFromScore(score: number): Rarity {
  if (score >= 19.5) return 'UR'
  if (score >= 13.5) return 'SR'
  if (score >= 7.5) return 'R'
  return 'C'
}

export function assignRarity(card: CardDraft): Rarity {
  return card.rarity ?? rarityFromScore(cardPowerScore(card))
}

export function withRarity(card: CardDraft): CardDefinition {
  return { ...card, rarity: assignRarity(card) }
}
