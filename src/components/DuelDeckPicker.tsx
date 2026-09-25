import { ChevronDown } from 'lucide-react'
import { MIN_DECK, MAX_DECK, countDeckCards, getCard } from '../data/cards'
import { useDeckStore } from '../store/deckStore'
import type { DeckList } from '../types/game'
import { CustomDropdown } from './CustomDropdown'
import './DuelDeckPicker.css'

export function coverArts(deck: DeckList): string[] {
  const ranked = Object.entries(deck.cards)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id)
  const arts: string[] = []
  for (const id of ranked) {
    try {
      arts.push(getCard(id).image)
    } catch {
      /* skip */
    }
    if (arts.length >= 3) break
  }
  return arts
}

/** Bottom bar: which deck fights — change here without opening the editor. */
export function DuelDeckPicker({ className = '' }: { className?: string }) {
  const decks = useDeckStore((s) => s.decks)
  const activeDeckId = useDeckStore((s) => s.activeDeckId)
  const setActiveDeck = useDeckStore((s) => s.setActiveDeck)
  const isDeckValid = useDeckStore((s) => s.isDeckValid)
  const deck = decks.find((d) => d.id === activeDeckId) ?? decks[0]
  if (!deck) return null

  const total = countDeckCards(deck.cards)
  const validity = isDeckValid(deck.id)
  const arts = coverArts(deck)

  const options = decks.map((d) => {
    const n = countDeckCards(d.cards)
    const v = isDeckValid(d.id)
    return {
      value: d.id,
      label: `${d.name} (${n})`,
      hint: v.valid ? undefined : v.message,
      disabled: false,
    }
  })

  return (
    <div className={`duel-deck-picker ${className}`}>
      <div className="ddp-case" aria-hidden>
        {arts.length === 0 ? (
          <span className="ddp-empty">ว่าง</span>
        ) : (
          arts.map((src, i) => (
            <img
              key={`${src}-${i}`}
              className={`ddp-art art-${i}`}
              src={src}
              alt=""
              draggable={false}
            />
          ))
        )}
      </div>
      <div className="ddp-info">
        <span className="ddp-label">เด็คดวล</span>
        <strong className="ddp-name">{deck.name}</strong>
        <span className={`ddp-status ${validity.valid ? 'ok' : 'bad'}`}>
          {total}/{MIN_DECK}–{MAX_DECK} · {validity.message}
        </span>
      </div>
      <CustomDropdown
        className="ddp-dropdown"
        value={deck.id}
        options={options}
        onChange={setActiveDeck}
        ariaLabel="เลือกเด็คสำหรับดวล"
        align="end"
        trigger={
          <span className="ddp-change">
            <span className="ddp-change-text">เปลี่ยน</span>
            <ChevronDown size={16} strokeWidth={2} aria-hidden />
          </span>
        }
      />
    </div>
  )
}
