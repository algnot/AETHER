import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  CARD_DATABASE,
  DEFAULT_DECK_LIST,
  MAX_COPIES,
  MAX_DECK,
  MIN_DECK,
  countDeckCards,
} from '../data/cards'
import type { DeckList } from '../types/game'

interface DeckStore {
  decks: DeckList[]
  activeDeckId: string
  /** Deck the CPU uses in duels */
  botDeckId: string
  setActiveDeck: (id: string) => void
  setBotDeck: (id: string) => void
  createDeck: (name: string) => void
  /** Add a built deck from import JSON; becomes the active deck */
  importDeck: (name: string, cards: Record<string, number>) => string
  renameDeck: (id: string, name: string) => void
  deleteDeck: (id: string) => void
  setCardCount: (deckId: string, cardId: string, count: number) => void
  getActiveDeck: () => DeckList
  getBotDeck: () => DeckList
  isDeckValid: (deckId?: string) => { valid: boolean; message: string }
}

const starter: DeckList = {
  id: 'starter',
  name: 'เด็คเริ่มต้น',
  cards: { ...DEFAULT_DECK_LIST },
}

export const useDeckStore = create<DeckStore>()(
  persist(
    (set, get) => ({
      decks: [starter],
      activeDeckId: 'starter',
      botDeckId: 'starter',

      setActiveDeck: (id) => set({ activeDeckId: id }),

      setBotDeck: (id) => {
        if (!get().decks.some((d) => d.id === id)) return
        set({ botDeckId: id })
      },

      createDeck: (name) => {
        const id = `deck_${Date.now()}`
        const trimmed = name.trim() || `เด็ค ${get().decks.length + 1}`
        set((s) => ({
          decks: [...s.decks, { id, name: trimmed, cards: {} }],
          activeDeckId: id,
        }))
      },

      importDeck: (name, cards) => {
        const id = `deck_${Date.now()}`
        const trimmed = name.trim() || `เด็คนำเข้า ${get().decks.length + 1}`
        set((s) => ({
          decks: [...s.decks, { id, name: trimmed, cards: { ...cards } }],
          activeDeckId: id,
        }))
        return id
      },

      renameDeck: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        set((s) => ({
          decks: s.decks.map((d) => (d.id === id ? { ...d, name: trimmed } : d)),
        }))
      },

      deleteDeck: (id) =>
        set((s) => {
          if (s.decks.length <= 1) return s
          const decks = s.decks.filter((d) => d.id !== id)
          const fallback = decks[0].id
          return {
            decks,
            activeDeckId: s.activeDeckId === id ? fallback : s.activeDeckId,
            botDeckId: s.botDeckId === id ? fallback : s.botDeckId,
          }
        }),

      setCardCount: (deckId, cardId, count) => {
        const clamped = Math.max(0, Math.min(MAX_COPIES, count))
        set((s) => ({
          decks: s.decks.map((d) => {
            if (d.id !== deckId) return d
            const cards = { ...d.cards }
            if (clamped === 0) delete cards[cardId]
            else cards[cardId] = clamped

            const prevTotal = countDeckCards(d.cards)
            const nextTotal = countDeckCards(cards)
            // Allow shrinking (even when already over MAX_DECK); only block growth past the cap
            if (nextTotal > MAX_DECK && nextTotal > prevTotal) return d
            return { ...d, cards }
          }),
        }))
      },

      getActiveDeck: () => {
        const s = get()
        return s.decks.find((d) => d.id === s.activeDeckId) ?? s.decks[0]
      },

      getBotDeck: () => {
        const s = get()
        return s.decks.find((d) => d.id === s.botDeckId) ?? s.decks[0]
      },

      isDeckValid: (deckId) => {
        const s = get()
        const deck = s.decks.find((d) => d.id === (deckId ?? s.activeDeckId))
        if (!deck) return { valid: false, message: 'ไม่พบเด็ค' }
        const total = countDeckCards(deck.cards)
        if (total < MIN_DECK)
          return {
            valid: false,
            message: `เด็คต้องมีอย่างน้อย ${MIN_DECK} ใบ (ตอนนี้ ${total})`,
          }
        if (total > MAX_DECK)
          return {
            valid: false,
            message: `เด็คต้องไม่เกิน ${MAX_DECK} ใบ (ตอนนี้ ${total})`,
          }
        for (const [id, n] of Object.entries(deck.cards)) {
          if (!CARD_DATABASE.some((c) => c.id === id))
            return { valid: false, message: `การ์ดไม่รู้จัก: ${id}` }
          if (n > MAX_COPIES)
            return {
              valid: false,
              message: `ใส่การ์ดซ้ำได้สูงสุด ${MAX_COPIES} ใบ`,
            }
        }
        return { valid: true, message: `เด็คพร้อม (${total} ใบ)` }
      },
    }),
    {
      name: 'card-game-decks-v2',
      version: 4,
      migrate: (persisted, fromVersion) => {
        const p = (persisted ?? {}) as Partial<DeckStore> & {
          decks?: DeckList[]
        }
        let decks = p.decks?.length ? p.decks : [starter]
        // v4: refresh built-in starter to the new warrior default list
        if (fromVersion < 4) {
          decks = decks.map((d) =>
            d.id === 'starter'
              ? { ...d, name: starter.name, cards: { ...DEFAULT_DECK_LIST } }
              : d,
          )
          if (!decks.some((d) => d.id === 'starter')) {
            decks = [starter, ...decks]
          }
        }
        const activeDeckId =
          p.activeDeckId && decks.some((d) => d.id === p.activeDeckId)
            ? p.activeDeckId
            : decks[0].id
        const botDeckId =
          fromVersion < 3 ||
          !p.botDeckId ||
          !decks.some((d) => d.id === p.botDeckId)
            ? activeDeckId
            : p.botDeckId
        return {
          decks,
          activeDeckId,
          botDeckId,
        }
      },
    },
  ),
)
