import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Check, ChevronDown } from 'lucide-react'
import './CustomDropdown.css'

export type DropdownOption = {
  value: string
  label: string
  hint?: string
  disabled?: boolean
}

type Props = {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  ariaLabel: string
  trigger?: ReactNode
  className?: string
  align?: 'start' | 'end'
  placeholder?: string
}

type Placement = 'down' | 'up'

export function CustomDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  trigger,
  className = '',
  align = 'end',
  placeholder = 'เลือก',
}: Props) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement>('up')
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const selected = options.find((o) => o.value === value)
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  const close = useCallback(() => setOpen(false), [])

  const updatePlacement = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    const gap = 8
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const estimatedMenu = Math.min(280, Math.max(80, options.length * 44 + 16))
    // Near bottom of screen → open upward
    if (spaceBelow < estimatedMenu && spaceAbove > spaceBelow) {
      setPlacement('up')
    } else if (spaceBelow < 120 && spaceAbove > spaceBelow) {
      setPlacement('up')
    } else {
      setPlacement('down')
    }
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return
    updatePlacement()
    const id = requestAnimationFrame(() => {
      const root = rootRef.current
      const menu = listRef.current
      if (!root || !menu) return
      const rect = root.getBoundingClientRect()
      const menuH = menu.getBoundingClientRect().height
      const gap = 8
      const spaceBelow = window.innerHeight - rect.bottom - gap
      const spaceAbove = rect.top - gap
      if (spaceBelow < menuH + 4 && spaceAbove > spaceBelow) {
        setPlacement('up')
      } else if (spaceBelow >= menuH + 4) {
        setPlacement('down')
      }
    })
    return () => cancelAnimationFrame(id)
  }, [open, updatePlacement, options.length])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onResize = () => updatePlacement()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, close, updatePlacement])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`,
    )
    el?.focus()
  }, [open, selectedIndex])

  const pick = (opt: DropdownOption) => {
    if (opt.disabled) return
    onChange(opt.value)
    close()
  }

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      updatePlacement()
      setOpen(true)
    }
  }

  const onListKey = (e: KeyboardEvent) => {
    const enabled = options
      .map((o, i) => ({ o, i }))
      .filter((x) => !x.o.disabled)
    if (enabled.length === 0) return
    const cur = enabled.findIndex((x) => x.i === selectedIndex)
    const focusAt = (i: number) => {
      const item = enabled[i]
      if (!item) return
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${item.i}"]`)
        ?.focus()
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusAt((cur + 1) % enabled.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusAt((cur - 1 + enabled.length) % enabled.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusAt(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusAt(enabled.length - 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  return (
    <div
      className={`custom-dropdown ${open ? 'open' : ''} drop-${placement} ${className}`.trim()}
      ref={rootRef}
    >
      <button
        type="button"
        className={`cd-trigger ${trigger ? 'cd-trigger-slot' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (!open) updatePlacement()
          setOpen((v) => !v)
        }}
        onKeyDown={onTriggerKey}
      >
        {trigger ?? (
          <>
            <span className="cd-trigger-label">
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown
              className="cd-chevron"
              size={16}
              strokeWidth={2}
              aria-hidden
            />
          </>
        )}
      </button>

      {open && (
        <ul
          id={listId}
          ref={listRef}
          className={`cd-menu align-${align} drop-${placement}`}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onListKey}
        >
          {options.map((opt, i) => {
            const isOn = opt.value === value
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  data-index={i}
                  aria-selected={isOn}
                  disabled={opt.disabled}
                  className={`cd-option ${isOn ? 'on' : ''} ${opt.disabled ? 'disabled' : ''}`}
                  onClick={() => pick(opt)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      pick(opt)
                    }
                  }}
                >
                  <span className="cd-check" aria-hidden>
                    {isOn ? <Check size={14} strokeWidth={2.5} /> : null}
                  </span>
                  <span className="cd-option-text">
                    <span className="cd-option-label">{opt.label}</span>
                    {opt.hint ? (
                      <span className="cd-option-hint">{opt.hint}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
