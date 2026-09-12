import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ArrowLeft, Gamepad2, Lightbulb, RefreshCw, Sparkles, Trophy, X, Zap } from 'lucide-react'

type TileColor = 'coral' | 'mint' | 'sun' | 'sky' | 'plum'

interface Tile {
  id: string
  color: TileColor
  fresh?: boolean
}

interface Tool {
  id: string
  color: TileColor
  label: string
  power: number
}

const ROWS = 10
const COLUMNS = 8
const COLORS: TileColor[] = ['coral', 'mint', 'sun', 'sky', 'plum']
const COLOR_LABELS: Record<TileColor, string> = {
  coral: '珊瑚红',
  mint: '薄荷绿',
  sun: '向日黄',
  sky: '晴空蓝',
  plum: '梅子紫',
}
const COLOR_SYMBOLS: Record<TileColor, string> = {
  coral: '●',
  mint: '◆',
  sun: '★',
  sky: '■',
  plum: '✦',
}

function seededValue(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function createBoard(seed: number): Tile[][] {
  return Array.from({ length: ROWS }, (_, row) => Array.from({ length: COLUMNS }, (_, column) => {
    const color = COLORS[Math.floor(seededValue(seed + row * COLUMNS + column) * COLORS.length)]
    return { id: `tile-${seed}-${row}-${column}`, color }
  }))
}

function createTools(seed: number): Tool[] {
  return [0, 1, 2].map((index) => {
    const color = COLORS[Math.floor(seededValue(seed * 3 + index + 4) * COLORS.length)]
    return {
      id: `tool-${seed}-${index}`,
      color,
      label: COLOR_LABELS[color],
      power: 2 + ((seed + index) % 3),
    }
  })
}

function connectedGroup(board: Tile[][], row: number, column: number, color: TileColor): Array<[number, number]> {
  const result: Array<[number, number]> = []
  const pending: Array<[number, number]> = [[row, column]]
  const visited = new Set<string>()
  while (pending.length) {
    const [currentRow, currentColumn] = pending.pop() as [number, number]
    const key = `${currentRow}:${currentColumn}`
    if (visited.has(key) || currentRow < 0 || currentRow >= ROWS || currentColumn < 0 || currentColumn >= COLUMNS) continue
    visited.add(key)
    if (board[currentRow][currentColumn]?.color !== color) continue
    result.push([currentRow, currentColumn])
    pending.push([currentRow - 1, currentColumn], [currentRow + 1, currentColumn], [currentRow, currentColumn - 1], [currentRow, currentColumn + 1])
  }
  return result
}

function collapseBoard(board: Array<Array<Tile | undefined>>, seed: number): Tile[][] {
  const next = Array.from({ length: ROWS }, () => Array<Tile>(COLUMNS))
  for (let column = 0; column < COLUMNS; column += 1) {
    const remaining: Tile[] = []
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      const tile = board[row][column]
      if (tile) remaining.push(tile)
    }
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      const tile = remaining[ROWS - 1 - row]
      if (tile) next[row][column] = tile
      else {
        const color = COLORS[Math.floor(seededValue(seed + column * 17 + row * 31) * COLORS.length)]
        next[row][column] = { id: `tile-${seed}-${row}-${column}-new`, color, fresh: true }
      }
    }
  }
  return next
}

function hasMove(board: Tile[][]): boolean {
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const tile = board[row][column]
      if (column + 1 < COLUMNS && board[row][column + 1].color === tile.color) return true
      if (row + 1 < ROWS && board[row + 1][column].color === tile.color) return true
    }
  }
  return false
}

export function BlockMowerGame({ onClose }: { onClose: () => void }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const clearTimerRef = useRef<number | null>(null)
  const [round, setRound] = useState(1)
  const [board, setBoard] = useState(() => createBoard(1))
  const [tools, setTools] = useState(() => createTools(1))
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [clearing, setClearing] = useState<Set<string>>(new Set())
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [bestScore, setBestScore] = useState(() => {
    try { return Number(window.localStorage.getItem('lumi:block-mower-best') ?? 0) || 0 } catch { return 0 }
  })
  const [message, setMessage] = useState('选择下方的彩色工具，再点掉相同颜色的方块')

  useEffect(() => {
    shellRef.current?.focus({ preventScroll: true })
    return () => {
      if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current)
    }
  }, [])

  const restart = useCallback(() => {
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current)
    const nextRound = round + 1
    setRound(nextRound)
    setBoard(createBoard(nextRound))
    setTools(createTools(nextRound))
    setSelectedTool(null)
    setClearing(new Set())
    setCombo(0)
    setMessage('新的一局开始了，找出相连的同色方块吧')
  }, [round])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'GoBack') {
        event.preventDefault()
        onClose()
      } else if ((event.key === 'r' || event.key === 'R') && !event.repeat) {
        event.preventDefault()
        restart()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose, restart])

  useEffect(() => {
    if (score <= bestScore) return
    setBestScore(score)
    try { window.localStorage.setItem('lumi:block-mower-best', String(score)) } catch { /* 本地存储不可用时不影响游戏 */ }
  }, [bestScore, score])

  const handleToolKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, tool: Tool) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setSelectedTool((current) => current === tool.id ? null : tool.id)
      setMessage(`${tool.label}工具已${selectedTool === tool.id ? '取消' : '选中'}`)
    }
  }

  const clearAt = (row: number, column: number) => {
    if (clearing.size > 0) return
    const tile = board[row][column]
    if (!tile) return
    const selected = tools.find((tool) => tool.id === selectedTool)
    if (selected && selected.color !== tile.color) {
      setMessage(`这不是${selected.label}，试试相同颜色的方块`)
      return
    }
    const group = connectedGroup(board, row, column, tile.color)
    if (group.length < 2) {
      setMessage('至少找到两个相连的同色方块才能清除')
      return
    }
    const removedIds = new Set(group.map(([groupRow, groupColumn]) => board[groupRow][groupColumn].id))
    const nextCombo = combo + 1
    const multiplier = Math.min(4, nextCombo)
    const gained = group.length * 10 * multiplier
    setClearing(removedIds)
    setCombo(nextCombo)
    setScore((current) => current + gained)
    setSelectedTool(null)
    setMessage(`${group.length} 个方块连锁清除，+${gained} 分`)
    clearTimerRef.current = window.setTimeout(() => {
      const cleared = board.map((boardRow) => boardRow.map((boardTile) => removedIds.has(boardTile.id) ? undefined : { ...boardTile, fresh: false }))
      const nextBoard = collapseBoard(cleared, round + nextCombo + gained)
      setBoard(nextBoard)
      setClearing(new Set())
      if (!hasMove(nextBoard)) {
        setMessage('这一轮没有可连消的方块了，点击右上角重新开始')
      }
    }, 260)
  }

  return (
    <div className="block-mower-backdrop" role="dialog" aria-modal="true" aria-label="方块割草">
      <div className="block-mower-shell" ref={shellRef} tabIndex={-1}>
        <header className="block-mower-header">
          <div className="block-mower-brand"><Gamepad2 size={19} /><div><strong>方块割草</strong><span>COLOR GROVE · 第 {round} 关</span></div></div>
          <div className="block-mower-stats"><span><Sparkles size={14} />得分<strong>{score.toLocaleString('zh-CN')}</strong></span><span><Trophy size={14} />最高<strong>{bestScore.toLocaleString('zh-CN')}</strong></span><span><Zap size={14} />连击<strong>x{Math.min(4, Math.max(1, combo))}</strong></span></div>
          <div className="block-mower-header-actions"><button type="button" className="block-mower-icon" aria-label="重新开始" title="重新开始" onClick={restart}><RefreshCw size={18} /></button><button type="button" className="block-mower-icon" aria-label="退出方块割草" data-tv-close onClick={onClose}><X size={20} /></button></div>
        </header>

        <main className="block-mower-main">
          <section className="block-mower-stage">
            <div className="block-mower-stage-top"><span className="block-mower-level"><Lightbulb size={15} />找相连的颜色</span><span className="block-mower-progress">{Math.min(100, Math.round((score % 1000) / 10))}% 本关能量</span></div>
            <div className="block-mower-board" role="grid" aria-label="方块棋盘" style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}>
              {board.flatMap((boardRow, row) => boardRow.map((tile, column) => {
                const isClearing = clearing.has(tile.id)
                return <button type="button" role="gridcell" key={tile.id} className={`block-mower-tile tile-${tile.color} ${tile.fresh ? 'is-fresh' : ''} ${isClearing ? 'is-clearing' : ''}`} aria-label={`${row + 1}行${column + 1}列，${COLOR_LABELS[tile.color]}`} data-tv-initial={row === ROWS - 1 && column === 0 ? true : undefined} onClick={() => clearAt(row, column)} disabled={clearing.size > 0}>{COLOR_SYMBOLS[tile.color]}</button>
              }))}
            </div>
            <p className="block-mower-message" role="status">{message}</p>
          </section>

          <aside className="block-mower-tray">
            <div className="block-mower-tray-heading"><div><span className="eyebrow">TOOL BELT</span><h2>选择颜色</h2></div><span className="soft-badge">{tools.length} 个工具</span></div>
            <div className="block-mower-tools">
              {tools.map((tool) => <button type="button" key={tool.id} className={`block-mower-tool tool-${tool.color} ${selectedTool === tool.id ? 'is-selected' : ''}`} aria-pressed={selectedTool === tool.id} onClick={() => { setSelectedTool((current) => current === tool.id ? null : tool.id); setMessage(`${tool.label}工具已${selectedTool === tool.id ? '取消' : '选中'}`) }} onKeyDown={(event) => handleToolKeyDown(event, tool)}><span className="block-mower-tool-symbol">{COLOR_SYMBOLS[tool.color]}</span><strong>{tool.label}</strong><small>清除 {tool.power} 格</small></button>)}
            </div>
            <div className="block-mower-tip"><ArrowLeft size={16} /><span>遥控器方向键可以逐格选择，确认键清除；手机直接点按。</span></div>
            <button type="button" className="button button-quiet block-mower-restart" onClick={restart}><RefreshCw size={16} />重新开一局</button>
          </aside>
        </main>
      </div>
    </div>
  )
}
