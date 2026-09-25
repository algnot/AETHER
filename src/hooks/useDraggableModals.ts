import { useEffect } from 'react'

/**
 * Make `.gy-panel` / `.trap-card` floating pickers draggable by their header,
 * so they can be moved off the field while choosing.
 */
export function useDraggableModals(root: HTMLElement | null) {
  useEffect(() => {
    if (!root) return

    let active: {
      panel: HTMLElement
      pointerId: number
      startX: number
      startY: number
      origX: number
      origY: number
    } | null = null

    const isDragHandle = (t: HTMLElement) => {
      if (t.closest('button, a, input, select, textarea')) return null
      const head = t.closest('.gy-head')
      if (head) return head.closest('.gy-panel') as HTMLElement | null
      const h3 = t.closest('h3')
      if (h3?.parentElement?.classList.contains('trap-card')) {
        return h3.parentElement
      }
      return null
    }

    const onMove = (e: PointerEvent) => {
      if (!active || e.pointerId !== active.pointerId) return
      e.preventDefault()
      const nx = active.origX + (e.clientX - active.startX)
      const ny = active.origY + (e.clientY - active.startY)
      active.panel.dataset.dragX = String(nx)
      active.panel.dataset.dragY = String(ny)
      active.panel.style.transform = `translate(${nx}px, ${ny}px)`
    }

    const onUp = (e: PointerEvent) => {
      if (!active || e.pointerId !== active.pointerId) return
      active.panel.classList.remove('is-dragging')
      try {
        if (active.panel.hasPointerCapture(e.pointerId)) {
          active.panel.releasePointerCapture(e.pointerId)
        }
      } catch {
        /* already released */
      }
      active = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const panel = isDragHandle(e.target as HTMLElement)
      if (!panel || !root.contains(panel)) return
      e.preventDefault()
      const origX = Number(panel.dataset.dragX ?? 0)
      const origY = Number(panel.dataset.dragY ?? 0)
      active = {
        panel,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX,
        origY,
      }
      panel.classList.add('is-dragging')
      try {
        panel.setPointerCapture(e.pointerId)
      } catch {
        /* capture optional — window listeners handle move/up */
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }

    root.addEventListener('pointerdown', onDown)
    return () => {
      root.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [root])
}
