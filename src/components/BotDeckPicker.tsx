import { useDeckStore } from '../store/deckStore'
import { CustomDropdown } from './CustomDropdown'
import './BotDeckPicker.css'

type Props = {
  className?: string
}

/** Choose which saved deck the CPU uses in duels */
export function BotDeckPicker({ className }: Props) {
  const decks = useDeckStore((s) => s.decks)
  const botDeckId = useDeckStore((s) => s.botDeckId)
  const setBotDeck = useDeckStore((s) => s.setBotDeck)
  const isDeckValid = useDeckStore((s) => s.isDeckValid)

  const botValid = isDeckValid(botDeckId)
  const botDeck = decks.find((d) => d.id === botDeckId)

  const options = decks.map((d) => {
    const ok = isDeckValid(d.id)
    return {
      value: d.id,
      label: d.name,
      hint: ok.valid ? undefined : ok.message,
    }
  })

  return (
    <div className={`bot-deck-picker ${className ?? ''}`.trim()}>
      <span className="bot-deck-label" id="bot-deck-label">
        เด็คบอท
      </span>
      <div className="bot-deck-row">
        <CustomDropdown
          className="bot-deck-dropdown"
          value={botDeckId}
          options={options}
          onChange={setBotDeck}
          ariaLabel="เลือกเด็คที่ CPU จะใช้ตอนดูเอล"
          align="start"
        />
        <span
          className={`bot-deck-status ${botValid.valid ? 'ok' : 'bad'}`}
          title={botValid.message}
        >
          {botValid.valid ? 'พร้อม' : 'ไม่พร้อม'}
        </span>
      </div>
      {botDeck && (
        <p className="bot-deck-hint">
          CPU ใช้ «{botDeck.name}»{botValid.valid ? '' : ` — ${botValid.message}`}
        </p>
      )}
    </div>
  )
}
