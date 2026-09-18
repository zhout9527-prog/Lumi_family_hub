import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Bomb,
  BookOpen,
  Check,
  Clock3,
  Coins,
  Dumbbell,
  Gamepad2,
  Gem,
  Gift,
  Pause,
  Pickaxe,
  Play,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Star,
  Trophy,
  X,
  Zap,
} from 'lucide-react'
import { DEVICE_PROFILE } from './device'

type TreasureKind = 'gold-large' | 'gold-medium' | 'gold-small' | 'diamond' | 'rock' | 'mystery'
type HookPhase = 'swinging' | 'extending' | 'retracting'
type RoundStatus = 'playing' | 'shop' | 'failed'
type ToolKind = 'lucky-charm' | 'strength' | 'dynamite' | 'gold-book' | 'diamond-book'
type PassiveToolKind = Exclude<ToolKind, 'dynamite'>

interface Treasure {
  id: string
  kind: TreasureKind
  x: number
  y: number
  radius: number
  value: number
  rotation: number
}

interface HookState {
  angle: number
  direction: 1 | -1
  length: number
  phase: HookPhase
  caughtId: string | null
}

interface LevelConfig {
  name: string
  goal: number
  seconds: number
  swingSpeed: number
  aimAssist: boolean
  tip: string
  counts: Record<TreasureKind, number>
}

type Inventory = Record<ToolKind, number>
type QueuedBoosts = Record<PassiveToolKind, boolean>

interface RoundEffects {
  luckyCharm: boolean
  strength: boolean
  goldBook: boolean
  diamondBook: boolean
}

interface SavedProgress {
  level: number
  highestLevel: number
  coins: number
  inventory: Inventory
  activeEffects: RoundEffects
}

const BOARD_WIDTH = 1000
const BOARD_HEIGHT = 650
const PIVOT_X = 500
const PIVOT_Y = 104
const MIN_LENGTH = 66
const MAX_LENGTH = 610
const BEST_SCORE_KEY = 'lumi:deep-mine-best'
const PROGRESS_KEY = 'lumi:deep-mine-progress:v2'
const EMPTY_INVENTORY: Inventory = { 'lucky-charm': 0, strength: 0, dynamite: 0, 'gold-book': 0, 'diamond-book': 0 }
const EMPTY_QUEUED: QueuedBoosts = { 'lucky-charm': false, strength: false, 'gold-book': false, 'diamond-book': false }
const EMPTY_EFFECTS: RoundEffects = { luckyCharm: false, strength: false, goldBook: false, diamondBook: false }

const TREASURE_META: Record<TreasureKind, { label: string; value: number; pullSpeed: number; radius: number; pullHint: string }> = {
  'gold-large': { label: '大金块', value: 500, pullSpeed: 87, radius: 42, pullHint: '沉甸甸的，慢慢把它拉回来！' },
  'gold-medium': { label: '金块', value: 250, pullSpeed: 153, radius: 31, pullHint: '抓稳了，正在回收金块！' },
  'gold-small': { label: '小金块', value: 100, pullSpeed: 258, radius: 22, pullHint: '小金块很轻，很快就回来啦！' },
  diamond: { label: '钻石', value: 600, pullSpeed: 390, radius: 19, pullHint: '钻石又轻又珍贵，回收速度最快！' },
  rock: { label: '石块', value: 25, pullSpeed: 53, radius: 35, pullHint: '石头最重，可以用炸药放弃它。' },
  mystery: { label: '福袋', value: 180, pullSpeed: 198, radius: 27, pullHint: '福袋里一定有奖励，还可能藏着道具！' },
}

const LEVELS: LevelConfig[] = [
  {
    name: '闪光入门', goal: 300, seconds: 75, swingSpeed: 30, aimAssist: true,
    tip: '跟着虚线瞄准。抓到一个大金块或钻石，就能完成第一关！',
    counts: { 'gold-large': 2, 'gold-medium': 5, 'gold-small': 7, diamond: 3, mystery: 2, rock: 1 },
  },
  {
    name: '黄金浅层', goal: 520, seconds: 75, swingSpeed: 31, aimAssist: true,
    tip: '小金块回收快，大金块分数高。先抓近处，再挑战远处。',
    counts: { 'gold-large': 3, 'gold-medium': 5, 'gold-small': 7, diamond: 4, mystery: 2, rock: 1 },
  },
  {
    name: '钻石小径', goal: 760, seconds: 72, swingSpeed: 32, aimAssist: true,
    tip: '钻石最轻、回收最快。虚线经过钻石时再放钩，会更容易命中。',
    counts: { 'gold-large': 3, 'gold-medium': 5, 'gold-small': 6, diamond: 5, mystery: 2, rock: 2 },
  },
  {
    name: '回声矿洞', goal: 980, seconds: 72, swingSpeed: 34, aimAssist: false,
    tip: '开始独立判断时机吧。福袋一定给分和矿币，还可能送道具。',
    counts: { 'gold-large': 3, 'gold-medium': 5, 'gold-small': 6, diamond: 4, mystery: 3, rock: 3 },
  },
  {
    name: '交错岩层', goal: 1240, seconds: 70, swingSpeed: 35, aimAssist: false,
    tip: '石头多起来了。抓到不想要的目标时，可以使用炸药。',
    counts: { 'gold-large': 4, 'gold-medium': 5, 'gold-small': 6, diamond: 4, mystery: 3, rock: 3 },
  },
  {
    name: '星光竖井', goal: 1450, seconds: 70, swingSpeed: 36, aimAssist: false,
    tip: '试试大力手套和幸运书籍，它们能让这一关轻松很多。',
    counts: { 'gold-large': 4, 'gold-medium': 5, 'gold-small': 6, diamond: 4, mystery: 3, rock: 4 },
  },
  {
    name: '熔金深层', goal: 1680, seconds: 68, swingSpeed: 37, aimAssist: false,
    tip: '先拿轻而值钱的钻石，再用剩余时间搬运大金块。',
    counts: { 'gold-large': 4, 'gold-medium': 6, 'gold-small': 6, diamond: 5, mystery: 3, rock: 4 },
  },
  {
    name: '宝石迷宫', goal: 1940, seconds: 68, swingSpeed: 38, aimAssist: false,
    tip: '恭喜来到第八关！合理使用积攒的道具，比一味追求速度更重要。',
    counts: { 'gold-large': 5, 'gold-medium': 5, 'gold-small': 6, diamond: 5, mystery: 3, rock: 4 },
  },
  {
    name: '远古矿脉', goal: 2170, seconds: 68, swingSpeed: 39, aimAssist: false,
    tip: '观察完整摆动周期，选择目标密集的一侧连续出钩。',
    counts: { 'gold-large': 5, 'gold-medium': 6, 'gold-small': 6, diamond: 5, mystery: 3, rock: 5 },
  },
  {
    name: '彩虹宝库', goal: 2450, seconds: 70, swingSpeed: 40, aimAssist: false,
    tip: '最后的主题关卡！把背包里的宝贝用起来，完成十关挑战。',
    counts: { 'gold-large': 5, 'gold-medium': 6, 'gold-small': 7, diamond: 6, mystery: 4, rock: 5 },
  },
]

const TOOL_META: Record<ToolKind, { name: string; price: number; description: string; highValue?: boolean }> = {
  'lucky-charm': { name: '福袋徽章', price: 90, description: '下一关福袋更容易开出书籍和稀有道具。' },
  strength: { name: '大力药水', price: 120, description: '持续下一关，所有目标的回收速度提高 75%。' },
  dynamite: { name: '安全炸药', price: 80, description: '抓到石头或不想要的目标时炸掉，本次立即空钩返回。' },
  'gold-book': { name: '幸运金块书', price: 160, description: '下一关额外刷新 4 块金块。', highValue: true },
  'diamond-book': { name: '幸运钻石书', price: 220, description: '下一关额外刷新 3 颗钻石。', highValue: true },
}

const PASSIVE_TOOLS: PassiveToolKind[] = ['lucky-charm', 'strength', 'gold-book', 'diamond-book']

function toolIcon(kind: ToolKind, size = 18) {
  if (kind === 'lucky-charm') return <Sparkles size={size} />
  if (kind === 'strength') return <Dumbbell size={size} />
  if (kind === 'dynamite') return <Bomb size={size} />
  if (kind === 'diamond-book') return <Gem size={size} />
  return <BookOpen size={size} />
}

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function levelConfig(level: number): LevelConfig {
  if (level <= LEVELS.length) return LEVELS[level - 1]
  const depth = level - LEVELS.length
  return {
    ...LEVELS.at(-1)!,
    name: `无尽矿层 ${depth}`,
    goal: 2450 + depth * 230 + Math.floor(depth / 3) * 120,
    seconds: 70,
    swingSpeed: Math.min(46, 40 + depth * 0.5),
    tip: '这里是无尽矿层。继续搭配背包道具，刷新自己的最高关卡！',
    counts: {
      'gold-large': 5 + Math.min(2, Math.floor(depth / 3)),
      'gold-medium': 6,
      'gold-small': 7,
      diamond: 6,
      mystery: 4,
      rock: 5 + Math.min(3, Math.floor(depth / 2)),
    },
  }
}

function createTreasures(level: number, seed: number, effects: RoundEffects): Treasure[] {
  const config = levelConfig(level)
  const random = seeded(seed * 747796405 + level * 2891336453)
  const counts = { ...config.counts }
  if (effects.goldBook) {
    counts['gold-medium'] += 2
    counts['gold-small'] += 2
  }
  if (effects.diamondBook) counts.diamond += 3
  const tutorialAnchors: Array<{ kind: TreasureKind; x: number; y: number }> = level <= 3
    ? level === 1
      ? [{ kind: 'diamond', x: 335, y: 270 }, { kind: 'gold-large', x: 680, y: 292 }]
      : level === 2
        ? [{ kind: 'gold-large', x: 350, y: 285 }, { kind: 'diamond', x: 655, y: 255 }]
        : [{ kind: 'diamond', x: 360, y: 300 }, { kind: 'gold-large', x: 670, y: 310 }]
    : []
  const items: Treasure[] = tutorialAnchors.map((anchor, index) => {
    counts[anchor.kind] -= 1
    const meta = TREASURE_META[anchor.kind]
    return {
      id: `treasure-${level}-${seed}-guide-${index}`,
      ...anchor,
      radius: meta.radius,
      value: meta.value,
      rotation: index % 2 ? 8 : -7,
    }
  })
  const kinds = (Object.entries(counts) as [TreasureKind, number][])
    .flatMap(([kind, count]) => Array.from({ length: count }, () => kind))
    .sort(() => random() - 0.5)
  for (const [index, kind] of kinds.entries()) {
    const meta = TREASURE_META[kind]
    let candidate: Treasure | null = null
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const depth = level <= 3 ? Math.pow(random(), 1.12) : random()
      const y = 220 + depth * 365
      const reachableHalfWidth = Math.min(425, Math.tan(64 * Math.PI / 180) * Math.max(80, y - PIVOT_Y))
      const x = PIVOT_X + (random() * 2 - 1) * reachableHalfWidth
      const next: Treasure = {
        id: `treasure-${level}-${seed}-${index}`,
        kind,
        x,
        y,
        radius: meta.radius,
        value: kind === 'mystery' ? 150 + Math.round(random() * 210) : meta.value,
        rotation: Math.round(random() * 34 - 17),
      }
      const gap = level <= 3 ? 8 : 12
      const clearOfTreasures = items.every((item) => Math.hypot(item.x - x, item.y - y) > item.radius + next.radius + gap)
      const clearOfTutorialPaths = tutorialAnchors.every((anchor) => {
        const rayX = anchor.x - PIVOT_X
        const rayY = anchor.y - PIVOT_Y
        const rayLengthSquared = rayX * rayX + rayY * rayY
        const progress = ((x - PIVOT_X) * rayX + (y - PIVOT_Y) * rayY) / rayLengthSquared
        if (progress <= 0 || progress >= 1) return true
        const projectedX = PIVOT_X + rayX * progress
        const projectedY = PIVOT_Y + rayY * progress
        return Math.hypot(x - projectedX, y - projectedY) > next.radius + 22
      })
      const clear = clearOfTreasures && clearOfTutorialPaths
      if (clear) { candidate = next; break }
    }
    const fallbackColumn = index % 6
    const fallbackRow = Math.floor(index / 6) % 4
    items.push(candidate ?? {
      id: `treasure-${level}-${seed}-${index}`,
      kind,
      x: 100 + fallbackColumn * 160,
      y: 245 + fallbackRow * 105,
      radius: meta.radius,
      value: kind === 'mystery' ? 190 : meta.value,
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

function readProgress(): SavedProgress {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? '{}') as Partial<SavedProgress>
    const inventory = { ...EMPTY_INVENTORY, ...(parsed.inventory ?? {}) }
    return {
      level: Math.max(1, Math.min(99, Math.floor(Number(parsed.level) || 1))),
      highestLevel: Math.max(1, Math.min(99, Math.floor(Number(parsed.highestLevel) || 1))),
      coins: Math.max(0, Math.min(999_999, Math.floor(Number(parsed.coins) || 0))),
      inventory: Object.fromEntries(Object.entries(inventory).map(([key, value]) => [key, Math.max(0, Math.min(99, Math.floor(Number(value) || 0))) ])) as Inventory,
      activeEffects: { ...EMPTY_EFFECTS, ...(parsed.activeEffects ?? {}) },
    }
  } catch {
    return { level: 1, highestLevel: 1, coins: 0, inventory: { ...EMPTY_INVENTORY }, activeEffects: { ...EMPTY_EFFECTS } }
  }
}

function hookPoint(hook: HookState): { x: number; y: number } {
  const radians = hook.angle * Math.PI / 180
  return { x: PIVOT_X + Math.sin(radians) * hook.length, y: PIVOT_Y + Math.cos(radians) * hook.length }
}

function mysteryTool(item: Treasure, level: number, lucky: boolean): ToolKind | null {
  const numericId = item.id.split('-').reduce((sum, part) => sum + Array.from(part).reduce((value, character) => value + character.charCodeAt(0), 0), 0)
  const random = seeded(numericId * 97 + level * 131)
  const chance = lucky ? 0.86 : 0.56
  if (random() > chance) return null
  const roll = random()
  if (lucky) {
    if (roll < 0.25) return 'diamond-book'
    if (roll < 0.48) return 'gold-book'
    if (roll < 0.68) return 'strength'
    if (roll < 0.84) return 'lucky-charm'
    return 'dynamite'
  }
  if (roll < 0.08) return 'diamond-book'
  if (roll < 0.20) return 'gold-book'
  if (roll < 0.43) return 'strength'
  if (roll < 0.65) return 'lucky-charm'
  return 'dynamite'
}

export function GoldMinerGame({ onClose }: { onClose: () => void }) {
  const initialProgress = useMemo(readProgress, [])
  const initialConfig = levelConfig(initialProgress.level)
  const shellRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLButtonElement>(null)
  const hookRef = useRef<HookState>({ angle: -48, direction: 1, length: MIN_LENGTH, phase: 'swinging', caughtId: null })
  const treasuresRef = useRef<Treasure[]>([])
  const scoreRef = useRef(0)
  const lastFrameRef = useRef(0)
  const concludingRef = useRef(false)
  const [level, setLevel] = useState(initialProgress.level)
  const [highestLevel, setHighestLevel] = useState(initialProgress.highestLevel)
  const [roundSeed, setRoundSeed] = useState(1)
  const [activeEffects, setActiveEffects] = useState<RoundEffects>(initialProgress.activeEffects)
  const [queuedBoosts, setQueuedBoosts] = useState<QueuedBoosts>(EMPTY_QUEUED)
  const [inventory, setInventory] = useState<Inventory>(initialProgress.inventory)
  const [coins, setCoins] = useState(initialProgress.coins)
  const [treasures, setTreasures] = useState(() => createTreasures(initialProgress.level, 1, initialProgress.activeEffects))
  const [hook, setHook] = useState<HookState>(hookRef.current)
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState(readBestScore)
  const [secondsLeft, setSecondsLeft] = useState(initialConfig.seconds)
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState<RoundStatus>('playing')
  const [timeExpired, setTimeExpired] = useState(false)
  const [rescueUsed, setRescueUsed] = useState(false)
  const [lastEarnings, setLastEarnings] = useState(0)
  const [message, setMessage] = useState(initialConfig.tip)
  const [flash, setFlash] = useState<{ id: number; value: number; label?: string } | null>(null)
  const [explosion, setExplosion] = useState<{ id: number; x: number; y: number } | null>(null)

  const config = useMemo(() => levelConfig(level), [level])
  treasuresRef.current = treasures
  hookRef.current = hook
  scoreRef.current = score
  const caught = useMemo(() => treasures.find((item) => item.id === hook.caughtId) ?? null, [hook.caughtId, treasures])
  const tip = hookPoint(hook)
  const aimTip = hookPoint({ ...hook, length: MAX_LENGTH })
  const reachedGoal = score >= config.goal
  const progressPercent = Math.min(100, score / config.goal * 100)
  const activeEffectNames = [
    activeEffects.luckyCharm && '福袋幸运',
    activeEffects.strength && '大力回收',
    activeEffects.goldBook && '金块增量',
    activeEffects.diamondBook && '钻石增量',
  ].filter(Boolean) as string[]

  const resetRound = useCallback((nextLevel = level, effects = activeEffects, prefix = '重新布置好了矿洞。') => {
    const nextSeed = roundSeed + 1
    const nextHook: HookState = { angle: -48, direction: 1, length: MIN_LENGTH, phase: 'swinging', caughtId: null }
    const nextConfig = levelConfig(nextLevel)
    const nextTreasures = createTreasures(nextLevel, nextSeed, effects)
    concludingRef.current = false
    hookRef.current = nextHook
    treasuresRef.current = nextTreasures
    scoreRef.current = 0
    setRoundSeed(nextSeed)
    setTreasures(nextTreasures)
    setHook(nextHook)
    setScore(0)
    setSecondsLeft(nextConfig.seconds)
    setPaused(false)
    setStatus('playing')
    setTimeExpired(false)
    setRescueUsed(false)
    setFlash(null)
    setExplosion(null)
    setMessage(`${prefix} ${nextConfig.tip}`)
    window.setTimeout(() => stageRef.current?.focus({ preventScroll: true }), 0)
  }, [activeEffects, level, roundSeed])

  const retryLevel = useCallback(() => resetRound(level, activeEffects, '别着急，再试一次！失败不会扣掉本关增益。'), [activeEffects, level, resetRound])

  const dropHook = useCallback(() => {
    if (timeExpired || status !== 'playing') return
    setHook((current) => current.phase === 'swinging' && !paused ? { ...current, phase: 'extending' } : current)
  }, [paused, status, timeExpired])

  const useDynamite = useCallback(() => {
    const current = hookRef.current
    if (status !== 'playing' || !current.caughtId || inventory.dynamite <= 0) return
    const target = treasuresRef.current.find((item) => item.id === current.caughtId)
    if (!target) return
    setInventory((items) => ({ ...items, dynamite: Math.max(0, items.dynamite - 1) }))
    setTreasures((items) => items.filter((item) => item.id !== target.id))
    setExplosion({ id: Date.now(), ...hookPoint(current) })
    setHook((value) => ({ ...value, caughtId: null, phase: 'retracting' }))
    setMessage(`安全炸掉了${TREASURE_META[target.kind].label}，吊钩正在快速返回！`)
    window.setTimeout(() => setExplosion(null), 650)
  }, [inventory.dynamite, status])

  const concludeRound = useCallback(() => {
    if (concludingRef.current || status !== 'playing') return
    concludingRef.current = true
    const finalScore = scoreRef.current
    setPaused(false)
    setTimeExpired(false)
    if (finalScore >= config.goal) {
      const earnings = 80 + Math.floor(finalScore * 0.2)
      setLastEarnings(earnings)
      setCoins((value) => value + earnings)
      setHighestLevel((value) => Math.max(value, level + 1))
      setStatus('shop')
      setMessage(`第 ${level} 关完成，获得 ${earnings} 枚矿币！`)
    } else {
      setStatus('failed')
      setMessage(`还差 ${Math.max(0, config.goal - finalScore)} 分，保留道具再试一次吧。`)
    }
  }, [config.goal, level, status])

  const finishEarly = useCallback(() => {
    if (!reachedGoal || status !== 'playing') return
    setTimeExpired(true)
    setSecondsLeft(0)
    setMessage(hookRef.current.phase === 'swinging' ? '目标达成，准备前往补给站！' : '目标达成！最后这一钩仍然算分。')
  }, [reachedGoal, status])

  const buyTool = useCallback((kind: ToolKind) => {
    const meta = TOOL_META[kind]
    if (coins < meta.price) return
    setCoins((value) => value - meta.price)
    setInventory((items) => ({ ...items, [kind]: items[kind] + 1 }))
    setMessage(`${meta.name}已经放进背包，可以积攒以后再用。`)
  }, [coins])

  const toggleQueuedBoost = useCallback((kind: PassiveToolKind) => {
    if (!queuedBoosts[kind] && inventory[kind] <= 0) return
    setQueuedBoosts((current) => ({ ...current, [kind]: !current[kind] }))
  }, [inventory, queuedBoosts])

  const startNextLevel = useCallback(() => {
    const nextLevel = level + 1
    const effects: RoundEffects = {
      luckyCharm: queuedBoosts['lucky-charm'],
      strength: queuedBoosts.strength,
      goldBook: queuedBoosts['gold-book'],
      diamondBook: queuedBoosts['diamond-book'],
    }
    setInventory((items) => {
      const next = { ...items }
      for (const kind of PASSIVE_TOOLS) if (queuedBoosts[kind] && next[kind] > 0) next[kind] -= 1
      return next
    })
    setQueuedBoosts(EMPTY_QUEUED)
    setActiveEffects(effects)
    setLevel(nextLevel)
    resetRound(nextLevel, effects, nextLevel === 10 ? '彩虹宝库开启！' : '下一层矿洞开启！')
  }, [level, queuedBoosts, resetRound])

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
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({ level, highestLevel, coins, inventory, activeEffects } satisfies SavedProgress))
    } catch { /* 无法使用本地存储时仅保留当前游戏会话。 */ }
  }, [activeEffects, coins, highestLevel, inventory, level])

  useEffect(() => {
    if (paused || status !== 'playing' || timeExpired) return
    const timer = window.setInterval(() => setSecondsLeft((current) => {
      if (current <= 1) {
        setTimeExpired(true)
        setMessage(hookRef.current.phase === 'swinging' ? '时间到，正在结算本关。' : '时间到，最后这一钩仍然算分！')
        return 0
      }
      return current - 1
    }), 1000)
    return () => window.clearInterval(timer)
  }, [paused, status, timeExpired])

  useEffect(() => {
    if (!timeExpired || status !== 'playing' || hook.phase !== 'swinging') return
    const finalScore = scoreRef.current
    if (!rescueUsed && finalScore > 0 && finalScore < config.goal && finalScore >= config.goal * 0.65) {
      setRescueUsed(true)
      setTimeExpired(false)
      setSecondsLeft(15)
      setMessage(`就差一点！矿工爷爷送你最后 15 秒，加油！`)
      return
    }
    concludeRound()
  }, [concludeRound, config.goal, hook.phase, rescueUsed, status, timeExpired])

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
      if (!paused && status === 'playing') {
        const current = hookRef.current
        let next = current
        if (current.phase === 'swinging') {
          if (!timeExpired) {
            let angle = current.angle + current.direction * config.swingSpeed * delta
            let direction = current.direction
            if (angle >= 68) { angle = 68; direction = -1 }
            if (angle <= -68) { angle = -68; direction = 1 }
            next = { ...current, angle, direction }
          }
        } else if (current.phase === 'extending') {
          const length = Math.min(MAX_LENGTH, current.length + 500 * delta)
          const point = hookPoint({ ...current, length })
          const rect = stageRef.current?.getBoundingClientRect()
          const scaleX = (rect?.width ?? BOARD_WIDTH) / BOARD_WIDTH
          const scaleY = (rect?.height ?? BOARD_HEIGHT) / BOARD_HEIGHT
          const forgiveness = level <= 3 ? 18 : 13
          const hit = treasuresRef.current
            .map((item) => ({
              item,
              distance: Math.hypot((item.x - point.x) * scaleX, (item.y - point.y) * scaleY),
              hitRadius: (item.radius + forgiveness) * scaleX,
            }))
            .filter(({ distance, hitRadius }) => distance <= hitRadius)
            .sort((left, right) => left.distance - right.distance)[0]?.item
          const outside = point.x < 18 || point.x > BOARD_WIDTH - 18 || point.y > BOARD_HEIGHT - 12 || length >= MAX_LENGTH
          next = hit
            ? { ...current, length, phase: 'retracting', caughtId: hit.id }
            : outside ? { ...current, length, phase: 'retracting' } : { ...current, length }
          if (hit) setMessage(`${TREASURE_META[hit.kind].label}上钩！${TREASURE_META[hit.kind].pullHint}`)
        } else {
          const caughtItem = treasuresRef.current.find((item) => item.id === current.caughtId)
          const baseSpeed = caughtItem ? TREASURE_META[caughtItem.kind].pullSpeed : 680
          const retractSpeed = baseSpeed * (activeEffects.strength ? 1.75 : 1)
          const length = Math.max(MIN_LENGTH, current.length - retractSpeed * delta)
          if (length <= MIN_LENGTH + 0.5) {
            if (caughtItem) {
              setTreasures((items) => items.filter((item) => item.id !== caughtItem.id))
              let rewardMessage = `${TREASURE_META[caughtItem.kind].label}入袋，+${caughtItem.value} 分！`
              if (caughtItem.kind === 'mystery') {
                const bagCoins = 30 + Math.round(caughtItem.value / 8)
                const foundTool = mysteryTool(caughtItem, level, activeEffects.luckyCharm)
                setCoins((value) => value + bagCoins)
                rewardMessage = `福袋开出 ${caughtItem.value} 分和 ${bagCoins} 枚矿币`
                if (foundTool) {
                  setInventory((items) => ({ ...items, [foundTool]: items[foundTool] + 1 }))
                  rewardMessage += `，还获得${TOOL_META[foundTool].name}！`
                } else rewardMessage += '！'
              }
              setScore((value) => value + caughtItem.value)
              setFlash({ id: Date.now(), value: caughtItem.value, label: caughtItem.kind === 'mystery' ? '福袋' : undefined })
              setMessage(rewardMessage)
            } else setMessage(timeExpired ? '最后一钩收回，正在结算。' : '这次没抓到，慢一点再瞄准！')
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
  }, [activeEffects.luckyCharm, activeEffects.strength, config.swingSpeed, level, paused, status, timeExpired])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (['Escape', 'BrowserBack', 'GoBack', 'Backspace'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation(); onClose(); return
      }
      if ((event.key === 'ArrowUp' || event.key === 'x' || event.key === 'X') && status === 'playing') {
        event.preventDefault()
        if (!event.repeat) useDynamite()
        return
      }
      if ((event.key === 'r' || event.key === 'R') && !event.repeat && status !== 'shop') {
        event.preventDefault(); retryLevel(); return
      }
      if ((event.key === 'p' || event.key === 'P') && !event.repeat && status === 'playing') {
        event.preventDefault(); setPaused((value) => !value); return
      }
      const isAction = event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowDown'
      const targetButton = event.target instanceof Element ? event.target.closest('button') : null
      const actionTarget = !targetButton || targetButton === stageRef.current
      if (isAction && actionTarget && status !== 'shop' && !event.repeat) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (status === 'failed') retryLevel()
        else if (paused) setPaused(false)
        else dropHook()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [dropHook, onClose, paused, retryLevel, status, useDynamite])

  return (
    <div className="gold-miner-backdrop" role="dialog" aria-modal="true" aria-label="深岩淘金">
      <div className="gold-miner-shell" ref={shellRef} tabIndex={-1}>
        <header className="gold-miner-header">
          <div className="gold-miner-brand"><Pickaxe size={20} /><div><strong>深岩淘金</strong><span>第 {level} 关 · {config.name}</span></div></div>
          <div className="gold-miner-stats">
            <span className="gold-level-stat"><Star size={14} />关卡<strong>{level}</strong></span>
            <span><Zap size={14} />目标<strong>{config.goal.toLocaleString('zh-CN')}</strong></span>
            <span className={reachedGoal ? 'is-complete' : ''}><Trophy size={14} />得分<strong data-testid="gold-score">{score.toLocaleString('zh-CN')}</strong></span>
            <span className={secondsLeft <= 10 ? 'is-urgent' : ''}><Clock3 size={14} />时间<strong>{secondsLeft}</strong></span>
            <span className="gold-coin-stat"><Coins size={14} />矿币<strong>{coins.toLocaleString('zh-CN')}</strong></span>
          </div>
          <div className="gold-miner-header-actions">
            <button type="button" className="gold-miner-icon" aria-label={paused ? '继续淘金' : '暂停淘金'} disabled={status !== 'playing'} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}</button>
            <button type="button" className="gold-miner-icon" aria-label="重新开始当前关卡" disabled={status === 'shop'} onClick={retryLevel}><RefreshCw size={18} /></button>
            <button type="button" className="gold-miner-icon" aria-label="退出深岩淘金" data-tv-close onClick={onClose}><X size={20} /></button>
          </div>
        </header>

        <main className={`gold-miner-main ${status === 'shop' ? 'is-shop' : ''}`}>
          {status === 'shop' ? (
            <section className="gold-miner-shop" aria-label="矿镇补给站">
              <div className="gold-shop-result">
                <span className="gold-shop-star"><Trophy size={27} /></span>
                <div><span className="eyebrow">LEVEL {level} CLEAR</span><h1>第 {level} 关完成！</h1><p>{level >= 10 ? '十关挑战完成，已经解锁无尽矿层。' : `${config.name}顺利通过，准备前往第 ${level + 1} 关。`}</p></div>
                <div className="gold-shop-reward"><small>本关收获</small><strong>{score.toLocaleString('zh-CN')} 分</strong><span><Coins size={15} />+{lastEarnings} 矿币</span></div>
              </div>

              <div className="gold-level-path" aria-label={`已完成第 ${level} 关`}>
                {LEVELS.map((entry, index) => <span key={entry.name} className={index < level ? 'is-cleared' : index === level ? 'is-next' : ''}>{index < level ? <Check size={13} /> : index + 1}</span>)}
              </div>

              <div className="gold-shop-heading"><div><span className="eyebrow">SUPPLY SHOP</span><h2>矿镇补给站</h2><p>道具会留在背包里，可以积攒到以后再用。</p></div><span className="gold-shop-wallet"><Coins size={18} />{coins.toLocaleString('zh-CN')}</span></div>

              <div className="gold-shop-grid">
                {(Object.entries(TOOL_META) as [ToolKind, typeof TOOL_META[ToolKind]][]).map(([kind, meta], index) => {
                  const passive = kind !== 'dynamite'
                  const queued = passive ? queuedBoosts[kind] : false
                  return (
                    <article key={kind} className={`gold-shop-card tool-${kind} ${meta.highValue ? 'is-rare' : ''}`}>
                      <span className="gold-tool-icon">{toolIcon(kind, 22)}</span>
                      <div><strong>{meta.name}</strong><small>{meta.description}</small></div>
                      <span className="gold-tool-owned">背包 × {inventory[kind]}</span>
                      <button type="button" className="gold-buy-button" data-tv-initial={index === 0 ? '' : undefined} disabled={coins < meta.price} onClick={() => buyTool(kind)}><Coins size={14} />购买 {meta.price}</button>
                      {passive && inventory[kind] > 0 && <button type="button" className={`gold-queue-button ${queued ? 'is-queued' : ''}`} onClick={() => toggleQueuedBoost(kind)}>{queued ? <><Check size={14} />下关已准备</> : '下关使用一个'}</button>}
                    </article>
                  )
                })}
              </div>

              <div className="gold-shop-footer">
                <div><ShoppingBag size={18} /><span>已准备 {Object.values(queuedBoosts).filter(Boolean).length} 种下关增益 · 炸药可在抓取途中随时使用</span></div>
                <button type="button" className="button button-primary gold-next-level" onClick={startNextLevel}>{level >= 10 ? '进入无尽矿层' : `进入第 ${level + 1} 关`}<Play size={17} fill="currentColor" /></button>
              </div>
            </section>
          ) : (
            <>
              <button type="button" ref={stageRef} className="gold-miner-stage" aria-label="放下吊钩" data-tv-initial data-phase={hook.phase} data-angle={hook.angle.toFixed(2)} onClick={status === 'failed' ? retryLevel : paused ? () => setPaused(false) : dropHook}>
                <span className="gold-miner-surface" aria-hidden="true"><span className="miner-cart" /><span className="miner-character"><i className="miner-hat" /><i className="miner-head" /><i className="miner-beard" /><i className="miner-body" /><i className="miner-arm" /></span><span className="miner-winch" /></span>
                <svg className="gold-miner-hook-layer" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
                  {config.aimAssist && hook.phase === 'swinging' && !timeExpired && <line className="gold-miner-aim" x1={PIVOT_X} y1={PIVOT_Y} x2={aimTip.x} y2={aimTip.y} />}
                  <line className="gold-miner-rope" x1={PIVOT_X} y1={PIVOT_Y} x2={tip.x} y2={tip.y} />
                  <g className="gold-miner-claw" transform={`translate(${tip.x} ${tip.y}) rotate(${-hook.angle})`}><path d="M -13 -3 L -5 11 L 0 4 L 5 11 L 13 -3" /><circle cx="0" cy="-7" r="6" /></g>
                </svg>
                <span className="gold-miner-cave-texture" aria-hidden="true" />
                <span className="gold-miner-depth depth-one" aria-hidden="true" /><span className="gold-miner-depth depth-two" aria-hidden="true" />
                {treasures.map((item) => (
                  <span key={item.id} className={`gold-treasure treasure-${item.kind} ${item.id === hook.caughtId ? 'is-caught' : ''}`} data-kind={item.kind} data-treasure-id={item.id} style={{ left: `${item.x / BOARD_WIDTH * 100}%`, top: `${item.y / BOARD_HEIGHT * 100}%`, width: `${item.radius * 2 / BOARD_WIDTH * 100}%`, '--treasure-rotate': `${item.rotation}deg` } as CSSProperties}>
                    {item.kind === 'mystery' && <span>?</span>}
                  </span>
                ))}
                {caught && <span className={`gold-treasure caught-overlay treasure-${caught.kind}`} style={{ left: `${tip.x / BOARD_WIDTH * 100}%`, top: `${tip.y / BOARD_HEIGHT * 100}%`, width: `${caught.radius * 2 / BOARD_WIDTH * 100}%` } as CSSProperties}>{caught.kind === 'mystery' ? '?' : ''}</span>}
                {explosion && <span key={explosion.id} className="gold-miner-explosion" style={{ left: `${explosion.x / BOARD_WIDTH * 100}%`, top: `${explosion.y / BOARD_HEIGHT * 100}%` } as CSSProperties}>✦</span>}
                {flash && <span key={flash.id} className="gold-miner-score-flash">{flash.label && <small>{flash.label}</small>}+{flash.value}</span>}
                <span className="gold-miner-message" role="status">{message}</span>
                <span className="gold-goal-progress" aria-hidden="true"><span style={{ width: `${progressPercent}%` }} /></span>
                {(paused || status === 'failed') && <span className="gold-miner-overlay"><strong>{status === 'failed' ? '差一点，再来！' : '已暂停'}</strong><small>{status === 'failed' ? `本关 ${score.toLocaleString('zh-CN')} / ${config.goal.toLocaleString('zh-CN')} 分，道具不会丢失` : '确认键或点击屏幕继续'}</small><span>{status === 'failed' ? '重试本关' : '继续淘金'}</span></span>}
              </button>

              <aside className="gold-miner-guide">
                <div className="gold-guide-heading"><span className="eyebrow">LEVEL {level}</span><h2>{config.name}</h2><p>{config.tip}</p></div>
                <ul><li><i className="legend-gold" />金块 <strong>100-500</strong></li><li><i className="legend-diamond" />钻石 <strong>600 · 最快</strong></li><li><i className="legend-bag">?</i>福袋 <strong>钱 + 道具</strong></li><li><i className="legend-rock" />石块 <strong>25 · 最慢</strong></li></ul>
                {activeEffectNames.length > 0 && <div className="gold-active-effects"><small>本关增益</small><div>{activeEffectNames.map((name) => <span key={name}><Sparkles size={11} />{name}</span>)}</div></div>}
                <div className="gold-backpack"><div><ShoppingBag size={15} /><strong>背包</strong><span>炸药 × {inventory.dynamite}</span></div><button type="button" className="gold-dynamite-button" disabled={!caught || inventory.dynamite <= 0} onClick={useDynamite}><Bomb size={16} />炸掉当前目标</button></div>
                <div className="gold-miner-control-note"><Gamepad2 size={17} /><span>{DEVICE_PROFILE === 'tv' ? '确认键或向下键放钩；向上键直接使用炸药。' : DEVICE_PROFILE === 'mobile' ? '轻点矿洞放钩；抓错时可点炸药。' : '空格、回车或向下键放钩；向上键或 X 使用炸药。'}</span></div>
                {reachedGoal ? <button type="button" className="button button-primary gold-miner-finish" onClick={finishEarly}><Check size={17} />目标达成，提前收工</button> : <button type="button" className="button button-primary gold-miner-drop" onClick={dropHook} disabled={hook.phase !== 'swinging' || paused || timeExpired || status !== 'playing'}><Pickaxe size={17} />放下吊钩</button>}
              </aside>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
