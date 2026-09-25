import { getCard } from '../data/cards'
import type { CardInstance, GameState, PlayerId } from '../types/game'
import {
  advancePhase,
  canActivateSoluy,
  canActivateShorin,
  canActivateAgatha,
  canActivateNoah,
  canActivateSaruka,
  canActivateRyuka,
  canActivateZeeka,
  canAttack,
  canPlaySpell,
  canSummon,
  canTargetMonster,
  canPaySola,
  beginSoluySwap,
  beginShorinSearch,
  beginAgathaSearch,
  beginNoahMill,
  beginSarukaSearch,
  beginRyukaFetch,
  activateZeekaAtk,
  declareAttack,
  discardFromHand,
  getEffectiveAtk,
  isAlkataGod,
  isEnergyOrHpSummon,
  isKataSpellOrTrap,
  pickShorinSearch,
  pickShorinDiscard,
  pickSarukaDiscard,
  pickSarukaSearch,
  pickRyukaFetch,
  pickRyukaDiscard,
  pickRyukaSleep,
  pickZeekaDebuff,
  pickAgathaSearch,
  pickNoahMill,
  pickGuardianTarget,
  pickBuddyTarget,
  pickHypnosisTarget,
  pickTeleportSummon,
  canFreePlaceMonster,
  isBarrierAttackTarget,
  listTrapsForWindow,
  respondTrap,
  offerOrStageSpell,
  summonMonster,
} from './gameEngine'

type Action = (state: GameState) => GameState

export type AiAttackPlan = {
  attackerId: string
  targetId: string | 'direct'
}

export type AiChoice = {
  apply: Action
  /** Present when this action is a battle attack — used for FX targeting */
  attack?: AiAttackPlan
}

type ScoredAction = {
  score: number
  choice: AiChoice
  label: string
}

const AI: PlayerId = 'opponent'
const YOU: PlayerId = 'player'

function pickDiscardCard(state: GameState): CardInstance | null {
  const hand = state.players.opponent.hand
  if (hand.length === 0) return null
  const ranked = [...hand].sort((a, b) => {
    const da = getCard(a.cardId)
    const db = getCard(b.cardId)
    const score = (d: typeof da) => {
      if (d.type === 'spell') return 0
      if (d.type === 'trap') return 1
      return 10 + (d.atk ?? 0) + d.cost
    }
    return score(da) - score(db)
  })
  return ranked[0] ?? null
}

function pickAttackTarget(
  state: GameState,
  attacker: CardInstance,
): AiAttackPlan | null {
  const atkPower = getEffectiveAtk(
    state,
    AI,
    attacker.cardId,
    attacker.instanceId,
  )
  const enemyMonsters = state.players.player.field.filter(
    (m): m is NonNullable<typeof m> =>
      m !== null && canTargetMonster(state, AI, m.instanceId),
  )

  if (state.players.player.field.every((m) => m === null)) {
    return { attackerId: attacker.instanceId, targetId: 'direct' }
  }

  if (enemyMonsters.length === 0) return null

  const ranked = enemyMonsters
    .map((m) => ({
      m,
      power: getEffectiveAtk(state, YOU, m.cardId, m.instanceId),
    }))
    .sort((a, b) => a.power - b.power)

  const beatable = ranked.filter((x) => x.power < atkPower)
  const equal = ranked.filter((x) => x.power === atkPower)
  const target = beatable[0]?.m ?? equal[0]?.m
  if (!target) return null

  return { attackerId: attacker.instanceId, targetId: target.instanceId }
}

/** Survives after paying this much HP (must remain strictly above 0) */
function survivesHpPay(hp: number, cost: number): boolean {
  return cost <= 0 || hp - cost > 0
}

function countWarriorsOnSide(
  state: GameState,
  owner: PlayerId,
): number {
  return state.players[owner].field.filter(
    (m) => m && getCard(m.cardId).tribe === 'warrior',
  ).length
}

function hasDestructionRobotInDeck(state: GameState): boolean {
  return state.players[AI].deck.some((c) =>
    getCard(c.cardId).nameTh.includes('หุ่นยนต์แห่งการทำลาย'),
  )
}

function hasDestructionRobotInGy(state: GameState): boolean {
  return state.players[AI].graveyard.some((c) =>
    getCard(c.cardId).nameTh.includes('หุ่นยนต์แห่งการทำลาย'),
  )
}

function hasDestructionRobotOnField(state: GameState): boolean {
  return state.players[AI].field.some(
    (m) => m && getCard(m.cardId).nameTh.includes('หุ่นยนต์แห่งการทำลาย'),
  )
}

function freeZones(state: GameState, owner: PlayerId): number {
  return state.players[owner].field.filter((z) => z === null).length
}

type SummonPay = { hpCost: number; pay?: 'energy' | 'hp' }

function robotPayOptions(
  state: GameState,
  cost: number,
): Array<{ hpCost: number; pay: 'energy' | 'hp' }> {
  const me = state.players[AI]
  if (canPaySola(state, AI, 'hp', cost) && survivesHpPay(me.hp, cost)) {
    return [{ hpCost: cost, pay: 'hp' }]
  }
  return []
}

/**
 * HP the AI would pay to summon this card (0 if energy covers it).
 * Returns null if the summon is illegal / suicidal.
 * Destruction Robots always pay HP equal to card cost.
 */
function summonHpCost(
  state: GameState,
  card: CardInstance,
): SummonPay | null {
  if (!canSummon(state, AI, card.instanceId)) return null
  const def = getCard(card.cardId)

  if (isEnergyOrHpSummon(def.effectId)) {
    const options = robotPayOptions(state, def.cost)
    if (options.length === 0) return null
    return options[0]!
  }

  return { hpCost: 0 }
}

/** ATK a Destruction Robot would have after paying summon cost */
function projectedRobotAtk(
  state: GameState,
  hpCost: number,
): number {
  const me = state.players[AI]
  const you = state.players[YOU]
  const diff = Math.abs(me.hp - hpCost - you.hp)
  return 5 + Math.floor(diff / 2)
}

/** How many enemy monsters this ATK can beat (trade or better) */
function beatableEnemyCount(state: GameState, atk: number): number {
  let n = 0
  for (const m of state.players[YOU].field) {
    if (!m) continue
    const p = getEffectiveAtk(state, YOU, m.cardId, m.instanceId)
    if (atk >= p) n++
  }
  return n
}

/** Destruction Robot body/effect value for a given HP spend (energy = 0). */
function scoreDestructionRobot(
  state: GameState,
  effectId: string | undefined,
  hpCost: number,
): number {
  const me = state.players[AI]
  const you = state.players[YOU]
  const atk = projectedRobotAtk(state, hpCost)
  const enemies = you.field.filter((m) => m).length
  const beats = beatableEnemyCount(state, atk)
  const hpLeft = me.hp - hpCost

  let score = 36 + atk * 6
  if (atk >= 4) score += 12
  if (atk >= 8) score += 16
  if (atk >= 15) score += 22

  if (enemies === 0 && atk > 0) score += 12 + atk * 2
  score += beats * 16

  // Paying HP is the intended line (turn income grows; leftover cap is 5). Only tax it
  // when the body is weak vs cost, or leftover HP is desperate.
  if (hpCost > 0) {
    if (atk < hpCost) score -= (hpCost - atk) * 2
    if (hpLeft <= 10) score -= 12
    else if (hpLeft <= 20) score -= 4
  }

  if (atk === 0) {
    score -= 18
  } else if (beats === 0 && enemies > 0 && atk < 3) {
    score -= 8
  }

  switch (effectId) {
    case 'omega_destroyer':
      score += hasDestructionRobotInDeck(state) ? 60 : 10
      if (atk === 0 && hasDestructionRobotInDeck(state)) score += 24
      break
    case 'sola_destroyer':
      score += 18
      break
    case 'sigma_destroyer':
      score += enemies > 0 ? 24 : 10
      break
    case 'gamma_destroyer':
      score += 14
      break
    case 'beta_destroyer':
      score += 12
      if (enemies >= 2) score += 22
      else if (enemies === 1) score += 10
      break
    default:
      break
  }

  return score
}

/** Score how good this summon is for board / combos */
function scoreSummon(
  state: GameState,
  card: CardInstance,
  hpCost: number,
): number {
  const me = state.players[AI]
  const you = state.players[YOU]
  const def = getCard(card.cardId)
  const warriors = countWarriorsOnSide(state, AI)
  let score = 0

  if (isEnergyOrHpSummon(def.effectId)) {
    score += scoreDestructionRobot(state, def.effectId, hpCost)
  } else {
    score += (def.atk ?? 0) * 3 + def.cost
    // Soft penalty for spending HP (even if not lethal)
    score -= hpCost * 4
  }

  switch (def.effectId) {
    case 'sari_rally': {
      // On-summon + on-bounce warrior buffs — strong with board presence / Soluy
      const handWarriors = me.hand.filter(
        (c) =>
          c.instanceId !== card.instanceId &&
          getCard(c.cardId).tribe === 'warrior',
      ).length
      const hasSoluy = me.field.some(
        (m) => m && getCard(m.cardId).effectId === 'soluy_swap',
      )
      score += 20 + warriors * 18 + handWarriors * 8 + (hasSoluy ? 16 : 0)
      break
    }
    case 'support_unit':
    case 'frontline_warrior': {
      // Aura engines — prioritize when we already have / will have warriors
      score += 15 + warriors * 14
      if (warriors === 0) score -= 8
      break
    }
    case 'mina_recruit': {
      // Needs a free zone after landing
      if (freeZones(state, AI) >= 2) score += 55
      else score -= 20
      break
    }
    case 'sara_sacrifice': {
      if (freeZones(state, AI) >= 1 && me.hand.length > 1) score += 40
      else score -= 15
      break
    }
    case 'michael_scout': {
      const enemies = you.field.filter((m) => m).length
      const hasSoluy = me.field.some(
        (m) => m && getCard(m.cardId).effectId === 'soluy_swap',
      )
      score += 12 + enemies * 14 + (hasSoluy && enemies > 0 ? 14 : 0)
      break
    }
    case 'sora_bomb': {
      const enemyMons = you.field.filter((m) => m).length
      score += enemyMons > 0 ? 25 + enemyMons * 10 : -80
      break
    }
    case 'kona_draw':
      score += 14
      break
    case 'sorun_alkata':
      score += 22 + you.field.filter((m) => m).length * 8
      break
    case 'sona_alkata':
      score += 18 + me.field.filter((m) => m && isAlkataGod(m.cardId)).length * 10
      break
    case 'zul_alkata':
      score += me.deck.some(
        (c) => isAlkataGod(c.cardId) && getCard(c.cardId).effectId !== 'zul_alkata',
      )
        ? 28
        : 8
      break
    case 'yori_alkata':
      score += 20 + you.hand.length * 6
      break
    case 'mina_alkata':
      score += me.deck.some((c) => isAlkataGod(c.cardId)) && freeZones(state, AI) >= 2 ? 30 : 6
      break
    case 'hokana_alkata':
      score +=
        16 +
        (me.graveyard.filter((c) => isAlkataGod(c.cardId)).length >= 2 ? 14 : 0)
      break
    case 'soluy_swap': {
      const handW = me.hand.filter((c) => getCard(c.cardId).tribe === 'warrior')
      const bounceable = me.field.filter(
        (m) =>
          m &&
          getCard(m.cardId).tribe === 'warrior' &&
          getCard(m.cardId).effectId !== 'soluy_swap',
      ).length
      score += handW.length > 0 && bounceable > 0 ? 22 : 4
      break
    }
    case 'iron_wall_warrior':
      score += 10
      break
    case 'scout_unit':
      score += 4
      break
    case 'zeeka_mage': {
      const kataN = me.graveyard.filter((c) =>
        isKataSpellOrTrap(c.cardId),
      ).length
      score += kataN >= 3 ? 24 + kataN * 4 : 6
      break
    }
    default:
      break
  }

  // Prefer filling board before battle if empty
  if (me.field.every((z) => z === null)) score += 10

  return score
}

function scoreSpell(state: GameState, card: CardInstance): number | null {
  if (!canPlaySpell(state, AI, card.instanceId)) return null
  const me = state.players[AI]
  const you = state.players[YOU]
  const def = getCard(card.cardId)
  const warriors = countWarriorsOnSide(state, AI)
  const hpDiff = Math.abs(me.hp - you.hp)

  switch (def.effectId) {
    case 'heavenly_voice':
      if (me.hand.length > 5 || me.deck.length < 2) return null
      return me.hand.length <= 4 ? 35 : 12

    case 'energy_charge':
      return me.energy < 4 ? 28 : me.energy < 6 ? 10 : null

    case 'kata_guardian': {
      const mages = me.field.filter(
        (m) => m && getCard(m.cardId).tribe === 'mage',
      )
      if (mages.length === 0) return null
      return 32 + mages.length * 4
    }

    case 'kata_prepare': {
      if (me.spellTrap.some((c) => getCard(c.cardId).effectId === 'kata_prepare')) {
        return me.hand.length <= 4 ? 14 : null
      }
      return me.hand.length <= 5 ? 26 : 12
    }

    case 'kata_buddy': {
      const mages = me.field.filter(
        (m) => m && getCard(m.cardId).tribe === 'mage',
      )
      if (mages.length < 2) return null
      const powers = mages.map((m) =>
        getEffectiveAtk(state, AI, m!.cardId, m!.instanceId),
      )
      powers.sort((a, b) => b - a)
      const gain = powers[0]! + powers[1]!
      return 20 + gain * 2
    }

    case 'kata_hypnosis': {
      const foes = you.field.filter((m) => m !== null)
      if (foes.length < 2) return null
      return 28 + foes.length * 3
    }

    case 'kata_blink': {
      if (freeZones(state, AI) === 0) return null
      const mages = [
        ...me.deck.filter(
          (c) =>
            getCard(c.cardId).tribe === 'mage' &&
            canFreePlaceMonster(state, AI, c.cardId),
        ),
        ...me.graveyard.filter(
          (c) =>
            getCard(c.cardId).tribe === 'mage' &&
            canFreePlaceMonster(state, AI, c.cardId),
        ),
      ]
      if (mages.length === 0) return null
      const bestAtk = Math.max(
        ...mages.map((c) => getCard(c.cardId).atk ?? 0),
      )
      return 30 + bestAtk * 2
    }

    case 'call_reinforcements': {
      const affordable = me.hand.filter((c) => {
        const d = getCard(c.cardId)
        return (
          d.type === 'monster' &&
          d.tribe === 'warrior' &&
          survivesHpPay(me.hp, d.cost)
        )
      })
      if (affordable.length === 0) return null
      // Don't start reinforce if the cheapest warrior would kill us
      const cheapest = Math.min(...affordable.map((c) => getCard(c.cardId).cost))
      if (!survivesHpPay(me.hp, cheapest)) return null
      return 30 + affordable.length * 10 + warriors * 5
    }

    case 'signal_amplifier': {
      if (!survivesHpPay(me.hp, 20)) return null
      if (!hasDestructionRobotInGy(state)) return null
      if (freeZones(state, AI) === 0) return null
      // Big HP swing is risky — only when we stay healthy and can bring huge bodies
      return me.hp > 30 ? 32 : 8
    }

    case 'interference_signal': {
      if (!hasDestructionRobotInDeck(state)) return null
      // Heals opponent by robot cost — prefer cheap robots in deck later; still useful for Omega lines
      return 18
    }

    case 'special_mod': {
      if (!survivesHpPay(me.hp, 5)) return null
      if (!hasDestructionRobotOnField(state)) return null
      if (hpDiff < 3) return null
      return 22 + hpDiff * 2
    }

    case 'soul_drain': {
      const mons = me.field.filter((m) => m)
      if (mons.length < 2) return null
      return 24
    }

    case 'emergency_reinforce':
      if (freeZones(state, AI) === 0 && me.hand.length >= 6) return 8
      return freeZones(state, AI) > 0 ? 20 : 10

    case 'alkata_call': {
      if (me.hand.length < 2) return null
      if (freeZones(state, AI) === 0) return null
      if (!me.deck.some((c) => isAlkataGod(c.cardId))) return null
      const best = Math.max(
        0,
        ...me.deck
          .filter((c) => isAlkataGod(c.cardId))
          .map((c) => getCard(c.cardId).atk ?? 0),
      )
      return 16 + best * 4
    }

    case 'alkata_plot': {
      const gods = me.field.filter((m) => m && isAlkataGod(m.cardId))
      if (gods.length === 0) return null
      const weakest = Math.min(
        ...gods.map((m) => getCard(m!.cardId).atk ?? 0),
      )
      return me.hand.length <= 5 ? 22 + (6 - weakest) * 2 : 8
    }

    default:
      return null
  }
}

function collectMainActions(state: GameState): ScoredAction[] {
  const me = state.players[AI]
  const actions: ScoredAction[] = []

  for (const c of me.hand) {
    const def = getCard(c.cardId)
    if (def.type === 'spell') {
      const score = scoreSpell(state, c)
      if (score === null) continue
      actions.push({
        score,
        label: `spell:${def.effectId}`,
        choice: {
          apply: (s) => offerOrStageSpell(s, AI, c.instanceId),
        },
      })
      continue
    }

    if (def.type !== 'monster') continue
    const pay = summonHpCost(state, c)
    if (!pay) continue
    const score = scoreSummon(state, c, pay.hpCost)
    actions.push({
      score,
      label: `summon:${def.id}`,
      choice: {
        apply: (s) =>
          summonMonster(s, AI, c.instanceId, undefined, pay.pay),
      },
    })
  }

  // Soluy field effect — upgrade warrior
  const soluy = me.field.find(
    (m) => m && canActivateSoluy(state, AI, m.instanceId),
  )
  if (soluy) {
    const handBest = me.hand
      .filter((c) => getCard(c.cardId).tribe === 'warrior')
      .map((c) => getCard(c.cardId).atk ?? 0)
      .sort((a, b) => b - a)[0]
    const fieldWorst = me.field
      .filter(
        (m): m is NonNullable<typeof m> =>
          !!m &&
          getCard(m.cardId).tribe === 'warrior' &&
          getCard(m.cardId).effectId !== 'soluy_swap',
      )
      .map((m) => getEffectiveAtk(state, AI, m.cardId, m.instanceId))
      .sort((a, b) => a - b)[0]
    if (
      handBest !== undefined &&
      fieldWorst !== undefined &&
      handBest > fieldWorst
    ) {
      actions.push({
        score: 40 + (handBest - fieldWorst) * 3,
        label: 'soluy',
        choice: {
          apply: (s) => beginSoluySwap(s, AI, soluy.instanceId),
        },
      })
    }
  }

  const shorin = me.field.find(
    (m) => m && canActivateShorin(state, AI, m.instanceId),
  )
  if (shorin) {
    actions.push({
      score: 55,
      label: 'shorin',
      choice: {
        apply: (s) => beginShorinSearch(s, AI, shorin.instanceId),
      },
    })
  }

  const saruka = me.field.find(
    (m) => m && canActivateSaruka(state, AI, m.instanceId),
  )
  if (saruka) {
    actions.push({
      score: 50,
      label: 'saruka',
      choice: {
        apply: (s) => beginSarukaSearch(s, AI, saruka.instanceId),
      },
    })
  }

  const ryuka = me.field.find(
    (m) => m && canActivateRyuka(state, AI, m.instanceId),
  )
  if (ryuka) {
    actions.push({
      score: 54,
      label: 'ryuka',
      choice: {
        apply: (s) => beginRyukaFetch(s, AI, ryuka.instanceId),
      },
    })
  }

  const zeeka = me.field.find(
    (m) => m && canActivateZeeka(state, AI, m.instanceId),
  )
  if (zeeka) {
    actions.push({
      score: 58,
      label: 'zeeka',
      choice: {
        apply: (s) => activateZeekaAtk(s, AI, zeeka.instanceId),
      },
    })
  }

  const agatha = me.field.find(
    (m) => m && canActivateAgatha(state, AI, m.instanceId),
  )
  if (agatha) {
    actions.push({
      score: 58,
      label: 'agatha',
      choice: {
        apply: (s) => beginAgathaSearch(s, AI, agatha.instanceId),
      },
    })
  }

  const noah = me.field.find(
    (m) => m && canActivateNoah(state, AI, m.instanceId),
  )
  if (noah) {
    actions.push({
      score: 52,
      label: 'noah',
      choice: {
        apply: (s) => beginNoahMill(s, AI, noah.instanceId),
      },
    })
  }

  return actions
}

/** Simple CPU: play affordable cards, then attack, then end phases */
export function chooseAiAction(state: GameState): AiChoice | null {
  if (state.winner) return null

  if (
    state.interaction.type === 'discard' &&
    state.interaction.ownerId === AI
  ) {
    const card = pickDiscardCard(state)
    if (!card) return null
    return {
      apply: (s) => discardFromHand(s, AI, card.instanceId),
    }
  }

  if (
    state.interaction.type === 'shorin_search' &&
    state.interaction.ownerId === AI
  ) {
    const me = state.players[AI]
    if (state.interaction.step === 'discard') {
      const ranked = [...me.hand].sort((a, b) => {
        const da = getCard(a.cardId)
        const db = getCard(b.cardId)
        const kataA = isKataSpellOrTrap(a.cardId) ? 1 : 0
        const kataB = isKataSpellOrTrap(b.cardId) ? 1 : 0
        if (kataA !== kataB) return kataA - kataB
        return da.cost - db.cost
      })
      const discard = ranked[0]
      if (!discard) return null
      return {
        apply: (s) => pickShorinDiscard(s, AI, discard.instanceId),
      }
    }
    const deckPick = me.deck.find((c) => isKataSpellOrTrap(c.cardId))
    if (deckPick) {
      return {
        apply: (s) =>
          pickShorinSearch(s, AI, deckPick.instanceId, 'deck'),
      }
    }
    const gyPick = me.graveyard.find((c) => isKataSpellOrTrap(c.cardId))
    if (gyPick) {
      return {
        apply: (s) =>
          pickShorinSearch(s, AI, gyPick.instanceId, 'graveyard'),
      }
    }
    return null
  }

  if (
    state.interaction.type === 'saruka_search' &&
    state.interaction.ownerId === AI
  ) {
    const me = state.players[AI]
    if (state.interaction.step === 'discard') {
      const ranked = [...me.hand].sort((a, b) => {
        const da = getCard(a.cardId)
        const db = getCard(b.cardId)
        const kataA = isKataSpellOrTrap(a.cardId) ? 1 : 0
        const kataB = isKataSpellOrTrap(b.cardId) ? 1 : 0
        if (kataA !== kataB) return kataA - kataB
        return da.cost - db.cost
      })
      const discard = ranked[0]
      if (!discard) return null
      return {
        apply: (s) => pickSarukaDiscard(s, AI, discard.instanceId),
      }
    }
    const deckPick = me.deck.find((c) => isKataSpellOrTrap(c.cardId))
    if (deckPick) {
      return {
        apply: (s) =>
          pickSarukaSearch(s, AI, deckPick.instanceId, 'deck'),
      }
    }
    const gyPick = me.graveyard.find((c) => isKataSpellOrTrap(c.cardId))
    if (gyPick) {
      return {
        apply: (s) =>
          pickSarukaSearch(s, AI, gyPick.instanceId, 'graveyard'),
      }
    }
    return null
  }

  if (
    state.interaction.type === 'ryuka_fetch' &&
    state.interaction.ownerId === AI
  ) {
    const me = state.players[AI]
    if (state.interaction.step === 'discard') {
      const ranked = [...me.hand].sort((a, b) => {
        const da = getCard(a.cardId)
        const db = getCard(b.cardId)
        const kataA = isKataSpellOrTrap(a.cardId) ? 1 : 0
        const kataB = isKataSpellOrTrap(b.cardId) ? 1 : 0
        if (kataA !== kataB) return kataA - kataB
        return da.cost - db.cost
      })
      const discard = ranked[0]
      if (!discard) return null
      return {
        apply: (s) => pickRyukaDiscard(s, AI, discard.instanceId),
      }
    }
    const gyPick = me.graveyard.find((c) => isKataSpellOrTrap(c.cardId))
    if (!gyPick) return null
    return {
      apply: (s) => pickRyukaFetch(s, AI, gyPick.instanceId),
    }
  }

  if (
    state.interaction.type === 'ryuka_sleep' &&
    state.interaction.ownerId === AI
  ) {
    const you = state.players[YOU]
    const targets = you.field
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({
        m,
        atk: getEffectiveAtk(state, YOU, m.cardId, m.instanceId),
      }))
      .sort((a, b) => b.atk - a.atk)
    const best = targets[0]
    if (!best) return null
    return {
      apply: (s) => pickRyukaSleep(s, AI, best.m.instanceId),
    }
  }

  if (
    state.interaction.type === 'zeeka_debuff' &&
    state.interaction.ownerId === AI
  ) {
    const you = state.players[YOU]
    const targets = you.field
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({
        m,
        atk: getEffectiveAtk(state, YOU, m.cardId, m.instanceId),
      }))
      .sort((a, b) => b.atk - a.atk)
    const best = targets[0]
    if (!best) return null
    return {
      apply: (s) => pickZeekaDebuff(s, AI, best.m.instanceId),
    }
  }

  if (
    state.interaction.type === 'agatha_search' &&
    state.interaction.ownerId === AI
  ) {
    const me = state.players[AI]
    if (state.interaction.step === 'gy') {
      const gyPick = me.graveyard.find((c) => isKataSpellOrTrap(c.cardId))
      if (!gyPick) return null
      return {
        apply: (s) => pickAgathaSearch(s, AI, gyPick.instanceId),
      }
    }
    const deckPick = me.deck.find((c) => isKataSpellOrTrap(c.cardId))
    if (!deckPick) return null
    return {
      apply: (s) => pickAgathaSearch(s, AI, deckPick.instanceId),
    }
  }

  if (
    state.interaction.type === 'noah_mill' &&
    state.interaction.ownerId === AI
  ) {
    const me = state.players[AI]
    const deckPick = me.deck.find((c) => isKataSpellOrTrap(c.cardId))
    if (!deckPick) return null
    return {
      apply: (s) => pickNoahMill(s, AI, deckPick.instanceId),
    }
  }

  if (
    state.interaction.type === 'guardian_pick' &&
    state.interaction.ownerId === AI
  ) {
    const me = state.players[AI]
    const mage = me.field.find(
      (m) => m && getCard(m.cardId).tribe === 'mage',
    )
    if (!mage) return null
    return {
      apply: (s) => pickGuardianTarget(s, AI, mage.instanceId),
    }
  }

  if (
    state.interaction.type === 'buddy_pick' &&
    state.interaction.ownerId === AI
  ) {
    const me = state.players[AI]
    const mages = me.field
      .filter((m): m is NonNullable<typeof m> => !!m && getCard(m.cardId).tribe === 'mage')
      .map((m) => ({
        m,
        atk: getEffectiveAtk(state, AI, m.cardId, m.instanceId),
      }))
      .sort((a, b) => b.atk - a.atk)
    if (mages.length < 2) return null
    const firstId = state.interaction.firstId
    if (!firstId) {
      return {
        apply: (s) => pickBuddyTarget(s, AI, mages[0]!.m.instanceId),
      }
    }
    const second =
      mages.find((x) => x.m.instanceId !== firstId) ?? mages[1]
    if (!second) return null
    return {
      apply: (s) => pickBuddyTarget(s, AI, second.m.instanceId),
    }
  }

  if (
    state.interaction.type === 'hypnosis_pick' &&
    state.interaction.ownerId === AI
  ) {
    const you = state.players[YOU]
    const foes = you.field
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({
        m,
        atk: getEffectiveAtk(state, YOU, m.cardId, m.instanceId),
      }))
      .sort((a, b) => a.atk - b.atk)
    if (foes.length < 2) return null
    const firstId = state.interaction.firstId
    if (!firstId) {
      return {
        apply: (s) => pickHypnosisTarget(s, AI, foes[0]!.m.instanceId),
      }
    }
    const second =
      foes.find((x) => x.m.instanceId !== firstId) ?? foes[1]
    if (!second) return null
    return {
      apply: (s) => pickHypnosisTarget(s, AI, second.m.instanceId),
    }
  }

  if (
    state.interaction.type === 'teleport_pick' &&
    state.interaction.ownerId === AI
  ) {
    const me = state.players[AI]
    const rank = (c: CardInstance) => getCard(c.cardId).atk ?? 0
    const deckPick = me.deck
      .filter(
        (c) =>
          getCard(c.cardId).tribe === 'mage' &&
          canFreePlaceMonster(state, AI, c.cardId),
      )
      .sort((a, b) => rank(b) - rank(a))[0]
    if (deckPick) {
      return {
        apply: (s) =>
          pickTeleportSummon(s, AI, deckPick.instanceId, 'deck'),
      }
    }
    const gyPick = me.graveyard
      .filter(
        (c) =>
          getCard(c.cardId).tribe === 'mage' &&
          canFreePlaceMonster(state, AI, c.cardId),
      )
      .sort((a, b) => rank(b) - rank(a))[0]
    if (gyPick) {
      return {
        apply: (s) =>
          pickTeleportSummon(s, AI, gyPick.instanceId, 'graveyard'),
      }
    }
    return null
  }

  if (state.activePlayer !== AI) {
    if (state.awaitingTrap && state.interaction.type === 'trap_response') {
      const threat = state.interaction.threat
      const traps = listTrapsForWindow(
        state.players[AI],
        threat.window,
        {
          allowBarrier:
            threat.window === 'on_attack' &&
            isBarrierAttackTarget(state, AI, threat.targetInstanceId),
        },
      )
      if (traps.length === 0) {
        return { apply: (s) => respondTrap(s, AI, false) }
      }
      // Prefer Intercept, then Barrier
      const intercept = traps.find(
        (c) => getCard(c.cardId).effectId === 'kata_intercept',
      )
      const barrier = traps.find(
        (c) => getCard(c.cardId).effectId === 'kata_barrier',
      )
      const pick = intercept ?? barrier ?? traps[0]!
      return {
        apply: (s) => respondTrap(s, AI, true, pick.instanceId),
      }
    }
    return null
  }

  if (state.awaitingTrap) return null

  const me = state.players[AI]

  if (state.phase === 'main1' || state.phase === 'main2') {
    const candidates = collectMainActions(state)
    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    if (best && best.score > 0) {
      return best.choice
    }
    return { apply: (s) => advancePhase(s) }
  }

  if (state.phase === 'battle') {
    const attackers = me.field.filter(
      (m): m is NonNullable<typeof m> =>
        !!m && canAttack(state, AI, m.instanceId),
    )

    for (const atk of attackers) {
      const attack = pickAttackTarget(state, atk)
      if (!attack) continue
      return {
        apply: (s) =>
          declareAttack(s, AI, attack.attackerId, attack.targetId),
        attack,
      }
    }

    return { apply: (s) => advancePhase(s) }
  }

  return { apply: (s) => advancePhase(s) }
}
