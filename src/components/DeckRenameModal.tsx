import { useEffect, useId, useRef, useState } from 'react'
import './DeckRenameModal.css'

type Mode = 'rename' | 'create'

type Props = {
  open: boolean
  mode: Mode
  initialName: string
  title?: string
  confirmLabel?: string
  onClose: () => void
  onConfirm: (name: string) => void
}

export function DeckRenameModal({
  open,
  mode,
  initialName,
  title,
  confirmLabel,
  onClose,
  onConfirm,
}: Props) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    setName(initialName)
    const t = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, initialName])

  if (!open) return null

  const heading =
    title ?? (mode === 'create' ? 'สร้างเด็คใหม่' : 'เปลี่ยนชื่อเด็ค')
  const action = confirmLabel ?? (mode === 'create' ? 'สร้าง' : 'บันทึก')
  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0

  const submit = () => {
    if (!canSubmit) return
    onConfirm(trimmed)
    onClose()
  }

  return (
    <div
      className="deck-rename-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="deck-rename-panel">
        <header className="deck-rename-head">
          <h3 id={titleId}>{heading}</h3>
          <button type="button" className="deck-rename-x" onClick={onClose}>
            ×
          </button>
        </header>
        <label className="deck-rename-label" htmlFor="deck-rename-input">
          ชื่อเด็ค
        </label>
        <input
          id="deck-rename-input"
          ref={inputRef}
          className="deck-rename-input"
          value={name}
          maxLength={40}
          placeholder="เช่น หุ่นยนต์แห่งการทำลาย"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="deck-rename-actions">
          <button type="button" className="deck-rename-cancel" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="deck-rename-ok"
            disabled={!canSubmit}
            onClick={submit}
          >
            {action}
          </button>
        </div>
      </div>
    </div>
  )
}
