import { useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { getCard } from '../data/cards'
import {
  canActivateSoluy,
  canActivateShorin,
  canActivateAgatha,
  canActivateNoah,
  canActivateSaruka,
  canActivateRyuka,
  canAlkataHandSummon,
  canPlaySpell,
  canReinforceSummon,
  canSoluySummonFromHand,
  canSummon,
  canTargetMonster,
  getEffectiveAtk,
  getEffectiveCost,
  isKataSpellOrTrap,
  canFreePlaceMonster,
  isBarrierAttackTarget,
  listTrapsForWindow,
} from '../engine/gameEngine'
import { useDraggableModals } from '../hooks/useDraggableModals'
import { useAppStore } from '../store/gameStore'
import { PHASE_LABELS, type Phase } from '../types/game'
import { CardInfoPanel } from './CardInfoPanel'
import { CardView } from './CardView'
import { TutorialCoach } from './TutorialCoach'
import './DuelBoard.css'

const PHASE_FLOW: Phase[] = ['main1', 'battle', 'main2', 'end']
const PHASE_TRACK: Phase[] = ['main1', 'battle', 'main2']
const DND_HAND = 'application/x-hand-card'

function nextPhaseLabel(phase: Phase): string {
  const i = PHASE_FLOW.indexOf(phase === 'draw' ? 'main1' : phase)
  if (i < 0 || i >= PHASE_FLOW.length - 1) return 'จบเทิร์น'
  const n = PHASE_FLOW[i + 1]
  if (n === 'end') return 'จบเทิร์น'
  return `ไป ${PHASE_LABELS[n]}`
}

function phaseStatus(
  canAct: boolean,
  busy: boolean,
  aiThinking: boolean,
  isPlayerTurn: boolean,
): string {
  if (busy) return 'กำลังเล่นการ์ด'
  if (aiThinking) return 'CPU คิด'
  if (!isPlayerTurn) return 'เทิร์น CPU'
  if (!canAct) return 'รอ'
  return ''
}

function centerOf(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function SideResources({
  energy,
  hp,
  side,
}: {
  energy: number
  hp: number
  side: 'you' | 'opp'
}) {
  const gems = Math.max(0, energy)
  return (
    <div className={`side-resources ${side}`}>
      <div
        className="life-under"
        title={`พลังชีวิต ${hp}`}
        data-coach={side === 'you' ? 'life-you' : 'life-opp'}
      >
        <span className="life-label">พลังชีวิต</span>
        <span className="life-heart" aria-hidden>
          ♥
        </span>
        <span className="life-num">{hp}</span>
      </div>
      <div
        className="energy-gems"
        title={`พลังงาน ${energy}`}
        data-coach={side === 'you' ? 'energy-you' : 'energy-opp'}
      >
        <span className="gems-label">พลังงาน</span>
        <div className="gems-row">
          {gems === 0 && <span className="gem-zero">0</span>}
          {Array.from({ length: gems }, (_, i) => (
            <span key={i} className="gem" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
        <span className="gems-num">{energy}</span>
      </div>
    </div>
  )
}

export function DuelBoard() {
  const game = useAppStore((s) => s.game)
  const aiThinking = useAppStore((s) => s.aiThinking)
  const battleFx = useAppStore((s) => s.battleFx)
  const castFx = useAppStore((s) => s.castFx)
  const nextPhase = useAppStore((s) => s.nextPhase)
  const onHandCardClick = useAppStore((s) => s.onHandCardClick)
  const onMonsterClick = useAppStore((s) => s.onMonsterClick)
  const onFieldZoneClick = useAppStore((s) => s.onFieldZoneClick)
  const onSpellTrapZoneClick = useAppStore((s) => s.onSpellTrapZoneClick)
  const onDirectAttack = useAppStore((s) => s.onDirectAttack)
  const onTrapRespond = useAppStore((s) => s.onTrapRespond)
  const finishReinforce = useAppStore((s) => s.finishReinforce)
  const pickEmergencyCard = useAppStore((s) => s.pickEmergencyCard)
  const pickInterferenceCard = useAppStore((s) => s.pickInterferenceCard)
  const pickShorinCard = useAppStore((s) => s.pickShorinCard)
  const cancelShorin = useAppStore((s) => s.cancelShorin)
  const pickSarukaCard = useAppStore((s) => s.pickSarukaCard)
  const cancelSaruka = useAppStore((s) => s.cancelSaruka)
  const pickRyukaCard = useAppStore((s) => s.pickRyukaCard)
  const cancelRyuka = useAppStore((s) => s.cancelRyuka)
  const cancelRyukaSleepPick = useAppStore((s) => s.cancelRyukaSleepPick)
  const pickAgathaCard = useAppStore((s) => s.pickAgathaCard)
  const cancelAgatha = useAppStore((s) => s.cancelAgatha)
  const pickNoahCard = useAppStore((s) => s.pickNoahCard)
  const cancelNoah = useAppStore((s) => s.cancelNoah)
  const cancelBuddy = useAppStore((s) => s.cancelBuddy)
  const cancelHypnosis = useAppStore((s) => s.cancelHypnosis)
  const pickTeleportCard = useAppStore((s) => s.pickTeleportCard)
  const cancelTeleport = useAppStore((s) => s.cancelTeleport)
  const pickSignalAmpCard = useAppStore((s) => s.pickSignalAmpCard)
  const skipSignalAmpPick = useAppStore((s) => s.skipSignalAmpPick)
  const skipEmergency = useAppStore((s) => s.skipEmergency)
  const pickMinaCard = useAppStore((s) => s.pickMinaCard)
  const skipMina = useAppStore((s) => s.skipMina)
  const cancelSoluy = useAppStore((s) => s.cancelSoluy)
  const confirmSolaPay = useAppStore((s) => s.confirmSolaPay)
  const cancelSolaPay = useAppStore((s) => s.cancelSolaPay)
  const skipBetaExtra = useAppStore((s) => s.skipBetaExtra)
  const pickOmegaCard = useAppStore((s) => s.pickOmegaCard)
  const skipOmega = useAppStore((s) => s.skipOmega)
  const pickAlkataDeckCard = useAppStore((s) => s.pickAlkataDeckCard)
  const skipAlkataDeck = useAppStore((s) => s.skipAlkataDeck)
  const pickAlkataMinaCard = useAppStore((s) => s.pickAlkataMinaCard)
  const skipAlkataMina = useAppStore((s) => s.skipAlkataMina)
  const pickAlkataCallCard = useAppStore((s) => s.pickAlkataCallCard)
  const skipAlkataCall = useAppStore((s) => s.skipAlkataCall)
  const pickAlkataGyCard = useAppStore((s) => s.pickAlkataGyCard)
  const skipAlkataGy = useAppStore((s) => s.skipAlkataGy)
  const skipAlkataHand = useAppStore((s) => s.skipAlkataHand)
  const cancelAlkataCrush = useAppStore((s) => s.cancelAlkataCrush)
  const pickAlkataRecycleCard = useAppStore((s) => s.pickAlkataRecycleCard)
  const skipAlkataRecyclePick = useAppStore((s) => s.skipAlkataRecyclePick)
  const hoverCard = useAppStore((s) => s.hoverCard)
  const dropSummon = useAppStore((s) => s.dropSummon)
  const dropSpellTrap = useAppStore((s) => s.dropSpellTrap)
  const leaveDuel = useAppStore((s) => s.leaveDuel)

  const [dragOverZone, setDragOverZone] = useState<number | null>(null)
  const [dragOverSt, setDragOverSt] = useState(false)
  const [dragKind, setDragKind] = useState<'monster' | 'st' | null>(null)
  const [lungeOffset, setLungeOffset] = useState<{ x: number; y: number } | null>(null)
  const [gyView, setGyView] = useState<'player' | 'opponent' | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const tutorialMode = useAppStore((s) => s.tutorialMode)
  const tutorialGuide = useAppStore((s) => s.tutorialGuide)
  const forceCardId = tutorialGuide?.forceCardId ?? null
  const highlightCardId = tutorialGuide?.highlightCardId ?? forceCardId

  const zoneRefs = useRef(new Map<string, HTMLElement>())
  const oppDirectRef = useRef<HTMLDivElement>(null)
  const youDirectRef = useRef<HTMLDivElement>(null)
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null)
  useDraggableModals(stageEl)

  const setZoneRef = (instanceId: string | undefined, el: HTMLElement | null) => {
    if (!instanceId) return
    if (el) zoneRefs.current.set(instanceId, el)
    else zoneRefs.current.delete(instanceId)
  }

  useLayoutEffect(() => {
    if (!battleFx || !game) {
      setLungeOffset(null)
      return
    }
    const atkEl = zoneRefs.current.get(battleFx.attackerId)
    const attackerIsPlayer = game.players.player.field.some(
      (m) => m?.instanceId === battleFx.attackerId,
    )
    if (!atkEl) {
      setLungeOffset({ x: 0, y: attackerIsPlayer ? -120 : 120 })
      return
    }
    const from = centerOf(atkEl)
    let to: { x: number; y: number }
    if (battleFx.targetId === 'direct') {
      // Player attacks toward opponent HP; CPU attacks toward player HP
      const directEl = attackerIsPlayer
        ? oppDirectRef.current
        : youDirectRef.current
      to = directEl
        ? centerOf(directEl)
        : { x: from.x, y: from.y + (attackerIsPlayer ? -160 : 160) }
    } else {
      const tgtEl = zoneRefs.current.get(battleFx.targetId)
      to = tgtEl
        ? centerOf(tgtEl)
        : { x: from.x, y: from.y + (attackerIsPlayer ? -140 : 140) }
    }
    setLungeOffset({
      x: (to.x - from.x) * 0.78,
      y: (to.y - from.y) * 0.78,
    })
  }, [battleFx, game])

  if (!game) return null

  const { player, opponent } = game.players
  const isPlayerTurn = game.activePlayer === 'player'
  const discarding =
    game.interaction.type === 'discard' &&
    game.interaction.ownerId === 'player'
  const saraDiscarding = game.interaction.type === 'sara_discard'
  const alkataCallDiscarding = game.interaction.type === 'alkata_call_discard'
  const alkataCallSummoning = game.interaction.type === 'alkata_call_summon'
  const soulDraining = game.interaction.type === 'soul_drain'
  const alkataPlotting = game.interaction.type === 'alkata_plot'
  const specialModding = game.interaction.type === 'special_mod'
  const guardianPicking =
    game.interaction.type === 'guardian_pick' &&
    game.interaction.ownerId === 'player'
  const buddyPicking =
    game.interaction.type === 'buddy_pick' &&
    game.interaction.ownerId === 'player'
  const buddyFirstId =
    game.interaction.type === 'buddy_pick'
      ? game.interaction.firstId
      : undefined
  const hypnosisPicking =
    game.interaction.type === 'hypnosis_pick' &&
    game.interaction.ownerId === 'player'
  const hypnosisFirstId =
    game.interaction.type === 'hypnosis_pick'
      ? game.interaction.firstId
      : undefined
  const teleportPicking =
    game.interaction.type === 'teleport_pick' &&
    game.interaction.ownerId === 'player'
  const interferencePicking = game.interaction.type === 'interference_pick'
  const signalAmpPicking = game.interaction.type === 'signal_amp_pick'
  const signalAmpRemaining =
    game.interaction.type === 'signal_amp_pick'
      ? game.interaction.remaining
      : 0
  const emergencyPick = game.interaction.type === 'emergency_pick'
  const emergencySummon = game.interaction.type === 'emergency_summon'
  const minaRecruit = game.interaction.type === 'mina_recruit'
  const minaRecruitTitle =
    game.interaction.type === 'mina_recruit' && game.interaction.source === 'sara'
      ? 'ซาร่า — เลือกนักรบจากเด็ค'
      : 'มีน่า — เลือกนักรบจากเด็ค (ยกเว้นมีน่า)'
  const soluySwapping = game.interaction.type === 'soluy_swap'
  const shorinSearching = game.interaction.type === 'shorin_search'
  const shorinStep =
    game.interaction.type === 'shorin_search' ? game.interaction.step : null
  const shorinDiscarding = shorinSearching && shorinStep === 'discard'
  const shorinFetching = shorinSearching && shorinStep === 'fetch'
  const sarukaSearching = game.interaction.type === 'saruka_search'
  const sarukaStep =
    game.interaction.type === 'saruka_search' ? game.interaction.step : null
  const sarukaDiscarding = sarukaSearching && sarukaStep === 'discard'
  const sarukaFetching = sarukaSearching && sarukaStep === 'fetch'
  const ryukaSearching = game.interaction.type === 'ryuka_fetch'
  const ryukaStep =
    game.interaction.type === 'ryuka_fetch' ? game.interaction.step : null
  const ryukaDiscardLeft =
    game.interaction.type === 'ryuka_fetch'
      ? (game.interaction.discardLeft ?? 0)
      : 0
  const ryukaDiscarding = ryukaSearching && ryukaStep === 'discard'
  const ryukaFetching = ryukaSearching && ryukaStep === 'fetch'
  const ryukaSleeping =
    game.interaction.type === 'ryuka_sleep' &&
    game.interaction.ownerId === 'player'
  const agathaSearching = game.interaction.type === 'agatha_search'
  const agathaStep =
    game.interaction.type === 'agatha_search' ? game.interaction.step : null
  const noahMilling = game.interaction.type === 'noah_mill'
  const solaPaying = game.interaction.type === 'sola_pay'
  const betaExtraDestroy = game.interaction.type === 'beta_extra_destroy'
  const soraDestroying = game.interaction.type === 'sora_destroy'
  const omegaSearching = game.interaction.type === 'omega_search'
  const omegaRemaining =
    game.interaction.type === 'omega_search' ? game.interaction.remaining : 0
  const alkataDeckSearch =
    game.interaction.type === 'alkata_deck_search' &&
    game.interaction.ownerId === 'player'
  const alkataMinaSummon =
    game.interaction.type === 'alkata_mina_summon' &&
    game.interaction.ownerId === 'player'
  const alkataGyRecover =
    game.interaction.type === 'alkata_gy_recover' &&
    game.interaction.ownerId === 'player'
  const alkataHandSummon =
    game.interaction.type === 'alkata_hand_summon' &&
    game.interaction.ownerId === 'player'
  const alkataDebuffing =
    game.interaction.type === 'alkata_debuff' &&
    game.interaction.ownerId === 'player'
  const alkataRecycling =
    game.interaction.type === 'alkata_hokana_recycle' &&
    game.interaction.ownerId === 'player'
  const alkataRecycleRemaining =
    game.interaction.type === 'alkata_hokana_recycle' &&
    game.interaction.ownerId === 'player'
      ? game.interaction.remaining
      : 0
  const soluyBounceId =
    game.interaction.type === 'soluy_swap'
      ? game.interaction.bounceId
      : undefined
  const soluySourceId =
    game.interaction.type === 'soluy_swap'
      ? game.interaction.sourceId
      : undefined
  const emergencyCardId =
    game.interaction.type === 'emergency_summon'
      ? game.interaction.cardInstanceId
      : null
  const soulSacrificeId =
    game.interaction.type === 'soul_drain'
      ? game.interaction.sacrificeId
      : undefined
  const canAct =
    isPlayerTurn &&
    !game.winner &&
    !game.awaitingTrap &&
    !discarding &&
    !saraDiscarding &&
    !sarukaSearching &&
    !ryukaSearching &&
    !ryukaSleeping &&
    !shorinSearching &&
    !alkataCallDiscarding &&
    !alkataCallSummoning &&
    !soulDraining &&
    !alkataPlotting &&
    !specialModding &&
    !guardianPicking &&
    !buddyPicking &&
    !hypnosisPicking &&
    !teleportPicking &&
    !interferencePicking &&
    !signalAmpPicking &&
    !emergencyPick &&
    !emergencySummon &&
    !minaRecruit &&
    !soluySwapping &&
    !solaPaying &&
    !betaExtraDestroy &&
    !soraDestroying &&
    !omegaSearching &&
    !alkataDeckSearch &&
    !alkataMinaSummon &&
    !alkataGyRecover &&
    !alkataHandSummon &&
    !alkataDebuffing &&
    !alkataRecycling &&
    !aiThinking &&
    !battleFx &&
    !castFx
  const statusLine = phaseStatus(
    canAct,
    !!battleFx || !!castFx,
    aiThinking,
    isPlayerTurn,
  )
  const attacking =
    game.interaction.type === 'attack' ? game.interaction.attackerInstanceId : null
  const summoning =
    game.interaction.type === 'summon' ? game.interaction.cardInstanceId : null
  const playingSpell =
    game.interaction.type === 'play_spell' ? game.interaction.cardInstanceId : null
  const reinforcing = game.interaction.type === 'reinforce'
  const discardLeft =
    game.interaction.type === 'discard' &&
    game.interaction.ownerId === 'player'
      ? game.interaction.remaining
      : 0
  const reinforceSelected =
    game.interaction.type === 'reinforce'
      ? game.interaction.selectedInstanceId
      : null
  const reinforceLeft =
    game.interaction.type === 'reinforce' ? game.interaction.summonsLeft : 0
  const canDirect =
    game.interaction.type === 'attack' &&
    opponent.field.every((z) => z === null)

  // Show trap UI whenever the player has an eligible response (attack or activate)
  const playerTrapWindow =
    game.awaitingTrap &&
    game.interaction.type === 'trap_response' &&
    (() => {
      const threat = game.interaction.threat
      const traps = listTrapsForWindow(player, threat.window, {
        allowBarrier:
          threat.window === 'on_attack' &&
          isBarrierAttackTarget(game, 'player', threat.targetInstanceId),
      })
      return traps.length > 0
    })()
  const trapWindow =
    game.interaction.type === 'trap_response'
      ? game.interaction.threat.window
      : null
  const eligibleTraps =
    playerTrapWindow && trapWindow
      ? listTrapsForWindow(player, trapWindow, {
          allowBarrier:
            trapWindow === 'on_attack' &&
            game.interaction.type === 'trap_response' &&
            isBarrierAttackTarget(
              game,
              'player',
              game.interaction.threat.targetInstanceId,
            ),
        })
      : []
  const trapOfferName = (() => {
    if (trapWindow === 'on_destroy') return 'โล่แห่งแสง'
    if (trapWindow === 'on_activate') return 'คาถาสกัดกั้น'
    const hasBarrier = eligibleTraps.some(
      (c) => getCard(c.cardId).effectId === 'kata_barrier',
    )
    const hasBlast = eligibleTraps.some(
      (c) => getCard(c.cardId).effectId === 'death_blast',
    )
    if (hasBarrier && !hasBlast) return 'คาถาบาเรีย'
    if (hasBlast && !hasBarrier) return 'ระเบิดความตาย'
    return 'กับดัก'
  })()
  const trapOfferHint =
    trapWindow === 'on_activate'
      ? 'อีกฝ่ายเปิดใช้การ์ด/เอฟเฟค — ใช้คาถาสกัดกั้นเพื่อยกเลิกและทำลายทิ้ง แล้วจอมเวทย์ฝั่งเรา ATK +3 จนจบเทิร์น'
      : trapWindow === 'on_attack'
      ? eligibleTraps.length > 1
        ? 'อีกฝ่ายโจมตี — เลือกกับดัก 1 ใบ (ระเบิดความตาย: ATK −2 ทั้งสนาม / คาถาบาเรีย: ยกเลิกการโจมตี + ATK เป้าหมายครึ่งหนึ่ง)'
        : eligibleTraps.some((c) => getCard(c.cardId).effectId === 'kata_barrier')
          ? 'อีกฝ่ายโจมตีจอมเวทย์ — ใช้คาถาบาเรียเพื่อยกเลิกการโจมตีและลด ATK เป้าหมายลงครึ่งหนึ่ง'
          : 'อีกฝ่ายโจมตี — ใช้ระเบิดความตายจากมือเพื่อลด ATK มอนสเตอร์บนสนามอีกฝ่ายทุกตัว −2'
      : eligibleTraps.length > 1
        ? `มอนสเตอร์จะถูกทำลาย — เลือก${trapOfferName} 1 ใบจากมือ (ใช้ได้ใบเดียว)`
        : 'มอนสเตอร์จะถูกทำลาย — ใช้โล่แห่งแสงจากมือได้'

  const latestLog = game.log[0]?.text
  const currentPhase =
    game.phase === 'draw' || game.phase === 'end' ? 'main1' : game.phase

  const onHandDragStart = (e: DragEvent, instanceId: string, kind: 'monster' | 'st') => {
    e.dataTransfer.setData(DND_HAND, `${kind}:${instanceId}`)
    e.dataTransfer.setData('text/plain', `${kind}:${instanceId}`)
    e.dataTransfer.effectAllowed = 'move'
    setDragKind(kind)
    setDragOverZone(null)
    setDragOverSt(false)
  }

  const clearDrag = () => {
    setDragKind(null)
    setDragOverZone(null)
    setDragOverSt(false)
  }

  const parseDrag = (e: DragEvent) => {
    const raw =
      e.dataTransfer.getData(DND_HAND) || e.dataTransfer.getData('text/plain')
    const [kind, id] = raw.split(':')
    return { kind, id }
  }

  const onMonsterZoneDrop = (e: DragEvent, zoneIndex: number) => {
    e.preventDefault()
    const { kind, id } = parseDrag(e)
    clearDrag()
    if (kind === 'monster' && id) dropSummon(id, zoneIndex)
  }

  const onStZoneDrop = (e: DragEvent) => {
    e.preventDefault()
    const { kind, id } = parseDrag(e)
    clearDrag()
    if (kind === 'st' && id) dropSpellTrap(id)
  }

  const stHint =
    discarding
      ? `มือเกินลิมิต — คลิกทิ้งการ์ด (เหลือ ${discardLeft} ใบ)`
      : saraDiscarding
        ? 'ซาร่า — เลือกทิ้งการ์ดจากมือ 1 ใบ เพื่ออัญเชิญนักรบจากเด็ค'
        : sarukaDiscarding
          ? 'ซารุกะ — ทิ้งการ์ดจากมือ 1 ใบ'
          : sarukaFetching
            ? 'ซารุกะ — เลือก「คาถา」จากเด็คหรือสุสานขึ้นมือ'
          : shorinDiscarding
            ? 'โชริน — ทิ้งการ์ดจากมือ 1 ใบ'
          : shorinFetching
            ? 'โชริน — เลือก「คาถา」จากเด็คหรือสุสานขึ้นมือ'
          : ryukaDiscarding
            ? `ริวกะ — ทิ้งการ์ดจากมือ (เหลือ ${ryukaDiscardLeft} ใบ)`
          : ryukaFetching
            ? 'ริวกะ — เลือก「คาถา」จากสุสานขึ้นมือ'
          : ryukaSleeping
            ? 'ริวกะ — เลือกมอนสเตอร์ฝ่ายตรงข้ามให้นอนจนจบเทิร์นของอีกฝ่าย'
        : alkataCallDiscarding
          ? 'เสียงเรียกของอัลคาทา — ทิ้งการ์ดจากมือ 1 ใบ'
        : alkataCallSummoning
          ? 'เสียงเรียกของอัลคาทา — เลือกเทพแห่งอัลคาทาจากเด็คเพื่ออัญเชิญ'
        : soluySwapping
          ? soluyBounceId
            ? 'โซลุย — เลือกนักรบจากมือเพื่ออัญเชิญ (ตัวที่เพิ่งขึ้นมือเลือกได้)'
            : 'โซลุย — เลือกนักรบ (ไม่ใช่โซลุย) เพื่อส่งกลับขึ้นมือ'
          : emergencyPick
            ? 'กำลังเสริมฉุกเฉิน — เลือกมอนสเตอร์จากเด็ค'
            : interferencePicking
              ? 'สัญญาณแทรกซ้อน — เลือกหุ่นยนต์แห่งการทำลายจากเด็คขึ้นมือ'
            : signalAmpPicking
              ? `เครื่องขยายสัญญาณ — เลือกจากสุสานอัญเชิญ (เหลือ ${signalAmpRemaining})`
            : minaRecruit
              ? `${minaRecruitTitle} เพื่ออัญเชิญลงสนาม`
              : emergencySummon
                ? 'ATK < 5 — คลิกโซนว่างเพื่ออัญเชิญทันที หรือกดเก็บไว้ในมือ'
                : soulDraining
                  ? soulSacrificeId
                    ? 'สูบวิญญาณ — เลือกมอนสเตอร์ที่จะรับ ATK'
                    : 'สูบวิญญาณ — เลือกมอนสเตอร์ที่จะส่งลงสุสาน'
                  : alkataPlotting
                    ? 'การวางแผนของอัลคาทา — เลือกเทพแห่งอัลคาทาบนสนามเราเพื่อทำลาย แล้วจั่ว 2 ใบ'
                  : specialModding
                    ? 'ดัดแปลงขั้นพิเศษ — เลือกหุ่นยนต์แห่งการทำลายบนสนามเรา'
                  : guardianPicking
                    ? 'คาถาผู้ป้องกัน — เลือกจอมเวทย์บนสนามเราเพื่อล็อกจนจบเทิร์นฝ่ายตรงข้าม'
                  : buddyPicking
                    ? buddyFirstId
                      ? 'คาถาคู่หู — เลือกจอมเวทย์ตัวที่สองเพื่อรวมพลังโจมตีจนจบเทิร์น'
                      : 'คาถาคู่หู — เลือกจอมเวทย์ตัวแรกบนสนามเรา'
                  : hypnosisPicking
                    ? hypnosisFirstId
                      ? 'คาถาสะกดจิต — เลือกมอนสเตอร์ฝ่ายตรงข้ามตัวที่สองให้ต่อสู้กัน'
                      : 'คาถาสะกดจิต — เลือกมอนสเตอร์ฝ่ายตรงข้ามตัวแรก'
                  : teleportPicking
                    ? 'คาถาย้ายฉับพลัน — เลือกมอนสเตอร์จอมเวทย์จากเด็คหรือสุสานเพื่ออัญเชิญ'
                  : betaExtraDestroy
                    ? 'เบต้า — เลือกมอนสเตอร์ฝ่ายตรงข้ามเพื่อทำลายเพิ่ม หรือกดข้าม'
                  : soraDestroying
                    ? 'โซระ — เลือกมอนสเตอร์ฝ่ายตรงข้าม 1 ตัวเพื่อทำลาย'
                  : omegaSearching
                    ? `โอเมก้า — เลือกหุ่นยนต์แห่งการทำลายจากเด็คขึ้นมือ (เหลือ ${omegaRemaining} ใบ)`
                  : alkataDeckSearch
                    ? 'ซูล — เลือกเทพแห่งอัลคาทาจากเด็คขึ้นมือ 1 ใบ (ยกเว้นซูล)'
                  : alkataMinaSummon
                    ? 'มิน่า — เลือกเทพแห่งอัลคาทาจากเด็คเพื่ออัญเชิญ 1 ใบ'
                  : alkataGyRecover
                    ? 'เทพแห่งอัลคาทา — เลือกเทพแห่งอัลคาทาจากสุสานขึ้นมือ 1 ใบ'
                  : alkataHandSummon
                    ? 'เทพแห่งอัลคาทาออกจากสนาม — คลิกเทพแห่งอัลคาทาในมือเพื่ออัญเชิญ (ใบเดิมเทิร์นละครั้ง) หรือข้าม'
                  : alkataDebuffing
                    ? 'โซรุนอัญเชิญ — เลือกมอนสเตอร์ฝ่ายตรงข้าม ATK −3 (เหลือ 0 จะถูกทำลาย)'
                  : alkataRecycling
                    ? `โฮคาน่า — เลือกเทพแห่งอัลคาทาจากสุสานกลับเข้าเด็ค (เหลือ ${alkataRecycleRemaining} ใบ)`
                  : playingSpell
                    ? 'ลากหรือคลิกแถบเวทย์เพื่อใช้การ์ด'
                    : summoning || reinforceSelected
                      ? 'ลากหรือคลิกโซนว่างเพื่อลงมอนสเตอร์'
                      : reinforcing
                        ? `ขอกำลังเสริม — เลือกนักรบจากมือ (เหลือ ${reinforceLeft} ครั้ง · จ่ายด้วย HP)`
                        : null

  const gyCards =
    gyView === 'player'
      ? player.graveyard
      : gyView === 'opponent'
        ? opponent.graveyard
        : []
  const gyTitle =
    gyView === 'player' ? 'สุสาน — คุณ' : gyView === 'opponent' ? 'สุสาน — CPU' : ''

  const logGroups: { turn: number; entries: typeof game.log }[] = []
  for (const entry of game.log) {
    const last = logGroups[logGroups.length - 1]
    if (last && last.turn === entry.turn) last.entries.push(entry)
    else logGroups.push({ turn: entry.turn, entries: [entry] })
  }

  return (
    <div className="duel-root">
      <CardInfoPanel cardId={game.selectedCardId} />

      <div className="duel-stage" ref={setStageEl}>
        <div className="stage-bg" aria-hidden />

        <header className="duel-topbar">
          <button type="button" className="exit-btn" onClick={leaveDuel}>
            {tutorialMode ? 'ออกจากฝึก' : 'ออก'}
          </button>

          <div className="fighter opp">
            <span className="fighter-name">{opponent.name}</span>
          </div>

          <div className="fighter you">
            <span className="fighter-name">{player.name}</span>
            {tutorialMode && <span className="fighter-mode">โหมดสอน</span>}
            {player.pendingTrapCost > 0 && (
              <span className="fighter-debt">หนี้ −{player.pendingTrapCost}</span>
            )}
          </div>
        </header>

        <div className="board">
          <div className="opp-hand">
            {opponent.hand.map((c) => (
              <CardView key={c.instanceId} faceDown size="tiny" />
            ))}
          </div>

          <div className="board-play">
            <div className="field-frame">
              <div className="side-resources-wrap opp">
                <div ref={oppDirectRef} className="direct-aim" aria-hidden />
                <SideResources energy={opponent.energy} hp={opponent.hp} side="opp" />
              </div>

              <div className="st-rail">
                <span className="rail-label">เวทย์ / กับดัก</span>
                <div className="st-strip opp-st">
                {opponent.spellTrap.length === 0 ? (
                  <span className="st-empty">ว่าง</span>
                ) : (
                  opponent.spellTrap.map((c, i) => {
                    const casting = castFx?.instanceId === c.instanceId
                    const def = getCard(c.cardId)
                    // Spells are always face-up; traps face-down until activated
                    const faceDown =
                      def.type === 'spell'
                        ? false
                        : casting && castFx?.kind === 'trap_activate'
                          ? false
                          : !!c.faceDown
                    return (
                      <div
                        key={c.instanceId}
                        className={`st-slot ${casting ? `casting cast-${castFx!.kind}` : ''}`}
                        style={{ zIndex: casting ? 30 : i + 1 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!faceDown) hoverCard(c.cardId)
                        }}
                      >
                        <CardView
                          instance={c}
                          cardId={c.cardId}
                          size="tiny"
                          faceDown={faceDown}
                          selected={false}
                          onClick={() => !faceDown && hoverCard(c.cardId)}
                          onMouseEnter={() => !faceDown && hoverCard(c.cardId)}
                        />
                        {!faceDown &&
                          c.continuousTurnsLeft != null &&
                          c.continuousTurnsLeft > 0 && (
                            <span
                              className="st-continuous-turns"
                              title={`เหลือ ${c.continuousTurnsLeft} เทิร์น`}
                            >
                              {c.continuousTurnsLeft}
                            </span>
                          )}
                      </div>
                    )
                  })
                )}
                </div>
              </div>

              <div className="zone-rail" data-coach="zones-opp">
                <span className="rail-label">โซนมอนสเตอร์</span>
                <div className="field-row opp-field">
                <button
                  type="button"
                  className="pile gy"
                  onClick={() => setGyView('opponent')}
                  title="ดูสุสาน"
                >
                  <span>GY</span>
                  <b>{opponent.graveyard.length}</b>
                </button>
                {opponent.field.map((m, i) => {
                  const protectedTarget =
                    !!m &&
                    attacking !== null &&
                    !canTargetMonster(game, 'player', m.instanceId)
                  return (
                  <div
                    key={`o-${i}`}
                    className={`zone ${battleFx?.targetId === m?.instanceId ? 'impact' : ''}`}
                    ref={(el) => setZoneRef(m?.instanceId, el)}
                  >
                    {m ? (
                      <CardView
                        instance={m}
                        className={m.fieldLockUntil ? 'field-locked' : ''}
                        size="tiny"
                        exhausted={!!m.hasAttacked || !!m.asleepUntil}
                        atkDisplay={getEffectiveAtk(
                          game,
                          'opponent',
                          m.cardId,
                          m.instanceId,
                        )}
                        selected={
                          (attacking !== null &&
                            !m.hasAttacked &&
                            !protectedTarget) ||
                          betaExtraDestroy ||
                          soraDestroying ||
                          alkataDebuffing ||
                          ryukaSleeping ||
                          (hypnosisPicking && m.instanceId !== hypnosisFirstId) ||
                          hypnosisFirstId === m.instanceId
                        }
                        dimmed={
                          protectedTarget ||
                          (hypnosisPicking && m.instanceId === hypnosisFirstId)
                        }
                        fx={
                          battleFx?.attackerId === m.instanceId && lungeOffset
                            ? 'lunge'
                            : battleFx?.targetId === m.instanceId
                              ? 'hit'
                              : null
                        }
                        fxOffset={
                          battleFx?.attackerId === m.instanceId
                            ? lungeOffset ?? undefined
                            : undefined
                        }
                        onClick={() => {
                          hoverCard(m.cardId)
                          onMonsterClick(m.instanceId, 'opponent')
                        }}
                        onMouseEnter={() => hoverCard(m.cardId)}
                      />
                    ) : null}
                  </div>
                  )
                })}
                <div className="pile deck" title="เด็ค">
                  <span>DECK</span>
                  <b>{opponent.deck.length}</b>
                  <div className="deck-stack" aria-hidden />
                </div>
              </div>
              </div>

              <div className="field-divider" aria-hidden />

              <div className="zone-rail" data-coach="zones-you">
                <span className="rail-label">โซนมอนสเตอร์</span>
                <div
                  className={`field-row you-field ${summoning || reinforceSelected || emergencySummon || (reinforcing && dragKind === 'monster') ? 'summoning-lit' : ''}`}
                  data-coach="summon-zones"
                >
                <button
                  type="button"
                  className="pile gy"
                  onClick={() => setGyView('player')}
                  title="ดูสุสาน"
                >
                  <span>GY</span>
                  <b>{player.graveyard.length}</b>
                </button>
                {player.field.map((m, i) => (
                  <div
                    key={`p-${i}`}
                    ref={(el) => setZoneRef(m?.instanceId, el)}
                    className={`zone ${attacking === m?.instanceId ? 'attacking' : ''} ${dragOverZone === i ? 'drop-ready' : ''} ${(summoning || reinforceSelected || emergencySummon || (reinforcing && dragKind === 'monster')) && !m ? 'summon-target' : ''} ${battleFx?.targetId === m?.instanceId ? 'impact' : ''}`}
                    onDragOver={(e) => {
                      if (!canAct || dragKind !== 'monster' || m) {
                        e.dataTransfer.dropEffect = 'none'
                        return
                      }
                      if (
                        !reinforcing &&
                        game.interaction.type !== 'summon' &&
                        dragKind === 'monster'
                      ) {
                        // allow drop summon from hand
                      }
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverZone(i)
                    }}
                    onDragLeave={() => setDragOverZone(null)}
                    onDrop={(e) => onMonsterZoneDrop(e, i)}
                    onClick={() => {
                      if (!m) onFieldZoneClick(i, 'player')
                    }}
                  >
                    {m ? (
                      <CardView
                        instance={m}
                        className={m.fieldLockUntil ? 'field-locked' : ''}
                        size="tiny"
                        exhausted={!!m.hasAttacked || !!m.asleepUntil}
                        atkDisplay={getEffectiveAtk(
                          game,
                          'player',
                          m.cardId,
                          m.instanceId,
                        )}
                        selected={
                          attacking === m.instanceId ||
                          soulSacrificeId === m.instanceId ||
                          soluyBounceId === m.instanceId ||
                          soluySourceId === m.instanceId ||
                          (soulDraining &&
                            !!soulSacrificeId &&
                            m.instanceId !== soulSacrificeId) ||
                          (specialModding &&
                            getCard(m.cardId).nameTh.includes(
                              'หุ่นยนต์แห่งการทำลาย',
                            )) ||
                          (alkataPlotting &&
                            getCard(m.cardId).nameTh.includes('เทพแห่งอัลคาทา')) ||
                          (guardianPicking &&
                            getCard(m.cardId).tribe === 'mage') ||
                          (buddyPicking &&
                            getCard(m.cardId).tribe === 'mage' &&
                            m.instanceId !== buddyFirstId) ||
                          (buddyFirstId === m.instanceId) ||
                          (soluySwapping &&
                            !soluyBounceId &&
                            getCard(m.cardId).tribe === 'warrior' &&
                            getCard(m.cardId).effectId !== 'soluy_swap') ||
                          (canAct &&
                            (game.phase === 'main1' || game.phase === 'main2') &&
                            (canActivateSoluy(game, 'player', m.instanceId) ||
                              canActivateShorin(game, 'player', m.instanceId) ||
                              canActivateSaruka(game, 'player', m.instanceId) ||
                              canActivateRyuka(game, 'player', m.instanceId) ||
                              canActivateAgatha(game, 'player', m.instanceId) ||
                              canActivateNoah(game, 'player', m.instanceId)))
                        }
                        dimmed={
                          soluySwapping
                            ? soluyBounceId
                              ? true
                              : getCard(m.cardId).tribe !== 'warrior' ||
                                getCard(m.cardId).effectId === 'soluy_swap'
                            : soulDraining
                              ? !!soulSacrificeId &&
                                m.instanceId === soulSacrificeId
                              : specialModding
                                ? !getCard(m.cardId).nameTh.includes(
                                    'หุ่นยนต์แห่งการทำลาย',
                                  )
                              : alkataPlotting
                                ? !getCard(m.cardId).nameTh.includes(
                                    'เทพแห่งอัลคาทา',
                                  )
                              : guardianPicking
                                ? getCard(m.cardId).tribe !== 'mage'
                              : buddyPicking
                                ? getCard(m.cardId).tribe !== 'mage' ||
                                  m.instanceId === buddyFirstId
                              : game.phase === 'battle' &&
                                isPlayerTurn &&
                                (!m.canAttack || m.hasAttacked)
                        }
                        fx={
                          battleFx?.attackerId === m.instanceId && lungeOffset
                            ? 'lunge'
                            : battleFx?.targetId === m.instanceId
                              ? 'hit'
                              : null
                        }
                        fxOffset={
                          battleFx?.attackerId === m.instanceId
                            ? lungeOffset ?? undefined
                            : undefined
                        }
                        onClick={() => {
                          hoverCard(m.cardId)
                          onMonsterClick(m.instanceId, 'player')
                        }}
                        onMouseEnter={() => hoverCard(m.cardId)}
                      />
                    ) : null}
                  </div>
                ))}
                <div className="pile deck" title="เด็ค">
                  <span>DECK</span>
                  <b>{player.deck.length}</b>
                  <div className="deck-stack" aria-hidden />
                </div>
              </div>
              </div>

              <div className="st-rail" data-coach="st-you">
                <span className="rail-label">เวทย์ / กับดัก</span>
                <div
                className={`st-strip you-st ${dragOverSt ? 'drop-ready' : ''} ${playingSpell || dragKind === 'st' ? 'st-target' : ''}`}
                onDragOver={(e) => {
                  if (!canAct || dragKind !== 'st') {
                    e.dataTransfer.dropEffect = 'none'
                    return
                  }
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverSt(true)
                }}
                onDragLeave={() => setDragOverSt(false)}
                onDrop={onStZoneDrop}
                onClick={() => onSpellTrapZoneClick('player')}
              >
                {player.spellTrap.length === 0 ? (
                  <span className="st-empty">ลากหรือคลิกที่นี่</span>
                ) : (
                  player.spellTrap.map((c, i) => {
                    const casting = castFx?.instanceId === c.instanceId
                    const def = getCard(c.cardId)
                    const faceDown =
                      def.type === 'spell'
                        ? false
                        : casting && castFx?.kind === 'trap_activate'
                          ? false
                          : !!c.faceDown
                    return (
                      <div
                        key={c.instanceId}
                        className={`st-slot ${casting ? `casting cast-${castFx!.kind}` : ''}`}
                        style={{ zIndex: casting ? 30 : i + 1 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!faceDown) hoverCard(c.cardId)
                        }}
                      >
                        <CardView
                          instance={c}
                          cardId={c.cardId}
                          size="tiny"
                          faceDown={faceDown}
                          selected={false}
                          onClick={() => !faceDown && hoverCard(c.cardId)}
                          onMouseEnter={() => !faceDown && hoverCard(c.cardId)}
                        />
                        {c.continuousTurnsLeft != null && c.continuousTurnsLeft > 0 && (
                          <span
                            className="st-continuous-turns"
                            title={`เหลือ ${c.continuousTurnsLeft} เทิร์นของเรา`}
                          >
                            {c.continuousTurnsLeft}
                          </span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
              </div>

              <div className="side-resources-wrap you">
                <SideResources energy={player.energy} hp={player.hp} side="you" />
                <div ref={youDirectRef} className="direct-aim" aria-hidden />
              </div>
            </div>

            <div className="phase-dock">
              <div className="phase-meta">
                <span className="turn-chip">เทิร์น {game.turn}</span>
                <span className={`whose ${isPlayerTurn ? 'you' : 'opp'}`}>
                  {isPlayerTurn ? 'ตาคุณ' : 'ตา CPU'}
                </span>
              </div>

              <div className="phase-track" role="list" aria-label="เฟส">
                {PHASE_TRACK.map((p, i) => {
                  const active = currentPhase === p && game.phase !== 'end'
                  const done =
                    PHASE_TRACK.indexOf(currentPhase) > i || game.phase === 'end'
                  return (
                    <div key={p} className="phase-track-item" role="listitem">
                      {i > 0 && (
                        <span className={`phase-pipe ${done || active ? 'lit' : ''}`} />
                      )}
                      <span
                        className={`phase-node ${active ? 'on' : ''} ${done ? 'done' : ''}`}
                      >
                        {PHASE_LABELS[p]}
                      </span>
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                className={`phase-next ${canAct && !tutorialGuide?.lockPhase ? 'ready' : ''} ${battleFx || aiThinking ? 'busy' : ''}`}
                data-coach="phase-next"
                disabled={!canAct || !!tutorialGuide?.lockPhase}
                onClick={() => {
                  if (reinforcing) finishReinforce()
                  else nextPhase()
                }}
              >
                {canAct
                  ? tutorialGuide?.lockPhase
                    ? 'ทำตามคำแนะนำก่อน'
                    : reinforcing
                      ? 'จบการอัญเชิญ'
                      : nextPhaseLabel(game.phase)
                  : '…'}
              </button>
              {!canAct && statusLine && (
                <span className="phase-status">{statusLine}</span>
              )}

              {reinforcing && canAct && (
                <button
                  type="button"
                  className="direct-btn"
                  onClick={finishReinforce}
                >
                  เสร็จแล้ว ({reinforceLeft})
                </button>
              )}

              {emergencySummon && isPlayerTurn && (
                <button type="button" className="direct-btn" onClick={skipEmergency}>
                  เก็บไว้ในมือ
                </button>
              )}

              {minaRecruit && isPlayerTurn && (
                <button type="button" className="direct-btn" onClick={skipMina}>
                  ข้ามมีน่า
                </button>
              )}

              {soluySwapping && isPlayerTurn && (
                <button type="button" className="direct-btn" onClick={cancelSoluy}>
                  ยกเลิกโซลุย
                </button>
              )}

              {buddyPicking && isPlayerTurn && (
                <button type="button" className="direct-btn" onClick={cancelBuddy}>
                  ยกเลิกคาถาคู่หู
                </button>
              )}

              {hypnosisPicking && isPlayerTurn && (
                <button type="button" className="direct-btn" onClick={cancelHypnosis}>
                  ยกเลิกคาถาสะกดจิต
                </button>
              )}

              {teleportPicking && isPlayerTurn && (
                <button type="button" className="direct-btn" onClick={cancelTeleport}>
                  ยกเลิกคาถาย้ายฉับพลัน
                </button>
              )}

              {sarukaDiscarding && isPlayerTurn && (
                <button type="button" className="direct-btn" onClick={cancelSaruka}>
                  ยกเลิกซารุกะ
                </button>
              )}

              {shorinDiscarding && isPlayerTurn && (
                <button type="button" className="direct-btn" onClick={cancelShorin}>
                  ยกเลิกโชริน
                </button>
              )}

              {ryukaDiscarding && isPlayerTurn && ryukaDiscardLeft >= 2 && (
                <button type="button" className="direct-btn" onClick={cancelRyuka}>
                  ยกเลิกริวกะ
                </button>
              )}

              {ryukaSleeping && isPlayerTurn && (
                <button type="button" className="direct-btn" onClick={cancelRyukaSleepPick}>
                  ข้ามริวกะ
                </button>
              )}

              {alkataHandSummon && (
                <button type="button" className="direct-btn" onClick={skipAlkataHand}>
                  ข้ามอัญเชิญจากมือ
                </button>
              )}

              {alkataDebuffing && (
                <button type="button" className="direct-btn" onClick={cancelAlkataCrush}>
                  ข้ามโซรุน
                </button>
              )}

              {canDirect && (
                <button
                  type="button"
                  className="direct-btn"
                  data-coach="direct-atk"
                  onClick={onDirectAttack}
                >
                  โจมตีตรง!
                </button>
              )}
            </div>
          </div>

          <div className="you-hand" data-coach="hand">
            {player.hand.map((c) => {
              const trapMatch =
                playerTrapWindow &&
                trapWindow &&
                ((trapWindow === 'on_attack' &&
                  (getCard(c.cardId).effectId === 'death_blast' ||
                    getCard(c.cardId).effectId === 'kata_barrier')) ||
                  (trapWindow === 'on_destroy' &&
                    getCard(c.cardId).effectId === 'light_shield') ||
                  (trapWindow === 'on_activate' &&
                    getCard(c.cardId).effectId === 'kata_intercept')) &&
                eligibleTraps.some((t) => t.instanceId === c.instanceId)
              const soluyHandPick =
                soluySwapping &&
                !!soluyBounceId &&
                canSoluySummonFromHand(game, 'player', c.instanceId)
              const alkataHandPick =
                alkataHandSummon &&
                canAlkataHandSummon(game, 'player', c.instanceId)
              const tutorialForced =
                !!highlightCardId && c.cardId === highlightCardId
              const tutorialLockedOut =
                !!forceCardId && c.cardId !== forceCardId
              const canDragReinforce =
                canAct &&
                reinforcing &&
                !tutorialLockedOut &&
                canReinforceSummon(game, 'player', c.instanceId)
              const canDragMonster =
                canAct &&
                !reinforcing &&
                !tutorialLockedOut &&
                (game.phase === 'main1' || game.phase === 'main2') &&
                canSummon(game, 'player', c.instanceId)
              const canDragSt =
                canAct &&
                !reinforcing &&
                !tutorialLockedOut &&
                (game.phase === 'main1' || game.phase === 'main2') &&
                canPlaySpell(game, 'player', c.instanceId)
              const canDrag = canDragReinforce || canDragMonster || canDragSt
              return (
                <div
                  key={c.instanceId}
                  data-coach-card={c.cardId}
                  className={`hand-wrap ${canDrag ? 'draggable' : ''} ${tutorialForced ? 'coach-force' : ''} ${tutorialLockedOut ? 'coach-dim' : ''} ${trapMatch || discarding || saraDiscarding || sarukaDiscarding || shorinDiscarding || ryukaDiscarding || alkataCallDiscarding || soluyHandPick || alkataHandPick ? 'trap-ready' : ''} ${summoning === c.instanceId || playingSpell === c.instanceId || reinforceSelected === c.instanceId || trapMatch || discarding || saraDiscarding || sarukaDiscarding || shorinDiscarding || ryukaDiscarding || alkataCallDiscarding || soluyHandPick || alkataHandPick || tutorialForced ? 'picking' : ''}`}
                  draggable={canDrag}
                  onDragStart={(e) => {
                    if (canDragReinforce || canDragMonster)
                      onHandDragStart(e, c.instanceId, 'monster')
                    else if (canDragSt) onHandDragStart(e, c.instanceId, 'st')
                    else e.preventDefault()
                  }}
                  onDragEnd={clearDrag}
                >
                  <CardView
                    instance={c}
                    size="small"
                    costDisplay={getEffectiveCost(c, game, 'player')}
                    selected={
                      summoning === c.instanceId ||
                      playingSpell === c.instanceId ||
                      reinforceSelected === c.instanceId ||
                      emergencyCardId === c.instanceId ||
                      !!trapMatch ||
                      discarding ||
                      saraDiscarding ||
                      sarukaDiscarding ||
                      shorinDiscarding ||
                      ryukaDiscarding ||
                      alkataCallDiscarding ||
                      soluyHandPick ||
                      alkataHandPick ||
                      tutorialForced
                    }
                    dimmed={
                      tutorialLockedOut
                        ? true
                        : playerTrapWindow
                          ? !trapMatch
                          : discarding || saraDiscarding || sarukaDiscarding || shorinDiscarding || ryukaDiscarding || alkataCallDiscarding
                            ? false
                            : soluySwapping
                              ? !soluyHandPick
                              : alkataHandSummon
                                ? !alkataHandPick
                                : canAct &&
                                  (reinforcing
                                    ? !canDragReinforce
                                    : (game.phase === 'main1' ||
                                        game.phase === 'main2') &&
                                      !canDragMonster &&
                                      !canDragSt)
                    }
                    onClick={() => {
                      hoverCard(c.cardId)
                      onHandCardClick(c.instanceId)
                    }}
                    onMouseEnter={() => hoverCard(c.cardId)}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {stHint && <div className="hint-banner">{stHint}</div>}
        {betaExtraDestroy && isPlayerTurn && (
          <div className="hint-banner beta-extra-actions">
            <button type="button" className="direct-btn" onClick={skipBetaExtra}>
              ข้ามการทำลายเพิ่ม
            </button>
          </div>
        )}
        {game.interaction.type === 'attack' && !battleFx && (
          <div className="hint-banner">
            เลือกเป้าโจมตี{canDirect ? ' หรือกดโจมตีตรง' : ''}
          </div>
        )}

        {solaPaying && isPlayerTurn && (() => {
          const payId =
            game.interaction.type === 'sola_pay'
              ? game.interaction.cardInstanceId
              : null
          const payCard = payId
            ? player.hand.find((c) => c.instanceId === payId)
            : null
          const payDef = payCard ? getCard(payCard.cardId) : null
          const cost = payDef?.cost ?? 10
          const title = payDef?.nameTh ?? 'อัญเชิญ'
          return (
            <div className="trap-modal">
              <div className="trap-card">
                <h3>{title} — จ่ายค่าอัญเชิญ</h3>
                <p>เลือกจ่าย {cost} หน่วยด้วยพลังงานหรือพลังชีวิต</p>
                <div className="trap-actions">
                  <button
                    type="button"
                    className="yes"
                    disabled={player.energy < cost}
                    onClick={() => confirmSolaPay('energy')}
                  >
                    พลังงาน ({player.energy})
                  </button>
                  <button
                    type="button"
                    className="yes"
                    disabled={player.hp < cost}
                    onClick={() => confirmSolaPay('hp')}
                  >
                    พลังชีวิต ({player.hp})
                  </button>
                  <button type="button" className="no" onClick={cancelSolaPay}>
                    ยกเลิก
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {playerTrapWindow && (
          <div className="trap-modal">
            <div className="trap-card">
              <h3>{tutorialGuide?.forceTrap ? 'ใช้กับดักเลย!' : 'ใช้กับดัก?'}</h3>
              <p>{trapOfferHint}</p>
              {eligibleTraps.length > 1 ? (
                <>
                  <div className="trap-pick-grid" role="listbox" aria-label="เลือกกับดัก">
                    {eligibleTraps
                      .filter(
                        (c) =>
                          !tutorialGuide?.forceCardId ||
                          c.cardId === tutorialGuide.forceCardId,
                      )
                      .map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="trap-pick-item"
                        onClick={() => {
                          hoverCard(c.cardId)
                          onTrapRespond(true, c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                  {!tutorialGuide?.forceTrap && (
                    <div className="trap-actions">
                      <button type="button" className="no" onClick={() => onTrapRespond(false)}>
                        ไม่ใช้
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="trap-actions">
                  <button
                    type="button"
                    className="yes"
                    onClick={() =>
                      onTrapRespond(true, eligibleTraps[0]?.instanceId)
                    }
                  >
                    ใช้{trapOfferName}
                  </button>
                  {!tutorialGuide?.forceTrap && (
                    <button type="button" className="no" onClick={() => onTrapRespond(false)}>
                      ไม่ใช้
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {emergencyPick && isPlayerTurn && (
          <div className="gy-modal" role="dialog" aria-label="เลือกจากเด็ค">
            <div className="gy-panel">
              <header className="gy-head">
                <h3>เลือกมอนสเตอร์จากเด็ค</h3>
              </header>
              {player.deck.filter((c) => getCard(c.cardId).type === 'monster')
                .length === 0 ? (
                <p className="gy-empty">ไม่มีมอนสเตอร์ในเด็ค</p>
              ) : (
                <div className="gy-grid">
                  {player.deck
                    .filter((c) => getCard(c.cardId).type === 'monster')
                    .map((c) => {
                      const d = getCard(c.cardId)
                      const canInstant = (d.atk ?? 0) < 5
                      return (
                        <button
                          key={c.instanceId}
                          type="button"
                          className={`gy-item ${canInstant ? 'picking' : ''}`}
                          onClick={() => {
                            hoverCard(c.cardId)
                            pickEmergencyCard(c.instanceId)
                          }}
                          onMouseEnter={() => hoverCard(c.cardId)}
                          title={
                            canInstant
                              ? 'ATK < 5 — อัญเชิญได้ทันทีหลังเลือก'
                              : 'นำขึ้นมือ'
                          }
                        >
                          <CardView instance={c} size="small" />
                        </button>
                      )
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {interferencePicking && isPlayerTurn && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="สัญญาณแทรกซ้อน — เลือกจากเด็ค"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>สัญญาณแทรกซ้อน — เลือกหุ่นยนต์แห่งการทำลาย</h3>
              </header>
              {(() => {
                const robots = player.deck.filter((c) =>
                  getCard(c.cardId).nameTh.includes('หุ่นยนต์แห่งการทำลาย'),
                )
                return robots.length === 0 ? (
                  <p className="gy-empty">ไม่มีหุ่นยนต์แห่งการทำลายในเด็ค</p>
                ) : (
                  <div className="gy-grid">
                    {robots.map((c) => {
                      const d = getCard(c.cardId)
                      return (
                        <button
                          key={c.instanceId}
                          type="button"
                          className="gy-item picking"
                          onClick={() => {
                            hoverCard(c.cardId)
                            pickInterferenceCard(c.instanceId)
                          }}
                          onMouseEnter={() => hoverCard(c.cardId)}
                          title={`ขึ้นมือ · ฝ่ายตรงข้าม HP +${d.cost}`}
                        >
                          <CardView instance={c} size="small" />
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {shorinFetching && isPlayerTurn && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="โชริน — เลือกคาถา"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>โชริน — เลือก「คาถา」จากเด็คหรือสุสาน</h3>
              </header>
              {(() => {
                const deckKata = player.deck.filter((c) =>
                  isKataSpellOrTrap(c.cardId),
                )
                const gyKata = player.graveyard.filter((c) =>
                  isKataSpellOrTrap(c.cardId),
                )
                return (
                  <>
                    <p className="gy-section-label">จากเด็ค</p>
                    {deckKata.length === 0 ? (
                      <p className="gy-empty">ไม่มีในเด็ค</p>
                    ) : (
                      <div className="gy-grid">
                        {deckKata.map((c) => (
                          <button
                            key={`deck-${c.instanceId}`}
                            type="button"
                            className="gy-item picking"
                            onClick={() => {
                              hoverCard(c.cardId)
                              pickShorinCard(c.instanceId, 'deck')
                            }}
                            onMouseEnter={() => hoverCard(c.cardId)}
                            title="ขึ้นมือ"
                          >
                            <CardView instance={c} size="small" />
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="gy-section-label">จากสุสาน</p>
                    {gyKata.length === 0 ? (
                      <p className="gy-empty">ไม่มีในสุสาน</p>
                    ) : (
                      <div className="gy-grid">
                        {gyKata.map((c) => (
                          <button
                            key={`gy-${c.instanceId}`}
                            type="button"
                            className="gy-item picking"
                            onClick={() => {
                              hoverCard(c.cardId)
                              pickShorinCard(c.instanceId, 'graveyard')
                            }}
                            onMouseEnter={() => hoverCard(c.cardId)}
                            title="ขึ้นมือ"
                          >
                            <CardView instance={c} size="small" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {teleportPicking && isPlayerTurn && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="คาถาย้ายฉับพลัน — เลือกจอมเวทย์"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>คาถาย้ายฉับพลัน — เลือกจอมเวทย์จากเด็คหรือสุสาน</h3>
                <button
                  type="button"
                  className="gy-close"
                  onClick={cancelTeleport}
                >
                  ยกเลิก
                </button>
              </header>
              {(() => {
                const deckMages = player.deck.filter(
                  (c) =>
                    getCard(c.cardId).tribe === 'mage' &&
                    canFreePlaceMonster(game, 'player', c.cardId),
                )
                const gyMages = player.graveyard.filter(
                  (c) =>
                    getCard(c.cardId).tribe === 'mage' &&
                    canFreePlaceMonster(game, 'player', c.cardId),
                )
                return (
                  <>
                    <p className="gy-section-label">จากเด็ค</p>
                    {deckMages.length === 0 ? (
                      <p className="gy-empty">ไม่มีในเด็ค</p>
                    ) : (
                      <div className="gy-grid">
                        {deckMages.map((c) => (
                          <button
                            key={`deck-${c.instanceId}`}
                            type="button"
                            className="gy-item picking"
                            onClick={() => {
                              hoverCard(c.cardId)
                              pickTeleportCard(c.instanceId, 'deck')
                            }}
                            onMouseEnter={() => hoverCard(c.cardId)}
                            title="อัญเชิญลงสนาม"
                          >
                            <CardView instance={c} size="small" />
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="gy-section-label">จากสุสาน</p>
                    {gyMages.length === 0 ? (
                      <p className="gy-empty">ไม่มีในสุสาน</p>
                    ) : (
                      <div className="gy-grid">
                        {gyMages.map((c) => (
                          <button
                            key={`gy-${c.instanceId}`}
                            type="button"
                            className="gy-item picking"
                            onClick={() => {
                              hoverCard(c.cardId)
                              pickTeleportCard(c.instanceId, 'graveyard')
                            }}
                            onMouseEnter={() => hoverCard(c.cardId)}
                            title="อัญเชิญลงสนาม"
                          >
                            <CardView instance={c} size="small" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {sarukaFetching && isPlayerTurn && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="ซารุกะ — เลือกคาถา"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>ซารุกะ — เลือก「คาถา」จากเด็คหรือสุสาน</h3>
              </header>
              {(() => {
                const deckKata = player.deck.filter((c) =>
                  isKataSpellOrTrap(c.cardId),
                )
                const gyKata = player.graveyard.filter((c) =>
                  isKataSpellOrTrap(c.cardId),
                )
                return (
                  <>
                    <p className="gy-section-label">จากเด็ค</p>
                    {deckKata.length === 0 ? (
                      <p className="gy-empty">ไม่มีในเด็ค</p>
                    ) : (
                      <div className="gy-grid">
                        {deckKata.map((c) => (
                          <button
                            key={`saruka-deck-${c.instanceId}`}
                            type="button"
                            className="gy-item picking"
                            onClick={() => {
                              hoverCard(c.cardId)
                              pickSarukaCard(c.instanceId, 'deck')
                            }}
                            onMouseEnter={() => hoverCard(c.cardId)}
                          >
                            <CardView instance={c} size="small" />
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="gy-section-label">จากสุสาน</p>
                    {gyKata.length === 0 ? (
                      <p className="gy-empty">ไม่มีในสุสาน</p>
                    ) : (
                      <div className="gy-grid">
                        {gyKata.map((c) => (
                          <button
                            key={`saruka-gy-${c.instanceId}`}
                            type="button"
                            className="gy-item picking"
                            onClick={() => {
                              hoverCard(c.cardId)
                              pickSarukaCard(c.instanceId, 'graveyard')
                            }}
                            onMouseEnter={() => hoverCard(c.cardId)}
                          >
                            <CardView instance={c} size="small" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {ryukaFetching && isPlayerTurn && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="ริวกะ — เลือกคาถาจากสุสาน"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>ริวกะ — เลือก「คาถา」จากสุสานขึ้นมือ</h3>
              </header>
              {(() => {
                const gyKata = player.graveyard.filter((c) =>
                  isKataSpellOrTrap(c.cardId),
                )
                return gyKata.length === 0 ? (
                  <p className="gy-empty">ไม่มีในสุสาน</p>
                ) : (
                  <div className="gy-grid">
                    {gyKata.map((c) => (
                      <button
                        key={`ryuka-${c.instanceId}`}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickRyukaCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                        title="ขึ้นมือ · เปิดใช้ชื่อนี้เทิร์นนี้ทำผล 2 รอบ"
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {agathaSearching && isPlayerTurn && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="อากาธา — เลือกคาถา"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>
                  {agathaStep === 'gy'
                    ? 'อากาธา — คืน「คาถา」จากสุสานเข้าเด็ค'
                    : 'อากาธา — เลือก「คาถา」จากเด็คขึ้นมือ'}
                </h3>
                <button type="button" className="gy-close" onClick={cancelAgatha}>
                  ยกเลิก
                </button>
              </header>
              {(() => {
                const pool =
                  agathaStep === 'gy'
                    ? player.graveyard.filter((c) => isKataSpellOrTrap(c.cardId))
                    : player.deck.filter((c) => isKataSpellOrTrap(c.cardId))
                return pool.length === 0 ? (
                  <p className="gy-empty">
                    {agathaStep === 'gy' ? 'ไม่มีในสุสาน' : 'ไม่มีในเด็ค'}
                  </p>
                ) : (
                  <div className="gy-grid">
                    {pool.map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickAgathaCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                        title={
                          agathaStep === 'gy'
                            ? 'กลับเข้าเด็ค'
                            : 'ขึ้นมือ · จอมเวทย์ ATK +3 จนจบเทิร์น'
                        }
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {noahMilling && isPlayerTurn && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="โนอา — เลือกคาถาจากเด็ค"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>โนอา — เลือก「คาถา」จากเด็คเพื่อใช้</h3>
                <button type="button" className="gy-close" onClick={cancelNoah}>
                  ยกเลิก
                </button>
              </header>
              {(() => {
                const deckKata = player.deck.filter((c) =>
                  isKataSpellOrTrap(c.cardId),
                )
                return deckKata.length === 0 ? (
                  <p className="gy-empty">ไม่มีในเด็ค</p>
                ) : (
                  <div className="gy-grid">
                    {deckKata.map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickNoahCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                        title="ลงสุสาน · ใช้ความสามารถ · นับว่าเปิดใช้คาถา"
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {signalAmpPicking && isPlayerTurn && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="เครื่องขยายสัญญาณ — เลือกจากสุสาน"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>
                  เครื่องขยายสัญญาณ — อัญเชิญจากสุสาน (เหลือ{' '}
                  {signalAmpRemaining})
                </h3>
                <button
                  type="button"
                  className="gy-close"
                  onClick={skipSignalAmpPick}
                >
                  จบการเลือก
                </button>
              </header>
              {(() => {
                const robots = player.graveyard.filter((c) =>
                  getCard(c.cardId).nameTh.includes('หุ่นยนต์แห่งการทำลาย'),
                )
                return robots.length === 0 ? (
                  <p className="gy-empty">ไม่มีหุ่นยนต์แห่งการทำลายในสุสาน</p>
                ) : (
                  <div className="gy-grid">
                    {robots.map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickSignalAmpCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                        title="อัญเชิญ · ถูกทำลายตอนจบเทิร์น"
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {minaRecruit && isPlayerTurn && (
          <div className="gy-modal" role="dialog" aria-label={minaRecruitTitle}>
            <div className="gy-panel">
              <header className="gy-head">
                <h3>{minaRecruitTitle}</h3>
              </header>
              {(() => {
                const excludeMina =
                  game.interaction.type === 'mina_recruit' &&
                  game.interaction.source !== 'sara'
                const warriors = player.deck.filter((c) => {
                  if (getCard(c.cardId).tribe !== 'warrior') return false
                  if (excludeMina && getCard(c.cardId).effectId === 'mina_recruit')
                    return false
                  return true
                })
                return warriors.length === 0 ? (
                  <p className="gy-empty">ไม่มีนักรบในเด็คที่อัญเชิญได้</p>
                ) : (
                  <div className="gy-grid">
                    {warriors.map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickMinaCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {omegaSearching && isPlayerTurn && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="โอเมก้า — เลือกจากเด็ค"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>
                  โอเมก้า — เลือกหุ่นยนต์แห่งการทำลาย (เหลือ {omegaRemaining})
                </h3>
                <button type="button" className="gy-close" onClick={skipOmega}>
                  จบการเลือก
                </button>
              </header>
              {(() => {
                const robots = player.deck.filter((c) =>
                  getCard(c.cardId).nameTh.includes('หุ่นยนต์แห่งการทำลาย'),
                )
                return robots.length === 0 ? (
                  <p className="gy-empty">ไม่มีหุ่นยนต์แห่งการทำลายในเด็ค</p>
                ) : (
                  <div className="gy-grid">
                    {robots.map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickOmegaCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {alkataDeckSearch && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="ซูล — เลือกจากเด็ค"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>ซูล — เลือกเทพแห่งอัลคาทาจากเด็ค (ยกเว้นซูล)</h3>
                <button type="button" className="gy-close" onClick={skipAlkataDeck}>
                  ข้าม
                </button>
              </header>
              {(() => {
                const gods = player.deck.filter((c) => {
                  const def = getCard(c.cardId)
                  return (
                    def.nameTh.includes('เทพแห่งอัลคาทา') &&
                    def.effectId !== 'zul_alkata'
                  )
                })
                return gods.length === 0 ? (
                  <p className="gy-empty">ไม่มีเทพแห่งอัลคาทาในเด็ค (ยกเว้นซูล)</p>
                ) : (
                  <div className="gy-grid">
                    {gods.map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickAlkataDeckCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {alkataMinaSummon && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="มิน่า — อัญเชิญจากเด็ค"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>มิน่า — เลือกเทพแห่งอัลคาทาจากเด็คเพื่ออัญเชิญ</h3>
                <button type="button" className="gy-close" onClick={skipAlkataMina}>
                  ข้าม
                </button>
              </header>
              {(() => {
                const gods = player.deck.filter((c) =>
                  getCard(c.cardId).nameTh.includes('เทพแห่งอัลคาทา'),
                )
                return gods.length === 0 ? (
                  <p className="gy-empty">ไม่มีเทพแห่งอัลคาทาในเด็ค</p>
                ) : (
                  <div className="gy-grid">
                    {gods.map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickAlkataMinaCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {alkataCallSummoning && isPlayerTurn && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="เสียงเรียกของอัลคาทา — อัญเชิญจากเด็ค"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>เสียงเรียกของอัลคาทา — เลือกเทพแห่งอัลคาทาจากเด็ค</h3>
                <button type="button" className="gy-close" onClick={skipAlkataCall}>
                  ข้าม
                </button>
              </header>
              {(() => {
                const gods = player.deck.filter((c) =>
                  getCard(c.cardId).nameTh.includes('เทพแห่งอัลคาทา'),
                )
                return gods.length === 0 ? (
                  <p className="gy-empty">ไม่มีเทพแห่งอัลคาทาในเด็ค</p>
                ) : (
                  <div className="gy-grid">
                    {gods.map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickAlkataCallCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {alkataGyRecover && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="เทพแห่งอัลคาทา — เลือกจากสุสาน"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>เทพแห่งอัลคาทา — เลือกจากสุสาน</h3>
                <button type="button" className="gy-close" onClick={skipAlkataGy}>
                  ข้าม
                </button>
              </header>
              {(() => {
                const gods = player.graveyard.filter((c) =>
                  getCard(c.cardId).nameTh.includes('เทพแห่งอัลคาทา'),
                )
                return gods.length === 0 ? (
                  <p className="gy-empty">ไม่มีเทพแห่งอัลคาทาในสุสาน</p>
                ) : (
                  <div className="gy-grid">
                    {gods.map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickAlkataGyCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {alkataRecycling && (
          <div
            className="gy-modal"
            role="dialog"
            aria-label="โฮคาน่า — กลับเข้าเด็ค"
          >
            <div className="gy-panel">
              <header className="gy-head">
                <h3>
                  โฮคาน่า — กลับเข้าเด็ค (เหลือ {alkataRecycleRemaining})
                </h3>
                <button
                  type="button"
                  className="gy-close"
                  onClick={skipAlkataRecyclePick}
                >
                  {alkataRecycleRemaining >= 2 ? 'ยกเลิก' : 'ข้าม'}
                </button>
              </header>
              {(() => {
                const gods = player.graveyard.filter((c) =>
                  getCard(c.cardId).nameTh.includes('เทพแห่งอัลคาทา'),
                )
                return gods.length === 0 ? (
                  <p className="gy-empty">ไม่มีเทพแห่งอัลคาทาในสุสาน</p>
                ) : (
                  <div className="gy-grid">
                    {gods.map((c) => (
                      <button
                        key={c.instanceId}
                        type="button"
                        className="gy-item picking"
                        onClick={() => {
                          hoverCard(c.cardId)
                          pickAlkataRecycleCard(c.instanceId)
                        }}
                        onMouseEnter={() => hoverCard(c.cardId)}
                      >
                        <CardView instance={c} size="small" />
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {gyView && (
          <div className="gy-modal" role="dialog" aria-label={gyTitle}>
            <div className="gy-panel">
              <header className="gy-head">
                <h3>{gyTitle}</h3>
                <button type="button" className="gy-close" onClick={() => setGyView(null)}>
                  ปิด
                </button>
              </header>
              {gyCards.length === 0 ? (
                <p className="gy-empty">สุสานว่าง</p>
              ) : (
                <div className="gy-grid">
                  {[...gyCards].reverse().map((c) => (
                    <button
                      key={c.instanceId}
                      type="button"
                      className="gy-item"
                      onClick={() => hoverCard(c.cardId)}
                      onMouseEnter={() => hoverCard(c.cardId)}
                    >
                      <CardView instance={c} size="small" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <aside
        className={`battle-log ${logOpen ? 'open' : 'collapsed'}`}
        aria-label="บันทึกการดวล"
      >
        <button
          type="button"
          className="blog-toggle"
          aria-expanded={logOpen}
          onClick={() => setLogOpen((v) => !v)}
        >
          <span className="blog-toggle-mark" aria-hidden>
            {logOpen ? '›' : '‹'}
          </span>
          <span className="blog-toggle-text">
            {logOpen ? 'พับบันทึก' : 'บันทึก'}
          </span>
        </button>
        {logOpen && (
          <>
            <header className="blog-head">
              <p className="blog-eyebrow">Chronicle</p>
              <h3>บันทึกการดวล</h3>
            </header>
            {latestLog && (
              <div className="blog-latest">
                <span className="blog-latest-label">ล่าสุด</span>
                <p>{latestLog}</p>
              </div>
            )}
            <div className="blog-scroll">
              {logGroups.length === 0 && (
                <p className="blog-empty">ยังไม่มีเหตุการณ์</p>
              )}
              {logGroups.map((group) => (
                <section key={group.turn} className="blog-turn-block">
                  <div className="blog-turn-mark">
                    <span>เทิร์น {group.turn}</span>
                  </div>
                  <ul className="blog-entries">
                    {group.entries.map((entry) => (
                      <li key={entry.id}>{entry.text}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </aside>
      {tutorialMode && <TutorialCoach />}
    </div>
  )
}
