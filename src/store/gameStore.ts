import { create } from 'zustand'
import { BOT_DECK_LIST, getCard } from '../data/cards'
import { chooseAiAction } from '../engine/ai'
import { chooseTutorialAiAction } from '../engine/tutorialAi'
import {
  advancePhase,
  canAttack,
  canActivateSoluy,
  canActivateShorin,
  canActivateAgatha,
  canActivateNoah,
  canActivateSaruka,
  canActivateRyuka,
  canActivateZeeka,
  canAlkataHandSummon,
  canPlaySpell,
  canReinforceSummon,
  canPaySola,
  canSoluySummonFromHand,
  canSummon,
  canTargetMonster,
  cancelSoluySwap,
  createGame,
  createTutorialGame,
  confirmEmergencySummon,
  beginSoluySwap,
  beginShorinSearch,
  beginAgathaSearch,
  beginNoahMill,
  beginSarukaSearch,
  beginRyukaFetch,
  activateZeekaAtk,
  cancelAlkataDebuff,
  cancelShorinSearch,
  cancelAgathaSearch,
  cancelNoahMill,
  cancelSarukaSearch,
  cancelRyukaFetch,
  cancelRyukaSleep,
  cancelZeekaDebuff,
  pickGuardianTarget,
  cancelGuardianPick,
  pickBuddyTarget,
  cancelBuddyPick,
  pickHypnosisTarget,
  pickTeleportSummon,
  cancelTeleportPick,
  cancelHypnosisPick,
  pickAlkataDebuff,
  pickAlkataGyRecover,
  pickAlkataHandSummon,
  pickAlkataRecycle,
  skipAlkataGyRecover,
  skipAlkataHandSummon,
  skipAlkataRecycle,
  declareAttack,
  discardFromHand,
  discardForSara,
  discardForAlkataCall,
  endReinforce,
  getEffectiveAtk,
  isEnergyOrHpSummon,
  needsSolaPayChoice,
  pickBetaExtraDestroy,
  pickEmergencyFromDeck,
  pickInterference,
  pickSignalAmp,
  pickMinaFromDeck,
  pickOmegaSearch,
  pickAlkataDeckSearch,
  pickAlkataMinaSummon,
  pickAlkataCallSummon,
  skipAlkataCallSummon,
  isAlkataGod,
  pickSoluyBounce,
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
  pickSoraDestroy,
  skipSoraDestroy,
  pickSoulDrainSacrifice,
  pickSoulDrainTarget,
  pickAlkataPlot,
  pickSpecialMod,
  reinforceSummon,
  resolveSoluySummon,
  resolveSpell,
  respondTrap,
  revealTrap,
  selectCard,
  setInteraction,
  skipBetaExtraDestroy,
  skipEmergencySummon,
  skipMinaRecruit,
  skipOmegaSearch,
  skipAlkataDeckSearch,
  skipAlkataMinaSummon,
  skipSignalAmp,
  offerOrStageSpell,
  summonMonster,
} from '../engine/gameEngine'
import type { GameScreen, PlayerId } from '../types/game'
import { mockHand } from '../tutorial/scenario'
import { deckEvolvedForDuel } from '../lib/deckEvolved'
import { useDeckStore } from './deckStore'
import { useAuthStore } from './authStore'

export type BattleFx = {
  attackerId: string
  targetId: string | 'direct'
}

export type CastFx = {
  owner: PlayerId
  instanceId: string
  kind: 'spell' | 'trap_set' | 'trap_activate'
}

/** Pacing — keep actions readable */
const FX_MS = 1100
const CAST_MS = 1400
const AFTER_MOVE_MS = 1000
const AI_STEP_MS = 1100
const AI_AFTER_ATK_MS = 900
const DUEL_START_MS = 1200

export type TutorialGuide = {
  /** Only this cardId may be played from hand (summon/spell/trap) */
  forceCardId: string | null
  /** Soft highlight in hand (may still click others unless forceCardId set) */
  highlightCardId: string | null
  /** Block phase button until cleared */
  lockPhase: boolean
  /** Prefer attacking (coach step) */
  forceAttack: boolean
  /** Must activate trap — cannot decline */
  forceTrap: boolean
}

interface AppStore {
  screen: GameScreen
  game: import('../types/game').GameState | null
  tutorialMode: boolean
  tutorialGuide: TutorialGuide | null
  aiThinking: boolean
  battleFx: BattleFx | null
  castFx: CastFx | null
  setScreen: (s: GameScreen) => void
  startDuel: () => void
  startTutorialDuel: () => void
  tutorialMockHand: (cardIds: readonly string[]) => void
  setTutorialGuide: (guide: TutorialGuide | null) => void
  leaveDuel: () => void
  nextPhase: () => void
  onHandCardClick: (instanceId: string) => void
  onFieldZoneClick: (zoneIndex: number, owner: 'player' | 'opponent') => void
  onMonsterClick: (instanceId: string, owner: 'player' | 'opponent') => void
  onDirectAttack: () => void
  onTrapRespond: (use: boolean, trapInstanceId?: string) => void
  hoverCard: (cardId: string | null) => void
  dropSummon: (instanceId: string, zoneIndex: number) => void
  dropSpellTrap: (instanceId: string) => void
  onSpellTrapZoneClick: (owner: 'player' | 'opponent') => void
  onSpellTrapCardClick: (instanceId: string) => void
  finishReinforce: () => void
  pickEmergencyCard: (instanceId: string) => void
  pickInterferenceCard: (instanceId: string) => void
  pickSignalAmpCard: (instanceId: string) => void
  skipSignalAmpPick: () => void
  confirmEmergency: (zoneIndex?: number) => void
  skipEmergency: () => void
  pickMinaCard: (instanceId: string) => void
  skipMina: () => void
  cancelSoluy: () => void
  pickShorinDiscardCard: (instanceId: string) => void
  pickShorinCard: (instanceId: string, from: 'deck' | 'graveyard') => void
  cancelShorin: () => void
  pickSarukaDiscardCard: (instanceId: string) => void
  pickSarukaCard: (instanceId: string, from: 'deck' | 'graveyard') => void
  cancelSaruka: () => void
  pickRyukaDiscardCard: (instanceId: string) => void
  pickRyukaCard: (instanceId: string) => void
  cancelRyuka: () => void
  pickRyukaSleepMonster: (instanceId: string) => void
  cancelRyukaSleepPick: () => void
  pickZeekaDebuffMonster: (instanceId: string) => void
  cancelZeekaDebuffPick: () => void
  pickAgathaCard: (instanceId: string) => void
  cancelAgatha: () => void
  pickNoahCard: (instanceId: string) => void
  cancelNoah: () => void
  pickGuardianMonster: (instanceId: string) => void
  cancelGuardian: () => void
  pickBuddyMonster: (instanceId: string) => void
  cancelBuddy: () => void
  pickHypnosisMonster: (instanceId: string) => void
  cancelHypnosis: () => void
  pickTeleportCard: (instanceId: string, from: 'deck' | 'graveyard') => void
  cancelTeleport: () => void
  confirmSolaPay: (pay: 'energy' | 'hp') => void
  cancelSolaPay: () => void
  skipBetaExtra: () => void
  pickOmegaCard: (instanceId: string) => void
  skipOmega: () => void
  pickAlkataDeckCard: (instanceId: string) => void
  skipAlkataDeck: () => void
  pickAlkataMinaCard: (instanceId: string) => void
  skipAlkataMina: () => void
  pickAlkataCallCard: (instanceId: string) => void
  skipAlkataCall: () => void
  pickAlkataGyCard: (instanceId: string) => void
  skipAlkataGy: () => void
  skipAlkataHand: () => void
  cancelAlkataCrush: () => void
  pickAlkataRecycleCard: (instanceId: string) => void
  skipAlkataRecyclePick: () => void
  tickAi: () => void
}

function afterPlayerMove(get: () => AppStore, delay = AFTER_MOVE_MS) {
  setTimeout(() => get().tickAi(), delay)
}

function runSpellCast(
  get: () => AppStore,
  set: (p: Partial<AppStore>) => void,
  owner: PlayerId,
  instanceId: string,
  opts?: { skipIntercept?: boolean },
) {
  const { game } = get()
  if (!game) return

  const afterStage = offerOrStageSpell(game, owner, instanceId, opts)
  if (afterStage === game) return

  // Opponent (or we) may counter before the spell is staged
  if (
    afterStage.awaitingTrap &&
    afterStage.interaction.type === 'trap_response' &&
    afterStage.interaction.threat.window === 'on_activate'
  ) {
    set({ game: afterStage, castFx: null, aiThinking: false })
    const responder = owner === 'player' ? 'opponent' : 'player'
    if (responder === 'opponent') {
      setTimeout(() => get().tickAi(), AI_STEP_MS)
    }
    return
  }

  const staged = afterStage
  set({
    game: staged,
    castFx: { owner, instanceId, kind: 'spell' },
    aiThinking: owner === 'opponent',
  })

  window.setTimeout(() => {
    const g = get().game
    if (!g) return
    const stagedCard = g.players[owner].spellTrap.find(
      (c) => c.instanceId === instanceId,
    )
    const effectId = stagedCard
      ? getCard(stagedCard.cardId).effectId
      : undefined

    if (
      effectId === 'soul_drain' ||
      effectId === 'special_mod' ||
      effectId === 'interference_signal' ||
      effectId === 'signal_amplifier' ||
      effectId === 'emergency_reinforce' ||
      effectId === 'alkata_call' ||
      effectId === 'alkata_plot' ||
      effectId === 'kata_guardian' ||
      effectId === 'kata_buddy' ||
      effectId === 'kata_hypnosis' ||
      effectId === 'kata_blink'
    ) {
      set({ castFx: null, aiThinking: false })
      const g2 = get().game
      if (g2?.winner) {
        set({ screen: 'result' })
        return
      }
      if (owner === 'opponent') {
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }
      return
    }

    const next = resolveSpell(g, owner, instanceId)
    set({ game: next, castFx: null, aiThinking: false })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    // Wait for reinforce picks — don't pass turn yet
    if (next.interaction.type === 'reinforce') {
      if (owner === 'opponent') {
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }
      return
    }
    if (
      next.interaction.type === 'discard' ||
      next.interaction.type === 'emergency_pick' ||
      next.interaction.type === 'emergency_summon'
    ) {
      if (owner === 'opponent') {
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }
      return
    }
    if (owner === 'player') afterPlayerMove(get)
    else setTimeout(() => get().tickAi(), AI_STEP_MS)
  }, CAST_MS)
}

function runTrapActivate(
  get: () => AppStore,
  set: (p: Partial<AppStore>) => void,
  owner: PlayerId,
  use: boolean,
  trapInstanceId?: string,
) {
  const { game } = get()
  if (!game) return

  const finishTrapResult = (next: typeof game) => {
    if (!next) return
    set({ game: next, castFx: null, aiThinking: false })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'resume_spell_cast') {
      const { ownerId, instanceId } = next.interaction
      set({
        game: { ...next, interaction: { type: 'idle' } },
      })
      runSpellCast(get, set, ownerId, instanceId, { skipIntercept: true })
      return
    }
    if (
      next.awaitingTrap &&
      next.interaction.type === 'trap_response' &&
      next.interaction.threat.window === 'on_activate'
    ) {
      // Offered intercept to the other player — wait for them / AI
      const activator = next.interaction.threat.activatorId ?? owner
      const responder = activator === 'player' ? 'opponent' : 'player'
      if (responder === 'opponent') {
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }
      return
    }
    afterPlayerMove(get)
  }

  if (!use) {
    const next = respondTrap(game, owner, false)
    finishTrapResult(next)
    return
  }

  const revealed = revealTrap(game, owner, trapInstanceId)
  if (!revealed) {
    const next = respondTrap(game, owner, false)
    finishTrapResult(next)
    return
  }

  const trapOnField = revealed.players[owner].spellTrap.find((c) => {
    if (c.faceDown) return false
    const id = getCard(c.cardId).effectId
    return (
      id === 'light_shield' ||
      id === 'death_blast' ||
      id === 'kata_barrier' ||
      id === 'kata_intercept'
    )
  })

  set({
    game: revealed,
    castFx: trapOnField
      ? { owner, instanceId: trapOnField.instanceId, kind: 'trap_activate' }
      : null,
    aiThinking: owner === 'opponent',
  })

  window.setTimeout(() => {
    const g = get().game
    if (!g) return
    const next = respondTrap(g, owner, true, trapOnField?.instanceId)
    finishTrapResult(next)
  }, CAST_MS)
}

function runAttack(
  get: () => AppStore,
  set: (p: Partial<AppStore>) => void,
  attackerId: string,
  targetId: string | 'direct',
) {
  const { game } = get()
  if (!game) return

  set({
    battleFx: {
      attackerId,
      targetId,
    },
  })

  window.setTimeout(() => {
    const g = get().game
    if (!g) return
    const next = declareAttack(g, 'player', attackerId, targetId)
    set({ game: next, battleFx: null })
    if (next.winner) set({ screen: 'result' })
    if (next.interaction.type === 'beta_extra_destroy') return
    afterPlayerMove(get, AFTER_MOVE_MS)
  }, FX_MS)
}

export const useAppStore = create<AppStore>((set, get) => ({
  screen: 'menu',
  game: null,
  tutorialMode: false,
  tutorialGuide: null,
  aiThinking: false,
  battleFx: null,
  castFx: null,

  setScreen: (screen) => set({ screen }),

  startDuel: () => {
    const deckStore = useDeckStore.getState()
    const deck = deckStore.getActiveDeck()
    const valid = deckStore.isDeckValid(deck.id)
    if (!valid.valid) {
      alert(valid.message)
      return
    }
    const evolved = useAuthStore.getState().user?.evolved ?? {}
    const game = createGame(deck.cards, BOT_DECK_LIST, 'คุณ', 'CPU', {
      playerEvolved: deckEvolvedForDuel(deck, evolved),
    })
    set({
      screen: 'duel',
      game,
      tutorialMode: false,
      tutorialGuide: null,
      battleFx: null,
      castFx: null,
    })
    setTimeout(() => get().tickAi(), DUEL_START_MS)
  },

  startTutorialDuel: () => {
    const game = createTutorialGame()
    set({
      screen: 'duel',
      game,
      tutorialMode: true,
      tutorialGuide: null,
      battleFx: null,
      castFx: null,
    })
    setTimeout(() => get().tickAi(), DUEL_START_MS)
  },

  tutorialMockHand: (cardIds) => {
    const { game, tutorialMode } = get()
    if (!game || !tutorialMode) return
    const player = mockHand(game.players.player, cardIds)
    set({
      game: {
        ...game,
        players: { ...game.players, player },
      },
    })
  },

  setTutorialGuide: (guide) => {
    const { game } = get()
    if (
      game &&
      guide?.forceCardId &&
      (game.interaction.type === 'summon' ||
        game.interaction.type === 'play_spell')
    ) {
      const selectedId = game.interaction.cardInstanceId
      const card = game.players.player.hand.find(
        (c) => c.instanceId === selectedId,
      )
      if (!card || card.cardId !== guide.forceCardId) {
        set({
          tutorialGuide: guide,
          game: setInteraction(game, { type: 'idle' }),
        })
        return
      }
    }
    set({ tutorialGuide: guide })
  },

  leaveDuel: () => {
    set({
      screen: 'menu',
      game: null,
      tutorialMode: false,
      tutorialGuide: null,
      aiThinking: false,
      battleFx: null,
      castFx: null,
    })
  },

  nextPhase: () => {
    const { game, castFx, battleFx, tutorialMode, tutorialGuide } = get()
    if (
      !game ||
      game.winner ||
      game.activePlayer !== 'player' ||
      game.awaitingTrap ||
      castFx ||
      battleFx
    )
      return
    if (tutorialMode && tutorialGuide?.lockPhase) return
    if (game.interaction.type === 'reinforce') {
      const next = endReinforce(game)
      set({ game: next })
      afterPlayerMove(get)
      return
    }
    const next = advancePhase(game)
    set({ game: next })
    if (next.winner) set({ screen: 'result' })
    afterPlayerMove(get)
  },

  finishReinforce: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'reinforce') return
    if (game.activePlayer !== 'player') return
    const next = endReinforce(game)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    afterPlayerMove(get)
  },

  pickEmergencyCard: (instanceId) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'emergency_pick') return
    if (game.activePlayer !== 'player') return
    const next = pickEmergencyFromDeck(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  pickInterferenceCard: (instanceId) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'interference_pick') return
    if (game.activePlayer !== 'player') return
    const next = pickInterference(game, 'player', instanceId)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
      afterPlayerMove(get)
    }
  },

  pickSignalAmpCard: (instanceId) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'signal_amp_pick') return
    if (game.activePlayer !== 'player') return
    const next = pickSignalAmp(game, 'player', instanceId)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  skipSignalAmpPick: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'signal_amp_pick') return
    if (game.activePlayer !== 'player') return
    const next = skipSignalAmp(game, 'player')
    set({ game: next })
    afterPlayerMove(get)
  },

  confirmEmergency: (zoneIndex) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'emergency_summon') return
    if (game.activePlayer !== 'player') return
    const next = confirmEmergencySummon(game, 'player', zoneIndex)
    set({ game: next })
    if (next.interaction.type === 'mina_recruit' || next.interaction.type === 'sara_discard' || next.interaction.type === 'omega_search' || next.interaction.type === 'alkata_deck_search' || next.interaction.type === 'alkata_mina_summon' || next.interaction.type === 'sora_destroy' || next.interaction.type === 'alkata_debuff') return
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  skipEmergency: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'emergency_summon') return
    if (game.activePlayer !== 'player') return
    const next = skipEmergencySummon(game, 'player')
    set({ game: next })
    if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
      if (next.interaction.type === 'idle') afterPlayerMove(get)
    }
  },

  pickMinaCard: (instanceId) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'mina_recruit') return
    if (game.activePlayer !== 'player') return
    const next = pickMinaFromDeck(game, 'player', instanceId)
    set({ game: next })
    if (
      next.interaction.type === 'idle' ||
      next.interaction.type === 'reinforce'
    ) {
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      else setTimeout(() => get().tickAi(), AI_STEP_MS)
    } else if (
      next.interaction.type === 'mina_recruit' ||
      next.interaction.type === 'sara_discard'
    ) {
      // chained recruit / Sara discard — wait for next pick
    }
  },

  skipMina: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'mina_recruit') return
    if (game.activePlayer !== 'player') return
    const next = skipMinaRecruit(game, 'player')
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelSoluy: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'soluy_swap') return
    set({ game: cancelSoluySwap(game) })
  },

  pickShorinDiscardCard: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickShorinDiscard(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  pickShorinCard: (instanceId, from) => {
    const { game } = get()
    if (!game) return
    const next = pickShorinSearch(game, 'player', instanceId, from)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelShorin: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'shorin_search') return
    set({ game: cancelShorinSearch(game) })
  },

  pickSarukaDiscardCard: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickSarukaDiscard(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  pickSarukaCard: (instanceId, from) => {
    const { game } = get()
    if (!game) return
    const next = pickSarukaSearch(game, 'player', instanceId, from)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelSaruka: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'saruka_search') return
    set({ game: cancelSarukaSearch(game) })
  },

  pickRyukaDiscardCard: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickRyukaDiscard(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  pickRyukaCard: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickRyukaFetch(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelRyuka: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'ryuka_fetch') return
    set({ game: cancelRyukaFetch(game) })
  },

  pickRyukaSleepMonster: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickRyukaSleep(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelRyukaSleepPick: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'ryuka_sleep') return
    const next = cancelRyukaSleep(game)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  pickZeekaDebuffMonster: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickZeekaDebuff(game, 'player', instanceId)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelZeekaDebuffPick: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'zeeka_debuff') return
    set({ game: cancelZeekaDebuff(game) })
    afterPlayerMove(get)
  },

  pickAgathaCard: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickAgathaSearch(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelAgatha: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'agatha_search') return
    set({ game: cancelAgathaSearch(game) })
  },

  pickNoahCard: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickNoahMill(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelNoah: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'noah_mill') return
    set({ game: cancelNoahMill(game) })
  },

  pickGuardianMonster: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickGuardianTarget(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelGuardian: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'guardian_pick') return
    set({ game: cancelGuardianPick(game) })
    afterPlayerMove(get)
  },

  pickBuddyMonster: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickBuddyTarget(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelBuddy: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'buddy_pick') return
    set({ game: cancelBuddyPick(game) })
    afterPlayerMove(get)
  },

  pickHypnosisMonster: (instanceId) => {
    const { game } = get()
    if (!game) return
    const next = pickHypnosisTarget(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelHypnosis: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'hypnosis_pick') return
    set({ game: cancelHypnosisPick(game) })
    afterPlayerMove(get)
  },

  pickTeleportCard: (instanceId, from) => {
    const { game } = get()
    if (!game) return
    const next = pickTeleportSummon(game, 'player', instanceId, from)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelTeleport: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'teleport_pick') return
    set({ game: cancelTeleportPick(game) })
    afterPlayerMove(get)
  },

  confirmSolaPay: (pay) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'sola_pay') return
    if (game.activePlayer !== 'player') return
    const { cardInstanceId, zoneIndex } = game.interaction
    const handCard = game.players.player.hand.find((c) => c.instanceId === cardInstanceId)
    if (!handCard) return
    const cost = getCard(handCard.cardId).cost
    if (!canPaySola(game, 'player', pay, cost)) return
    const next = summonMonster(game, 'player', cardInstanceId, zoneIndex, pay)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (
      next.interaction.type === 'mina_recruit' ||
      next.interaction.type === 'sara_discard' ||
      next.interaction.type === 'omega_search' ||
      next.interaction.type === 'alkata_deck_search' ||
      next.interaction.type === 'alkata_mina_summon'
    ) {
      return
    }
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelSolaPay: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'sola_pay') return
    set({
      game: {
        ...game,
        interaction: { type: 'idle' },
      },
    })
  },

  skipBetaExtra: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'beta_extra_destroy') return
    if (game.activePlayer !== 'player') return
    const next = skipBetaExtraDestroy(game, 'player')
    set({ game: next })
    afterPlayerMove(get)
  },

  pickOmegaCard: (instanceId) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'omega_search') return
    if (game.activePlayer !== 'player') return
    const next = pickOmegaSearch(game, 'player', instanceId)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
      afterPlayerMove(get)
    }
  },

  skipOmega: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'omega_search') return
    if (game.activePlayer !== 'player') return
    const next = skipOmegaSearch(game, 'player')
    set({ game: next })
    if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
      afterPlayerMove(get)
    }
  },

  pickAlkataDeckCard: (instanceId) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_deck_search') return
    if (game.interaction.ownerId !== 'player') return
    const next = pickAlkataDeckSearch(game, 'player', instanceId)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
      afterPlayerMove(get)
    }
  },

  skipAlkataDeck: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_deck_search') return
    if (game.interaction.ownerId !== 'player') return
    const next = skipAlkataDeckSearch(game, 'player')
    set({ game: next })
    if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
      afterPlayerMove(get)
    }
  },

  pickAlkataMinaCard: (instanceId) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_mina_summon') return
    if (game.interaction.ownerId !== 'player') return
    const next = pickAlkataMinaSummon(game, 'player', instanceId)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
      afterPlayerMove(get)
    }
  },

  skipAlkataMina: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_mina_summon') return
    if (game.interaction.ownerId !== 'player') return
    const next = skipAlkataMinaSummon(game, 'player')
    set({ game: next })
    if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
      afterPlayerMove(get)
    }
  },

  pickAlkataCallCard: (instanceId) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_call_summon') return
    if (game.activePlayer !== 'player') return
    const next = pickAlkataCallSummon(game, 'player', instanceId)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
      afterPlayerMove(get)
    }
  },

  skipAlkataCall: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_call_summon') return
    if (game.activePlayer !== 'player') return
    const next = skipAlkataCallSummon(game, 'player')
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  pickAlkataGyCard: (instanceId) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_gy_recover') return
    if (game.interaction.ownerId !== 'player') return
    const next = pickAlkataGyRecover(game, 'player', instanceId)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
      afterPlayerMove(get)
    }
  },

  skipAlkataGy: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_gy_recover') return
    if (game.interaction.ownerId !== 'player') return
    const next = skipAlkataGyRecover(game, 'player')
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  skipAlkataHand: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_hand_summon') return
    if (game.interaction.ownerId !== 'player') return
    const next = skipAlkataHandSummon(game, 'player')
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  cancelAlkataCrush: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_debuff') return
    if (game.interaction.ownerId !== 'player') return
    const next = cancelAlkataDebuff(game)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  pickAlkataRecycleCard: (instanceId) => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_hokana_recycle') return
    if (game.interaction.ownerId !== 'player') return
    const next = pickAlkataRecycle(game, 'player', instanceId)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  skipAlkataRecyclePick: () => {
    const { game, castFx, battleFx } = get()
    if (!game || castFx || battleFx) return
    if (game.interaction.type !== 'alkata_hokana_recycle') return
    if (game.interaction.ownerId !== 'player') return
    const next = skipAlkataRecycle(game)
    set({ game: next })
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  hoverCard: (cardId) => {
    const { game } = get()
    if (!game) return
    set({ game: selectCard(game, cardId) })
  },

  onHandCardClick: (instanceId) => {
    const { game, castFx, battleFx, tutorialMode, tutorialGuide } = get()
    if (!game || game.winner) return
    const mustDiscard =
      game.interaction.type === 'discard' &&
      game.interaction.ownerId === 'player'
    const alkataOwner =
      (game.interaction.type === 'alkata_gy_recover' ||
        game.interaction.type === 'alkata_hand_summon') &&
      game.interaction.ownerId === 'player'
    // Mandatory discard / Alkata windows must work even during cast/battle FX
    if ((castFx || battleFx) && !mustDiscard && !alkataOwner) return
    if (game.activePlayer !== 'player' && !alkataOwner && !mustDiscard) return

    if (
      tutorialMode &&
      tutorialGuide?.forceCardId &&
      !mustDiscard &&
      !alkataOwner
    ) {
      const card = game.players.player.hand.find((c) => c.instanceId === instanceId)
      if (!card || card.cardId !== tutorialGuide.forceCardId) return
    }

    if (game.awaitingTrap && game.interaction.type === 'trap_response') {
      const threat = game.interaction.threat
      const allowBarrier =
        threat.window === 'on_attack' &&
        threat.targetInstanceId !== 'direct' &&
        (() => {
          const mon = game.players.player.field.find(
            (m) => m?.instanceId === threat.targetInstanceId,
          )
          return !!mon && getCard(mon.cardId).tribe === 'mage'
        })()
      const card =
        game.players.player.hand.find((c) => c.instanceId === instanceId) ??
        game.players.player.spellTrap.find((c) => c.instanceId === instanceId)
      if (!card) return
      const effectId = getCard(card.cardId).effectId
      const ok =
        (threat.window === 'on_attack' &&
          (effectId === 'death_blast' ||
            (effectId === 'kata_barrier' && allowBarrier))) ||
        (threat.window === 'on_destroy' && effectId === 'light_shield') ||
        (threat.window === 'on_activate' && effectId === 'kata_intercept')
      if (!ok) return
      runTrapActivate(get, set, 'player', true, instanceId)
      return
    }

    if (mustDiscard) {
      const next = discardFromHand(game, 'player', instanceId)
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      // Only hand off to AI when fully idle — Alkata triggers may open next
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      game.interaction.type === 'alkata_hand_summon' &&
      game.interaction.ownerId === 'player'
    ) {
      if (!canAlkataHandSummon(game, 'player', instanceId)) return
      const next = pickAlkataHandSummon(game, 'player', instanceId)
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      if (
        next.interaction.type === 'idle' ||
        next.interaction.type === 'discard'
      ) {
        afterPlayerMove(get)
      }
      return
    }

    if (game.interaction.type === 'sara_discard') {
      const next = discardForSara(game, 'player', instanceId)
      set({ game: next })
      if (next.interaction.type === 'mina_recruit' || next.interaction.type === 'sara_discard' || next.interaction.type === 'omega_search' || next.interaction.type === 'alkata_deck_search' || next.interaction.type === 'alkata_mina_summon' || next.interaction.type === 'sora_destroy' || next.interaction.type === 'alkata_debuff') return
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      game.interaction.type === 'ryuka_fetch' &&
      game.interaction.step === 'discard' &&
      game.interaction.ownerId === 'player'
    ) {
      const next = pickRyukaDiscard(game, 'player', instanceId)
      set({ game: next })
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      game.interaction.type === 'shorin_search' &&
      game.interaction.step === 'discard' &&
      game.interaction.ownerId === 'player'
    ) {
      const next = pickShorinDiscard(game, 'player', instanceId)
      set({ game: next })
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      game.interaction.type === 'saruka_search' &&
      game.interaction.step === 'discard' &&
      game.interaction.ownerId === 'player'
    ) {
      const next = pickSarukaDiscard(game, 'player', instanceId)
      set({ game: next })
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (game.interaction.type === 'alkata_call_discard') {
      const next = discardForAlkataCall(game, 'player', instanceId)
      set({ game: next })
      if (
        next.interaction.type === 'alkata_call_summon' ||
        next.interaction.type === 'alkata_deck_search' ||
        next.interaction.type === 'alkata_mina_summon' ||
        next.interaction.type === 'sora_destroy' ||
        next.interaction.type === 'omega_search'
      ) {
        return
      }
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (game.interaction.type === 'soluy_swap' && game.interaction.bounceId) {
      if (!canSoluySummonFromHand(game, 'player', instanceId)) return
      const next = resolveSoluySummon(game, 'player', instanceId)
      set({ game: next })
      if (next.interaction.type === 'mina_recruit' || next.interaction.type === 'sara_discard' || next.interaction.type === 'omega_search' || next.interaction.type === 'alkata_deck_search' || next.interaction.type === 'alkata_mina_summon' || next.interaction.type === 'sora_destroy' || next.interaction.type === 'alkata_debuff') return
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (game.interaction.type === 'reinforce') {
      if (canReinforceSummon(game, 'player', instanceId)) {
        set({
          game: setInteraction(game, {
            type: 'reinforce',
            summonsLeft: game.interaction.summonsLeft,
            selectedInstanceId: instanceId,
          }),
        })
      }
      return
    }

    if (canSummon(game, 'player', instanceId)) {
      set({
        game: setInteraction(selectCard(game, null), {
          type: 'summon',
          cardInstanceId: instanceId,
        }),
      })
      return
    }

    if (canPlaySpell(game, 'player', instanceId)) {
      set({
        game: setInteraction(selectCard(game, null), {
          type: 'play_spell',
          cardInstanceId: instanceId,
        }),
      })
    }
  },

  dropSummon: (instanceId, zoneIndex) => {
    const { game, castFx, tutorialMode, tutorialGuide } = get()
    if (!game || game.activePlayer !== 'player' || castFx) return
    if (tutorialMode && tutorialGuide?.forceCardId) {
      const card = game.players.player.hand.find((c) => c.instanceId === instanceId)
      if (!card || card.cardId !== tutorialGuide.forceCardId) return
    }

    if (game.interaction.type === 'reinforce') {
      if (!canReinforceSummon(game, 'player', instanceId)) return
      const next = reinforceSummon(game, 'player', instanceId, zoneIndex)
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      if (next.interaction.type === 'mina_recruit' || next.interaction.type === 'sara_discard' || next.interaction.type === 'omega_search' || next.interaction.type === 'alkata_deck_search' || next.interaction.type === 'alkata_mina_summon' || next.interaction.type === 'sora_destroy' || next.interaction.type === 'alkata_debuff') return
      if (next.interaction.type !== 'reinforce') afterPlayerMove(get)
      return
    }

    if (!canSummon(game, 'player', instanceId)) return
    const handCard = game.players.player.hand.find((c) => c.instanceId === instanceId)
    if (!handCard) return
    if (needsSolaPayChoice(game, 'player', instanceId)) {
      set({
        game: {
          ...game,
          interaction: {
            type: 'sola_pay',
            cardInstanceId: instanceId,
            zoneIndex,
          },
          selectedCardId: handCard.cardId,
        },
      })
      return
    }
    const solaPay = isEnergyOrHpSummon(getCard(handCard.cardId).effectId)
      ? 'hp'
      : undefined
    const next = summonMonster(game, 'player', instanceId, zoneIndex, solaPay)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'mina_recruit' || next.interaction.type === 'sara_discard' || next.interaction.type === 'omega_search' || next.interaction.type === 'alkata_deck_search' || next.interaction.type === 'alkata_mina_summon' || next.interaction.type === 'sora_destroy' || next.interaction.type === 'alkata_debuff') return
    afterPlayerMove(get)
  },

  dropSpellTrap: (instanceId) => {
    const { game, castFx, tutorialMode, tutorialGuide } = get()
    if (!game || game.activePlayer !== 'player' || castFx) return
    if (tutorialMode && tutorialGuide?.forceCardId) {
      const card = game.players.player.hand.find((c) => c.instanceId === instanceId)
      if (!card || card.cardId !== tutorialGuide.forceCardId) return
    }
    if (game.interaction.type === 'reinforce') return
    if (canPlaySpell(game, 'player', instanceId)) {
      runSpellCast(get, set, 'player', instanceId)
    }
  },

  onFieldZoneClick: (zoneIndex, owner) => {
    const { game, castFx } = get()
    if (!game || owner !== 'player' || castFx) return

    if (game.interaction.type === 'emergency_summon') {
      const next = confirmEmergencySummon(game, 'player', zoneIndex)
      set({ game: next })
      if (next.interaction.type === 'mina_recruit' || next.interaction.type === 'sara_discard' || next.interaction.type === 'omega_search' || next.interaction.type === 'alkata_deck_search' || next.interaction.type === 'alkata_mina_summon' || next.interaction.type === 'sora_destroy' || next.interaction.type === 'alkata_debuff') return
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      game.interaction.type === 'reinforce' &&
      game.interaction.selectedInstanceId
    ) {
      const next = reinforceSummon(
        game,
        'player',
        game.interaction.selectedInstanceId,
        zoneIndex,
      )
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      if (next.interaction.type === 'mina_recruit' || next.interaction.type === 'sara_discard' || next.interaction.type === 'omega_search' || next.interaction.type === 'alkata_deck_search' || next.interaction.type === 'alkata_mina_summon' || next.interaction.type === 'sora_destroy' || next.interaction.type === 'alkata_debuff') return
      if (next.interaction.type !== 'reinforce') afterPlayerMove(get)
      return
    }

    if (game.interaction.type === 'summon') {
      const id = game.interaction.cardInstanceId
      if (needsSolaPayChoice(game, 'player', id)) {
        set({
          game: {
            ...game,
            interaction: {
              type: 'sola_pay',
              cardInstanceId: id,
              zoneIndex,
            },
          },
        })
        return
      }
      const handCard = game.players.player.hand.find((c) => c.instanceId === id)
      const handDef = handCard ? getCard(handCard.cardId) : null
      const solaPay =
        handDef && isEnergyOrHpSummon(handDef.effectId) ? 'hp' : undefined
      const next = summonMonster(game, 'player', id, zoneIndex, solaPay)
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      if (next.interaction.type === 'mina_recruit' || next.interaction.type === 'sara_discard' || next.interaction.type === 'omega_search' || next.interaction.type === 'alkata_deck_search' || next.interaction.type === 'alkata_mina_summon' || next.interaction.type === 'sora_destroy' || next.interaction.type === 'alkata_debuff') return
      afterPlayerMove(get)
    }
  },

  onSpellTrapZoneClick: (owner) => {
    const { game, castFx } = get()
    if (!game || owner !== 'player' || castFx) return
    if (game.interaction.type === 'reinforce') return
    if (game.interaction.type === 'play_spell') {
      runSpellCast(get, set, 'player', game.interaction.cardInstanceId)
    }
  },

  onSpellTrapCardClick: (instanceId) => {
    const { game } = get()
    if (!game || game.winner || get().battleFx || get().castFx) return
    if (
      game.interaction.type !== 'sora_destroy' ||
      game.activePlayer !== 'player'
    ) {
      return
    }
    const next = pickSoraDestroy(game, 'player', instanceId)
    set({ game: next })
    if (next.winner) {
      set({ screen: 'result' })
      return
    }
    if (next.interaction.type === 'idle') afterPlayerMove(get)
  },

  onMonsterClick: (instanceId, owner) => {
    const { game } = get()
    if (!game || game.winner || get().battleFx || get().castFx) return

    if (
      game.interaction.type === 'sora_destroy' &&
      game.activePlayer === 'player'
    ) {
      if (owner !== 'opponent') return
      const next = pickSoraDestroy(game, 'player', instanceId)
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      owner === 'player' &&
      game.interaction.type === 'soluy_swap' &&
      game.activePlayer === 'player'
    ) {
      if (!game.interaction.bounceId) {
        set({ game: pickSoluyBounce(game, 'player', instanceId) })
      }
      return
    }

    if (
      owner === 'player' &&
      game.interaction.type === 'special_mod' &&
      game.activePlayer === 'player'
    ) {
      const next = pickSpecialMod(game, 'player', instanceId)
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      owner === 'player' &&
      game.interaction.type === 'alkata_plot' &&
      game.activePlayer === 'player'
    ) {
      const next = pickAlkataPlot(game, 'player', instanceId)
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      if (next.interaction.type === 'idle' || next.interaction.type === 'discard') {
        afterPlayerMove(get)
      }
      return
    }

    if (
      owner === 'player' &&
      game.interaction.type === 'soul_drain' &&
      game.activePlayer === 'player'
    ) {
      if (!game.interaction.sacrificeId) {
        set({ game: pickSoulDrainSacrifice(game, 'player', instanceId) })
      } else {
        const next = pickSoulDrainTarget(game, 'player', instanceId)
        set({ game: next })
        if (next.interaction.type === 'idle') afterPlayerMove(get)
      }
      return
    }

    if (
      owner === 'player' &&
      game.interaction.type === 'guardian_pick' &&
      game.interaction.ownerId === 'player'
    ) {
      const next = pickGuardianTarget(game, 'player', instanceId)
      set({ game: next })
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      owner === 'player' &&
      game.interaction.type === 'buddy_pick' &&
      game.interaction.ownerId === 'player'
    ) {
      const next = pickBuddyTarget(game, 'player', instanceId)
      set({ game: next })
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      owner === 'opponent' &&
      game.interaction.type === 'hypnosis_pick' &&
      game.interaction.ownerId === 'player'
    ) {
      const next = pickHypnosisTarget(game, 'player', instanceId)
      set({ game: next })
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      owner === 'opponent' &&
      game.interaction.type === 'ryuka_sleep' &&
      game.interaction.ownerId === 'player'
    ) {
      const next = pickRyukaSleep(game, 'player', instanceId)
      set({ game: next })
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      owner === 'opponent' &&
      game.interaction.type === 'zeeka_debuff' &&
      game.interaction.ownerId === 'player'
    ) {
      const next = pickZeekaDebuff(game, 'player', instanceId)
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      owner === 'player' &&
      (game.phase === 'main1' || game.phase === 'main2') &&
      game.activePlayer === 'player' &&
      game.interaction.type === 'idle'
    ) {
      const startEffect = (
        next: NonNullable<typeof game>,
      ) => {
        set({ game: next })
        if (
          next.awaitingTrap &&
          next.interaction.type === 'trap_response' &&
          next.interaction.threat.window === 'on_activate'
        ) {
          setTimeout(() => get().tickAi(), AI_STEP_MS)
        }
      }
      if (canActivateSoluy(game, 'player', instanceId)) {
        startEffect(beginSoluySwap(game, 'player', instanceId))
        return
      }
      if (canActivateShorin(game, 'player', instanceId)) {
        startEffect(beginShorinSearch(game, 'player', instanceId))
        return
      }
      if (canActivateSaruka(game, 'player', instanceId)) {
        startEffect(beginSarukaSearch(game, 'player', instanceId))
        return
      }
      if (canActivateRyuka(game, 'player', instanceId)) {
        startEffect(beginRyukaFetch(game, 'player', instanceId))
        return
      }
      if (canActivateZeeka(game, 'player', instanceId)) {
        startEffect(activateZeekaAtk(game, 'player', instanceId))
        return
      }
      if (canActivateAgatha(game, 'player', instanceId)) {
        startEffect(beginAgathaSearch(game, 'player', instanceId))
        return
      }
      if (canActivateNoah(game, 'player', instanceId)) {
        startEffect(beginNoahMill(game, 'player', instanceId))
        return
      }
      return
    }

    if (owner === 'player' && game.phase === 'battle' && game.activePlayer === 'player') {
      if (canAttack(game, 'player', instanceId)) {
        set({
          game: setInteraction(game, {
            type: 'attack',
            attackerInstanceId: instanceId,
          }),
        })
      }
      return
    }

    if (
      owner === 'opponent' &&
      game.interaction.type === 'alkata_debuff' &&
      game.interaction.ownerId === 'player'
    ) {
      const next = pickAlkataDebuff(game, 'player', instanceId)
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      owner === 'opponent' &&
      game.interaction.type === 'beta_extra_destroy' &&
      game.activePlayer === 'player'
    ) {
      const next = pickBetaExtraDestroy(game, 'player', instanceId)
      set({ game: next })
      if (next.winner) {
        set({ screen: 'result' })
        return
      }
      if (next.interaction.type === 'idle') afterPlayerMove(get)
      return
    }

    if (
      owner === 'opponent' &&
      game.interaction.type === 'attack' &&
      game.activePlayer === 'player'
    ) {
      if (!canTargetMonster(game, 'player', instanceId)) return
      runAttack(get, set, game.interaction.attackerInstanceId, instanceId)
    }
  },

  onDirectAttack: () => {
    const { game } = get()
    if (!game || game.interaction.type !== 'attack' || get().battleFx || get().castFx)
      return
    runAttack(get, set, game.interaction.attackerInstanceId, 'direct')
  },

  onTrapRespond: (use, trapInstanceId) => {
    const { game, castFx, tutorialMode, tutorialGuide } = get()
    if (!game || castFx) return
    if (tutorialMode && tutorialGuide?.forceTrap && !use) return
    if (
      tutorialMode &&
      tutorialGuide?.forceTrap &&
      tutorialGuide.forceCardId &&
      use
    ) {
      const id =
        trapInstanceId ??
        game.players.player.hand.find(
          (c) => c.cardId === tutorialGuide.forceCardId,
        )?.instanceId
      if (!id) return
      const card =
        game.players.player.hand.find((c) => c.instanceId === id) ??
        game.players.player.spellTrap.find((c) => c.instanceId === id)
      if (!card || card.cardId !== tutorialGuide.forceCardId) return
      runTrapActivate(get, set, 'player', true, id)
      return
    }
    runTrapActivate(get, set, 'player', use, trapInstanceId)
  },

  tickAi: () => {
    const { game, aiThinking, battleFx, castFx, tutorialMode } = get()
    if (!game || game.winner || aiThinking || battleFx || castFx) return

    // Tutorial bot: scripted summon + one attack, then pass
    if (tutorialMode && game.activePlayer === 'opponent') {
      if (
        game.interaction.type !== 'idle' &&
        game.interaction.type !== 'attack'
      ) {
        // fall through to normal AI for rare forced interactions
      } else if (game.awaitingTrap) {
        return
      } else {
        const choice = chooseTutorialAiAction(game)
        if (!choice) return
        const action = choice.apply
        const probe = action(game)

        if (choice.attack) {
          // Attack declaration may open a trap window — apply immediately so the student can respond
          if (probe.awaitingTrap) {
            set({ game: probe, aiThinking: false })
            return
          }
          set({
            aiThinking: true,
            battleFx: {
              attackerId: choice.attack.attackerId,
              targetId: choice.attack.targetId,
            },
          })
          window.setTimeout(() => {
            set({ game: probe, battleFx: null, aiThinking: false })
            if (probe.winner) {
              set({ screen: 'result' })
              return
            }
            setTimeout(() => get().tickAi(), AI_AFTER_ATK_MS)
          }, FX_MS)
          return
        }

        set({ aiThinking: true })
        window.setTimeout(() => {
          set({ game: probe, aiThinking: false })
          if (probe.winner) {
            set({ screen: 'result' })
            return
          }
          if (probe.activePlayer === 'opponent') {
            setTimeout(() => get().tickAi(), 450)
          }
        }, 450)
        return
      }
    }

    if (game.awaitingTrap && game.interaction.type === 'trap_response') {
      const threat = game.interaction.threat
      if (threat.window === 'on_activate') {
        const activator = threat.activatorId ?? 'opponent'
        const responder = activator === 'player' ? 'opponent' : 'player'
        if (responder === 'player') return
        runTrapActivate(get, set, 'opponent', true)
        return
      }
      // Attack/destroy: attacker is active; defender answers.
      // Wait for player when they defend (CPU is attacking).
      if (game.activePlayer === 'opponent') return
      runTrapActivate(get, set, 'opponent', true)
      return
    }

    // Opponent hand overflow discard (can happen off-turn via Alkata triggers)
    if (
      game.interaction.type === 'discard' &&
      game.interaction.ownerId === 'opponent'
    ) {
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (
          !g ||
          g.interaction.type !== 'discard' ||
          g.interaction.ownerId !== 'opponent'
        ) {
          set({ aiThinking: false })
          return
        }
        const hand = g.players.opponent.hand
        const pick =
          [...hand].sort(
            (a, b) =>
              (getCard(a.cardId).atk ?? 0) - (getCard(b.cardId).atk ?? 0) ||
              getCard(a.cardId).cost - getCard(b.cardId).cost,
          )[0]
        let next = g
        if (pick) next = discardFromHand(g, 'opponent', pick.instanceId)
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent reinforce window — summon warriors with HP (never suicide)
    if (
      game.interaction.type === 'reinforce' &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      const warriors = me.hand
        .filter((c) => canReinforceSummon(game, 'opponent', c.instanceId))
        .map((c) => {
          const d = getCard(c.cardId)
          const survives = me.hp - d.cost > 0
          let score = (d.atk ?? 0) * 3 - d.cost
          if (!survives) score = -999
          if (d.effectId === 'sari_rally') {
            score +=
              me.field.filter((m) => m && getCard(m.cardId).tribe === 'warrior')
                .length * 15
          }
          if (d.effectId === 'mina_recruit' && me.field.some((z) => z === null)) {
            score += 25
          }
          if (
            (d.effectId === 'support_unit' || d.effectId === 'frontline_warrior') &&
            me.field.some((m) => m && getCard(m.cardId).tribe === 'warrior')
          ) {
            score += 20
          }
          return { c, score }
        })
        .filter((x) => x.score > -900)
        .sort((a, b) => b.score - a.score)
      const warrior = warriors[0]?.c

      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'reinforce') {
          set({ aiThinking: false })
          return
        }
        let next = g
        if (warrior && canReinforceSummon(g, 'opponent', warrior.instanceId)) {
          const cost = getCard(warrior.cardId).cost
          if (g.players.opponent.hp - cost > 0) {
            next = reinforceSummon(g, 'opponent', warrior.instanceId)
          } else {
            next = endReinforce(g)
          }
        } else {
          next = endReinforce(g)
        }
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Player targeting windows — wait for human
    if (
      (game.interaction.type === 'reinforce' ||
        game.interaction.type === 'discard' ||
        game.interaction.type === 'soul_drain' ||
        game.interaction.type === 'alkata_plot' ||
        game.interaction.type === 'special_mod' ||
        game.interaction.type === 'interference_pick' ||
        game.interaction.type === 'signal_amp_pick' ||
        game.interaction.type === 'emergency_pick' ||
        game.interaction.type === 'emergency_summon' ||
        game.interaction.type === 'mina_recruit' ||
        game.interaction.type === 'sara_discard' ||
        game.interaction.type === 'alkata_call_discard' ||
        game.interaction.type === 'alkata_call_summon' ||
        game.interaction.type === 'sola_pay' ||
        game.interaction.type === 'beta_extra_destroy' ||
        game.interaction.type === 'sora_destroy' ||
        game.interaction.type === 'omega_search' ||
        game.interaction.type === 'soluy_swap' ||
        game.interaction.type === 'shorin_search' ||
        game.interaction.type === 'saruka_search' ||
        game.interaction.type === 'ryuka_fetch' ||
        game.interaction.type === 'ryuka_sleep' ||
        game.interaction.type === 'zeeka_debuff' ||
        game.interaction.type === 'agatha_search' ||
        game.interaction.type === 'noah_mill' ||
        game.interaction.type === 'guardian_pick' ||
        game.interaction.type === 'buddy_pick' ||
        game.interaction.type === 'hypnosis_pick' ||
        game.interaction.type === 'teleport_pick' ||
        game.interaction.type === 'alkata_gy_recover' ||
        game.interaction.type === 'alkata_hand_summon' ||
        game.interaction.type === 'alkata_debuff' ||
        game.interaction.type === 'alkata_hokana_recycle') &&
      (game.activePlayer === 'player' ||
        (game.interaction.type === 'discard' &&
          game.interaction.ownerId === 'player') ||
        ((game.interaction.type === 'alkata_gy_recover' ||
          game.interaction.type === 'alkata_hand_summon' ||
          game.interaction.type === 'alkata_hokana_recycle') &&
          game.interaction.ownerId === 'player') ||
        (game.interaction.type === 'alkata_debuff' &&
          game.interaction.ownerId === 'player'))
    ) {
      return
    }

    if (
      game.interaction.type === 'alkata_deck_search' &&
      game.interaction.ownerId === 'player'
    ) {
      return
    }

    if (
      game.interaction.type === 'alkata_mina_summon' &&
      game.interaction.ownerId === 'player'
    ) {
      return
    }

    // Opponent Sara discard then recruit
    if (
      game.interaction.type === 'sara_discard' &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'sara_discard') {
          set({ aiThinking: false })
          return
        }
        const pick = [...me.hand]
          .map((c) => ({ c, def: getCard(c.cardId) }))
          .sort((a, b) => {
            const aScore =
              a.def.type === 'monster' ? (a.def.atk ?? 0) : a.def.cost
            const bScore =
              b.def.type === 'monster' ? (b.def.atk ?? 0) : b.def.cost
            return aScore - bScore
          })[0]?.c
        let next = g
        if (pick) next = discardForSara(g, 'opponent', pick.instanceId)
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Call of Alkata — discard then summon
    if (
      game.interaction.type === 'alkata_call_discard' &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'alkata_call_discard') {
          set({ aiThinking: false })
          return
        }
        const pick = [...me.hand]
          .map((c) => ({ c, def: getCard(c.cardId) }))
          .sort((a, b) => {
            const aAlkata = a.def.nameTh.includes('เทพแห่งอัลคาทา') ? 1 : 0
            const bAlkata = b.def.nameTh.includes('เทพแห่งอัลคาทา') ? 1 : 0
            if (aAlkata !== bAlkata) return aAlkata - bAlkata
            const aScore =
              a.def.type === 'monster' ? (a.def.atk ?? 0) : a.def.cost
            const bScore =
              b.def.type === 'monster' ? (b.def.atk ?? 0) : b.def.cost
            return aScore - bScore
          })[0]?.c
        let next = g
        if (pick) next = discardForAlkataCall(g, 'opponent', pick.instanceId)
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    if (
      game.interaction.type === 'alkata_call_summon' &&
      game.activePlayer === 'opponent'
    ) {
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'alkata_call_summon') {
          set({ aiThinking: false })
          return
        }
        const matches = g.players.opponent.deck
          .filter((c) => isAlkataGod(c.cardId))
          .map((c) => ({ c, def: getCard(c.cardId) }))
          .sort((a, b) => (b.def.atk ?? 0) - (a.def.atk ?? 0) || b.def.cost - a.def.cost)
        const pick = matches[0]?.c
        let next = g
        if (pick) next = pickAlkataCallSummon(g, 'opponent', pick.instanceId)
        else next = skipAlkataCallSummon(g, 'opponent')
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Mina recruit
    if (
      game.interaction.type === 'mina_recruit' &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'mina_recruit') {
          set({ aiThinking: false })
          return
        }
        const excludeMina = g.interaction.source !== 'sara'
        const warriors = me.deck
          .filter((c) => {
            const d = getCard(c.cardId)
            if (d.tribe !== 'warrior') return false
            if (excludeMina && d.effectId === 'mina_recruit') return false
            return true
          })
          .map((c) => ({ c, def: getCard(c.cardId) }))
          .sort((a, b) => (b.def.atk ?? 0) - (a.def.atk ?? 0))
        const pick = warriors[0]?.c
        let next = g
        if (pick) next = pickMinaFromDeck(g, 'opponent', pick.instanceId)
        else next = skipMinaRecruit(g, 'opponent')
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Soluy swap
    if (
      game.interaction.type === 'soluy_swap' &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'soluy_swap') {
          set({ aiThinking: false })
          return
        }
        let next = g
        if (!g.interaction.bounceId) {
          const warriors = me.field.filter(
            (m): m is NonNullable<typeof m> =>
              !!m &&
              getCard(m.cardId).tribe === 'warrior' &&
              getCard(m.cardId).effectId !== 'soluy_swap',
          )
          // Prefer bouncing Sari (ally buff) or Michael (enemy debuff)
          const sari = warriors.find(
            (m) => getCard(m.cardId).effectId === 'sari_rally',
          )
          const michael = warriors.find(
            (m) => getCard(m.cardId).effectId === 'michael_scout',
          )
          const others = warriors.filter(
            (m) =>
              getCard(m.cardId).effectId !== 'sari_rally' &&
              getCard(m.cardId).effectId !== 'michael_scout',
          )
          const enemyCount = g.players.player.field.filter((m) => m).length
          let pick =
            sari && others.length > 0
              ? sari
              : michael && enemyCount > 0
                ? michael
                : undefined
          if (!pick) {
            pick = warriors
              .map((m) => ({
                m,
                power: getEffectiveAtk(g, 'opponent', m.cardId, m.instanceId),
              }))
              .sort((a, b) => a.power - b.power)[0]?.m
          }
          if (pick) next = pickSoluyBounce(g, 'opponent', pick.instanceId)
          else next = cancelSoluySwap(g)
        } else {
          const handWarriors = me.hand
            .filter((c) => canSoluySummonFromHand(g, 'opponent', c.instanceId))
            .map((c) => ({ c, def: getCard(c.cardId) }))
            .sort((a, b) => (b.def.atk ?? 0) - (a.def.atk ?? 0))
          // Prefer highest ATK warrior in hand (includes just-bounced card)
          const pick = handWarriors[0]?.c
          if (pick) next = resolveSoluySummon(g, 'opponent', pick.instanceId)
          else next = cancelSoluySwap(g)
        }
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Signal Amplifier GY summon
    if (
      game.interaction.type === 'signal_amp_pick' &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'signal_amp_pick') {
          set({ aiThinking: false })
          return
        }
        const ranked = me.graveyard
          .filter((c) =>
            getCard(c.cardId).nameTh.includes('หุ่นยนต์แห่งการทำลาย'),
          )
          .map((c) => ({ c, def: getCard(c.cardId) }))
          .sort((a, b) => b.def.cost - a.def.cost)
        const pick = ranked[0]?.c
        let next = g
        if (pick && me.field.some((z) => z === null)) {
          next = pickSignalAmp(g, 'opponent', pick.instanceId)
        } else {
          next = skipSignalAmp(g, 'opponent')
        }
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Interference Signal
    if (
      game.interaction.type === 'interference_pick' &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'interference_pick') {
          set({ aiThinking: false })
          return
        }
        const ranked = me.deck
          .filter((c) =>
            getCard(c.cardId).nameTh.includes('หุ่นยนต์แห่งการทำลาย'),
          )
          .map((c) => ({ c, def: getCard(c.cardId) }))
          // Prefer lower cost so opponent heals less
          .sort((a, b) => a.def.cost - b.def.cost)
        const pick = ranked[0]?.c
        let next = g
        if (pick) next = pickInterference(g, 'opponent', pick.instanceId)
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Emergency Reinforcements
    if (
      (game.interaction.type === 'emergency_pick' ||
        game.interaction.type === 'emergency_summon') &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g) {
          set({ aiThinking: false })
          return
        }
        let next = g
        if (g.interaction.type === 'emergency_pick') {
          const monsters = me.deck
            .filter((c) => getCard(c.cardId).type === 'monster')
            .map((c) => ({ c, def: getCard(c.cardId) }))
          const fieldOpen = me.field.some((z) => z === null)
          const ranked = [...monsters].sort((a, b) => {
            const aLow = (a.def.atk ?? 0) < 5
            const bLow = (b.def.atk ?? 0) < 5
            if (fieldOpen && aLow !== bLow) return aLow ? -1 : 1
            return (b.def.atk ?? 0) - (a.def.atk ?? 0)
          })
          const pick = ranked[0]?.c
          if (pick) next = pickEmergencyFromDeck(g, 'opponent', pick.instanceId)
        } else if (g.interaction.type === 'emergency_summon') {
          next = confirmEmergencySummon(g, 'opponent')
        }
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Omega deck search
    if (
      game.interaction.type === 'omega_search' &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'omega_search') {
          set({ aiThinking: false })
          return
        }
        const matches = me.deck
          .filter((c) => getCard(c.cardId).nameTh.includes('หุ่นยนต์แห่งการทำลาย'))
          .map((c) => ({ c, def: getCard(c.cardId) }))
          .sort((a, b) => b.def.cost - a.def.cost)
        const pick = matches[0]?.c
        let next = g
        if (pick) next = pickOmegaSearch(g, 'opponent', pick.instanceId)
        else next = skipOmegaSearch(g, 'opponent')
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Zul Alkata deck search
    if (
      game.interaction.type === 'alkata_deck_search' &&
      game.interaction.ownerId === 'opponent'
    ) {
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'alkata_deck_search') {
          set({ aiThinking: false })
          return
        }
        const matches = g.players.opponent.deck
          .filter(
            (c) =>
              isAlkataGod(c.cardId) &&
              getCard(c.cardId).effectId !== 'zul_alkata',
          )
          .map((c) => ({ c, def: getCard(c.cardId) }))
          .sort((a, b) => (b.def.atk ?? 0) - (a.def.atk ?? 0) || b.def.cost - a.def.cost)
        const pick = matches[0]?.c
        let next = g
        if (pick) next = pickAlkataDeckSearch(g, 'opponent', pick.instanceId)
        else next = skipAlkataDeckSearch(g, 'opponent')
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Alkata Mina deck summon
    if (
      game.interaction.type === 'alkata_mina_summon' &&
      game.interaction.ownerId === 'opponent'
    ) {
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'alkata_mina_summon') {
          set({ aiThinking: false })
          return
        }
        const matches = g.players.opponent.deck
          .filter((c) => isAlkataGod(c.cardId))
          .map((c) => ({ c, def: getCard(c.cardId) }))
          .sort((a, b) => (b.def.atk ?? 0) - (a.def.atk ?? 0) || b.def.cost - a.def.cost)
        const pick = matches[0]?.c
        let next = g
        if (pick) next = pickAlkataMinaSummon(g, 'opponent', pick.instanceId)
        else next = skipAlkataMinaSummon(g, 'opponent')
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Sorun ATK crush (on summon)
    if (
      game.interaction.type === 'alkata_debuff' &&
      game.interaction.ownerId === 'opponent'
    ) {
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (
          !g ||
          g.interaction.type !== 'alkata_debuff' ||
          g.interaction.ownerId !== 'opponent'
        ) {
          set({ aiThinking: false })
          return
        }
        const you = g.players.player
        const ranked = you.field
          .filter((m): m is NonNullable<typeof m> => !!m)
          .map((m) => ({
            m,
            atk: getEffectiveAtk(g, 'player', m.cardId, m.instanceId),
          }))
          .sort((a, b) => {
            const aKill = a.atk <= 3 ? 1 : 0
            const bKill = b.atk <= 3 ? 1 : 0
            if (aKill !== bKill) return bKill - aKill
            return b.atk - a.atk
          })
        const pick = ranked[0]?.m
        let next = g
        if (pick) next = pickAlkataDebuff(g, 'opponent', pick.instanceId)
        else next = cancelAlkataDebuff(g)
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Alkata GY recover / hand summon
    if (
      (game.interaction.type === 'alkata_gy_recover' ||
        game.interaction.type === 'alkata_hand_summon') &&
      game.interaction.ownerId === 'opponent'
    ) {
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (
          !g ||
          (g.interaction.type !== 'alkata_gy_recover' &&
            g.interaction.type !== 'alkata_hand_summon') ||
          g.interaction.ownerId !== 'opponent'
        ) {
          set({ aiThinking: false })
          return
        }
        const me = g.players.opponent
        let next = g
        if (g.interaction.type === 'alkata_gy_recover') {
          const pick = me.graveyard
            .filter((c) => getCard(c.cardId).nameTh.includes('เทพแห่งอัลคาทา'))
            .sort(
              (a, b) => (getCard(b.cardId).atk ?? 0) - (getCard(a.cardId).atk ?? 0),
            )[0]
          next = pick
            ? pickAlkataGyRecover(g, 'opponent', pick.instanceId)
            : skipAlkataGyRecover(g, 'opponent')
        } else {
          const pick = me.hand
            .filter((c) => canAlkataHandSummon(g, 'opponent', c.instanceId))
            .sort(
              (a, b) => (getCard(b.cardId).atk ?? 0) - (getCard(a.cardId).atk ?? 0),
            )[0]
          next = pick
            ? pickAlkataHandSummon(g, 'opponent', pick.instanceId)
            : skipAlkataHandSummon(g, 'opponent')
        }
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Hokana recycle (on summon)
    if (
      game.interaction.type === 'alkata_hokana_recycle' &&
      game.interaction.ownerId === 'opponent'
    ) {
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (
          !g ||
          g.interaction.type !== 'alkata_hokana_recycle' ||
          g.interaction.ownerId !== 'opponent'
        ) {
          set({ aiThinking: false })
          return
        }
        const pick = g.players.opponent.graveyard
          .filter((c) => getCard(c.cardId).nameTh.includes('เทพแห่งอัลคาทา'))
          .sort(
            (a, b) => (getCard(a.cardId).atk ?? 0) - (getCard(b.cardId).atk ?? 0),
          )[0]
        let next = g
        if (pick) next = pickAlkataRecycle(g, 'opponent', pick.instanceId)
        else next = skipAlkataRecycle(g)
        set({ game: next, aiThinking: false })
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Sora destroy
    if (
      game.interaction.type === 'sora_destroy' &&
      game.activePlayer === 'opponent'
    ) {
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'sora_destroy') {
          set({ aiThinking: false })
          return
        }
        const you = g.players.player
        const oppMonsters = you.field
          .filter((m): m is NonNullable<typeof m> => !!m)
          .map((m) => ({
            id: m.instanceId,
            power: getEffectiveAtk(g, 'player', m.cardId, m.instanceId),
          }))
          .sort((a, b) => b.power - a.power)
        const pick = oppMonsters[0]?.id
        let next = g
        if (pick) next = pickSoraDestroy(g, 'opponent', pick)
        else next = skipSoraDestroy(g, 'opponent')
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Beta extra destroy
    if (
      game.interaction.type === 'beta_extra_destroy' &&
      game.activePlayer === 'opponent'
    ) {
      const you = game.players.player
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'beta_extra_destroy') {
          set({ aiThinking: false })
          return
        }
        const ranked = you.field
          .filter((m): m is NonNullable<typeof m> => !!m)
          .map((m) => ({
            m,
            power: getEffectiveAtk(g, 'player', m.cardId, m.instanceId),
          }))
          .sort((a, b) => b.power - a.power)
        const pick = ranked[0]?.m
        let next = g
        if (pick) next = pickBetaExtraDestroy(g, 'opponent', pick.instanceId)
        else next = skipBetaExtraDestroy(g, 'opponent')
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Alkata's Plan — destroy our Alkata, draw 2
    if (
      game.interaction.type === 'alkata_plot' &&
      game.activePlayer === 'opponent'
    ) {
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'alkata_plot') {
          set({ aiThinking: false })
          return
        }
        const pick = g.players.opponent.field
          .filter((m): m is NonNullable<typeof m> => !!m && isAlkataGod(m.cardId))
          .sort((a, b) => (getCard(a.cardId).atk ?? 0) - (getCard(b.cardId).atk ?? 0))[0]
        let next = g
        if (pick) next = pickAlkataPlot(g, 'opponent', pick.instanceId)
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Special Modification targeting
    if (
      game.interaction.type === 'special_mod' &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'special_mod') {
          set({ aiThinking: false })
          return
        }
        const ranked = me.field
          .filter(
            (m): m is NonNullable<typeof m> =>
              !!m && getCard(m.cardId).nameTh.includes('หุ่นยนต์แห่งการทำลาย'),
          )
          .map((m) => ({
            m,
            power: getEffectiveAtk(g, 'opponent', m.cardId, m.instanceId),
          }))
          .sort((a, b) => b.power - a.power)
        const pick = ranked[0]?.m
        let next = g
        if (pick) next = pickSpecialMod(g, 'opponent', pick.instanceId)
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    // Opponent Soul Drain targeting
    if (
      game.interaction.type === 'soul_drain' &&
      game.activePlayer === 'opponent'
    ) {
      const me = game.players.opponent
      set({ aiThinking: true })
      window.setTimeout(() => {
        const g = get().game
        if (!g || g.interaction.type !== 'soul_drain') {
          set({ aiThinking: false })
          return
        }
        let next = g
        if (!g.interaction.sacrificeId) {
          const ranked = me.field
            .filter((m): m is NonNullable<typeof m> => !!m)
            .map((m) => ({
              m,
              power: getEffectiveAtk(g, 'opponent', m.cardId, m.instanceId),
            }))
            .sort((a, b) => a.power - b.power)
          const pick = ranked[0]?.m
          if (pick) next = pickSoulDrainSacrifice(g, 'opponent', pick.instanceId)
        } else {
          const sac = g.interaction.sacrificeId
          const ranked = me.field
            .filter(
              (m): m is NonNullable<typeof m> =>
                !!m && m.instanceId !== sac,
            )
            .map((m) => ({
              m,
              power: getEffectiveAtk(g, 'opponent', m.cardId, m.instanceId),
            }))
            .sort((a, b) => b.power - a.power)
          const pick = ranked[0]?.m
          if (pick) next = pickSoulDrainTarget(g, 'opponent', pick.instanceId)
        }
        set({ game: next, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, AI_STEP_MS)
      return
    }

    const choice = chooseAiAction(game)
    if (!choice) return

    const action = choice.apply
    const me = game.players.opponent
    const probe = action(game)

    // AI opened an activation-counter window for the player — wait
    if (
      probe.awaitingTrap &&
      probe.interaction.type === 'trap_response' &&
      probe.interaction.threat.window === 'on_activate'
    ) {
      const activator = probe.interaction.threat.activatorId ?? 'opponent'
      const responder = activator === 'player' ? 'opponent' : 'player'
      set({ game: probe, aiThinking: false })
      if (responder === 'opponent') {
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }
      return
    }

    // Spell staged on strip
    const stagedSpell = probe.players.opponent.spellTrap.find((c) => {
      const was = me.spellTrap.some((x) => x.instanceId === c.instanceId)
      return !was && getCard(c.cardId).type === 'spell' && !c.faceDown
    })
    if (stagedSpell) {
      set({
        game: probe,
        castFx: {
          owner: 'opponent',
          instanceId: stagedSpell.instanceId,
          kind: 'spell',
        },
        aiThinking: true,
      })
      window.setTimeout(() => {
        const g = get().game
        if (!g) return
        const still = g.players.opponent.spellTrap.find(
          (c) => c.instanceId === stagedSpell.instanceId,
        )
        if (
          still &&
          (getCard(still.cardId).effectId === 'soul_drain' ||
            getCard(still.cardId).effectId === 'special_mod' ||
            getCard(still.cardId).effectId === 'interference_signal' ||
            getCard(still.cardId).effectId === 'signal_amplifier' ||
            getCard(still.cardId).effectId === 'emergency_reinforce' ||
            getCard(still.cardId).effectId === 'alkata_call' ||
            getCard(still.cardId).effectId === 'alkata_plot' ||
            getCard(still.cardId).effectId === 'kata_guardian' ||
            getCard(still.cardId).effectId === 'kata_buddy' ||
            getCard(still.cardId).effectId === 'kata_hypnosis' ||
            getCard(still.cardId).effectId === 'kata_blink')
        ) {
          set({ castFx: null, aiThinking: false })
          setTimeout(() => get().tickAi(), AI_STEP_MS)
          return
        }
        const next = resolveSpell(g, 'opponent', stagedSpell.instanceId)
        set({ game: next, castFx: null, aiThinking: false })
        if (next.winner) {
          set({ screen: 'result' })
          return
        }
        setTimeout(() => get().tickAi(), AI_STEP_MS)
      }, CAST_MS)
      return
    }

    // Legacy full playSpell → spell went to GY; restage for visibility
    if (probe.players.opponent.graveyard.length > me.graveyard.length) {
      const added = probe.players.opponent.graveyard.find(
        (c) => !me.graveyard.some((x) => x.instanceId === c.instanceId),
      )
      if (added && getCard(added.cardId).type === 'spell') {
        // Card already consumed in probe — use stage from current hand if still there
        if (canPlaySpell(game, 'opponent', added.instanceId)) {
          runSpellCast(get, set, 'opponent', added.instanceId)
          return
        }
      }
    }

    if (choice.attack) {
      set({
        aiThinking: true,
        battleFx: {
          attackerId: choice.attack.attackerId,
          targetId: choice.attack.targetId,
        },
      })
      window.setTimeout(() => {
        set({ game: probe, battleFx: null, aiThinking: false })
        if (probe.winner) {
          set({ screen: 'result' })
          return
        }
        if (probe.interaction.type === 'beta_extra_destroy') {
          setTimeout(() => get().tickAi(), AI_STEP_MS)
          return
        }
        setTimeout(() => get().tickAi(), AI_AFTER_ATK_MS)
      }, FX_MS)
      return
    }

    set({ aiThinking: true })
    setTimeout(() => {
      set({ game: probe, aiThinking: false })
      if (probe.winner) {
        set({ screen: 'result' })
        return
      }
      setTimeout(() => get().tickAi(), AI_STEP_MS)
    }, 500)
  },
}))
