import type { DeckList } from '../types/game'

/** Evolved copies currently assigned in the deck for this cardId. */
export function evolvedInDeck(
  deck: Pick<DeckList, 'cards' | 'evolved'>,
  cardId: string,
  evoOwned = Infinity,
): number {
  const n = deck.cards[cardId] ?? 0
  if (n <= 0) return 0
  const raw = deck.evolved?.[cardId] ?? 0
  return Math.min(n, Math.max(0, Math.floor(raw)), Math.max(0, Math.floor(evoOwned)))
}

/** Map of evolved-in-deck counts for duel setup (capped by owned evo). */
export function deckEvolvedForDuel(
  deck: Pick<DeckList, 'cards' | 'evolved'>,
  ownedEvolved: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of Object.keys(deck.cards)) {
    const evoOwned = ownedEvolved[id] ?? 0
    const n = evolvedInDeck(deck, id, evoOwned)
    if (n > 0) out[id] = n
  }
  return out
}
