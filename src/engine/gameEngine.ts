import { v4 as uuid } from 'uuid'
import { getCard, TUTORIAL_BOT_DECK_LIST, TUTORIAL_DECK_LIST } from '../data/cards'
import {
  mockHand,
  TUTORIAL_BOT_HP,
  TUTORIAL_BOT_OPENING_HAND,
  TUTORIAL_OPENING_HAND,
} from '../tutorial/scenario'
import type {
  CardInstance,
  GameLogEntry,
  GameState,
  Phase,
  PlayerId,
  PlayerState,
} from '../types/game'

const PHASE_ORDER: Phase[] = ['draw', 'main1', 'battle', 'main2', 'end']
const STARTING_HP = 50
const FIELD_SIZE = 4
const MAX_SPELL_TRAP = 10
const MAX_ENERGY_CARRY = 5
const BASE_ENERGY_INCOME = 2
const OPENING_HAND = 5
/** Soft refill target at start of turn draw */
const DRAW_HAND_FLOOR = 4
export const MAX_HAND = 7

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeInstance(
  cardId: string,
  turn = 0,
  evolved = false,
  originalOwnerId?: PlayerId,
): CardInstance {
  return {
    instanceId: uuid(),
    cardId,
    canAttack: false,
    hasAttacked: false,
    summonTurn: turn,
    ...(originalOwnerId ? { originalOwnerId } : {}),
    ...(evolved ? { evolved: true } : {}),
  }
}

/** Clear field-only state when a monster leaves the field for the hand */
function resetForHand(card: CardInstance): CardInstance {
  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    canAttack: false,
    hasAttacked: false,
    summonTurn: card.summonTurn,
    faceDown: false,
    // Keep cost override if Shorin fetched this card this turn
    tempCostOverride: card.tempCostOverride,
    ...(card.originalOwnerId ? { originalOwnerId: card.originalOwnerId } : {}),
    ...(card.evolved ? { evolved: true } : {}),
  }
}

/** Fresh field state when summoning from hand/deck (no carried ATK mods) */
function resetForSummon(card: CardInstance, turn: number): CardInstance {
  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    canAttack: true,
    hasAttacked: false,
    summonTurn: turn,
    ...(card.originalOwnerId ? { originalOwnerId: card.originalOwnerId } : {}),
    ...(card.evolved ? { evolved: true } : {}),
  }
}

function buildDeckInstances(
  deckList: Record<string, number>,
  evolvedCounts?: Record<string, number>,
  originalOwnerId?: PlayerId,
): CardInstance[] {
  const instances: CardInstance[] = []
  for (const [cardId, n] of Object.entries(deckList)) {
    const total = Math.max(0, Math.floor(n))
    const evoN = Math.min(total, Math.max(0, Math.floor(evolvedCounts?.[cardId] ?? 0)))
    for (let i = 0; i < total; i++) {
      instances.push(makeInstance(cardId, 0, i < evoN, originalOwnerId))
    }
  }
  return shuffle(instances)
}

/**
 * Send a card to the original owner's graveyard (not necessarily the controller).
 * Caller must already remove the card from field/hand/ST.
 */
function depositToOwnerGy(
  players: GameState['players'],
  card: CardInstance,
  controllerId: PlayerId,
): GameState['players'] {
  const ownerId = card.originalOwnerId ?? controllerId
  const cleaned: CardInstance = {
    ...card,
    originalOwnerId: ownerId,
    faceDown: false,
  }
  const owner = players[ownerId]
  return {
    ...players,
    [ownerId]: {
      ...owner,
      graveyard: [...owner.graveyard, cleaned],
    },
  }
}

/**
 * Return a card to the original owner's hand.
 * Caller must already remove it from the field (etc.).
 */
function depositToOwnerHand(
  players: GameState['players'],
  card: CardInstance,
  controllerId: PlayerId,
): GameState['players'] {
  const ownerId = card.originalOwnerId ?? controllerId
  const cleaned = resetForHand({
    ...card,
    originalOwnerId: ownerId,
  })
  const owner = players[ownerId]
  return {
    ...players,
    [ownerId]: {
      ...owner,
      hand: [...owner.hand, cleaned],
    },
  }
}

/** Append many cards to each card's owner's GY (order preserved per owner). */
function depositManyToOwnerGy(
  players: GameState['players'],
  cards: CardInstance[],
  controllerId: PlayerId,
): GameState['players'] {
  let next = players
  for (const c of cards) {
    next = depositToOwnerGy(next, c, controllerId)
  }
  return next
}

function createPlayer(
  id: PlayerId,
  name: string,
  deckList: Record<string, number>,
  evolvedCounts?: Record<string, number>,
): PlayerState {
  const deck = buildDeckInstances(deckList, evolvedCounts, id)
  return {
    id,
    name,
    hp: STARTING_HP,
    energy: 0,
    pendingTrapCost: 0,
    turnEnergy: 0,
    combatEnergy: 0,
    deck,
    hand: [],
    graveyard: [],
    field: Array(FIELD_SIZE).fill(null),
    spellTrap: [],
  }
}

function log(state: GameState, text: string): GameState {
  const entry: GameLogEntry = { id: uuid(), text, turn: state.turn }
  return { ...state, log: [entry, ...state.log].slice(0, 80) }
}

function otherPlayer(id: PlayerId): PlayerId {
  return id === 'player' ? 'opponent' : 'player'
}

function drawCards(player: PlayerState, n: number): PlayerState {
  const deck = [...player.deck]
  const hand = [...player.hand]
  for (let i = 0; i < n; i++) {
    if (deck.length === 0) break
    hand.push(deck.shift()!)
  }
  return { ...player, deck, hand }
}

export function handOverflow(player: PlayerState): number {
  return Math.max(0, player.hand.length - MAX_HAND)
}

/** Enter discard mode if hand exceeds MAX_HAND */
export function enforceHandLimit(
  state: GameState,
  playerId: PlayerId,
): GameState {
  const overflow = handOverflow(state.players[playerId])
  if (overflow <= 0) return state
  let next: GameState = {
    ...state,
    interaction: { type: 'discard', remaining: overflow, ownerId: playerId },
  }
  next = log(
    next,
    `${state.players[playerId].name} มือเกิน ${MAX_HAND} ใบ — ต้องทิ้ง ${overflow} ใบ`,
  )
  return next
}

export function canDiscard(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.interaction.type !== 'discard') return false
  // Allow discard even off-turn (e.g. Alkata GY recover mid-opponent turn)
  if (state.interaction.ownerId !== playerId) return false
  return findHandIndex(state.players[playerId], instanceId) >= 0
}

export function discardFromHand(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): GameState {
  if (!canDiscard(state, playerId, instanceId)) return state

  let player = { ...state.players[playerId] }
  const idx = findHandIndex(player, instanceId)
  const card = player.hand[idx]
  const def = getCard(card.cardId)
  const hand = [...player.hand]
  hand.splice(idx, 1)
  player = { ...player, hand }

  let players = depositToOwnerGy(
    { ...state.players, [playerId]: player },
    { ...card, faceDown: false },
    playerId,
  )
  player = players[playerId]

  const remaining = handOverflow(player)
  let next: GameState = {
    ...state,
    players,
    interaction:
      remaining > 0
        ? { type: 'discard', remaining, ownerId: playerId }
        : { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(next, `${player.name} ทิ้ง ${def.nameTh} (มือ ${hand.length}/${MAX_HAND})`)
  // After hand is legal again, resume pending Alkata leave-field triggers
  // (e.g. Alkata's Plan destroy → draw overflow → discard → GY recover / hand summon)
  if (next.interaction.type === 'idle') {
    next = checkWinner(next)
  }
  return next
}

function applyDamage(
  player: PlayerState,
  amount: number,
  fromCombat = false,
): PlayerState {
  if (amount <= 0) return player
  return {
    ...player,
    hp: Math.max(0, player.hp - amount),
    energy: player.energy + amount,
    combatEnergy: fromCombat
      ? player.combatEnergy + amount
      : player.combatEnergy,
  }
}

function spendEnergy(player: PlayerState, amount: number): PlayerState {
  if (amount <= 0) return player
  const energy = Math.max(0, player.energy - amount)
  return {
    ...player,
    energy,
    combatEnergy: Math.min(player.combatEnergy, energy),
  }
}

function capEnergyCarry(player: PlayerState): PlayerState {
  const combat = Math.min(player.combatEnergy, player.energy)
  const normal = player.energy - combat
  const energy = Math.min(normal, MAX_ENERGY_CARRY) + combat
  return {
    ...player,
    energy,
    combatEnergy: Math.min(combat, energy),
  }
}

function startOfTurnEnergy(player: PlayerState): PlayerState {
  const income = player.turnEnergy + BASE_ENERGY_INCOME
  let next: PlayerState = {
    ...player,
    energy: player.energy + income,
    turnEnergy: income,
  }
  if (next.pendingTrapCost > 0) {
    next = spendEnergy(next, next.pendingTrapCost)
    next = { ...next, pendingTrapCost: 0 }
  }
  return next
}

function enableAttacks(player: PlayerState): PlayerState {
  return {
    ...player,
    field: player.field.map((m) =>
      m
        ? {
            ...m,
            canAttack: m.asleepUntil ? false : true,
            hasAttacked: m.asleepUntil ? true : false,
            effectUsed: false,
            effectUses: undefined,
          }
        : null,
    ),
  }
}

export function createGame(
  playerDeck: Record<string, number>,
  opponentDeck: Record<string, number>,
  playerName = 'คุณ',
  opponentName = 'CPU',
  options?: { playerEvolved?: Record<string, number> },
): GameState {
  const firstPlayer: PlayerId = Math.random() < 0.5 ? 'player' : 'opponent'
  let player = createPlayer(
    'player',
    playerName,
    playerDeck,
    options?.playerEvolved,
  )
  let opponent = createPlayer('opponent', opponentName, opponentDeck)

  player = drawCards(player, OPENING_HAND)
  opponent = drawCards(opponent, OPENING_HAND)

  let state: GameState = {
    turn: 1,
    activePlayer: firstPlayer,
    phase: 'draw',
    firstPlayer,
    players: { player, opponent },
    winner: null,
    log: [],
    selectedCardId: null,
    interaction: { type: 'idle' },
    awaitingTrap: false,
  }

  state = log(
    state,
    `${firstPlayer === 'player' ? playerName : opponentName} ได้สิทธิ์เริ่มก่อน`,
  )

  // Start first turn
  state = beginTurn(state)
  return state
}

/** Guided practice duel — player first, mocked opening hand, bot at low HP. */
export function createTutorialGame(): GameState {
  let player = createPlayer('player', 'คุณ', TUTORIAL_DECK_LIST)
  let opponent = createPlayer('opponent', 'บอทฝึก', TUTORIAL_BOT_DECK_LIST)
  opponent = { ...opponent, hp: TUTORIAL_BOT_HP }
  opponent = mockHand(opponent, TUTORIAL_BOT_OPENING_HAND)

  let state: GameState = {
    turn: 1,
    activePlayer: 'player',
    phase: 'draw',
    firstPlayer: 'player',
    players: { player, opponent },
    winner: null,
    log: [],
    selectedCardId: null,
    interaction: { type: 'idle' },
    awaitingTrap: false,
  }

  state = log(
    state,
    `โหมดสอน — บอทเริ่มที่พลังชีวิต ${TUTORIAL_BOT_HP} (จำลองจนตีให้หมด)`,
  )
  state = beginTurn(state)
  // Replace opening hand after draw so the lesson stays on rails
  player = mockHand(state.players.player, TUTORIAL_OPENING_HAND)
  state = {
    ...state,
    players: { ...state.players, player },
  }
  return state
}

function beginTurn(state: GameState): GameState {
  const id = state.activePlayer

  // Fresh once-per-card Alkata leave-hand-summon window for both players
  const clearAlkataHandLimit = (p: PlayerState): PlayerState => ({
    ...p,
    alkataHandSummonUsedThisTurn: false,
    alkataHandSummonedCardIdsThisTurn: [],
  })

  let player = startOfTurnEnergy(clearAlkataHandLimit(state.players[id]))
  player = enableAttacks(player)
  const other = clearAlkataHandLimit(state.players[otherPlayer(id)])
  state = {
    ...state,
    players: {
      ...state.players,
      [id]: player,
      [otherPlayer(id)]: other,
    },
  }

  // Draw: refill to 4 if hand < 4, otherwise draw 1
  const handBefore = player.hand.length
  const drawCount = handBefore < DRAW_HAND_FLOOR ? DRAW_HAND_FLOOR - handBefore : 1

  if (player.deck.length === 0) {
    const winner = otherPlayer(id)
    let next: GameState = {
      ...state,
      players: { ...state.players, [id]: player },
      winner,
      phase: 'draw',
    }
    next = log(next, `${player.name} จั่วการ์ดไม่ได้ — แพ้ด้วยเด็คว่าง!`)
    return next
  }

  const deckBefore = player.deck.length
  player = drawCards(player, drawCount)
  const drawn = player.hand.length - handBefore

  if (deckBefore < drawCount) {
    const winner = otherPlayer(id)
    let next: GameState = {
      ...state,
      players: { ...state.players, [id]: player },
      winner,
      phase: 'draw',
    }
    next = log(
      next,
      `${player.name} จั่วได้ ${drawn} ใบแล้วเด็คว่าง — แพ้ด้วยเด็คว่าง!`,
    )
    return next
  }

  // Preparation Incantation: +1 draw if any drawn card is mage / 「คาถา」
  let prepBonus = 0
  const hasActivePrep = player.spellTrap.some(
    (c) =>
      getCard(c.cardId).effectId === 'kata_prepare' &&
      (c.continuousTurnsLeft ?? 0) > 0,
  )
  if (hasActivePrep && drawn > 0) {
    const drawnCards = player.hand.slice(handBefore)
    const triggers = drawnCards.some((c) => isPrepDrawTrigger(c.cardId))
    if (triggers && player.deck.length > 0) {
      const beforeBonus = player.hand.length
      player = drawCards(player, 1)
      prepBonus = player.hand.length - beforeBonus
    }
  }

  const handAfterNormal = handBefore + drawn
  let next: GameState = {
    ...state,
    phase: 'draw',
    players: { ...state.players, [id]: player },
    interaction: { type: 'idle' },
    awaitingTrap: false,
  }

  next = log(
    next,
    handBefore < DRAW_HAND_FLOOR
      ? `${player.name} จั่วเติมมือ ${drawn} ใบ → ${handAfterNormal} ใบ (พลังงาน ${player.energy} · ได้เทิร์นนี้ +${player.turnEnergy})`
      : `${player.name} จั่ว ${drawn} ใบ (มือ ${handAfterNormal} · พลังงาน ${player.energy} · ได้เทิร์นนี้ +${player.turnEnergy})`,
  )
  if (prepBonus > 0) {
    next = log(
      next,
      `คาถาแห่งการเตรียมตัว — จั่วเพิ่ม ${prepBonus} ใบ (มือ ${player.hand.length})`,
    )
  }
  next = { ...next, phase: 'main1' }
  next = settleAfterKataResolution(next, id)
  return enforceHandLimit(next, id)
}

export function advancePhase(state: GameState): GameState {
  if (state.winner || state.awaitingTrap) return state
  if (state.interaction.type === 'discard') return state
  if (state.interaction.type === 'reinforce') return state
  if (state.interaction.type === 'soul_drain') return state
  if (state.interaction.type === 'alkata_plot') return state
  if (state.interaction.type === 'special_mod') return state
  if (state.interaction.type === 'interference_pick') return state
  if (state.interaction.type === 'signal_amp_pick') return state
  if (state.interaction.type === 'emergency_pick') return state
  if (state.interaction.type === 'emergency_summon') return state
  if (state.interaction.type === 'mina_recruit') return state
  if (state.interaction.type === 'sara_discard') return state
  if (state.interaction.type === 'alkata_call_discard') return state
  if (state.interaction.type === 'alkata_call_summon') return state
  if (state.interaction.type === 'sola_pay') return state
  if (state.interaction.type === 'beta_extra_destroy') return state
  if (state.interaction.type === 'sora_destroy') return state
  if (state.interaction.type === 'omega_search') return state
  if (state.interaction.type === 'alkata_deck_search') return state
  if (state.interaction.type === 'alkata_mina_summon') return state
  if (state.interaction.type === 'soluy_swap') return state
  if (state.interaction.type === 'shorin_search') return state
  if (state.interaction.type === 'saruka_search') return state
  if (state.interaction.type === 'ryuka_fetch') return state
  if (state.interaction.type === 'ryuka_sleep') return state
  if (state.interaction.type === 'zeeka_debuff') return state
  if (state.interaction.type === 'agatha_search') return state
  if (state.interaction.type === 'noah_mill') return state
  if (state.interaction.type === 'guardian_pick') return state
  if (state.interaction.type === 'buddy_pick') return state
  if (state.interaction.type === 'hypnosis_pick') return state
  if (state.interaction.type === 'teleport_pick') return state
  if (state.interaction.type === 'alkata_gy_recover') return state
  if (state.interaction.type === 'alkata_hand_summon') return state
  if (state.interaction.type === 'alkata_debuff') return state
  if (state.interaction.type === 'alkata_hokana_recycle') return state

  const idx = PHASE_ORDER.indexOf(state.phase)

  if (state.phase === 'end') {
    return endTurn(state)
  }

  const nextPhase = PHASE_ORDER[idx + 1]

  let next: GameState = {
    ...state,
    phase: nextPhase,
    interaction: { type: 'idle' },
  }
  next = log(next, `เข้าสู่ ${nextPhase.toUpperCase()} Phase`)

  if (nextPhase === 'battle') {
    next = destroyBattlePhaseMonsters(next)
    if (next.winner || next.interaction.type !== 'idle') return next
  }

  if (nextPhase === 'end') {
    return endTurn(next)
  }
  return next
}

function endTurn(state: GameState): GameState {
  const id = state.activePlayer
  let players = state.players

  // Destroy Signal Amplifier summons (and similar) at end of controller's turn
  const eotDestroy = destroyEndOfTurnMonsters(players, id)
  players = eotDestroy.players
  let eotNote = eotDestroy.note
  let player = players[id]

  // Tick continuous ST (Preparation Incantation etc.)
  const eotContinuous = tickContinuousSpellTraps(player)
  player = eotContinuous.player
  if (eotContinuous.note) {
    eotNote = eotNote ? `${eotNote} · ${eotContinuous.note}` : eotContinuous.note
  }

  // Cap leftover turn energy (combat-damage energy is not capped)
  player = capEnergyCarry(player)

  // Clear temporary ATK mods + cost overrides + field locks at end of turn
  const clearTemp = (p: PlayerState, endingId: PlayerId): PlayerState => ({
    ...p,
    field: p.field.map((m) => {
      if (!m) return m
      let next = m
      if (m.tempAtkMod || m.tempCostOverride !== undefined) {
        next = { ...next, tempAtkMod: undefined, tempCostOverride: undefined }
      }
      if (m.battleShieldUntil === endingId) {
        next = { ...next, battleShieldUntil: undefined }
      }
      // Saruka (+8 until opp EOT): clear when the opponent of this controller ends
      if (m.oppEotAtkMod && endingId === otherPlayer(p.id)) {
        next = { ...next, oppEotAtkMod: undefined }
      }
      // Ryuka sleep: clear when the designated player ends their turn
      if (m.asleepUntil === endingId) {
        next = { ...next, asleepUntil: undefined }
      }
      return next === m ? m : next
    }),
    hand: p.hand.map((c) =>
      c.tempCostOverride !== undefined
        ? { ...c, tempCostOverride: undefined }
        : c,
    ),
    spellTrap: p.spellTrap.map((c) =>
      c.tempCostOverride !== undefined
        ? { ...c, tempCostOverride: undefined }
        : c,
    ),
    // Ryuka echo names last only for the controller's turn
    ryukaEchoNames:
      endingId === p.id ? undefined : p.ryukaEchoNames,
    ryukaDoubleQueued:
      endingId === p.id ? undefined : p.ryukaDoubleQueued,
    ryukaDoubleEffectId:
      endingId === p.id ? undefined : p.ryukaDoubleEffectId,
    zeekaDebuffPending:
      endingId === p.id ? undefined : p.zeekaDebuffPending,
  })
  player = clearTemp(player, id)
  const waiting = otherPlayer(id)
  const opponent = clearTemp(players[waiting], id)

  let next: GameState = {
    ...state,
    players: {
      ...players,
      [id]: player,
      [waiting]: opponent,
    },
    interaction: { type: 'idle' },
  }
  if (eotNote) next = log(next, eotNote)
  next = log(next, `${player.name} จบเทิร์น`)
  next = checkWinner(next)
  if (next.winner) return next
  if (next.interaction.type !== 'idle') return next

  const nextActive = waiting
  const nextTurn = nextActive === state.firstPlayer ? state.turn + 1 : state.turn
  next = {
    ...next,
    activePlayer: nextActive,
    turn: nextTurn,
    phase: 'draw',
  }
  return beginTurn(next)
}

/** Send monsters marked destroyAtEndTurn to original owner's GY */
function destroyEndOfTurnMonsters(
  players: GameState['players'],
  controllerId: PlayerId,
): {
  players: GameState['players']
  note: string | null
} {
  let controller = { ...players[controllerId] }
  const doomed = controller.field.filter((m) => m?.destroyAtEndTurn)
  if (doomed.length === 0) return { players, note: null }

  let nextPlayers: GameState['players'] = {
    ...players,
    [controllerId]: controller,
  }
  const toGy: CardInstance[] = []
  const names: string[] = []
  for (const mon of doomed) {
    if (!mon) continue
    controller = nextPlayers[controllerId]
    const idx = findFieldIndex(controller, mon.instanceId)
    if (idx < 0) continue
    const field = [...controller.field]
    field[idx] = null
    controller = { ...controller, field }
    const destroyed = afterMonsterDestroyed(controller, mon)
    controller = destroyed.player
    nextPlayers = {
      ...nextPlayers,
      [controllerId]: controller,
    }
    toGy.push({ ...mon, destroyAtEndTurn: undefined })
    names.push(getCard(mon.cardId).nameTh)
  }
  nextPlayers = depositManyToOwnerGy(nextPlayers, toGy, controllerId)
  return {
    players: nextPlayers,
    note: names.length
      ? `จบเทิร์น — ทำลาย ${names.join(' · ')}`
      : null,
  }
}

/** Decrement continuous ST turn counters; send expired cards to GY */
function tickContinuousSpellTraps(player: PlayerState): {
  player: PlayerState
  note: string | null
} {
  if (!player.spellTrap.some((c) => c.continuousTurnsLeft !== undefined)) {
    return { player, note: null }
  }

  const kept: CardInstance[] = []
  const expired: CardInstance[] = []
  for (const c of player.spellTrap) {
    if (c.continuousTurnsLeft === undefined) {
      kept.push(c)
      continue
    }
    const left = c.continuousTurnsLeft - 1
    if (left <= 0) {
      expired.push({ ...c, continuousTurnsLeft: undefined, faceDown: false })
    } else {
      kept.push({ ...c, continuousTurnsLeft: left })
    }
  }

  if (expired.length === 0) {
    return { player: { ...player, spellTrap: kept }, note: null }
  }

  return {
    player: {
      ...player,
      spellTrap: kept,
      graveyard: [...player.graveyard, ...expired],
    },
    note: `${expired.map((c) => getCard(c.cardId).nameTh).join(' · ')} หมดอายุต่อเนื่อง — เข้าสุสาน`,
  }
}

function destroyBattlePhaseMonsters(state: GameState): GameState {
  let next = state
  const names: string[] = []
  for (const controllerId of ['player', 'opponent'] as PlayerId[]) {
    let player = { ...next.players[controllerId] }
    const doomed = player.field.filter((m) => m?.destroyAtBattlePhase)
    if (doomed.length === 0) continue
    let players = { ...next.players, [controllerId]: player }
    const toGy: CardInstance[] = []
    for (const mon of doomed) {
      if (!mon) continue
      player = players[controllerId]
      const idx = findFieldIndex(player, mon.instanceId)
      if (idx < 0) continue
      const field = [...player.field]
      field[idx] = null
      player = { ...player, field }
      const destroyed = afterMonsterDestroyed(player, mon)
      player = destroyed.player
      players = { ...players, [controllerId]: player }
      toGy.push({ ...mon, destroyAtBattlePhase: undefined })
      names.push(getCard(mon.cardId).nameTh)
    }
    next = {
      ...next,
      players: depositManyToOwnerGy(players, toGy, controllerId),
    }
  }
  if (names.length > 0) {
    next = log(next, `เข้า Battle Phase — ทำลาย ${names.join(' · ')}`)
    return checkWinner(next)
  }
  return next
}

function findFieldIndex(player: PlayerState, instanceId: string): number {
  return player.field.findIndex((m) => m?.instanceId === instanceId)
}

function findSpellTrapIndex(player: PlayerState, instanceId: string): number {
  return player.spellTrap.findIndex((c) => c.instanceId === instanceId)
}

function findHandIndex(player: PlayerState, instanceId: string): number {
  return player.hand.findIndex((c) => c.instanceId === instanceId)
}

function canAddSpellTrap(player: PlayerState): boolean {
  return player.spellTrap.length < MAX_SPELL_TRAP
}

function isWarrior(cardId: string): boolean {
  return getCard(cardId).tribe === 'warrior'
}

function buffOurWarriors(player: PlayerState, amount: number): PlayerState {
  const field = player.field.map((m) => {
    if (!m || !isWarrior(m.cardId)) return m
    return { ...m, atkMod: (m.atkMod ?? 0) + amount }
  })
  return { ...player, field }
}

function debuffAllMonsters(player: PlayerState, amount: number): PlayerState {
  const field = player.field.map((m) =>
    m ? { ...m, atkMod: (m.atkMod ?? 0) + amount } : null,
  )
  return { ...player, field }
}

/** On-summon triggers (Sari buffs our warriors; Michael debuffs enemy field) */
function applySummonTriggers(
  player: PlayerState,
  opponent: PlayerState,
  summonedCardId: string,
): { player: PlayerState; opponent: PlayerState; note: string | null } {
  const def = getCard(summonedCardId)

  if (def.effectId === 'sari_rally') {
    return {
      player: buffOurWarriors(player, 2),
      opponent,
      note: `${def.nameTh} อัญเชิญ! มอนสเตอร์นักรบบนสนามฝั่งเราทุกตัว ATK +2`,
    }
  }

  if (def.effectId === 'michael_scout') {
    return {
      player,
      opponent: debuffAllMonsters(opponent, -2),
      note: `${def.nameTh} อัญเชิญ! มอนสเตอร์ฝ่ายตรงข้ามทุกตัว ATK −2`,
    }
  }

  return { player, opponent, note: null }
}

/** When Sari/Michael leave the field for the hand */
function applyReturnToHandTriggers(
  player: PlayerState,
  opponent: PlayerState,
  returnedCardId: string,
): { player: PlayerState; opponent: PlayerState; note: string | null } {
  const def = getCard(returnedCardId)

  if (def.effectId === 'sari_rally') {
    return {
      player: buffOurWarriors(player, 2),
      opponent,
      note: `${def.nameTh} ขึ้นมือจากสนาม! มอนสเตอร์นักรบบนสนามฝั่งเราทุกตัว ATK +2`,
    }
  }

  if (def.effectId === 'michael_scout') {
    return {
      player,
      opponent: debuffAllMonsters(opponent, -2),
      note: `${def.nameTh} ขึ้นมือจากสนาม! มอนสเตอร์ฝ่ายตรงข้ามทุกตัว ATK −2`,
    }
  }

  return { player, opponent, note: null }
}

/** Undo return-to-hand triggers when Soluy bounce is cancelled */
function undoReturnToHandTriggers(
  player: PlayerState,
  opponent: PlayerState,
  returnedCardId: string,
): { player: PlayerState; opponent: PlayerState } {
  const def = getCard(returnedCardId)
  if (def.effectId === 'sari_rally') {
    return { player: buffOurWarriors(player, -2), opponent }
  }
  if (def.effectId === 'michael_scout') {
    return { player, opponent: debuffAllMonsters(opponent, 2) }
  }
  return { player, opponent }
}

function canStartMinaRecruit(
  state: GameState,
  playerId: PlayerId,
  excludeMina = true,
): boolean {
  const player = state.players[playerId]
  if (!player.field.some((z) => z === null)) return false
  return player.deck.some(
    (c) =>
      isWarrior(c.cardId) &&
      !(excludeMina && getCard(c.cardId).effectId === 'mina_recruit') &&
      canFreePlaceMonster(state, playerId, c.cardId),
  )
}

function resumeReinforceInteraction(
  state: GameState,
  playerId: PlayerId,
  resume?: number,
): GameState {
  if (!resume || resume <= 0) return state
  const still = state.players[playerId].hand.some((c) =>
    canReinforceSummon(
      { ...state, interaction: { type: 'reinforce', summonsLeft: resume } },
      playerId,
      c.instanceId,
    ),
  )
  if (!still) return state
  return {
    ...state,
    interaction: { type: 'reinforce', summonsLeft: resume },
  }
}

/** Open deck warrior recruit UI (Mina / Sara) */
function openDeckWarriorRecruit(
  state: GameState,
  playerId: PlayerId,
  source: 'mina' | 'sara',
  resumeReinforce?: number,
): GameState {
  const excludeMina = source === 'mina'
  if (!canStartMinaRecruit(state, playerId, excludeMina)) {
    return resumeReinforceInteraction(state, playerId, resumeReinforce)
  }
  const label = source === 'sara' ? 'ซาร่า' : 'มีน่า'
  let next: GameState = {
    ...state,
    interaction: {
      type: 'mina_recruit',
      resumeReinforce,
      source,
    },
  }
  next = log(
    next,
    source === 'mina'
      ? `${label} — เลือกนักรบจากเด็คเพื่ออัญเชิญลงสนาม (ยกเว้นมีน่า)`
      : `${label} — เลือกนักรบจากเด็คเพื่ออัญเชิญลงสนาม`,
  )
  return next
}

/** After summon triggers — open Mina deck recruit if possible */
function maybeStartMinaRecruit(
  state: GameState,
  playerId: PlayerId,
  summonedCardId: string,
  resumeReinforce?: number,
): GameState {
  if (getCard(summonedCardId).effectId !== 'mina_recruit') return state
  return openDeckWarriorRecruit(state, playerId, 'mina', resumeReinforce)
}

/**
 * Sara Trainee: destroy self on summon, then discard 1 from hand to recruit
 * a warrior from the deck.
 */
function maybeStartSaraSacrifice(
  state: GameState,
  playerId: PlayerId,
  summonedCardId: string,
  summonedInstanceId: string,
  resumeReinforce?: number,
): GameState {
  if (getCard(summonedCardId).effectId !== 'sara_sacrifice') return state

  let player = { ...state.players[playerId] }
  const zone = player.field.findIndex((m) => m?.instanceId === summonedInstanceId)
  if (zone < 0) return state

  const self = player.field[zone]!
  const field = [...player.field]
  field[zone] = null
  player = { ...player, field }
  let players = depositToOwnerGy(
    { ...state.players, [playerId]: player },
    { ...self, faceDown: false },
    playerId,
  )
  player = players[playerId]

  const def = getCard(summonedCardId)
  let next: GameState = {
    ...state,
    players,
    interaction: { type: 'idle' },
  }
  next = log(next, `${player.name} — ${def.nameTh} ทำลายตัวเอง!`)

  if (player.hand.length === 0) {
    next = log(next, `ไม่มีไพ่ในมือสำหรับทิ้ง — ข้ามการอัญเชิญจากเด็ค`)
    return resumeReinforceInteraction(next, playerId, resumeReinforce)
  }

  next = {
    ...next,
    interaction: { type: 'sara_discard', resumeReinforce },
  }
  next = log(next, `${def.nameTh} — เลือกทิ้งการ์ดจากมือ 1 ใบ เพื่ออัญเชิญนักรบจากเด็ค`)
  return next
}

/** Run on-summon follow-ups (Sara sacrifice → Mina recruit) */
function afterSummonEffects(
  state: GameState,
  playerId: PlayerId,
  summonedCardId: string,
  summonedInstanceId: string,
  resumeReinforce?: number,
): GameState {
  let next = maybeStartSaraSacrifice(
    state,
    playerId,
    summonedCardId,
    summonedInstanceId,
    resumeReinforce,
  )
  if (next.interaction.type === 'sara_discard') return next
  next = maybeStartMinaRecruit(next, playerId, summonedCardId, resumeReinforce)
  if (next.interaction.type === 'mina_recruit') return next
  next = maybeStartOmegaSearch(next, playerId, summonedCardId)
  if (next.interaction.type === 'omega_search') return next
  next = maybeStartZulSearch(next, playerId, summonedCardId)
  if (next.interaction.type === 'alkata_deck_search') return next
  next = maybeStartAlkataMina(
    next,
    playerId,
    summonedCardId,
    summonedInstanceId,
  )
  if (next.interaction.type === 'alkata_mina_summon') return next
  next = maybeStartSonaBuff(next, playerId, summonedCardId, summonedInstanceId)
  next = maybeStartHokanaRecycle(
    next,
    playerId,
    summonedCardId,
    summonedInstanceId,
  )
  if (next.interaction.type === 'alkata_hokana_recycle') return next
  next = maybeStartSorunDebuff(next, playerId, summonedCardId, summonedInstanceId)
  if (next.interaction.type === 'alkata_debuff') return next
  return maybeStartSoraDestroy(next, playerId, summonedCardId)
}

function hasDestroyableOpponentMonster(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const opp = state.players[otherPlayer(playerId)]
  return opp.field.some((m) => m !== null)
}

function maybeStartSoraDestroy(
  state: GameState,
  playerId: PlayerId,
  summonedCardId: string,
): GameState {
  if (getCard(summonedCardId).effectId !== 'sora_bomb') return state
  const opp = state.players[otherPlayer(playerId)]
  // Only triggers if opponent has a monster — never forced onto own board
  if (!opp.field.some((m) => m !== null)) {
    return log(
      state,
      `${getCard(summonedCardId).nameTh} อัญเชิญ — ไม่มีมอนสเตอร์ฝ่ายตรงข้าม (ข้ามการทำลาย)`,
    )
  }
  let next: GameState = {
    ...state,
    interaction: { type: 'sora_destroy' },
  }
  next = log(
    next,
    `${getCard(summonedCardId).nameTh} อัญเชิญ! เลือกมอนสเตอร์ฝ่ายตรงข้าม 1 ตัวเพื่อทำลาย`,
  )
  return next
}

/** Sora — destroy one opponent monster */
export function pickSoraDestroy(
  state: GameState,
  playerId: PlayerId,
  targetInstanceId: string,
): GameState {
  if (state.interaction.type !== 'sora_destroy') return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const oppId = otherPlayer(playerId)
  let opponent = { ...state.players[oppId] }
  const mIdx = findFieldIndex(opponent, targetInstanceId)
  if (mIdx < 0) return state

  const mon = opponent.field[mIdx]!
  const monDef = getCard(mon.cardId)
  const field = [...opponent.field]
  field[mIdx] = null
  opponent = { ...opponent, field }
  const destroyed = afterMonsterDestroyed(opponent, mon)
  opponent = destroyed.player

  let players = depositToOwnerGy(
    { ...state.players, [oppId]: opponent },
    { ...mon, faceDown: false },
    oppId,
  )

  let next: GameState = {
    ...state,
    players,
    interaction: { type: 'idle' },
    selectedCardId: monDef.id,
  }
  next = log(
    next,
    `${state.players[playerId].name} ใช้เอฟเฟคโซระ — ทำลาย ${monDef.nameTh}`,
  )
  if (destroyed.note) next = log(next, destroyed.note)
  return flushAlkataTriggers(checkWinner(next))
}

/** Skip Sora destroy when no valid (unlocked) targets remain */
export function skipSoraDestroy(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.interaction.type !== 'sora_destroy') return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state
  if (hasDestroyableOpponentMonster(state, playerId)) return state

  let next: GameState = {
    ...state,
    interaction: { type: 'idle' },
  }
  next = log(
    next,
    `${state.players[playerId].name} — โซระข้ามการทำลาย (ไม่มีเป้าที่ทำลายได้)`,
  )
  return next
}

const DESTRUCTION_ROBOT_NAME = 'หุ่นยนต์แห่งการทำลาย'

function isDestructionRobotCard(cardId: string): boolean {
  return getCard(cardId).nameTh.includes(DESTRUCTION_ROBOT_NAME)
}

function listDestructionRobotsInDeck(player: PlayerState): CardInstance[] {
  return player.deck.filter((c) => isDestructionRobotCard(c.cardId))
}

function addDestructionRobotsFromDeck(
  state: GameState,
  playerId: PlayerId,
  instanceIds: string[],
  options?: { enforceHand?: boolean },
): GameState {
  if (instanceIds.length === 0) return state
  const enforceHand = options?.enforceHand !== false
  let player = { ...state.players[playerId] }
  let deck = [...player.deck]
  const added: string[] = []
  const handAdd: CardInstance[] = []

  for (const id of instanceIds) {
    const idx = deck.findIndex((c) => c.instanceId === id)
    if (idx < 0) continue
    const card = deck[idx]
    if (!isDestructionRobotCard(card.cardId)) continue
    deck.splice(idx, 1)
    handAdd.push(card)
    added.push(getCard(card.cardId).nameTh)
  }

  if (handAdd.length === 0) return state

  player = {
    ...player,
    deck: shuffle(deck),
    hand: [...player.hand, ...handAdd],
  }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
  }
  next = log(
    next,
    `${player.name} นำจากเด็คขึ้นมือ: ${added.join(' · ')}`,
  )
  return enforceHand ? enforceHandLimit(next, playerId) : next
}

function maybeStartOmegaSearch(
  state: GameState,
  playerId: PlayerId,
  summonedCardId: string,
): GameState {
  if (getCard(summonedCardId).effectId !== 'omega_destroyer') return state
  const matches = listDestructionRobotsInDeck(state.players[playerId])
  if (matches.length === 0) {
    return log(
      state,
      `${getCard(summonedCardId).nameTh} — ไม่มี "${DESTRUCTION_ROBOT_NAME}" ในเด็ค`,
    )
  }
  if (matches.length <= 2) {
    let next = log(
      state,
      `${getCard(summonedCardId).nameTh} อัญเชิญ! นำ "${DESTRUCTION_ROBOT_NAME}" จากเด็คขึ้นมือ ${matches.length} ใบ`,
    )
    return addDestructionRobotsFromDeck(
      next,
      playerId,
      matches.map((c) => c.instanceId),
    )
  }
  let next: GameState = {
    ...state,
    interaction: { type: 'omega_search', remaining: 2 },
  }
  next = log(
    next,
    `${getCard(summonedCardId).nameTh} — เลือก "${DESTRUCTION_ROBOT_NAME}" จากเด็คขึ้นมือได้ ${2} ใบ`,
  )
  return next
}

/** Omega — pick a Destruction Robot from deck to hand */
export function pickOmegaSearch(
  state: GameState,
  playerId: PlayerId,
  deckInstanceId: string,
): GameState {
  if (state.interaction.type !== 'omega_search') return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const player = state.players[playerId]
  const card = player.deck.find((c) => c.instanceId === deckInstanceId)
  if (!card || !isDestructionRobotCard(card.cardId)) return state

  const remainingAfter = state.interaction.remaining - 1
  let next = addDestructionRobotsFromDeck(state, playerId, [deckInstanceId], {
    enforceHand: false,
  })
  const stillThere = listDestructionRobotsInDeck(next.players[playerId])
  if (remainingAfter > 0 && stillThere.length > 0) {
    next = {
      ...next,
      interaction: { type: 'omega_search', remaining: remainingAfter },
    }
    next = log(next, `เลือกได้อีก ${remainingAfter} ใบ`)
    return next
  }
  return enforceHandLimit(next, playerId)
}

export function skipOmegaSearch(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.interaction.type !== 'omega_search') return state
  if (state.activePlayer !== playerId) return state
  let next: GameState = {
    ...state,
    interaction: { type: 'idle' },
  }
  next = log(
    next,
    `${state.players[playerId].name} จบการเลือกหุ่นยนต์แห่งการทำลายจากเด็ค`,
  )
  return enforceHandLimit(next, playerId)
}

function addAlkataFromDeck(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): GameState {
  let player = { ...state.players[playerId] }
  const deck = [...player.deck]
  const idx = deck.findIndex((c) => c.instanceId === instanceId)
  if (idx < 0) return state
  const card = deck[idx]
  if (!isAlkataGod(card.cardId)) return state
  if (getCard(card.cardId).effectId === 'zul_alkata') return state
  deck.splice(idx, 1)
  player = {
    ...player,
    deck: shuffle(deck),
    hand: [...player.hand, card],
  }
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
  }
  next = log(next, `${player.name} นำ ${getCard(card.cardId).nameTh} จากเด็คขึ้นมือ`)
  next = enforceHandLimit(next, playerId)
  if (next.interaction.type !== 'idle') return next
  return checkWinner(next)
}

function maybeStartZulSearch(
  state: GameState,
  playerId: PlayerId,
  summonedCardId: string,
): GameState {
  if (getCard(summonedCardId).effectId !== 'zul_alkata') return state
  const matches = listZulSearchTargets(state.players[playerId])
  if (matches.length === 0) {
    return log(
      state,
      `${getCard(summonedCardId).nameTh} — ไม่มีเทพแห่งอัลคาทาในเด็ค (ยกเว้นซูล)`,
    )
  }
  if (matches.length === 1) {
    let next = log(
      state,
      `${getCard(summonedCardId).nameTh} อัญเชิญ! นำเทพแห่งอัลคาทาจากเด็คขึ้นมือ`,
    )
    return addAlkataFromDeck(next, playerId, matches[0].instanceId)
  }
  let next: GameState = {
    ...state,
    interaction: { type: 'alkata_deck_search', ownerId: playerId },
  }
  next = log(
    next,
    `${getCard(summonedCardId).nameTh} — เลือกเทพแห่งอัลคาทาจากเด็คขึ้นมือ 1 ใบ (ยกเว้นซูล)`,
  )
  return next
}

export function pickAlkataDeckSearch(
  state: GameState,
  playerId: PlayerId,
  deckInstanceId: string,
): GameState {
  if (state.interaction.type !== 'alkata_deck_search') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.winner) return state
  const card = state.players[playerId].deck.find((c) => c.instanceId === deckInstanceId)
  if (!card || !isAlkataGod(card.cardId)) return state
  if (getCard(card.cardId).effectId === 'zul_alkata') return state
  return addAlkataFromDeck(state, playerId, deckInstanceId)
}

export function skipAlkataDeckSearch(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.interaction.type !== 'alkata_deck_search') return state
  if (state.interaction.ownerId !== playerId) return state
  let next: GameState = {
    ...state,
    interaction: { type: 'idle' },
  }
  next = log(
    next,
    `${state.players[playerId].name} ข้ามการเลือกเทพแห่งอัลคาทาจากเด็ค`,
  )
  next = enforceHandLimit(next, playerId)
  if (next.interaction.type !== 'idle') return next
  return checkWinner(next)
}

function listSummonableAlkataFromDeck(
  state: GameState,
  playerId: PlayerId,
): CardInstance[] {
  return listAlkataInDeck(state.players[playerId]).filter((c) =>
    canFreePlaceMonster(state, playerId, c.cardId),
  )
}

function copyAtkOntoAlkataMina(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  fromInstanceId: string,
): GameState {
  const player = state.players[playerId]
  const from = player.field.find((m) => m?.instanceId === fromInstanceId)
  const source = player.field.find((m) => m?.instanceId === sourceId)
  if (!from || !source) return state
  const copied = getEffectiveAtk(state, playerId, from.cardId, from.instanceId)
  const field = player.field.map((m) =>
    m?.instanceId === sourceId ? { ...m, atkMod: copied } : m,
  )
  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, field },
    },
  }
  next = log(
    next,
    `${getCard(source.cardId).nameTh} ATK = ${copied} (เท่ากับ ${getCard(from.cardId).nameTh})`,
  )
  return next
}

function maybeStartAlkataMina(
  state: GameState,
  playerId: PlayerId,
  summonedCardId: string,
  summonedInstanceId: string,
): GameState {
  if (getCard(summonedCardId).effectId !== 'mina_alkata') return state
  const matches = listSummonableAlkataFromDeck(state, playerId)
  if (matches.length === 0) {
    return log(
      state,
      `${getCard(summonedCardId).nameTh} — ไม่มีเทพแห่งอัลคาทาในเด็คที่อัญเชิญได้`,
    )
  }
  if (matches.length === 1) {
    let next = log(
      state,
      `${getCard(summonedCardId).nameTh} อัญเชิญเทพแห่งอัลคาทาจากเด็ค`,
    )
    return summonAlkataFromDeckForMina(
      next,
      playerId,
      summonedInstanceId,
      matches[0].instanceId,
    )
  }
  let next: GameState = {
    ...state,
    interaction: {
      type: 'alkata_mina_summon',
      ownerId: playerId,
      sourceId: summonedInstanceId,
    },
  }
  next = log(
    next,
    `${getCard(summonedCardId).nameTh} — เลือกเทพแห่งอัลคาทาจากเด็คเพื่ออัญเชิญ 1 ใบ`,
  )
  return next
}

function summonAlkataFromDeckForMina(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  deckInstanceId: string,
): GameState {
  let player = { ...state.players[playerId] }
  const deckIdx = player.deck.findIndex((c) => c.instanceId === deckInstanceId)
  if (deckIdx < 0) return state
  const fetched = player.deck[deckIdx]
  const def = getCard(fetched.cardId)
  if (!isAlkataGod(fetched.cardId)) return state
  if (!canFreePlaceMonster(state, playerId, fetched.cardId)) return state

  const deck = [...player.deck]
  deck.splice(deckIdx, 1)
  player = { ...player, deck: shuffle(deck) }

  const zone = player.field.findIndex((z) => z === null)
  if (zone < 0) return state
  const summoned = resetForSummon(fetched, state.turn)
  const field = [...player.field]
  field[zone] = summoned
  player = { ...player, field }

  const oppId = otherPlayer(playerId)
  const trig = applySummonTriggers(player, state.players[oppId], def.id)
  player = trig.player

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: player,
      [oppId]: trig.opponent,
    },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `${player.name} อัญเชิญ ${def.nameTh} จากเด็คด้วยมิน่า เทพแห่งอัลคาทา โซน ${zone + 1}`,
  )
  if (trig.note) next = log(next, trig.note)
  next = copyAtkOntoAlkataMina(next, playerId, sourceId, summoned.instanceId)
  next = afterSummonEffects(next, playerId, def.id, summoned.instanceId)
  if (next.interaction.type !== 'idle') return next
  return checkWinner(next)
}

export function pickAlkataMinaSummon(
  state: GameState,
  playerId: PlayerId,
  deckInstanceId: string,
): GameState {
  if (state.interaction.type !== 'alkata_mina_summon') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.winner) return state
  return summonAlkataFromDeckForMina(
    state,
    playerId,
    state.interaction.sourceId,
    deckInstanceId,
  )
}

export function skipAlkataMinaSummon(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.interaction.type !== 'alkata_mina_summon') return state
  if (state.interaction.ownerId !== playerId) return state
  let next: GameState = {
    ...state,
    interaction: { type: 'idle' },
  }
  next = log(
    next,
    `${state.players[playerId].name} ข้ามการอัญเชิญเทพแห่งอัลคาทาจากเด็คของมิน่า`,
  )
  return checkWinner(next)
}

/** Sara cost: discard 1 from hand, then open deck warrior recruit */
export function discardForSara(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): GameState {
  if (state.interaction.type !== 'sara_discard') return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const resume = state.interaction.resumeReinforce
  let player = { ...state.players[playerId] }
  const idx = findHandIndex(player, instanceId)
  if (idx < 0) return state

  const card = player.hand[idx]
  const def = getCard(card.cardId)
  const hand = [...player.hand]
  hand.splice(idx, 1)
  player = { ...player, hand }
  const players = depositToOwnerGy(
    { ...state.players, [playerId]: player },
    { ...card, faceDown: false },
    playerId,
  )

  let next: GameState = {
    ...state,
    players,
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(next, `${player.name} ทิ้ง ${def.nameTh} (เอฟเฟคซาร่า)`)
  return openDeckWarriorRecruit(next, playerId, 'sara', resume)
}

export function discardForAlkataCall(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): GameState {
  if (state.interaction.type !== 'alkata_call_discard') return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const spellInstanceId = state.interaction.spellInstanceId
  let player = { ...state.players[playerId] }
  const idx = findHandIndex(player, instanceId)
  if (idx < 0) return state

  const card = player.hand[idx]
  const def = getCard(card.cardId)
  const hand = [...player.hand]
  hand.splice(idx, 1)
  player = { ...player, hand }
  const players = depositToOwnerGy(
    { ...state.players, [playerId]: player },
    { ...card, faceDown: false },
    playerId,
  )

  let next: GameState = {
    ...state,
    players,
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(next, `${player.name} ทิ้ง ${def.nameTh} (${getCard('S0052').nameTh})`)
  return openAlkataCallSummon(next, playerId, spellInstanceId)
}

function openAlkataCallSummon(
  state: GameState,
  playerId: PlayerId,
  spellInstanceId: string,
): GameState {
  const matches = listSummonableAlkataFromDeck(state, playerId)
  if (matches.length === 0) {
    let next = log(state, 'ไม่มีเทพแห่งอัลคาทาในเด็คที่อัญเชิญได้')
    return finishSignalAmpSpell(next, playerId, spellInstanceId)
  }
  if (matches.length === 1) {
    return summonAlkataFromCall(
      state,
      playerId,
      spellInstanceId,
      matches[0].instanceId,
    )
  }
  let next: GameState = {
    ...state,
    interaction: { type: 'alkata_call_summon', spellInstanceId },
  }
  next = log(next, 'เลือกเทพแห่งอัลคาทาจากเด็คเพื่ออัญเชิญ 1 ใบ (ถูกทำลายเมื่อเข้า Battle Phase)')
  return next
}

function summonAlkataFromCall(
  state: GameState,
  playerId: PlayerId,
  spellInstanceId: string,
  deckInstanceId: string,
): GameState {
  let player = { ...state.players[playerId] }
  const deckIdx = player.deck.findIndex((c) => c.instanceId === deckInstanceId)
  if (deckIdx < 0) return finishSignalAmpSpell(state, playerId, spellInstanceId)
  const fetched = player.deck[deckIdx]
  const def = getCard(fetched.cardId)
  if (!isAlkataGod(fetched.cardId)) return state
  if (!canFreePlaceMonster(state, playerId, fetched.cardId)) return state

  const deck = [...player.deck]
  deck.splice(deckIdx, 1)
  player = { ...player, deck: shuffle(deck) }

  const zone = player.field.findIndex((z) => z === null)
  if (zone < 0) return finishSignalAmpSpell(state, playerId, spellInstanceId)

  const summoned: CardInstance = {
    ...resetForSummon(fetched, state.turn),
    destroyAtBattlePhase: true,
  }
  const field = [...player.field]
  field[zone] = summoned
  player = { ...player, field }

  const oppId = otherPlayer(playerId)
  const trig = applySummonTriggers(player, state.players[oppId], def.id)
  player = trig.player

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: player,
      [oppId]: trig.opponent,
    },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `${player.name} อัญเชิญ ${def.nameTh} จากเด็ค (เสียงเรียกของอัลคาทา) โซน ${zone + 1} — ถูกทำลายเมื่อเข้า Battle Phase`,
  )
  if (trig.note) next = log(next, trig.note)
  next = finishSignalAmpSpell(next, playerId, spellInstanceId)
  next = afterSummonEffects(next, playerId, def.id, summoned.instanceId)
  if (next.interaction.type !== 'idle') return next
  return checkWinner(next)
}

export function pickAlkataCallSummon(
  state: GameState,
  playerId: PlayerId,
  deckInstanceId: string,
): GameState {
  if (state.interaction.type !== 'alkata_call_summon') return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state
  return summonAlkataFromCall(
    state,
    playerId,
    state.interaction.spellInstanceId,
    deckInstanceId,
  )
}

export function skipAlkataCallSummon(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.interaction.type !== 'alkata_call_summon') return state
  if (state.activePlayer !== playerId) return state
  return finishSignalAmpSpell(
    log(state, `${state.players[playerId].name} ข้ามการอัญเชิญจากเสียงเรียกของอัลคาทา`),
    playerId,
    state.interaction.spellInstanceId,
  )
}

function isFrontline(cardId: string): boolean {
  return getCard(cardId).effectId === 'frontline_warrior'
}

function isSupportUnit(cardId: string): boolean {
  return getCard(cardId).effectId === 'support_unit'
}

function isWarriorAuraSource(cardId: string): boolean {
  const id = getCard(cardId).effectId
  return id === 'frontline_warrior' || id === 'support_unit'
}

/** Count warrior monsters on both sides of the field */
export function countWarriorsOnField(state: GameState): number {
  let n = 0
  for (const id of ['player', 'opponent'] as PlayerId[]) {
    for (const m of state.players[id].field) {
      if (m && isWarrior(m.cardId)) n++
    }
  }
  return n
}

/** Aura sources on our field buff only our warriors by warriorCount (both sides) */
function warriorAuraBonus(state: GameState, ownerId: PlayerId): number {
  let sources = 0
  for (const m of state.players[ownerId].field) {
    if (m && isWarriorAuraSource(m.cardId)) sources++
  }
  if (sources === 0) return 0
  return sources * countWarriorsOnField(state)
}

/** Scout Unit on a side: that side's monsters get −warriorCount ATK */
function scoutDebuff(state: GameState, ownerId: PlayerId): number {
  const hasScout = state.players[ownerId].field.some(
    (m) => m && getCard(m.cardId).effectId === 'scout_unit',
  )
  if (!hasScout) return 0
  return countWarriorsOnField(state)
}

/** Effective play cost (temp override, Dynogr 「คาถา」 discount) */
export function getEffectiveCost(
  card: CardInstance,
  state?: GameState,
  ownerId?: PlayerId,
): number {
  if (card.tempCostOverride !== undefined) return card.tempCostOverride
  let cost = getCard(card.cardId).cost
  if (state && ownerId && isKataSpellOrTrap(card.cardId)) {
    const discount = countDynogrOnField(state.players[ownerId])
    if (discount > 0) cost = Math.max(0, cost - discount)
  }
  return cost
}

const KATA_NAME = 'คาถา'

export function isKataSpellOrTrap(cardId: string): boolean {
  const def = getCard(cardId)
  if (def.type !== 'spell' && def.type !== 'trap') return false
  return def.nameTh.includes(KATA_NAME) || def.name.includes('Incantation')
}

/** Mage monster or 「คาถา」 spell/trap — Preparation Incantation draw trigger */
function isPrepDrawTrigger(cardId: string): boolean {
  const def = getCard(cardId)
  if (def.type === 'monster' && def.tribe === 'mage') return true
  return isKataSpellOrTrap(cardId)
}

function isShorinCard(cardId: string): boolean {
  return getCard(cardId).effectId === 'shorin_mage'
}

function isAgathaCard(cardId: string): boolean {
  return getCard(cardId).effectId === 'agatha_mage'
}

function isDynogrCard(cardId: string): boolean {
  return getCard(cardId).effectId === 'dynogr_mage'
}

function isSarukaCard(cardId: string): boolean {
  return getCard(cardId).effectId === 'saruka_mage'
}

function isRyukaCard(cardId: string): boolean {
  return getCard(cardId).effectId === 'ryuka_mage'
}

function isZeekaCard(cardId: string): boolean {
  return getCard(cardId).effectId === 'zeeka_mage'
}

function countKataInGy(player: PlayerState): number {
  return player.graveyard.filter((c) => isKataSpellOrTrap(c.cardId)).length
}

/** Zeeka active ATK boost — 2 uses/turn when GY kata ≥ 5, else 1 */
function zeekaAtkUsesPerTurn(player: PlayerState): number {
  return countKataInGy(player) >= 5 ? 2 : 1
}

function countDynogrOnField(player: PlayerState): number {
  return player.field.filter((m) => m && isDynogrCard(m.cardId)).length
}

function hasRyukaEcho(player: PlayerState, cardId: string): boolean {
  const name = getCard(cardId).nameTh
  return !!player.ryukaEchoNames?.includes(name)
}

function queueRyukaDouble(
  player: PlayerState,
  cardId: string,
): PlayerState {
  if (!hasRyukaEcho(player, cardId)) return player
  const effectId = getCard(cardId).effectId
  if (
    effectId !== 'kata_guardian' &&
    effectId !== 'kata_buddy' &&
    effectId !== 'kata_prepare' &&
    effectId !== 'kata_hypnosis' &&
    effectId !== 'kata_blink'
  ) {
    return player
  }
  return {
    ...player,
    ryukaDoubleQueued: true,
    ryukaDoubleEffectId: effectId,
  }
}

function isMage(cardId: string): boolean {
  return getCard(cardId).tribe === 'mage'
}

export function hasBattleShield(mon: CardInstance | null | undefined): boolean {
  return !!mon?.battleShieldUntil
}

function consumeBattleShield(mon: CardInstance): CardInstance {
  return { ...mon, battleShieldUntil: undefined }
}

const AGATHA_DRAW_PER_TURN = 1
const SARUKA_BUFF_PER_TURN = 1
const RYUKA_SLEEP_PER_TURN = 1

/** Trigger mage triggers when a คาถา spell/trap is used */
function afterKataActivated(
  state: GameState,
  playerId: PlayerId,
  activatedCardId: string,
): GameState {
  if (!isKataSpellOrTrap(activatedCardId)) return state
  let player = { ...state.players[playerId] }
  let shorinBuffed = 0
  let agathaDrew = 0
  let noahMages = 0
  let dynogrBuffed = 0
  let sarukaBuffed = 0
  let ryukaSleepMarked = 0
  let zeekaDebuffMarked = 0
  let field = player.field.map((m) => {
    if (!m) return m
    let next = m
    if (isShorinCard(m.cardId)) {
      shorinBuffed += 1
      next = { ...next, atkMod: (next.atkMod ?? 0) + 2 }
    }
    if (isDynogrCard(m.cardId)) {
      dynogrBuffed += 1
      next = { ...next, atkMod: (next.atkMod ?? 0) + 1 }
    }
    if (
      isSarukaCard(m.cardId) &&
      (next.effectUses ?? 0) < SARUKA_BUFF_PER_TURN
    ) {
      sarukaBuffed += 1
      next = {
        ...next,
        effectUses: (next.effectUses ?? 0) + 1,
        oppEotAtkMod: (next.oppEotAtkMod ?? 0) + 8,
      }
    }
    if (
      isRyukaCard(m.cardId) &&
      (next.effectUses ?? 0) < RYUKA_SLEEP_PER_TURN
    ) {
      ryukaSleepMarked += 1
      next = { ...next, effectUses: (next.effectUses ?? 0) + 1 }
    }
    if (isZeekaCard(m.cardId) && !next.effectUsed) {
      zeekaDebuffMarked += 1
      next = { ...next, effectUsed: true }
    }
    if (
      isAgathaCard(m.cardId) &&
      (next.effectUses ?? 0) < AGATHA_DRAW_PER_TURN
    ) {
      agathaDrew += 1
      next = { ...next, effectUses: (next.effectUses ?? 0) + 1 }
    }
    return next
  })

  // Noah passive: all mages on our field +1 ATK (if any Noah is on field)
  const hasNoah = field.some((m) => m && getCard(m.cardId).effectId === 'noah_mage')
  if (hasNoah) {
    field = field.map((m) => {
      if (!m || !isMage(m.cardId)) return m
      noahMages += 1
      return { ...m, atkMod: (m.atkMod ?? 0) + 1 }
    })
  }

  const opp = state.players[otherPlayer(playerId)]
  const canSleep =
    ryukaSleepMarked > 0 && opp.field.some((m) => m !== null)
  const canZeekaDebuff =
    zeekaDebuffMarked > 0 && opp.field.some((m) => m !== null)

  let next: GameState = state
  const fieldChanged =
    shorinBuffed > 0 ||
    dynogrBuffed > 0 ||
    agathaDrew > 0 ||
    noahMages > 0 ||
    sarukaBuffed > 0 ||
    ryukaSleepMarked > 0 ||
    zeekaDebuffMarked > 0
  if (fieldChanged || canSleep || canZeekaDebuff) {
    player = {
      ...player,
      field: fieldChanged ? field : player.field,
      ryukaSleepPending: canSleep ? true : player.ryukaSleepPending,
      zeekaDebuffPending: canZeekaDebuff ? true : player.zeekaDebuffPending,
    }
    next = {
      ...state,
      players: { ...state.players, [playerId]: player },
    }
  }

  if (shorinBuffed > 0) {
    next = log(
      next,
      `จอมเวทย์ โชริน — ATK +2 จาก「${getCard(activatedCardId).nameTh}」(×${shorinBuffed})`,
    )
  }

  if (noahMages > 0) {
    next = log(
      next,
      `จอมเวทย์ โนอา — จอมเวทย์ทั้งหมด ATK +1 จาก「${getCard(activatedCardId).nameTh}」(×${noahMages})`,
    )
  }

  if (dynogrBuffed > 0) {
    next = log(
      next,
      `จอมเวทย์ ไดโนกร — ATK +1 จาก「${getCard(activatedCardId).nameTh}」(×${dynogrBuffed})`,
    )
  }

  if (sarukaBuffed > 0) {
    next = log(
      next,
      `จอมเวทย์ ซารุกะ — ATK +8 จนจบเทิร์นฝ่ายตรงข้าม จาก「${getCard(activatedCardId).nameTh}」(×${sarukaBuffed})`,
    )
  }

  if (canSleep) {
    next = log(
      next,
      `จอมเวทย์ ริวกะ — หลังคาถาจบผล จะเลือกมอนสเตอร์ฝ่ายตรงข้ามให้นอน`,
    )
  }

  if (canZeekaDebuff) {
    const kataN = countKataInGy(next.players[playerId])
    next = log(
      next,
      `จอมเวทย์ ซีก้า — หลังคาถาจบผล จะลด ATK มอนสเตอร์ฝ่ายตรงข้าม −${kataN}`,
    )
  }

  if (agathaDrew > 0) {
    let p = { ...next.players[playerId] }
    const before = p.hand.length
    p = drawCards(p, agathaDrew)
    const drawn = p.hand.length - before
    next = {
      ...next,
      players: { ...next.players, [playerId]: p },
    }
    if (drawn > 0) {
      next = log(
        next,
        `จอมเวทย์ อากาธา — จั่ว ${drawn} ใบจาก「${getCard(activatedCardId).nameTh}」`,
      )
      next = enforceHandLimit(next, playerId)
    }
  }

  return next
}

/** After a 「คาถา」 fully resolves to idle — echo double then sleep pick */
export function settleAfterKataResolution(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.winner) return state
  if (state.interaction.type !== 'idle') return state

  let next = maybeStartRyukaDouble(state, playerId)
  if (next.interaction.type !== 'idle') return next
  next = maybeStartRyukaSleep(next, playerId)
  if (next.interaction.type !== 'idle') return next
  next = maybeStartZeekaDebuff(next, playerId)
  return next
}

function maybeStartRyukaDouble(
  state: GameState,
  playerId: PlayerId,
): GameState {
  const player = state.players[playerId]
  if (!player.ryukaDoubleQueued || !player.ryukaDoubleEffectId) return state

  const effectId = player.ryukaDoubleEffectId
  const cleared: PlayerState = {
    ...player,
    ryukaDoubleQueued: undefined,
    ryukaDoubleEffectId: undefined,
  }
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: cleared },
  }

  if (effectId === 'kata_guardian') {
    if (!cleared.field.some((m) => m && isMage(m.cardId))) {
      next = log(next, `ริวกะ — ทำซ้ำคาถาผู้ป้องกันไม่ได้ (ไม่มีจอมเวทย์)`)
      return next
    }
    next = {
      ...next,
      interaction: {
        type: 'guardian_pick',
        spellInstanceId: null,
        ownerId: playerId,
      },
    }
    next = log(next, `ริวกะ — ทำผล「คาถาผู้ป้องกัน」รอบที่ 2`)
    return next
  }

  if (effectId === 'kata_buddy') {
    const mages = cleared.field.filter((m) => m && isMage(m.cardId))
    if (mages.length < 2) {
      next = log(next, `ริวกะ — ทำซ้ำคาถาคู่หูไม่ได้ (จอมเวทย์ไม่ครบ)`)
      return next
    }
    next = {
      ...next,
      interaction: {
        type: 'buddy_pick',
        spellInstanceId: null,
        ownerId: playerId,
      },
    }
    next = log(next, `ริวกะ — ทำผล「คาถาคู่หู」รอบที่ 2`)
    return next
  }

  if (effectId === 'kata_prepare') {
    next = log(next, `ริวกะ — เวทย์ต่อเนื่องไม่ทำซ้ำเพิ่ม`)
    return next
  }

  if (effectId === 'kata_hypnosis') {
    const opp = next.players[otherPlayer(playerId)]
    const monsters = opp.field.filter((m) => m !== null)
    if (monsters.length < 2) {
      next = log(next, `ริวกะ — ทำซ้ำคาถาสะกดจิตไม่ได้ (มอนสเตอร์ฝ่ายตรงข้ามไม่ครบ)`)
      return next
    }
    next = {
      ...next,
      interaction: {
        type: 'hypnosis_pick',
        spellInstanceId: null,
        ownerId: playerId,
      },
    }
    next = log(next, `ริวกะ — ทำผล「คาถาสะกดจิต」รอบที่ 2`)
    return next
  }

  if (effectId === 'kata_blink') {
    const p = next.players[playerId]
    const hasMage =
      p.deck.some((c) => isMage(c.cardId) && canFreePlaceMonster(next, playerId, c.cardId)) ||
      p.graveyard.some((c) => isMage(c.cardId) && canFreePlaceMonster(next, playerId, c.cardId))
    if (!hasMage || !p.field.some((z) => z === null)) {
      next = log(next, `ริวกะ — ทำซ้ำคาถาย้ายฉับพลันไม่ได้`)
      return next
    }
    next = {
      ...next,
      interaction: {
        type: 'teleport_pick',
        spellInstanceId: null,
        ownerId: playerId,
      },
    }
    next = log(next, `ริวกะ — ทำผล「คาถาย้ายฉับพลัน」รอบที่ 2`)
    return next
  }

  return next
}

function maybeStartRyukaSleep(
  state: GameState,
  playerId: PlayerId,
): GameState {
  const player = state.players[playerId]
  if (!player.ryukaSleepPending) return state
  // Defer while not our turn / mid-battle / trap window
  if (state.activePlayer !== playerId) return state
  if (state.phase === 'battle' || state.awaitingTrap) return state

  const opp = state.players[otherPlayer(playerId)]
  if (!opp.field.some((m) => m !== null)) {
    return {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...player, ryukaSleepPending: undefined },
      },
    }
  }

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, ryukaSleepPending: undefined },
    },
    interaction: { type: 'ryuka_sleep', ownerId: playerId },
  }
  next = log(next, `ริวกะ — เลือกมอนสเตอร์ฝ่ายตรงข้ามให้นอนจนจบเทิร์นของอีกฝ่าย`)
  return next
}

function maybeStartZeekaDebuff(
  state: GameState,
  playerId: PlayerId,
): GameState {
  const player = state.players[playerId]
  if (!player.zeekaDebuffPending) return state
  if (state.activePlayer !== playerId) return state
  if (state.phase === 'battle' || state.awaitingTrap) return state

  const opp = state.players[otherPlayer(playerId)]
  if (!opp.field.some((m) => m !== null)) {
    return {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...player, zeekaDebuffPending: undefined },
      },
    }
  }

  const kataN = countKataInGy(player)
  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, zeekaDebuffPending: undefined },
    },
    interaction: { type: 'zeeka_debuff', ownerId: playerId },
  }
  next = log(
    next,
    `ซีก้า — เลือกมอนสเตอร์ฝ่ายตรงข้าม ATK −${Math.max(1, kataN)} (×จำนวน「คาถา」ในสุสาน)`,
  )
  return next
}

/** Effective ATK including continuous field effects and instance modifiers */
export function getEffectiveAtk(
  state: GameState,
  ownerId: PlayerId,
  cardId: string,
  instanceId?: string,
): number {
  return getAtkBreakdown(state, ownerId, cardId, instanceId).effective
}

/** Base ATK + modifier parts for UI (info panel shows base; field shows effective) */
export function getAtkBreakdown(
  state: GameState,
  ownerId: PlayerId,
  cardId: string,
  instanceId?: string,
): {
  base: number
  effective: number
  parts: { label: string; value: number }[]
} {
  const def = getCard(cardId)
  const base = def.atk ?? 0
  const parts: { label: string; value: number }[] = []

  const owner = state.players[ownerId]
  const mon = instanceId
    ? owner.field.find((m) => m?.instanceId === instanceId)
    : owner.field.find((m) => m?.cardId === cardId)

  if (!mon) {
    // Preview HP-diff ATK even in hand / info panel
    if (usesHpDiffAtk(def.effectId)) {
      const opp = state.players[otherPlayer(ownerId)]
      const hpBonus = Math.floor(Math.abs(owner.hp - opp.hp) / 2)
      if (hpBonus !== 0) {
        parts.push({ label: 'ผลต่าง HP ÷ 2', value: hpBonus })
      }
      return {
        base,
        effective: Math.max(0, base + hpBonus),
        parts,
      }
    }
    return { base, effective: base, parts }
  }

  const mod = mon.atkMod ?? 0
  if (mod !== 0) {
    parts.push({
      label: mod > 0 ? 'บัฟถาวร' : 'ดีบัฟถาวร',
      value: mod,
    })
  }

  const zeekaBonus = mon.zeekaAtkBonus ?? 0
  if (zeekaBonus !== 0) {
    parts.push({
      label: 'ซีก้า (ถาวร)',
      value: zeekaBonus,
    })
  }

  const temp = mon.tempAtkMod ?? 0
  if (temp !== 0) {
    parts.push({
      label: temp > 0 ? 'บัฟชั่วคราว' : 'ดีบัฟชั่วคราว',
      value: temp,
    })
  }

  const oppEot = mon.oppEotAtkMod ?? 0
  if (oppEot !== 0) {
    parts.push({
      label: 'ซารุกะ (จนจบเทิร์นฝ่ายตรงข้าม)',
      value: oppEot,
    })
  }

  if (def.tribe === 'warrior') {
    const aura = warriorAuraBonus(state, ownerId)
    if (aura !== 0) parts.push({ label: 'ออร่านักรบ', value: aura })
  }

  const scout = scoutDebuff(state, ownerId)
  if (scout !== 0) parts.push({ label: 'หน่วยสอดแนม', value: -scout })

  if (usesHpDiffAtk(def.effectId)) {
    const opp = state.players[otherPlayer(ownerId)]
    const hpBonus = Math.floor(Math.abs(owner.hp - opp.hp) / 2)
    if (hpBonus !== 0) {
      parts.push({ label: 'ผลต่าง HP ÷ 2', value: hpBonus })
    }
  }

  const delta = parts.reduce((s, p) => s + p.value, 0)
  return {
    base,
    effective: Math.max(0, base + delta),
    parts,
  }
}

/** Opponent cannot attack Frontline Warrior while another warrior is on that field */
export function isProtectedFrontline(
  state: GameState,
  defenderId: PlayerId,
  targetInstanceId: string,
): boolean {
  const defender = state.players[defenderId]
  const idx = findFieldIndex(defender, targetInstanceId)
  if (idx < 0) return false
  const target = defender.field[idx]!
  if (!isFrontline(target.cardId)) return false
  return defender.field.some(
    (m) =>
      !!m &&
      m.instanceId !== targetInstanceId &&
      isWarrior(m.cardId),
  )
}

/** Support Unit forces attacks onto itself while another warrior is present */
export function hasSupportTaunt(state: GameState, defenderId: PlayerId): string | null {
  const defender = state.players[defenderId]
  const support = defender.field.find((m) => m && isSupportUnit(m.cardId))
  if (!support) return null
  const hasOtherWarrior = defender.field.some(
    (m) =>
      !!m &&
      m.instanceId !== support.instanceId &&
      isWarrior(m.cardId),
  )
  return hasOtherWarrior ? support.instanceId : null
}

export function canTargetMonster(
  state: GameState,
  attackerId: PlayerId,
  targetInstanceId: string,
): boolean {
  const defenderId = otherPlayer(attackerId)
  if (findFieldIndex(state.players[defenderId], targetInstanceId) < 0) return false
  if (isProtectedFrontline(state, defenderId, targetInstanceId)) return false
  const tauntId = hasSupportTaunt(state, defenderId)
  if (tauntId && targetInstanceId !== tauntId) return false
  return true
}

export function canSummon(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.activePlayer !== playerId) return false
  if (state.phase !== 'main1' && state.phase !== 'main2') return false
  if (state.interaction.type === 'discard') return false
  if (state.interaction.type === 'soul_drain') return false
  if (state.interaction.type === 'alkata_plot') return false
  if (state.interaction.type === 'special_mod') return false
  if (state.interaction.type === 'interference_pick') return false
  if (state.interaction.type === 'signal_amp_pick') return false
  if (state.interaction.type === 'emergency_pick') return false
  if (state.interaction.type === 'emergency_summon') return false
  if (state.interaction.type === 'mina_recruit') return false
  if (state.interaction.type === 'sara_discard') return false
  if (state.interaction.type === 'alkata_call_discard') return false
  if (state.interaction.type === 'alkata_call_summon') return false
  if (state.interaction.type === 'sola_pay') return false
  if (state.interaction.type === 'beta_extra_destroy') return false
  if (state.interaction.type === 'sora_destroy') return false
  if (state.interaction.type === 'omega_search') return false
  if (state.interaction.type === 'alkata_deck_search') return false
  if (state.interaction.type === 'alkata_mina_summon') return false
  if (state.interaction.type === 'soluy_swap') return false
  if (state.interaction.type === 'shorin_search') return false
  if (state.interaction.type === 'saruka_search') return false
  if (state.interaction.type === 'ryuka_fetch') return false
  if (state.interaction.type === 'ryuka_sleep') return false
  if (state.interaction.type === 'zeeka_debuff') return false
  if (state.interaction.type === 'agatha_search') return false
  if (state.interaction.type === 'noah_mill') return false
  if (state.interaction.type === 'guardian_pick') return false
  if (state.interaction.type === 'buddy_pick') return false
  if (state.interaction.type === 'hypnosis_pick') return false
  if (state.interaction.type === 'teleport_pick') return false
  if (state.interaction.type === 'alkata_gy_recover') return false
  if (state.interaction.type === 'alkata_hand_summon') return false
  if (state.interaction.type === 'alkata_debuff') return false
  if (state.interaction.type === 'alkata_hokana_recycle') return false
  const player = state.players[playerId]
  const idx = findHandIndex(player, instanceId)
  if (idx < 0) return false
  const handCard = player.hand[idx]
  const def = getCard(handCard.cardId)
  if (def.type !== 'monster') return false

  // During reinforce window, use HP summons instead
  if (state.interaction.type === 'reinforce') return false

  const cost = getEffectiveCost(handCard)

  // Destruction robots: pay 6 HP (card cost) — energy cannot be used
  if (isEnergyOrHpSummon(def.effectId)) {
    if (player.hp < cost) return false
  } else if (player.energy < cost) {
    return false
  }

  // Scout: summon onto our field first, then switch — both sides need a free zone
  if (def.effectId === 'scout_unit') {
    if (!player.field.some((z) => z === null)) return false
    const opp = state.players[otherPlayer(playerId)]
    if (!opp.field.some((z) => z === null)) return false
  } else if (!player.field.some((z) => z === null)) {
    return false
  }

  // Unique: only one copy of Frontline / Support on our field
  if (def.effectId === 'frontline_warrior' || def.effectId === 'support_unit') {
    if (player.field.some((m) => m && getCard(m.cardId).effectId === def.effectId)) {
      return false
    }
  }
  return true
}

/** Destruction robots — summon cost paid with HP only (not energy) */
export function isEnergyOrHpSummon(effectId?: string): boolean {
  return (
    effectId === 'sola_destroyer' ||
    effectId === 'sigma_destroyer' ||
    effectId === 'gamma_destroyer' ||
    effectId === 'beta_destroyer' ||
    effectId === 'omega_destroyer'
  )
}

function usesHpDiffAtk(effectId?: string): boolean {
  return isEnergyOrHpSummon(effectId)
}

/** Whether an energy-or-HP summon can be paid with the given resource */
export function canPaySola(
  state: GameState,
  playerId: PlayerId,
  pay: 'energy' | 'hp',
  cost?: number,
): boolean {
  const player = state.players[playerId]
  const c = cost ?? 6
  // Destruction robots no longer accept energy payment
  if (pay === 'energy') return false
  return player.hp >= c
}

export function needsSolaPayChoice(
  _state: GameState,
  _playerId: PlayerId,
  _instanceId: string,
): boolean {
  // Always HP — no energy/HP picker
  return false
}

export function summonMonster(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  zoneIndex?: number,
  _payWith?: 'energy' | 'hp',
): GameState {
  if (!canSummon(state, playerId, instanceId)) return state

  let player = { ...state.players[playerId] }
  const handIdx = findHandIndex(player, instanceId)
  const card = player.hand[handIdx]
  const def = getCard(card.cardId)
  const cost = getEffectiveCost(card)

  let pay: 'energy' | 'hp' | null = null
  let payNote = ''
  if (isEnergyOrHpSummon(def.effectId)) {
    if (player.hp < cost) return state
    pay = 'hp'
    payNote = `จ่าย HP ${cost}`
  } else if (player.energy < cost) {
    return state
  }

  const hand = [...player.hand]
  hand.splice(handIdx, 1)

  const summoned: CardInstance = resetForSummon(card, state.turn)

  // Scout Unit: land on our field, then switch control to opponent
  if (def.effectId === 'scout_unit') {
    let zone = zoneIndex
    if (zone === undefined || player.field[zone] !== null) {
      zone = player.field.findIndex((z) => z === null)
    }
    if (zone < 0) return state

    const oppId = otherPlayer(playerId)
    let opponent = { ...state.players[oppId] }
    const oppZone = opponent.field.findIndex((z) => z === null)
    if (oppZone < 0) return state

    // Summon onto our zone, then immediately move to opponent
    const ourField = [...player.field]
    ourField[zone] = summoned
    player = spendEnergy(
      { ...player, hand, field: ourField },
      cost,
    )

    const oppField = [...opponent.field]
    oppField[oppZone] = { ...summoned }
    ourField[zone] = null
    player = { ...player, field: ourField }
    opponent = { ...opponent, field: oppField }

    let next: GameState = {
      ...state,
      players: { ...state.players, [playerId]: player, [oppId]: opponent },
      interaction: { type: 'idle' },
      selectedCardId: def.id,
    }
    next = log(
      next,
      `${player.name} อัญเชิญ ${def.nameTh} โซน ${zone + 1} — เปลี่ยนการควบคุมไปยัง ${opponent.name} (โซน ${oppZone + 1})`,
    )
    return next
  }

  let zone = zoneIndex
  if (zone === undefined || player.field[zone] !== null) {
    zone = player.field.findIndex((z) => z === null)
  }
  if (zone < 0) return state

  const field = [...player.field]
  field[zone] = summoned

  let updated: PlayerState = {
    ...player,
    hand,
    field,
  }
  if (pay === 'hp') {
    updated = { ...updated, hp: updated.hp - cost }
  } else {
    updated = spendEnergy(updated, cost)
  }

  const oppId = otherPlayer(playerId)
  const trig = applySummonTriggers(
    updated,
    state.players[oppId],
    def.id,
  )
  updated = trig.player

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: updated,
      [oppId]: trig.opponent,
    },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `${updated.name} ลง ${def.nameTh} (ATK ${getEffectiveAtk(next, playerId, def.id, summoned.instanceId)}) โซน ${zone + 1}${payNote ? ` · ${payNote}` : ''}`,
  )
  if (trig.note) next = log(next, trig.note)
  next = afterSummonEffects(next, playerId, def.id, summoned.instanceId)
  return checkWinner(next)
}

export function canPlaySpell(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.activePlayer !== playerId) return false
  if (state.phase !== 'main1' && state.phase !== 'main2') return false
  if (state.interaction.type === 'discard') return false
  if (state.interaction.type === 'reinforce') return false
  if (state.interaction.type === 'soul_drain') return false
  if (state.interaction.type === 'alkata_plot') return false
  if (state.interaction.type === 'special_mod') return false
  if (state.interaction.type === 'interference_pick') return false
  if (state.interaction.type === 'signal_amp_pick') return false
  if (state.interaction.type === 'emergency_pick') return false
  if (state.interaction.type === 'emergency_summon') return false
  if (state.interaction.type === 'mina_recruit') return false
  if (state.interaction.type === 'sara_discard') return false
  if (state.interaction.type === 'alkata_call_discard') return false
  if (state.interaction.type === 'alkata_call_summon') return false
  if (state.interaction.type === 'sola_pay') return false
  if (state.interaction.type === 'beta_extra_destroy') return false
  if (state.interaction.type === 'sora_destroy') return false
  if (state.interaction.type === 'omega_search') return false
  if (state.interaction.type === 'alkata_deck_search') return false
  if (state.interaction.type === 'alkata_mina_summon') return false
  if (state.interaction.type === 'soluy_swap') return false
  if (state.interaction.type === 'shorin_search') return false
  if (state.interaction.type === 'saruka_search') return false
  if (state.interaction.type === 'ryuka_fetch') return false
  if (state.interaction.type === 'ryuka_sleep') return false
  if (state.interaction.type === 'zeeka_debuff') return false
  if (state.interaction.type === 'agatha_search') return false
  if (state.interaction.type === 'noah_mill') return false
  if (state.interaction.type === 'guardian_pick') return false
  if (state.interaction.type === 'buddy_pick') return false
  if (state.interaction.type === 'hypnosis_pick') return false
  if (state.interaction.type === 'teleport_pick') return false
  if (state.interaction.type === 'alkata_gy_recover') return false
  if (state.interaction.type === 'alkata_hand_summon') return false
  if (state.interaction.type === 'alkata_debuff') return false
  if (state.interaction.type === 'alkata_hokana_recycle') return false
  const player = state.players[playerId]
  const idx = findHandIndex(player, instanceId)
  if (idx < 0) return false
  const handCard = player.hand[idx]
  const def = getCard(handCard.cardId)
  if (def.type !== 'spell') return false
  if (player.energy < getEffectiveCost(handCard, state, playerId)) return false

  if (def.effectId === 'call_reinforcements') {
    if (!player.field.some((z) => z === null)) return false
    const hasWarrior = player.hand.some((c, i) => {
      if (i === idx) return false
      const d = getCard(c.cardId)
      return d.type === 'monster' && d.tribe === 'warrior'
    })
    if (!hasWarrior) return false
  }

  if (def.effectId === 'soul_drain') {
    const monsters = player.field.filter((m) => m !== null)
    if (monsters.length < 2) return false
  }

  if (def.effectId === 'special_mod') {
    if (player.hp < 5) return false
    if (!player.field.some((m) => m && isDestructionRobotCard(m.cardId))) {
      return false
    }
  }

  if (def.effectId === 'interference_signal') {
    if (!player.deck.some((c) => isDestructionRobotCard(c.cardId))) {
      return false
    }
  }

  if (def.effectId === 'signal_amplifier') {
    if (player.hp < 20) return false
  }

  if (def.effectId === 'emergency_reinforce') {
    if (!player.deck.some((c) => getCard(c.cardId).type === 'monster')) {
      return false
    }
  }

  if (def.effectId === 'alkata_call') {
    if (player.hand.length < 2) return false
    if (!player.field.some((z) => z === null)) return false
    const hasAlkata = player.deck.some((c) =>
      canFreePlaceMonster(state, playerId, c.cardId) && isAlkataGod(c.cardId),
    )
    if (!hasAlkata) return false
  }

  if (def.effectId === 'alkata_plot') {
    if (!player.field.some((m) => m && isAlkataGod(m.cardId))) return false
  }

  if (def.effectId === 'kata_guardian') {
    if (!player.field.some((m) => m && isMage(m.cardId))) return false
  }

  if (def.effectId === 'kata_buddy') {
    const mages = player.field.filter((m) => m && isMage(m.cardId))
    if (mages.length < 2) return false
  }

  if (def.effectId === 'kata_hypnosis') {
    const opp = state.players[otherPlayer(playerId)]
    if (opp.field.filter((m) => m !== null).length < 2) return false
  }

  if (def.effectId === 'kata_blink') {
    if (!player.field.some((z) => z === null)) return false
    const hasMage =
      player.deck.some(
        (c) => isMage(c.cardId) && canFreePlaceMonster(state, playerId, c.cardId),
      ) ||
      player.graveyard.some(
        (c) => isMage(c.cardId) && canFreePlaceMonster(state, playerId, c.cardId),
      )
    if (!hasMage) return false
  }

  return canAddSpellTrap(player)
}

/**
 * Offer Intercept to the opponent if possible; otherwise stage the spell.
 * Use skipIntercept after the opponent declines the counter window.
 */
export function offerOrStageSpell(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  opts?: { skipIntercept?: boolean },
): GameState {
  if (!canPlaySpell(state, playerId, instanceId)) return state
  if (!opts?.skipIntercept) {
    const defenderId = otherPlayer(playerId)
    if (canOfferIntercept(state, defenderId)) {
      return openActivationCounter(state, playerId, instanceId, 'spell')
    }
  }
  return stageSpell(state, playerId, instanceId)
}

/** Put spell face-up on the ST strip (effect resolves later) */
export function stageSpell(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): GameState {
  if (!canPlaySpell(state, playerId, instanceId)) return state

  const player = { ...state.players[playerId] }
  const handIdx = findHandIndex(player, instanceId)
  const card = player.hand[handIdx]
  const def = getCard(card.cardId)
  const cost = getEffectiveCost(card, state, playerId)

  const hand = [...player.hand]
  hand.splice(handIdx, 1)

  const spellTrap = [...player.spellTrap, { ...card, faceDown: false, tempCostOverride: undefined }]

  let updated: PlayerState = spendEnergy(
    { ...player, hand, spellTrap },
    cost,
  )

  let payNote = ''
  if (def.effectId === 'special_mod') {
    updated = { ...updated, hp: Math.max(0, updated.hp - 5) }
    payNote = ' · จ่าย HP 5'
  } else if (def.effectId === 'signal_amplifier') {
    updated = { ...updated, hp: Math.max(0, updated.hp - 20) }
    payNote = ' · จ่าย HP 20'
  }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: updated },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(next, `${updated.name} ร่าย ${def.nameTh}!${payNote}`)
  next = afterKataActivated(next, playerId, def.id)

  if (def.effectId === 'soul_drain') {
    next = {
      ...next,
      interaction: {
        type: 'soul_drain',
        spellInstanceId: card.instanceId,
      },
    }
    next = log(next, `เลือกมอนสเตอร์บนสนามที่จะส่งลงสุสาน`)
  } else if (def.effectId === 'special_mod') {
    next = {
      ...next,
      interaction: {
        type: 'special_mod',
        spellInstanceId: card.instanceId,
      },
    }
    next = log(
      next,
      `เลือกหุ่นยนต์แห่งการทำลายบนสนามเพื่อเพิ่ม ATK ตามผลต่าง HP`,
    )
    next = checkWinner(next)
  } else if (def.effectId === 'interference_signal') {
    next = {
      ...next,
      interaction: {
        type: 'interference_pick',
        spellInstanceId: card.instanceId,
      },
    }
    next = log(
      next,
      `เลือก "${DESTRUCTION_ROBOT_NAME}" จากเด็คขึ้นมือ 1 ใบ`,
    )
  } else if (def.effectId === 'signal_amplifier') {
    const oppId = otherPlayer(playerId)
    let opponent = { ...next.players[oppId] }
    opponent = { ...opponent, hp: opponent.hp + 20 }
    next = {
      ...next,
      players: { ...next.players, [oppId]: opponent },
    }
    next = log(
      next,
      `${opponent.name} HP +20 (เครื่องขยายสัญญาณ)`,
    )
    next = checkWinner(next)
    if (next.winner) {
      return finishSignalAmpSpell(next, playerId, card.instanceId)
    }

    const me = next.players[playerId]
    const gyRobots = me.graveyard.filter((c) => isDestructionRobotCard(c.cardId))
    const freeZones = me.field.filter((z) => z === null).length
    const canSummon = Math.min(2, gyRobots.length, freeZones)
    if (canSummon > 0) {
      next = {
        ...next,
        interaction: {
          type: 'signal_amp_pick',
          spellInstanceId: card.instanceId,
          remaining: canSummon,
        },
      }
      next = log(
        next,
        `เลือก "${DESTRUCTION_ROBOT_NAME}" จากสุสานอัญเชิญได้ ${canSummon} ตัว (ถูกทำลายตอนจบเทิร์น)`,
      )
    } else {
      next = finishSignalAmpSpell(next, playerId, card.instanceId)
    }
  } else if (def.effectId === 'emergency_reinforce') {
    next = {
      ...next,
      interaction: {
        type: 'emergency_pick',
        spellInstanceId: card.instanceId,
      },
    }
    next = log(next, `เลือกมอนสเตอร์จากเด็คเพื่อนำขึ้นมือ`)
  } else if (def.effectId === 'alkata_call') {
    next = {
      ...next,
      interaction: {
        type: 'alkata_call_discard',
        spellInstanceId: card.instanceId,
      },
    }
    next = log(next, `${def.nameTh} — ทิ้งการ์ดจากมือ 1 ใบ`)
  } else if (def.effectId === 'alkata_plot') {
    next = {
      ...next,
      interaction: {
        type: 'alkata_plot',
        spellInstanceId: card.instanceId,
      },
    }
    next = log(next, `${def.nameTh} — เลือกเทพแห่งอัลคาทาบนสนามเราเพื่อทำลาย`)
  } else if (def.effectId === 'kata_guardian') {
    let p = next.players[playerId]
    p = queueRyukaDouble(p, def.id)
    next = {
      ...next,
      players: { ...next.players, [playerId]: p },
      interaction: {
        type: 'guardian_pick',
        spellInstanceId: card.instanceId,
        ownerId: playerId,
      },
    }
    next = log(
      next,
      `${def.nameTh} — เลือกจอมเวทย์บนสนามเราเพื่อล็อกจนจบเทิร์นอีกฝ่าย`,
    )
  } else if (def.effectId === 'kata_buddy') {
    let p = next.players[playerId]
    p = queueRyukaDouble(p, def.id)
    next = {
      ...next,
      players: { ...next.players, [playerId]: p },
      interaction: {
        type: 'buddy_pick',
        spellInstanceId: card.instanceId,
        ownerId: playerId,
      },
    }
    next = log(
      next,
      `${def.nameTh} — เลือกจอมเวทย์บนสนามเรา 2 ตัวเพื่อรวมพลังโจมตี`,
    )
  } else if (def.effectId === 'kata_hypnosis') {
    let p = next.players[playerId]
    p = queueRyukaDouble(p, def.id)
    next = {
      ...next,
      players: { ...next.players, [playerId]: p },
      interaction: {
        type: 'hypnosis_pick',
        spellInstanceId: card.instanceId,
        ownerId: playerId,
      },
    }
    next = log(
      next,
      `${def.nameTh} — เลือกมอนสเตอร์ฝ่ายตรงข้าม 2 ตัวให้ต่อสู้กัน`,
    )
  } else if (def.effectId === 'kata_blink') {
    let p = next.players[playerId]
    p = queueRyukaDouble(p, def.id)
    next = {
      ...next,
      players: { ...next.players, [playerId]: p },
      interaction: {
        type: 'teleport_pick',
        spellInstanceId: card.instanceId,
        ownerId: playerId,
      },
    }
    next = log(
      next,
      `${def.nameTh} — เลือกมอนสเตอร์จอมเวทย์จากเด็คหรือสุสานเพื่ออัญเชิญ`,
    )
  }
  return next
}

/** Resolve a staged spell on the ST strip → GY */
export function resolveSpell(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): GameState {
  let player = { ...state.players[playerId] }
  const stIdx = findSpellTrapIndex(player, instanceId)
  if (stIdx < 0) return state

  const card = player.spellTrap[stIdx]
  const def = getCard(card.cardId)
  if (def.type !== 'spell') return state

  // Continuous: stay on ST with turn counter
  if (def.effectId === 'kata_prepare') {
    const echo = hasRyukaEcho(player, def.id)
    const turns = echo ? 6 : 3
    const spellTrap = [...player.spellTrap]
    spellTrap[stIdx] = {
      ...card,
      faceDown: false,
      continuousTurnsLeft: turns,
    }
    player = { ...player, spellTrap }
    let next: GameState = {
      ...state,
      players: { ...state.players, [playerId]: player },
      selectedCardId: def.id,
      interaction: { type: 'idle' },
    }
    next = log(
      next,
      `${player.name} วาง ${def.nameTh} เป็นเวทย์ต่อเนื่อง (เหลือ ${turns} เทิร์นของเรา)${
        echo ? ' · ริวกะทำซ้ำ' : ''
      }`,
    )
    return settleAfterKataResolution(next, playerId)
  }

  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)

  player = {
    ...player,
    spellTrap,
    graveyard: [...player.graveyard, { ...card, faceDown: false }],
  }

  const echo = hasRyukaEcho(player, def.id)
  const times = echo ? 2 : 1
  let drawn = 0
  if (def.effectId === 'energy_charge') {
    player = { ...player, energy: player.energy + 3 * times }
  } else if (def.effectId === 'heavenly_voice') {
    const before = player.hand.length
    player = drawCards(player, 2 * times)
    drawn = player.hand.length - before
  }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    selectedCardId: def.id,
    interaction: { type: 'idle' },
  }
  if (def.effectId === 'energy_charge') {
    next = log(
      next,
      `${player.name} ได้รับพลังงาน +${3 * times} (รวม ${player.energy})${
        echo ? ' · ริวกะทำซ้ำ' : ''
      }`,
    )
  } else if (def.effectId === 'heavenly_voice') {
    next = log(
      next,
      `${player.name} ใช้ ${def.nameTh} — จั่ว ${drawn} ใบ (มือ ${player.hand.length})${
        echo ? ' · ริวกะทำซ้ำ' : ''
      }`,
    )
    next = enforceHandLimit(next, playerId)
  } else if (def.effectId === 'call_reinforcements') {
    next = log(
      next,
      `${player.name} ใช้ ${def.nameTh} — อัญเชิญนักรบจากมือได้สูงสุด 3 ใบ (จ่ายด้วย HP)`,
    )
    next = {
      ...next,
      interaction: { type: 'reinforce', summonsLeft: 3 },
    }
  } else if (def.effectId === 'soul_drain') {
    // Resolved via pickSoulDrainTarget — should not reach here
    next = log(next, `${def.nameTh} เข้าสุสาน`)
  } else if (def.effectId === 'special_mod') {
    // Resolved via pickSpecialMod — should not reach here
    next = log(next, `${def.nameTh} เข้าสุสาน`)
  } else if (def.effectId === 'interference_signal') {
    // Resolved via pickInterference — should not reach here
    next = log(next, `${def.nameTh} เข้าสุสาน`)
  } else if (def.effectId === 'signal_amplifier') {
    // Resolved via pickSignalAmp / skip — should not reach here
    next = log(next, `${def.nameTh} เข้าสุสาน`)
  } else if (def.effectId === 'emergency_reinforce') {
    // Resolved via pickEmergencyFromDeck
    next = log(next, `${def.nameTh} เข้าสุสาน`)
  } else if (def.effectId === 'alkata_call') {
    next = log(next, `${def.nameTh} เข้าสุสาน`)
  } else if (def.effectId === 'alkata_plot') {
    next = log(next, `${def.nameTh} เข้าสุสาน`)
  } else {
    next = log(next, `${def.nameTh} เข้าสุสาน`)
  }
  if (next.interaction.type === 'idle') {
    next = settleAfterKataResolution(next, playerId)
  }
  return next
}

export function pickSoulDrainSacrifice(
  state: GameState,
  playerId: PlayerId,
  monsterInstanceId: string,
): GameState {
  if (state.interaction.type !== 'soul_drain') return state
  if (state.activePlayer !== playerId) return state
  if (state.interaction.sacrificeId) return state

  const player = state.players[playerId]
  const sacIdx = findFieldIndex(player, monsterInstanceId)
  if (sacIdx < 0) return state

  const others = player.field.filter(
    (m) => m && m.instanceId !== monsterInstanceId,
  )
  if (others.length === 0) return state

  const def = getCard(
    player.field[findFieldIndex(player, monsterInstanceId)]!.cardId,
  )
  let next: GameState = {
    ...state,
    interaction: {
      type: 'soul_drain',
      spellInstanceId: state.interaction.spellInstanceId,
      sacrificeId: monsterInstanceId,
    },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `เลือก ${def.nameTh} เป็นเครื่องบูชา — เลือกมอนสเตอร์ที่จะรับ ATK`,
  )
  return next
}

export function pickSoulDrainTarget(
  state: GameState,
  playerId: PlayerId,
  monsterInstanceId: string,
): GameState {
  if (state.interaction.type !== 'soul_drain') return state
  if (state.activePlayer !== playerId) return state
  const { spellInstanceId, sacrificeId } = state.interaction
  if (!sacrificeId) return state
  if (monsterInstanceId === sacrificeId) return state

  let player = { ...state.players[playerId] }
  const sacIdx = findFieldIndex(player, sacrificeId)
  const buffIdx = findFieldIndex(player, monsterInstanceId)
  if (sacIdx < 0 || buffIdx < 0) return state

  const stIdx = findSpellTrapIndex(player, spellInstanceId)
  if (stIdx < 0) return state

  const sacrifice = player.field[sacIdx]!
  const buffTarget = player.field[buffIdx]!
  const spellCard = player.spellTrap[stIdx]
  const spellDef = getCard(spellCard.cardId)
  const sacDef = getCard(sacrifice.cardId)
  const buffDef = getCard(buffTarget.cardId)

  const power = getEffectiveAtk(
    state,
    playerId,
    sacrifice.cardId,
    sacrifice.instanceId,
  )

  const field = [...player.field]
  field[sacIdx] = null
  field[buffIdx] = {
    ...buffTarget,
    atkMod: (buffTarget.atkMod ?? 0) + power,
  }

  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)

  player = {
    ...player,
    field,
    spellTrap,
  }
  const destroyed = afterMonsterDestroyed(player, sacrifice)
  player = destroyed.player

  let players = depositToOwnerGy(
    { ...state.players, [playerId]: player },
    { ...sacrifice, faceDown: false },
    playerId,
  )
  players = depositToOwnerGy(
    players,
    { ...spellCard, faceDown: false },
    playerId,
  )
  player = players[playerId]

  let next: GameState = {
    ...state,
    players,
    interaction: { type: 'idle' },
    selectedCardId: buffDef.id,
  }
  next = log(
    next,
    `${player.name} ใช้ ${spellDef.nameTh}! ส่ง ${sacDef.nameTh} (ATK ${power}) ลงสุสาน — ${buffDef.nameTh} ATK +${power}`,
  )
  if (destroyed.note) next = log(next, destroyed.note)
  return checkWinner(next)
}

export function pickAlkataPlot(
  state: GameState,
  playerId: PlayerId,
  monsterInstanceId: string,
): GameState {
  if (state.interaction.type !== 'alkata_plot') return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const { spellInstanceId } = state.interaction
  let player = { ...state.players[playerId] }
  const mIdx = findFieldIndex(player, monsterInstanceId)
  if (mIdx < 0) return state
  const target = player.field[mIdx]!
  if (!isAlkataGod(target.cardId)) return state

  const stIdx = findSpellTrapIndex(player, spellInstanceId)
  if (stIdx < 0) return state
  const spellCard = player.spellTrap[stIdx]
  const spellDef = getCard(spellCard.cardId)
  const targetDef = getCard(target.cardId)

  const field = [...player.field]
  field[mIdx] = null
  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)
  player = {
    ...player,
    field,
    spellTrap,
  }
  const destroyed = afterMonsterDestroyed(player, target)
  player = destroyed.player

  let players = depositToOwnerGy(
    { ...state.players, [playerId]: player },
    { ...target, faceDown: false },
    playerId,
  )
  players = depositToOwnerGy(
    players,
    { ...spellCard, faceDown: false },
    playerId,
  )
  player = players[playerId]

  const before = player.hand.length
  player = drawCards(player, 2)
  const drawn = player.hand.length - before

  let next: GameState = {
    ...state,
    players: { ...players, [playerId]: player },
    interaction: { type: 'idle' },
    selectedCardId: targetDef.id,
  }
  next = log(
    next,
    `${player.name} ใช้ ${spellDef.nameTh}! ทำลาย ${targetDef.nameTh} — จั่ว ${drawn} ใบ`,
  )
  if (destroyed.note) next = log(next, destroyed.note)
  next = enforceHandLimit(next, playerId)
  if (next.interaction.type !== 'idle') return next
  return checkWinner(next)
}
export function pickSpecialMod(
  state: GameState,
  playerId: PlayerId,
  monsterInstanceId: string,
): GameState {
  if (state.interaction.type !== 'special_mod') return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const { spellInstanceId } = state.interaction
  let player = { ...state.players[playerId] }
  const tIdx = findFieldIndex(player, monsterInstanceId)
  if (tIdx < 0) return state
  const target = player.field[tIdx]!
  if (!isDestructionRobotCard(target.cardId)) return state

  const stIdx = findSpellTrapIndex(player, spellInstanceId)
  if (stIdx < 0) return state

  const spellCard = player.spellTrap[stIdx]
  const spellDef = getCard(spellCard.cardId)
  const targetDef = getCard(target.cardId)
  const opp = state.players[otherPlayer(playerId)]
  const hpDiff = Math.abs(player.hp - opp.hp)

  const field = [...player.field]
  field[tIdx] = {
    ...target,
    atkMod: (target.atkMod ?? 0) + hpDiff,
  }

  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)

  player = {
    ...player,
    field,
    spellTrap,
    graveyard: [...player.graveyard, { ...spellCard, faceDown: false }],
  }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
    selectedCardId: targetDef.id,
  }
  next = log(
    next,
    `${player.name} ใช้ ${spellDef.nameTh}! ${targetDef.nameTh} ATK +${hpDiff} (ผลต่าง HP)`,
  )
  return checkWinner(next)
}

/** Interference Signal — add Destruction Robot from deck; heal opponent by its cost */
export function pickInterference(
  state: GameState,
  playerId: PlayerId,
  deckInstanceId: string,
): GameState {
  if (state.interaction.type !== 'interference_pick') return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const { spellInstanceId } = state.interaction
  let player = { ...state.players[playerId] }
  const deckIdx = player.deck.findIndex((c) => c.instanceId === deckInstanceId)
  if (deckIdx < 0) return state

  const fetched = player.deck[deckIdx]
  if (!isDestructionRobotCard(fetched.cardId)) return state
  const fetchedDef = getCard(fetched.cardId)

  const stIdx = findSpellTrapIndex(player, spellInstanceId)
  if (stIdx < 0) return state
  const spellCard = player.spellTrap[stIdx]
  const spellDef = getCard(spellCard.cardId)

  const deck = [...player.deck]
  deck.splice(deckIdx, 1)
  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)

  player = {
    ...player,
    deck: shuffle(deck),
    hand: [...player.hand, fetched],
    spellTrap,
    graveyard: [...player.graveyard, { ...spellCard, faceDown: false }],
  }

  const oppId = otherPlayer(playerId)
  let opponent = { ...state.players[oppId] }
  const heal = fetchedDef.cost
  opponent = { ...opponent, hp: opponent.hp + heal }

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: player,
      [oppId]: opponent,
    },
    interaction: { type: 'idle' },
    selectedCardId: fetchedDef.id,
  }
  next = log(
    next,
    `${player.name} ใช้ ${spellDef.nameTh}! นำ ${fetchedDef.nameTh} (ค่าร่าย ${heal}) จากเด็คขึ้นมือ — ${opponent.name} HP +${heal}`,
  )
  return enforceHandLimit(next, playerId)
}

function finishSignalAmpSpell(
  state: GameState,
  playerId: PlayerId,
  spellInstanceId: string,
): GameState {
  let player = { ...state.players[playerId] }
  const stIdx = findSpellTrapIndex(player, spellInstanceId)
  if (stIdx < 0) {
    return { ...state, interaction: { type: 'idle' } }
  }
  const spellCard = player.spellTrap[stIdx]
  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)
  player = {
    ...player,
    spellTrap,
    graveyard: [...player.graveyard, { ...spellCard, faceDown: false }],
  }
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
  }
  next = log(next, `${getCard(spellCard.cardId).nameTh} เข้าสุสาน`)
  return next
}

/** Signal Amplifier — summon a Destruction Robot from GY until end of turn */
export function pickSignalAmp(
  state: GameState,
  playerId: PlayerId,
  gyInstanceId: string,
): GameState {
  if (state.interaction.type !== 'signal_amp_pick') return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const { spellInstanceId, remaining } = state.interaction
  let player = { ...state.players[playerId] }
  const gyIdx = player.graveyard.findIndex((c) => c.instanceId === gyInstanceId)
  if (gyIdx < 0) return state
  const card = player.graveyard[gyIdx]
  if (!isDestructionRobotCard(card.cardId)) return state

  const zone = player.field.findIndex((z) => z === null)
  if (zone < 0) return finishSignalAmpSpell(state, playerId, spellInstanceId)

  const gy = [...player.graveyard]
  gy.splice(gyIdx, 1)
  const summoned: CardInstance = {
    ...resetForSummon(card, state.turn),
    destroyAtEndTurn: true,
  }
  const field = [...player.field]
  field[zone] = summoned
  player = { ...player, graveyard: gy, field }

  const def = getCard(card.cardId)
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `${player.name} อัญเชิญ ${def.nameTh} จากสุสาน (โซน ${zone + 1}) — ถูกทำลายตอนจบเทิร์น`,
  )

  const remainingAfter = remaining - 1
  const stillGy = next.players[playerId].graveyard.filter((c) =>
    isDestructionRobotCard(c.cardId),
  )
  const freeZones = next.players[playerId].field.filter((z) => z === null).length
  if (remainingAfter > 0 && stillGy.length > 0 && freeZones > 0) {
    const left = Math.min(remainingAfter, stillGy.length, freeZones)
    next = {
      ...next,
      interaction: {
        type: 'signal_amp_pick',
        spellInstanceId,
        remaining: left,
      },
    }
    next = log(next, `เลือกได้อีก ${left} ตัว`)
    return next
  }

  return finishSignalAmpSpell(next, playerId, spellInstanceId)
}

export function skipSignalAmp(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.interaction.type !== 'signal_amp_pick') return state
  if (state.activePlayer !== playerId) return state
  return finishSignalAmpSpell(
    state,
    playerId,
    state.interaction.spellInstanceId,
  )
}

/** During Soluy hand-pick: warrior that can legally land on our field */
export function canSoluySummonFromHand(
  state: GameState,
  playerId: PlayerId,
  handInstanceId: string,
): boolean {
  if (state.interaction.type !== 'soluy_swap') return false
  if (state.activePlayer !== playerId) return false
  if (!state.interaction.bounceId) return false
  if (findFieldIndex(state.players[playerId], state.interaction.bounceId) >= 0) {
    return false
  }
  const card = state.players[playerId].hand.find((c) => c.instanceId === handInstanceId)
  if (!card) return false
  if (!isWarrior(card.cardId)) return false
  return canFreePlaceMonster(state, playerId, card.cardId)
}

export function canFreePlaceMonster(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
): boolean {
  const player = state.players[playerId]
  const def = getCard(cardId)
  if (def.type !== 'monster') return false

  if (def.effectId === 'scout_unit') {
    if (!player.field.some((z) => z === null)) return false
    const opp = state.players[otherPlayer(playerId)]
    if (!opp.field.some((z) => z === null)) return false
  } else if (!player.field.some((z) => z === null)) {
    return false
  }

  if (def.effectId === 'frontline_warrior' || def.effectId === 'support_unit') {
    if (player.field.some((m) => m && getCard(m.cardId).effectId === def.effectId)) {
      return false
    }
  }
  return true
}

export function pickEmergencyFromDeck(
  state: GameState,
  playerId: PlayerId,
  deckInstanceId: string,
): GameState {
  if (state.interaction.type !== 'emergency_pick') return state
  if (state.activePlayer !== playerId) return state

  let player = { ...state.players[playerId] }
  const deckIdx = player.deck.findIndex((c) => c.instanceId === deckInstanceId)
  if (deckIdx < 0) return state

  const fetched = player.deck[deckIdx]
  const def = getCard(fetched.cardId)
  if (def.type !== 'monster') return state

  const stIdx = findSpellTrapIndex(player, state.interaction.spellInstanceId)
  if (stIdx < 0) return state
  const spellCard = player.spellTrap[stIdx]
  const spellDef = getCard(spellCard.cardId)

  const deck = [...player.deck]
  deck.splice(deckIdx, 1)
  const hand = [...player.hand, fetched]
  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)

  player = {
    ...player,
    deck: shuffle(deck),
    hand,
    spellTrap,
    graveyard: [...player.graveyard, { ...spellCard, faceDown: false }],
  }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    selectedCardId: def.id,
    interaction: { type: 'idle' },
  }
  next = log(
    next,
    `${player.name} ใช้ ${spellDef.nameTh}! นำ ${def.nameTh} (ATK ${def.atk ?? 0}) จากเด็คขึ้นมือ`,
  )

  const atk = def.atk ?? 0
  if (atk < 5 && canFreePlaceMonster(next, playerId, def.id)) {
    next = {
      ...next,
      interaction: {
        type: 'emergency_summon',
        cardInstanceId: fetched.instanceId,
      },
    }
    next = log(
      next,
      `${def.nameTh} ATK < 5 — สามารถอัญเชิญลงสนามได้ทันที (หรือเก็บไว้ในมือ)`,
    )
    return next
  }

  return enforceHandLimit(next, playerId)
}

export function canEmergencySummon(
  state: GameState,
  playerId: PlayerId,
  zoneIndex?: number,
): boolean {
  if (state.interaction.type !== 'emergency_summon') return false
  if (state.activePlayer !== playerId) return false
  const player = state.players[playerId]
  const idx = findHandIndex(player, state.interaction.cardInstanceId)
  if (idx < 0) return false
  const card = player.hand[idx]
  if (!canFreePlaceMonster(state, playerId, card.cardId)) return false
  if (zoneIndex !== undefined && player.field[zoneIndex] !== null) return false
  return true
}

export function confirmEmergencySummon(
  state: GameState,
  playerId: PlayerId,
  zoneIndex?: number,
): GameState {
  if (!canEmergencySummon(state, playerId, zoneIndex)) return state
  if (state.interaction.type !== 'emergency_summon') return state

  const cardInstanceId = state.interaction.cardInstanceId
  let player = { ...state.players[playerId] }
  const handIdx = findHandIndex(player, cardInstanceId)
  const card = player.hand[handIdx]
  const def = getCard(card.cardId)

  const hand = [...player.hand]
  hand.splice(handIdx, 1)

  const summoned: CardInstance = resetForSummon(card, state.turn)

  // Scout switches control
  if (def.effectId === 'scout_unit') {
    let zone = zoneIndex
    if (zone === undefined || player.field[zone] !== null) {
      zone = player.field.findIndex((z) => z === null)
    }
    if (zone < 0) return state
    const oppId = otherPlayer(playerId)
    let opponent = { ...state.players[oppId] }
    const oppZone = opponent.field.findIndex((z) => z === null)
    if (oppZone < 0) return state

    const ourField = [...player.field]
    ourField[zone] = summoned
    player = { ...player, hand, field: ourField }

    const oppField = [...opponent.field]
    oppField[oppZone] = { ...summoned }
    ourField[zone] = null
    player = { ...player, field: ourField }
    opponent = { ...opponent, field: oppField }

    let next: GameState = {
      ...state,
      players: { ...state.players, [playerId]: player, [oppId]: opponent },
      interaction: { type: 'idle' },
      selectedCardId: def.id,
    }
    next = log(
      next,
      `${player.name} อัญเชิญฉุกเฉิน ${def.nameTh} — เปลี่ยนฝั่งไป ${opponent.name}`,
    )
    return next
  }

  let zone = zoneIndex
  if (zone === undefined || player.field[zone] !== null) {
    zone = player.field.findIndex((z) => z === null)
  }
  if (zone < 0) return state

  const field = [...player.field]
  field[zone] = summoned
  player = { ...player, hand, field }
  const oppId = otherPlayer(playerId)
  const trig = applySummonTriggers(player, state.players[oppId], def.id)
  player = trig.player

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: player,
      [oppId]: trig.opponent,
    },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `${player.name} อัญเชิญฉุกเฉิน ${def.nameTh} (ATK ${getEffectiveAtk(next, playerId, def.id, summoned.instanceId)}) โซน ${zone + 1}`,
  )
  if (trig.note) next = log(next, trig.note)
  return afterSummonEffects(next, playerId, def.id, summoned.instanceId)
}

export function skipEmergencySummon(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.interaction.type !== 'emergency_summon') return state
  if (state.activePlayer !== playerId) return state
  const player = state.players[playerId]
  let next: GameState = {
    ...state,
    interaction: { type: 'idle' },
  }
  next = log(next, `${player.name} เก็บการ์ดไว้ในมือ`)
  return enforceHandLimit(next, playerId)
}

export function skipMinaRecruit(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.interaction.type !== 'mina_recruit') return state
  if (state.activePlayer !== playerId) return state
  const resume = state.interaction.resumeReinforce
  const player = state.players[playerId]
  let next: GameState = { ...state, interaction: { type: 'idle' } }
  const src = state.interaction.source === 'sara' ? 'ซาร่า' : 'มีน่า'
  next = log(next, `${player.name} ข้ามการอัญเชิญจากเด็คของ${src}`)
  return resumeReinforceInteraction(next, playerId, resume)
}

export function pickMinaFromDeck(
  state: GameState,
  playerId: PlayerId,
  deckInstanceId: string,
  zoneIndex?: number,
): GameState {
  if (state.interaction.type !== 'mina_recruit') return state
  if (state.activePlayer !== playerId) return state
  const resume = state.interaction.resumeReinforce
  const recruitSource = state.interaction.source === 'sara' ? 'sara' : 'mina'
  const srcLabel = recruitSource === 'sara' ? 'ซาร่า' : 'มีน่า'

  let player = { ...state.players[playerId] }
  const deckIdx = player.deck.findIndex((c) => c.instanceId === deckInstanceId)
  if (deckIdx < 0) return state

  const fetched = player.deck[deckIdx]
  const def = getCard(fetched.cardId)
  if (!isWarrior(fetched.cardId)) return state
  // Mina cannot recruit another Mina
  if (
    recruitSource === 'mina' &&
    getCard(fetched.cardId).effectId === 'mina_recruit'
  ) {
    return state
  }
  if (!canFreePlaceMonster(state, playerId, fetched.cardId)) return state

  const deck = [...player.deck]
  deck.splice(deckIdx, 1)
  player = { ...player, deck: shuffle(deck) }

  const summoned: CardInstance = resetForSummon(fetched, state.turn)

  let opponent = { ...state.players[otherPlayer(playerId)] }
  let next: GameState

  if (def.effectId === 'scout_unit') {
    let zone = zoneIndex
    if (zone === undefined || player.field[zone] !== null) {
      zone = player.field.findIndex((z) => z === null)
    }
    if (zone < 0) return state
    const oppZone = opponent.field.findIndex((z) => z === null)
    if (oppZone < 0) return state

    const ourField = [...player.field]
    ourField[zone] = summoned
    const oppField = [...opponent.field]
    oppField[oppZone] = { ...summoned }
    ourField[zone] = null
    player = { ...player, field: ourField }
    opponent = { ...opponent, field: oppField }

    next = {
      ...state,
      players: {
        ...state.players,
        [playerId]: player,
        [otherPlayer(playerId)]: opponent,
      },
      interaction: { type: 'idle' },
      selectedCardId: def.id,
    }
    const src = srcLabel
    next = log(
      next,
      `${player.name} อัญเชิญ ${def.nameTh} จากเด็คด้วย${src} — เปลี่ยนฝั่งไป ${opponent.name}`,
    )
  } else {
    let zone = zoneIndex
    if (zone === undefined || player.field[zone] !== null) {
      zone = player.field.findIndex((z) => z === null)
    }
    if (zone < 0) return state
    const field = [...player.field]
    field[zone] = summoned
    player = { ...player, field }

    const trig = applySummonTriggers(player, opponent, def.id)
    player = trig.player
    opponent = trig.opponent

    next = {
      ...state,
      players: {
        ...state.players,
        [playerId]: player,
        [otherPlayer(playerId)]: opponent,
      },
      interaction: { type: 'idle' },
      selectedCardId: def.id,
    }
    next = log(
      next,
      `${player.name} อัญเชิญ ${def.nameTh} จากเด็คด้วย${srcLabel} โซน ${zone + 1}`,
    )
    if (trig.note) next = log(next, trig.note)
  }

  // Chain Sara / Mina / Omega on-summon follow-ups
  next = afterSummonEffects(next, playerId, def.id, summoned.instanceId, resume)
  if (
    next.interaction.type === 'mina_recruit' ||
    next.interaction.type === 'sara_discard' ||
    next.interaction.type === 'omega_search' ||
    next.interaction.type === 'alkata_deck_search' ||
    next.interaction.type === 'alkata_mina_summon' ||
    next.interaction.type === 'sora_destroy'
  ) {
    return next
  }

  return checkWinner(resumeReinforceInteraction(next, playerId, resume))
}

const SOLUY_USES_PER_TURN = 2

function isSoluyCard(cardId: string): boolean {
  return getCard(cardId).effectId === 'soluy_swap'
}

export function canActivateSoluy(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.activePlayer !== playerId) return false
  if (state.phase !== 'main1' && state.phase !== 'main2') return false
  if (state.interaction.type !== 'idle') return false

  const player = state.players[playerId]
  const idx = findFieldIndex(player, instanceId)
  if (idx < 0) return false
  const mon = player.field[idx]!
  if (!isSoluyCard(mon.cardId)) return false
  if ((mon.effectUses ?? 0) >= SOLUY_USES_PER_TURN) return false

  // Need a warrior that is not Soluy to bounce
  const bounceTargets = player.field.filter(
    (m) => m && isWarrior(m.cardId) && !isSoluyCard(m.cardId),
  )
  if (bounceTargets.length === 0) return false

  return true
}

export function beginSoluySwap(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  opts?: { skipIntercept?: boolean },
): GameState {
  if (!canActivateSoluy(state, playerId, sourceId)) return state
  if (!opts?.skipIntercept) {
    const blocked = maybeInterceptMonsterEffect(
      state,
      playerId,
      sourceId,
      'soluy_swap',
    )
    if (blocked) return blocked
  }
  const uses = state.players[playerId].field[findFieldIndex(state.players[playerId], sourceId)]!
    .effectUses ?? 0
  let next: GameState = {
    ...state,
    interaction: { type: 'soluy_swap', sourceId },
    selectedCardId: getCard(
      state.players[playerId].field[findFieldIndex(state.players[playerId], sourceId)]!
        .cardId,
    ).id,
  }
  next = log(
    next,
    `โซลุย (${uses + 1}/${SOLUY_USES_PER_TURN}) — เลือกนักรบ (ไม่ใช่โซลุย) เพื่อส่งกลับขึ้นมือ`,
  )
  return next
}

export function pickSoluyBounce(
  state: GameState,
  playerId: PlayerId,
  bounceId: string,
): GameState {
  if (state.interaction.type !== 'soluy_swap') return state
  if (state.activePlayer !== playerId) return state
  if (state.interaction.bounceId) return state

  let player = { ...state.players[playerId] }
  const idx = findFieldIndex(player, bounceId)
  if (idx < 0) return state
  const mon = player.field[idx]!
  if (!isWarrior(mon.cardId)) return state
  // Cannot bounce Soluy Air Soldier
  if (isSoluyCard(mon.cardId)) return state

  const def = getCard(mon.cardId)
  const field = [...player.field]
  field[idx] = null
  player = { ...player, field }
  player = noteAlkataLeft(player, mon)

  const oppId = otherPlayer(playerId)
  let opponent = state.players[oppId]
  const retTrig = applyReturnToHandTriggers(player, opponent, mon.cardId)
  player = retTrig.player
  opponent = retTrig.opponent

  let players = depositToOwnerHand(
    { ...state.players, [playerId]: player, [oppId]: opponent },
    mon,
    playerId,
  )

  let next: GameState = {
    ...state,
    players,
    interaction: {
      type: 'soluy_swap',
      sourceId: state.interaction.sourceId,
      bounceId,
    },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `ส่ง ${def.nameTh} ขึ้นมือ — เลือกนักรบจากมือเพื่ออัญเชิญ (เลือกตัวเดิมได้)`,
  )
  if (retTrig.note) next = log(next, retTrig.note)
  return next
}

export function cancelSoluySwap(state: GameState): GameState {
  if (state.interaction.type !== 'soluy_swap') return state
  const { bounceId } = state.interaction
  if (!bounceId) {
    return { ...state, interaction: { type: 'idle' } }
  }

  // Undo bounce: put the card back on an empty zone
  const playerId = state.activePlayer
  const oppId = otherPlayer(playerId)
  let player = { ...state.players[playerId] }
  let opponent = { ...state.players[oppId] }

  // Bounced card may be in the original owner's hand
  let fromId: PlayerId | null = null
  let handIdx = findHandIndex(player, bounceId)
  if (handIdx >= 0) fromId = playerId
  else {
    handIdx = findHandIndex(opponent, bounceId)
    if (handIdx >= 0) fromId = oppId
  }
  if (fromId === null) {
    return { ...state, interaction: { type: 'idle' } }
  }
  const card =
    fromId === playerId ? player.hand[handIdx] : opponent.hand[handIdx]
  const zone = player.field.findIndex((z) => z === null)
  if (zone < 0) {
    return { ...state, interaction: { type: 'idle' } }
  }

  const undone = undoReturnToHandTriggers(player, opponent, card.cardId)
  player = undone.player
  opponent = undone.opponent
  player = undoAlkataLeft(player, card)

  if (fromId === playerId) {
    const hand = [...player.hand]
    hand.splice(handIdx, 1)
    player = { ...player, hand }
  } else {
    const hand = [...opponent.hand]
    hand.splice(handIdx, 1)
    opponent = { ...opponent, hand }
  }
  const field = [...player.field]
  field[zone] = card
  player = { ...player, field }
  return {
    ...state,
    players: { ...state.players, [playerId]: player, [oppId]: opponent },
    interaction: { type: 'idle' },
  }
}

export function resolveSoluySummon(
  state: GameState,
  playerId: PlayerId,
  handInstanceId: string,
  zoneIndex?: number,
): GameState {
  if (state.interaction.type !== 'soluy_swap') return state
  if (state.activePlayer !== playerId) return state
  const { sourceId, bounceId } = state.interaction
  if (!bounceId) return state

  let player = { ...state.players[playerId] }

  // Bounce already happened in pickSoluyBounce — target must be in hand
  const handIdx = findHandIndex(player, handInstanceId)
  if (handIdx < 0) return state
  const toSummonCard = player.hand[handIdx]
  const summonDef = getCard(toSummonCard.cardId)
  if (summonDef.type !== 'monster' || summonDef.tribe !== 'warrior') return state

  // Bounce card should already be off the field
  if (findFieldIndex(player, bounceId) >= 0) return state

  let field = [...player.field]
  let hand = [...player.hand]
  hand.splice(handIdx, 1)

  const sourceIdx = findFieldIndex(player, sourceId)
  if (sourceIdx >= 0 && field[sourceIdx]) {
    const src = field[sourceIdx]!
    field[sourceIdx] = {
      ...src,
      effectUses: (src.effectUses ?? 0) + 1,
    }
  }

  const probeState: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, field, hand },
    },
  }
  if (!canFreePlaceMonster(probeState, playerId, toSummonCard.cardId)) return state

  const summoned: CardInstance = resetForSummon(toSummonCard, state.turn)

  let opponent = state.players[otherPlayer(playerId)]

  if (summonDef.effectId === 'scout_unit') {
    let zone = zoneIndex
    if (zone === undefined || field[zone] !== null) {
      zone = field.findIndex((z) => z === null)
    }
    if (zone < 0) return state
    const oppId = otherPlayer(playerId)
    opponent = { ...opponent }
    const oppZone = opponent.field.findIndex((z) => z === null)
    if (oppZone < 0) return state

    const oppField = [...opponent.field]
    oppField[oppZone] = { ...summoned }
    field[zone] = null
    player = { ...player, field, hand }
    opponent = { ...opponent, field: oppField }

    let next: GameState = {
      ...state,
      players: { ...state.players, [playerId]: player, [oppId]: opponent },
      interaction: { type: 'idle' },
      selectedCardId: summonDef.id,
    }
    next = log(
      next,
      `${player.name} ใช้เอฟเฟคโซลุย! อัญเชิญ ${summonDef.nameTh} (เปลี่ยนฝั่ง)`,
    )
    next = enforceHandLimit(next, playerId)
    if (next.interaction.type !== 'idle') return next
    return checkWinner(next)
  }

  let zone = zoneIndex
  if (zone === undefined || field[zone] !== null) {
    zone = field.findIndex((z) => z === null)
  }
  if (zone < 0) return state
  field[zone] = summoned

  // Source already had uses incremented above — keep that if still on field
  if (sourceIdx >= 0 && field[sourceIdx] && field[sourceIdx]!.instanceId === sourceId) {
    // already incremented
  }

  player = { ...player, field, hand }
  const trig = applySummonTriggers(
    player,
    opponent,
    summonDef.id,
  )
  player = trig.player
  opponent = trig.opponent

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: player,
      [otherPlayer(playerId)]: opponent,
    },
    interaction: { type: 'idle' },
    selectedCardId: summonDef.id,
  }
  next = log(
    next,
    `${player.name} ใช้เอฟเฟคโซลุย! อัญเชิญ ${summonDef.nameTh} โซน ${zone + 1}`,
  )
  if (trig.note) next = log(next, trig.note)
  next = afterSummonEffects(
    enforceHandLimit(next, playerId),
    playerId,
    summonDef.id,
    summoned.instanceId,
  )
  if (next.interaction.type !== 'idle') return next
  return checkWinner(next)
}

export function canActivateShorin(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.activePlayer !== playerId) return false
  if (state.phase !== 'main1' && state.phase !== 'main2') return false
  if (state.interaction.type !== 'idle') return false

  const player = state.players[playerId]
  const idx = findFieldIndex(player, instanceId)
  if (idx < 0) return false
  const mon = player.field[idx]!
  if (!isShorinCard(mon.cardId)) return false
  if (mon.effectUsed) return false
  if (player.hand.length < 1) return false

  return (
    player.deck.some((c) => isKataSpellOrTrap(c.cardId)) ||
    player.graveyard.some((c) => isKataSpellOrTrap(c.cardId))
  )
}

export function beginShorinSearch(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  opts?: { skipIntercept?: boolean },
): GameState {
  if (!canActivateShorin(state, playerId, sourceId)) return state
  if (!opts?.skipIntercept) {
    const blocked = maybeInterceptMonsterEffect(
      state,
      playerId,
      sourceId,
      'shorin_mage',
    )
    if (blocked) return blocked
  }
  const mon = state.players[playerId].field[findFieldIndex(state.players[playerId], sourceId)]!
  let next: GameState = {
    ...state,
    interaction: {
      type: 'shorin_search',
      sourceId,
      ownerId: playerId,
      step: 'discard',
    },
    selectedCardId: getCard(mon.cardId).id,
  }
  next = log(
    next,
    `จอมเวทย์ โชริน — ทิ้งการ์ดจากมือ 1 ใบ แล้วเลือก「คาถา」จากเด็คหรือสุสานขึ้นมือ`,
  )
  return next
}

export function cancelShorinSearch(state: GameState): GameState {
  if (state.interaction.type !== 'shorin_search') return state
  // Only cancel before paying the discard
  if (state.interaction.step !== 'discard') return state
  return { ...state, interaction: { type: 'idle' } }
}

export function pickShorinDiscard(
  state: GameState,
  playerId: PlayerId,
  handInstanceId: string,
): GameState {
  if (state.interaction.type !== 'shorin_search') return state
  if (state.interaction.step !== 'discard') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state

  const { sourceId } = state.interaction
  let player = { ...state.players[playerId] }
  const sourceIdx = findFieldIndex(player, sourceId)
  if (sourceIdx < 0) return state
  const source = player.field[sourceIdx]!
  if (!isShorinCard(source.cardId) || source.effectUsed) return state

  const handIdx = findHandIndex(player, handInstanceId)
  if (handIdx < 0) return state
  const discarded = player.hand[handIdx]
  const hand = [...player.hand]
  hand.splice(handIdx, 1)
  const field = [...player.field]
  field[sourceIdx] = { ...source, effectUsed: true }
  player = {
    ...player,
    hand,
    field,
  }
  let players = depositToOwnerGy(
    { ...state.players, [playerId]: player },
    { ...discarded, faceDown: false },
    playerId,
  )
  player = players[playerId]

  const stillHasKata =
    player.deck.some((c) => isKataSpellOrTrap(c.cardId)) ||
    player.graveyard.some((c) => isKataSpellOrTrap(c.cardId))

  let next: GameState = {
    ...state,
    players,
    selectedCardId: getCard(discarded.cardId).id,
  }
  next = log(next, `โชรินทิ้ง ${getCard(discarded.cardId).nameTh}`)

  if (!stillHasKata) {
    next = { ...next, interaction: { type: 'idle' } }
    next = log(next, `โชริน — ไม่มี「คาถา」ในเด็ค/สุสาน`)
    return next
  }

  next = {
    ...next,
    interaction: {
      type: 'shorin_search',
      sourceId,
      ownerId: playerId,
      step: 'fetch',
    },
  }
  next = log(next, `โชริน — เลือก「คาถา」จากเด็คหรือสุสานขึ้นมือ`)
  return next
}

export function pickShorinSearch(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  from: 'deck' | 'graveyard',
): GameState {
  if (state.interaction.type !== 'shorin_search') return state
  if (state.interaction.step !== 'fetch') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state

  const { sourceId } = state.interaction
  let player = { ...state.players[playerId] }
  const sourceIdx = findFieldIndex(player, sourceId)
  if (sourceIdx < 0) return state
  const source = player.field[sourceIdx]!
  if (!isShorinCard(source.cardId)) return state

  let fetched: CardInstance | null = null
  if (from === 'deck') {
    const deckIdx = player.deck.findIndex((c) => c.instanceId === instanceId)
    if (deckIdx < 0) return state
    fetched = player.deck[deckIdx]
    if (!isKataSpellOrTrap(fetched.cardId)) return state
    const deck = [...player.deck]
    deck.splice(deckIdx, 1)
    player = { ...player, deck: shuffle(deck) }
  } else {
    const gyIdx = player.graveyard.findIndex((c) => c.instanceId === instanceId)
    if (gyIdx < 0) return state
    fetched = player.graveyard[gyIdx]
    if (!isKataSpellOrTrap(fetched.cardId)) return state
    const graveyard = [...player.graveyard]
    graveyard.splice(gyIdx, 1)
    player = { ...player, graveyard }
  }

  const toHand: CardInstance = {
    ...fetched,
    faceDown: false,
  }
  player = {
    ...player,
    hand: [...player.hand, toHand],
  }

  const def = getCard(toHand.cardId)
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `โชรินนำ ${def.nameTh} จาก${from === 'deck' ? 'เด็ค' : 'สุสาน'}ขึ้นมือ`,
  )
  return enforceHandLimit(next, playerId)
}

export function canActivateSaruka(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.activePlayer !== playerId) return false
  if (state.phase !== 'main1' && state.phase !== 'main2') return false
  if (state.interaction.type !== 'idle') return false

  const player = state.players[playerId]
  const idx = findFieldIndex(player, instanceId)
  if (idx < 0) return false
  const mon = player.field[idx]!
  if (!isSarukaCard(mon.cardId)) return false
  if (mon.effectUsed) return false
  if (player.hand.length < 1) return false

  return (
    player.deck.some((c) => isKataSpellOrTrap(c.cardId)) ||
    player.graveyard.some((c) => isKataSpellOrTrap(c.cardId))
  )
}

export function beginSarukaSearch(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  opts?: { skipIntercept?: boolean },
): GameState {
  if (!canActivateSaruka(state, playerId, sourceId)) return state
  if (!opts?.skipIntercept) {
    const blocked = maybeInterceptMonsterEffect(
      state,
      playerId,
      sourceId,
      'saruka_mage',
    )
    if (blocked) return blocked
  }
  const mon =
    state.players[playerId].field[
      findFieldIndex(state.players[playerId], sourceId)
    ]!
  let next: GameState = {
    ...state,
    interaction: {
      type: 'saruka_search',
      sourceId,
      ownerId: playerId,
      step: 'discard',
    },
    selectedCardId: getCard(mon.cardId).id,
  }
  next = log(next, `จอมเวทย์ ซารุกะ — ทิ้งการ์ดจากมือ 1 ใบ`)
  return next
}

export function cancelSarukaSearch(state: GameState): GameState {
  if (state.interaction.type !== 'saruka_search') return state
  // Only cancel before paying the discard
  if (state.interaction.step !== 'discard') return state
  return { ...state, interaction: { type: 'idle' } }
}

export function pickSarukaDiscard(
  state: GameState,
  playerId: PlayerId,
  handInstanceId: string,
): GameState {
  if (state.interaction.type !== 'saruka_search') return state
  if (state.interaction.step !== 'discard') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state

  const { sourceId } = state.interaction
  let player = { ...state.players[playerId] }
  const sourceIdx = findFieldIndex(player, sourceId)
  if (sourceIdx < 0) return state
  const source = player.field[sourceIdx]!
  if (!isSarukaCard(source.cardId) || source.effectUsed) return state

  const handIdx = findHandIndex(player, handInstanceId)
  if (handIdx < 0) return state
  const discarded = player.hand[handIdx]
  const hand = [...player.hand]
  hand.splice(handIdx, 1)
  const field = [...player.field]
  field[sourceIdx] = { ...source, effectUsed: true }
  player = {
    ...player,
    hand,
    field,
  }
  let players = depositToOwnerGy(
    { ...state.players, [playerId]: player },
    { ...discarded, faceDown: false },
    playerId,
  )
  player = players[playerId]

  const stillHasKata =
    player.deck.some((c) => isKataSpellOrTrap(c.cardId)) ||
    player.graveyard.some((c) => isKataSpellOrTrap(c.cardId))

  let next: GameState = {
    ...state,
    players,
    selectedCardId: getCard(discarded.cardId).id,
  }
  next = log(
    next,
    `ซารุกะทิ้ง ${getCard(discarded.cardId).nameTh}`,
  )

  if (!stillHasKata) {
    next = { ...next, interaction: { type: 'idle' } }
    next = log(next, `ซารุกะ — ไม่มี「คาถา」ในเด็ค/สุสาน`)
    return next
  }

  next = {
    ...next,
    interaction: {
      type: 'saruka_search',
      sourceId,
      ownerId: playerId,
      step: 'fetch',
    },
  }
  next = log(next, `ซารุกะ — เลือก「คาถา」จากเด็คหรือสุสานขึ้นมือ`)
  return next
}

export function pickSarukaSearch(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  from: 'deck' | 'graveyard',
): GameState {
  if (state.interaction.type !== 'saruka_search') return state
  if (state.interaction.step !== 'fetch') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state

  const { sourceId } = state.interaction
  let player = { ...state.players[playerId] }
  const sourceIdx = findFieldIndex(player, sourceId)
  if (sourceIdx < 0) return state
  const source = player.field[sourceIdx]!
  if (!isSarukaCard(source.cardId)) return state

  let fetched: CardInstance | null = null
  if (from === 'deck') {
    const deckIdx = player.deck.findIndex((c) => c.instanceId === instanceId)
    if (deckIdx < 0) return state
    fetched = player.deck[deckIdx]
    if (!isKataSpellOrTrap(fetched.cardId)) return state
    const deck = [...player.deck]
    deck.splice(deckIdx, 1)
    player = { ...player, deck: shuffle(deck) }
  } else {
    const gyIdx = player.graveyard.findIndex((c) => c.instanceId === instanceId)
    if (gyIdx < 0) return state
    fetched = player.graveyard[gyIdx]
    if (!isKataSpellOrTrap(fetched.cardId)) return state
    const graveyard = [...player.graveyard]
    graveyard.splice(gyIdx, 1)
    player = { ...player, graveyard }
  }

  const toHand: CardInstance = { ...fetched, faceDown: false }
  player = {
    ...player,
    hand: [...player.hand, toHand],
  }

  const def = getCard(toHand.cardId)
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `ซารุกะนำ ${def.nameTh} จาก${from === 'deck' ? 'เด็ค' : 'สุสาน'}ขึ้นมือ`,
  )
  return enforceHandLimit(next, playerId)
}

export function canActivateRyuka(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.activePlayer !== playerId) return false
  if (state.phase !== 'main1' && state.phase !== 'main2') return false
  if (state.interaction.type !== 'idle') return false

  const player = state.players[playerId]
  const idx = findFieldIndex(player, instanceId)
  if (idx < 0) return false
  const mon = player.field[idx]!
  if (!isRyukaCard(mon.cardId)) return false
  if (mon.effectUsed) return false
  if (player.hand.length < 2) return false
  return player.graveyard.some((c) => isKataSpellOrTrap(c.cardId))
}

export function beginRyukaFetch(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  opts?: { skipIntercept?: boolean },
): GameState {
  if (!canActivateRyuka(state, playerId, sourceId)) return state
  if (!opts?.skipIntercept) {
    const blocked = maybeInterceptMonsterEffect(
      state,
      playerId,
      sourceId,
      'ryuka_mage',
    )
    if (blocked) return blocked
  }
  const mon =
    state.players[playerId].field[
      findFieldIndex(state.players[playerId], sourceId)
    ]!
  let next: GameState = {
    ...state,
    interaction: {
      type: 'ryuka_fetch',
      sourceId,
      ownerId: playerId,
      step: 'discard',
      discardLeft: 2,
    },
    selectedCardId: getCard(mon.cardId).id,
  }
  next = log(
    next,
    `จอมเวทย์ ริวกะ — ทิ้งการ์ดจากมือ 2 ใบ แล้วเลือก「คาถา」จากสุสานขึ้นมือ`,
  )
  return next
}

export function cancelRyukaFetch(state: GameState): GameState {
  if (state.interaction.type !== 'ryuka_fetch') return state
  // Only cancel before any discard is paid
  if (state.interaction.step !== 'discard') return state
  if ((state.interaction.discardLeft ?? 0) < 2) return state
  return { ...state, interaction: { type: 'idle' } }
}

export function pickRyukaDiscard(
  state: GameState,
  playerId: PlayerId,
  handInstanceId: string,
): GameState {
  if (state.interaction.type !== 'ryuka_fetch') return state
  if (state.interaction.step !== 'discard') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state

  const { sourceId } = state.interaction
  let discardLeft = state.interaction.discardLeft ?? 0
  if (discardLeft <= 0) return state

  let player = { ...state.players[playerId] }
  const sourceIdx = findFieldIndex(player, sourceId)
  if (sourceIdx < 0) return state
  const source = player.field[sourceIdx]!
  if (!isRyukaCard(source.cardId)) return state

  const handIdx = findHandIndex(player, handInstanceId)
  if (handIdx < 0) return state
  const discarded = player.hand[handIdx]
  const hand = [...player.hand]
  hand.splice(handIdx, 1)
  const field = [...player.field]
  // Mark OPT used on first discard so the activation is committed
  field[sourceIdx] = { ...source, effectUsed: true }
  player = {
    ...player,
    hand,
    field,
  }
  let players = depositToOwnerGy(
    { ...state.players, [playerId]: player },
    { ...discarded, faceDown: false },
    playerId,
  )
  player = players[playerId]
  discardLeft -= 1

  let next: GameState = {
    ...state,
    players,
    selectedCardId: getCard(discarded.cardId).id,
  }
  next = log(
    next,
    `ริวกะทิ้ง ${getCard(discarded.cardId).nameTh} (เหลือทิ้ง ${discardLeft})`,
  )

  if (discardLeft > 0) {
    next = {
      ...next,
      interaction: {
        type: 'ryuka_fetch',
        sourceId,
        ownerId: playerId,
        step: 'discard',
        discardLeft,
      },
    }
    return next
  }

  const stillHasKata = player.graveyard.some((c) => isKataSpellOrTrap(c.cardId))
  if (!stillHasKata) {
    next = { ...next, interaction: { type: 'idle' } }
    next = log(next, `ริวกะ — ไม่มี「คาถา」ในสุสาน`)
    return next
  }

  next = {
    ...next,
    interaction: {
      type: 'ryuka_fetch',
      sourceId,
      ownerId: playerId,
      step: 'fetch',
    },
  }
  next = log(next, `ริวกะ — เลือก「คาถา」จากสุสานขึ้นมือ`)
  return next
}

export function pickRyukaFetch(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): GameState {
  if (state.interaction.type !== 'ryuka_fetch') return state
  if (state.interaction.step !== 'fetch') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state

  const { sourceId } = state.interaction
  let player = { ...state.players[playerId] }
  const sourceIdx = findFieldIndex(player, sourceId)
  if (sourceIdx < 0) return state
  const source = player.field[sourceIdx]!
  if (!isRyukaCard(source.cardId)) return state

  const gyIdx = player.graveyard.findIndex((c) => c.instanceId === instanceId)
  if (gyIdx < 0) return state
  const fetched = player.graveyard[gyIdx]
  if (!isKataSpellOrTrap(fetched.cardId)) return state

  const graveyard = [...player.graveyard]
  graveyard.splice(gyIdx, 1)
  const toHand: CardInstance = { ...fetched, faceDown: false }
  const def = getCard(toHand.cardId)
  const echoNames = [...(player.ryukaEchoNames ?? [])]
  if (!echoNames.includes(def.nameTh)) echoNames.push(def.nameTh)

  player = {
    ...player,
    graveyard,
    hand: [...player.hand, toHand],
    ryukaEchoNames: echoNames,
  }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `ริวกะนำ ${def.nameTh} จากสุสานขึ้นมือ — เปิดใช้「${def.nameTh}」เทิร์นนี้ทำผล 2 รอบ`,
  )
  return enforceHandLimit(next, playerId)
}

export function pickRyukaSleep(
  state: GameState,
  playerId: PlayerId,
  monsterInstanceId: string,
): GameState {
  if (state.interaction.type !== 'ryuka_sleep') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const oppId = otherPlayer(playerId)
  let opponent = { ...state.players[oppId] }
  const mIdx = findFieldIndex(opponent, monsterInstanceId)
  if (mIdx < 0) return state
  const target = opponent.field[mIdx]!

  const field = [...opponent.field]
  field[mIdx] = {
    ...target,
    asleepUntil: oppId,
    canAttack: false,
    hasAttacked: true,
  }
  opponent = { ...opponent, field }

  const targetDef = getCard(target.cardId)
  let next: GameState = {
    ...state,
    players: { ...state.players, [oppId]: opponent },
    interaction: { type: 'idle' },
    selectedCardId: targetDef.id,
  }
  next = log(
    next,
    `ริวกะ — ${targetDef.nameTh} นอนและไม่ตื่นจนกว่าจะจบเทิร์นของ ${opponent.name}`,
  )
  return settleAfterKataResolution(next, playerId)
}

export function cancelRyukaSleep(state: GameState): GameState {
  if (state.interaction.type !== 'ryuka_sleep') return state
  return settleAfterKataResolution(
    { ...state, interaction: { type: 'idle' } },
    state.interaction.ownerId,
  )
}

export function canActivateZeeka(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.activePlayer !== playerId) return false
  if (state.phase !== 'main1' && state.phase !== 'main2') return false
  if (state.interaction.type !== 'idle') return false

  const player = state.players[playerId]
  const idx = findFieldIndex(player, instanceId)
  if (idx < 0) return false
  const mon = player.field[idx]!
  if (!isZeekaCard(mon.cardId)) return false
  const kataN = countKataInGy(player)
  if (kataN < 3) return false
  const maxUses = zeekaAtkUsesPerTurn(player)
  return (mon.effectUses ?? 0) < maxUses
}

export function activateZeekaAtk(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  opts?: { skipIntercept?: boolean },
): GameState {
  if (!canActivateZeeka(state, playerId, sourceId)) return state
  if (!opts?.skipIntercept) {
    const blocked = maybeInterceptMonsterEffect(
      state,
      playerId,
      sourceId,
      'zeeka_mage',
    )
    if (blocked) return blocked
  }

  let player = { ...state.players[playerId] }
  const idx = findFieldIndex(player, sourceId)
  if (idx < 0) return state
  const mon = player.field[idx]!
  const kataN = countKataInGy(player)
  const prevBonus = mon.zeekaAtkBonus ?? 0
  const nextBonus = prevBonus + kataN
  const field = [...player.field]
  field[idx] = {
    ...mon,
    // Dedicated stack so other atkMod writes cannot wipe Zeeka's permanent gains
    zeekaAtkBonus: nextBonus,
    effectUses: (mon.effectUses ?? 0) + 1,
  }
  player = { ...player, field }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
    selectedCardId: getCard(mon.cardId).id,
  }
  const atk = getEffectiveAtk(next, playerId, mon.cardId, mon.instanceId)
  const usesLeft =
    zeekaAtkUsesPerTurn(player) - (field[idx]!.effectUses ?? 0)
  next = log(
    next,
    `จอมเวทย์ ซีก้า — ATK +${kataN} จาก「คาถา」ในสุสาน (สะสม ${prevBonus} → ${nextBonus}) → ${atk}${
      usesLeft > 0 ? ` (ใช้ได้อีก ${usesLeft} ครั้งเทิร์นนี้)` : ''
    }`,
  )
  return next
}

export function pickZeekaDebuff(
  state: GameState,
  playerId: PlayerId,
  monsterInstanceId: string,
): GameState {
  if (state.interaction.type !== 'zeeka_debuff') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const oppId = otherPlayer(playerId)
  let player = { ...state.players[playerId] }
  let opponent = { ...state.players[oppId] }
  const tIdx = findFieldIndex(opponent, monsterInstanceId)
  if (tIdx < 0) return state

  const kataN = Math.max(1, countKataInGy(player))
  const target = opponent.field[tIdx]!
  const targetDef = getCard(target.cardId)
  const oppField = [...opponent.field]
  oppField[tIdx] = { ...target, atkMod: (target.atkMod ?? 0) - kataN }
  opponent = { ...opponent, field: oppField }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player, [oppId]: opponent },
    interaction: { type: 'idle' },
    selectedCardId: targetDef.id,
  }
  const atk = getEffectiveAtk(next, oppId, target.cardId, target.instanceId)
  next = log(
    next,
    `จอมเวทย์ ซีก้า — ${targetDef.nameTh} ATK −${kataN} → ${atk}`,
  )

  if (atk <= 0) {
    const doomed = opponent.field[tIdx]!
    const cleared = [...opponent.field]
    cleared[tIdx] = null
    opponent = { ...opponent, field: cleared }
    const destroyed = afterMonsterDestroyed(opponent, doomed)
    opponent = destroyed.player
    const players = depositToOwnerGy(
      { ...next.players, [oppId]: opponent },
      { ...doomed, faceDown: false },
      oppId,
    )
    next = { ...next, players }
    next = log(next, `${targetDef.nameTh} ATK เป็น 0 — ถูกทำลาย!`)
    if (destroyed.note) next = log(next, destroyed.note)
  }

  return flushAlkataTriggers(checkWinner(next))
}

export function cancelZeekaDebuff(state: GameState): GameState {
  if (state.interaction.type !== 'zeeka_debuff') return state
  return { ...state, interaction: { type: 'idle' } }
}

export function canActivateAgatha(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.activePlayer !== playerId) return false
  if (state.phase !== 'main1' && state.phase !== 'main2') return false
  if (state.interaction.type !== 'idle') return false

  const player = state.players[playerId]
  const idx = findFieldIndex(player, instanceId)
  if (idx < 0) return false
  const mon = player.field[idx]!
  if (!isAgathaCard(mon.cardId)) return false
  if (mon.effectUsed) return false

  // Must recycle from GY first — require at least one คาถา in graveyard
  return player.graveyard.some((c) => isKataSpellOrTrap(c.cardId))
}

export function beginAgathaSearch(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  opts?: { skipIntercept?: boolean },
): GameState {
  if (!canActivateAgatha(state, playerId, sourceId)) return state
  if (!opts?.skipIntercept) {
    const blocked = maybeInterceptMonsterEffect(
      state,
      playerId,
      sourceId,
      'agatha_mage',
    )
    if (blocked) return blocked
  }
  const mon =
    state.players[playerId].field[
      findFieldIndex(state.players[playerId], sourceId)
    ]!
  let next: GameState = {
    ...state,
    interaction: {
      type: 'agatha_search',
      sourceId,
      ownerId: playerId,
      step: 'gy',
    },
    selectedCardId: getCard(mon.cardId).id,
  }
  next = log(
    next,
    `จอมเวทย์ อากาธา — เลือก「คาถา」จากสุสานกลับเข้าเด็ค`,
  )
  return next
}

export function cancelAgathaSearch(state: GameState): GameState {
  if (state.interaction.type !== 'agatha_search') return state
  return { ...state, interaction: { type: 'idle' } }
}

/** Step 1: GY → deck. Step 2: deck → hand + mage buff. */
export function pickAgathaSearch(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): GameState {
  if (state.interaction.type !== 'agatha_search') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state

  const { sourceId, step } = state.interaction
  let player = { ...state.players[playerId] }
  const sourceIdx = findFieldIndex(player, sourceId)
  if (sourceIdx < 0) return state
  const source = player.field[sourceIdx]!
  if (!isAgathaCard(source.cardId)) return state
  if (source.effectUsed) return state

  if (step === 'gy') {
    const gyIdx = player.graveyard.findIndex((c) => c.instanceId === instanceId)
    if (gyIdx < 0) return state
    const card = player.graveyard[gyIdx]
    if (!isKataSpellOrTrap(card.cardId)) return state

    const graveyard = [...player.graveyard]
    graveyard.splice(gyIdx, 1)
    const deck = shuffle([...player.deck, { ...card, faceDown: false }])
    player = { ...player, graveyard, deck }

    const def = getCard(card.cardId)
    let next: GameState = {
      ...state,
      players: { ...state.players, [playerId]: player },
      interaction: {
        type: 'agatha_search',
        sourceId,
        ownerId: playerId,
        step: 'deck',
      },
      selectedCardId: def.id,
    }
    next = log(
      next,
      `อากาธาคืน ${def.nameTh} เข้าเด็ค — เลือกคาถาจากเด็คขึ้นมือ`,
    )
    return next
  }

  // step === 'deck'
  const deckIdx = player.deck.findIndex((c) => c.instanceId === instanceId)
  if (deckIdx < 0) return state
  const fetched = player.deck[deckIdx]
  if (!isKataSpellOrTrap(fetched.cardId)) return state

  const deck = [...player.deck]
  deck.splice(deckIdx, 1)
  const toHand: CardInstance = { ...fetched, faceDown: false }
  const field = player.field.map((m) => {
    if (!m) return m
    let next = m
    if (m.instanceId === sourceId) {
      next = { ...next, effectUsed: true }
    }
    if (isMage(m.cardId)) {
      next = { ...next, tempAtkMod: (next.tempAtkMod ?? 0) + 3 }
    }
    return next
  })

  player = {
    ...player,
    deck: shuffle(deck),
    hand: [...player.hand, toHand],
    field,
  }

  const def = getCard(toHand.cardId)
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `อากาธานำ ${def.nameTh} จากเด็คขึ้นมือ — จอมเวทย์ทั้งหมด ATK +3 จนจบเทิร์น`,
  )
  return enforceHandLimit(next, playerId)
}

function isNoahCard(cardId: string): boolean {
  return getCard(cardId).effectId === 'noah_mage'
}

/** Resolve a milled 「คาถา」 effect (no cost paid — Noah OPT) */
function resolveMilledKataEffect(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
): GameState {
  const def = getCard(cardId)
  let player = { ...state.players[playerId] }
  let next: GameState = state

  if (def.effectId === 'energy_charge') {
    const echo = hasRyukaEcho(player, cardId)
    const times = echo ? 2 : 1
    player = { ...player, energy: player.energy + 3 * times }
    next = {
      ...state,
      players: { ...state.players, [playerId]: player },
    }
    next = log(
      next,
      `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — พลังงาน +${3 * times} (รวม ${player.energy})${
        echo ? ' · ริวกะทำซ้ำ' : ''
      }`,
    )
    return next
  }

  if (def.effectId === 'heavenly_voice') {
    const echo = hasRyukaEcho(player, cardId)
    const times = echo ? 2 : 1
    const before = player.hand.length
    player = drawCards(player, 2 * times)
    const drawn = player.hand.length - before
    next = {
      ...state,
      players: { ...state.players, [playerId]: player },
    }
    next = log(
      next,
      `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — จั่ว ${drawn} ใบ${
        echo ? ' · ริวกะทำซ้ำ' : ''
      }`,
    )
    return enforceHandLimit(next, playerId)
  }

  if (def.effectId === 'kata_guardian') {
    if (!player.field.some((m) => m && isMage(m.cardId))) {
      next = log(
        next,
        `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — ไม่มีจอมเวทย์บนสนาม`,
      )
      return next
    }
    player = queueRyukaDouble(player, cardId)
    next = {
      ...state,
      players: { ...state.players, [playerId]: player },
      interaction: {
        type: 'guardian_pick',
        spellInstanceId: null,
        ownerId: playerId,
      },
    }
    next = log(
      next,
      `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — เลือกจอมเวทย์เพื่อล็อก`,
    )
    return next
  }

  if (def.effectId === 'kata_prepare') {
    if (!canAddSpellTrap(player)) {
      next = log(
        next,
        `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — โซนเวทย์เต็ม`,
      )
      return next
    }
    let gyIdx = -1
    for (let i = player.graveyard.length - 1; i >= 0; i--) {
      if (player.graveyard[i].cardId === cardId) {
        gyIdx = i
        break
      }
    }
    if (gyIdx < 0) return next
    const fromGy = player.graveyard[gyIdx]
    const graveyard = [...player.graveyard]
    graveyard.splice(gyIdx, 1)
    const echo = hasRyukaEcho(player, cardId)
    const turns = echo ? 6 : 3
    player = {
      ...player,
      graveyard,
      spellTrap: [
        ...player.spellTrap,
        {
          ...fromGy,
          faceDown: false,
          continuousTurnsLeft: turns,
        },
      ],
    }
    next = {
      ...state,
      players: { ...state.players, [playerId]: player },
    }
    next = log(
      next,
      `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — วางเป็นเวทย์ต่อเนื่อง (เหลือ ${turns} เทิร์นของเรา)${
        echo ? ' · ริวกะทำซ้ำ' : ''
      }`,
    )
    return next
  }

  if (def.effectId === 'kata_buddy') {
    const mages = player.field.filter((m) => m && isMage(m.cardId))
    if (mages.length < 2) {
      next = log(
        next,
        `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — จอมเวทย์ไม่ครบ 2 ตัว`,
      )
      return next
    }
    player = queueRyukaDouble(player, cardId)
    next = {
      ...state,
      players: { ...state.players, [playerId]: player },
      interaction: {
        type: 'buddy_pick',
        spellInstanceId: null,
        ownerId: playerId,
      },
    }
    next = log(
      next,
      `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — เลือกจอมเวทย์ 2 ตัวเพื่อรวมพลัง`,
    )
    return next
  }

  if (def.effectId === 'kata_hypnosis') {
    const opp = state.players[otherPlayer(playerId)]
    if (opp.field.filter((m) => m !== null).length < 2) {
      next = log(
        next,
        `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — มอนสเตอร์ฝ่ายตรงข้ามไม่ครบ 2 ตัว`,
      )
      return next
    }
    player = queueRyukaDouble(player, cardId)
    next = {
      ...state,
      players: { ...state.players, [playerId]: player },
      interaction: {
        type: 'hypnosis_pick',
        spellInstanceId: null,
        ownerId: playerId,
      },
    }
    next = log(
      next,
      `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — เลือกมอนสเตอร์ฝ่ายตรงข้าม 2 ตัวให้ต่อสู้กัน`,
    )
    return next
  }

  if (def.effectId === 'kata_blink') {
    if (!player.field.some((z) => z === null)) {
      next = log(
        next,
        `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — ไม่มีโซนว่าง`,
      )
      return next
    }
    const hasMage =
      player.deck.some(
        (c) => isMage(c.cardId) && canFreePlaceMonster(state, playerId, c.cardId),
      ) ||
      player.graveyard.some(
        (c) => isMage(c.cardId) && canFreePlaceMonster(state, playerId, c.cardId),
      )
    if (!hasMage) {
      next = log(
        next,
        `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — ไม่มีจอมเวทย์ในเด็ค/สุสาน`,
      )
      return next
    }
    player = queueRyukaDouble(player, cardId)
    next = {
      ...state,
      players: { ...state.players, [playerId]: player },
      interaction: {
        type: 'teleport_pick',
        spellInstanceId: null,
        ownerId: playerId,
      },
    }
    next = log(
      next,
      `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา) — เลือกจอมเวทย์จากเด็คหรือสุสานเพื่ออัญเชิญ`,
    )
    return next
  }

  // Traps / complex spells: milled as “used” for kata triggers only
  next = log(
    next,
    `${player.name} ใช้ ${def.nameTh} จากเด็ค (โนอา)${
      def.type === 'trap' ? ' — กับดักไม่มีเป้าหมายในตอนนี้' : ''
    }`,
  )
  return next
}

export function canActivateNoah(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.activePlayer !== playerId) return false
  if (state.phase !== 'main1' && state.phase !== 'main2') return false
  if (state.interaction.type !== 'idle') return false

  const player = state.players[playerId]
  const idx = findFieldIndex(player, instanceId)
  if (idx < 0) return false
  const mon = player.field[idx]!
  if (!isNoahCard(mon.cardId)) return false
  if (mon.effectUsed) return false

  return player.deck.some((c) => isKataSpellOrTrap(c.cardId))
}

export function beginNoahMill(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  opts?: { skipIntercept?: boolean },
): GameState {
  if (!canActivateNoah(state, playerId, sourceId)) return state
  if (!opts?.skipIntercept) {
    const blocked = maybeInterceptMonsterEffect(
      state,
      playerId,
      sourceId,
      'noah_mage',
    )
    if (blocked) return blocked
  }
  const mon =
    state.players[playerId].field[
      findFieldIndex(state.players[playerId], sourceId)
    ]!
  let next: GameState = {
    ...state,
    interaction: { type: 'noah_mill', sourceId, ownerId: playerId },
    selectedCardId: getCard(mon.cardId).id,
  }
  next = log(
    next,
    `จอมเวทย์ โนอา — เลือก「คาถา」จากเด็คลงสุสานเพื่อใช้ความสามารถ`,
  )
  return next
}

export function cancelNoahMill(state: GameState): GameState {
  if (state.interaction.type !== 'noah_mill') return state
  return { ...state, interaction: { type: 'idle' } }
}

export function pickNoahMill(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): GameState {
  if (state.interaction.type !== 'noah_mill') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state

  const { sourceId } = state.interaction
  let player = { ...state.players[playerId] }
  const sourceIdx = findFieldIndex(player, sourceId)
  if (sourceIdx < 0) return state
  const source = player.field[sourceIdx]!
  if (!isNoahCard(source.cardId) || source.effectUsed) return state

  const deckIdx = player.deck.findIndex((c) => c.instanceId === instanceId)
  if (deckIdx < 0) return state
  const milled = player.deck[deckIdx]
  if (!isKataSpellOrTrap(milled.cardId)) return state

  const deck = [...player.deck]
  deck.splice(deckIdx, 1)
  const field = [...player.field]
  field[sourceIdx] = { ...source, effectUsed: true }
  player = {
    ...player,
    deck: shuffle(deck),
    field,
    graveyard: [...player.graveyard, { ...milled, faceDown: false }],
  }

  const def = getCard(milled.cardId)
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(next, `โนอาส่ง ${def.nameTh} จากเด็คลงสุสาน`)
  next = resolveMilledKataEffect(next, playerId, milled.cardId)
  next = afterKataActivated(next, playerId, milled.cardId)
  if (next.interaction.type === 'idle') {
    next = settleAfterKataResolution(next, playerId)
  }
  return checkWinner(next)
}

export function pickGuardianTarget(
  state: GameState,
  playerId: PlayerId,
  monsterInstanceId: string,
): GameState {
  if (state.interaction.type !== 'guardian_pick') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const { spellInstanceId } = state.interaction
  let player = { ...state.players[playerId] }
  const mIdx = findFieldIndex(player, monsterInstanceId)
  if (mIdx < 0) return state
  const target = player.field[mIdx]!
  if (!isMage(target.cardId)) return state

  const lockUntil = otherPlayer(playerId)
  const field = [...player.field]
  field[mIdx] = { ...target, battleShieldUntil: lockUntil }

  let spellNote = ''
  if (spellInstanceId) {
    const stIdx = findSpellTrapIndex(player, spellInstanceId)
    if (stIdx < 0) return state
    const spellCard = player.spellTrap[stIdx]
    const spellTrap = [...player.spellTrap]
    spellTrap.splice(stIdx, 1)
    player = {
      ...player,
      field,
      spellTrap,
      graveyard: [...player.graveyard, { ...spellCard, faceDown: false }],
    }
    spellNote = getCard(spellCard.cardId).nameTh
  } else {
    player = { ...player, field }
    spellNote = 'คาถาผู้ป้องกัน'
  }

  const targetDef = getCard(target.cardId)
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
    selectedCardId: targetDef.id,
  }
  next = log(
    next,
    `${spellNote} — ${targetDef.nameTh} ได้โล่รอดจากการต่อสู้ 1 ครั้ง จนจบเทิร์นของ ${state.players[lockUntil].name}`,
  )
  return settleAfterKataResolution(next, playerId)
}

export function cancelGuardianPick(state: GameState): GameState {
  if (state.interaction.type !== 'guardian_pick') return state
  const { spellInstanceId, ownerId } = state.interaction
  if (!spellInstanceId) {
    return settleAfterKataResolution(
      { ...state, interaction: { type: 'idle' } },
      ownerId,
    )
  }
  // Refund: leave spell on ST and go idle — player already paid; send to GY without effect
  let player = { ...state.players[ownerId] }
  const stIdx = findSpellTrapIndex(player, spellInstanceId)
  if (stIdx >= 0) {
    const spellCard = player.spellTrap[stIdx]
    const spellTrap = [...player.spellTrap]
    spellTrap.splice(stIdx, 1)
    player = {
      ...player,
      spellTrap,
      graveyard: [...player.graveyard, { ...spellCard, faceDown: false }],
    }
  }
  let next: GameState = {
    ...state,
    players: { ...state.players, [ownerId]: player },
    interaction: { type: 'idle' },
  }
  next = log(next, `ยกเลิกคาถาผู้ป้องกัน`)
  return next
}

function finishBuddySpellToGy(
  player: PlayerState,
  spellInstanceId: string | null,
): { player: PlayerState; spellNote: string } {
  if (!spellInstanceId) {
    return { player, spellNote: 'คาถาคู่หู' }
  }
  const stIdx = findSpellTrapIndex(player, spellInstanceId)
  if (stIdx < 0) return { player, spellNote: 'คาถาคู่หู' }
  const spellCard = player.spellTrap[stIdx]
  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)
  return {
    player: {
      ...player,
      spellTrap,
      graveyard: [...player.graveyard, { ...spellCard, faceDown: false }],
    },
    spellNote: getCard(spellCard.cardId).nameTh,
  }
}

export function pickBuddyTarget(
  state: GameState,
  playerId: PlayerId,
  monsterInstanceId: string,
): GameState {
  if (state.interaction.type !== 'buddy_pick') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const { spellInstanceId, firstId } = state.interaction
  const player = state.players[playerId]
  const mIdx = findFieldIndex(player, monsterInstanceId)
  if (mIdx < 0) return state
  const target = player.field[mIdx]!
  if (!isMage(target.cardId)) return state

  // First pick — wait for second
  if (!firstId) {
    let next: GameState = {
      ...state,
      interaction: {
        type: 'buddy_pick',
        spellInstanceId,
        ownerId: playerId,
        firstId: monsterInstanceId,
      },
      selectedCardId: getCard(target.cardId).id,
    }
    next = log(
      next,
      `คาถาคู่หู — เลือก ${getCard(target.cardId).nameTh} เป็นตัวแรก · เลือกจอมเวทย์ตัวที่สอง`,
    )
    return next
  }

  if (monsterInstanceId === firstId) return state

  const firstIdx = findFieldIndex(player, firstId)
  if (firstIdx < 0) return state
  const first = player.field[firstIdx]!
  if (!isMage(first.cardId)) return state

  const atkA = getEffectiveAtk(state, playerId, first.cardId, first.instanceId)
  const atkB = getEffectiveAtk(state, playerId, target.cardId, target.instanceId)
  const combined = atkA + atkB

  const field = [...player.field]
  const nonTempA = atkA - (first.tempAtkMod ?? 0)
  const nonTempB = atkB - (target.tempAtkMod ?? 0)
  field[firstIdx] = {
    ...first,
    tempAtkMod: combined - nonTempA,
  }
  field[mIdx] = {
    ...target,
    tempAtkMod: combined - nonTempB,
  }

  let nextPlayer: PlayerState = { ...player, field }
  const finished = finishBuddySpellToGy(nextPlayer, spellInstanceId)
  nextPlayer = finished.player

  const nameA = getCard(first.cardId).nameTh
  const nameB = getCard(target.cardId).nameTh
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: nextPlayer },
    interaction: { type: 'idle' },
    selectedCardId: getCard(target.cardId).id,
  }
  next = log(
    next,
    `${finished.spellNote} — ${nameA} (${atkA}) + ${nameB} (${atkB}) = ${combined} · ทั้งสองตัว ATK เป็น ${combined} จนจบเทิร์น`,
  )
  return settleAfterKataResolution(next, playerId)
}

export function cancelBuddyPick(state: GameState): GameState {
  if (state.interaction.type !== 'buddy_pick') return state
  const { spellInstanceId, ownerId } = state.interaction
  if (!spellInstanceId) {
    return settleAfterKataResolution(
      { ...state, interaction: { type: 'idle' } },
      ownerId,
    )
  }
  let player = { ...state.players[ownerId] }
  const finished = finishBuddySpellToGy(player, spellInstanceId)
  player = finished.player
  let next: GameState = {
    ...state,
    players: { ...state.players, [ownerId]: player },
    interaction: { type: 'idle' },
  }
  next = log(next, `ยกเลิก ${finished.spellNote}`)
  return settleAfterKataResolution(next, ownerId)
}

function finishHypnosisSpellToGy(
  player: PlayerState,
  spellInstanceId: string | null,
): { player: PlayerState; spellNote: string } {
  if (!spellInstanceId) {
    return { player, spellNote: 'คาถาสะกดจิต' }
  }
  const stIdx = findSpellTrapIndex(player, spellInstanceId)
  if (stIdx < 0) return { player, spellNote: 'คาถาสะกดจิต' }
  const spellCard = player.spellTrap[stIdx]
  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)
  return {
    player: {
      ...player,
      spellTrap,
      graveyard: [...player.graveyard, { ...spellCard, faceDown: false }],
    },
    spellNote: getCard(spellCard.cardId).nameTh,
  }
}

/** Force two monsters on the same controller's field to clash by ATK */
function resolveSameSideClash(
  state: GameState,
  controllerId: PlayerId,
  aInstanceId: string,
  bInstanceId: string,
): {
  state: GameState
  bothDestroyed: boolean
  note: string
} {
  let controller = { ...state.players[controllerId] }
  const aIdx = findFieldIndex(controller, aInstanceId)
  const bIdx = findFieldIndex(controller, bInstanceId)
  if (aIdx < 0 || bIdx < 0) {
    return { state, bothDestroyed: false, note: '' }
  }

  const monA = controller.field[aIdx]!
  const monB = controller.field[bIdx]!
  const defA = getCard(monA.cardId)
  const defB = getCard(monB.cardId)
  const atkA = getEffectiveAtk(state, controllerId, monA.cardId, monA.instanceId)
  const atkB = getEffectiveAtk(state, controllerId, monB.cardId, monB.instanceId)

  const field = [...controller.field]
  let destroyedA = false
  let destroyedB = false
  const destroyNotes: string[] = []
  let shieldNotes: string[] = []
  let players: GameState['players'] = {
    ...state.players,
    [controllerId]: controller,
  }

  const tryDestroy = (idx: number, mon: CardInstance): boolean => {
    if (hasBattleShield(mon)) {
      field[idx] = consumeBattleShield(mon)
      controller = { ...controller, field: [...field] }
      players = { ...players, [controllerId]: controller }
      shieldNotes.push(
        `${getCard(mon.cardId).nameTh} ใช้โล่คาถาผู้ป้องกัน — รอดจากการต่อสู้`,
      )
      return false
    }
    field[idx] = null
    let p: PlayerState = {
      ...controller,
      field: [...field],
    }
    const res = afterMonsterDestroyed(p, mon)
    p = res.player
    // Preserve nulls we already set
    const nf = [...p.field]
    for (let i = 0; i < field.length; i++) {
      if (field[i] === null) nf[i] = null
    }
    controller = { ...p, field: nf }
    for (let i = 0; i < field.length; i++) field[i] = nf[i] ?? null
    players = { ...players, [controllerId]: controller }
    players = depositToOwnerGy(players, { ...mon, faceDown: false }, controllerId)
    controller = players[controllerId]
    if (res.note) destroyNotes.push(res.note)
    return true
  }

  if (atkA > atkB) {
    destroyedB = tryDestroy(bIdx, monB)
  } else if (atkB > atkA) {
    destroyedA = tryDestroy(aIdx, monA)
  } else {
    destroyedA = tryDestroy(aIdx, monA)
    destroyedB = tryDestroy(bIdx, monB)
  }

  const bothDestroyed = destroyedA && destroyedB

  let note = `${defA.nameTh} (${atkA}) vs ${defB.nameTh} (${atkB})`
  if (atkA > atkB) {
    note += destroyedB
      ? ` — ทำลาย ${defB.nameTh}`
      : ` — ${defB.nameTh} รอดด้วยโล่`
  } else if (atkB > atkA) {
    note += destroyedA
      ? ` — ทำลาย ${defA.nameTh}`
      : ` — ${defA.nameTh} รอดด้วยโล่`
  } else {
    const parts: string[] = []
    if (destroyedA) parts.push(`ทำลาย ${defA.nameTh}`)
    else parts.push(`${defA.nameTh} รอดด้วยโล่`)
    if (destroyedB) parts.push(`ทำลาย ${defB.nameTh}`)
    else parts.push(`${defB.nameTh} รอดด้วยโล่`)
    note += ` — พลังเท่ากัน · ${parts.join(' · ')}`
  }

  let next: GameState = {
    ...state,
    players: { ...players, [controllerId]: controller },
    interaction: { type: 'idle' },
  }
  for (const n of destroyNotes) next = log(next, n)
  for (const n of shieldNotes) next = log(next, n)

  return { state: next, bothDestroyed, note }
}

export function pickHypnosisTarget(
  state: GameState,
  playerId: PlayerId,
  monsterInstanceId: string,
): GameState {
  if (state.interaction.type !== 'hypnosis_pick') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const { spellInstanceId, firstId } = state.interaction
  const oppId = otherPlayer(playerId)
  const opp = state.players[oppId]
  const mIdx = findFieldIndex(opp, monsterInstanceId)
  if (mIdx < 0) return state
  const target = opp.field[mIdx]!

  if (!firstId) {
    let next: GameState = {
      ...state,
      interaction: {
        type: 'hypnosis_pick',
        spellInstanceId,
        ownerId: playerId,
        firstId: monsterInstanceId,
      },
      selectedCardId: getCard(target.cardId).id,
    }
    next = log(
      next,
      `คาถาสะกดจิต — เลือก ${getCard(target.cardId).nameTh} เป็นตัวแรก · เลือกตัวที่สอง`,
    )
    return next
  }

  if (monsterInstanceId === firstId) return state
  const firstIdx = findFieldIndex(opp, firstId)
  if (firstIdx < 0) return state

  const clash = resolveSameSideClash(state, oppId, firstId, monsterInstanceId)
  let next = clash.state
  let player = { ...next.players[playerId] }
  const finished = finishHypnosisSpellToGy(player, spellInstanceId)
  player = finished.player
  next = {
    ...next,
    players: { ...next.players, [playerId]: player },
    interaction: { type: 'idle' },
  }
  next = log(next, `${finished.spellNote} — ${clash.note}`)

  if (clash.bothDestroyed) {
    const before = player.hand.length
    player = drawCards(player, 1)
    const drawn = player.hand.length - before
    next = {
      ...next,
      players: { ...next.players, [playerId]: player },
    }
    if (drawn > 0) {
      next = log(
        next,
        `${finished.spellNote} — ทั้งสองถูกทำลาย · จั่ว ${drawn} ใบ`,
      )
      next = enforceHandLimit(next, playerId)
    }
  }

  return settleAfterKataResolution(next, playerId)
}

export function cancelHypnosisPick(state: GameState): GameState {
  if (state.interaction.type !== 'hypnosis_pick') return state
  const { spellInstanceId, ownerId } = state.interaction
  if (!spellInstanceId) {
    return settleAfterKataResolution(
      { ...state, interaction: { type: 'idle' } },
      ownerId,
    )
  }
  let player = { ...state.players[ownerId] }
  const finished = finishHypnosisSpellToGy(player, spellInstanceId)
  player = finished.player
  let next: GameState = {
    ...state,
    players: { ...state.players, [ownerId]: player },
    interaction: { type: 'idle' },
  }
  next = log(next, `ยกเลิก ${finished.spellNote}`)
  return settleAfterKataResolution(next, ownerId)
}

function finishBlinkSpellToGy(
  player: PlayerState,
  spellInstanceId: string | null,
): { player: PlayerState; spellNote: string } {
  if (!spellInstanceId) {
    return { player, spellNote: 'คาถาย้ายฉับพลัน' }
  }
  const stIdx = findSpellTrapIndex(player, spellInstanceId)
  if (stIdx < 0) return { player, spellNote: 'คาถาย้ายฉับพลัน' }
  const spellCard = player.spellTrap[stIdx]
  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)
  return {
    player: {
      ...player,
      spellTrap,
      graveyard: [...player.graveyard, { ...spellCard, faceDown: false }],
    },
    spellNote: getCard(spellCard.cardId).nameTh,
  }
}

/** Blink Incantation — special summon a mage from deck or GY */
export function pickTeleportSummon(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  from: 'deck' | 'graveyard',
): GameState {
  if (state.interaction.type !== 'teleport_pick') return state
  if (state.interaction.ownerId !== playerId) return state
  if (state.activePlayer !== playerId) return state
  if (state.winner) return state

  const { spellInstanceId } = state.interaction
  let player = { ...state.players[playerId] }

  let fetched: CardInstance | null = null
  if (from === 'deck') {
    const deckIdx = player.deck.findIndex((c) => c.instanceId === instanceId)
    if (deckIdx < 0) return state
    fetched = player.deck[deckIdx]
    if (!isMage(fetched.cardId)) return state
    if (!canFreePlaceMonster(state, playerId, fetched.cardId)) return state
    const deck = [...player.deck]
    deck.splice(deckIdx, 1)
    player = { ...player, deck: shuffle(deck) }
  } else {
    const gyIdx = player.graveyard.findIndex((c) => c.instanceId === instanceId)
    if (gyIdx < 0) return state
    fetched = player.graveyard[gyIdx]
    if (!isMage(fetched.cardId)) return state
    if (!canFreePlaceMonster(state, playerId, fetched.cardId)) return state
    const graveyard = [...player.graveyard]
    graveyard.splice(gyIdx, 1)
    player = { ...player, graveyard }
  }

  const zone = player.field.findIndex((z) => z === null)
  if (zone < 0) return state

  const summoned = resetForSummon(fetched, state.turn)
  const field = [...player.field]
  field[zone] = summoned
  player = { ...player, field }

  const finished = finishBlinkSpellToGy(player, spellInstanceId)
  player = finished.player

  const oppId = otherPlayer(playerId)
  const def = getCard(summoned.cardId)
  const trig = applySummonTriggers(player, state.players[oppId], def.id)
  player = trig.player

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: player,
      [oppId]: trig.opponent,
    },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `${finished.spellNote} — อัญเชิญ ${def.nameTh} จาก${from === 'deck' ? 'เด็ค' : 'สุสาน'} โซน ${zone + 1}`,
  )
  if (trig.note) next = log(next, trig.note)

  next = afterSummonEffects(next, playerId, def.id, summoned.instanceId)
  if (next.interaction.type !== 'idle') return next
  return settleAfterKataResolution(checkWinner(next), playerId)
}

export function cancelTeleportPick(state: GameState): GameState {
  if (state.interaction.type !== 'teleport_pick') return state
  const { spellInstanceId, ownerId } = state.interaction
  if (!spellInstanceId) {
    return settleAfterKataResolution(
      { ...state, interaction: { type: 'idle' } },
      ownerId,
    )
  }
  let player = { ...state.players[ownerId] }
  const finished = finishBlinkSpellToGy(player, spellInstanceId)
  player = finished.player
  let next: GameState = {
    ...state,
    players: { ...state.players, [ownerId]: player },
    interaction: { type: 'idle' },
  }
  next = log(next, `ยกเลิก ${finished.spellNote}`)
  return settleAfterKataResolution(next, ownerId)
}

/** Warrior summon during Call Reinforcements — pay HP instead of energy */
export function canReinforceSummon(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  if (state.winner) return false
  if (state.activePlayer !== playerId) return false
  if (state.interaction.type !== 'reinforce') return false
  if (state.interaction.summonsLeft <= 0) return false

  const player = state.players[playerId]
  const idx = findHandIndex(player, instanceId)
  if (idx < 0) return false
  const def = getCard(player.hand[idx].cardId)
  if (def.type !== 'monster' || def.tribe !== 'warrior') return false
  if (player.hp < def.cost) return false

  if (def.effectId === 'scout_unit') {
    if (!player.field.some((z) => z === null)) return false
    const opp = state.players[otherPlayer(playerId)]
    if (!opp.field.some((z) => z === null)) return false
  } else if (!player.field.some((z) => z === null)) {
    return false
  }

  if (def.effectId === 'frontline_warrior' || def.effectId === 'support_unit') {
    if (player.field.some((m) => m && getCard(m.cardId).effectId === def.effectId)) {
      return false
    }
  }
  return true
}

export function reinforceSummon(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  zoneIndex?: number,
): GameState {
  if (!canReinforceSummon(state, playerId, instanceId)) return state
  if (state.interaction.type !== 'reinforce') return state

  let player = { ...state.players[playerId] }
  const handIdx = findHandIndex(player, instanceId)
  const card = player.hand[handIdx]
  const def = getCard(card.cardId)

  const hand = [...player.hand]
  hand.splice(handIdx, 1)

  const summoned: CardInstance = resetForSummon(card, state.turn)

  // Pay summon cost with HP (not energy; not combat damage → no energy gain)
  player = {
    ...player,
    hand,
    hp: player.hp - def.cost,
  }

  let next: GameState

  if (def.effectId === 'scout_unit') {
    let zone = zoneIndex
    if (zone === undefined || player.field[zone] !== null) {
      zone = player.field.findIndex((z) => z === null)
    }
    if (zone < 0) return state

    const oppId = otherPlayer(playerId)
    let opponent = { ...state.players[oppId] }
    const oppZone = opponent.field.findIndex((z) => z === null)
    if (oppZone < 0) return state

    const ourField = [...player.field]
    ourField[zone] = summoned
    player = { ...player, field: ourField }

    const oppField = [...opponent.field]
    oppField[oppZone] = { ...summoned }
    ourField[zone] = null
    player = { ...player, field: ourField }
    opponent = { ...opponent, field: oppField }

    next = {
      ...state,
      players: { ...state.players, [playerId]: player, [oppId]: opponent },
      selectedCardId: def.id,
    }
    next = log(
      next,
      `${player.name} อัญเชิญ ${def.nameTh} ด้วย HP (−${def.cost}) โซน ${zone + 1} — เปลี่ยนฝั่งไป ${opponent.name}`,
    )
  } else {
    let zone = zoneIndex
    if (zone === undefined || player.field[zone] !== null) {
      zone = player.field.findIndex((z) => z === null)
    }
    if (zone < 0) return state
    const field = [...player.field]
    field[zone] = summoned
    player = { ...player, field }
    const oppId = otherPlayer(playerId)
    const trig = applySummonTriggers(
      player,
      state.players[oppId],
      def.id,
    )
    player = trig.player
    next = {
      ...state,
      players: {
        ...state.players,
        [playerId]: player,
        [oppId]: trig.opponent,
      },
      selectedCardId: def.id,
    }
    next = log(
      next,
      `${player.name} อัญเชิญ ${def.nameTh} ด้วย HP (−${def.cost}) โซน ${zone + 1} (HP ${player.hp})`,
    )
    if (trig.note) next = log(next, trig.note)
  }

  const left = state.interaction.summonsLeft - 1
  const stillPossible = next.players[playerId].hand.some((c) =>
    canReinforceSummon(
      { ...next, interaction: { type: 'reinforce', summonsLeft: left } },
      playerId,
      c.instanceId,
    ),
  )

  if (left <= 0 || !stillPossible) {
    next = {
      ...next,
      interaction: { type: 'idle' },
    }
    next = log(next, `${player.name} จบการอัญเชิญจากขอกำลังเสริม`)
  } else {
    next = {
      ...next,
      interaction: { type: 'reinforce', summonsLeft: left },
    }
  }

  next = checkWinner(next)
  // Sara / Mina may pause reinforce — resume after deck pick
  const resume = left > 0 && stillPossible ? left : undefined
  return afterSummonEffects(next, playerId, def.id, summoned.instanceId, resume)
}

export function endReinforce(state: GameState): GameState {
  if (state.interaction.type !== 'reinforce') return state
  const player = state.players[state.activePlayer]
  let next: GameState = { ...state, interaction: { type: 'idle' } }
  next = log(next, `${player.name} จบการอัญเชิญจากขอกำลังเสริม`)
  return next
}

/** @deprecated prefer stageSpell + resolveSpell for animated play */
export function playSpell(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  _zoneIndex?: number,
): GameState {
  const staged = stageSpell(state, playerId, instanceId)
  if (staged === state) return state
  const stagedCard = staged.players[playerId].spellTrap.at(-1)
  if (!stagedCard) return staged
  return resolveSpell(staged, playerId, stagedCard.instanceId)
}

export function canSetTrap(
  _state: GameState,
  _playerId: PlayerId,
  _instanceId: string,
): boolean {
  // Traps stay in hand and activate during response windows — no face-down set
  return false
}

export function setTrap(
  state: GameState,
  _playerId: PlayerId,
  _instanceId: string,
  _zoneIndex?: number,
): GameState {
  return state
}

export function canAttack(
  state: GameState,
  playerId: PlayerId,
  attackerId: string,
): boolean {
  if (state.winner || state.awaitingTrap) return false
  if (state.interaction.type === 'discard') return false
  if (state.activePlayer !== playerId) return false
  if (state.phase !== 'battle') return false
  // First player cannot attack on their first turn of the game
  if (state.turn === 1 && playerId === state.firstPlayer) return false

  const player = state.players[playerId]
  const idx = findFieldIndex(player, attackerId)
  if (idx < 0) return false
  const m = player.field[idx]!
  if (m.asleepUntil) return false
  if (!m.canAttack || m.hasAttacked) return false

  // Iron Wall: cannot attack without another warrior on our field
  if (getCard(m.cardId).effectId === 'iron_wall_warrior') {
    const hasOtherWarrior = player.field.some(
      (x) => !!x && x.instanceId !== m.instanceId && isWarrior(x.cardId),
    )
    if (!hasOtherWarrior) return false
  }

  return true
}

/** Trigger when a monster is destroyed and sent to GY from the field */
function afterMonsterDestroyed(
  player: PlayerState,
  destroyed: CardInstance,
): { player: PlayerState; note: string | null } {
  const def = getCard(destroyed.cardId)
  let next = noteAlkataLeft(player, destroyed)
  let note: string | null = null
  if (def.effectId === 'iron_wall_warrior') {
    next = applyDamage(next, 3)
    note = `${def.nameTh} ถูกทำลาย — ${next.name} เสีย HP 3 (พลังงาน +3)`
  }
  return { player: next, note }
}

const ALKATA_NAME = 'เทพแห่งอัลคาทา'

export function isAlkataGod(cardId: string): boolean {
  return getCard(cardId).nameTh.includes(ALKATA_NAME)
}

function listAlkataInHand(player: PlayerState): CardInstance[] {
  return player.hand.filter((c) => isAlkataGod(c.cardId))
}

function listAlkataHandSummonTargets(player: PlayerState): CardInstance[] {
  const used = player.alkataHandSummonedCardIdsThisTurn ?? []
  return listAlkataInHand(player).filter((c) => !used.includes(c.cardId))
}

function listAlkataInGy(player: PlayerState): CardInstance[] {
  return player.graveyard.filter((c) => isAlkataGod(c.cardId))
}

function listAlkataInDeck(player: PlayerState): CardInstance[] {
  return player.deck.filter((c) => isAlkataGod(c.cardId))
}

/** Zul search — exclude Zul itself from the deck add */
function listZulSearchTargets(player: PlayerState): CardInstance[] {
  return listAlkataInDeck(player).filter(
    (c) => getCard(c.cardId).effectId !== 'zul_alkata',
  )
}

function noteAlkataLeft(player: PlayerState, left: CardInstance): PlayerState {
  if (!isAlkataGod(left.cardId)) return player
  return {
    ...player,
    alkataHandSummonsQueued: (player.alkataHandSummonsQueued ?? 0) + 1,
  }
}

function undoAlkataLeft(player: PlayerState, left: CardInstance): PlayerState {
  if (!isAlkataGod(left.cardId)) return player
  return {
    ...player,
    alkataHandSummonsQueued: Math.max(
      0,
      (player.alkataHandSummonsQueued ?? 0) - 1,
    ),
  }
}

function consumeAlkataQueue(
  player: PlayerState,
  kind: 'hand' | 'gy',
): PlayerState {
  if (kind === 'hand') {
    return {
      ...player,
      alkataHandSummonsQueued: Math.max(
        0,
        (player.alkataHandSummonsQueued ?? 0) - 1,
      ),
    }
  }
  return {
    ...player,
    alkataGyRecoverQueued: Math.max(0, (player.alkataGyRecoverQueued ?? 0) - 1),
  }
}

function continueAfterAlkata(state: GameState): GameState {
  if (state.winner) return state
  if (state.interaction.type !== 'idle') return state
  if (state.phase === 'end') return endTurn(state)
  return state
}

export function flushAlkataTriggers(state: GameState): GameState {
  if (state.winner) return state
  if (state.interaction.type !== 'idle') return state

  for (const ownerId of ['player', 'opponent'] as PlayerId[]) {
    const player = state.players[ownerId]

    if ((player.alkataHandSummonsQueued ?? 0) > 0) {
      const targets = listAlkataHandSummonTargets(player)
      const can =
        targets.length > 0 && player.field.some((z) => z === null)
      if (!can) {
        state = {
          ...state,
          players: {
            ...state.players,
            [ownerId]: consumeAlkataQueue(player, 'hand'),
          },
        }
        continue
      }
      let next: GameState = {
        ...state,
        interaction: { type: 'alkata_hand_summon', ownerId },
      }
      next = log(
        next,
        `${player.name} — สั่งใช้อัญเชิญเทพแห่งอัลคาทาจากมือได้ 1 ใบ (ใบเดิมเทิร์นละครั้ง)`,
      )
      return next
    }
  }

  return state
}

export function pickAlkataGyRecover(
  state: GameState,
  playerId: PlayerId,
  gyInstanceId: string,
): GameState {
  if (state.interaction.type !== 'alkata_gy_recover') return state
  if (state.interaction.ownerId !== playerId) return state
  let player = { ...state.players[playerId] }
  const gyIdx = player.graveyard.findIndex((c) => c.instanceId === gyInstanceId)
  if (gyIdx < 0) return state
  const card = player.graveyard[gyIdx]
  if (!isAlkataGod(card.cardId)) return state

  const gy = [...player.graveyard]
  gy.splice(gyIdx, 1)
  player = consumeAlkataQueue(
    { ...player, graveyard: gy, hand: [...player.hand, resetForHand(card)] },
    'gy',
  )

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
    selectedCardId: card.cardId,
  }
  next = log(
    next,
    `${player.name} นำ ${getCard(card.cardId).nameTh} จากสุสานขึ้นมือ`,
  )
  next = enforceHandLimit(next, playerId)
  if (next.interaction.type === 'discard') return next
  return continueAfterAlkata(flushAlkataTriggers(next))
}

export function skipAlkataGyRecover(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.interaction.type !== 'alkata_gy_recover') return state
  if (state.interaction.ownerId !== playerId) return state
  const player = consumeAlkataQueue(state.players[playerId], 'gy')
  const next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
  }
  return continueAfterAlkata(flushAlkataTriggers(next))
}

export function canAlkataHandSummon(
  state: GameState,
  playerId: PlayerId,
  handInstanceId: string,
): boolean {
  if (state.interaction.type !== 'alkata_hand_summon') return false
  if (state.interaction.ownerId !== playerId) return false
  const player = state.players[playerId]
  const card = player.hand.find((c) => c.instanceId === handInstanceId)
  if (!card || !isAlkataGod(card.cardId)) return false
  const used = player.alkataHandSummonedCardIdsThisTurn ?? []
  if (used.includes(card.cardId)) return false
  return canFreePlaceMonster(state, playerId, card.cardId)
}

export function pickAlkataHandSummon(
  state: GameState,
  playerId: PlayerId,
  handInstanceId: string,
  _zoneIndex?: number,
): GameState {
  if (!canAlkataHandSummon(state, playerId, handInstanceId)) return state
  return resolveAlkataHandSummon(state, playerId, handInstanceId)
}

function resolveAlkataHandSummon(
  state: GameState,
  playerId: PlayerId,
  handInstanceId: string,
): GameState {
  let player = { ...state.players[playerId] }
  const handIdx = findHandIndex(player, handInstanceId)
  if (handIdx < 0) {
    player = consumeAlkataQueue(player, 'hand')
    const next: GameState = {
      ...state,
      players: { ...state.players, [playerId]: player },
      interaction: { type: 'idle' },
    }
    return continueAfterAlkata(flushAlkataTriggers(next))
  }
  const card = player.hand[handIdx]
  const def = getCard(card.cardId)
  if (!canFreePlaceMonster(state, playerId, card.cardId)) {
    player = consumeAlkataQueue(player, 'hand')
    let next: GameState = {
      ...state,
      players: { ...state.players, [playerId]: player },
      interaction: { type: 'idle' },
    }
    next = log(next, `อัญเชิญ ${def.nameTh} ไม่ได้ — ไม่มีโซนว่าง`)
    return continueAfterAlkata(flushAlkataTriggers(next))
  }

  const hand = [...player.hand]
  hand.splice(handIdx, 1)
  let field = [...player.field]
  const zone = field.findIndex((z) => z === null)
  if (zone < 0) return state

  const summoned = resetForSummon(card, state.turn)
  field[zone] = summoned
  const usedIds = [
    ...(player.alkataHandSummonedCardIdsThisTurn ?? []),
    card.cardId,
  ]
  player = consumeAlkataQueue(
    {
      ...player,
      hand,
      field,
      alkataHandSummonedCardIdsThisTurn: usedIds,
      alkataHandSummonUsedThisTurn: false,
    },
    'hand',
  )

  const oppId = otherPlayer(playerId)
  const trig = applySummonTriggers(player, state.players[oppId], def.id)
  player = trig.player

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: player,
      [oppId]: trig.opponent,
    },
    interaction: { type: 'idle' },
    selectedCardId: def.id,
  }
  next = log(
    next,
    `${player.name} อัญเชิญ ${def.nameTh} จากมือ (เทพแห่งอัลคาทาออกจากสนาม)`,
  )
  if (trig.note) next = log(next, trig.note)
  next = afterSummonEffects(next, playerId, def.id, summoned.instanceId)
  if (next.interaction.type !== 'idle') return next
  return continueAfterAlkata(flushAlkataTriggers(checkWinner(next)))
}

export function skipAlkataHandSummon(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.interaction.type !== 'alkata_hand_summon') return state
  if (state.interaction.ownerId !== playerId) return state
  const player = consumeAlkataQueue(state.players[playerId], 'hand')
  const next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    interaction: { type: 'idle' },
  }
  return continueAfterAlkata(flushAlkataTriggers(next))
}

function maybeStartSorunDebuff(
  state: GameState,
  playerId: PlayerId,
  summonedCardId: string,
  summonedInstanceId: string,
): GameState {
  if (getCard(summonedCardId).effectId !== 'sorun_alkata') return state
  const opp = state.players[otherPlayer(playerId)]
  if (!opp.field.some((m) => m !== null)) {
    return log(
      state,
      `${getCard(summonedCardId).nameTh} อัญเชิญ — ไม่มีมอนสเตอร์ฝ่ายตรงข้าม`,
    )
  }
  let next: GameState = {
    ...state,
    interaction: {
      type: 'alkata_debuff',
      sourceId: summonedInstanceId,
      ownerId: playerId,
    },
    selectedCardId: summonedCardId,
  }
  next = log(
    next,
    `${getCard(summonedCardId).nameTh} อัญเชิญ! เลือกมอนสเตอร์ฝ่ายตรงข้าม 1 ตัว ATK −3`,
  )
  return next
}

export function cancelAlkataDebuff(state: GameState): GameState {
  if (state.interaction.type !== 'alkata_debuff') return state
  let next: GameState = { ...state, interaction: { type: 'idle' } }
  next = log(next, 'โซรุน — ข้ามการลด ATK')
  return continueAfterAlkata(flushAlkataTriggers(next))
}

export function pickAlkataDebuff(
  state: GameState,
  playerId: PlayerId,
  targetInstanceId: string,
): GameState {
  if (state.interaction.type !== 'alkata_debuff') return state
  if (state.interaction.ownerId !== playerId) return state
  const { sourceId } = state.interaction
  const oppId = otherPlayer(playerId)
  let player = { ...state.players[playerId] }
  let opponent = { ...state.players[oppId] }

  const srcIdx = findFieldIndex(player, sourceId)
  if (srcIdx < 0) return state
  const tIdx = findFieldIndex(opponent, targetInstanceId)
  if (tIdx < 0) return state

  const target = opponent.field[tIdx]!
  const targetDef = getCard(target.cardId)
  const oppField = [...opponent.field]
  oppField[tIdx] = { ...target, atkMod: (target.atkMod ?? 0) - 3 }
  opponent = { ...opponent, field: oppField }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player, [oppId]: opponent },
    interaction: { type: 'idle' },
    selectedCardId: targetDef.id,
  }
  const atk = getEffectiveAtk(next, oppId, target.cardId, target.instanceId)
  next = log(
    next,
    `${getCard(player.field[srcIdx]!.cardId).nameTh} — ${targetDef.nameTh} ATK −3 → ${atk}`,
  )

  if (atk <= 0) {
    const doomed = opponent.field[tIdx]!
    const cleared = [...opponent.field]
    cleared[tIdx] = null
    opponent = {
      ...opponent,
      field: cleared,
    }
    const destroyed = afterMonsterDestroyed(opponent, doomed)
    opponent = destroyed.player
    const players = depositToOwnerGy(
      { ...next.players, [oppId]: opponent },
      { ...doomed, faceDown: false },
      oppId,
    )
    next = {
      ...next,
      players,
    }
    next = log(next, `${targetDef.nameTh} ATK เป็น 0 — ถูกทำลาย!`)
    if (destroyed.note) next = log(next, destroyed.note)
  }

  return flushAlkataTriggers(checkWinner(next))
}

function maybeStartSonaBuff(
  state: GameState,
  playerId: PlayerId,
  summonedCardId: string,
  summonedInstanceId: string,
): GameState {
  if (getCard(summonedCardId).effectId !== 'sona_alkata') return state
  let player = { ...state.players[playerId] }
  const srcIdx = findFieldIndex(player, summonedInstanceId)
  if (srcIdx < 0) return state

  const field = player.field.map((m) => {
    if (!m) return m
    if (!isAlkataGod(m.cardId)) return m
    return { ...m, atkMod: (m.atkMod ?? 0) + 2 }
  })
  player = { ...player, field }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    selectedCardId: summonedCardId,
  }
  next = log(
    next,
    `${getCard(summonedCardId).nameTh} อัญเชิญ — เทพแห่งอัลคาทาบนสนามเราทุกตัว ATK +2`,
  )
  return next
}

function maybeStartHokanaRecycle(
  state: GameState,
  playerId: PlayerId,
  summonedCardId: string,
  summonedInstanceId: string,
): GameState {
  if (getCard(summonedCardId).effectId !== 'hokana_alkata') return state
  const player = state.players[playerId]
  if (listAlkataInGy(player).length < HOKANA_RECYCLE_COUNT) {
    return log(
      state,
      `${getCard(summonedCardId).nameTh} อัญเชิญ — สุสานมีเทพแห่งอัลคาทาไม่พอ (${HOKANA_RECYCLE_COUNT} ใบ)`,
    )
  }
  let next: GameState = {
    ...state,
    interaction: {
      type: 'alkata_hokana_recycle',
      sourceId: summonedInstanceId,
      remaining: HOKANA_RECYCLE_COUNT,
      ownerId: playerId,
    },
    selectedCardId: summonedCardId,
  }
  next = log(
    next,
    `${getCard(summonedCardId).nameTh} อัญเชิญ! เลือกเทพแห่งอัลคาทาจากสุสานกลับเข้าเด็ค ${HOKANA_RECYCLE_COUNT} ใบ`,
  )
  return next
}

export function canActivateAlkataBuff(
  _state: GameState,
  _playerId: PlayerId,
  _instanceId: string,
): boolean {
  // Sona is on-summon only now
  return false
}

export function activateAlkataBuff(
  state: GameState,
  _playerId: PlayerId,
  _sourceId: string,
): GameState {
  return state
}

const HOKANA_RECYCLE_COUNT = 2

export function canActivateAlkataRecycle(
  _state: GameState,
  _playerId: PlayerId,
  _instanceId: string,
): boolean {
  // Hokana is on-summon only now
  return false
}

export function beginAlkataRecycle(
  state: GameState,
  _playerId: PlayerId,
  _sourceId: string,
): GameState {
  return state
}

export function cancelAlkataRecycle(state: GameState): GameState {
  if (state.interaction.type !== 'alkata_hokana_recycle') return state
  if (state.interaction.remaining < HOKANA_RECYCLE_COUNT) return state
  let next: GameState = { ...state, interaction: { type: 'idle' } }
  next = log(next, 'โฮคาน่า — ข้ามการคืนเด็ค')
  return continueAfterAlkata(flushAlkataTriggers(next))
}

export function skipAlkataRecycle(state: GameState): GameState {
  if (state.interaction.type !== 'alkata_hokana_recycle') return state
  if (state.interaction.remaining >= HOKANA_RECYCLE_COUNT) {
    return cancelAlkataRecycle(state)
  }
  let next: GameState = { ...state, interaction: { type: 'idle' } }
  return continueAfterAlkata(flushAlkataTriggers(next))
}

export function pickAlkataRecycle(
  state: GameState,
  playerId: PlayerId,
  gyInstanceId: string,
): GameState {
  if (state.interaction.type !== 'alkata_hokana_recycle') return state
  if (state.interaction.ownerId !== playerId) return state
  const { sourceId, remaining } = state.interaction
  if (remaining <= 0) return state

  let player = { ...state.players[playerId] }
  const srcIdx = findFieldIndex(player, sourceId)
  if (srcIdx < 0) return state

  const gyIdx = player.graveyard.findIndex((c) => c.instanceId === gyInstanceId)
  if (gyIdx < 0) return state
  const card = player.graveyard[gyIdx]
  if (!isAlkataGod(card.cardId)) return state

  const graveyard = player.graveyard.filter((_, i) => i !== gyIdx)
  const deck = shuffle([...player.deck, { ...card, faceDown: false }])
  const remainingAfter = remaining - 1

  const field = [...player.field]
  field[srcIdx] = { ...field[srcIdx]! }
  player = { ...player, graveyard, deck, field }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    selectedCardId: card.cardId,
    interaction:
      remainingAfter > 0
        ? {
            type: 'alkata_hokana_recycle',
            sourceId,
            remaining: remainingAfter,
            ownerId: playerId,
          }
        : { type: 'idle' },
  }
  next = log(
    next,
    `${getCard(card.cardId).nameTh} กลับเข้าเด็คจากสุสาน${
      remainingAfter > 0 ? ` (เหลืออีก ${remainingAfter} ใบ)` : ''
    }`,
  )
  if (next.interaction.type !== 'idle') return next
  return continueAfterAlkata(flushAlkataTriggers(next))
}

/** Beta — destroy another opponent monster after winning battle */
export function pickBetaExtraDestroy(
  state: GameState,
  playerId: PlayerId,
  targetInstanceId: string,
): GameState {
  if (state.winner) return state
  if (state.activePlayer !== playerId) return state
  if (state.interaction.type !== 'beta_extra_destroy') return state

  const defenderId = otherPlayer(playerId)
  let defender = { ...state.players[defenderId] }
  const tIdx = findFieldIndex(defender, targetInstanceId)
  if (tIdx < 0) return state

  const target = defender.field[tIdx]!
  const targetDef = getCard(target.cardId)
  const field = [...defender.field]
  field[tIdx] = null
  defender = {
    ...defender,
    field,
  }
  const destroyed = afterMonsterDestroyed(defender, target)
  defender = destroyed.player

  let players = depositToOwnerGy(
    { ...state.players, [defenderId]: defender },
    target,
    defenderId,
  )

  let next: GameState = {
    ...state,
    players,
    interaction: { type: 'idle' },
    selectedCardId: targetDef.id,
  }
  next = log(
    next,
    `${state.players[playerId].name} ใช้เอฟเฟคเบต้า — ทำลาย ${targetDef.nameTh}`,
  )
  if (destroyed.note) next = log(next, destroyed.note)
  return checkWinner(next)
}

export function skipBetaExtraDestroy(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (state.activePlayer !== playerId) return state
  if (state.interaction.type !== 'beta_extra_destroy') return state
  let next: GameState = {
    ...state,
    interaction: { type: 'idle' },
  }
  next = log(next, `${state.players[playerId].name} ข้ามเอฟเฟคทำลายเพิ่มของเบต้า`)
  return next
}

function hasTrapEffect(player: PlayerState, effectId: string): boolean {
  const match = (c: CardInstance) => getCard(c.cardId).effectId === effectId
  return player.hand.some(match) || player.spellTrap.some(match)
}

function hasLightShield(player: PlayerState): boolean {
  return hasTrapEffect(player, 'light_shield')
}

function hasDeathBlast(player: PlayerState): boolean {
  return hasTrapEffect(player, 'death_blast')
}

/** Sola-01: when this monster attacks, defender cannot activate traps */
function attackerSealsTraps(
  state: GameState,
  attackerId: PlayerId,
  attackerInstanceId: string,
): boolean {
  const mon = state.players[attackerId].field.find(
    (m) => m?.instanceId === attackerInstanceId,
  )
  return !!mon && getCard(mon.cardId).effectId === 'sola_destroyer'
}

/** Sigma: on attack, all opponent monsters ATK −5 until end of turn */
function applySigmaAttackDebuff(
  state: GameState,
  attackerId: PlayerId,
  attackerInstanceId: string,
): GameState {
  const mon = state.players[attackerId].field.find(
    (m) => m?.instanceId === attackerInstanceId,
  )
  if (!mon || getCard(mon.cardId).effectId !== 'sigma_destroyer') return state

  const defenderId = otherPlayer(attackerId)
  let defender = { ...state.players[defenderId] }
  const field = defender.field.map((m) =>
    m ? { ...m, tempAtkMod: (m.tempAtkMod ?? 0) - 5 } : null,
  )
  if (!field.some((m) => m !== null)) return state

  defender = { ...defender, field }

  let next: GameState = {
    ...state,
    players: { ...state.players, [defenderId]: defender },
  }
  next = log(
    next,
    `${getCard(mon.cardId).nameTh} โจมตี! มอนสเตอร์ฝ่ายตรงข้ามทุกตัว ATK −5 จนจบเทิร์น`,
  )
  return next
}

function findTrapByEffect(
  player: PlayerState,
  effectId: string,
  trapInstanceId?: string,
): { fromField: number; fromHand: number } {
  if (trapInstanceId !== undefined) {
    const fromHand = findHandIndex(player, trapInstanceId)
    if (fromHand >= 0) return { fromField: -1, fromHand }
    const fromField = findSpellTrapIndex(player, trapInstanceId)
    return { fromField, fromHand: -1 }
  }
  // Prefer hand — traps are played from hand, not set face-down
  const fromHand = player.hand.findIndex(
    (c) => getCard(c.cardId).effectId === effectId,
  )
  if (fromHand >= 0) return { fromField: -1, fromHand }
  const fromField = player.spellTrap.findIndex(
    (c) => getCard(c.cardId).effectId === effectId,
  )
  return { fromField, fromHand: -1 }
}

function findTrapAmongEffects(
  player: PlayerState,
  effectIds: string[],
  trapInstanceId?: string,
): { fromField: number; fromHand: number } {
  if (trapInstanceId !== undefined) {
    return findTrapByEffect(player, '', trapInstanceId)
  }
  for (const effectId of effectIds) {
    const hit = findTrapByEffect(player, effectId)
    if (hit.fromField >= 0 || hit.fromHand >= 0) return hit
  }
  return { fromField: -1, fromHand: -1 }
}

/** Barrier Incantation — only when the attack target is a mage on our field */
export function isBarrierAttackTarget(
  state: GameState,
  defenderId: PlayerId,
  targetInstanceId: string | 'direct',
): boolean {
  if (targetInstanceId === 'direct') return false
  const mon = state.players[defenderId].field.find(
    (m) => m?.instanceId === targetInstanceId,
  )
  return !!mon && isMage(mon.cardId)
}

function hasKataBarrier(player: PlayerState): boolean {
  return hasTrapEffect(player, 'kata_barrier')
}

function hasEligibleOnAttackTrap(
  state: GameState,
  defenderId: PlayerId,
  targetInstanceId: string | 'direct',
): boolean {
  const defender = state.players[defenderId]
  if (hasDeathBlast(defender)) return true
  return (
    hasKataBarrier(defender) &&
    isBarrierAttackTarget(state, defenderId, targetInstanceId)
  )
}

function onAttackTrapEffectIds(allowBarrier: boolean): string[] {
  const ids = ['death_blast']
  if (allowBarrier) ids.push('kata_barrier')
  return ids
}

function trapEffectIdsForWindow(
  window: 'on_attack' | 'on_destroy' | 'on_activate',
  allowBarrier: boolean,
): string[] {
  if (window === 'on_destroy') return ['light_shield']
  if (window === 'on_activate') return ['kata_intercept']
  return onAttackTrapEffectIds(allowBarrier)
}

/** True if defender can activate Intercept Incantation */
export function canOfferIntercept(
  state: GameState,
  defenderId: PlayerId,
): boolean {
  if (state.winner) return false
  // Do not nest while already in an activation-counter window
  if (
    state.awaitingTrap &&
    state.interaction.type === 'trap_response' &&
    state.interaction.threat.window === 'on_activate'
  ) {
    return false
  }
  const defender = state.players[defenderId]
  if (!defender.field.some((m) => m && isMage(m.cardId))) return false
  return hasTrapEffect(defender, 'kata_intercept')
}

export type ActivationSourceKind = 'spell' | 'trap' | 'monster_effect'

/** Open on_activate counter window for the opponent of the activator */
export function openActivationCounter(
  state: GameState,
  activatorId: PlayerId,
  sourceInstanceId: string,
  sourceKind: ActivationSourceKind,
  extras?: {
    resume?: string
    priorWindow?: 'on_attack' | 'on_destroy'
    priorTargetInstanceId?: string
    priorAttackerInstanceId?: string
  },
): GameState {
  const defenderId = otherPlayer(activatorId)
  if (!canOfferIntercept(state, defenderId)) return state

  let sourceCardId: string | undefined
  const activator = state.players[activatorId]
  if (sourceKind === 'spell' || sourceKind === 'trap') {
    sourceCardId =
      activator.hand.find((c) => c.instanceId === sourceInstanceId)?.cardId ??
      activator.spellTrap.find((c) => c.instanceId === sourceInstanceId)?.cardId
  } else {
    sourceCardId = activator.field.find(
      (m) => m?.instanceId === sourceInstanceId,
    )?.cardId
  }

  let next: GameState = {
    ...state,
    awaitingTrap: true,
    interaction: {
      type: 'trap_response',
      threat: {
        window: 'on_activate',
        targetInstanceId: sourceInstanceId,
        attackerInstanceId: sourceInstanceId,
        activatorId,
        sourceKind,
        resume: extras?.resume,
        priorWindow: extras?.priorWindow,
        priorTargetInstanceId: extras?.priorTargetInstanceId,
        priorAttackerInstanceId: extras?.priorAttackerInstanceId,
      },
    },
    selectedCardId: sourceCardId ?? null,
  }
  next = log(
    next,
    `${state.players[defenderId].name} สามารถใช้คาถาสกัดกั้นได้!`,
  )
  return next
}

/**
 * If opponent can intercept this monster effect, open the window; otherwise null.
 * Call at the start of begin* after canActivate checks.
 */
function maybeInterceptMonsterEffect(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  resume: string,
): GameState | null {
  const defenderId = otherPlayer(playerId)
  if (!canOfferIntercept(state, defenderId)) return null
  return openActivationCounter(state, playerId, sourceId, 'monster_effect', {
    resume,
  })
}

function buffOurMagesTempAtk(
  player: PlayerState,
  amount: number,
): PlayerState {
  const field = player.field.map((m) => {
    if (!m || !isMage(m.cardId)) return m
    return { ...m, tempAtkMod: (m.tempAtkMod ?? 0) + amount }
  })
  return { ...player, field }
}

function destroyActivatorSource(
  state: GameState,
  activatorId: PlayerId,
  sourceInstanceId: string,
  sourceKind: ActivationSourceKind,
): { state: GameState; destroyedName: string } {
  let activator = { ...state.players[activatorId] }
  let destroyedName = 'การ์ด'

  if (sourceKind === 'monster_effect') {
    const idx = findFieldIndex(activator, sourceInstanceId)
    if (idx < 0) return { state, destroyedName }
    const mon = activator.field[idx]!
    destroyedName = getCard(mon.cardId).nameTh
    const field = [...activator.field]
    field[idx] = null
    activator = {
      ...activator,
      field,
    }
    const res = afterMonsterDestroyed(activator, mon)
    activator = res.player
    let players = depositToOwnerGy(
      { ...state.players, [activatorId]: activator },
      { ...mon, faceDown: false },
      activatorId,
    )
    let next: GameState = {
      ...state,
      players,
    }
    if (res.note) next = log(next, res.note)
    return { state: next, destroyedName }
  }

  // spell / trap from hand or ST
  const handIdx = findHandIndex(activator, sourceInstanceId)
  if (handIdx >= 0) {
    const card = activator.hand[handIdx]
    destroyedName = getCard(card.cardId).nameTh
    const hand = [...activator.hand]
    hand.splice(handIdx, 1)
    activator = {
      ...activator,
      hand,
    }
    const players = depositToOwnerGy(
      { ...state.players, [activatorId]: activator },
      { ...card, faceDown: false },
      activatorId,
    )
    return {
      state: {
        ...state,
        players,
      },
      destroyedName,
    }
  }
  const stIdx = findSpellTrapIndex(activator, sourceInstanceId)
  if (stIdx >= 0) {
    const card = activator.spellTrap[stIdx]
    destroyedName = getCard(card.cardId).nameTh
    const spellTrap = [...activator.spellTrap]
    spellTrap.splice(stIdx, 1)
    activator = {
      ...activator,
      spellTrap,
    }
    const players = depositToOwnerGy(
      { ...state.players, [activatorId]: activator },
      { ...card, faceDown: false },
      activatorId,
    )
    return {
      state: {
        ...state,
        players,
      },
      destroyedName,
    }
  }
  return { state, destroyedName }
}

function resumeMonsterEffectAfterDecline(
  state: GameState,
  playerId: PlayerId,
  sourceId: string,
  resume: string | undefined,
): GameState {
  const opts = { skipIntercept: true as const }
  switch (resume) {
    case 'soluy_swap':
      return beginSoluySwap(state, playerId, sourceId, opts)
    case 'shorin_mage':
      return beginShorinSearch(state, playerId, sourceId, opts)
    case 'saruka_mage':
      return beginSarukaSearch(state, playerId, sourceId, opts)
    case 'ryuka_mage':
      return beginRyukaFetch(state, playerId, sourceId, opts)
    case 'zeeka_mage':
      return activateZeekaAtk(state, playerId, sourceId, opts)
    case 'agatha_mage':
      return beginAgathaSearch(state, playerId, sourceId, opts)
    case 'noah_mage':
      return beginNoahMill(state, playerId, sourceId, opts)
    default:
      return state
  }
}

/** Eligible traps in hand (and ST) for the current response window */
export function listTrapsForWindow(
  player: PlayerState,
  window: 'on_attack' | 'on_destroy' | 'on_activate',
  options?: { allowBarrier?: boolean },
): CardInstance[] {
  const ids = new Set(
    trapEffectIdsForWindow(window, options?.allowBarrier ?? false),
  )
  const match = (c: CardInstance) => ids.has(getCard(c.cardId).effectId ?? '')
  const fromHand = player.hand.filter(match)
  const fromField = player.spellTrap.filter(match)
  return [...fromHand, ...fromField]
}

/** After on-attack traps resolve (or are declined), check destroy window then battle */
function continueAttackResolution(
  state: GameState,
  attackerId: PlayerId,
  attackerInstanceId: string,
  targetInstanceId: string,
): GameState {
  const defenderId = otherPlayer(attackerId)
  const defender = state.players[defenderId]
  const tIdx = findFieldIndex(defender, targetInstanceId)
  if (tIdx < 0) return state

  const aIdx = findFieldIndex(state.players[attackerId], attackerInstanceId)
  if (aIdx < 0) return state
  const attackerMonster = state.players[attackerId].field[aIdx]!
  const atkPower = getEffectiveAtk(
    state,
    attackerId,
    attackerMonster.cardId,
    attackerMonster.instanceId,
  )
  const defMon = defender.field[tIdx]!
  const defPower = getEffectiveAtk(
    state,
    defenderId,
    defMon.cardId,
    defMon.instanceId,
  )

  const sealTraps = attackerSealsTraps(state, attackerId, attackerInstanceId)

  if (atkPower >= defPower && hasLightShield(defender) && !sealTraps) {
    return {
      ...state,
      awaitingTrap: true,
      interaction: {
        type: 'trap_response',
        threat: {
          targetInstanceId,
          attackerInstanceId,
          window: 'on_destroy',
        },
      },
      selectedCardId: defMon.cardId,
    }
  }

  return resolveBattle(state, attackerId, attackerInstanceId, targetInstanceId)
}

/** Resolve battle after optional trap window */
export function declareAttack(
  state: GameState,
  playerId: PlayerId,
  attackerInstanceId: string,
  targetInstanceId: string | 'direct',
): GameState {
  if (!canAttack(state, playerId, attackerInstanceId)) return state

  const defenderId = otherPlayer(playerId)
  const defender = state.players[defenderId]

  if (targetInstanceId === 'direct') {
    if (defender.field.some((m) => m !== null)) return state
    state = applySigmaAttackDebuff(state, playerId, attackerInstanceId)
    const sealTraps = attackerSealsTraps(state, playerId, attackerInstanceId)
    if (hasEligibleOnAttackTrap(state, defenderId, 'direct') && !sealTraps) {
      return {
        ...state,
        awaitingTrap: true,
        interaction: {
          type: 'trap_response',
          threat: {
            targetInstanceId: 'direct',
            attackerInstanceId,
            window: 'on_attack',
          },
        },
      }
    }
    return resolveBattle(state, playerId, attackerInstanceId, null)
  }

  const tIdx = findFieldIndex(defender, targetInstanceId)
  if (tIdx < 0) return state
  if (!canTargetMonster(state, playerId, targetInstanceId)) return state

  state = applySigmaAttackDebuff(state, playerId, attackerInstanceId)
  const sealTraps = attackerSealsTraps(state, playerId, attackerInstanceId)

  if (
    hasEligibleOnAttackTrap(state, defenderId, targetInstanceId) &&
    !sealTraps
  ) {
    return {
      ...state,
      awaitingTrap: true,
      interaction: {
        type: 'trap_response',
        threat: {
          targetInstanceId,
          attackerInstanceId,
          window: 'on_attack',
        },
      },
      selectedCardId: state.players[defenderId].field[tIdx]!.cardId,
    }
  }

  return continueAttackResolution(
    state,
    playerId,
    attackerInstanceId,
    targetInstanceId,
  )
}

/**
 * Show the trap face-up on the ST strip before resolving.
 * Returns null if no trap available.
 */
export function revealTrap(
  state: GameState,
  defenderId: PlayerId,
  trapInstanceId?: string,
): GameState | null {
  if (!state.awaitingTrap || state.interaction.type !== 'trap_response') {
    return null
  }

  const { threat } = state.interaction
  const allowBarrier =
    threat.window === 'on_attack' &&
    isBarrierAttackTarget(state, defenderId, threat.targetInstanceId)
  const effectIds = trapEffectIdsForWindow(threat.window, allowBarrier)

  let defender = { ...state.players[defenderId] }
  const { fromField, fromHand } = findTrapAmongEffects(
    defender,
    effectIds,
    trapInstanceId,
  )

  if (fromField < 0 && fromHand < 0) return null

  if (trapInstanceId !== undefined) {
    const card =
      fromField >= 0
        ? defender.spellTrap[fromField]
        : defender.hand[fromHand]
    if (!card || !effectIds.includes(getCard(card.cardId).effectId ?? '')) {
      return null
    }
  }

  let spellTrap = [...defender.spellTrap]
  let hand = [...defender.hand]
  let trapCard: CardInstance

  if (fromField >= 0) {
    trapCard = { ...spellTrap[fromField], faceDown: false }
    spellTrap[fromField] = trapCard
  } else {
    trapCard = { ...hand[fromHand], faceDown: false }
    hand.splice(fromHand, 1)
    spellTrap = [...spellTrap, trapCard]
  }

  const def = getCard(trapCard.cardId)
  defender = { ...defender, hand, spellTrap }

  let next: GameState = {
    ...state,
    players: { ...state.players, [defenderId]: defender },
    selectedCardId: def.id,
  }
  next = log(next, `${defender.name} เปิดใช้ ${def.nameTh}!`)
  return next
}

export function respondTrap(
  state: GameState,
  defenderId: PlayerId,
  useTrap: boolean,
  trapInstanceId?: string,
  opts?: { skipInterceptOffer?: boolean },
): GameState {
  if (!state.awaitingTrap || state.interaction.type !== 'trap_response') {
    return state
  }

  const { threat } = state.interaction

  // —— Activation counter window (Intercept Incantation) ——
  if (threat.window === 'on_activate') {
    const activatorId = threat.activatorId ?? otherPlayer(defenderId)
    const sourceKind = threat.sourceKind ?? 'spell'
    const sourceInstanceId = threat.targetInstanceId

    if (!useTrap) {
      let next: GameState = {
        ...state,
        awaitingTrap: false,
        interaction: { type: 'idle' },
      }
      if (sourceKind === 'spell') {
        return {
          ...next,
          interaction: {
            type: 'resume_spell_cast',
            ownerId: activatorId,
            instanceId: sourceInstanceId,
          },
        }
      }
      if (sourceKind === 'monster_effect') {
        return resumeMonsterEffectAfterDecline(
          next,
          activatorId,
          sourceInstanceId,
          threat.resume,
        )
      }
      if (
        sourceKind === 'trap' &&
        threat.priorWindow &&
        threat.priorTargetInstanceId !== undefined &&
        threat.priorAttackerInstanceId
      ) {
        // Restore prior attack/destroy window and apply the trap
        next = {
          ...next,
          awaitingTrap: true,
          interaction: {
            type: 'trap_response',
            threat: {
              window: threat.priorWindow,
              targetInstanceId: threat.priorTargetInstanceId,
              attackerInstanceId: threat.priorAttackerInstanceId,
            },
          },
        }
        return respondTrap(next, activatorId, true, sourceInstanceId, {
          skipInterceptOffer: true,
        })
      }
      return next
    }

    // Use Intercept
    let defender = { ...state.players[defenderId] }
    const { fromField, fromHand } = findTrapAmongEffects(
      defender,
      ['kata_intercept'],
      trapInstanceId,
    )
    if (fromField < 0 && fromHand < 0) {
      return respondTrap(state, defenderId, false)
    }

    let trapCard: CardInstance
    let spellTrap = [...defender.spellTrap]
    let hand = [...defender.hand]
    if (fromField >= 0) {
      trapCard = { ...spellTrap[fromField], faceDown: false }
      spellTrap.splice(fromField, 1)
    } else {
      trapCard = hand[fromHand]
      hand.splice(fromHand, 1)
    }
    if (getCard(trapCard.cardId).effectId !== 'kata_intercept') {
      return respondTrap(state, defenderId, false)
    }

    const trapDef = getCard(trapCard.cardId)
    const trapCost = getEffectiveCost(trapCard, state, defenderId)
    defender = {
      ...defender,
      hand,
      spellTrap,
      graveyard: [
        ...defender.graveyard,
        { ...trapCard, tempCostOverride: undefined },
      ],
      pendingTrapCost: defender.pendingTrapCost + trapCost,
    }

    let next: GameState = {
      ...state,
      players: { ...state.players, [defenderId]: defender },
      awaitingTrap: false,
      interaction: { type: 'idle' },
    }

    const destroyed = destroyActivatorSource(
      next,
      activatorId,
      sourceInstanceId,
      sourceKind,
    )
    next = destroyed.state
    defender = buffOurMagesTempAtk(next.players[defenderId], 3)
    next = {
      ...next,
      players: { ...next.players, [defenderId]: defender },
    }
    next = log(
      next,
      `${defender.name} ใช้ ${trapDef.nameTh}! ยกเลิกและทำลาย ${destroyed.destroyedName} · จอมเวทย์ฝั่งเรา ATK +3 จนจบเทิร์น`,
    )
    next = afterKataActivated(next, defenderId, trapDef.id)

    // If we countered a trap during attack, continue the attack without that trap
    if (
      sourceKind === 'trap' &&
      threat.priorWindow &&
      threat.priorAttackerInstanceId
    ) {
      const attackOwner = otherPlayer(activatorId)
      const priorTarget = threat.priorTargetInstanceId
      if (threat.priorWindow === 'on_attack') {
        if (!priorTarget || priorTarget === 'direct') {
          return checkWinner(
            resolveBattle(next, attackOwner, threat.priorAttackerInstanceId, null),
          )
        }
        return checkWinner(
          continueAttackResolution(
            next,
            attackOwner,
            threat.priorAttackerInstanceId,
            priorTarget,
          ),
        )
      }
      // on_destroy declined effectively — battle proceeds
      return checkWinner(
        resolveBattle(
          next,
          attackOwner,
          threat.priorAttackerInstanceId,
          priorTarget && priorTarget !== 'direct' ? priorTarget : null,
        ),
      )
    }

    return checkWinner(settleAfterKataResolution(next, defenderId))
  }

  const attackerId = otherPlayer(defenderId)
  const allowBarrier =
    threat.window === 'on_attack' &&
    isBarrierAttackTarget(state, defenderId, threat.targetInstanceId)
  const effectIds = trapEffectIdsForWindow(threat.window, allowBarrier)
  const battleTarget =
    threat.targetInstanceId === 'direct' ? null : threat.targetInstanceId

  if (!useTrap) {
    const next = {
      ...state,
      awaitingTrap: false,
      interaction: { type: 'idle' as const },
    }
    if (threat.window === 'on_attack') {
      if (battleTarget === null) {
        return resolveBattle(next, attackerId, threat.attackerInstanceId, null)
      }
      return continueAttackResolution(
        next,
        attackerId,
        threat.attackerInstanceId,
        battleTarget,
      )
    }
    return resolveBattle(
      next,
      attackerId,
      threat.attackerInstanceId,
      battleTarget,
    )
  }

  // Before applying attack/destroy trap — offer Intercept to the other player
  if (!opts?.skipInterceptOffer) {
    const counterId = attackerId
    if (canOfferIntercept(state, counterId)) {
      return openActivationCounter(
        state,
        defenderId,
        trapInstanceId ??
          listTrapsForWindow(state.players[defenderId], threat.window, {
            allowBarrier,
          })[0]?.instanceId ??
          '',
        'trap',
        {
          priorWindow: threat.window,
          priorTargetInstanceId: threat.targetInstanceId,
          priorAttackerInstanceId: threat.attackerInstanceId,
        },
      )
    }
  }

  let defender = { ...state.players[defenderId] }
  const { fromField, fromHand } = findTrapAmongEffects(
    defender,
    effectIds,
    trapInstanceId,
  )

  if (fromField < 0 && fromHand < 0) {
    return respondTrap(state, defenderId, false, undefined, {
      skipInterceptOffer: true,
    })
  }

  let trapCard: CardInstance
  let spellTrap = [...defender.spellTrap]
  let hand = [...defender.hand]

  if (fromField >= 0) {
    trapCard = { ...spellTrap[fromField], faceDown: false }
    spellTrap.splice(fromField, 1)
  } else {
    trapCard = hand[fromHand]
    hand.splice(fromHand, 1)
  }

  // Validate eligibility when instance was specified
  if (!effectIds.includes(getCard(trapCard.cardId).effectId ?? '')) {
    return respondTrap(state, defenderId, false, undefined, {
      skipInterceptOffer: true,
    })
  }

  const trapDef = getCard(trapCard.cardId)
  const trapCost = getEffectiveCost(trapCard, state, defenderId)

  defender = {
    ...defender,
    hand,
    spellTrap,
    graveyard: [...defender.graveyard, { ...trapCard, tempCostOverride: undefined }],
    pendingTrapCost: defender.pendingTrapCost + trapCost,
  }

  if (trapDef.effectId === 'death_blast') {
    let attacker = { ...state.players[attackerId] }
    const field = attacker.field.map((m) =>
      m ? { ...m, atkMod: (m.atkMod ?? 0) - 2 } : null,
    )
    attacker = { ...attacker, field }

    let next: GameState = {
      ...state,
      players: {
        ...state.players,
        [defenderId]: defender,
        [attackerId]: attacker,
      },
      awaitingTrap: false,
      interaction: { type: 'idle' },
    }
    next = log(
      next,
      `${defender.name} ใช้ ${trapDef.nameTh}! มอนสเตอร์บนสนามของ ${attacker.name} ATK −2 ทุกตัว`,
    )
    next = afterKataActivated(next, defenderId, trapDef.id)

    if (battleTarget === null) {
      return checkWinner(
        resolveBattle(next, attackerId, threat.attackerInstanceId, null),
      )
    }
    return checkWinner(
      continueAttackResolution(
        next,
        attackerId,
        threat.attackerInstanceId,
        battleTarget,
      ),
    )
  }

  if (trapDef.effectId === 'kata_barrier') {
    // Negate attack + halve target mage ATK
    let attacker = { ...state.players[attackerId] }
    const aIdx = findFieldIndex(attacker, threat.attackerInstanceId)
    if (aIdx >= 0) {
      const field = [...attacker.field]
      field[aIdx] = { ...field[aIdx]!, hasAttacked: true }
      attacker = { ...attacker, field }
    }

    const tIdx =
      battleTarget !== null ? findFieldIndex(defender, battleTarget) : -1
    let halvedNote = ''
    if (tIdx >= 0) {
      const target = defender.field[tIdx]!
      const before = getEffectiveAtk(
        { ...state, players: { ...state.players, [defenderId]: defender } },
        defenderId,
        target.cardId,
        target.instanceId,
      )
      const after = Math.floor(before / 2)
      const delta = after - before
      const field = [...defender.field]
      field[tIdx] = {
        ...target,
        atkMod: (target.atkMod ?? 0) + delta,
      }
      defender = { ...defender, field }
      halvedNote = ` · ${getCard(target.cardId).nameTh} ATK ${before} → ${after}`
    }

    let next: GameState = {
      ...state,
      players: {
        ...state.players,
        [defenderId]: defender,
        [attackerId]: attacker,
      },
      awaitingTrap: false,
      interaction: { type: 'idle' },
    }
    next = log(
      next,
      `${defender.name} ใช้ ${trapDef.nameTh}! การโจมตีไร้ผล${halvedNote}`,
    )
    next = afterKataActivated(next, defenderId, trapDef.id)
    return checkWinner(settleAfterKataResolution(next, defenderId))
  }

  // Light Shield — mark attacker as having attacked; target survives
  let attacker = { ...state.players[attackerId] }
  const aIdx = findFieldIndex(attacker, threat.attackerInstanceId)
  if (aIdx >= 0) {
    const field = [...attacker.field]
    field[aIdx] = { ...field[aIdx]!, hasAttacked: true }
    attacker = { ...attacker, field }
  }

  let next: GameState = {
    ...state,
    players: { ...state.players, [defenderId]: defender, [attackerId]: attacker },
    awaitingTrap: false,
    interaction: { type: 'idle' },
  }
  next = log(
    next,
    `${defender.name} ใช้ ${trapDef.nameTh}! มอนสเตอร์รอดจากการถูกทำลาย (ค่าร่ายจะถูกหักเทิร์นหน้า)`,
  )
  next = afterKataActivated(next, defenderId, trapDef.id)
  return checkWinner(next)
}

function stealRandomHandCard(
  thief: PlayerState,
  victim: PlayerState,
  sourceName: string,
): {
  thief: PlayerState
  victim: PlayerState
  note: string
  stole: boolean
} {
  if (victim.hand.length === 0) {
    return {
      thief,
      victim,
      stole: false,
      note: `${sourceName} ต่อสู้ — อีกฝ่ายไม่มีไพ่ในมือให้ยึด`,
    }
  }
  const idx = Math.floor(Math.random() * victim.hand.length)
  const stolen = resetForHand(victim.hand[idx])
  const vHand = [...victim.hand]
  vHand.splice(idx, 1)
  return {
    thief: { ...thief, hand: [...thief.hand, stolen] },
    victim: { ...victim, hand: vHand },
    stole: true,
    note: `${sourceName} ต่อสู้ — ยึด ${getCard(stolen.cardId).nameTh} จากมือ ${victim.name}`,
  }
}

function resolveBattle(
  state: GameState,
  attackerId: PlayerId,
  attackerInstanceId: string,
  targetInstanceId: string | null,
): GameState {
  let attacker = { ...state.players[attackerId] }
  let defender = { ...state.players[otherPlayer(attackerId)] }

  const aIdx = findFieldIndex(attacker, attackerInstanceId)
  if (aIdx < 0) return state
  const atkMonster = attacker.field[aIdx]!
  const atkDef = getCard(atkMonster.cardId)
  const atkPower = getEffectiveAtk(
    state,
    attackerId,
    atkMonster.cardId,
    atkMonster.instanceId,
  )

  const stealNotes: string[] = []
  const stealOwners: PlayerId[] = []
  if (atkDef.effectId === 'yori_alkata') {
    const stolen = stealRandomHandCard(attacker, defender, atkDef.nameTh)
    attacker = stolen.thief
    defender = stolen.victim
    stealNotes.push(stolen.note)
    if (stolen.stole) stealOwners.push(attackerId)
  }

  // Ultimate Warrior Kona: draw 1 when this card attacks
  // Gamma: both players draw 1 when this card attacks
  let attackDrawNote: string | null = null
  if (atkDef.effectId === 'kona_draw') {
    const before = attacker.hand.length
    attacker = drawCards(attacker, 1)
    const drawn = attacker.hand.length - before
    if (drawn > 0) {
      attackDrawNote = `${atkDef.nameTh} โจมตี — จั่ว ${drawn} ใบ`
    }
  } else if (atkDef.effectId === 'gamma_destroyer') {
    const atkBefore = attacker.hand.length
    const defBefore = defender.hand.length
    attacker = drawCards(attacker, 1)
    defender = drawCards(defender, 1)
    const atkDrawn = attacker.hand.length - atkBefore
    const defDrawn = defender.hand.length - defBefore
    if (atkDrawn > 0 || defDrawn > 0) {
      attackDrawNote = `${atkDef.nameTh} โจมตี — ${attacker.name} จั่ว ${atkDrawn} · ${defender.name} จั่ว ${defDrawn}`
    }
  }

  let next = state

  if (targetInstanceId === null) {
    // Direct attack
    defender = applyDamage(defender, atkPower, true)
    const field = [...attacker.field]
    // Attacker instance may have changed reference after draw — re-find
    const freshAtk = attacker.field[aIdx]!
    field[aIdx] = { ...freshAtk, hasAttacked: true }
    attacker = { ...attacker, field }

    next = {
      ...state,
      players: {
        ...state.players,
        [attackerId]: attacker,
        [defender.id]: defender,
      },
      interaction: { type: 'idle' },
      awaitingTrap: false,
    }
    if (attackDrawNote) next = log(next, attackDrawNote)
    for (const n of stealNotes) next = log(next, n)
    next = log(
      next,
      `${atkDef.nameTh} (${atkPower}) โจมตีตรง ${defender.name}! ดาเมจ ${atkPower} (HP ${defender.hp} · พลังงาน +${atkPower})`,
    )
    next = checkWinner(next)
    if (!next.winner && (attackDrawNote || stealNotes.length > 0)) {
      next = enforceHandLimit(next, attackerId)
      if (
        atkDef.effectId === 'gamma_destroyer' &&
        next.interaction.type === 'idle'
      ) {
        next = enforceHandLimit(next, defender.id)
      }
    }
    return next
  }

  const tIdx = findFieldIndex(defender, targetInstanceId)
  if (tIdx < 0) return state
  const defMonster = defender.field[tIdx]!
  const defCard = getCard(defMonster.cardId)
  const defPower = getEffectiveAtk(
    state,
    defender.id,
    defMonster.cardId,
    defMonster.instanceId,
  )

  if (defCard.effectId === 'yori_alkata') {
    const stolen = stealRandomHandCard(defender, attacker, defCard.nameTh)
    defender = stolen.thief
    attacker = stolen.victim
    stealNotes.push(stolen.note)
    if (stolen.stole) stealOwners.push(defender.id)
  }

  const aField = [...attacker.field]
  const dField = [...defender.field]
  let betaMayChain = false

  // Fixed ATK compare:
  //   higher → destroy defender (no pierce to HP)
  //   equal  → both destroyed
  //   lower  → destroy attacker (+ rebound damage)
  // Guardian battle shield: survive battle destroy once, then consumed.
  const defShield = hasBattleShield(defMonster)
  const atkShield = hasBattleShield(atkMonster)

  if (atkPower > defPower) {
    let destroyedNote: string | null = null
    let shieldSaved = false
    if (defShield) {
      dField[tIdx] = consumeBattleShield(defMonster)
      defender = { ...defender, field: dField }
      shieldSaved = true
    } else {
      dField[tIdx] = null
      defender = {
        ...defender,
        field: dField,
      }
      const destroyed = afterMonsterDestroyed(defender, defMonster)
      defender = destroyed.player
      destroyedNote = destroyed.note
      if (atkDef.effectId === 'beta_destroyer') betaMayChain = true
    }
    aField[aIdx] = { ...atkMonster, hasAttacked: true }
    attacker = { ...attacker, field: aField }

    let players: GameState['players'] = {
      ...state.players,
      [attackerId]: attacker,
      [defender.id]: defender,
    }
    if (!shieldSaved) {
      players = depositToOwnerGy(players, defMonster, defender.id)
      attacker = players[attackerId]
      defender = players[defender.id]
    }

    next = {
      ...state,
      players,
      interaction: { type: 'idle' },
      awaitingTrap: false,
    }
    if (attackDrawNote) next = log(next, attackDrawNote)
    for (const n of stealNotes) next = log(next, n)
    next = log(
      next,
      shieldSaved
        ? `${atkDef.nameTh} (${atkPower}) vs ${defCard.nameTh} (${defPower}) — ${defCard.nameTh} ใช้โล่คาถาผู้ป้องกัน รอดจากการต่อสู้`
        : `${atkDef.nameTh} (${atkPower}) vs ${defCard.nameTh} (${defPower}) — ทำลาย ${defCard.nameTh}`,
    )
    if (destroyedNote) next = log(next, destroyedNote)
  } else if (atkPower === defPower) {
    let atkDestroyedNote: string | null = null
    let defDestroyedNote: string | null = null
    let atkSaved = false
    let defSaved = false
    if (atkShield) {
      aField[aIdx] = { ...consumeBattleShield(atkMonster), hasAttacked: true }
      attacker = { ...attacker, field: aField }
      atkSaved = true
    } else {
      aField[aIdx] = null
      attacker = {
        ...attacker,
        field: aField,
      }
      const atkDestroyed = afterMonsterDestroyed(attacker, atkMonster)
      attacker = atkDestroyed.player
      atkDestroyedNote = atkDestroyed.note
    }
    if (defShield) {
      dField[tIdx] = consumeBattleShield(defMonster)
      defender = { ...defender, field: dField }
      defSaved = true
    } else {
      dField[tIdx] = null
      defender = {
        ...defender,
        field: dField,
      }
      const defDestroyed = afterMonsterDestroyed(defender, defMonster)
      defender = defDestroyed.player
      defDestroyedNote = defDestroyed.note
    }

    let players: GameState['players'] = {
      ...state.players,
      [attackerId]: attacker,
      [defender.id]: defender,
    }
    if (!atkSaved) {
      players = depositToOwnerGy(players, atkMonster, attackerId)
    }
    if (!defSaved) {
      players = depositToOwnerGy(players, defMonster, defender.id)
    }
    attacker = players[attackerId]
    defender = players[defender.id]

    next = {
      ...state,
      players,
      interaction: { type: 'idle' },
      awaitingTrap: false,
    }
    if (attackDrawNote) next = log(next, attackDrawNote)
    for (const n of stealNotes) next = log(next, n)
    const shieldNote =
      atkSaved || defSaved
        ? ` (โล่: ${[atkSaved ? atkDef.nameTh : null, defSaved ? defCard.nameTh : null].filter(Boolean).join(' · ')} รอด)`
        : ''
    next = log(
      next,
      `${atkDef.nameTh} (${atkPower}) vs ${defCard.nameTh} (${defPower}) — พลังเท่ากัน${shieldNote || ' ทำลายทั้งคู่!'}`,
    )
    if (atkDestroyedNote) next = log(next, atkDestroyedNote)
    if (defDestroyedNote) next = log(next, defDestroyedNote)
  } else {
    const rebound = defPower - atkPower
    let destroyedNote: string | null = null
    let atkSaved = false
    if (atkShield) {
      aField[aIdx] = { ...consumeBattleShield(atkMonster), hasAttacked: true }
      attacker = { ...attacker, field: aField }
      atkSaved = true
      if (rebound > 0) attacker = applyDamage(attacker, rebound, true)
    } else {
      aField[aIdx] = null
      attacker = {
        ...attacker,
        field: aField,
      }
      const destroyed = afterMonsterDestroyed(attacker, atkMonster)
      attacker = destroyed.player
      destroyedNote = destroyed.note
      if (rebound > 0) attacker = applyDamage(attacker, rebound, true)
    }

    let players: GameState['players'] = {
      ...state.players,
      [attackerId]: attacker,
      [defender.id]: defender,
    }
    if (!atkSaved) {
      players = depositToOwnerGy(players, atkMonster, attackerId)
      attacker = players[attackerId]
      defender = players[defender.id]
    }

    next = {
      ...state,
      players,
      interaction: { type: 'idle' },
      awaitingTrap: false,
    }
    if (attackDrawNote) next = log(next, attackDrawNote)
    for (const n of stealNotes) next = log(next, n)
    next = log(
      next,
      atkSaved
        ? `${atkDef.nameTh} (${atkPower}) vs ${defCard.nameTh} (${defPower}) — ตีแพ้แต่ใช้โล่รอด${rebound > 0 ? ` ดาเมจสะท้อน ${rebound}` : ''}`
        : `${atkDef.nameTh} (${atkPower}) vs ${defCard.nameTh} (${defPower}) — ตีแพ้ ทำลาย ${atkDef.nameTh}${rebound > 0 ? ` ดาเมจสะท้อน ${rebound} (พลังงาน +${rebound})` : ''}`,
    )
    if (destroyedNote) next = log(next, destroyedNote)
  }

  next = checkWinner(next)
  if (!next.winner && (attackDrawNote || stealNotes.length > 0)) {
    const overflowIds = attackDrawNote
      ? [attackerId, ...(atkDef.effectId === 'gamma_destroyer' ? [defender.id] : [])]
      : []
    for (const id of [...new Set([...overflowIds, ...stealOwners])]) {
      if (next.interaction.type !== 'idle') break
      next = enforceHandLimit(next, id)
    }
  }
  if (
    !next.winner &&
    betaMayChain &&
    next.interaction.type === 'idle' &&
    next.players[defender.id].field.some((m) => m !== null)
  ) {
    next = {
      ...next,
      interaction: { type: 'beta_extra_destroy' },
    }
    next = log(
      next,
      `${atkDef.nameTh} — เลือกมอนสเตอร์ฝ่ายตรงข้ามอีก 1 ตัวเพื่อทำลาย (หรือข้าม)`,
    )
  }
  return next
}

function checkWinner(state: GameState): GameState {
  const { player, opponent } = state.players
  if (player.hp <= 0 && opponent.hp <= 0) {
    return log({ ...state, winner: 'opponent' }, 'เสมอกัน — CPU ชนะตามกฎเริ่มต้น')
  }
  if (player.hp <= 0) {
    return log({ ...state, winner: 'opponent' }, `${opponent.name} ชนะ!`)
  }
  if (opponent.hp <= 0) {
    return log({ ...state, winner: 'player' }, `${player.name} ชนะ!`)
  }
  return flushAlkataTriggers(state)
}

export function selectCard(state: GameState, cardId: string | null): GameState {
  return { ...state, selectedCardId: cardId }
}

export function setInteraction(
  state: GameState,
  interaction: GameState['interaction'],
): GameState {
  return { ...state, interaction }
}
