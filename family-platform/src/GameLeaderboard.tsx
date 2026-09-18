import { useEffect, useState } from 'react'
import { Crown, Medal, RefreshCw, Trophy, X } from 'lucide-react'
import { gameLeaderboardApi } from './api'
import type { GameLeaderboardEntry, LumiGameId } from './types'

const GAMES: Array<{ id: LumiGameId; label: string }> = [
  { id: 'block-defense', label: '彩块防线' },
  { id: 'gold-miner', label: '深岩淘金' },
  { id: 'tetris', label: '俄罗斯方块' },
  { id: 'snake', label: '贪吃蛇' },
]

function recordDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '时间未知'
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function GameLeaderboard({ currentUserId, onClose }: { currentUserId: string; onClose: () => void }) {
  const [gameId, setGameId] = useState<LumiGameId>('block-defense')
  const [entries, setEntries] = useState<GameLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!['Escape', 'BrowserBack', 'GoBack'].includes(event.key)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void gameLeaderboardApi(gameId).then((result) => {
      if (!cancelled) setEntries(result)
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setEntries([])
        setError(reason instanceof Error ? reason.message : '排行榜暂时无法读取')
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [gameId, reload])

  return (
    <div className="game-ranking-backdrop" role="dialog" aria-modal="true" aria-label="家庭游戏排行榜">
      <section className="game-ranking-panel">
        <header>
          <div><span className="eyebrow">FAMILY LEADERBOARD</span><h2><Trophy size={22} />家庭排行榜</h2><p>每个账户只保留自己的历史最高分和创造纪录的时间。</p></div>
          <button type="button" aria-label="关闭排行榜" data-tv-close onClick={onClose}><X size={20} /></button>
        </header>
        <div className="game-ranking-tabs" role="tablist" aria-label="选择游戏">
          {GAMES.map((game) => <button type="button" role="tab" aria-selected={gameId === game.id} className={gameId === game.id ? 'is-active' : ''} key={game.id} onClick={() => setGameId(game.id)}>{game.label}</button>)}
        </div>
        <div className="game-ranking-list">
          {loading && <div className="game-ranking-empty"><RefreshCw className="is-spinning" size={24} /><strong>正在读取家庭主机</strong></div>}
          {!loading && error && <div className="game-ranking-empty"><strong>{error}</strong><button type="button" className="button button-secondary" onClick={() => setReload((value) => value + 1)}>重新读取</button></div>}
          {!loading && !error && entries.length === 0 && <div className="game-ranking-empty"><Medal size={28} /><strong>还没有纪录</strong><span>完成一局后，这里会出现家庭成员的最高分。</span></div>}
          {!loading && !error && entries.map((entry) => (
            <article key={entry.userId} className={`${entry.userId === currentUserId ? 'is-current' : ''} rank-${entry.rank}`}>
              <span className="game-ranking-rank">{entry.rank <= 3 ? <Crown size={18} /> : entry.rank}</span>
              <div><strong>{entry.displayName}{entry.userId === currentUserId ? '（我）' : ''}</strong><small>{recordDate(entry.achievedAt)}</small></div>
              <b>{entry.score.toLocaleString('zh-CN')}</b>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
