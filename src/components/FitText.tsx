import { useLayoutEffect, useRef } from 'react'

interface Props {
  text: string
  className?: string
  /** Max font size in px (base card face coords) */
  maxPx?: number
  /** Min font size in px — stop shrinking below this */
  minPx?: number
}

/** Shrinks font-size until the full text fits in one line (no ellipsis). */
export function FitText({ text, className, maxPx = 14, minPx = 7 }: Props) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      let size = maxPx
      el.style.fontSize = `${size}px`
      // Binary-ish shrink
      while (size > minPx && el.scrollWidth > el.clientWidth + 0.5) {
        size -= 0.5
        el.style.fontSize = `${size}px`
      }
    }

    fit()

    const ro = new ResizeObserver(fit)
    ro.observe(el)
    if (el.parentElement) ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [text, maxPx, minPx])

  return (
    <span ref={ref} className={className} title={text}>
      {text}
    </span>
  )
}
