import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type PreviewContextMenuItem = {
  id: string
  label: string
  hint?: string
  icon?: ReactNode
  /** When set, renders as a checkable menu item (toggle). */
  checked?: boolean
  separatorBefore?: boolean
  onSelect: () => void
}

export type PreviewContextMenuProps = {
  open: boolean
  x: number
  y: number
  items: PreviewContextMenuItem[]
  onClose: () => void
}

const VIEWPORT_PAD = 8

/**
 * Fixed-position context menu for the markdown preview.
 * Clamps into the viewport after first paint; dismisses on Escape / outside click / scroll / resize.
 */
export function PreviewContextMenu({ open, x, y, items, onClose }: PreviewContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [pos, setPos] = useState({ left: x, top: y })
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useLayoutEffect(() => {
    if (!open) return
    setPos({ left: x, top: y })
  }, [open, x, y])

  useLayoutEffect(() => {
    if (!open) return
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxLeft = window.innerWidth - rect.width - VIEWPORT_PAD
    const maxTop = window.innerHeight - rect.height - VIEWPORT_PAD
    const left = Math.max(VIEWPORT_PAD, Math.min(x, maxLeft))
    const top = Math.max(VIEWPORT_PAD, Math.min(y, maxTop))
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }))
  }, [open, x, y, items])

  useEffect(() => {
    if (!open) return
    const focusRaf = requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLButtonElement>(
        'button[role="menuitem"], button[role="menuitemcheckbox"]',
      )
      first?.focus({ preventScroll: true })
    })

    const close = () => onCloseRef.current()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') {
        return
      }
      const buttons = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          'button[role="menuitem"], button[role="menuitemcheckbox"]',
        ) ?? [],
      )
      if (buttons.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      const active = document.activeElement as HTMLButtonElement | null
      let idx = buttons.indexOf(active as HTMLButtonElement)
      if (e.key === 'Home') idx = 0
      else if (e.key === 'End') idx = buttons.length - 1
      else if (e.key === 'ArrowDown') idx = idx < 0 ? 0 : (idx + 1) % buttons.length
      else idx = idx < 0 ? buttons.length - 1 : (idx - 1 + buttons.length) % buttons.length
      buttons[idx]?.focus({ preventScroll: true })
    }

    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      close()
    }

    // Defer scroll dismiss so initial focus/layout does not immediately close the menu.
    let scrollArmed = false
    const armScroll = window.setTimeout(() => {
      scrollArmed = true
    }, 0)
    const onScroll = () => {
      if (scrollArmed) close()
    }

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      cancelAnimationFrame(focusRaf)
      window.clearTimeout(armScroll)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (!open || items.length === 0) return null

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label="Preview actions"
      className="fixed z-[70] min-w-[13.5rem] overflow-hidden rounded-xl border border-white/10 bg-ink-950/95 p-1.5 shadow-xl shadow-ink-950/50 backdrop-blur"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => {
        const isToggle = typeof item.checked === 'boolean'
        return (
          <div key={item.id}>
            {item.separatorBefore && (
              <div className="my-1 border-t border-white/5" role="separator" />
            )}
            <button
              type="button"
              role={isToggle ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={isToggle ? item.checked : undefined}
              onClick={() => {
                item.onSelect()
                onClose()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-ink-200 transition-colors hover:bg-white/[0.06] hover:text-ink-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40"
            >
              {isToggle ? (
                <span
                  className={`shrink-0 font-mono text-[11px] ${item.checked ? 'text-amber-200' : 'text-transparent'}`}
                  aria-hidden
                >
                  ✓
                </span>
              ) : (
                item.icon && (
                  <span className="shrink-0 text-ink-400" aria-hidden>
                    {item.icon}
                  </span>
                )
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint && (
                <span className="font-mono text-[10px] text-ink-500">{item.hint}</span>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
