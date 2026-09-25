import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, type TutorialGuide } from '../store/gameStore'
import {
  TUTORIAL_BOT_HP,
  TUTORIAL_TURN2_HAND,
} from '../tutorial/scenario'
import type { GameState } from '../types/game'
import './TutorialCoach.css'

type BeatId =
  | 'intro'
  | 'life'
  | 'energy'
  | 'types'
  | 'summon'
  | 'effect'
  | 'spell'
  | 'trapHold'
  | 'toBattle'
  | 'noAtk'
  | 'endTurn'
  | 'botSummon'
  | 'botAtk'
  | 'useTrap'
  | 'trapDone'
  | 'turn2'
  | 'summon2'
  | 'toBattle2'
  | 'kill'
  | 'victory'

type Beat = {
  id: BeatId
  title: string
  body: (g: GameState) => string
  target?: string
  highlightCardId?: string
  forceCardId?: string
  lockPhase?: boolean
  forceAttack?: boolean
  forceTrap?: boolean
  canSkip?: boolean
  done?: (g: GameState) => boolean
  cta?: string
  mockHand?: readonly string[]
  /** Prefer tip dock when auto-place is ambiguous */
  tipDock?: 'top' | 'bottom' | 'left' | 'right'
}

const BEATS: Beat[] = [
  {
    id: 'intro',
    title: 'ลองดวลกันหน่อย',
    body: () =>
      `เป้าคือลดหัวใจบอทให้หมด บอทฝึกเหลือ ${TUTORIAL_BOT_HP} จบเร็ว — เดี๋ยวสอนมอนสเตอร์ เวทย์ กับดัก ให้ครบ`,
    canSkip: true,
    tipDock: 'top',
  },
  {
    id: 'life',
    title: 'หัวใจตรงนี้',
    body: (g) =>
      `คุณ ${g.players.player.hp} · บอท ${g.players.opponent.hp} — โดนตีตรงหัวใจจะลด หมดแล้วจบ`,
    target: 'life-you',
    canSkip: true,
    tipDock: 'bottom',
  },
  {
    id: 'energy',
    title: 'เพชรฟ้า = พลังงาน',
    body: (g) =>
      `ตอนนี้มี ${g.players.player.energy} แต้ม ลงการ์ดทีจ่ายตามตัวเลขบนใบ เทิร์นใหม่ได้เพิ่มเอง`,
    target: 'energy-you',
    canSkip: true,
    tipDock: 'bottom',
  },
  {
    id: 'types',
    title: 'การ์ดมี 3 แบบ',
    body: () =>
      'มอนสเตอร์ = ลงสนามไปตี · เวทย์ = ใช้แล้วทำงานทันที · กับดัก = เก็บในมือ พอโดนตีค่อยใช้',
    target: 'hand',
    canSkip: true,
    tipDock: 'top',
  },
  {
    id: 'summon',
    title: 'ลงมอนสเตอร์ธรรมดา',
    body: (g) =>
      g.interaction.type === 'summon'
        ? 'เลือกใบแล้ว — คลิกช่องเรืองแสงบนสนาม (ช่องว่างที่มีเครื่องหมาย +)'
        : 'ใบเรืองแสง «ทหารใหม่» — คลิกใบนี้ก่อน แล้วค่อยเลือกช่องบนสนาม',
    target: 'hand',
    highlightCardId: 'S0009',
    forceCardId: 'S0009',
    lockPhase: true,
    done: (g) => g.players.player.field.some((m) => m?.cardId === 'S0009'),
    cta: 'ลงทหารใหม่ก่อน',
    tipDock: 'top',
  },
  {
    id: 'effect',
    title: 'มอนสเตอร์มีเอฟเฟค',
    body: (g) =>
      g.interaction.type === 'summon'
        ? 'คลิกช่องเรืองแสงบนสนามเพื่อลง «หน่วยสนับสนุน»'
        : 'ต่อ «หน่วยสนับสนุน» — มีเอฟเฟค อ่านด้านซ้ายได้ คลิกใบแล้วคลิกช่องบนสนาม',
    target: 'hand',
    highlightCardId: 'S0024',
    forceCardId: 'S0024',
    lockPhase: true,
    done: (g) => g.players.player.field.some((m) => m?.cardId === 'S0024'),
    cta: 'ลงหน่วยสนับสนุน',
    tipDock: 'top',
  },
  {
    id: 'spell',
    title: 'เวทย์ — ใช้แล้วจบ',
    body: (g) =>
      g.interaction.type === 'play_spell'
        ? 'เลือกเวทย์แล้ว — คลิกแถบเรืองแสง «เวทย์ / กับดัก» ด้านล่างสนาม'
        : 'ใบเรืองแสง «ชาร์จพลังงาน» — คลิกใบนี้ก่อน แล้วคลิกแถบเวทย์ด้านล่าง',
    target: 'hand',
    highlightCardId: 'S0021',
    forceCardId: 'S0021',
    lockPhase: true,
    done: (g) => !g.players.player.hand.some((c) => c.cardId === 'S0021'),
    cta: 'ใช้ชาร์จก่อน',
    tipDock: 'top',
  },
  {
    id: 'trapHold',
    title: 'กับดัก — ยังไม่กด',
    body: () =>
      'ใบม่วง «ระเบิดความตาย» คือกับดัก เก็บไว้ในมือก่อน พออีกฝ่ายประกาศตี ค่อยใช้ ลด ATK พวกมัน',
    target: 'hand',
    highlightCardId: 'S0029',
    lockPhase: true,
    canSkip: true,
    tipDock: 'top',
  },
  {
    id: 'toBattle',
    title: 'ไป Battle',
    body: () => 'พอแล้วเทิร์นนี้ กดปุ่มทอง «ไป Battle» ทางขวา ที่กำลังกระพริบ',
    target: 'phase-next',
    done: (g) =>
      g.phase === 'battle' || g.phase === 'main2' || g.phase === 'end',
    cta: 'กดไป Battle',
    tipDock: 'left',
  },
  {
    id: 'noAtk',
    title: 'เทิร์นแรกตีไม่ได้',
    body: () =>
      'ฝ่ายเริ่มเทิร์นแรกโจมตีไม่ได้ กติกาเกม กดปุ่มขวาต่อไปจนจบเทิร์น รอบหน้าค่อยตี',
    target: 'phase-next',
    done: (g) => g.turn > 1 || g.activePlayer !== 'player',
    cta: 'จบเทิร์นได้',
    tipDock: 'left',
  },
  {
    id: 'endTurn',
    title: 'ตาบอทแล้ว',
    body: (g) => {
      const has = g.players.opponent.field.some((m) => m !== null)
      if (!has) return 'บอทจะลงมอนสเตอร์ให้ดู — รอแป๊บ ดูสนามฝั่งบน'
      return 'บอทลงมอนสเตอร์แล้ว เดี๋ยวเข้า Battle มาตีเรา'
    },
    target: 'zones-opp',
    lockPhase: true,
    done: (g) => g.players.opponent.field.some((m) => m !== null),
    cta: 'รอบอทลงการ์ด…',
    tipDock: 'bottom',
  },
  {
    id: 'botSummon',
    title: 'บอทลงมอนสเตอร์',
    body: () =>
      'ฝั่งบนมีมอนสเตอร์บอทแล้ว — มันใช้ตีเราได้เหมือนที่เราตีมัน กดถัดไปได้',
    target: 'zones-opp',
    lockPhase: true,
    canSkip: true,
    tipDock: 'bottom',
  },
  {
    id: 'botAtk',
    title: 'บอทจะตี',
    body: () =>
      'รอให้บอทประกาศโจมตี พอขึ้นหน้าต่างกับดัก ให้ใช้เลย',
    target: 'zones-opp',
    lockPhase: true,
    done: (g) =>
      (g.awaitingTrap && g.interaction.type === 'trap_response') ||
      (g.activePlayer === 'player' && g.turn >= 2),
    cta: 'รอจังหวะกับดัก…',
    tipDock: 'bottom',
  },
  {
    id: 'useTrap',
    title: 'ใช้กับดัก!',
    body: () =>
      'ตอนนี้เลย — กดใช้ «ระเบิดความตาย» ในหน้าต่าง (หรือคลิกใบในมือ) ATK มอนสเตอร์บอททุกตัว −2',
    target: 'hand',
    highlightCardId: 'S0029',
    forceCardId: 'S0029',
    forceTrap: true,
    lockPhase: true,
    done: (g) =>
      !g.awaitingTrap ||
      g.players.player.graveyard.some((c) => c.cardId === 'S0029') ||
      (g.activePlayer === 'player' &&
        !g.players.player.hand.some((c) => c.cardId === 'S0029')),
    cta: 'ใช้ระเบิดความตาย',
    tipDock: 'top',
  },
  {
    id: 'trapDone',
    title: 'เห็นมั้ย',
    body: () =>
      'กับดักทำงานตอนถูกประกาศตี ไม่ต้องลงสนามล่วงหน้า — เดี๋ยวตาเรากลับมา เตรียมตีกลับ',
    lockPhase: true,
    done: (g) =>
      g.activePlayer === 'player' &&
      g.turn >= 2 &&
      (g.phase === 'main1' || g.phase === 'draw'),
    cta: 'รอตาคุณ…',
    tipDock: 'top',
  },
  {
    id: 'turn2',
    title: 'ตาคุณอีกครั้ง',
    body: (g) =>
      `พลังงาน ${g.players.player.energy} แต้ม — ลงตัวตีแรง แล้วเข้า Battle ลดหัวใจบอท`,
    mockHand: TUTORIAL_TURN2_HAND,
    canSkip: true,
    tipDock: 'top',
  },
  {
    id: 'summon2',
    title: 'ลงกัปตันโล่',
    body: (g) =>
      g.interaction.type === 'summon'
        ? 'คลิกช่องเรืองแสงบนสนาม — วางกัปตันโล่ลงไป'
        : 'ใบเรืองแสง «กัปตันโล่» ATK 4 ค่าร่าย 3 — คลิกใบนี้ แล้วคลิกช่องบนสนาม',
    target: 'hand',
    highlightCardId: 'S0011',
    forceCardId: 'S0011',
    lockPhase: true,
    done: (g) => g.players.player.field.some((m) => m?.cardId === 'S0011'),
    cta: 'ลงกัปตันโล่ก่อน',
    tipDock: 'top',
  },
  {
    id: 'toBattle2',
    title: 'เข้า Battle',
    body: () => 'กดปุ่มทอง «ไป Battle» ทางขวา ที่กำลังกระพริบ',
    target: 'phase-next',
    done: (g) => g.phase === 'battle',
    cta: 'กดไป Battle',
    tipDock: 'left',
  },
  {
    id: 'kill',
    title: 'ตีให้จบ',
    body: (g) => {
      const hp = g.players.opponent.hp
      if (g.phase !== 'battle') {
        return `บอทเหลือ ${hp} กดไป Battle ก่อน`
      }
      const hasOpp = g.players.opponent.field.some((m) => m !== null)
      if (hasOpp) {
        return `บอทเหลือ ${hp} — คลิกมอนสเตอร์คุณ แล้วคลิกมอนสเตอร์บอทเพื่อสู้`
      }
      if (g.interaction.type === 'attack') {
        return `บอทเหลือ ${hp} — กดปุ่ม «โจมตีตรง!» ที่เรืองแสง`
      }
      return `บอทเหลือ ${hp} — คลิกมอนสเตอร์คุณ แล้วกด «โจมตีตรง!» ตีซ้ำจนหมด`
    },
    target: 'zones-you',
    forceAttack: true,
    done: (g) => g.winner === 'player' || g.players.opponent.hp <= 0,
    cta: 'ตีต่อ…',
    tipDock: 'top',
  },
  {
    id: 'victory',
    title: 'เรียบร้อย',
    body: () =>
      'จบแล้ว — มอนสเตอร์มี/ไม่มีเอฟเฟค เวทย์ใช้ทันที กับดักเก็บไว้ตอบโต้ กลับเมนูไปจัดเด็คหรือดวลจริงได้',
    canSkip: true,
    tipDock: 'top',
  },
]

function guideFromBeat(beat: Beat): TutorialGuide | null {
  if (
    !beat.forceCardId &&
    !beat.lockPhase &&
    !beat.forceAttack &&
    !beat.forceTrap &&
    !beat.highlightCardId
  ) {
    return null
  }
  return {
    forceCardId:
      beat.forceCardId ?? (beat.forceTrap ? beat.highlightCardId ?? null : null),
    highlightCardId: beat.highlightCardId ?? beat.forceCardId ?? null,
    lockPhase: !!beat.lockPhase,
    forceAttack: !!beat.forceAttack,
    forceTrap: !!beat.forceTrap,
  }
}

function resolveAimSelector(beat: Beat, game: GameState): string | null {
  if (
    (beat.id === 'summon' || beat.id === 'effect' || beat.id === 'summon2') &&
    game.interaction.type === 'summon'
  ) {
    return '[data-coach="summon-zones"]'
  }
  if (beat.id === 'spell') {
    if (game.interaction.type === 'play_spell') return '[data-coach="st-you"]'
    if (beat.highlightCardId) {
      return `[data-coach-card="${beat.highlightCardId}"]`
    }
  }
  if (beat.id === 'kill') {
    if (game.phase !== 'battle') return '[data-coach="phase-next"]'
    if (game.interaction.type === 'attack') {
      const direct = document.querySelector('[data-coach="direct-atk"]')
      if (direct) return '[data-coach="direct-atk"]'
    }
    return '[data-coach="zones-you"]'
  }
  if (beat.id === 'useTrap' && game.awaitingTrap) {
    if (document.querySelector('.trap-modal')) return '.trap-modal'
  }
  if (beat.highlightCardId) {
    return `[data-coach-card="${beat.highlightCardId}"]`
  }
  if (beat.target) return `[data-coach="${beat.target}"]`
  return null
}

export function TutorialCoach() {
  const game = useAppStore((s) => s.game)
  const tutorialMode = useAppStore((s) => s.tutorialMode)
  const tutorialMockHand = useAppStore((s) => s.tutorialMockHand)
  const setTutorialGuide = useAppStore((s) => s.setTutorialGuide)
  const leaveDuel = useAppStore((s) => s.leaveDuel)
  const [idx, setIdx] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [spot, setSpot] = useState<DOMRect | null>(null)
  const [aimSel, setAimSel] = useState<string | null>(null)
  const mockedBeats = useRef(new Set<string>())
  const spotRef = useRef<DOMRect | null>(null)

  const beat = BEATS[Math.min(idx, BEATS.length - 1)]!

  useEffect(() => {
    if (!tutorialMode || dismissed) {
      setTutorialGuide(null)
      return
    }
    setTutorialGuide(guideFromBeat(beat))
    if (beat.mockHand && !mockedBeats.current.has(beat.id)) {
      mockedBeats.current.add(beat.id)
      tutorialMockHand(beat.mockHand)
    }
  }, [tutorialMode, dismissed, beat, setTutorialGuide, tutorialMockHand])

  useEffect(() => {
    if (!tutorialMode || !game || dismissed || !beat.forceCardId) return
    const has = game.players.player.hand.some((c) => c.cardId === beat.forceCardId)
    if (!has && beat.id === 'summon2') {
      tutorialMockHand(TUTORIAL_TURN2_HAND)
    }
  }, [
    tutorialMode,
    game,
    dismissed,
    beat,
    tutorialMockHand,
    game?.players.player.hand,
  ])

  useEffect(() => {
    if (!tutorialMode || !game || dismissed) return
    if (!beat.done?.(game)) return
    if (beat.id === 'victory') return
    const t = window.setTimeout(() => {
      setIdx((i) => Math.min(i + 1, BEATS.length - 1))
    }, 550)
    return () => window.clearTimeout(t)
  }, [
    tutorialMode,
    dismissed,
    beat,
    game,
    game?.phase,
    game?.turn,
    game?.activePlayer,
    game?.awaitingTrap,
    game?.interaction,
    game?.players.player.field,
    game?.players.opponent.field,
    game?.players.opponent.hp,
    game?.winner,
    game?.players.player.hand,
    game?.players.player.graveyard,
    game?.players.player.energy,
  ])

  useEffect(() => {
    if (!tutorialMode || !game || dismissed) return
    if (game.winner === 'player' && beat.id !== 'victory') {
      setIdx(BEATS.findIndex((b) => b.id === 'victory'))
    }
  }, [tutorialMode, game, game?.winner, beat.id, dismissed])

  useEffect(() => {
    if (!tutorialMode || !game || dismissed) return
    if (!(game.awaitingTrap && game.interaction.type === 'trap_response')) return
    const trapIdx = BEATS.findIndex((b) => b.id === 'useTrap')
    if (trapIdx >= 0 && idx < trapIdx) setIdx(trapIdx)
  }, [tutorialMode, game, dismissed, idx, game?.awaitingTrap, game?.interaction])

  useEffect(() => {
    if (!tutorialMode || !game || dismissed) return
    if (
      beat.id === 'useTrap' &&
      !game.awaitingTrap &&
      game.activePlayer === 'player' &&
      game.turn >= 2
    ) {
      const doneIdx = BEATS.findIndex((b) => b.id === 'trapDone')
      if (doneIdx >= 0) setIdx(doneIdx)
    }
  }, [
    tutorialMode,
    game,
    dismissed,
    beat.id,
    game?.awaitingTrap,
    game?.activePlayer,
    game?.turn,
  ])

  // Spotlight + mark clickable target with .coach-aim
  useLayoutEffect(() => {
    if (!tutorialMode || dismissed || !game) {
      setSpot(null)
      setAimSel(null)
      document.querySelectorAll('.coach-aim').forEach((el) => {
        el.classList.remove('coach-aim')
      })
      return
    }

    const measure = () => {
      const sel = resolveAimSelector(beat, game)
      setAimSel(sel)
      document.querySelectorAll('.coach-aim').forEach((el) => {
        el.classList.remove('coach-aim')
      })
      if (!sel) {
        spotRef.current = null
        setSpot(null)
        return
      }
      const el = document.querySelector(sel)
      if (el) {
        el.classList.add('coach-aim')
        const next = el.getBoundingClientRect()
        const prev = spotRef.current
        // Ignore tiny jitter so spotlight doesn't thrash
        if (
          !prev ||
          Math.abs(prev.left - next.left) > 2 ||
          Math.abs(prev.top - next.top) > 2 ||
          Math.abs(prev.width - next.width) > 2 ||
          Math.abs(prev.height - next.height) > 2
        ) {
          spotRef.current = next
          setSpot(next)
        }
      } else {
        spotRef.current = null
        setSpot(null)
      }
    }

    measure()
    window.addEventListener('resize', measure)
    const id = window.setInterval(measure, 400)
    return () => {
      window.removeEventListener('resize', measure)
      window.clearInterval(id)
      document.querySelectorAll('.coach-aim').forEach((el) => {
        el.classList.remove('coach-aim')
      })
    }
  }, [
    tutorialMode,
    dismissed,
    beat,
    game,
    game?.phase,
    game?.awaitingTrap,
    game?.interaction,
    game?.players.player.hand,
    game?.players.opponent.field,
  ])

  const tip = useMemo(() => {
    if (!game) return null
    return { title: beat.title, body: beat.body(game) }
  }, [
    game,
    beat,
    game?.players.player.energy,
    game?.players.player.hand,
    game?.phase,
    game?.players.opponent.hp,
    game?.awaitingTrap,
    game?.interaction?.type,
  ])

  if (!tutorialMode || !game || !tip) return null

  if (dismissed) {
    return (
      <button
        type="button"
        className="coach-reopen"
        onClick={() => setDismissed(false)}
      >
        เปิดคำแนะนำ
      </button>
    )
  }

  const waiting = !!(beat.done && !beat.done(game) && !beat.canSkip)
  const isLast = beat.id === 'victory'
  const actionAim = !!(aimSel && waiting)
  // Keep tip parked bottom-left so it never jumps; nudge up only when
  // spotlight is in that corner (hand / energy).
  const spotLowLeft =
    !!spot &&
    spot.top > window.innerHeight * 0.55 &&
    spot.left < window.innerWidth * 0.45
  const tipSide = spotLowLeft ? 'dock-top-left' : 'dock-bottom-left'

  return (
    <div className="coach-root" aria-live="polite">
      {spot && (
        <div
          className={`coach-spotlight ${actionAim ? 'pulse' : ''}`}
          style={{
            left: spot.left - 10,
            top: spot.top - 10,
            width: spot.width + 20,
            height: spot.height + 20,
          }}
        />
      )}
      {!spot && <div className="coach-dim soft" aria-hidden />}

      <div
        className={`coach-tip fixed-dock ${tipSide} ${actionAim ? 'waiting' : ''}`}
      >
        <div className="coach-tip-head">
          <span className="coach-eyebrow">เพื่อนสอน</span>
          <span className="coach-progress">
            {idx + 1}/{BEATS.length}
          </span>
        </div>
        <h3>{tip.title}</h3>
        <p>{tip.body}</p>
        <div className="coach-actions">
          <button
            type="button"
            className="coach-btn ghost"
            onClick={() => setDismissed(true)}
          >
            พับไว้
          </button>
          {isLast ? (
            <button
              type="button"
              className="coach-btn primary"
              onClick={leaveDuel}
            >
              กลับเมนู
            </button>
          ) : (
            <button
              type="button"
              className="coach-btn primary"
              disabled={waiting}
              onClick={() => setIdx((i) => Math.min(i + 1, BEATS.length - 1))}
            >
              {waiting ? beat.cta ?? 'ทำตามนี้ก่อน' : 'ถัดไป'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
