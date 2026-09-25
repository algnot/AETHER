export type Tribe = 'insect' | 'dragon' | 'warrior' | 'robot' | 'god' | 'mage'

export type CardType = 'monster' | 'spell' | 'trap'

/** Card pull / display rarity (strength-based) */
export type Rarity = 'C' | 'R' | 'SR' | 'UR'

export const RARITY_LABELS: Record<Rarity, string> = {
  C: 'Common',
  R: 'Rare',
  SR: 'Super Rare',
  UR: 'Ultra Rare',
}

export const RARITY_ORDER: Rarity[] = ['C', 'R', 'SR', 'UR']

export type Phase = 'draw' | 'main1' | 'battle' | 'main2' | 'end'

export type PlayerId = 'player' | 'opponent'

export type TribeLabel = Record<Tribe, string>

export const TRIBE_LABELS: TribeLabel = {
  insect: 'แมลง',
  dragon: 'มังกร',
  warrior: 'นักรบ',
  robot: 'หุ่นยนต์',
  god: 'เทพ',
  mage: 'จอมเวทย์',
}

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  monster: 'มอนสเตอร์',
  spell: 'เวทย์มนต์',
  trap: 'กับดัก',
}

export const PHASE_LABELS: Record<Phase, string> = {
  draw: 'Draw',
  main1: 'Main',
  battle: 'Battle',
  main2: 'Main 2',
  end: 'End',
}

export interface CardDefinition {
  id: string
  name: string
  nameTh: string
  type: CardType
  image: string
  cost: number
  /** Strength-based rarity (auto-assigned unless overridden) */
  rarity: Rarity
  /** Monster only */
  tribe?: Tribe
  atk?: number
  /** Spell/Trap/Monster effect id */
  effectId?:
    | 'energy_charge'
    | 'light_shield'
    | 'death_blast'
    | 'frontline_warrior'
    | 'support_unit'
    | 'iron_wall_warrior'
    | 'scout_unit'
    | 'call_reinforcements'
    | 'heavenly_voice'
    | 'kona_draw'
    | 'soul_drain'
    | 'emergency_reinforce'
    | 'soluy_swap'
    | 'sari_rally'
    | 'michael_scout'
    | 'mina_recruit'
    | 'sara_sacrifice'
    | 'sora_bomb'
    | 'sola_destroyer'
    | 'sigma_destroyer'
    | 'gamma_destroyer'
    | 'beta_destroyer'
    | 'omega_destroyer'
    | 'special_mod'
    | 'interference_signal'
    | 'signal_amplifier'
    | 'sorun_alkata'
    | 'sona_alkata'
    | 'zul_alkata'
    | 'yori_alkata'
    | 'mina_alkata'
    | 'hokana_alkata'
    | 'alkata_call'
    | 'alkata_plot'
    | 'shorin_mage'
    | 'agatha_mage'
    | 'noah_mage'
    | 'dynogr_mage'
    | 'saruka_mage'
    | 'ryuka_mage'
    | 'zeeka_mage'
    | 'kata_guardian'
    | 'kata_prepare'
    | 'kata_buddy'
    | 'kata_hypnosis'
    | 'kata_blink'
    | 'kata_barrier'
    | 'kata_intercept'
  description: string
}

export interface CardInstance {
  instanceId: string
  cardId: string
  /**
   * Who owns this card for GY / hand returns (set at deck build).
   * Control can change (Scout, Yori steal) but leaves go to this owner.
   */
  originalOwnerId?: PlayerId
  /** Ready to attack this turn */
  canAttack: boolean
  hasAttacked: boolean
  summonTurn: number
  /** Permanent ATK modifier from effects (e.g. Death Blast) */
  atkMod?: number
  /**
   * Zeeka OPT ATK boost stacks — permanent while on field, accumulates each use
   * (ATK + kata-in-GY per activation; not cleared at end of turn).
   */
  zeekaAtkBonus?: number
  /** Temporary ATK modifier cleared at end of turn */
  tempAtkMod?: number
  /**
   * ATK bonus cleared when the opponent of this card's controller ends their turn
   * (Saruka — +8 until opp EOT)
   */
  oppEotAtkMod?: number
  /** Cost override until end of turn (e.g. Shorin free spell/trap) */
  tempCostOverride?: number
  /** Destroyed when the controller's turn ends (e.g. Signal Amplifier) */
  destroyAtEndTurn?: boolean
  /** Destroyed when a Battle Phase begins (e.g. Call of Alkata) */
  destroyAtBattlePhase?: boolean
  /** Once-per-turn monster effect already used */
  effectUsed?: boolean
  /** Times this monster's activated effect was used this turn (e.g. Soluy ×2) */
  effectUses?: number
  /**
   * One battle-destruction save until this player ends their turn
   * (Guardian Incantation — consumed on first battle destroy, else cleared at EOT)
   */
  battleShieldUntil?: PlayerId
  /**
   * Continuous spell/trap: remaining controller turns on the ST zone
   * (Preparation Incantation — decremented at controller end turn)
   */
  continuousTurnsLeft?: number
  /**
   * Asleep: cannot attack until this player ends their turn
   * (Ryuka — sleep until end of opponent's next turn)
   */
  asleepUntil?: PlayerId
  /** Set face-down on spell/trap zone */
  faceDown?: boolean
  /** Cosmetic full-art frame (from inventory evolve) */
  evolved?: boolean
}

export interface PlayerState {
  id: PlayerId
  name: string
  hp: number
  energy: number
  /** Energy debt from trap costs, paid at start of next turn */
  pendingTrapCost: number
  /** Start-of-turn energy grant from the player's last turn (grows by +2 each of their turns) */
  turnEnergy: number
  /** Unused energy that came from being attacked — not limited by the end-of-turn carry cap */
  combatEnergy: number
  /** Optional Alkata leave-field trigger queues */
  alkataHandSummonsQueued?: number
  alkataGyRecoverQueued?: number
  /** Leave-field hand summon already used this turn (once per turn) */
  alkataHandSummonUsedThisTurn?: boolean
  /** Card IDs already special-summoned via Alkata leave-hand effect this turn */
  alkataHandSummonedCardIdsThisTurn?: string[]
  /**
   * Ryuka: nameTh of 「คาถา」 fetched from GY this turn — matching activations resolve twice
   */
  ryukaEchoNames?: string[]
  /** Ryuka: need to pick an opponent monster to sleep after a 「คาถา」 resolves */
  ryukaSleepPending?: boolean
  /** Zeeka: need to pick an opponent monster to ATK-debuff after a 「คาถา」 resolves */
  zeekaDebuffPending?: boolean
  /** Ryuka: queue a second resolution of this interactive effectId */
  ryukaDoubleQueued?: boolean
  ryukaDoubleEffectId?: string
  deck: CardInstance[]
  hand: CardInstance[]
  graveyard: CardInstance[]
  /** Monster zones */
  field: (CardInstance | null)[]
  /** Spell / trap strip (set cards stay here; no fixed slot limit beyond soft max) */
  spellTrap: CardInstance[]
}

export type GameScreen = 'menu' | 'deckbuilder' | 'gacha' | 'duel' | 'result'

export type InteractionMode =
  | { type: 'idle' }
  | { type: 'summon'; cardInstanceId: string }
  | { type: 'play_spell'; cardInstanceId: string }
  | { type: 'set_trap'; cardInstanceId: string }
  | { type: 'attack'; attackerInstanceId: string }
  | {
      type: 'trap_response'
      threat: {
        targetInstanceId: string
        attackerInstanceId: string
        window: 'on_attack' | 'on_destroy' | 'on_activate'
        /** on_activate — who activated the card/effect being countered */
        activatorId?: PlayerId
        sourceKind?: 'spell' | 'trap' | 'monster_effect'
        /** Monster effect resume key (effectId) after decline */
        resume?: string
        /** When countering a trap mid-attack window — restore this after decline */
        priorWindow?: 'on_attack' | 'on_destroy'
        priorTargetInstanceId?: string
        priorAttackerInstanceId?: string
      }
    }
  /** After declining intercept — finish casting this spell (skip re-offer) */
  | {
      type: 'resume_spell_cast'
      ownerId: PlayerId
      instanceId: string
    }
  /** After Call Reinforcements — summon warriors paying HP */
  | { type: 'reinforce'; summonsLeft: number; selectedInstanceId?: string }
  /** Hand over limit — discard until ≤ MAX_HAND */
  | { type: 'discard'; remaining: number; ownerId: PlayerId }
  /** Soul Drain — pick sacrifice then buff target on our field */
  | {
      type: 'soul_drain'
      spellInstanceId: string
      sacrificeId?: string
    }
  /** Special Modification — pick a Destruction Robot on our field to buff */
  | { type: 'special_mod'; spellInstanceId: string }
  /** Interference Signal — pick a Destruction Robot from deck to hand */
  | { type: 'interference_pick'; spellInstanceId: string }
  /** Signal Amplifier — pick Destruction Robots from GY to summon (up to 2) */
  | { type: 'signal_amp_pick'; spellInstanceId: string; remaining: number }
  /** Emergency Reinforcements — pick a monster from deck */
  | { type: 'emergency_pick'; spellInstanceId: string }
  /** Optional immediate summon after Emergency Reinforcements (ATK < 5) */
  | { type: 'emergency_summon'; cardInstanceId: string }
  /** Mina / Sara — pick a warrior from deck to summon */
  | {
      type: 'mina_recruit'
      resumeReinforce?: number
      source?: 'mina' | 'sara'
    }
  /** Sara Trainee — discard 1 from hand before deck recruit */
  | { type: 'sara_discard'; resumeReinforce?: number }
  /** Call of Alkata — discard 1 from hand */
  | { type: 'alkata_call_discard'; spellInstanceId: string }
  /** Call of Alkata — pick an Alkata god from deck to summon */
  | { type: 'alkata_call_summon'; spellInstanceId: string }
  /** Alkata's Plan — destroy one of our Alkata gods */
  | { type: 'alkata_plot'; spellInstanceId: string }
  /** Sola / Sigma / Gamma / Beta — choose energy or HP to pay summon cost */
  | {
      type: 'sola_pay'
      cardInstanceId: string
      zoneIndex?: number
    }
  /** Beta — pick another opponent monster to destroy after battle destroy */
  | { type: 'beta_extra_destroy' }
  /** Sora — pick any card on the field to destroy on summon */
  | { type: 'sora_destroy' }
  /** Omega — pick Destruction Robot cards from deck to hand (up to 2) */
  | { type: 'omega_search'; remaining: number }
  /** Zul — pick an Alkata god from deck to hand */
  | { type: 'alkata_deck_search'; ownerId: PlayerId }
  /** Alkata Mina — pick an Alkata god from deck to summon */
  | { type: 'alkata_mina_summon'; ownerId: PlayerId; sourceId: string }
  /** Soluy Air Soldier — bounce a warrior, then summon a warrior from hand */
  | {
      type: 'soluy_swap'
      sourceId: string
      bounceId?: string
    }
  /** Shorin — discard 1, then fetch 「คาถา」 from deck or GY */
  | {
      type: 'shorin_search'
      sourceId: string
      ownerId: PlayerId
      step: 'discard' | 'fetch'
    }
  /** Saruka — discard 1, then fetch 「คาถา」 from deck or GY */
  | {
      type: 'saruka_search'
      sourceId: string
      ownerId: PlayerId
      step: 'discard' | 'fetch'
    }
  /** Ryuka — discard 2, then fetch 「คาถา」 from GY (echo double this turn) */
  | {
      type: 'ryuka_fetch'
      sourceId: string
      ownerId: PlayerId
      step: 'discard' | 'fetch'
      /** Remaining discards while step === 'discard' */
      discardLeft?: number
    }
  /** Ryuka — put an opponent monster to sleep until their EOT */
  | { type: 'ryuka_sleep'; ownerId: PlayerId }
  /** Zeeka — debuff an opponent monster's ATK after 「คาถา」 */
  | { type: 'zeeka_debuff'; ownerId: PlayerId }
  /** Agatha — recycle คาถา from GY to deck, then fetch คาถา from deck; buff mages */
  | {
      type: 'agatha_search'
      sourceId: string
      ownerId: PlayerId
      step: 'gy' | 'deck'
    }
  /** Noah — mill a 「คาถา」 from deck to GY and resolve it as activated */
  | { type: 'noah_mill'; sourceId: string; ownerId: PlayerId }
  /** Guardian Incantation — pick a mage to lock on field until opp EOT */
  | {
      type: 'guardian_pick'
      spellInstanceId: string | null
      ownerId: PlayerId
    }
  /** Partner Incantation — pick up to 2 mages; combine ATK onto both */
  | {
      type: 'buddy_pick'
      spellInstanceId: string | null
      ownerId: PlayerId
      firstId?: string
    }
  /** Hypnosis Incantation — force 2 opponent monsters to battle each other */
  | {
      type: 'hypnosis_pick'
      spellInstanceId: string | null
      ownerId: PlayerId
      firstId?: string
    }
  /** Blink Incantation — summon a mage from deck or GY */
  | {
      type: 'teleport_pick'
      spellInstanceId: string | null
      ownerId: PlayerId
    }
  /** Alkata god left the field — add one from GY to hand */
  | { type: 'alkata_gy_recover'; ownerId: PlayerId }
  /** Alkata god left the field — optional special summon one from hand */
  | { type: 'alkata_hand_summon'; ownerId: PlayerId }
  /** Sorun — pick an opponent monster to ATK −3 (on summon) */
  | { type: 'alkata_debuff'; sourceId: string; ownerId: PlayerId }
  /** Hokana — return Alkata gods from GY to deck (2 picks) */
  | {
      type: 'alkata_hokana_recycle'
      sourceId: string
      remaining: number
      ownerId: PlayerId
    }

export interface GameLogEntry {
  id: string
  text: string
  turn: number
}

export interface GameState {
  turn: number
  activePlayer: PlayerId
  phase: Phase
  firstPlayer: PlayerId
  players: Record<PlayerId, PlayerState>
  winner: PlayerId | null
  log: GameLogEntry[]
  selectedCardId: string | null
  interaction: InteractionMode
  /** True while waiting for trap response */
  awaitingTrap: boolean
}

export interface DeckList {
  id: string
  name: string
  /** cardId -> count (1-3) */
  cards: Record<string, number>
  /**
   * How many copies of each cardId in this deck are evolved.
   * Missing key = 0 (normal). Always capped by cards[id] and owned evo.
   */
  evolved?: Record<string, number>
}
