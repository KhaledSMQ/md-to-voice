import { useCallback, useEffect, useRef } from 'react'

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
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    valueRef.current = value
  }, [value])
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

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
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [clamp, panelSide],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 24 : 8
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const next = panelSide === 'start' ? value + step : value - step
        onChange(clamp(next))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const next = panelSide === 'start' ? value - step : value + step
        onChange(clamp(next))
      } else if (e.key === 'Home') {
        e.preventDefault()
        onChange(min)
      } else if (e.key === 'End') {
        e.preventDefault()
        onChange(max)
      } else if ((e.key === 'Enter' || e.key === ' ') && onReset) {
        e.preventDefault()
        onReset()
      }
    },
    [clamp, max, min, onChange, onReset, panelSide, value],
  )

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      className={
        'group relative z-10 hidden w-3 shrink-0 cursor-col-resize touch-none select-none items-stretch justify-center outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 lg:flex ' +
        className
      }
      title={onReset ? 'Drag to resize · double-click to reset' : 'Drag to resize'}
    >
      <span
        className="my-auto h-10 w-1 rounded-full bg-white/10 transition-colors group-hover:bg-amber-300/50 group-active:bg-amber-300/70"
        aria-hidden
      />
    </div>
  )
}
