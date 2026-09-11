import { useEffect, useRef, useState } from 'react'
import type { ComponentType, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import Tetris from 'react-tetris'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronsDown,
  Gamepad2,
  Hand,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  Trophy,
  X,
} from 'lucide-react'
import { DEVICE_PROFILE } from './device'

type GameState = 'PAUSED' | 'PLAYING' | 'LOST'

interface GameController {
  pause: () => void
  resume: () => void
  hold: () => void
  hardDrop: () => void
  moveDown: () => void
  moveLeft: () => void
  moveRight: () => void
  flipClockwise: () => void
  restart: () => void
}

const NO_LIBRARY_KEYBOARD_CONTROLS = {}
const BEST_SCORE_KEY = 'lumi:tetris-best-score'

function readBestScore(): number {
  try {
    const score = Number(window.localStorage.getItem(BEST_SCORE_KEY) ?? 0)
    return Number.isFinite(score) && score > 0 ? score : 0
  } catch {
    return 0
  }
}

function GameIconButton({
  label,
  children,
  onClick,
  primary = false,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      className={'tetris-control ' + (primary ? 'primary' : '')}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function TetrisScene({
  HeldPiece,
  Gameboard,
  PieceQueue,
  points,
  linesCleared,
  level,
  state,
  controller,
  onClose,
}: {
  HeldPiece: ComponentType
  Gameboard: ComponentType
  PieceQueue: ComponentType
  points: number
  linesCleared: number
  level: number
  state: GameState
  controller: GameController
  onClose: () => void
}) {
  const shellRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const [bestScore, setBestScore] = useState(readBestScore)

  useEffect(() => {
    shellRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (points <= bestScore) return
    setBestScore(points)
    try {
      window.localStorage.setItem(BEST_SCORE_KEY, String(points))
    } catch {
      // 禁用本地存储时只保留本次游戏的最高分。
    }
  }, [bestScore, points])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const buttonActivation = target instanceof HTMLButtonElement && (event.key === 'Enter' || event.key === ' ')
      if (buttonActivation && DEVICE_PROFILE !== 'tv') return

      let handled = true
      if (event.key === 'ArrowLeft') controller.moveLeft()
      else if (event.key === 'ArrowRight') controller.moveRight()
      else if (event.key === 'ArrowDown') controller.moveDown()
      else if (event.key === 'ArrowUp') {
        if (!event.repeat) controller.flipClockwise()
      } else if (event.key === 'Enter' && DEVICE_PROFILE === 'tv') {
        if (!event.repeat) controller.hardDrop()
      } else if (event.key === ' ') {
        if (!event.repeat) controller.hardDrop()
      }
      else if ((event.key === 'p' || event.key === 'P') && !event.repeat) state === 'PAUSED' ? controller.resume() : controller.pause()
      else if ((event.key === 'r' || event.key === 'R') && !event.repeat) controller.restart()
      else if ((event.key === 'c' || event.key === 'C' || event.key === 'Shift') && !event.repeat) controller.hold()
      else if (['Escape', 'BrowserBack', 'GoBack', 'Backspace'].includes(event.key)) onClose()
      else handled = false

      if (!handled) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [controller, onClose, state])

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.visibilityState === 'hidden' && state === 'PLAYING') controller.pause()
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden)
  }, [controller, state])

  const beginGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerRef.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current
    pointerRef.current = null
    if (!start) return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 16 && Math.abs(deltaY) < 16) {
      controller.flipClockwise()
      return
    }
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      const steps = Math.min(4, Math.max(1, Math.round(Math.abs(deltaX) / 46)))
      for (let index = 0; index < steps; index += 1) {
        if (deltaX < 0) controller.moveLeft()
        else controller.moveRight()
      }
      return
    }
    if (deltaY > 30) controller.hardDrop()
  }

  return (
    <div className="tetris-shell" ref={shellRef} tabIndex={-1}>
      <header className="tetris-header">
        <div className="tetris-title"><Gamepad2 size={19} /><strong>俄罗斯方块</strong><span>LEVEL {level}</span></div>
        <div className="tetris-scores">
          <span>得分<strong>{points.toLocaleString('zh-CN')}</strong></span>
          <span>消行<strong>{linesCleared}</strong></span>
          <span><Trophy size={14} />最高<strong>{bestScore.toLocaleString('zh-CN')}</strong></span>
        </div>
        <button type="button" className="tetris-close" aria-label="退出俄罗斯方块" data-tv-close onClick={onClose}><X size={21} /></button>
      </header>

      <main className="tetris-layout">
        <aside className="tetris-side tetris-hold">
          <span>暂存</span>
          <HeldPiece />
        </aside>

        <div
          className="tetris-board-frame"
          aria-label="俄罗斯方块棋盘"
          onPointerDown={beginGesture}
          onPointerUp={finishGesture}
          onPointerCancel={() => { pointerRef.current = null }}
        >
          <Gameboard />
          {state !== 'PLAYING' && (
            <div className="tetris-state" role="status">
              <strong>{state === 'LOST' ? '本局结束' : '已暂停'}</strong>
              <button type="button" className="button button-primary" onClick={state === 'LOST' ? controller.restart : controller.resume}>
                {state === 'LOST' ? <RefreshCw size={16} /> : <Play size={16} fill="currentColor" />}
                {state === 'LOST' ? '再来一局' : '继续'}
              </button>
            </div>
          )}
        </div>

        <aside className="tetris-side tetris-next">
          <span>下一个</span>
          <PieceQueue />
        </aside>
      </main>

      <footer className="tetris-controls" aria-label="游戏控制">
        <GameIconButton label="向左移动" onClick={controller.moveLeft}><ArrowLeft size={22} /></GameIconButton>
        <GameIconButton label="向下移动" onClick={controller.moveDown}><ArrowDown size={22} /></GameIconButton>
        <GameIconButton label="向右移动" onClick={controller.moveRight}><ArrowRight size={22} /></GameIconButton>
        <GameIconButton label="旋转方块" onClick={controller.flipClockwise}><RotateCw size={22} /></GameIconButton>
        <GameIconButton label="暂存方块" onClick={controller.hold}><Hand size={21} /></GameIconButton>
        <GameIconButton label="直接落下" primary onClick={controller.hardDrop}><ChevronsDown size={24} /></GameIconButton>
        <GameIconButton label={state === 'PAUSED' ? '继续游戏' : '暂停游戏'} onClick={state === 'PAUSED' ? controller.resume : controller.pause}>
          {state === 'PAUSED' ? <Play size={21} fill="currentColor" /> : <Pause size={21} fill="currentColor" />}
        </GameIconButton>
        <GameIconButton label="重新开始" onClick={controller.restart}><RefreshCw size={21} /></GameIconButton>
      </footer>
    </div>
  )
}

export function TetrisGame({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const previousRootOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = previousRootOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [])

  return (
    <div className="tetris-backdrop" role="dialog" aria-modal="true" aria-label="俄罗斯方块">
      <Tetris keyboardControls={NO_LIBRARY_KEYBOARD_CONTROLS}>
        {(game) => <TetrisScene {...game} onClose={onClose} />}
      </Tetris>
    </div>
  )
}

export function GamesView({ onPlayTetris }: { onPlayTetris: () => void }) {
  return (
    <div className="dashboard games-dashboard">
      <section className="page-intro games-intro">
        <div><span className="eyebrow">PLAYGROUND</span><h1>小游戏</h1><p>短短一局，动动脑筋。</p></div>
        <span className="soft-badge"><Gamepad2 size={14} /> 1 个游戏</span>
      </section>
      <button type="button" className="game-launch-card" data-tv-initial onClick={onPlayTetris}>
        <span className="game-launch-art" aria-hidden="true">
          <i className="block-i" /><i className="block-t" /><i className="block-o" /><i className="block-s" />
          <span className="game-launch-grid" />
        </span>
        <span className="game-launch-copy">
          <span className="eyebrow">SPATIAL PUZZLE</span>
          <strong>俄罗斯方块</strong>
          <small>逻辑 · 空间 · 反应</small>
          <span className="game-launch-action"><Play size={17} fill="currentColor" />开始游戏</span>
        </span>
      </button>
    </div>
  )
}
