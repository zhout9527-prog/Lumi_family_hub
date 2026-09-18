import { useCallback, useEffect, useRef } from 'react'
import { Gamepad2, X } from 'lucide-react'
import { DEVICE_PROFILE } from './device'

interface SnakeGameBridge {
  getState: () => { state: string }
  start: () => void
  pause: () => void
}

type SnakeFrameWindow = Window & { __snakeGame?: SnakeGameBridge }

const EMBEDDED_STYLE = `
  html, body { min-height: 100%; background: #e8eee9; }
  body { padding: 10px; }
  body.lumi-snake-embedded .game { box-shadow: none; }
  body.lumi-snake-tv { overflow: hidden; padding: 4px; }
  body.lumi-snake-tv .game { zoom: .72; width: min(760px, 100%); }
  body.lumi-snake-tv .touch-controls { display: none !important; }
  body.lumi-snake-tv .guide-overlay { zoom: .8; }
`

export function SnakeGame({ onClose }: { onClose: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const frameCleanupRef = useRef<(() => void) | null>(null)

  const configureFrame = useCallback(() => {
    frameCleanupRef.current?.()
    const frameWindow = frameRef.current?.contentWindow as SnakeFrameWindow | null
    const frameDocument = frameRef.current?.contentDocument
    if (!frameWindow || !frameDocument) return

    frameDocument.body.classList.add('lumi-snake-embedded', `lumi-snake-${DEVICE_PROFILE}`)
    const style = frameDocument.createElement('style')
    style.dataset.lumiSnake = 'embedded'
    style.textContent = EMBEDDED_STYLE
    frameDocument.head.append(style)

    if (DEVICE_PROFILE === 'tv') {
      const guide = frameDocument.getElementById('guideOverlay')
      const guideVisible = Boolean(guide && !guide.hasAttribute('hidden'))
      ;(guideVisible ? frameDocument.getElementById('guideDoneButton') : frameDocument.getElementById('overlayButton'))?.focus({ preventScroll: true })
    }

    const handleFrameKey = (event: globalThis.KeyboardEvent) => {
      if (['Escape', 'BrowserBack', 'GoBack'].includes(event.key)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
        return
      }
      if (DEVICE_PROFILE !== 'tv' || !['Enter', 'NumpadEnter', 'MediaPlayPause'].includes(event.key) || event.repeat) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const guide = frameDocument.getElementById('guideOverlay')
      if (guide && !guide.hasAttribute('hidden')) {
        frameDocument.getElementById('guideDoneButton')?.click()
        return
      }
      const game = frameWindow.__snakeGame
      if (!game) return
      const state = game.getState().state
      if (state === 'running' || state === 'paused') game.pause()
      else game.start()
    }
    frameWindow.addEventListener('keydown', handleFrameKey, true)
    frameCleanupRef.current = () => {
      frameWindow.removeEventListener('keydown', handleFrameKey, true)
      style.remove()
    }
  }, [onClose])

  useEffect(() => {
    const previousRootOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (!['Escape', 'BrowserBack', 'GoBack'].includes(event.key)) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => {
      frameCleanupRef.current?.()
      window.removeEventListener('keydown', handleKey, true)
      document.documentElement.style.overflow = previousRootOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [onClose])

  return (
    <div className="snake-game-backdrop" role="dialog" aria-modal="true" aria-label="贪吃蛇">
      <header className="snake-game-toolbar">
        <div><Gamepad2 size={19} /><strong>贪吃蛇</strong><span>{DEVICE_PROFILE === 'tv' ? '方向键转向 · 确认键暂停或继续 · 返回键退出' : '完整街机模式'}</span></div>
        <button type="button" aria-label="退出贪吃蛇" data-tv-close onClick={onClose}><X size={21} /></button>
      </header>
      <iframe
        ref={frameRef}
        className="snake-game-frame"
        title="贪吃蛇游戏"
        src="/games/snake/index.html"
        allow="autoplay"
        onLoad={configureFrame}
      />
    </div>
  )
}
