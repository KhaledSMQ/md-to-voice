import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import type { EmblaCarouselType, EmblaEventType } from 'embla-carousel'
import type { VoiceInfo } from '../lib/tts/types'
import { getVoiceAvatarMeta, voiceDisplayName } from '../lib/voiceAvatars'
import { VoiceAvatar } from './VoiceAvatar'

type Props = {
  voices: VoiceInfo[]
  voice: string
  onVoice: (voice: string) => void
}

const TWEEN_FACTOR_BASE = 0.58

function numberWithinRange(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

export const VoiceCarousel = memo(function VoiceCarousel({ voices, voice, onVoice }: Props) {
  const slides = useMemo(() => {
    if (voices.length > 0) return voices
    return [
      {
        id: voice,
        name: voiceDisplayName(voice),
        language: '',
        gender: '',
      } satisfies VoiceInfo,
    ]
  }, [voices, voice])

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: slides.length > 2,
    align: 'center',
    skipSnaps: false,
    dragFree: false,
    containScroll: false,
  })

  const tweenFactor = useRef(0)
  const tweenNodes = useRef<HTMLElement[]>([])
  const onVoiceRef = useRef(onVoice)
  onVoiceRef.current = onVoice
  const syncingRef = useRef(false)

  const setTweenNodes = useCallback((api: EmblaCarouselType) => {
    tweenNodes.current = api.slideNodes().map((slideNode) => {
      return slideNode.querySelector('.voice-carousel-scale') as HTMLElement
    })
  }, [])

  const setTweenFactor = useCallback((api: EmblaCarouselType) => {
    tweenFactor.current = TWEEN_FACTOR_BASE * api.scrollSnapList().length
  }, [])

  const tweenScale = useCallback((api: EmblaCarouselType, eventName?: EmblaEventType) => {
    const engine = api.internalEngine()
    const scrollProgress = api.scrollProgress()
    const slidesInView = api.slidesInView()
    const isScrollEvent = eventName === 'scroll'

    api.scrollSnapList().forEach((scrollSnap, snapIndex) => {
      let diffToTarget = scrollSnap - scrollProgress
      const slidesInSnap = engine.slideRegistry[snapIndex]

      slidesInSnap.forEach((slideIndex) => {
        if (isScrollEvent && !slidesInView.includes(slideIndex)) return

        if (engine.options.loop) {
          for (const loopItem of engine.slideLooper.loopPoints) {
            const target = loopItem.target()
            if (slideIndex === loopItem.index && target !== 0) {
              const sign = Math.sign(target)
              if (sign === -1) diffToTarget = scrollSnap - (1 + scrollProgress)
              if (sign === 1) diffToTarget = scrollSnap + (1 - scrollProgress)
            }
          }
        }

        const tweenValue = 1 - Math.abs(diffToTarget * tweenFactor.current)
        const scale = numberWithinRange(tweenValue, 0.72, 1)
        const opacity = numberWithinRange(0.45 + tweenValue * 0.55, 0.45, 1)
        const node = tweenNodes.current[slideIndex]
        if (!node) return
        node.style.transform = `scale(${scale})`
        node.style.opacity = String(opacity)
      })
    })
  }, [])

  const onSelect = useCallback((api: EmblaCarouselType) => {
    if (syncingRef.current) return
    const idx = api.selectedScrollSnap()
    const next = slides[idx]
    if (next && next.id !== voice) onVoiceRef.current(next.id)
  }, [slides, voice])

  useEffect(() => {
    if (!emblaApi) return
    setTweenNodes(emblaApi)
    setTweenFactor(emblaApi)
    tweenScale(emblaApi)

    emblaApi
      .on('reInit', setTweenNodes)
      .on('reInit', setTweenFactor)
      .on('reInit', tweenScale)
      .on('scroll', tweenScale)
      .on('slideFocus', tweenScale)
      .on('select', onSelect)

    return () => {
      emblaApi
        .off('reInit', setTweenNodes)
        .off('reInit', setTweenFactor)
        .off('reInit', tweenScale)
        .off('scroll', tweenScale)
        .off('slideFocus', tweenScale)
        .off('select', onSelect)
    }
  }, [emblaApi, onSelect, setTweenFactor, setTweenNodes, tweenScale])

  // Keep carousel in sync when voice changes from outside (settings restore, etc.).
  useEffect(() => {
    if (!emblaApi) return
    const idx = slides.findIndex((v) => v.id === voice)
    if (idx < 0) return
    if (emblaApi.selectedScrollSnap() === idx) return
    syncingRef.current = true
    emblaApi.scrollTo(idx)
    const raf = requestAnimationFrame(() => {
      syncingRef.current = false
    })
    return () => cancelAnimationFrame(raf)
  }, [emblaApi, voice, slides])

  useEffect(() => {
    emblaApi?.reInit()
  }, [emblaApi, slides.length])

  const selected = slides.find((v) => v.id === voice) ?? slides[0] ?? null
  const selectedMeta = selected ? getVoiceAvatarMeta(selected.id, selected.name) : null

  const scrollPrev = () => emblaApi?.scrollPrev()
  const scrollNext = () => emblaApi?.scrollNext()

  return (
    <div className="voice-carousel" role="group" aria-label="Voice">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-500">Voice</span>
        {selected && (
          <span className="truncate text-[10px] text-ink-500">
            {selectedMeta?.label}
            {selected.gender ? ` · ${selected.gender === 'Female' ? 'F' : 'M'}` : ''}
            {selected.traits ? ` · ${selected.traits}` : ''}
          </span>
        )}
      </div>

      <div className="voice-carousel-shell">
        <button
          type="button"
          className="voice-carousel-nav"
          onClick={scrollPrev}
          aria-label="Previous voice"
          disabled={slides.length < 2}
        >
          <ChevronLeft />
        </button>

        <div className="voice-carousel-viewport" ref={emblaRef}>
          <div className="voice-carousel-container">
            {slides.map((v) => {
              const meta = getVoiceAvatarMeta(v.id, v.name)
              const isSelected = v.id === voice
              return (
                <div className="voice-carousel-slide" key={v.id}>
                  <button
                    type="button"
                    className="voice-carousel-scale"
                    onClick={() => {
                      const idx = slides.findIndex((s) => s.id === v.id)
                      if (idx >= 0) emblaApi?.scrollTo(idx)
                      onVoice(v.id)
                    }}
                    aria-pressed={isSelected}
                    aria-label={`${meta.label}${v.gender ? `, ${v.gender}` : ''}`}
                  >
                    <VoiceAvatar
                      icon={meta.icon}
                      from={meta.from}
                      to={meta.to}
                      accent={meta.accent}
                      label={meta.label}
                      selected={isSelected}
                      language={v.language}
                    />
                    <span className="voice-carousel-name">{meta.label}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          className="voice-carousel-nav"
          onClick={scrollNext}
          aria-label="Next voice"
          disabled={slides.length < 2}
        >
          <ChevronRight />
        </button>
      </div>

      {selected?.traits ? (
        <p className="mt-1.5 truncate px-0.5 text-center text-[10px] text-ink-500">{selected.traits}</p>
      ) : null}
    </div>
  )
})

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
