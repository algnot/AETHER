import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  Download,
  Gem,
  Home,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  CARD_DATABASE,
  MAX_COPIES,
  MAX_DECK,
  MIN_DECK,
  countDeckCards,
  getCard,
} from '../data/cards'
import { deckFileName, parseDeckJson, serializeDeck } from '../data/deckJson'
import {
  EVO_COST_BY_RARITY,
  SALVAGE_GEMS_BY_RARITY,
  SALVAGE_KEEP_COPIES,
} from '../lib/economy'
import { buildSalvagePlan } from '../lib/salvage'
import { evolvedInDeck } from '../lib/deckEvolved'
import { useAuthStore } from '../store/authStore'
import { useDeckStore } from '../store/deckStore'
import { useAppStore } from '../store/gameStore'
import type { CardType, DeckList, Tribe } from '../types/game'
import { CARD_TYPE_LABELS, RARITY_LABELS, RARITY_ORDER, TRIBE_LABELS } from '../types/game'
import { AtkIcon, CardTypeIcon, EnergyIcon, TribeIcon } from './GameIcons'
import { CardView } from './CardView'
import { DeckRenameModal } from './DeckRenameModal'
import { coverArts, DuelDeckPicker } from './DuelDeckPicker'
import './DeckBuilder.css'

const DND_CARD = 'application/x-aether-card'
const DND_FROM = 'application/x-aether-from'
const ICO = { size: 18, strokeWidth: 2, 'aria-hidden': true as const }

function IconBtn({
  title,
  onClick,
  children,
  danger,
  disabled,
}: {
  title: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${danger ? 'danger' : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function DeckBox({
  deck,
  active,
  valid,
  total,
  onOpen,
  onRename,
  onExport,
  onDelete,
  canDelete,
}: {
  deck: DeckList
  active: boolean
  valid: boolean
  total: number
  onOpen: () => void
  onRename: () => void
  onExport: () => void
  onDelete: () => void
  canDelete: boolean
}) {
  const arts = coverArts(deck)
  return (
    <article className={`deck-box ${active ? 'active' : ''} ${valid ? 'ok' : 'bad'}`}>
      <button type="button" className="deck-box-open" onClick={onOpen}>
        <div className="deck-box-case" aria-hidden>
          <div className="deck-box-lid" />
          <div className="deck-box-inner">
            {arts.length === 0 ? (
              <div className="deck-box-empty">ว่าง</div>
            ) : (
              arts.map((src, i) => (
                <img
                  key={`${src}-${i}`}
                  className={`deck-box-art art-${i}`}
                  src={src}
                  alt=""
                  draggable={false}
                />
              ))
            )}
          </div>
          <div className="deck-box-spine" />
        </div>
        <div className="deck-box-meta">
          <h2>{deck.name}</h2>
          <p>
            <span className={valid ? 'ok' : 'bad'}>
              {total}/{MIN_DECK}–{MAX_DECK}
            </span>
          </p>
        </div>
      </button>
      <div className="deck-box-tools">
        <IconBtn title="เปลี่ยนชื่อ" onClick={onRename}>
          <Pencil {...ICO} />
        </IconBtn>
        <IconBtn title="ส่งออก JSON" onClick={onExport}>
          <Upload {...ICO} />
        </IconBtn>
        <IconBtn title="ลบเด็ค" onClick={onDelete} danger disabled={!canDelete}>
          <Trash2 {...ICO} />
        </IconBtn>
      </div>
    </article>
  )
}

export function DeckBuilder() {
  const decks = useDeckStore((s) => s.decks)
  const activeDeckId = useDeckStore((s) => s.activeDeckId)
  const createDeck = useDeckStore((s) => s.createDeck)
  const importDeck = useDeckStore((s) => s.importDeck)
  const renameDeck = useDeckStore((s) => s.renameDeck)
  const deleteDeck = useDeckStore((s) => s.deleteDeck)
  const setCardCount = useDeckStore((s) => s.setCardCount)
  const isDeckValid = useDeckStore((s) => s.isDeckValid)
  const setScreen = useAppStore((s) => s.setScreen)
  const inventory = useAuthStore((s) => s.user?.inventory ?? {})
  const evolvedMap = useAuthStore((s) => s.user?.evolved ?? {})
  const gems = useAuthStore((s) => s.user?.gems ?? 0)
  const salvageExcess = useAuthStore((s) => s.salvageExcess)
  const salvaging = useAuthStore((s) => s.salvaging)
  const evolveCard = useAuthStore((s) => s.evolveCard)
  const evolving = useAuthStore((s) => s.evolving)
  const fileRef = useRef<HTMLInputElement>(null)

  const [view, setView] = useState<'shelf' | 'edit'>('shelf')
  const [editingId, setEditingId] = useState<string | null>(null)

  const deck =
    decks.find((d) => d.id === (editingId ?? activeDeckId)) ?? decks[0]
  const total = countDeckCards(deck.cards)
  const validity = isDeckValid(deck.id)
  const typeCounts = useMemo(() => {
    let monster = 0
    let spell = 0
    let trap = 0
    for (const [id, n] of Object.entries(deck.cards)) {
      const t = getCard(id).type
      if (t === 'monster') monster += n
      else if (t === 'spell') spell += n
      else if (t === 'trap') trap += n
    }
    return { monster, spell, trap }
  }, [deck.cards])

  const [filter, setFilter] = useState<'all' | CardType>('all')
  const [tribe, setTribe] = useState<'all' | Tribe>('all')
  const [costFilter, setCostFilter] = useState<'all' | number>('all')
  const [atkFilter, setAtkFilter] = useState<'all' | number>('all')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<string | null>(CARD_DATABASE[0].id)
  const [previewEvolved, setPreviewEvolved] = useState(false)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<'deck' | 'catalog' | null>(null)
  const [nameModal, setNameModal] = useState<'rename' | 'create' | null>(null)
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [tabletPanel, setTabletPanel] = useState<'deck' | 'catalog'>('catalog')
  const [salvageOpen, setSalvageOpen] = useState(false)
  const [salvageError, setSalvageError] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [evoBusy, setEvoBusy] = useState(false)

  const salvagePlan = useMemo(
    () => buildSalvagePlan(inventory, evolvedMap),
    [inventory, evolvedMap],
  )
  const canSalvage = salvagePlan.totalCards > 0

  const isCoarsePointer = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: none), (pointer: coarse)').matches

  const showTribe = filter === 'all' || filter === 'monster'
  const showAtk = filter === 'all' || filter === 'monster'

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filter !== 'all') n += 1
    if (showTribe && tribe !== 'all') n += 1
    if (costFilter !== 'all') n += 1
    if (showAtk && atkFilter !== 'all') n += 1
    return n
  }, [filter, tribe, costFilter, atkFilter, showTribe, showAtk])

  const costOptions = useMemo(() => {
    const pool =
      filter === 'all'
        ? CARD_DATABASE
        : CARD_DATABASE.filter((c) => c.type === filter)
    return [...new Set(pool.map((c) => c.cost))].sort((a, b) => a - b)
  }, [filter])

  const atkOptions = useMemo(() => {
    const pool = CARD_DATABASE.filter(
      (c) =>
        c.type === 'monster' &&
        c.atk !== undefined &&
        (filter === 'all' || filter === 'monster'),
    )
    return [...new Set(pool.map((c) => c.atk!))].sort((a, b) => a - b)
  }, [filter])

  const setTypeFilter = (t: 'all' | CardType) => {
    setFilter(t)
    if (t === 'spell' || t === 'trap') {
      setTribe('all')
      setAtkFilter('all')
    }
    setCostFilter('all')
  }

  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qNum = q !== '' && /^\d+$/.test(q) ? Number(q) : null
    return CARD_DATABASE.filter((c) => {
      if (filter !== 'all' && c.type !== filter) return false
      if (showTribe && tribe !== 'all' && c.tribe !== tribe) return false
      if (costFilter !== 'all' && c.cost !== costFilter) return false
      if (showAtk && atkFilter !== 'all') {
        if (c.atk === undefined || c.atk !== atkFilter) return false
      }
      if (q) {
        const hay = `${c.id} ${c.name} ${c.nameTh} ${c.description}`.toLowerCase()
        const textHit = hay.includes(q)
        const costHit = qNum !== null && c.cost === qNum
        const atkHit = qNum !== null && c.atk === qNum
        if (!textHit && !costHit && !atkHit) return false
      }
      return true
    })
  }, [filter, tribe, search, costFilter, atkFilter, showTribe, showAtk])

  /** Catalog rows split by evo vs normal when both exist. */
  const collectionRows = useMemo(() => {
    type Row = {
      cardId: string
      owned: number
      inDeck: number
      remaining: number
      evolved: boolean
      key: string
    }
    const rows: Row[] = []
    for (const c of catalog) {
      const owned = inventory[c.id] ?? 0
      const evolvedOwned = Math.min(evolvedMap[c.id] ?? 0, owned)
      const normalOwned = owned - evolvedOwned
      const inDeck = deck.cards[c.id] ?? 0
      const evoInDeck = evolvedInDeck(deck, c.id, evolvedOwned)
      const normalInDeck = inDeck - evoInDeck

      if (owned <= 0) {
        rows.push({
          cardId: c.id,
          owned: 0,
          inDeck: 0,
          remaining: 0,
          evolved: false,
          key: `${c.id}:n`,
        })
        continue
      }
      if (evolvedOwned > 0) {
        rows.push({
          cardId: c.id,
          owned: evolvedOwned,
          inDeck: evoInDeck,
          remaining: Math.max(0, evolvedOwned - evoInDeck),
          evolved: true,
          key: `${c.id}:e`,
        })
      }
      if (normalOwned > 0) {
        rows.push({
          cardId: c.id,
          owned: normalOwned,
          inDeck: normalInDeck,
          remaining: Math.max(0, normalOwned - normalInDeck),
          evolved: false,
          key: `${c.id}:n`,
        })
      }
    }
    rows.sort((a, b) => {
      const ar = a.remaining > 0 ? 1 : 0
      const br = b.remaining > 0 ? 1 : 0
      if (ar !== br) return br - ar
      const ao = a.owned > 0 ? 1 : 0
      const bo = b.owned > 0 ? 1 : 0
      if (ao !== bo) return bo - ao
      const idCmp = a.cardId.localeCompare(b.cardId)
      if (idCmp !== 0) return idCmp
      // Normal tile before Evo so double-clicking the first copy adds non-evo
      return Number(a.evolved) - Number(b.evolved)
    })
    return rows
  }, [catalog, inventory, evolvedMap, deck])

  const deckCopies = useMemo(() => {
    const copies: { cardId: string; key: string; evolved: boolean }[] = []
    const ids = Object.keys(deck.cards).sort()
    for (const id of ids) {
      const n = deck.cards[id] ?? 0
      const evoOwned = Math.min(evolvedMap[id] ?? 0, inventory[id] ?? 0)
      const evoInDeck = evolvedInDeck(deck, id, evoOwned)
      // Render normals first, then evo — matches collection order
      for (let i = 0; i < n - evoInDeck; i++) {
        copies.push({
          cardId: id,
          key: `${id}#n${i}`,
          evolved: false,
        })
      }
      for (let i = 0; i < evoInDeck; i++) {
        copies.push({
          cardId: id,
          key: `${id}#e${i}`,
          evolved: true,
        })
      }
    }
    return copies
  }, [deck, evolvedMap, inventory])

  const previewCard = preview ? CARD_DATABASE.find((c) => c.id === preview) : null
  const previewOwned = preview ? inventory[preview] ?? 0 : 0
  const previewEvolvedOwned = preview
    ? Math.min(evolvedMap[preview] ?? 0, previewOwned)
    : 0
  const previewUnevolved = Math.max(0, previewOwned - previewEvolvedOwned)
  const previewEvoCost = previewCard
    ? EVO_COST_BY_RARITY[previewCard.rarity]
    : 0
  const canEvolvePreview =
    !!previewCard && previewUnevolved > 0 && gems >= previewEvoCost && !evolving

  const selectPreview = (cardId: string, evolved = false) => {
    setPreview(cardId)
    setPreviewEvolved(evolved)
  }

  const onEvolvePreview = async () => {
    if (!preview || !canEvolvePreview || evoBusy) return
    setEvoBusy(true)
    setHint(null)
    try {
      const res = await evolveCard(preview, 1)
      setPreviewEvolved(true)
      setHint(
        `วิวัฒนาการสำเร็จ (−${res.totalCost.toLocaleString('th-TH')} เพชร)`,
      )
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'วิวัฒนาการไม่สำเร็จ')
    } finally {
      setEvoBusy(false)
    }
  }

  const openDeck = (id: string) => {
    setEditingId(id)
    setView('edit')
    setHint(null)
  }

  const addOne = (cardId: string, asEvolved = false) => {
    const owned = inventory[cardId] ?? 0
    const evoOwned = Math.min(evolvedMap[cardId] ?? 0, owned)
    const normalOwned = owned - evoOwned
    const cur = deck.cards[cardId] ?? 0
    const curEvo = evolvedInDeck(deck, cardId, evoOwned)
    const curNormal = cur - curEvo

    if (owned <= 0) {
      setHint('ยังไม่มีการ์ดใบนี้ในคลัง (รอระบบกาชาในภายหลัง)')
      return
    }
    if (asEvolved) {
      if (curEvo >= evoOwned) {
        setHint(
          evoOwned <= 0
            ? 'ยังไม่มีใบ Evo ในคลัง'
            : `ใส่ใบ Evo ครบแล้ว (${evoOwned} ใบ)`,
        )
        return
      }
    } else if (curNormal >= normalOwned) {
      setHint(
        normalOwned <= 0
          ? 'ใบปกติหมดแล้ว — เลือกแถว Evo ถ้าต้องการใส่ใบวิวัฒนาการ'
          : `ใส่ใบปกติครบแล้ว (${normalOwned} ใบ)`,
      )
      return
    }
    if (cur >= owned) {
      setHint(`คุณมีใบนี้ ${owned} ใบ — ใส่ในเด็คครบแล้ว`)
      return
    }
    if (cur >= MAX_COPIES) {
      setHint(`ใส่การ์ดใบนี้ได้สูงสุด ${MAX_COPIES} ใบ`)
      return
    }
    if (total >= MAX_DECK) {
      setHint(`เด็คเต็มแล้ว (สูงสุด ${MAX_DECK} ใบ)`)
      return
    }
    setHint(null)
    setCardCount(deck.id, cardId, cur + 1, asEvolved ? curEvo + 1 : curEvo)
  }

  const removeOne = (cardId: string, asEvolved = false) => {
    const cur = deck.cards[cardId] ?? 0
    if (cur <= 0) return
    const evoOwned = Math.min(evolvedMap[cardId] ?? 0, inventory[cardId] ?? 0)
    const curEvo = evolvedInDeck(deck, cardId, evoOwned)
    const curNormal = cur - curEvo

    if (asEvolved) {
      if (curEvo <= 0) return
      setHint(null)
      setCardCount(deck.id, cardId, cur - 1, curEvo - 1)
      return
    }
    if (curNormal <= 0) {
      // No normal slot — fall back to removing an evo copy
      if (curEvo <= 0) return
      setHint(null)
      setCardCount(deck.id, cardId, cur - 1, curEvo - 1)
      return
    }
    setHint(null)
    setCardCount(deck.id, cardId, cur - 1, curEvo)
  }

  const onDragStart = (
    e: DragEvent,
    cardId: string,
    from: 'catalog' | 'deck',
    evolved = false,
  ) => {
    e.stopPropagation()
    const evoFlag = evolved ? '1' : '0'
    e.dataTransfer.setData('text/plain', `${from}:${cardId}:${evoFlag}`)
    try {
      e.dataTransfer.setData(DND_CARD, cardId)
      e.dataTransfer.setData(DND_FROM, from)
      e.dataTransfer.setData('application/x-aether-evo', evoFlag)
    } catch {
      /* some browsers reject custom MIME types */
    }
    e.dataTransfer.effectAllowed = from === 'catalog' ? 'copy' : 'move'
  }

  const readPayload = (e: DragEvent) => {
    const customFrom = e.dataTransfer.getData(DND_FROM)
    const customId = e.dataTransfer.getData(DND_CARD)
    const customEvo = e.dataTransfer.getData('application/x-aether-evo')
    const plain = e.dataTransfer.getData('text/plain')
    const [plainFrom, plainId, plainEvo] = plain.split(':')
    const from = customFrom || plainFrom
    const cardId = customId || plainId || ''
    const evolved = (customEvo || plainEvo) === '1'
    return { from, cardId, evolved }
  }

  const leaveDropZone = (e: DragEvent) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setDragOver(null)
  }

  const onDropToDeck = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(null)
    const { from, cardId, evolved } = readPayload(e)
    if (!cardId) return
    if (from === 'catalog') addOne(cardId, evolved)
    selectPreview(cardId, evolved)
  }

  const onDropToCatalog = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(null)
    const { from, cardId, evolved } = readPayload(e)
    if (!cardId || from !== 'deck') return
    removeOne(cardId, evolved)
    selectPreview(cardId, evolved)
  }

  const hasCardPayload = (e: DragEvent) => {
    const types = Array.from(e.dataTransfer.types)
    return types.includes(DND_CARD) || types.includes('text/plain')
  }

  const exportNamed = (d: DeckList) => {
    const json = serializeDeck({ name: d.name, cards: d.cards })
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = deckFileName(d.name)
    a.click()
    URL.revokeObjectURL(url)
    setHint(`ส่งออก «${d.name}» แล้ว`)
  }

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed = parseDeckJson(await file.text())
      const id = importDeck(parsed.name, parsed.cards)
      const n = countDeckCards(parsed.cards)
      const extras: string[] = []
      if (parsed.skipped.length) extras.push(`ข้าม ${parsed.skipped.length} รหัส`)
      if (parsed.clamped.length) extras.push(`ตัดสำเนาเกิน ${MAX_COPIES}`)
      setHint([`นำเข้า «${parsed.name}» ${n} ใบ`, ...extras].join(' · '))
      openDeck(id)
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'นำเข้าไม่สำเร็จ')
    }
  }

  const confirmDelete = (id: string, name: string) => {
    if (decks.length <= 1) {
      setHint('ต้องเหลืออย่างน้อย 1 เด็ค')
      return
    }
    if (!window.confirm(`ลบเด็ค «${name}» ?`)) return
    deleteDeck(id)
    if (editingId === id) {
      setView('shelf')
      setEditingId(null)
    }
    setHint(`ลบ «${name}» แล้ว`)
  }

  const openSalvageModal = () => {
    setSalvageError(null)
    if (!canSalvage) {
      setHint(
        `ไม่มีการ์ดส่วนเกิน — เก็บได้สูงสุด ${SALVAGE_KEEP_COPIES} ปกติ + ${SALVAGE_KEEP_COPIES} Evo ต่อชนิด`,
      )
      return
    }
    setSalvageOpen(true)
  }

  const runSalvage = async () => {
    setSalvageError(null)
    try {
      const res = await salvageExcess()
      setSalvageOpen(false)
      setHint(
        `ย่อย ${res.totalCards} ใบ · ได้ ${res.totalGems.toLocaleString('th-TH')} เพชร`,
      )
    } catch (err) {
      setSalvageError(err instanceof Error ? err.message : 'ย่อยการ์ดไม่สำเร็จ')
    }
  }

  const renameModalDeck =
    renameTargetId != null
      ? decks.find((d) => d.id === renameTargetId) ?? deck
      : deck

  return (
    <div className="builder-root">
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={onImportFile}
      />

      <DeckRenameModal
        open={nameModal !== null}
        mode={nameModal === 'create' ? 'create' : 'rename'}
        initialName={
          nameModal === 'create'
            ? `เด็ค ${decks.length + 1}`
            : renameModalDeck.name
        }
        onClose={() => {
          setNameModal(null)
          setRenameTargetId(null)
        }}
        onConfirm={(name) => {
          if (nameModal === 'create') {
            createDeck(name)
            const newest = useDeckStore.getState().activeDeckId
            openDeck(newest)
          } else if (renameTargetId) {
            renameDeck(renameTargetId, name)
          } else {
            renameDeck(deck.id, name)
          }
        }}
      />

      {view === 'shelf' ? (
        <>
          <header className="builder-header shelf-header">
            <IconBtn title="กลับเมนู" onClick={() => setScreen('menu')}>
              <Home {...ICO} />
            </IconBtn>
            <div className="builder-title-block">
              <p className="builder-eyebrow">Collection</p>
              <h1>กล่องเด็ค</h1>
            </div>
            <div className="header-tools">
              <span className="builder-gems" title="เพชร">
                <Gem size={15} strokeWidth={2.25} aria-hidden />
                {gems.toLocaleString('th-TH')}
              </span>
              <button
                type="button"
                className="builder-salvage-btn"
                disabled={!canSalvage || salvaging}
                onClick={openSalvageModal}
                title={
                  canSalvage
                    ? `ย่อยส่วนเกิน ${salvagePlan.totalCards} ใบ → ${salvagePlan.totalGems} เพชร`
                    : `เก็บได้สูงสุด ${SALVAGE_KEEP_COPIES} ปกติ + ${SALVAGE_KEEP_COPIES} Evo ต่อชนิด`
                }
              >
                <Gem size={15} strokeWidth={2.25} aria-hidden />
                ย่อยการ์ด
                {canSalvage && (
                  <span className="builder-salvage-count">
                    {salvagePlan.totalCards}
                  </span>
                )}
              </button>
              <IconBtn
                title="เด็คใหม่"
                onClick={() => {
                  setRenameTargetId(null)
                  setNameModal('create')
                }}
              >
                <Plus {...ICO} />
              </IconBtn>
              <IconBtn title="นำเข้า JSON" onClick={() => fileRef.current?.click()}>
                <Download {...ICO} />
              </IconBtn>
            </div>
          </header>
          {hint && <p className="builder-hint">{hint}</p>}
          <div className="deck-shelf">
            {decks.map((d) => {
              const n = countDeckCards(d.cards)
              const v = isDeckValid(d.id)
              return (
                <DeckBox
                  key={d.id}
                  deck={d}
                  active={d.id === activeDeckId}
                  valid={v.valid}
                  total={n}
                  onOpen={() => openDeck(d.id)}
                  onRename={() => {
                    setRenameTargetId(d.id)
                    setNameModal('rename')
                  }}
                  onExport={() => exportNamed(d)}
                  onDelete={() => confirmDelete(d.id, d.name)}
                  canDelete={decks.length > 1}
                />
              )
            })}
            <button
              type="button"
              className="deck-box-new"
              onClick={() => {
                setRenameTargetId(null)
                setNameModal('create')
              }}
            >
              <span className="deck-box-new-plus">
                <Plus {...ICO} size={22} />
              </span>
              <span>สร้างกล่องใหม่</span>
            </button>
          </div>
          <footer className="shelf-duel-bar">
            <DuelDeckPicker className="bar" />
          </footer>
        </>
      ) : (
        <>
          <header className="builder-header edit-header">
            <IconBtn
              title="กลับไปกล่องเด็ค"
              onClick={() => {
                setView('shelf')
                setEditingId(null)
                setHint(null)
              }}
            >
              <ChevronLeft {...ICO} />
            </IconBtn>
            <div className="builder-title-block">
              <p className="builder-eyebrow">กำลังจัด</p>
              <h1>{deck.name}</h1>
            </div>
            <div className="header-tools">
              <span className="builder-gems" title="เพชร">
                <Gem size={15} strokeWidth={2.25} aria-hidden />
                {gems.toLocaleString('th-TH')}
              </span>
              <button
                type="button"
                className="builder-salvage-btn"
                disabled={!canSalvage || salvaging}
                onClick={openSalvageModal}
                title={
                  canSalvage
                    ? `ย่อยส่วนเกิน ${salvagePlan.totalCards} ใบ → ${salvagePlan.totalGems} เพชร`
                    : `เก็บได้สูงสุด ${SALVAGE_KEEP_COPIES} ปกติ + ${SALVAGE_KEEP_COPIES} Evo ต่อชนิด`
                }
              >
                <Gem size={15} strokeWidth={2.25} aria-hidden />
                ย่อยการ์ด
                {canSalvage && (
                  <span className="builder-salvage-count">
                    {salvagePlan.totalCards}
                  </span>
                )}
              </button>
              <IconBtn
                title="เปลี่ยนชื่อ"
                onClick={() => {
                  setRenameTargetId(deck.id)
                  setNameModal('rename')
                }}
              >
                <Pencil {...ICO} />
              </IconBtn>
              <IconBtn title="นำเข้า JSON" onClick={() => fileRef.current?.click()}>
                <Download {...ICO} />
              </IconBtn>
              <IconBtn title="ส่งออก JSON" onClick={() => exportNamed(deck)}>
                <Upload {...ICO} />
              </IconBtn>
              <IconBtn
                title="ลบเด็ค"
                danger
                disabled={decks.length <= 1}
                onClick={() => confirmDelete(deck.id, deck.name)}
              >
                <Trash2 {...ICO} />
              </IconBtn>
            </div>
            <div className={`deck-count ${validity.valid ? 'ok' : 'bad'}`}>
              <span className="deck-count-total">
                {total}
                <span className="deck-count-range">/{MIN_DECK}–{MAX_DECK}</span>
              </span>
              <small className="deck-count-types">
                มอน {typeCounts.monster} · เวท {typeCounts.spell} · กับดัก{' '}
                {typeCounts.trap}
              </small>
              {hint && <small className="deck-count-hint">{hint}</small>}
              {!hint && !validity.valid && (
                <small className="deck-count-hint">{validity.message}</small>
              )}
            </div>
          </header>

          <div className="builder-panel-tabs" role="tablist" aria-label="แผงจัดเด็ค">
            <button
              type="button"
              role="tab"
              className={tabletPanel === 'deck' ? 'on' : ''}
              aria-selected={tabletPanel === 'deck'}
              onClick={() => setTabletPanel('deck')}
            >
              ในเด็ค <span>{total}</span>
            </button>
            <button
              type="button"
              role="tab"
              className={tabletPanel === 'catalog' ? 'on' : ''}
              aria-selected={tabletPanel === 'catalog'}
              onClick={() => setTabletPanel('catalog')}
            >
              คลังการ์ด
            </button>
          </div>

          <div className={`builder-body panel-${tabletPanel}`}>
            <aside className="builder-preview">
              {previewCard && (
                <>
                  <div className="preview-card-wrap">
                    <CardView
                      cardId={previewCard.id}
                      size="preview"
                      evolved={
                        previewEvolvedOwned > 0 &&
                        (previewEvolved || previewUnevolved <= 0)
                      }
                    />
                  </div>
                  <p className="code">
                    {previewCard.id}
                    {previewEvolvedOwned > 0 &&
                    (previewEvolved || previewUnevolved <= 0)
                      ? ' · Evo'
                      : ' · ปกติ'}
                  </p>
                  {previewEvolvedOwned > 0 && previewUnevolved > 0 && (
                    <div className="preview-variant-tabs" role="tablist" aria-label="รูปแบบการ์ด">
                      <button
                        type="button"
                        role="tab"
                        className={!previewEvolved ? 'on' : ''}
                        aria-selected={!previewEvolved}
                        onClick={() => setPreviewEvolved(false)}
                      >
                        ปกติ · {previewUnevolved}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={previewEvolved ? 'on' : ''}
                        aria-selected={previewEvolved}
                        onClick={() => setPreviewEvolved(true)}
                      >
                        Evo · {previewEvolvedOwned}
                      </button>
                    </div>
                  )}
                  <h2>{previewCard.nameTh}</h2>
                  <p className="en">{previewCard.name}</p>
                  <p className="meta">
                    <span className={`rarity-tag rarity-${previewCard.rarity}`}>
                      {previewCard.rarity} · {RARITY_LABELS[previewCard.rarity]}
                    </span>
                    {' · '}
                    {CARD_TYPE_LABELS[previewCard.type]}
                    {previewCard.tribe
                      ? ` · ${TRIBE_LABELS[previewCard.tribe]}`
                      : ''}
                    {' · '}⚡{previewCard.cost}
                    {previewCard.atk !== undefined
                      ? ` · ATK ${previewCard.atk}`
                      : ''}
                  </p>
                  <p className="desc">{previewCard.description}</p>
                  {previewOwned > 0 && (
                    <div className="preview-evo">
                      <p className="preview-evo-count">
                        คลัง {previewOwned} ใบ
                        {previewEvolvedOwned > 0
                          ? ` · Evo ${previewEvolvedOwned}`
                          : ''}
                        {previewUnevolved > 0
                          ? ` · ปกติ ${previewUnevolved}`
                          : ''}
                      </p>
                      {previewUnevolved > 0 ? (
                        <button
                          type="button"
                          className="preview-evo-btn"
                          disabled={!canEvolvePreview || evoBusy}
                          onClick={() => void onEvolvePreview()}
                          title={`วิวัฒนาการ 1 ใบ · ${previewEvoCost.toLocaleString('th-TH')} เพชร`}
                        >
                          <Gem size={14} strokeWidth={2.25} aria-hidden />
                          {evoBusy || evolving
                            ? 'กำลัง Evo…'
                            : `Evo · ${previewEvoCost.toLocaleString('th-TH')}`}
                        </button>
                      ) : (
                        <p className="preview-evo-done">วิวัฒนาการครบแล้ว</p>
                      )}
                      {previewUnevolved > 0 && gems < previewEvoCost && (
                        <p className="preview-evo-need">
                          เพชรไม่พอ (ต้องการ {previewEvoCost.toLocaleString('th-TH')})
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </aside>

            <section
              className={`builder-deck ${dragOver === 'deck' ? 'drop-target' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                if (hasCardPayload(e)) setDragOver('deck')
              }}
              onDragLeave={leaveDropZone}
              onDrop={onDropToDeck}
            >
              <div className="panel-head">
                <h3>
                  ในเด็ค <span>{total}</span>
                </h3>
              </div>
              <div className="deck-copies">
                {deckCopies.length === 0 && (
                  <p className="deck-empty">
                    แตะการ์ดในคลังเพื่อเพิ่ม · แตะในเด็คเพื่อเอาออก
                  </p>
                )}
                {deckCopies.map((copy) => (
                  <div
                    key={copy.key}
                    className={`deck-copy ${copy.evolved ? 'is-evo' : ''}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, copy.cardId, 'deck', copy.evolved)}
                    onDragEnd={() => setDragOver(null)}
                    onClick={() => {
                      selectPreview(copy.cardId, copy.evolved)
                      if (isCoarsePointer()) removeOne(copy.cardId, copy.evolved)
                    }}
                    onDoubleClick={() => {
                      selectPreview(copy.cardId, copy.evolved)
                      removeOne(copy.cardId, copy.evolved)
                    }}
                    onMouseEnter={() => {
                      if (isCoarsePointer()) return
                      setHoverKey(`deck:${copy.key}`)
                    }}
                    onMouseLeave={() => setHoverKey(null)}
                  >
                    <CardView
                      cardId={copy.cardId}
                      size="small"
                      hideName
                      evolved={copy.evolved}
                      selected={
                        hoverKey === `deck:${copy.key}` ||
                        (preview === copy.cardId &&
                          previewEvolved === copy.evolved &&
                          hoverKey === null)
                      }
                    />
                    <span
                      className={`variant-chip ${copy.evolved ? 'evo' : 'normal'}`}
                      aria-hidden
                    >
                      {copy.evolved ? 'Evo' : 'ปกติ'}
                    </span>
                  </div>
                ))}
              </div>
              {dragOver === 'deck' && (
                <div className="drop-banner">วางที่นี่เพื่อเพิ่มเข้าเด็ค</div>
              )}
            </section>

            <section
              className={`builder-catalog ${dragOver === 'catalog' ? 'drop-target' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (hasCardPayload(e)) setDragOver('catalog')
              }}
              onDragLeave={leaveDropZone}
              onDrop={onDropToCatalog}
            >
              <div
                className={`panel-head catalog-head ${filtersOpen ? 'filters-open' : 'filters-collapsed'}`}
              >
                <div className="search-row">
                  <span className="search-ico" aria-hidden>
                    <Search size={16} strokeWidth={2} />
                  </span>
                  <input
                    className="card-search"
                    type="search"
                    placeholder="ค้นหาชื่อ / รหัส / เลขร่าย·ATK…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="ค้นหาการ์ด"
                  />
                </div>
                <button
                  type="button"
                  className="filters-toggle"
                  aria-expanded={filtersOpen}
                  aria-controls="catalog-filter-panel"
                  onClick={() => setFiltersOpen((o) => !o)}
                >
                  <ChevronDown
                    className="filters-toggle-chevron"
                    size={16}
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  <span>ตัวกรอง</span>
                  {activeFilterCount > 0 && (
                    <span className="filters-toggle-badge" title="ตัวกรองที่ใช้อยู่">
                      {activeFilterCount}
                    </span>
                  )}
                  <span className="filters-toggle-hint">
                    {filtersOpen ? 'หุบ' : 'ขยาย'}
                  </span>
                </button>
                <div
                  id="catalog-filter-panel"
                  className="catalog-filter-panel"
                  hidden={!filtersOpen}
                >
                  <div className="filters">
                    <button
                      type="button"
                      className={`filter-ico ${filter === 'all' ? 'on' : ''}`}
                      title="ทั้งหมด"
                      aria-label="ทั้งหมด"
                      onClick={() => setTypeFilter('all')}
                    >
                      <LayoutGrid {...ICO} />
                    </button>
                    {(['monster', 'spell', 'trap'] as CardType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`filter-ico ${filter === t ? 'on' : ''}`}
                        title={CARD_TYPE_LABELS[t]}
                        aria-label={CARD_TYPE_LABELS[t]}
                        onClick={() => setTypeFilter(t)}
                      >
                        <CardTypeIcon type={t} />
                      </button>
                    ))}
                  </div>

                  {showTribe && (
                    <div className="filters" role="group" aria-label="เผ่า">
                      <button
                        type="button"
                        className={`filter-ico ${tribe === 'all' ? 'on' : ''}`}
                        title="ทุกเผ่า"
                        aria-label="ทุกเผ่า"
                        onClick={() => setTribe('all')}
                      >
                        <LayoutGrid {...ICO} />
                      </button>
                      {(Object.keys(TRIBE_LABELS) as Tribe[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`filter-ico ${tribe === t ? 'on' : ''}`}
                          title={TRIBE_LABELS[t]}
                          aria-label={TRIBE_LABELS[t]}
                          onClick={() => setTribe(t)}
                        >
                          <TribeIcon tribe={t} />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="filters filters-stats" role="group" aria-label="ค่าร่าย">
                    <button
                      type="button"
                      className={`filter-ico ${costFilter === 'all' ? 'on' : ''}`}
                      title="ทุกร่าย"
                      aria-label="ทุกร่าย"
                      onClick={() => setCostFilter('all')}
                    >
                      <EnergyIcon />
                    </button>
                    {costOptions.map((n) => (
                      <button
                        key={`cost-${n}`}
                        type="button"
                        className={`filter-ico filter-num ${costFilter === n ? 'on' : ''}`}
                        title={`ค่าร่าย ${n}`}
                        aria-label={`ค่าร่าย ${n}`}
                        onClick={() => setCostFilter(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {showAtk && (
                    <div className="filters filters-stats" role="group" aria-label="พลังโจมตี">
                      <button
                        type="button"
                        className={`filter-ico ${atkFilter === 'all' ? 'on' : ''}`}
                        title="ทุก ATK"
                        aria-label="ทุก ATK"
                        onClick={() => setAtkFilter('all')}
                      >
                        <AtkIcon />
                      </button>
                      {atkOptions.map((n) => (
                        <button
                          key={`atk-${n}`}
                          type="button"
                          className={`filter-ico filter-num ${atkFilter === n ? 'on' : ''}`}
                          title={`ATK ${n}`}
                          aria-label={`ATK ${n}`}
                          onClick={() => setAtkFilter(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="card-grid">
                {catalog.length === 0 && (
                  <p className="deck-empty">ไม่พบการ์ดที่ตรงกับคำค้น</p>
                )}
                {collectionRows.map((row) => {
                  const { owned, remaining, evolved } = row
                  const totalInDeck = deck.cards[row.cardId] ?? 0
                  const canAdd =
                    remaining > 0 && totalInDeck < MAX_COPIES
                  const unavailable = remaining <= 0
                  return (
                    <div
                      key={row.key}
                      className={`grid-item ${unavailable ? 'unowned' : ''} ${evolved ? 'is-evo' : ''}`}
                      draggable={canAdd}
                      onDragStart={(e) => {
                        if (!canAdd) {
                          e.preventDefault()
                          return
                        }
                        onDragStart(e, row.cardId, 'catalog', evolved)
                      }}
                      onDragEnd={() => setDragOver(null)}
                      onClick={() => {
                        selectPreview(row.cardId, evolved)
                        if (isCoarsePointer() && canAdd) addOne(row.cardId, evolved)
                      }}
                      onDoubleClick={() => {
                        selectPreview(row.cardId, evolved)
                        addOne(row.cardId, evolved)
                      }}
                      onMouseEnter={() => {
                        if (isCoarsePointer()) return
                        setHoverKey(`catalog:${row.key}`)
                      }}
                      onMouseLeave={() => setHoverKey(null)}
                    >
                      <CardView
                        cardId={row.cardId}
                        size="small"
                        hideName
                        evolved={evolved}
                        dimmed={unavailable}
                        selected={
                          hoverKey === `catalog:${row.key}` ||
                          (preview === row.cardId &&
                            previewEvolved === evolved &&
                            hoverKey === null)
                        }
                      />
                      <span
                        className={`variant-chip ${evolved ? 'evo' : 'normal'}`}
                        aria-hidden
                      >
                        {evolved ? 'Evo' : 'ปกติ'}
                      </span>
                      {owned > 0 && (
                        <span
                          className={`qty-badge ${remaining <= 0 ? 'empty' : ''} ${evolved ? 'evo' : ''}`}
                          title={
                            remaining > 0
                              ? `${evolved ? 'Evo' : 'ปกติ'} เหลือใส่ได้ ${remaining} / มี ${owned}`
                              : `${evolved ? 'Evo' : 'ปกติ'} ใส่ครบแล้ว`
                          }
                        >
                          {remaining}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {dragOver === 'catalog' && (
                <div className="drop-banner">วางที่นี่เพื่อลบออกจากเด็ค</div>
              )}
            </section>
          </div>
        </>
      )}

      {salvageOpen && (
        <div
          className="builder-salvage-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="salvage-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !salvaging) setSalvageOpen(false)
          }}
        >
          <div className="builder-salvage-panel">
            <header className="builder-salvage-head">
              <h3 id="salvage-title">ย่อยการ์ดส่วนเกิน</h3>
              <button
                type="button"
                className="builder-salvage-x"
                disabled={salvaging}
                aria-label="ปิด"
                onClick={() => setSalvageOpen(false)}
              >
                <X size={18} strokeWidth={2.25} />
              </button>
            </header>
            <p className="builder-salvage-lead">
              แยกพูลปกติ / Evo — เก็บสูงสุด {SALVAGE_KEEP_COPIES} ใบต่อพูล
              (รวมได้ถึง {SALVAGE_KEEP_COPIES * 2} ใบ/ชนิด) ใบที่เกินแลกเป็นเพชรตามแรริตี้
            </p>
            <ul className="builder-salvage-rates">
              {RARITY_ORDER.map((r) => (
                <li key={r}>
                  <span className={`rarity-tag rarity-${r}`}>{r}</span>
                  <strong>{SALVAGE_GEMS_BY_RARITY[r]} เพชร/ใบ</strong>
                </li>
              ))}
            </ul>
            <ul className="builder-salvage-stats">
              {RARITY_ORDER.filter((r) => salvagePlan.byRarity[r].cards > 0).map(
                (r) => (
                  <li key={`sum-${r}`}>
                    <span>
                      {r} · {salvagePlan.byRarity[r].cards} ใบ
                    </span>
                    <strong>
                      +{salvagePlan.byRarity[r].gems.toLocaleString('th-TH')}
                    </strong>
                  </li>
                ),
              )}
              <li className="total">
                <span>รวม {salvagePlan.totalCards} ใบ</span>
                <strong>
                  +{salvagePlan.totalGems.toLocaleString('th-TH')} เพชร
                </strong>
              </li>
            </ul>
            <div className="builder-salvage-list">
              {salvagePlan.lines.map((line) => (
                <div
                  key={`${line.cardId}:${line.evolved ? 'e' : 'n'}`}
                  className={`builder-salvage-row ${line.evolved ? 'is-evo' : ''}`}
                >
                  <CardView
                    cardId={line.cardId}
                    size="tiny"
                    hideName
                    evolved={line.evolved}
                  />
                  <div className="builder-salvage-row-meta">
                    <strong>
                      {line.nameTh}
                      {line.evolved ? ' · Evo' : ' · ปกติ'}
                    </strong>
                    <span>
                      มี {line.owned} → เหลือ {line.keep} · ย่อย {line.qty} ×{' '}
                      {line.gemsEach}
                    </span>
                  </div>
                  <span className={`rarity-tag rarity-${line.rarity}`}>
                    {line.rarity}
                  </span>
                  <em>+{line.gems}</em>
                </div>
              ))}
            </div>
            {salvageError && (
              <p className="builder-salvage-error" role="alert">
                {salvageError}
              </p>
            )}
            <div className="builder-salvage-actions">
              <button
                type="button"
                className="builder-salvage-confirm"
                disabled={salvaging || !canSalvage}
                onClick={() => void runSalvage()}
              >
                {salvaging
                  ? 'กำลังย่อย…'
                  : `ยืนยัน · ได้ ${salvagePlan.totalGems.toLocaleString('th-TH')} เพชร`}
              </button>
              <button
                type="button"
                className="builder-salvage-cancel"
                disabled={salvaging}
                onClick={() => setSalvageOpen(false)}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
