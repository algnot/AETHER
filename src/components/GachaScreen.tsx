'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, History, PackageOpen, RotateCcw } from 'lucide-react'
import {
  apiGachaBox,
  apiGachaHistory,
  apiGachaOpen,
  apiGachaOpenAll,
  apiGachaRebox,
  type BoxProgressView,
  type GachaBoxView,
  type GachaHistoryEntry,
  type GachaPullCard,
} from '../api/gacha'
import { GACHA_BOX_LIST, getGachaBox } from '../data/gachaBoxes'
import { getCard, CARD_DATABASE } from '../data/cards'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/gameStore'
import { RARITY_LABELS, type Rarity } from '../types/game'
import { CardView } from './CardView'
import './GachaScreen.css'

const ICO = { size: 18, strokeWidth: 2, 'aria-hidden': true as const }
const BOX_CATALOG = GACHA_BOX_LIST

type Tab = 'pull' | 'history' | 'odds'
type PullPhase =
  | 'idle'
  | 'buying'
  | 'tearing'
  | 'ready'
  | 'flipping'
  | 'done'
  | 'bulk'
type SlideDir = 'prev' | 'next' | null

type BulkPackResult = {
  packIndex: number
  reboxCount: number
  cards: GachaPullCard[]
  cost: number
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function GachaScreen() {
  const token = useAuthStore((s) => s.token)
  const coins = useAuthStore((s) => s.user?.coins ?? 0)
  const setScreen = useAppStore((s) => s.setScreen)

  const patchUser = (user: {
    coins: number
    inventory: Record<string, number>
    canClaimDaily: boolean
    dailyStreak: number
    id: string
    username: string
  }) => {
    useAuthStore.setState((s) => ({
      user: s.user ? { ...s.user, ...user } : user,
    }))
  }

  const [boxIndex, setBoxIndex] = useState(0)
  const [slideDir, setSlideDir] = useState<SlideDir>(null)
  const boxId = BOX_CATALOG[boxIndex]?.id ?? 'S00'
  const boxMeta = getGachaBox(boxId)
  const coverArt = boxMeta?.coverArt ?? '/gacha/box-s00-pack-v2.png'
  const backgroundArt = boxMeta?.backgroundArt ?? coverArt

  const [box, setBox] = useState<GachaBoxView | null>(null)
  const [progress, setProgress] = useState<BoxProgressView | null>(null)
  const [history, setHistory] = useState<GachaHistoryEntry[]>([])
  const [tab, setTab] = useState<Tab>('pull')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [phase, setPhase] = useState<PullPhase>('idle')
  const [pullCards, setPullCards] = useState<GachaPullCard[] | null>(null)
  const [bulkPacks, setBulkPacks] = useState<BulkPackResult[] | null>(null)
  const [bulkCost, setBulkCost] = useState(0)
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [burst, setBurst] = useState<Rarity | null>(null)
  const [hoverPreview, setHoverPreview] = useState<GachaPullCard | null>(null)
  const [previewSide, setPreviewSide] = useState<'left' | 'right'>('right')
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(
    null,
  )
  const [previewSheet, setPreviewSheet] = useState(false)
  const skipRef = useRef(false)
  const revealLock = useRef(false)

  const clearHoverPreview = () => {
    setHoverPreview(null)
    setPreviewPos(null)
    setPreviewSheet(false)
  }

  const isCoarsePointer = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: none), (pointer: coarse)').matches

  const showPoolPreview = (
    card: GachaPullCard,
    el: HTMLElement,
    tileRarity: Rarity,
  ) => {
    const rect = el.getBoundingClientRect()
    const previewW = Math.min(220, window.innerWidth - 24)
    const gap = 12
    const useSheet =
      window.innerWidth < 900 ||
      isCoarsePointer() ||
      rect.bottom > window.innerHeight * 0.72

    if (useSheet) {
      setPreviewSheet(true)
      setPreviewSide('right')
      setPreviewPos({ top: 0, left: 0 })
      setHoverPreview(card)
      return
    }

    setPreviewSheet(false)
    const preferLeft = tileRarity === 'SR' || tileRarity === 'C'
    let side: 'left' | 'right' = preferLeft ? 'left' : 'right'
    if (side === 'right' && rect.right + gap + previewW > window.innerWidth - 8) {
      side = 'left'
    }
    if (side === 'left' && rect.left - gap - previewW < 8) {
      side = 'right'
    }
    setPreviewSide(side)
    setPreviewPos({
      top: Math.min(
        Math.max(rect.top + rect.height / 2, 120),
        window.innerHeight - 120,
      ),
      left: side === 'right' ? rect.right + gap : rect.left - gap,
    })
    setHoverPreview(card)
  }

  const togglePoolPreview = (
    card: GachaPullCard,
    el: HTMLElement,
    tileRarity: Rarity,
  ) => {
    if (hoverPreview?.cardId === card.cardId) {
      clearHoverPreview()
      return
    }
    showPoolPreview(card, el, tileRarity)
  }

  const load = useCallback(async () => {
    if (!token) return
    try {
      const [{ box: b }, { history: h }] = await Promise.all([
        apiGachaBox(token, boxId),
        apiGachaHistory(token, boxId),
      ])
      setBox(b)
      setProgress(b.progress)
      setHistory(h)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดไม่สำเร็จ')
    }
  }, [token, boxId])

  useEffect(() => {
    void load()
  }, [load])

  const resetPullStage = () => {
    setPhase('idle')
    setPullCards(null)
    setBulkPacks(null)
    setBulkCost(0)
    setFlipped([])
    setActiveIndex(0)
    setBurst(null)
    clearHoverPreview()
    skipRef.current = false
    revealLock.current = false
  }

  const cycleBox = (dir: 'prev' | 'next') => {
    if (phase !== 'idle' || slideDir || busy) return
    const n = BOX_CATALOG.length
    if (n === 0) return
    setSlideDir(dir)
    window.setTimeout(() => {
      setBoxIndex((i) => {
        if (dir === 'next') return (i + 1) % n
        return (i - 1 + n) % n
      })
      setSlideDir(null)
      resetPullStage()
    }, 380)
  }

  const revealOne = useCallback(
    async (index: number, cards: GachaPullCard[]) => {
      const card = cards[index]
      if (!card || revealLock.current) return
      revealLock.current = true
      setPhase('flipping')
      setFlipped((prev) => {
        const next = [...prev]
        next[index] = true
        return next
      })

      if (card.rarity === 'SR' || card.rarity === 'UR') {
        setBurst(card.rarity)
        await wait(card.rarity === 'UR' ? 1000 : 720)
        setBurst(null)
      } else {
        await wait(420)
      }

      if (skipRef.current) {
        setFlipped(cards.map(() => true))
        setPhase('done')
        revealLock.current = false
        return
      }

      if (index >= cards.length - 1) {
        setPhase('done')
        revealLock.current = false
        return
      }

      await wait(280)
      setActiveIndex(index + 1)
      setPhase('ready')
      revealLock.current = false
    },
    [],
  )

  const onOpen = async (opts?: { continueAfterDone?: boolean }) => {
    if (!token || busy) return
    if (phase === 'buying' || phase === 'tearing' || phase === 'flipping') return
    if (phase === 'ready') return
    if (phase === 'bulk') return
    if (phase === 'done' && !opts?.continueAfterDone) return

    if (phase === 'done') {
      setPullCards(null)
      setBulkPacks(null)
      setBulkCost(0)
      setFlipped([])
      setActiveIndex(0)
      setBurst(null)
      setHoverPreview(null)
      skipRef.current = false
      revealLock.current = false
    }

    setBusy(true)
    setError(null)
    setPhase('buying')
    skipRef.current = false

    try {
      const res = await apiGachaOpen(token, boxId)
      patchUser(res.user)
      setProgress(res.progress)
      setHistory((prev) =>
        [
          {
            boxId,
            at: new Date().toISOString(),
            cost: res.cost,
            packIndex: res.packIndex,
            reboxCount: res.openedReboxCount ?? res.progress.reboxCount,
            cards: res.cards,
          },
          ...prev,
        ].slice(0, 50),
      )
      if (box) setBox({ ...box, progress: res.progress })

      setBulkPacks(null)
      setPullCards(res.cards)
      setFlipped(res.cards.map(() => false))
      setActiveIndex(0)
      setPhase('tearing')
      await wait(1100)
      setPhase('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปิดซองไม่สำเร็จ')
      setPhase('idle')
    } finally {
      setBusy(false)
    }
  }

  const onOpenAll = async () => {
    if (!token || busy || phase !== 'idle') return
    const packsLeft = progress?.packsLeft ?? 0
    if (packsLeft <= 0) return
    const cost = packsLeft * (box?.packCost ?? 20)
    if (coins < cost) {
      setError(`เหรียญไม่พอ (ต้องการ ${cost.toLocaleString('th-TH')} สำหรับ ${packsLeft} ซอง)`)
      return
    }
    if (
      !window.confirm(
        `เปิดซองที่เหลือทั้งหมด ${packsLeft} ซอง (−${cost.toLocaleString('th-TH')} เหรียญ)?`,
      )
    ) {
      return
    }

    setBusy(true)
    setError(null)
    setPhase('buying')
    try {
      const res = await apiGachaOpenAll(token, boxId)
      patchUser(res.user)
      setProgress(res.progress)
      setHistory((prev) =>
        [
          ...res.packs
            .slice()
            .reverse()
            .map((pack) => ({
              boxId,
              at: new Date().toISOString(),
              cost: pack.cost,
              packIndex: pack.packIndex,
              reboxCount: pack.reboxCount,
              cards: pack.cards,
            })),
          ...prev,
        ].slice(0, 50),
      )
      if (box) setBox({ ...box, progress: res.progress })
      setPullCards(null)
      setBulkPacks(res.packs)
      setBulkCost(res.totalCost)
      setPhase('bulk')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปิดทั้งกล่องไม่สำเร็จ')
      setPhase('idle')
    } finally {
      setBusy(false)
    }
  }

  const onSkipReveal = () => {
    if (phase !== 'ready' && phase !== 'flipping') return
    skipRef.current = true
    if (pullCards) {
      setFlipped(pullCards.map(() => true))
      setBurst(null)
      setPhase('done')
      revealLock.current = false
    }
  }

  const onRevealCurrent = () => {
    if (!pullCards || phase !== 'ready') return
    void revealOne(activeIndex, pullCards)
  }

  const onRebox = async () => {
    if (!token || busy) return
    if (
      progress &&
      !progress.isEmpty &&
      !window.confirm(
        `ยังเหลือ ${progress.packsLeft} ซอง (UR ${progress.urLeft} · SR ${progress.srLeft}) — ยืนยัน Rebox?`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await apiGachaRebox(token, boxId)
      patchUser(res.user)
      setProgress(res.progress)
      resetPullStage()
      if (box) setBox({ ...box, progress: res.progress })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rebox ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const p = progress
  const inCeremony =
    phase === 'buying' ||
    phase === 'tearing' ||
    phase === 'ready' ||
    phase === 'flipping' ||
    phase === 'done' ||
    phase === 'bulk'
  const canBuy =
    !!p &&
    !p.isEmpty &&
    coins >= (box?.packCost ?? 20) &&
    !busy &&
    (phase === 'idle' || phase === 'done')
  const packsLeft = p?.packsLeft ?? 0
  const openAllCost = packsLeft * (box?.packCost ?? 20)
  const canOpenAll =
    !!p &&
    packsLeft > 1 &&
    coins >= openAllCost &&
    !busy &&
    phase === 'idle'

  const rarePulled = pullCards?.[pullCards.length - 1]
  const currentCard = pullCards?.[activeIndex] ?? null
  const isCurrentOpen = flipped[activeIndex] === true
  const openedCount = flipped.filter(Boolean).length
  const bulkRares =
    bulkPacks?.flatMap((pack) =>
      pack.cards.filter((c) => c.rarity === 'UR' || c.rarity === 'SR' || c.rarity === 'R'),
    ) ?? []
  const bulkUrCount = bulkRares.filter((c) => c.rarity === 'UR').length
  const bulkSrCount = bulkRares.filter((c) => c.rarity === 'SR').length
  const bulkRCount = bulkRares.filter((c) => c.rarity === 'R').length

  return (
    <div
      className={`gacha-root ${burst ? `burst-${burst}` : ''}`}
      style={
        {
          '--gacha-bg': `url(${backgroundArt})`,
        } as CSSProperties
      }
    >
      <div className="gacha-bg" aria-hidden>
        <div className="gacha-bg-art" />
        <div className="gacha-bg-veil" />
      </div>
      <header className="gacha-header">
        <button
          type="button"
          className="gacha-icon-btn"
          title="กลับเมนู"
          disabled={phase === 'buying' || phase === 'tearing' || phase === 'flipping'}
          onClick={() => setScreen('menu')}
        >
          <ChevronLeft {...ICO} />
        </button>
        <div className="gacha-title-block">
          <p className="gacha-eyebrow">Box {boxId}</p>
          <h1>{box?.nameTh ?? boxMeta?.nameTh ?? 'Welcome to AETHER'}</h1>
        </div>
        <div className="gacha-coins">
          <span className="gacha-coin-icon" aria-hidden />
          <span>{coins.toLocaleString('th-TH')}</span>
        </div>
      </header>

      {error && <p className="gacha-error">{error}</p>}

      <div className="gacha-tabs" role="tablist">
        {(
          [
            ['pull', 'เปิดซอง'],
            ['odds', 'ในกล่อง'],
            ['history', 'ประวัติ'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={tab === id ? 'on' : ''}
            aria-selected={tab === id}
            disabled={inCeremony && id !== 'pull'}
            onClick={() => {
              if (inCeremony && id !== 'pull') return
              clearHoverPreview()
              setTab(id)
            }}
          >
            {id === 'history' ? <History size={14} /> : null}
            {id === 'odds' ? <PackageOpen size={14} /> : null}
            {label}
          </button>
        ))}
      </div>

      {tab === 'pull' && (phase === 'idle' || phase === 'buying') && (
        <>
          <button
            type="button"
            className="box-nav edge prev"
            title="กล่องก่อนหน้า"
            disabled={phase !== 'idle' || !!slideDir || busy}
            onClick={() => cycleBox('prev')}
            aria-label="เลื่อนไปกล่องก่อนหน้า"
          >
            <ChevronLeft size={28} strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            className="box-nav edge next"
            title="กล่องถัดไป"
            disabled={phase !== 'idle' || !!slideDir || busy}
            onClick={() => cycleBox('next')}
            aria-label="เลื่อนไปกล่องถัดไป"
          >
            <ChevronRight size={28} strokeWidth={2.25} aria-hidden />
          </button>
        </>
      )}

      {tab === 'pull' && (
        <div className={`gacha-pull phase-${phase}`}>
          <section className="gacha-status compact">
            <div className="gacha-stat">
              <span className="label">ซอง</span>
              <strong>{p ? `${p.packsLeft}/${p.packsTotal}` : '—'}</strong>
            </div>
            <div className="gacha-stat ur">
              <span className="label">UR</span>
              <strong>{p ? `${p.urLeft}` : '—'}</strong>
            </div>
            <div className="gacha-stat sr">
              <span className="label">SR</span>
              <strong>{p ? `${p.srLeft}` : '—'}</strong>
            </div>
            <div className="gacha-stat">
              <span className="label">R~</span>
              <strong>{p ? p.rLeft : '—'}</strong>
            </div>
          </section>

          <div className="gacha-stage" aria-live="polite">
            {(phase === 'idle' || phase === 'buying') && (
              <div
                className={`pack-stage ${phase === 'buying' ? 'charging' : ''} ${
                  slideDir ? `slide-${slideDir}` : ''
                }`}
              >
                <button
                  type="button"
                  className="pack-seal"
                  disabled={!canBuy && phase !== 'buying'}
                  onClick={() => void onOpen()}
                  aria-label={`เปิดซอง ราคา ${box?.packCost ?? 20} เหรียญ`}
                  style={{ '--pack-mask': `url(${coverArt})` } as CSSProperties}
                >
                  <span className="pack-glow" aria-hidden />
                  <span className="pack-body frameless">
                    <img
                      className="pack-art"
                      src={coverArt}
                      alt=""
                      draggable={false}
                    />
                    <span className="pack-foil" aria-hidden />
                  </span>
                </button>
                <p className="pack-hint">
                  {phase === 'buying'
                    ? 'กำลังสุ่ม…'
                    : p?.isEmpty
                      ? 'กำลังเตรียมกล่องใหม่…'
                      : `แตะเพื่อแกะซอง · ${box?.packCost ?? 20} เหรียญ`}
                </p>
                {phase === 'idle' && packsLeft > 1 && (
                  <button
                    type="button"
                    className="gacha-open-all-btn"
                    disabled={!canOpenAll}
                    title={
                      coins < openAllCost
                        ? `เหรียญไม่พอ (ต้องการ ${openAllCost.toLocaleString('th-TH')})`
                        : `เปิดซองที่เหลือ ${packsLeft} ซอง`
                    }
                    onClick={() => void onOpenAll()}
                  >
                    เปิดทั้งกล่อง · {packsLeft} ซอง (−
                    {openAllCost.toLocaleString('th-TH')})
                  </button>
                )}
              </div>
            )}

            {phase === 'tearing' && (
              <div className="pack-stage tearing">
                <div
                  className="pack-seal tearing-pack"
                  aria-hidden
                  style={{ '--pack-mask': `url(${coverArt})` } as CSSProperties}
                >
                  <span className="pack-glow" />
                  <span className="pack-body frameless">
                    <img
                      className="pack-art"
                      src={coverArt}
                      alt=""
                      draggable={false}
                    />
                    <span className="pack-rip" />
                    <span className="pack-foil" />
                  </span>
                </div>
                <p className="pack-hint">ฉีกซอง…</p>
              </div>
            )}

            {(phase === 'ready' ||
              phase === 'flipping' ||
              phase === 'done') &&
              pullCards && (
              <div className="reveal-stage one-by-one">
                {burst && <div className={`rarity-burst rarity-${burst}`} aria-hidden />}

                {phase !== 'done' && currentCard && (
                  <div className="solo-reveal">
                    <p className="solo-progress">
                      ใบที่ {activeIndex + 1}/{pullCards.length}
                    </p>
                    <button
                      key={`reveal-${activeIndex}-${currentCard.cardId}`}
                      type="button"
                      className={[
                        'solo-card',
                        `rarity-${currentCard.rarity}`,
                        isCurrentOpen || phase === 'flipping' ? 'flipped' : 'facedown',
                        currentCard.rarity === 'SR' || currentCard.rarity === 'UR'
                          ? 'high'
                          : '',
                        phase === 'flipping' ? 'focus' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={onRevealCurrent}
                      disabled={phase !== 'ready'}
                      onMouseEnter={() => {
                        if (isCurrentOpen || phase === 'flipping') {
                          setHoverPreview(currentCard)
                        }
                      }}
                      onMouseLeave={() => setHoverPreview(null)}
                      aria-label={
                        isCurrentOpen
                          ? getCard(currentCard.cardId).nameTh
                          : `พลิกการ์ดใบที่ ${activeIndex + 1}`
                      }
                    >
                      <span className="solo-inner">
                        <span className="solo-face solo-back">
                          <img
                            src="/cards/card-back.png"
                            alt=""
                            draggable={false}
                          />
                        </span>
                        <span className="solo-face solo-front">
                          <CardView
                            cardId={currentCard.cardId}
                            size="preview"
                          />
                        </span>
                      </span>
                    </button>
                    <p className="reveal-caption">
                      {phase === 'ready' && (
                        <span>แตะการ์ดเพื่อพลิกใบนี้</span>
                      )}
                      {phase === 'flipping' && (
                        <span className={`cap rarity-${currentCard.rarity}`}>
                          {currentCard.rarity === 'UR'
                            ? '✦ ULTRA RARE ✦'
                            : currentCard.rarity === 'SR'
                              ? '◆ SUPER RARE ◆'
                              : currentCard.rarity === 'R'
                                ? `Rare · ${getCard(currentCard.cardId).nameTh}`
                                : getCard(currentCard.cardId).nameTh}
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {phase === 'done' && (
                  <div className="solo-summary">
                    <div className="summary-fan">
                      {pullCards.map((c, i) => (
                        <button
                          key={`${c.cardId}-${i}`}
                          type="button"
                          className={`summary-card rarity-${c.rarity}`}
                          onMouseEnter={() => setHoverPreview(c)}
                          onMouseLeave={() => setHoverPreview(null)}
                          aria-label={getCard(c.cardId).nameTh}
                        >
                          <CardView cardId={c.cardId} size="small" hideName />
                        </button>
                      ))}
                    </div>
                    {rarePulled && (
                      <p className="reveal-caption">
                        <span className={`cap rarity-${rarePulled.rarity}`}>
                          ได้ {rarePulled.rarity} ·{' '}
                          {getCard(rarePulled.cardId).nameTh}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {openedCount > 0 && phase !== 'done' && (
                  <div className="opened-tray" aria-label="การ์ดที่เปิดแล้ว">
                    {pullCards.map((c, i) =>
                      flipped[i] ? (
                        <button
                          key={`tray-${c.cardId}-${i}`}
                          type="button"
                          className={`tray-card rarity-${c.rarity}`}
                          onMouseEnter={() => setHoverPreview(c)}
                          onMouseLeave={() => setHoverPreview(null)}
                        >
                          <CardView cardId={c.cardId} size="tiny" hideName />
                        </button>
                      ) : (
                        <span key={`tray-empty-${i}`} className="tray-slot" />
                      ),
                    )}
                  </div>
                )}

                {hoverPreview && (
                  <div className="gacha-hover-preview" aria-hidden>
                    <div className={`preview-frame rarity-${hoverPreview.rarity}`}>
                      <CardView cardId={hoverPreview.cardId} size="preview" />
                      <p className={`preview-rarity rarity-${hoverPreview.rarity}`}>
                        {hoverPreview.rarity} · {RARITY_LABELS[hoverPreview.rarity]}
                      </p>
                      <p className="preview-name">
                        {getCard(hoverPreview.cardId).nameTh}
                      </p>
                      <p className="preview-effect">
                        {getCard(hoverPreview.cardId).type === 'monster' &&
                        !getCard(hoverPreview.cardId).effectId
                          ? 'ไม่มีเอฟเฟค'
                          : getCard(hoverPreview.cardId).description}
                      </p>
                    </div>
                  </div>
                )}

                <div className="gacha-actions reveal-actions">
                  {(phase === 'ready' || phase === 'flipping') && (
                    <>
                      {phase === 'ready' && (
                        <button
                          type="button"
                          className="gacha-open-btn"
                          onClick={onRevealCurrent}
                        >
                          พลิกใบนี้
                        </button>
                      )}
                      <button
                        type="button"
                        className="gacha-rebox-btn"
                        onClick={onSkipReveal}
                      >
                        เปิดทั้งหมด
                      </button>
                    </>
                  )}
                  {phase === 'done' && (
                    <>
                      <button
                        type="button"
                        className="gacha-open-btn"
                        disabled={!canBuy}
                        onClick={() => void onOpen({ continueAfterDone: true })}
                      >
                        {p?.isEmpty
                          ? 'เปิดซองถัดไป'
                          : `เปิดซองถัดไป (−${box?.packCost ?? 20})`}
                      </button>
                      <button
                        type="button"
                        className="gacha-rebox-btn"
                        onClick={resetPullStage}
                      >
                        กลับ
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {phase === 'bulk' && bulkPacks && (
              <div className="bulk-stage">
                <header className="bulk-hero">
                  <p className="bulk-kicker">เปิดทั้งกล่อง</p>
                  <h2>
                    {bulkPacks.length} ซอง · −{bulkCost.toLocaleString('th-TH')} เหรียญ
                  </h2>
                  <p className="bulk-summary">
                    UR×{bulkUrCount} · SR×{bulkSrCount} · R×{bulkRCount} · รวม{' '}
                    {bulkPacks.reduce((n, pack) => n + pack.cards.length, 0)} ใบ
                  </p>
                </header>

                {bulkRares.some((c) => c.rarity === 'UR' || c.rarity === 'SR') && (
                  <section className="bulk-highlights">
                    <h3>ไฮไลต์</h3>
                    <div className="bulk-highlight-row">
                      {bulkRares
                        .filter((c) => c.rarity === 'UR' || c.rarity === 'SR')
                        .map((c, i) => (
                          <button
                            key={`hi-${c.cardId}-${i}`}
                            type="button"
                            className={`bulk-card rarity-${c.rarity}`}
                            onMouseEnter={(e) => {
                              if (isCoarsePointer()) return
                              showPoolPreview(c, e.currentTarget, c.rarity)
                            }}
                            onMouseLeave={() => {
                              if (isCoarsePointer()) return
                              clearHoverPreview()
                            }}
                            onClick={(e) => {
                              if (!isCoarsePointer()) return
                              togglePoolPreview(c, e.currentTarget, c.rarity)
                            }}
                            aria-label={getCard(c.cardId).nameTh}
                          >
                            <CardView cardId={c.cardId} size="small" hideName />
                            <span className={`bulk-chip rarity-${c.rarity}`}>
                              {c.rarity}
                            </span>
                          </button>
                        ))}
                    </div>
                  </section>
                )}

                <div className="bulk-packs">
                  {bulkPacks.map((pack) => (
                    <article key={`pack-${pack.packIndex}`} className="bulk-pack-row">
                      <header>
                        <span>ซอง #{pack.packIndex}</span>
                        <span className="muted">
                          {pack.cards.filter((c) => c.rarity !== 'C')[0]?.rarity ?? 'R'}
                        </span>
                      </header>
                      <div className="bulk-pack-cards">
                        {pack.cards.map((c, i) => (
                          <button
                            key={`${pack.packIndex}-${c.cardId}-${i}`}
                            type="button"
                            className={`bulk-mini rarity-${c.rarity}`}
                            onMouseEnter={(e) => {
                              if (isCoarsePointer()) return
                              showPoolPreview(c, e.currentTarget, c.rarity)
                            }}
                            onMouseLeave={() => {
                              if (isCoarsePointer()) return
                              clearHoverPreview()
                            }}
                            onClick={(e) => {
                              if (!isCoarsePointer()) return
                              togglePoolPreview(c, e.currentTarget, c.rarity)
                            }}
                            aria-label={getCard(c.cardId).nameTh}
                          >
                            <CardView cardId={c.cardId} size="tiny" hideName />
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="gacha-actions reveal-actions">
                  <button
                    type="button"
                    className="gacha-open-btn"
                    disabled={!canBuy}
                    onClick={() => {
                      resetPullStage()
                      void onOpen()
                    }}
                  >
                    เปิดซองถัดไป (−{box?.packCost ?? 20})
                  </button>
                  <button
                    type="button"
                    className="gacha-rebox-btn"
                    onClick={resetPullStage}
                  >
                    กลับ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'odds' && box && (
        <div className="gacha-odds">
          <section className="odds-hero">
            <div className="odds-hero-art">
              <img src={coverArt} alt="" draggable={false} />
              <span className="odds-hero-sheen" aria-hidden />
            </div>
            <div className="odds-hero-copy">
              <p className="odds-kicker">Box {box.id}</p>
              <h2>{box.nameTh}</h2>
              <p className="odds-lead">
                พูลรหัส {box.prefix}* · {box.pool.total} ชนิด · ซองละ{' '}
                {box.packCost} เหรียญ
              </p>
              {p && (
                <div className="odds-progress">
                  <div
                    className="odds-progress-bar"
                    style={
                      {
                        '--pct': `${(p.packsOpened / p.packsTotal) * 100}%`,
                      } as CSSProperties
                    }
                  />
                  <span>
                    เปิดแล้ว {p.packsOpened}/{p.packsTotal} ซอง
                    {p.reboxCount > 0 ? ` · Rebox #${p.reboxCount}` : ''}
                  </span>
                </div>
              )}
              <div className="odds-hero-actions">
                <button
                  type="button"
                  className="gacha-open-btn"
                  onClick={() => setTab('pull')}
                >
                  ไปเปิดซอง
                </button>
                <button
                  type="button"
                  className="gacha-rebox-btn"
                  disabled={busy}
                  onClick={() => void onRebox()}
                >
                  <RotateCcw size={16} />
                  Rebox
                </button>
              </div>
            </div>
          </section>

          {p && (
            <section className="odds-remain">
              <h3>เหลือในกล่องนี้</h3>
              <div className="odds-remain-grid">
                <article className="remain-card packs">
                  <span className="remain-label">ซอง</span>
                  <strong>
                    {p.packsLeft}
                    <small>/{p.packsTotal}</small>
                  </strong>
                  <div className="pack-dots" aria-hidden>
                    {Array.from({ length: p.packsTotal }, (_, i) => (
                      <span
                        key={i}
                        className={i < p.packsOpened ? 'used' : 'left'}
                      />
                    ))}
                  </div>
                </article>
                <article className="remain-card ur">
                  <span className="remain-label">UR</span>
                  <strong>
                    {p.urLeft}
                    <small>/{box.urPerBox}</small>
                  </strong>
                  <div className="gem-row" aria-hidden>
                    {Array.from({ length: box.urPerBox }, (_, i) => (
                      <span
                        key={i}
                        className={`gem ur ${i < p.urGot ? 'got' : 'left'}`}
                      />
                    ))}
                  </div>
                </article>
                <article className="remain-card sr">
                  <span className="remain-label">SR</span>
                  <strong>
                    {p.srLeft}
                    <small>/{box.srPerBox}</small>
                  </strong>
                  <div className="gem-row" aria-hidden>
                    {Array.from({ length: box.srPerBox }, (_, i) => (
                      <span
                        key={i}
                        className={`gem sr ${i < p.srGot ? 'got' : 'left'}`}
                      />
                    ))}
                  </div>
                </article>
                <article className="remain-card r">
                  <span className="remain-label">R ~</span>
                  <strong>{p.rLeft}</strong>
                  <p className="remain-note">ช่องแรร์ที่เหลือโดยประมาณ</p>
                </article>
              </div>
            </section>
          )}

          <section className="odds-anatomy">
            <h3>ใน 1 ซอง</h3>
            <div className="anatomy-row">
              <div className="anatomy-slot c">
                <span className="anatomy-count">×4</span>
                <span className="anatomy-rarity">C</span>
                <span className="anatomy-name">Common</span>
              </div>
              <span className="anatomy-plus">+</span>
              <div className="anatomy-slot rare">
                <span className="anatomy-count">×1</span>
                <span className="anatomy-rarity">R+</span>
                <span className="anatomy-name">แรร์ช่อง</span>
              </div>
            </div>
            <div className="rate-meter" aria-label="อัตราช่องแรร์">
              <div
                className="rate-seg ur"
                style={{ flex: box.rareRates.UR }}
                title={`UR ${(box.rareRates.UR * 100).toFixed(0)}%`}
              >
                UR {(box.rareRates.UR * 100).toFixed(0)}%
              </div>
              <div
                className="rate-seg sr"
                style={{ flex: box.rareRates.SR }}
                title={`SR ${(box.rareRates.SR * 100).toFixed(0)}%`}
              >
                SR {(box.rareRates.SR * 100).toFixed(0)}%
              </div>
              <div
                className="rate-seg r"
                style={{ flex: box.rareRates.R }}
                title={`R ${(box.rareRates.R * 100).toFixed(0)}%`}
              >
                R {(box.rareRates.R * 100).toFixed(0)}%
              </div>
            </div>
            <p className="odds-pity">
              รับประกันต่อกล่อง UR×{box.urPerBox} · SR×{box.srPerBox} — ถ้าซองที่เหลือ
              เท่ากับ UR+SR ที่ยังไม่ได้ จะออกแค่ UR/SR จนครบ
            </p>
          </section>

          <section className="odds-pool">
            <h3>พูลการ์ด</h3>
            <p className="odds-pool-hint">วางเมาส์บนการ์ดเพื่อดูเอฟเฟค</p>
            <div className="pool-rarity-grid">
              {(['UR', 'SR', 'R', 'C'] as Rarity[]).map((r) => {
                const samples = CARD_DATABASE.filter(
                  (c) => c.rarity === r && c.id.startsWith(box.prefix),
                ).slice(0, 4)
                return (
                  <article key={r} className={`pool-tile rarity-${r}`}>
                    <header>
                      <span className={`pool-badge rarity-${r}`}>{r}</span>
                      <div>
                        <strong>{RARITY_LABELS[r]}</strong>
                        <p>{box.pool[r]} ชนิด</p>
                      </div>
                    </header>
                    <div className="pool-thumbs">
                      {samples.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`pool-card-btn${
                            hoverPreview?.cardId === c.id ? ' is-preview' : ''
                          }`}
                          onMouseEnter={(e) => {
                            if (isCoarsePointer()) return
                            showPoolPreview(
                              { cardId: c.id, rarity: c.rarity },
                              e.currentTarget,
                              r,
                            )
                          }}
                          onMouseLeave={() => {
                            if (isCoarsePointer()) return
                            clearHoverPreview()
                          }}
                          onFocus={(e) =>
                            showPoolPreview(
                              { cardId: c.id, rarity: c.rarity },
                              e.currentTarget,
                              r,
                            )
                          }
                          onBlur={() => {
                            if (isCoarsePointer()) return
                            clearHoverPreview()
                          }}
                          onClick={(e) => {
                            if (!isCoarsePointer()) return
                            e.preventDefault()
                            togglePoolPreview(
                              { cardId: c.id, rarity: c.rarity },
                              e.currentTarget,
                              r,
                            )
                          }}
                          aria-label={c.nameTh}
                        >
                          <CardView cardId={c.id} size="tiny" hideName />
                        </button>
                      ))}
                      {box.pool[r] > samples.length && (
                        <span className="pool-more">
                          +{box.pool[r] - samples.length}
                        </span>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {tab === 'history' && (
        <div className="gacha-history">
          {history.length === 0 && (
            <p className="gacha-empty">ยังไม่มีประวัติการเปิดซอง</p>
          )}
          {history.map((h, idx) => (
            <article key={`${h.at}-${idx}`} className="gacha-history-row">
              <header>
                <span>
                  ซอง #{h.packIndex}
                  {h.reboxCount > 0 ? ` · Box #${h.reboxCount + 1}` : ''}
                </span>
                <span className="muted">
                  {new Date(h.at).toLocaleString('th-TH')}
                </span>
              </header>
              <div className="gacha-history-cards">
                {h.cards.map((c, i) => (
                  <button
                    key={`${c.cardId}-${i}`}
                    type="button"
                    className={`gacha-history-card${
                      hoverPreview?.cardId === c.cardId ? ' is-preview' : ''
                    }`}
                    onMouseEnter={(e) => {
                      if (isCoarsePointer()) return
                      showPoolPreview(
                        { cardId: c.cardId, rarity: c.rarity },
                        e.currentTarget,
                        c.rarity,
                      )
                    }}
                    onMouseLeave={() => {
                      if (isCoarsePointer()) return
                      clearHoverPreview()
                    }}
                    onFocus={(e) =>
                      showPoolPreview(
                        { cardId: c.cardId, rarity: c.rarity },
                        e.currentTarget,
                        c.rarity,
                      )
                    }
                    onBlur={() => {
                      if (isCoarsePointer()) return
                      clearHoverPreview()
                    }}
                    onClick={(e) => {
                      if (!isCoarsePointer()) return
                      e.preventDefault()
                      togglePoolPreview(
                        { cardId: c.cardId, rarity: c.rarity },
                        e.currentTarget,
                        c.rarity,
                      )
                    }}
                    aria-label={getCard(c.cardId).nameTh}
                  >
                    <CardView cardId={c.cardId} size="tiny" hideName />
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {hoverPreview &&
        previewPos &&
        (tab === 'odds' || tab === 'history' || phase === 'bulk') && (
          <div
            className={`gacha-hover-preview pool-beside-preview side-${previewSide}${
              previewSheet ? ' sheet' : ''
            }`}
            style={
              previewSheet
                ? undefined
                : ({
                    top: previewPos.top,
                    left: previewPos.left,
                  } as CSSProperties)
            }
            onClick={previewSheet ? clearHoverPreview : undefined}
            role={previewSheet ? 'presentation' : undefined}
            aria-hidden
          >
            <div className={`preview-frame rarity-${hoverPreview.rarity}`}>
              <CardView cardId={hoverPreview.cardId} size="preview" />
              <p className={`preview-rarity rarity-${hoverPreview.rarity}`}>
                {hoverPreview.rarity} · {RARITY_LABELS[hoverPreview.rarity]}
              </p>
              <p className="preview-name">
                {getCard(hoverPreview.cardId).nameTh}
              </p>
              <p className="preview-effect">
                {getCard(hoverPreview.cardId).type === 'monster' &&
                !getCard(hoverPreview.cardId).effectId
                  ? 'ไม่มีเอฟเฟค'
                  : getCard(hoverPreview.cardId).description}
              </p>
            </div>
          </div>
        )}
    </div>
  )
}
