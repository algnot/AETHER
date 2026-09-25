import { v4 as uuid } from 'uuid'
import { deckListToArray, getCard, TUTORIAL_BOT_DECK_LIST, TUTORIAL_DECK_LIST } from '../data/cards'
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

function makeInstance(cardId: string, turn = 0): CardInstance {
  return {
    instanceId: uuid(),
    cardId,
    canAttack: false,
    hasAttacked: false,
    summonTurn: turn,
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
  }
}

function createPlayer(
  id: PlayerId,
  name: string,
  deckList: Record<string, number>,
): PlayerState {
  const deck = shuffle(deckListToArray(deckList).map((id) => makeInstance(id)))
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
  player = {
    ...player,
    hand,
    graveyard: [...player.graveyard, { ...card, faceDown: false }],
  }

  const remaining = handOverflow(player)
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
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
            canAttack: true,
            hasAttacked: false,
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
): GameState {
  const firstPlayer: PlayerId = Math.random() < 0.5 ? 'player' : 'opponent'
  let player = createPlayer('player', playerName, playerDeck)
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
      ? `${player.name} จั่วเติมมือ ${drawn} ใบ → ${player.hand.length} ใบ (พลังงาน ${player.energy} · ได้เทิร์นนี้ +${player.turnEnergy})`
      : `${player.name} จั่ว ${drawn} ใบ (มือ ${player.hand.length} · พลังงาน ${player.energy} · ได้เทิร์นนี้ +${player.turnEnergy})`,
  )
  next = { ...next, phase: 'main1' }
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
  let player = state.players[id]

  // Destroy Signal Amplifier summons (and similar) at end of controller's turn
  const eotDestroy = destroyEndOfTurnMonsters(player)
  player = eotDestroy.player
  let eotNote = eotDestroy.note

  // Cap leftover turn energy (combat-damage energy is not capped)
  player = capEnergyCarry(player)

  // Clear temporary ATK mods on both fields at end of turn
  const clearTemp = (p: PlayerState): PlayerState => ({
    ...p,
    field: p.field.map((m) =>
      m && m.tempAtkMod ? { ...m, tempAtkMod: undefined } : m,
    ),
  })
  player = clearTemp(player)
  const waiting = otherPlayer(id)
  const opponent = clearTemp(state.players[waiting])

  let next: GameState = {
    ...state,
    players: {
      ...state.players,
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

/** Send monsters marked destroyAtEndTurn to GY */
function destroyEndOfTurnMonsters(player: PlayerState): {
  player: PlayerState
  note: string | null
} {
  const doomed = player.field.filter((m) => m?.destroyAtEndTurn)
  if (doomed.length === 0) return { player, note: null }

  let next = { ...player }
  const names: string[] = []
  for (const mon of doomed) {
    if (!mon) continue
    const idx = findFieldIndex(next, mon.instanceId)
    if (idx < 0) continue
    const field = [...next.field]
    field[idx] = null
    next = {
      ...next,
      field,
      graveyard: [...next.graveyard, { ...mon, destroyAtEndTurn: undefined }],
    }
    const destroyed = afterMonsterDestroyed(next, mon)
    next = destroyed.player
    names.push(getCard(mon.cardId).nameTh)
  }
  return {
    player: next,
    note: names.length
      ? `จบเทิร์น — ทำลาย ${names.join(' · ')}`
      : null,
  }
}

function destroyBattlePhaseMonsters(state: GameState): GameState {
  let next = state
  const names: string[] = []
  for (const ownerId of ['player', 'opponent'] as PlayerId[]) {
    let player = { ...next.players[ownerId] }
    const doomed = player.field.filter((m) => m?.destroyAtBattlePhase)
    if (doomed.length === 0) continue
    for (const mon of doomed) {
      if (!mon) continue
      const idx = findFieldIndex(player, mon.instanceId)
      if (idx < 0) continue
      const field = [...player.field]
      field[idx] = null
      player = {
        ...player,
        field,
        graveyard: [
          ...player.graveyard,
          { ...mon, destroyAtBattlePhase: undefined },
        ],
      }
      const destroyed = afterMonsterDestroyed(player, mon)
      player = destroyed.player
      names.push(getCard(mon.cardId).nameTh)
    }
    next = {
      ...next,
      players: { ...next.players, [ownerId]: player },
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
  player = {
    ...player,
    field,
    graveyard: [...player.graveyard, { ...self, faceDown: false }],
  }

  const def = getCard(summonedCardId)
  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
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
  opponent = {
    ...opponent,
    field,
    graveyard: [...opponent.graveyard, { ...mon, faceDown: false }],
  }
  const destroyed = afterMonsterDestroyed(opponent, mon)
  opponent = destroyed.player

  let next: GameState = {
    ...state,
    players: { ...state.players, [oppId]: opponent },
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
  player = {
    ...player,
    hand,
    graveyard: [...player.graveyard, { ...card, faceDown: false }],
  }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
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
  player = {
    ...player,
    hand,
    graveyard: [...player.graveyard, { ...card, faceDown: false }],
  }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
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

  const temp = mon.tempAtkMod ?? 0
  if (temp !== 0) {
    parts.push({
      label: temp > 0 ? 'บัฟชั่วคราว' : 'ดีบัฟชั่วคราว',
      value: temp,
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
  if (state.interaction.type === 'alkata_gy_recover') return false
  if (state.interaction.type === 'alkata_hand_summon') return false
  if (state.interaction.type === 'alkata_debuff') return false
  if (state.interaction.type === 'alkata_hokana_recycle') return false
  const player = state.players[playerId]
  const idx = findHandIndex(player, instanceId)
  if (idx < 0) return false
  const def = getCard(player.hand[idx].cardId)
  if (def.type !== 'monster') return false

  // During reinforce window, use HP summons instead
  if (state.interaction.type === 'reinforce') return false

  // Destruction robots: pay 6 HP (card cost) — energy cannot be used
  if (isEnergyOrHpSummon(def.effectId)) {
    if (player.hp < def.cost) return false
  } else if (player.energy < def.cost) {
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

  let pay: 'energy' | 'hp' | null = null
  let payNote = ''
  if (isEnergyOrHpSummon(def.effectId)) {
    if (player.hp < def.cost) return state
    pay = 'hp'
    payNote = `จ่าย HP ${def.cost}`
  } else if (player.energy < def.cost) {
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
      def.cost,
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
    updated = { ...updated, hp: updated.hp - def.cost }
  } else {
    updated = spendEnergy(updated, def.cost)
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
  if (state.interaction.type === 'alkata_gy_recover') return false
  if (state.interaction.type === 'alkata_hand_summon') return false
  if (state.interaction.type === 'alkata_debuff') return false
  if (state.interaction.type === 'alkata_hokana_recycle') return false
  const player = state.players[playerId]
  const idx = findHandIndex(player, instanceId)
  if (idx < 0) return false
  const def = getCard(player.hand[idx].cardId)
  if (def.type !== 'spell') return false
  if (player.energy < def.cost) return false

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

  return canAddSpellTrap(player)
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

  const hand = [...player.hand]
  hand.splice(handIdx, 1)

  const spellTrap = [...player.spellTrap, { ...card, faceDown: false }]

  let updated: PlayerState = spendEnergy(
    { ...player, hand, spellTrap },
    def.cost,
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

  const spellTrap = [...player.spellTrap]
  spellTrap.splice(stIdx, 1)

  player = {
    ...player,
    spellTrap,
    graveyard: [...player.graveyard, { ...card, faceDown: false }],
  }

  let drawn = 0
  if (def.effectId === 'energy_charge') {
    player = { ...player, energy: player.energy + 3 }
  } else if (def.effectId === 'heavenly_voice') {
    const before = player.hand.length
    player = drawCards(player, 2)
    drawn = player.hand.length - before
  }

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    selectedCardId: def.id,
    interaction: { type: 'idle' },
  }
  if (def.effectId === 'energy_charge') {
    next = log(next, `${player.name} ได้รับพลังงาน +3 (รวม ${player.energy})`)
  } else if (def.effectId === 'heavenly_voice') {
    next = log(
      next,
      `${player.name} ใช้ ${def.nameTh} — จั่ว ${drawn} ใบ (มือ ${player.hand.length})`,
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
  if (findFieldIndex(player, monsterInstanceId) < 0) return state

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
    graveyard: [
      ...player.graveyard,
      { ...sacrifice, faceDown: false },
      { ...spellCard, faceDown: false },
    ],
  }
  const destroyed = afterMonsterDestroyed(player, sacrifice)
  player = destroyed.player

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
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
    graveyard: [
      ...player.graveyard,
      { ...target, faceDown: false },
      { ...spellCard, faceDown: false },
    ],
  }
  const destroyed = afterMonsterDestroyed(player, target)
  player = destroyed.player

  const before = player.hand.length
  player = drawCards(player, 2)
  const drawn = player.hand.length - before

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
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
): GameState {
  if (!canActivateSoluy(state, playerId, sourceId)) return state
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
  const hand = [...player.hand, resetForHand(mon)]
  player = { ...player, field, hand }
  player = noteAlkataLeft(player, mon)

  const oppId = otherPlayer(playerId)
  let opponent = state.players[oppId]
  const retTrig = applyReturnToHandTriggers(player, opponent, mon.cardId)
  player = retTrig.player
  opponent = retTrig.opponent

  let next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player, [oppId]: opponent },
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
  let opponent = state.players[oppId]
  const handIdx = findHandIndex(player, bounceId)
  if (handIdx < 0) {
    return { ...state, interaction: { type: 'idle' } }
  }
  const card = player.hand[handIdx]
  const zone = player.field.findIndex((z) => z === null)
  if (zone < 0) {
    return { ...state, interaction: { type: 'idle' } }
  }

  const undone = undoReturnToHandTriggers(player, opponent, card.cardId)
  player = undone.player
  opponent = undone.opponent
  player = undoAlkataLeft(player, card)

  const hand = [...player.hand]
  hand.splice(handIdx, 1)
  const field = [...player.field]
  field[zone] = card
  player = { ...player, hand, field }
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
      graveyard: [...opponent.graveyard, { ...doomed, faceDown: false }],
    }
    const destroyed = afterMonsterDestroyed(opponent, doomed)
    opponent = destroyed.player
    next = {
      ...next,
      players: { ...next.players, [oppId]: opponent },
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
    graveyard: [...defender.graveyard, target],
  }
  const destroyed = afterMonsterDestroyed(defender, target)
  defender = destroyed.player

  let next: GameState = {
    ...state,
    players: { ...state.players, [defenderId]: defender },
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

function trapEffectForWindow(window: 'on_attack' | 'on_destroy'): string {
  return window === 'on_attack' ? 'death_blast' : 'light_shield'
}

/** Eligible traps in hand (and face-down ST) for the current response window */
export function listTrapsForWindow(
  player: PlayerState,
  window: 'on_attack' | 'on_destroy',
): CardInstance[] {
  const effectId = trapEffectForWindow(window)
  const fromHand = player.hand.filter((c) => getCard(c.cardId).effectId === effectId)
  const fromField = player.spellTrap.filter(
    (c) => getCard(c.cardId).effectId === effectId,
  )
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
    if (hasDeathBlast(state.players[defenderId]) && !sealTraps) {
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

  if (hasDeathBlast(state.players[defenderId]) && !sealTraps) {
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

  const effectId = trapEffectForWindow(state.interaction.threat.window)
  let defender = { ...state.players[defenderId] }
  const { fromField, fromHand } = findTrapByEffect(
    defender,
    effectId,
    trapInstanceId,
  )

  if (fromField < 0 && fromHand < 0) return null

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
): GameState {
  if (!state.awaitingTrap || state.interaction.type !== 'trap_response') {
    return state
  }

  const { threat } = state.interaction
  const attackerId = otherPlayer(defenderId)
  const effectId = trapEffectForWindow(threat.window)
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

  let defender = { ...state.players[defenderId] }
  const { fromField, fromHand } = findTrapByEffect(
    defender,
    effectId,
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

  const trapDef = getCard(trapCard.cardId)

  defender = {
    ...defender,
    hand,
    spellTrap,
    graveyard: [...defender.graveyard, trapCard],
    pendingTrapCost: defender.pendingTrapCost + trapDef.cost,
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
  if (atkPower > defPower) {
    dField[tIdx] = null
    defender = {
      ...defender,
      field: dField,
      graveyard: [...defender.graveyard, defMonster],
    }
    const destroyed = afterMonsterDestroyed(defender, defMonster)
    defender = destroyed.player
    aField[aIdx] = { ...atkMonster, hasAttacked: true }
    attacker = { ...attacker, field: aField }

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
      `${atkDef.nameTh} (${atkPower}) vs ${defCard.nameTh} (${defPower}) — ทำลาย ${defCard.nameTh}`,
    )
    if (destroyed.note) next = log(next, destroyed.note)
    if (atkDef.effectId === 'beta_destroyer') betaMayChain = true
  } else if (atkPower === defPower) {
    aField[aIdx] = null
    dField[tIdx] = null
    attacker = {
      ...attacker,
      field: aField,
      graveyard: [...attacker.graveyard, atkMonster],
    }
    defender = {
      ...defender,
      field: dField,
      graveyard: [...defender.graveyard, defMonster],
    }
    const atkDestroyed = afterMonsterDestroyed(attacker, atkMonster)
    attacker = atkDestroyed.player
    const defDestroyed = afterMonsterDestroyed(defender, defMonster)
    defender = defDestroyed.player

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
      `${atkDef.nameTh} (${atkPower}) vs ${defCard.nameTh} (${defPower}) — พลังเท่ากัน ทำลายทั้งคู่!`,
    )
    if (atkDestroyed.note) next = log(next, atkDestroyed.note)
    if (defDestroyed.note) next = log(next, defDestroyed.note)
  } else {
    const rebound = defPower - atkPower
    aField[aIdx] = null
    attacker = {
      ...attacker,
      field: aField,
      graveyard: [...attacker.graveyard, atkMonster],
    }
    const destroyed = afterMonsterDestroyed(attacker, atkMonster)
    attacker = destroyed.player
    if (rebound > 0) attacker = applyDamage(attacker, rebound, true)

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
      `${atkDef.nameTh} (${atkPower}) vs ${defCard.nameTh} (${defPower}) — ตีแพ้ ทำลาย ${atkDef.nameTh}${rebound > 0 ? ` ดาเมจสะท้อน ${rebound} (พลังงาน +${rebound})` : ''}`,
    )
    if (destroyed.note) next = log(next, destroyed.note)
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
