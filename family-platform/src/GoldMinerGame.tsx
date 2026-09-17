import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Bomb, Clock3, Gamepad2, Pause, Pickaxe, Play, RefreshCw, Trophy, X, Zap } from 'lucide-react'
import { DEVICE_PROFILE } from './device'

type TreasureKind = 'gold-large' | 'gold-medium' | 'gold-small' | 'diamond' | 'rock' | 'mystery'
type HookPhase = 'swinging' | 'extending' | 'retracting'

interface Treasure {
  id: string
  kind: TreasureKind
  x: number
  y: number
  radius: number
  value: number
  weight: number
  rotation: number
}

interface HookState {
  angle: number
  direction: 1 | -1
  length: number
  phase: HookPhase
  caughtId: string | null
}

const BOARD_WIDTH = 1000
const BOARD_HEIGHT = 650
const PIVOT_X = 500
const PIVOT_Y = 104
const MIN_LENGTH = 66
const MAX_LENGTH = 610
const ROUND_SECONDS = 60
const BEST_SCORE_KEY = 'lumi:deep-mine-best'
const TREASURE_META: Record<TreasureKind, { label: string; value: number; weight: number; radius: number }> = {
  'gold-large': { label: '大金块', value: 500, weight: 3.4, radius: 42 },
  'gold-medium': { label: '金块', value: 250, weight: 2.1, radius: 31 },
  'gold-small': { label: '小金块', value: 100, weight: 1.15, radius: 22 },
  diamond: { label: '钻石', value: 600, weight: 0.72, radius: 19 },
  rock: { label: '石块', value: 25, weight: 4.6, radius: 35 },
  mystery: { label: '神秘袋', value: 180, weight: 1.45, radius: 27 },
}

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function createTreasures(seed: number): Treasure[] {
  const random = seeded(seed * 747796405 + 2891336453)
  const kinds: TreasureKind[] = [
    'gold-large', 'gold-medium', 'gold-medium', 'gold-small', 'gold-small', 'gold-small',
    'diamond', 'diamond', 'rock', 'rock', 'rock', 'rock', 'mystery', 'mystery',
  ]
  const items: Treasure[] = []
  for (const [index, kind] of kinds.entries()) {
    const meta = TREASURE_META[kind]
    let candidate: Treasure | null = null
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const depth = random()
      const x = 65 + random() * 870
      const y = 230 + depth * 345
      const next: Treasure = {
        id: `treasure-${seed}-${index}`,
        kind,
        x,
        y,
        radius: meta.radius,
        value: kind === 'mystery' ? 100 + Math.round(random() * 240) : meta.value,
        weight: meta.weight,
        rotation: Math.round(random() * 34 - 17),
      }
      const clear = items.every((item) => Math.hypot(item.x - x, item.y - y) > item.radius + next.radius + 22)
      if (clear) { candidate = next; break }
    }
    items.push(candidate ?? {
      id: `treasure-${seed}-${index}`,
      kind,
      x: 70 + (index % 7) * 135,
      y: 255 + Math.floor(index / 7) * 210,
      radius: meta.radius,
      value: meta.value,
      weight: meta.weight,
      rotation: index % 2 ? 10 : -8,
    })
  }
  return items
}

function readBestScore(): number {
  try {
    const value = Number(window.localStorage.getItem(BEST_SCORE_KEY) ?? 0)
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch { return 0 }
}

function hookPoint(hook: HookState): { x: number; y: number } {
  const radians = hook.angle * Math.PI / 180
  return { x: PIVOT_X + Math.sin(radians) * hook.length, y: PIVOT_Y + Math.cos(radians) * hook.length }
}

export function GoldMinerGame({ onClose }: { onClose: () => void }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLButtonElement>(null)
  const hookRef = useRef<HookState>({ angle: -48, direction: 1, length: MIN_LENGTH, phase: 'swinging', caughtId: null })
  const treasuresRef = useRef<Treasure[]>([])
  const lastFrameRef = useRef(0)
  const [roundSeed, setRoundSeed] = useState(1)
  const [treasures, setTreasures] = useState(() => createTreasures(1))
  const [hook, setHook] = useState<HookState>(hookRef.current)
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState(readBestScore)
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS)
  const [paused, setPaused] = useState(false)
  const [finished, setFinished] = useState(false)
  const [message, setMessage] = useState('看准方向，放下钩子！')
  const [flash, setFlash] = useState<{ id: number; value: number } | null>(null)

  treasuresRef.current = treasures
  hookRef.current = hook
  const goal = 1500
  const caught = useMemo(() => treasures.find((item) => item.id === hook.caughtId) ?? null, [hook.caughtId, treasures])
  const tip = hookPoint(hook)

  const restart = useCallback(() => {
    const nextSeed = roundSeed + 1
    const nextTreasures = createTreasures(nextSeed)
    const nextHook: HookState = { angle: -48, direction: 1, length: MIN_LENGTH, phase: 'swinging', caughtId: null }
    setRoundSeed(nextSeed)
    setTreasures(nextTreasures)
    setHook(nextHook)
    setScore(0)
    setSecondsLeft(ROUND_SECONDS)
    setPaused(false)
    setFinished(false)
    setFlash(null)
    setMessage('新矿洞准备好了，看准方向放下钩子！')
  }, [roundSeed])

  const dropHook = useCallback(() => {
    setHook((current) => current.phase === 'swinging' && !paused && !finished ? { ...current, phase: 'extending' } : current)
  }, [finished, paused])

  useEffect(() => {
    if (DEVICE_PROFILE === 'tv') stageRef.current?.focus({ preventScroll: true })
    else shellRef.current?.focus({ preventScroll: true })
    const previousRootOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = previousRootOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [])

  useEffect(() => {
    if (paused || finished) return
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          setFinished(true)
          setPaused(false)
          setMessage('时间到！看看这次装满了多少宝藏。')
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [finished, paused])

  useEffect(() => {
    if (score <= bestScore) return
    setBestScore(score)
    try { window.localStorage.setItem(BEST_SCORE_KEY, String(score)) } catch { /* 本地存储不可用时只保留当前成绩。 */ }
  }, [bestScore, score])

  useEffect(() => {
    let animationFrame = 0
    const animate = (now: number) => {
      const delta = Math.min(0.034, Math.max(0, (now - (lastFrameRef.current || now)) / 1000))
      lastFrameRef.current = now
      if (!paused && !finished) {
        const current = hookRef.current
        let next = current
        if (current.phase === 'swinging') {
          let angle = current.angle + current.direction * 58 * delta
          let direction = current.direction
          if (angle >= 68) { angle = 68; direction = -1 }
          if (angle <= -68) { angle = -68; direction = 1 }
          next = { ...current, angle, direction }
        } else if (current.phase === 'extending') {
          const length = Math.min(MAX_LENGTH, current.length + 460 * delta)
          const point = hookPoint({ ...current, length })
          const hit = treasuresRef.current
            .filter((item) => item.id !== current.caughtId)
            .map((item) => ({ item, distance: Math.hypot(item.x - point.x, item.y - point.y) }))
            .filter(({ item, distance }) => distance <= item.radius + 11)
            .sort((left, right) => left.distance - right.distance)[0]?.item
          const outside = point.x < 18 || point.x > BOARD_WIDTH - 18 || point.y > BOARD_HEIGHT - 12 || length >= MAX_LENGTH
          next = hit
            ? { ...current, length, phase: 'retracting', caughtId: hit.id }
            : outside ? { ...current, length, phase: 'retracting' } : { ...current, length }
          if (hit) setMessage(`抓住${TREASURE_META[hit.kind].label}了，正在往回拉！`)
        } else {
          const caughtItem = treasuresRef.current.find((item) => item.id === current.caughtId)
          const retractSpeed = 430 / (caughtItem?.weight ?? 1)
          const length = Math.max(MIN_LENGTH, current.length - retractSpeed * delta)
          if (length <= MIN_LENGTH + 0.5) {
            if (caughtItem) {
              setTreasures((items) => items.filter((item) => item.id !== caughtItem.id))
              setScore((value) => value + caughtItem.value)
              setFlash({ id: Date.now(), value: caughtItem.value })
              setMessage(`${TREASURE_META[caughtItem.kind].label}入袋，+${caughtItem.value} 分！`)
            } else setMessage('这次没抓到，再看准一点！')
            next = { ...current, length: MIN_LENGTH, phase: 'swinging', caughtId: null }
          } else next = { ...current, length }
        }
        if (next.angle !== current.angle || next.length !== current.length || next.phase !== current.phase || next.caughtId !== current.caughtId) {
          hookRef.current = next
          setHook(next)
        }
      }
      animationFrame = window.requestAnimationFrame(animate)
    }
    animationFrame = window.requestAnimationFrame(animate)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      lastFrameRef.current = 0
    }
  }, [finished, paused])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (['Escape', 'BrowserBack', 'GoBack', 'Backspace'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation(); onClose(); return
      }
      if ((event.key === 'r' || event.key === 'R') && !event.repeat) {
        event.preventDefault(); restart(); return
      }
      if ((event.key === 'p' || event.key === 'P') && !event.repeat) {
        event.preventDefault(); setPaused((value) => !value); return
      }
      const isAction = event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowDown'
      const targetButton = event.target instanceof Element ? event.target.closest('button') : null
      const actionTarget = !targetButton || targetButton === stageRef.current
      if (isAction && actionTarget && !event.repeat) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (finished) restart()
        else if (paused) setPaused(false)
        else dropHook()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [dropHook, finished, onClose, paused, restart])

  return (
    <div className="gold-miner-backdrop" role="dialog" aria-modal="true" aria-label="深岩淘金">
      <div className="gold-miner-shell" ref={shellRef} tabIndex={-1}>
        <header className="gold-miner-header">
          <div className="gold-miner-brand"><Pickaxe size={20} /><div><strong>深岩淘金</strong><span>DEEP MINE · 第 {roundSeed} 号矿洞</span></div></div>
          <div className="gold-miner-stats">
            <span><Zap size={14} />目标<strong>{goal.toLocaleString('zh-CN')}</strong></span>
            <span><Trophy size={14} />得分<strong data-testid="gold-score">{score.toLocaleString('zh-CN')}</strong></span>
            <span className={secondsLeft <= 10 ? 'is-urgent' : ''}><Clock3 size={14} />时间<strong>{secondsLeft}</strong></span>
            <span>最高<strong>{bestScore.toLocaleString('zh-CN')}</strong></span>
          </div>
          <div className="gold-miner-header-actions">
            <button type="button" className="gold-miner-icon" aria-label={paused ? '继续淘金' : '暂停淘金'} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}</button>
            <button type="button" className="gold-miner-icon" aria-label="重新开始深岩淘金" onClick={restart}><RefreshCw size={18} /></button>
            <button type="button" className="gold-miner-icon" aria-label="退出深岩淘金" data-tv-close onClick={onClose}><X size={20} /></button>
          </div>
        </header>

        <main className="gold-miner-main">
          <button type="button" ref={stageRef} className="gold-miner-stage" aria-label="放下吊钩" data-tv-initial data-phase={hook.phase} data-angle={hook.angle.toFixed(2)} onClick={finished ? restart : paused ? () => setPaused(false) : dropHook}>
            <span className="gold-miner-surface" aria-hidden="true"><span className="miner-cart" /><span className="miner-character"><i className="miner-hat" /><i className="miner-head" /><i className="miner-beard" /><i className="miner-body" /><i className="miner-arm" /></span><span className="miner-winch" /></span>
            <svg className="gold-miner-hook-layer" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
              <line className="gold-miner-rope" x1={PIVOT_X} y1={PIVOT_Y} x2={tip.x} y2={tip.y} />
              <g className="gold-miner-claw" transform={`translate(${tip.x} ${tip.y}) rotate(${-hook.angle})`}><path d="M -13 -3 L -5 11 L 0 4 L 5 11 L 13 -3" /><circle cx="0" cy="-7" r="6" /></g>
            </svg>
            <span className="gold-miner-cave-texture" aria-hidden="true" />
            <span className="gold-miner-depth depth-one" aria-hidden="true" /><span className="gold-miner-depth depth-two" aria-hidden="true" />
            {treasures.map((item) => (
              <span key={item.id} className={`gold-treasure treasure-${item.kind} ${item.id === hook.caughtId ? 'is-caught' : ''}`} data-kind={item.kind} style={{ left: `${item.x / BOARD_WIDTH * 100}%`, top: `${item.y / BOARD_HEIGHT * 100}%`, width: `${item.radius * 2 / BOARD_WIDTH * 100}%`, '--treasure-rotate': `${item.rotation}deg` } as CSSProperties}>
                {item.kind === 'mystery' && <span>?</span>}
              </span>
            ))}
            {caught && <span className={`gold-treasure caught-overlay treasure-${caught.kind}`} style={{ left: `${tip.x / BOARD_WIDTH * 100}%`, top: `${tip.y / BOARD_HEIGHT * 100}%`, width: `${caught.radius * 2 / BOARD_WIDTH * 100}%` } as CSSProperties}>{caught.kind === 'mystery' ? '?' : ''}</span>}
            {flash && <span key={flash.id} className="gold-miner-score-flash">+{flash.value}</span>}
            <span className="gold-miner-message" role="status">{message}</span>
            {(paused || finished) && <span className="gold-miner-overlay"><strong>{finished ? (score >= goal ? '目标完成！' : '本轮结束') : '已暂停'}</strong><small>{finished ? `收获 ${score.toLocaleString('zh-CN')} 分` : '确认键或点击屏幕继续'}</small><span>{finished ? '再挖一轮' : '继续淘金'}</span></span>}
          </button>

          <aside className="gold-miner-guide">
            <div><span className="eyebrow">TREASURE MAP</span><h2>宝藏价值</h2></div>
            <ul><li><i className="legend-gold" />金块 <strong>100-500</strong></li><li><i className="legend-diamond" />钻石 <strong>600</strong></li><li><i className="legend-bag">?</i>神秘袋 <strong>惊喜</strong></li><li><i className="legend-rock" />石块 <strong>25</strong></li></ul>
            <div className="gold-miner-control-note"><Gamepad2 size={17} /><span>{DEVICE_PROFILE === 'tv' ? '遥控器确认键或向下键放钩，返回键退出。' : DEVICE_PROFILE === 'mobile' ? '轻点矿洞放钩；轻点暂停层继续。' : '空格、回车或向下键放钩，P 暂停。'}</span></div>
            <button type="button" className="button button-primary gold-miner-drop" onClick={dropHook} disabled={hook.phase !== 'swinging' || paused || finished}><Bomb size={17} />放下吊钩</button>
          </aside>
        </main>
      </div>
    </div>
  )
}
