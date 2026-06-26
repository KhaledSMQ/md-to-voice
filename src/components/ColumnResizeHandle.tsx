import { useCallback, useRef } from 'react'

type Props = {
  value: number
  min: number
  max: number
  onChange: (width: number) => void
  onReset?: () => void
  /**
   * Which side of the resizable panel this handle sits on.
   * `start` — handle is before the panel; drag left grows width.
   * `end` — handle is after the panel; drag right grows width.
   */
  panelSide: 'start' | 'end'
  ariaLabel: string
  className?: string
}

export function ColumnResizeHandle({
  value,
  min,
  max,
  onChange,
  onReset,
  panelSide,
  ariaLabel,
  className = '',
}: Props) {
  const valueRef = useRef(value)
  valueRef.current = value

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, Math.round(w))), [max, min])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const startW = valueRef.current

      const onMove = (ev: PointerEvent) => {
        ev.preventDefault()
        const delta = ev.clientX - startX
        const next =
          panelSide === 'start' ? startW - delta : startW + delta
        onChangeRef.current(clamp(next))
      }

      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        document.removeEventListener('pointercancel', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.body.style.touchAction = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.body.style.touchAction = 'none'
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onUp)
    },
    [clamp, panelSide],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let next = valueRef.current
      const step = e.shiftKey ? 32 : 8
      if (panelSide === 'start') {
        if (e.key === 'ArrowLeft') next += step
        else if (e.key === 'ArrowRight') next -= step
        else if (e.key === 'Home') next = min
        else if (e.key === 'End') next = max
        else return
      } else {
        if (e.key === 'ArrowLeft') next -= step
        else if (e.key === 'ArrowRight') next += step
        else if (e.key === 'Home') next = min
        else if (e.key === 'End') next = max
        else return
      }
      e.preventDefault()
      onChangeRef.current(clamp(next))
    },
    [clamp, max, min, panelSide],
  )

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      title={`${ariaLabel} · double-click to reset`}
      className={
        'group relative z-10 w-2 shrink-0 cursor-col-resize touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 rounded-full ' +
        className
      }
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/5 transition-colors group-hover:bg-amber-300/40 group-active:bg-amber-300/60"
      />
    </div>
  )
}
