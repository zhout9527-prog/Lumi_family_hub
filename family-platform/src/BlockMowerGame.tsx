import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  Box,
  Check,
  ChevronRight,
  CircleDot,
  Coins,
  Crosshair,
  Gauge,
  Heart,
  Layers3,
  ListChecks,
  MapPinned,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  Shield,
  ShoppingBag,
  Sparkles,
  ScanLine,
  TimerReset,
  Trophy,
  Trash2,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import { gameProfileApi, saveGameProfileApi } from './api'
import { DEVICE_PROFILE } from './device'

type BlockHue = 'coral' | 'cyan' | 'blue' | 'violet' | 'lime' | 'amber'
type BlockShape = 'cube' | 'round' | 'triangle' | 'star' | 'cylinder'
type BlockPattern = 'plain' | 'black' | 'white'
type Difficulty = 'easy' | 'normal' | 'hard'
type GamePhase = 'playing' | 'won' | 'lost'

interface SignatureDefinition {
  id: string
  hue: BlockHue
  shape: BlockShape
  pattern: BlockPattern
  label: string
  shortLabel: string
  color: string
  darkColor: string
}

interface FieldBlock {
  id: string
  signatureId: string
  lane: number
}

interface BlockLayer {
  id: string
  progress: number
  blocks: FieldBlock[]
}

interface Launcher {
  id: string
  signatureId: string
  ammo: number
  capacity: number
  readyMs: number
  cooldownMs: number
  idle: boolean
}

interface ShotEffect {
  id: string
  lane: number
  progress: number
  color: string
  ttl: number
}

interface RoundReward {
  coins: number
  gears: number
  energy: number
  firstClear: boolean
}

interface RoundState {
  id: string
  level: number
  difficulty: Difficulty
  lanes: number
  catalog: string[]
  layers: BlockLayer[]
  active: Array<Launcher | null>
  reserve: Launcher[]
  selectedActive: number
  selectedReserve: number
  drawIndex: number
  freeRerolls: number
  deadlockMs: number
  penetrationUses: number
  penetratingSlots: number[]
  discardUses: number
  shields: number
  destroyed: number
  total: number
  score: number
  elapsedMs: number
  phase: GamePhase
  message: string
  effects: ShotEffect[]
  reward?: RoundReward
}

interface ProgressState {
  unlockedLevel: number
  currentLevel: number
  completedLevels: number[]
  levelBestScores: Record<string, number>
  coins: number
  gears: number
  slowLevel: number
  chargeLevel: number
  slotLevel: number
  reserveLevel: number
  rerolls: number
  universalLaunchers: number
  currentDifficulty: Difficulty
  completedVariants: string[]
  energyUnlockedLevels: number[]
  energy: number
  energyUpdatedAt: string
  bestScore: number
}

interface LevelDefinition {
  level: number
  chapter: string
  name: string
  seed: number
  lanes: number
  targetCount: number
  layerCount: number
  startProgress: number
  layerGap: number
  baseSpeed: number
  freeRerolls: number
}

interface ProgressSnapshot {
  progress: ProgressState
  updatedAt: string
}

interface UpgradeDefinition {
  id: 'slow' | 'charge' | 'slot' | 'reserve'
  title: string
  detail: string
  icon: typeof Gauge
  maxLevel: number
  coinBase: number
  gearBase: number
}

const STORAGE_KEY_PREFIX = 'lumi:block-defense-progress:v4'
const TICK_MS = 100
const FIRE_INTERVAL_MS = 760
const MAX_SHIELDS = 3
const DEADLOCK_RESCUE_MS = 2800
const MAX_LEVEL = 60
const MAX_ENERGY = 50
const LEVEL_ENERGY_COST = 10
const ENERGY_POINT_INTERVAL_MS = 15 * 60 * 1000

const DIFFICULTIES: Record<Difficulty, { label: string; ammo: number; speed: number; patternLevel: number }> = {
  easy: { label: '简单', ammo: 7, speed: 0.82, patternLevel: 35 },
  normal: { label: '普通', ammo: 9, speed: 1, patternLevel: 25 },
  hard: { label: '困难', ammo: 12, speed: 1.24, patternLevel: 15 },
}
const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard']

const HUES: Array<Pick<SignatureDefinition, 'hue' | 'color' | 'darkColor'> & { name: string; short: string }> = [
  { hue: 'coral', name: '珊瑚红', short: '红', color: '#ef6967', darkColor: '#a93f47' },
  { hue: 'blue', name: '海洋蓝', short: '蓝', color: '#407fee', darkColor: '#2450ad' },
  { hue: 'cyan', name: '清水青', short: '青', color: '#35c4d6', darkColor: '#197c95' },
  { hue: 'violet', name: '葡萄紫', short: '紫', color: '#9a5ce0', darkColor: '#61349d' },
  { hue: 'lime', name: '青柠绿', short: '绿', color: '#7fc653', darkColor: '#478431' },
  { hue: 'amber', name: '蜜糖黄', short: '黄', color: '#f3b842', darkColor: '#a7751d' },
]
const SHAPES: Array<{ shape: BlockShape; name: string; short: string }> = [
  { shape: 'cube', name: '方块', short: '方' },
  { shape: 'round', name: '圆块', short: '圆' },
  { shape: 'triangle', name: '三角块', short: '角' },
  { shape: 'star', name: '五星块', short: '星' },
  { shape: 'cylinder', name: '圆柱块', short: '柱' },
]

const PLAIN_SIGNATURES: SignatureDefinition[] = SHAPES.flatMap((shape) => HUES.map((hue) => ({
  id: `${hue.hue}-${shape.shape}-plain`, hue: hue.hue, shape: shape.shape, pattern: 'plain',
  label: `${hue.name}${shape.name}`, shortLabel: `${hue.short}${shape.short}`, color: hue.color, darkColor: hue.darkColor,
})))
const PATTERN_SIGNATURES: SignatureDefinition[] = HUES.flatMap((hue, index) => (['black', 'white'] as const).map((pattern, patternIndex) => {
  const shape = SHAPES[(index + patternIndex * 2) % SHAPES.length]
  const patternName = pattern === 'black' ? '黑纹' : '白纹'
  return {
    id: `${hue.hue}-${shape.shape}-${pattern}`, hue: hue.hue, shape: shape.shape, pattern,
    label: `${hue.name}${patternName}${shape.name}`, shortLabel: `${hue.short}${pattern === 'black' ? '黑' : '白'}${shape.short}`,
    color: hue.color, darkColor: hue.darkColor,
  }
}))
const SIGNATURES: SignatureDefinition[] = [...PLAIN_SIGNATURES, ...PATTERN_SIGNATURES]

const SIGNATURE_MAP = new Map(SIGNATURES.map((signature) => [signature.id, signature]))

const DEFAULT_PROGRESS: ProgressState = {
  unlockedLevel: 1,
  currentLevel: 1,
  completedLevels: [],
  levelBestScores: {},
  coins: 0,
  gears: 0,
  slowLevel: 0,
  chargeLevel: 0,
  slotLevel: 0,
  reserveLevel: 0,
  rerolls: 1,
  universalLaunchers: 0,
  currentDifficulty: 'normal',
  completedVariants: [],
  energyUnlockedLevels: [],
  energy: MAX_ENERGY,
  energyUpdatedAt: new Date().toISOString(),
  bestScore: 0,
}

const LEVEL_CHAPTERS = [
  { name: '色彩启程', label: '辨认颜色与基础换装' },
  { name: '形状街区', label: '颜色与形状组合' },
  { name: '花纹工厂', label: '加入花纹和更宽战场' },
  { name: '纵深峡谷', label: '稀疏前排与逐列遮挡' },
  { name: '高速都市', label: '更快推进与资源取舍' },
  { name: '星际防线', label: '完整类型与终局挑战' },
] as const

export const BLOCK_DEFENSE_LEVELS: LevelDefinition[] = Array.from({ length: MAX_LEVEL }, (_, index) => {
  const level = index + 1
  const chapterIndex = Math.floor(index / 10)
  const stage = index % 10
  const chapter = LEVEL_CHAPTERS[chapterIndex]
  const lanes = level <= 5 ? Math.min(11, 3 + (level - 1) * 2) : 11
  const targetCount = level < 20
    ? Math.round(30 + (level - 1) * (115 / 18))
    : level <= 30
      ? Math.round(150 + (level - 20) * 5)
      : level <= 40
        ? Math.round(200 + (level - 30) * 10)
        : Math.min(400, Math.round(300 + (level - 40) * 12))
  const layerCount = Math.ceil(targetCount / lanes)
  return {
    level,
    chapter: chapter.name,
    name: `${chapter.name} ${stage + 1}`,
    seed: 17_029 + level * 7_919,
    lanes,
    targetCount,
    layerCount,
    startProgress: 38 + Math.min(8, chapterIndex * 1.2),
    layerGap: Math.max(2.15, 76 / Math.max(1, layerCount - 1)),
    // 相比早期版本约提升一倍，简单档仍留出观察时间，困难档会明显压迫防线。
    baseSpeed: 0.96 + Math.min(0.58, level * 0.0095),
    freeRerolls: level === 1 ? 3 : level <= 3 ? 1 : 0,
  }
})

const UPGRADES: UpgradeDefinition[] = [
  { id: 'slow', title: '缓速力场', detail: '每级减缓推进 3%，最高减缓 30%', icon: TimerReset, maxLevel: 10, coinBase: 120, gearBase: 1 },
  { id: 'charge', title: '快速充能', detail: '从 2.5 秒逐级缩短到 1 秒', icon: Gauge, maxLevel: 10, coinBase: 130, gearBase: 1 },
  { id: 'slot', title: '发射槽位', detail: '增加一台同时工作的发射器', icon: Crosshair, maxLevel: 2, coinBase: 420, gearBase: 5 },
  { id: 'reserve', title: '备用池扩建', detail: '初始 5 格，每级增加 1 格，最多 20 格', icon: Layers3, maxLevel: 15, coinBase: 190, gearBase: 2 },
]

function seededValue(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(seededValue(seed + index * 31) * (index + 1))
    const current = result[index]
    result[index] = result[target]
    result[target] = current
  }
  return result
}

function levelDefinition(level: number): LevelDefinition {
  return BLOCK_DEFENSE_LEVELS[Math.max(0, Math.min(MAX_LEVEL - 1, Math.floor(level) - 1))]
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'normal' || value === 'hard'
}

function variantKey(level: number, difficulty: Difficulty): string {
  return `${difficulty}:${level}`
}

function restoreEnergy(value: ProgressState, now = Date.now()): ProgressState {
  if (value.energy >= MAX_ENERGY) {
    return value.energy === MAX_ENERGY ? value : { ...value, energy: MAX_ENERGY, energyUpdatedAt: new Date(now).toISOString() }
  }
  const anchor = Date.parse(value.energyUpdatedAt)
  const safeAnchor = Number.isFinite(anchor) ? Math.min(anchor, now) : now
  const recovered = Math.floor((now - safeAnchor) / ENERGY_POINT_INTERVAL_MS)
  if (recovered <= 0) return value
  const energy = Math.min(MAX_ENERGY, value.energy + recovered)
  const energyUpdatedAt = energy >= MAX_ENERGY
    ? new Date(now).toISOString()
    : new Date(safeAnchor + recovered * ENERGY_POINT_INTERVAL_MS).toISOString()
  return { ...value, energy, energyUpdatedAt }
}

function normalizeProgress(value: Partial<ProgressState> | null | undefined): ProgressState {
  const unlockedLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(value?.unlockedLevel) || 1)))
  const completedLevels = Array.from(new Set((Array.isArray(value?.completedLevels) ? value.completedLevels : [])
    .map((level) => Math.floor(Number(level)))
    .filter((level) => level >= 1 && level <= MAX_LEVEL))).sort((left, right) => left - right)
  const rawBestScores = value?.levelBestScores && typeof value.levelBestScores === 'object' ? value.levelBestScores : {}
  const levelBestScores = Object.fromEntries(Object.entries(rawBestScores)
    .map(([level, score]) => [level.includes(':') ? level : `normal:${Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1)))}`, Math.max(0, Math.floor(Number(score) || 0))]))
  const hasVariantProgress = Array.isArray(value?.completedVariants)
  const rawCompletedVariants: unknown[] = hasVariantProgress ? value?.completedVariants ?? [] : []
  const completedVariants = Array.from(new Set([
    ...rawCompletedVariants.filter((item): item is string => typeof item === 'string' && /^(easy|normal|hard):(?:[1-9]|[1-5]\d|60)$/.test(item)),
    // 只有旧存档没有分难度字段时，才把历史通关记录迁移到普通模式。
    ...(hasVariantProgress ? [] : completedLevels.map((level) => `normal:${level}`)),
  ]))
  const currentDifficulty = isDifficulty(value?.currentDifficulty) ? value.currentDifficulty : 'normal'
  const legacyUnlockedVariants = (value as { energyUnlockedVariants?: unknown } | null | undefined)?.energyUnlockedVariants
  const energyUnlockedLevels = Array.from(new Set([
    ...(Array.isArray(value?.energyUnlockedLevels) ? value.energyUnlockedLevels : []),
    ...(Array.isArray(legacyUnlockedVariants) ? legacyUnlockedVariants.map((item) => typeof item === 'string' ? Number(item.split(':')[1]) : Number.NaN) : []),
    ...completedLevels,
  ].map((level) => Math.floor(Number(level))).filter((level) => level >= 1 && level <= MAX_LEVEL))).sort((left, right) => left - right)
  const normalized: ProgressState = {
    ...DEFAULT_PROGRESS,
    unlockedLevel,
    currentLevel: Math.max(1, Math.min(unlockedLevel, Math.floor(Number(value?.currentLevel) || unlockedLevel))),
    completedLevels,
    levelBestScores,
    coins: Math.max(0, Math.floor(Number(value?.coins) || 0)),
    gears: Math.max(0, Math.floor(Number(value?.gears) || 0)),
    slowLevel: Math.max(0, Math.min(10, Math.floor(Number(value?.slowLevel) || Math.floor(Number((value as { ammoLevel?: number } | undefined)?.ammoLevel) / 3) || 0))),
    chargeLevel: Math.max(0, Math.min(10, Math.floor(Number(value?.chargeLevel) || 0))),
    slotLevel: Math.max(0, Math.min(2, Math.floor(Number(value?.slotLevel) || 0))),
    reserveLevel: Math.max(0, Math.min(15, Math.floor(Number(value?.reserveLevel) || 0))),
    rerolls: Math.max(0, Math.floor(Number(value?.rerolls) || 0)),
    universalLaunchers: Math.max(0, Math.floor(Number(value?.universalLaunchers) || 0)),
    currentDifficulty,
    completedVariants,
    energyUnlockedLevels,
    energy: Math.max(0, Math.min(MAX_ENERGY, Math.floor(Number(value?.energy ?? MAX_ENERGY)))),
    energyUpdatedAt: typeof value?.energyUpdatedAt === 'string' ? value.energyUpdatedAt : new Date().toISOString(),
    bestScore: Math.max(0, Math.floor(Number(value?.bestScore) || 0)),
  }
  return restoreEnergy(normalized)
}

function storageKey(playerId: string): string {
  return `${STORAGE_KEY_PREFIX}:${playerId}`
}

function unlockLevelWithEnergy(progress: ProgressState, level: number): { progress: ProgressState; allowed: boolean; spent: boolean } {
  const restored = restoreEnergy(progress)
  if (restored.energyUnlockedLevels.includes(level)) return { progress: restored, allowed: true, spent: false }
  if (restored.energy < LEVEL_ENERGY_COST) return { progress: restored, allowed: false, spent: false }
  return {
    progress: {
      ...restored,
      energy: restored.energy - LEVEL_ENERGY_COST,
      energyUpdatedAt: restored.energy >= MAX_ENERGY ? new Date().toISOString() : restored.energyUpdatedAt,
      energyUnlockedLevels: [...restored.energyUnlockedLevels, level].sort((left, right) => left - right),
    },
    allowed: true,
    spent: true,
  }
}

function loadProgress(playerId: string): ProgressSnapshot {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(playerId)) ?? '{}') as Partial<ProgressSnapshot>
    const normalized = normalizeProgress(parsed.progress)
    const access = unlockLevelWithEnergy(normalized, normalized.currentLevel)
    return {
      progress: access.progress,
      updatedAt: access.spent ? new Date().toISOString() : typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    }
  } catch {
    const normalized = normalizeProgress(DEFAULT_PROGRESS)
    return { progress: unlockLevelWithEnergy(normalized, 1).progress, updatedAt: new Date().toISOString() }
  }
}

function ammoCapacity(difficulty: Difficulty): number {
  return DIFFICULTIES[difficulty].ammo
}

function chargeDuration(progress: ProgressState): number {
  return Math.max(1000, 2500 - progress.chargeLevel * 150)
}

function activeSlotCount(progress: ProgressState): number {
  return 2 + Math.min(2, progress.slotLevel)
}

function reserveSlotCount(progress: ProgressState): number {
  return 5 + Math.min(15, progress.reserveLevel)
}

function catalogForLevel(level: number, difficulty: Difficulty): string[] {
  const unlockedShapeCount = Math.min(SHAPES.length, 1 + Math.floor((level - 1) / 4))
  const plainCandidates = PLAIN_SIGNATURES.filter((signature) => SHAPES.findIndex((shape) => shape.shape === signature.shape) < unlockedShapeCount)
  const plainCount = Math.min(plainCandidates.length, 3 + Math.floor((level - 1) / 2))
  const plain = plainCandidates.slice(0, Math.max(3, plainCount))
  const patternStart = DIFFICULTIES[difficulty].patternLevel
  const patternCount = level < patternStart ? 0 : Math.min(PATTERN_SIGNATURES.length, 2 + Math.floor((level - patternStart) / 3))
  return [...plain, ...PATTERN_SIGNATURES.slice(0, patternCount)].map((signature) => signature.id)
}

function createLayers(level: number, lanes: number, catalog: string[]): BlockLayer[] {
  const definition = levelDefinition(level)
  const layers: BlockLayer[] = []
  let remaining = definition.targetCount
  for (let layerIndex = 0; layerIndex < definition.layerCount; layerIndex += 1) {
    const blocks: FieldBlock[] = []
    const laneOrder = seededShuffle(Array.from({ length: lanes }, (_, lane) => lane), definition.seed + layerIndex * 67)
    const layerSize = Math.min(lanes, remaining)
    for (const lane of laneOrder.slice(0, layerSize)) {
      const signatureIndex = Math.floor(seededValue(definition.seed * 3 + layerIndex * 41 + lane * 19) * catalog.length)
      blocks.push({
        id: `block-${level}-${layerIndex}-${lane}`,
        signatureId: catalog[Math.min(catalog.length - 1, signatureIndex)],
        lane,
      })
    }
    layers.push({
      id: `layer-${level}-${layerIndex}`,
      progress: definition.startProgress - layerIndex * definition.layerGap,
      blocks,
    })
    remaining -= blocks.length
  }
  return layers
}

function signatureStyle(signatureId: string): CSSProperties {
  const signature = SIGNATURE_MAP.get(signatureId) ?? SIGNATURES[0]
  return {
    '--mower-color': signature.color,
    '--mower-dark': signature.darkColor,
  } as CSSProperties
}

function exposedTargets(layers: BlockLayer[], depth: number): Array<{ layerId: string; block: FieldBlock; progress: number }> {
  const result: Array<{ layerId: string; block: FieldBlock; progress: number }> = []
  const sorted = [...layers].filter((layer) => layer.blocks.length > 0).sort((left, right) => right.progress - left.progress)
  const lanes = new Set(sorted.flatMap((layer) => layer.blocks.map((block) => block.lane)))
  for (const lane of lanes) {
    let visible = 0
    for (const layer of sorted) {
      const block = layer.blocks.find((candidate) => candidate.lane === lane)
      if (!block) continue
      result.push({ layerId: layer.id, block, progress: layer.progress })
      visible += 1
      if (visible >= depth) break
    }
  }
  return result
}

function firstUrgentSignature(layers: BlockLayer[], represented: Set<string>): string | null {
  return exposedTargets(layers, 1).find(({ block }) => !represented.has(block.signatureId))?.block.signatureId ?? null
}

function chooseOfferSignature(
  catalog: string[],
  drawIndex: number,
  level: number,
  layers: BlockLayer[],
  active: Array<Launcher | null>,
  reserve: Launcher[],
): string {
  const cycle = Math.floor(drawIndex / catalog.length)
  const position = drawIndex % catalog.length
  const represented = new Set([
    ...active.flatMap((launcher) => launcher && launcher.ammo > 0 ? [launcher.signatureId] : []),
    ...reserve.flatMap((launcher) => launcher.ammo > 0 ? [launcher.signatureId] : []),
  ])
  const urgent = firstUrgentSignature(layers, represented)
  const bag = seededShuffle(catalog, level * 101 + cycle * 997)
  if (urgent) {
    // 不在第一次抽取时立刻投喂答案，但最多第三次一定补出当前紧缺类型。
    const guaranteePosition = Math.min(2, catalog.length - 1)
    if (position >= guaranteePosition) return urgent
    if (position === 0 && bag[0] === urgent && bag.length > 1) {
      const delayed = bag.shift() as string
      bag.push(delayed)
    }
  }
  return bag[position] ?? catalog[0]
}

function createLauncher(signatureId: string, id: string, progress: ProgressState, difficulty: Difficulty, needsCharge = true): Launcher {
  const capacity = ammoCapacity(difficulty)
  return {
    id,
    signatureId,
    ammo: capacity,
    capacity,
    readyMs: needsCharge ? chargeDuration(progress) : 0,
    cooldownMs: 0,
    idle: false,
  }
}

function createRound(level: number, progress: ProgressState, difficulty: Difficulty = progress.currentDifficulty): RoundState {
  const definition = levelDefinition(level)
  const lanes = definition.lanes
  const catalog = catalogForLevel(level, difficulty)
  const layers = createLayers(level, lanes, catalog)
  const frontSignatures = Array.from(new Set(exposedTargets(layers, 1).map(({ block }) => block.signatureId)))
  const active: Array<Launcher | null> = Array.from({ length: activeSlotCount(progress) }, (_, index) => {
    const signatureId = frontSignatures[index % Math.max(1, frontSignatures.length)] ?? catalog[index % catalog.length]
    return createLauncher(signatureId, `active-${level}-${index}`, progress, difficulty, true)
  })
  const reserve: Launcher[] = []
  let drawIndex = active.length
  for (let index = 0; index < reserveSlotCount(progress); index += 1) {
    const signatureId = chooseOfferSignature(catalog, drawIndex, level, layers, active, reserve)
    reserve.push(createLauncher(signatureId, `reserve-${level}-${drawIndex}`, progress, difficulty, false))
    drawIndex += 1
  }
  const total = layers.reduce((sum, layer) => sum + layer.blocks.length, 0)
  return {
    id: `${level}-${Date.now()}`,
    level,
    difficulty,
    lanes,
    catalog,
    layers,
    active,
    reserve,
    selectedActive: 0,
    selectedReserve: 0,
    drawIndex,
    freeRerolls: definition.freeRerolls,
    deadlockMs: 0,
    penetrationUses: 0,
    penetratingSlots: [],
    discardUses: 0,
    shields: MAX_SHIELDS,
    destroyed: 0,
    total,
    score: 0,
    elapsedMs: 0,
    phase: 'playing',
    message: level <= 3 ? '先观察最前层，再把需要的发射器装入亮起的槽位' : '前层会遮住后层，合理换装才能守住防线',
    effects: [],
  }
}

function advanceSpeed(level: number, difficulty: Difficulty, progress: ProgressState): number {
  const slowMultiplier = Math.max(0.7, 1 - progress.slowLevel * 0.03)
  return levelDefinition(level).baseSpeed * DIFFICULTIES[difficulty].speed * slowMultiplier
}

function blockedSignature(
  layers: BlockLayer[],
  active: Array<Launcher | null>,
  reserve: Launcher[],
  penetratingSlots: number[],
): string | null {
  const front = exposedTargets(layers, 1)
  const frontTypes = new Set(front.map(({ block }) => block.signatureId))
  const reserveCanHitFront = reserve.some((launcher) => launcher.ammo > 0 && frontTypes.has(launcher.signatureId))
  if (reserveCanHitFront) return null
  const activeCanFire = active.some((launcher, index) => {
    if (!launcher || launcher.ammo <= 0) return false
    const accessible = exposedTargets(layers, penetratingSlots.includes(index) ? 2 : 1)
    return accessible.some(({ block }) => block.signatureId === launcher.signatureId)
  })
  return activeCanFire ? null : front[0]?.block.signatureId ?? null
}

function findTarget(layers: BlockLayer[], signatureId: string, launcherIndex: number, launcherCount: number, laneCount: number, depth: number): { layerId: string; block: FieldBlock; progress: number } | null {
  const accessible = exposedTargets(layers, depth)
  const launcherLane = launcherCount <= 1 ? 0.5 : launcherIndex / (launcherCount - 1)
  return accessible
    .filter(({ block }) => block.signatureId === signatureId)
    .sort((left, right) => {
      const progressDifference = right.progress - left.progress
      if (Math.abs(progressDifference) > 0.01) return progressDifference
      return Math.abs(left.block.lane / Math.max(1, laneCount - 1) - launcherLane)
        - Math.abs(right.block.lane / Math.max(1, laneCount - 1) - launcherLane)
    })[0] ?? null
}

function stepRound(previous: RoundState, progress: ProgressState): RoundState {
  if (previous.phase !== 'playing') return previous

  const speed = advanceSpeed(previous.level, previous.difficulty, progress)
  let layers = previous.layers.map((layer) => ({ ...layer, progress: layer.progress + speed * (TICK_MS / 1000) }))
  let shields = previous.shields
  let message = previous.message
  const breached = layers.filter((layer) => layer.progress >= 100 && layer.blocks.length > 0)
  if (breached.length > 0) {
    shields = Math.max(0, shields - breached.length)
    const breachedIds = new Set(breached.map((layer) => layer.id))
    layers = layers.filter((layer) => !breachedIds.has(layer.id))
    message = shields > 0 ? `有 ${breached.length} 层撞到防线，护盾还剩 ${shields} 格` : '防线失守了，调整发射器顺序再试一次'
  }

  let active = previous.active.map((launcher) => launcher ? {
    ...launcher,
    readyMs: Math.max(0, launcher.readyMs - TICK_MS),
    cooldownMs: Math.max(0, launcher.cooldownMs - TICK_MS),
    idle: false,
  } : null)
  let reserve = previous.reserve
  let drawIndex = previous.drawIndex
  let deadlockMs = previous.deadlockMs
  let destroyed = previous.destroyed
  let score = previous.score
  let effects = previous.effects
    .map((effect) => ({ ...effect, ttl: effect.ttl - TICK_MS }))
    .filter((effect) => effect.ttl > 0)

  active = active.map((launcher, launcherIndex) => {
    if (!launcher || launcher.readyMs > 0 || launcher.cooldownMs > 0 || launcher.ammo <= 0) return launcher
    const depth = previous.penetratingSlots.includes(launcherIndex) ? 2 : 1
    const target = findTarget(layers, launcher.signatureId, launcherIndex, active.length, previous.lanes, depth)
    if (!target) return { ...launcher, idle: true }
    layers = layers.map((layer) => layer.id === target.layerId
      ? { ...layer, blocks: layer.blocks.filter((block) => block.id !== target.block.id) }
      : layer)
    const signature = SIGNATURE_MAP.get(launcher.signatureId) ?? SIGNATURES[0]
    effects = [...effects, {
      id: `shot-${target.block.id}-${previous.elapsedMs}-${launcherIndex}`,
      lane: target.block.lane,
      progress: target.progress,
      color: signature.color,
      ttl: 360,
    }]
    destroyed += 1
    score += 10 + previous.level * 2
    const ammo = launcher.ammo - 1
    if (ammo === 0) message = `${signature.shortLabel}发射器已耗尽，选择备用池进行换装`
    return { ...launcher, ammo, cooldownMs: FIRE_INTERVAL_MS, idle: false }
  })

  const blocked = blockedSignature(layers, active, reserve, previous.penetratingSlots)
  if (blocked) {
    deadlockMs += TICK_MS
    if (deadlockMs >= DEADLOCK_RESCUE_MS && reserve.length > 0) {
      const rescueIndex = Math.min(previous.selectedReserve, reserve.length - 1)
      reserve = [...reserve]
      reserve[rescueIndex] = createLauncher(blocked, `rescue-${previous.level}-${previous.elapsedMs}`, progress, previous.difficulty, false)
      drawIndex += 1
      deadlockMs = 0
      const rescued = SIGNATURE_MAP.get(blocked) ?? SIGNATURES[0]
      message = `补给站发现无解局面，已送来 ${rescued.shortLabel} 发射器`
    }
  } else {
    deadlockMs = 0
  }

  layers = layers.filter((layer) => layer.blocks.length > 0)
  const phase: GamePhase = shields <= 0 ? 'lost' : layers.length === 0 ? 'won' : 'playing'
  if (phase === 'won') message = '全部方块清理完成，防线守住了！'

  return {
    ...previous,
    layers,
    active,
    reserve,
    drawIndex,
    deadlockMs,
    shields,
    destroyed,
    score,
    elapsedMs: previous.elapsedMs + TICK_MS,
    phase,
    message,
    effects,
  }
}

function upgradeLevel(progress: ProgressState, id: UpgradeDefinition['id']): number {
  if (id === 'slow') return progress.slowLevel
  if (id === 'charge') return progress.chargeLevel
  if (id === 'slot') return progress.slotLevel
  return progress.reserveLevel
}

function upgradeCost(upgrade: UpgradeDefinition, currentLevel: number): { coins: number; gears: number } {
  return {
    coins: Math.round(upgrade.coinBase * Math.pow(1.48, currentLevel)),
    gears: Math.max(upgrade.gearBase, Math.round(upgrade.gearBase * Math.pow(1.32, currentLevel))),
  }
}

function levelName(level: number): string {
  return levelDefinition(level).name
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`
}

interface DefenseSceneState {
  layers: BlockLayer[]
  effects: ShotEffect[]
  targetable: Set<string>
  lanes: number
}

const MAX_SCENE_BLOCKS = 440
const MAX_SCENE_EYES = MAX_SCENE_BLOCKS * 4
const MAX_SCENE_EFFECTS = 24

function scenePosition(lane: number, lanes: number, progress: number): THREE.Vector3 {
  return new THREE.Vector3(
    (lane - (lanes - 1) / 2) * 0.78,
    0.47,
    5.25 - (100 - progress) * 0.14,
  )
}

function BlockDefenseScene({ layers, effects, targetable, lanes }: DefenseSceneState) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<DefenseSceneState>({ layers, effects, targetable, lanes })
  stateRef.current = { layers, effects, targetable, lanes }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      mount.dataset.state = 'unavailable'
      return undefined
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#20262b')
    scene.fog = new THREE.Fog('#20262b', 21, 39)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80)
    const lookTarget = new THREE.Vector3(0, 0.15, 0.35)

    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.replaceChildren(renderer.domElement)
    renderer.domElement.setAttribute('aria-hidden', 'true')

    scene.add(new THREE.HemisphereLight(0xeef8ff, 0x11151e, 2.25))
    const keyLight = new THREE.DirectionalLight(0xffffff, 4.1)
    keyLight.position.set(-5, 12, 10)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    scene.add(keyLight)
    const cyanLight = new THREE.DirectionalLight(0x55d9ff, 1.6)
    cyanLight.position.set(8, 5, -7)
    scene.add(cyanLight)
    const violetLight = new THREE.PointLight(0x9a5ce0, 2.2, 18)
    violetLight.position.set(-6, 3, 0)
    scene.add(violetLight)

    const board = new THREE.Mesh(
      new RoundedBoxGeometry(11.3, 0.42, 21.8, 5, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x343a40, roughness: 0.8, metalness: 0.18 }),
    )
    board.position.set(0, -0.28, -4.3)
    board.receiveShadow = true
    scene.add(board)

    const boardInset = new THREE.Mesh(
      new THREE.PlaneGeometry(10.7, 21.2),
      new THREE.MeshStandardMaterial({ color: 0x181d22, roughness: 0.92, metalness: 0.08 }),
    )
    boardInset.rotation.x = -Math.PI / 2
    boardInset.position.set(0, -0.055, -4.3)
    boardInset.receiveShadow = true
    scene.add(boardInset)

    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x73808c, roughness: 0.35, metalness: 0.72 })
    const railGeometry = new RoundedBoxGeometry(0.18, 0.28, 21.5, 3, 0.08)
    const leftRail = new THREE.Mesh(railGeometry, railMaterial)
    leftRail.position.set(-5.48, 0.02, -4.3)
    leftRail.castShadow = true
    const rightRail = leftRail.clone()
    rightRail.position.x = 5.48
    scene.add(leftRail, rightRail)

    const defenseMaterial = new THREE.MeshStandardMaterial({ color: 0xeef675, emissive: 0x95aa2b, emissiveIntensity: 2.2 })
    const defenseLine = new THREE.Mesh(new RoundedBoxGeometry(10.7, 0.12, 0.12, 3, 0.04), defenseMaterial)
    defenseLine.position.set(0, 0.18, 5.55)
    scene.add(defenseLine)

    const cubeGeometry = new RoundedBoxGeometry(0.69, 0.73, 0.69, 4, 0.12)
    const roundGeometry = new THREE.SphereGeometry(0.43, 16, 12)
    const triangleGeometry = new THREE.ConeGeometry(0.5, 0.72, 3, 1)
    const cylinderGeometry = new THREE.CylinderGeometry(0.39, 0.39, 0.7, 18)
    const starShape = new THREE.Shape()
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 === 0 ? 0.48 : 0.22
      const angle = -Math.PI / 2 + point * Math.PI / 5
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (point === 0) starShape.moveTo(x, y)
      else starShape.lineTo(x, y)
    }
    starShape.closePath()
    const starGeometry = new THREE.ExtrudeGeometry(starShape, { depth: 0.5, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.055, bevelThickness: 0.055 })
    starGeometry.center()
    starGeometry.rotateX(-Math.PI / 2)
    const shapeGeometry: Record<BlockShape, THREE.BufferGeometry> = {
      cube: cubeGeometry,
      round: roundGeometry,
      triangle: triangleGeometry,
      star: starGeometry,
      cylinder: cylinderGeometry,
    }
    const bodyMeshes = new Map<string, THREE.InstancedMesh>()
    const patternMeshes = new Map<string, THREE.InstancedMesh>()
    const patternMask = document.createElement('canvas')
    patternMask.width = 64
    patternMask.height = 64
    const patternContext = patternMask.getContext('2d')
    if (patternContext) {
      patternContext.fillStyle = '#000'
      patternContext.fillRect(0, 0, 64, 64)
      patternContext.strokeStyle = '#fff'
      patternContext.lineWidth = 11
      for (let offset = -64; offset <= 128; offset += 25) {
        patternContext.beginPath()
        patternContext.moveTo(offset, 64)
        patternContext.lineTo(offset + 64, 0)
        patternContext.stroke()
      }
    }
    const patternTexture = new THREE.CanvasTexture(patternMask)
    patternTexture.wrapS = THREE.RepeatWrapping
    patternTexture.wrapT = THREE.RepeatWrapping
    patternTexture.repeat.set(1.2, 1.2)
    SIGNATURES.forEach((signature) => {
      const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.28,
        metalness: 0.04,
        clearcoat: 0.48,
        clearcoatRoughness: 0.25,
      })
      const mesh = new THREE.InstancedMesh(shapeGeometry[signature.shape], material, MAX_SCENE_BLOCKS)
      mesh.count = 0
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      bodyMeshes.set(signature.id, mesh)
      scene.add(mesh)
      if (signature.pattern !== 'plain') {
        const patternMaterial = new THREE.MeshBasicMaterial({
          color: signature.pattern === 'black' ? 0x11151a : 0xffffff,
          alphaMap: patternTexture,
          alphaTest: 0.18,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        })
        const patternMesh = new THREE.InstancedMesh(shapeGeometry[signature.shape], patternMaterial, MAX_SCENE_BLOCKS)
        patternMesh.count = 0
        patternMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        patternMesh.frustumCulled = false
        patternMeshes.set(signature.id, patternMesh)
        scene.add(patternMesh)
      }
    })

    const darkMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.08, clearcoat: 0.25 })
    const darkBlocks = new THREE.InstancedMesh(cubeGeometry, darkMaterial, MAX_SCENE_BLOCKS)
    darkBlocks.count = 0
    darkBlocks.castShadow = true
    darkBlocks.receiveShadow = true
    darkBlocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    darkBlocks.frustumCulled = false
    scene.add(darkBlocks)

    const eyeGeometry = new THREE.SphereGeometry(1, 10, 8)
    const eyeWhites = new THREE.InstancedMesh(eyeGeometry, new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.22 }), MAX_SCENE_EYES)
    const eyePupils = new THREE.InstancedMesh(eyeGeometry, new THREE.MeshStandardMaterial({ color: 0x17212b, roughness: 0.45 }), MAX_SCENE_EYES)
    eyeWhites.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    eyePupils.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    eyeWhites.frustumCulled = false
    eyePupils.frustumCulled = false
    scene.add(eyeWhites, eyePupils)

    const impactMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.15, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
      MAX_SCENE_EFFECTS,
    )
    impactMesh.count = 0
    impactMesh.frustumCulled = false
    scene.add(impactMesh)

    const beamPositions = new Float32Array(MAX_SCENE_EFFECTS * 2 * 3)
    const beamColors = new Float32Array(MAX_SCENE_EFFECTS * 2 * 3)
    const beamGeometry = new THREE.BufferGeometry()
    beamGeometry.setAttribute('position', new THREE.BufferAttribute(beamPositions, 3))
    beamGeometry.setAttribute('color', new THREE.BufferAttribute(beamColors, 3))
    const beams = new THREE.LineSegments(beamGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }))
    beams.frustumCulled = false
    scene.add(beams)

    const dummy = new THREE.Object3D()
    const displayProgress = new Map<string, number>()
    const white = new THREE.Color('#ffffff')
    const coveredTint = new THREE.Color('#111721')
    const darkTints = [new THREE.Color('#20252b'), new THREE.Color('#272d34'), new THREE.Color('#181d22')]

    const framePositions = () => {
      const values: Array<{ lane: number; row: number }> = []
      const currentLanes = stateRef.current.lanes
      for (let row = 0; row < 26; row += 1) {
        for (let lane = -3; lane < currentLanes + 3; lane += 1) {
          const outside = lane < 0 || lane >= currentLanes
          if (outside) values.push({ lane, row })
        }
      }
      return values
    }

    const setEye = (index: number, position: THREE.Vector3, xOffset: number, pupil = false) => {
      dummy.position.copy(position)
      dummy.position.x += xOffset
      dummy.position.y += pupil ? 0.105 : 0.1
      dummy.position.z += pupil ? 0.375 : 0.345
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(pupil ? 0.033 : 0.073, pupil ? 0.042 : 0.085, pupil ? 0.024 : 0.04)
      dummy.updateMatrix()
      ;(pupil ? eyePupils : eyeWhites).setMatrixAt(index, dummy.matrix)
    }

    const updateInstances = (elapsed: number, delta: number) => {
      const current = stateRef.current
      const blocks = current.layers.flatMap((layer) => layer.blocks.map((block) => ({ block, layer })))
      const buckets = new Map<string, typeof blocks>()
      blocks.forEach((entry) => {
        const bucket = buckets.get(entry.block.signatureId) ?? []
        bucket.push(entry)
        buckets.set(entry.block.signatureId, bucket)
      })

      let eyeIndex = 0
      bodyMeshes.forEach((mesh, signatureId) => {
        const signature = SIGNATURE_MAP.get(signatureId) ?? SIGNATURES[0]
        const entries = buckets.get(signatureId) ?? []
        mesh.count = Math.min(entries.length, MAX_SCENE_BLOCKS)
        entries.slice(0, MAX_SCENE_BLOCKS).forEach(({ block, layer }, index) => {
          const previous = displayProgress.get(block.id) ?? layer.progress - 1.2
          const shown = previous + (layer.progress - previous) * Math.min(1, delta * 9)
          displayProgress.set(block.id, shown)
          const position = scenePosition(block.lane, current.lanes, shown)
          position.y += Math.sin(elapsed * 1.8 + block.lane * 0.7 + shown) * 0.012
          dummy.position.copy(position)
          dummy.rotation.set(0, signature.shape === 'triangle' ? Math.PI : signature.shape === 'star' ? Math.PI / 10 : 0, 0)
          dummy.scale.setScalar(current.targetable.has(block.id) ? 1 : 0.965)
          dummy.updateMatrix()
          mesh.setMatrixAt(index, dummy.matrix)
          const patternMesh = patternMeshes.get(signatureId)
          if (patternMesh) {
            dummy.scale.multiplyScalar(1.018)
            dummy.updateMatrix()
            patternMesh.setMatrixAt(index, dummy.matrix)
          }
          const instanceColor = new THREE.Color(signature.color)
          if (!current.targetable.has(block.id)) instanceColor.lerp(coveredTint, 0.22)
          else instanceColor.lerp(white, 0.045)
          mesh.setColorAt(index, instanceColor)
          if (eyeIndex + 1 < MAX_SCENE_EYES) {
            setEye(eyeIndex, position, -0.13)
            setEye(eyeIndex, position, -0.13, true)
            eyeIndex += 1
            setEye(eyeIndex, position, 0.13)
            setEye(eyeIndex, position, 0.13, true)
            eyeIndex += 1
          }
        })
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        const patternMesh = patternMeshes.get(signatureId)
        if (patternMesh) {
          patternMesh.count = mesh.count
          patternMesh.instanceMatrix.needsUpdate = true
        }
      })

      const frame = framePositions()
      darkBlocks.count = Math.min(frame.length, MAX_SCENE_BLOCKS)
      frame.slice(0, MAX_SCENE_BLOCKS).forEach(({ lane, row }, index) => {
        const position = new THREE.Vector3(
          (lane - (current.lanes - 1) / 2) * 0.78,
          0.43,
          -13.55 + row * 0.76,
        )
        dummy.position.copy(position)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(0.96)
        dummy.updateMatrix()
        darkBlocks.setMatrixAt(index, dummy.matrix)
        darkBlocks.setColorAt(index, darkTints[(row + lane + 12) % darkTints.length])
        if (eyeIndex + 1 < MAX_SCENE_EYES) {
          setEye(eyeIndex, position, -0.13)
          setEye(eyeIndex, position, -0.13, true)
          eyeIndex += 1
          setEye(eyeIndex, position, 0.13)
          setEye(eyeIndex, position, 0.13, true)
          eyeIndex += 1
        }
      })
      darkBlocks.instanceMatrix.needsUpdate = true
      if (darkBlocks.instanceColor) darkBlocks.instanceColor.needsUpdate = true
      eyeWhites.count = eyeIndex
      eyePupils.count = eyeIndex
      eyeWhites.instanceMatrix.needsUpdate = true
      eyePupils.instanceMatrix.needsUpdate = true

      const liveIds = new Set(blocks.map(({ block }) => block.id))
      displayProgress.forEach((_, id) => { if (!liveIds.has(id)) displayProgress.delete(id) })

      const visibleEffects = current.effects.slice(0, MAX_SCENE_EFFECTS)
      impactMesh.count = visibleEffects.length
      visibleEffects.forEach((effect, index) => {
        const target = scenePosition(effect.lane, current.lanes, effect.progress)
        const pulse = 0.7 + Math.sin((1 - effect.ttl / 360) * Math.PI) * 1.9
        dummy.position.copy(target)
        dummy.position.y += 0.12
        dummy.rotation.set(elapsed * 5, elapsed * 3, 0)
        dummy.scale.setScalar(pulse)
        dummy.updateMatrix()
        impactMesh.setMatrixAt(index, dummy.matrix)
        impactMesh.setColorAt(index, new THREE.Color(effect.color))
        const origin = scenePosition(effect.lane, current.lanes, 102)
        origin.y = 0.4
        const color = new THREE.Color(effect.color)
        const offset = index * 6
        beamPositions.set([origin.x, origin.y, origin.z, target.x, target.y, target.z], offset)
        beamColors.set([color.r, color.g, color.b, color.r, color.g, color.b], offset)
      })
      impactMesh.instanceMatrix.needsUpdate = true
      if (impactMesh.instanceColor) impactMesh.instanceColor.needsUpdate = true
      beamGeometry.setDrawRange(0, visibleEffects.length * 2)
      ;(beamGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      ;(beamGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
    }

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      const portrait = width / height < 0.86
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, portrait ? 1.35 : 1.7))
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.fov = portrait ? 44 : 34
      camera.position.set(portrait ? 5.5 : 7.6, portrait ? 15.3 : 12.2, portrait ? 15.8 : 13.6)
      camera.lookAt(lookTarget)
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()

    let animationFrame = 0
    let previousTime = performance.now()
    const render = (time: number) => {
      const delta = Math.min(0.05, Math.max(0.001, (time - previousTime) / 1000))
      previousTime = time
      updateInstances(time / 1000, delta)
      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(render)
    }
    animationFrame = window.requestAnimationFrame(render)
    mount.dataset.state = 'ready'

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
        materials.forEach((material) => material.dispose())
      })
      renderer.dispose()
      patternTexture.dispose()
      mount.replaceChildren()
    }
  }, [])

  return <div className="mower-v3-scene" ref={mountRef} aria-label="立体彩块战场" />
}

function LauncherFace({ launcher, compact = false }: { launcher: Launcher; compact?: boolean }) {
  const signature = SIGNATURE_MAP.get(launcher.signatureId) ?? SIGNATURES[0]
  return (
    <>
      <span className={`mower-launcher-core shape-${signature.shape} pattern-${signature.pattern}`} style={signatureStyle(signature.id)} aria-hidden="true">
        <span className="mower-launcher-eye" />
      </span>
      <span className="mower-launcher-copy">
        <strong>{signature.shortLabel}</strong>
        <small>{launcher.ammo}/{launcher.capacity}{compact ? '' : ' 发'}</small>
      </span>
    </>
  )
}

type TvSlotAction = { kind: 'install'; reserveIndex: number } | { kind: 'discard' }
type DragSource = { kind: 'reserve' | 'active'; index: number }
interface DragGesture extends DragSource {
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
}

export function BlockMowerGame({ onClose, playerId }: { onClose: () => void; playerId: string }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const rewardKeyRef = useRef<string | null>(null)
  const initialSnapshotRef = useRef<ProgressSnapshot>(loadProgress(playerId))
  const progressRef = useRef<ProgressState>(initialSnapshotRef.current.progress)
  const snapshotRef = useRef<ProgressSnapshot>(initialSnapshotRef.current)
  const syncTimerRef = useRef<number | null>(null)
  const dragGestureRef = useRef<DragGesture | null>(null)
  const suppressClickRef = useRef(false)
  const [progress, setProgress] = useState(progressRef.current)
  const [round, setRound] = useState(() => createRound(progressRef.current.currentLevel, progressRef.current, progressRef.current.currentDifficulty))
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(progressRef.current.currentDifficulty)
  const [paused, setPaused] = useState(false)
  const [workshopOpen, setWorkshopOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [levelSelectOpen, setLevelSelectOpen] = useState(false)
  const [universalTarget, setUniversalTarget] = useState<number | null>(null)
  const [tvSlotAction, setTvSlotAction] = useState<TvSlotAction | null>(null)
  const [dragGesture, setDragGesture] = useState<DragGesture | null>(null)
  const [levelNotice, setLevelNotice] = useState('')
  const [syncState, setSyncState] = useState<'syncing' | 'synced' | 'offline'>('syncing')

  const persistProgress = useCallback((nextValue: ProgressState, sync = true) => {
    const next = normalizeProgress(nextValue)
    const updatedAt = new Date().toISOString()
    const snapshot = { progress: next, updatedAt }
    progressRef.current = next
    snapshotRef.current = snapshot
    setProgress(next)
    try { window.localStorage.setItem(storageKey(playerId), JSON.stringify(snapshot)) } catch { /* 本地存储不可用时只影响进度保留 */ }
    if (!sync) return
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current)
    setSyncState('syncing')
    syncTimerRef.current = window.setTimeout(() => {
      void saveGameProfileApi('block-defense', next, next.bestScore, updatedAt)
        .then(() => setSyncState('synced'))
        .catch(() => setSyncState('offline'))
    }, 450)
  }, [playerId])

  const updateProgress = useCallback((updater: (current: ProgressState) => ProgressState) => {
    persistProgress(updater(progressRef.current))
  }, [persistProgress])

  useEffect(() => {
    // 首次进入也要立即写入本地，避免离线关闭时丢失首关体力解锁状态。
    try { window.localStorage.setItem(storageKey(playerId), JSON.stringify(snapshotRef.current)) } catch { /* 本地存储不可用时继续使用内存进度 */ }
    shellRef.current?.focus({ preventScroll: true })
  }, [playerId])

  useEffect(() => {
    let cancelled = false
    const local = snapshotRef.current
    setSyncState('syncing')
    void gameProfileApi<Partial<ProgressState>>('block-defense').then((remote) => {
      if (cancelled) return
      const hasRemoteProgress = remote.progress && Object.keys(remote.progress).length > 0
      const remoteUpdatedAt = remote.clientUpdatedAt ?? remote.updatedAt ?? new Date(0).toISOString()
      if (hasRemoteProgress && Date.parse(remoteUpdatedAt) >= Date.parse(local.updatedAt)) {
        const normalized = normalizeProgress({ ...remote.progress, bestScore: Math.max(Number(remote.progress.bestScore) || 0, remote.bestScore) })
        const access = unlockLevelWithEnergy(normalized, normalized.currentLevel)
        const next = access.progress
        const snapshot = { progress: next, updatedAt: access.spent ? new Date().toISOString() : remoteUpdatedAt }
        progressRef.current = next
        snapshotRef.current = snapshot
        setProgress(next)
        try { window.localStorage.setItem(storageKey(playerId), JSON.stringify(snapshot)) } catch { /* 本地缓存不可用时继续使用服务端副本 */ }
        rewardKeyRef.current = null
        setSelectedDifficulty(next.currentDifficulty)
        setRound(createRound(next.currentLevel, next, next.currentDifficulty))
        setSyncState('synced')
        if (access.spent) return saveGameProfileApi('block-defense', next, next.bestScore, snapshot.updatedAt).then(() => undefined)
        return
      }
      return saveGameProfileApi('block-defense', local.progress, local.progress.bestScore, local.updatedAt)
        .then(() => { if (!cancelled) setSyncState('synced') })
    }).catch(() => {
      if (!cancelled) setSyncState('offline')
    })
    return () => { cancelled = true }
  }, [playerId])

  useEffect(() => () => {
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current)
    const snapshot = snapshotRef.current
    void saveGameProfileApi('block-defense', snapshot.progress, snapshot.progress.bestScore, snapshot.updatedAt).catch(() => undefined)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const restored = restoreEnergy(progressRef.current)
      if (restored.energy !== progressRef.current.energy || restored.energyUpdatedAt !== progressRef.current.energyUpdatedAt) {
        persistProgress(restored)
      }
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [persistProgress])

  useEffect(() => {
    if (paused || workshopOpen || helpOpen || resetOpen || levelSelectOpen || universalTarget !== null || tvSlotAction !== null || round.phase !== 'playing') return undefined
    const timer = window.setInterval(() => {
      setRound((current) => stepRound(current, progressRef.current))
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [helpOpen, levelSelectOpen, paused, resetOpen, round.phase, tvSlotAction, universalTarget, workshopOpen])

  useEffect(() => {
    if (round.phase === 'playing' || round.reward) return
    const rewardKey = `${round.id}:${round.phase}`
    if (rewardKeyRef.current === rewardKey) return
    rewardKeyRef.current = rewardKey
    const completion = round.total > 0 ? round.destroyed / round.total : 0
    const key = variantKey(round.level, round.difficulty)
    const firstClear = round.phase === 'won' && !progressRef.current.completedLevels.includes(round.level)
    const reward: RoundReward = round.phase === 'won'
      ? firstClear
        ? { coins: 120 + round.level * 28, gears: 2 + Math.ceil(round.level / 3), energy: 10, firstClear: true }
        : { coins: 32 + round.level * 7, gears: Math.max(1, Math.ceil(round.level / 15)), energy: 0, firstClear: false }
      : { coins: Math.max(12, Math.round(42 * completion)), gears: completion >= 0.65 ? 1 : 0, energy: 0, firstClear: false }
    updateProgress((current) => ({
      ...current,
      coins: current.coins + reward.coins,
      gears: current.gears + reward.gears,
      energy: Math.min(MAX_ENERGY, current.energy + reward.energy),
      energyUpdatedAt: current.energy + reward.energy >= MAX_ENERGY ? new Date().toISOString() : current.energyUpdatedAt,
      unlockedLevel: round.phase === 'won' ? Math.min(MAX_LEVEL, Math.max(current.unlockedLevel, round.level + 1)) : current.unlockedLevel,
      currentLevel: round.phase === 'won' ? Math.min(MAX_LEVEL, round.level + 1) : round.level,
      completedLevels: round.phase === 'won' ? Array.from(new Set([...current.completedLevels, round.level])).sort((left, right) => left - right) : current.completedLevels,
      completedVariants: round.phase === 'won' ? Array.from(new Set([...current.completedVariants, key])) : current.completedVariants,
      levelBestScores: { ...current.levelBestScores, [key]: Math.max(current.levelBestScores[key] ?? 0, round.score) },
      bestScore: Math.max(current.bestScore, round.score),
    }))
    setRound((current) => current.id === round.id ? { ...current, reward } : current)
  }, [round, updateProgress])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) setPaused(true)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const closeTopLayer = useCallback(() => {
    if (tvSlotAction !== null) setTvSlotAction(null)
    else if (universalTarget !== null) setUniversalTarget(null)
    else if (resetOpen) setResetOpen(false)
    else if (levelSelectOpen) setLevelSelectOpen(false)
    else if (helpOpen) setHelpOpen(false)
    else if (workshopOpen) setWorkshopOpen(false)
    else if (paused) setPaused(false)
    else onClose()
  }, [helpOpen, levelSelectOpen, onClose, paused, resetOpen, tvSlotAction, universalTarget, workshopOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'GoBack') {
        event.preventDefault()
        closeTopLayer()
      } else if ((event.key === 'p' || event.key === 'P') && round.phase === 'playing') {
        event.preventDefault()
        setPaused((current) => !current)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [closeTopLayer, round.phase])

  const installReserve = (reserveIndex: number, activeIndex = round.selectedActive) => {
    if (round.phase !== 'playing') return
    setRound((current) => {
      const incoming = current.reserve[reserveIndex]
      if (!incoming) return current
      const targetIndex = Math.max(0, Math.min(current.active.length - 1, activeIndex))
      const outgoing = current.active[targetIndex]
      const active = [...current.active]
      active[targetIndex] = {
        ...incoming,
        id: `active-${current.level}-${current.elapsedMs}-${targetIndex}`,
        readyMs: chargeDuration(progressRef.current),
        cooldownMs: 0,
        idle: false,
      }
      const reserve = [...current.reserve]
      let drawIndex = current.drawIndex
      if (outgoing && outgoing.ammo > 0) {
        reserve[reserveIndex] = { ...outgoing, id: `reserve-${current.level}-${current.elapsedMs}-${reserveIndex}`, readyMs: 0, cooldownMs: 0, idle: false }
      } else {
        const signatureId = chooseOfferSignature(current.catalog, drawIndex, current.level, current.layers, active, reserve.filter((_, index) => index !== reserveIndex))
        reserve[reserveIndex] = createLauncher(signatureId, `reserve-${current.level}-${drawIndex}`, progressRef.current, current.difficulty, false)
        drawIndex += 1
      }
      const signature = SIGNATURE_MAP.get(incoming.signatureId) ?? SIGNATURES[0]
      return {
        ...current,
        active,
        reserve,
        penetratingSlots: current.penetratingSlots.filter((index) => index !== targetIndex),
        selectedActive: targetIndex,
        selectedReserve: reserveIndex,
        drawIndex,
        message: `${signature.shortLabel}已装入，正在充能 ${Math.ceil(chargeDuration(progressRef.current) / 1000)} 秒`,
      }
    })
  }

  const rerollReserve = () => {
    const useFreeReroll = round.freeRerolls > 0
    if ((!useFreeReroll && progress.rerolls <= 0) || round.phase !== 'playing') return
    setRound((current) => {
      const signatureId = chooseOfferSignature(current.catalog, current.drawIndex, current.level, current.layers, current.active, current.reserve)
      const reserve = [...current.reserve]
      reserve[current.selectedReserve] = createLauncher(signatureId, `reserve-${current.level}-${current.drawIndex}`, progressRef.current, current.difficulty, false)
      return {
        ...current,
        reserve,
        drawIndex: current.drawIndex + 1,
        freeRerolls: useFreeReroll ? Math.max(0, current.freeRerolls - 1) : current.freeRerolls,
        deadlockMs: 0,
        message: useFreeReroll ? '已使用本关免费刷新，紧缺类型仍受保底保护' : '指定备用格已重新补给，保底轮转仍然有效',
      }
    })
    if (!useFreeReroll) updateProgress((current) => ({ ...current, rerolls: current.rerolls - 1 }))
  }

  const installUniversal = (signatureId: string) => {
    if (universalTarget === null || progress.universalLaunchers <= 0) return
    setRound((current) => {
      const reserve = [...current.reserve]
      reserve[universalTarget] = createLauncher(signatureId, `universal-${current.level}-${current.elapsedMs}`, progressRef.current, current.difficulty, false)
      return { ...current, reserve, selectedReserve: universalTarget, message: '万能发射器已按你的选择完成配置' }
    })
    updateProgress((current) => ({ ...current, universalLaunchers: current.universalLaunchers - 1 }))
    setUniversalTarget(null)
  }

  const buyUpgrade = (upgrade: UpgradeDefinition) => {
    updateProgress((current) => {
      const currentLevel = upgradeLevel(current, upgrade.id)
      const cost = upgradeCost(upgrade, currentLevel)
      if (currentLevel >= upgrade.maxLevel || current.coins < cost.coins || current.gears < cost.gears) return current
      const next = { ...current, coins: current.coins - cost.coins, gears: current.gears - cost.gears }
      if (upgrade.id === 'slow') next.slowLevel += 1
      else if (upgrade.id === 'charge') next.chargeLevel += 1
      else if (upgrade.id === 'slot') next.slotLevel += 1
      else next.reserveLevel += 1
      return next
    })
  }

  const buyConsumable = (kind: 'reroll' | 'universal') => {
    const cost = kind === 'reroll' ? 45 : 180
    updateProgress((current) => {
      if (current.coins < cost) return current
      return {
        ...current,
        coins: current.coins - cost,
        rerolls: current.rerolls + (kind === 'reroll' ? 1 : 0),
        universalLaunchers: current.universalLaunchers + (kind === 'universal' ? 1 : 0),
      }
    })
  }

  const usePenetration = (activeIndex = round.selectedActive) => {
    if (round.phase !== 'playing' || round.penetrationUses >= 3) return
    const slotIndex = Math.max(0, Math.min(round.active.length - 1, activeIndex))
    if (round.penetratingSlots.includes(slotIndex)) {
      setRound((current) => ({ ...current, message: `${slotIndex + 1} 号发射器已经可以穿透一层，请选择其他槽位` }))
      return
    }
    const cost = [200, 400, 800][round.penetrationUses]
    if (progressRef.current.coins < cost) {
      setRound((current) => ({ ...current, message: `积分不足，本次穿透需要 ${cost} 积分` }))
      return
    }
    updateProgress((current) => ({ ...current, coins: current.coins - cost }))
    setRound((current) => ({
      ...current,
      penetrationUses: current.penetrationUses + 1,
      penetratingSlots: [...current.penetratingSlots, slotIndex],
      message: `${slotIndex + 1} 号发射器已启用一层穿透，本局还可使用 ${2 - current.penetrationUses} 次`,
    }))
  }

  const discardLauncher = (activeIndex: number) => {
    if (round.phase !== 'playing') return
    const cost = 20 + round.discardUses * 10
    if (progressRef.current.coins < cost) {
      setRound((current) => ({ ...current, message: `积分不足，本次丢弃需要 ${cost} 积分` }))
      return
    }
    const launcher = round.active[activeIndex]
    if (!launcher) {
      setRound((current) => ({ ...current, message: `${activeIndex + 1} 号槽位已经是空的` }))
      return
    }
    updateProgress((current) => ({ ...current, coins: current.coins - cost }))
    setRound((current) => {
      const active = [...current.active]
      active[activeIndex] = null
      return {
        ...current,
        active,
        selectedActive: activeIndex,
        discardUses: current.discardUses + 1,
        penetratingSlots: current.penetratingSlots.filter((index) => index !== activeIndex),
        message: `已丢弃 ${activeIndex + 1} 号发射器，下次丢弃需要 ${cost + 10} 积分`,
      }
    })
  }

  const beginPointerDrag = (source: DragSource, event: ReactPointerEvent<HTMLElement>) => {
    if (DEVICE_PROFILE === 'tv' || round.phase !== 'playing' || (event.pointerType === 'mouse' && event.button !== 0)) return
    const gesture: DragGesture = { ...source, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false }
    dragGestureRef.current = gesture
    setDragGesture(gesture)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const movePointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragGestureRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const moved = current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= 7
    const next = { ...current, x: event.clientX, y: event.clientY, moved }
    dragGestureRef.current = next
    setDragGesture(next)
    if (moved) event.preventDefault()
  }

  const endPointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragGestureRef.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.moved) {
      suppressClickRef.current = true
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      const activeTarget = target?.closest<HTMLElement>('[data-active-index]')
      const discardTarget = target?.closest<HTMLElement>('[data-discard-zone]')
      if (current.kind === 'reserve' && activeTarget) installReserve(current.index, Number(activeTarget.dataset.activeIndex))
      else if (current.kind === 'active' && discardTarget) discardLauncher(current.index)
      else setRound((value) => ({ ...value, message: current.kind === 'reserve' ? '请把备用发射器拖到战场下方的发射槽位' : '请把当前发射器拖到右侧丢弃区' }))
    }
    dragGestureRef.current = null
    setDragGesture(null)
  }

  const cancelPointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragGestureRef.current
    if (!current || current.pointerId !== event.pointerId) return
    dragGestureRef.current = null
    setDragGesture(null)
  }

  const startLevel = useCallback((level: number, difficulty: Difficulty = selectedDifficulty) => {
    const targetLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
    if (targetLevel > progressRef.current.unlockedLevel) return
    const access = unlockLevelWithEnergy(progressRef.current, targetLevel)
    if (!access.allowed) {
      setLevelNotice(`体力不足：解锁第 ${targetLevel} 关${DIFFICULTIES[difficulty].label}模式需要 ${LEVEL_ENERGY_COST} 体力。`)
      return
    }
    rewardKeyRef.current = null
    setPaused(false)
    setWorkshopOpen(false)
    setHelpOpen(false)
    setLevelSelectOpen(false)
    setUniversalTarget(null)
    setTvSlotAction(null)
    setLevelNotice('')
    setSelectedDifficulty(difficulty)
    const nextProgress = { ...access.progress, currentLevel: targetLevel, currentDifficulty: difficulty }
    if (access.spent || progressRef.current.currentLevel !== targetLevel || progressRef.current.currentDifficulty !== difficulty) persistProgress(nextProgress)
    setRound(createRound(targetLevel, nextProgress, difficulty))
  }, [persistProgress, selectedDifficulty])

  const resetAdventure = () => {
    const fresh = normalizeProgress(DEFAULT_PROGRESS)
    persistProgress(fresh)
    setResetOpen(false)
    setSelectedDifficulty('normal')
    window.setTimeout(() => startLevel(1, 'normal'), 0)
  }

  const presentSignatures = useMemo(() => {
    const ids = new Set(round.layers.flatMap((layer) => layer.blocks.map((block) => block.signatureId)))
    return round.catalog.filter((id) => ids.has(id))
  }, [round.catalog, round.layers])

  const sortedLayers = useMemo(
    () => [...round.layers].sort((left, right) => left.progress - right.progress),
    [round.layers],
  )
  const targetableBlockIds = useMemo(
    () => new Set(exposedTargets(round.layers, round.penetratingSlots.length > 0 ? 2 : 1).map(({ block }) => block.id)),
    [round.layers, round.penetratingSlots],
  )
  const dragLauncher = dragGesture
    ? dragGesture.kind === 'reserve' ? round.reserve[dragGesture.index] : round.active[dragGesture.index]
    : null
  const penetrationCost = round.penetrationUses < 3 ? [200, 400, 800][round.penetrationUses] : null
  const discardCost = 20 + round.discardUses * 10

  return (
    <div className="mower-v2-backdrop" role="dialog" aria-modal="true" aria-label="彩块防线" data-level={round.level} data-difficulty={round.difficulty}>
      <div className="mower-v2-shell" ref={shellRef} tabIndex={-1}>
        <header className="mower-v2-header">
          <div className="mower-v2-brand">
            <span className="mower-v2-logo"><Box size={20} /></span>
            <div><strong>彩块防线</strong><span>BLOCK DEFENSE · {round.level}/{MAX_LEVEL}「{levelName(round.level)}」· {DIFFICULTIES[round.difficulty].label} · {syncState === 'synced' ? '已同步' : syncState === 'syncing' ? '同步中' : '离线存档'}</span></div>
          </div>
          <div className="mower-v2-hud">
            <span><Trophy size={14} />{round.score.toLocaleString('zh-CN')}</span>
            <span><Coins size={14} />{progress.coins}</span>
            <span><Settings2 size={14} />{progress.gears}</span>
            <span><Heart size={14} />{progress.energy}/{MAX_ENERGY}</span>
            <span><TimerReset size={14} />{formatTime(round.elapsedMs)}</span>
          </div>
          <div className="mower-v2-header-actions">
            <button type="button" title="选择关卡" aria-label="选择关卡" onClick={() => setLevelSelectOpen(true)}><MapPinned size={18} /></button>
            <button type="button" title="玩法说明" aria-label="玩法说明" onClick={() => setHelpOpen(true)}><CircleDot size={18} /></button>
            <button type="button" title="成长工坊" aria-label="成长工坊" onClick={() => setWorkshopOpen(true)}><ShoppingBag size={18} /></button>
            <button type="button" title={paused ? '继续' : '暂停'} aria-label={paused ? '继续游戏' : '暂停游戏'} onClick={() => setPaused((current) => !current)}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
            <button type="button" title="退出" aria-label="退出彩块防线" data-tv-close onClick={onClose}><X size={20} /></button>
          </div>
        </header>

        <main className="mower-v2-main">
          <section className="mower-v2-stage" aria-label="彩块战场">
            <div className="mower-v2-stage-status">
              <div className="mower-v2-shields" aria-label={`防线护盾 ${round.shields} 格`}>
                {Array.from({ length: MAX_SHIELDS }, (_, index) => <Heart key={index} size={17} fill={index < round.shields ? 'currentColor' : 'none'} className={index < round.shields ? 'is-on' : ''} />)}
              </div>
              <div className="mower-v2-goal"><span>清理进度</span><strong>{Math.round(round.total > 0 ? round.destroyed / round.total * 100 : 0)}%</strong><i><b style={{ width: `${Math.min(100, round.total > 0 ? round.destroyed / round.total * 100 : 0)}%` }} /></i></div>
              <span className="mower-v2-depth"><Layers3 size={15} />{round.penetratingSlots.length > 0 ? `${round.penetratingSlots.map((index) => index + 1).join('、')} 号穿透一层` : '每列只攻击最前层'}</span>
            </div>

            <div
              className="mower-v2-field"
              data-block-total={round.total}
              data-lanes={round.lanes}
              data-pattern-types={round.catalog.filter((signatureId) => (SIGNATURE_MAP.get(signatureId)?.pattern ?? 'plain') !== 'plain').length}
              data-advance-speed={advanceSpeed(round.level, round.difficulty, progress).toFixed(3)}
              style={{ '--mower-lanes': round.lanes } as CSSProperties}
            >
              <div className="mower-v2-horizon"><span>方块正在靠近防线</span></div>
              <div className="mower-v2-grid-plane" aria-hidden="true" />
              <BlockDefenseScene layers={round.layers} effects={round.effects} targetable={targetableBlockIds} lanes={round.lanes} />
              <div className="mower-v2-block-plane" aria-hidden="true">
                {sortedLayers.flatMap((layer) => layer.blocks.map((block) => {
                  const signature = SIGNATURE_MAP.get(block.signatureId) ?? SIGNATURES[0]
                  const left = 4 + (block.lane / Math.max(1, round.lanes - 1)) * 92
                  const top = 9 + layer.progress * 0.82
                  const scale = Math.max(0.56, Math.min(1.08, 0.65 + layer.progress * 0.0043))
                  return (
                    <span
                      key={block.id}
                      data-lane={block.lane}
                      data-layer={layer.id}
                      className={`mower-v2-block shape-${signature.shape} pattern-${signature.pattern} ${targetableBlockIds.has(block.id) ? 'is-targetable' : 'is-covered'}`}
                      style={{ ...signatureStyle(signature.id), left: `${left}%`, top: `${top}%`, zIndex: Math.round(layer.progress + 100), transform: `translate(-50%, -50%) scale(${scale})` }}
                      title={`${signature.label}${targetableBlockIds.has(block.id) ? '，可攻击' : '，被同列前方色块遮挡'}`}
                    >
                      <i className="mower-v2-eyes"><b /><b /></i>
                    </span>
                  )
                }))}
              </div>
              <div className="mower-v2-defense-line"><Shield size={17} /><span>家庭防线</span></div>
              <div className="mower-v2-active-row" style={{ '--active-count': round.active.length } as CSSProperties}>
                {round.active.map((launcher, index) => {
                  const charging = Boolean(launcher && launcher.readyMs > 0)
                  const empty = !launcher || launcher.ammo <= 0
                  return (
                    <div className="mower-active-unit" key={`active-slot-${index}`}>
                      <button
                        type="button"
                        className={`mower-active-slot ${round.selectedActive === index ? 'is-selected' : ''} ${charging ? 'is-charging' : ''} ${empty ? 'is-empty' : ''} ${launcher?.idle ? 'is-idle' : ''}`}
                        aria-pressed={round.selectedActive === index}
                        aria-label={`发射槽位 ${index + 1}${launcher ? `，${SIGNATURE_MAP.get(launcher.signatureId)?.label ?? ''}，剩余 ${launcher.ammo} 发` : '，空'}`}
                        data-tv-initial={index === 0 ? true : undefined}
                        data-active-index={index}
                        data-capacity={launcher?.capacity ?? 0}
                        onPointerDown={(event) => beginPointerDrag({ kind: 'active', index }, event)}
                        onPointerMove={movePointerDrag}
                        onPointerUp={endPointerDrag}
                        onPointerCancel={cancelPointerDrag}
                        onClick={() => {
                          if (suppressClickRef.current) { suppressClickRef.current = false; return }
                          setRound((current) => ({ ...current, selectedActive: index, message: `已选择 ${index + 1} 号槽位，请从备用池选择发射器` }))
                        }}
                      >
                        <span className="mower-slot-number">{index + 1}</span>
                        {launcher ? <LauncherFace launcher={launcher} compact /> : <span className="mower-empty-mark">+</span>}
                        {launcher && charging && <span className="mower-charge-mask"><Zap size={14} /><b>{(launcher.readyMs / 1000).toFixed(1)}s</b></span>}
                        {launcher && !charging && launcher.ammo <= 0 && <span className="mower-charge-mask is-empty-label">空仓</span>}
                        {launcher?.idle && launcher.ammo > 0 && <span className="mower-idle-label">前层无目标</span>}
                      </button>
                      <button type="button" className={`mower-slot-penetrate ${round.penetratingSlots.includes(index) ? 'is-active' : ''}`} aria-label={`${index + 1} 号发射器${round.penetratingSlots.includes(index) ? '已启用穿透' : `启用穿透，消耗 ${penetrationCost ?? 0} 积分`}`} title="穿透一层" disabled={!launcher || penetrationCost === null || round.penetratingSlots.includes(index) || round.phase !== 'playing'} onClick={() => usePenetration(index)}><ScanLine size={13} /><span>{round.penetratingSlots.includes(index) ? '穿透中' : penetrationCost ?? '已满'}</span></button>
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="mower-v2-message" role="status"><Sparkles size={15} />{round.message}</p>
          </section>

          <aside className="mower-v2-arsenal">
            <div className="mower-v2-panel-title">
              <div><span className="eyebrow">RESERVE POOL</span><h2>备用发射器</h2></div>
              <span className="soft-badge">{round.reserve.length} 格</span>
            </div>
            <p className="mower-v2-guide">手机或电脑把备用发射器拖到槽位；电视选中备用发射器后再选择目标槽位。</p>
            <div className="mower-reserve-grid">
              {round.reserve.map((launcher, index) => {
                const signature = SIGNATURE_MAP.get(launcher.signatureId) ?? SIGNATURES[0]
                return (
                  <button
                    type="button"
                    key={launcher.id}
                    className={`mower-reserve-card ${round.selectedReserve === index ? 'is-last-used' : ''}`}
                    aria-label={`把备用格 ${index + 1} 的${signature.label}装入 ${round.selectedActive + 1} 号槽位`}
                    data-capacity={launcher.capacity}
                    onPointerDown={(event) => beginPointerDrag({ kind: 'reserve', index }, event)}
                    onPointerMove={movePointerDrag}
                    onPointerUp={endPointerDrag}
                    onPointerCancel={cancelPointerDrag}
                    onClick={() => {
                      if (suppressClickRef.current) { suppressClickRef.current = false; return }
                      setRound((current) => ({ ...current, selectedReserve: index, message: DEVICE_PROFILE === 'tv' ? `请选择要换装的发射槽位` : `拖动备用格 ${index + 1} 到战场下方的发射槽位` }))
                      if (DEVICE_PROFILE === 'tv') setTvSlotAction({ kind: 'install', reserveIndex: index })
                    }}
                    disabled={round.phase !== 'playing'}
                  >
                    <span className="mower-reserve-index">{index + 1}</span>
                    <LauncherFace launcher={launcher} />
                    <ChevronRight size={17} className="mower-install-arrow" />
                  </button>
                )
              })}
            </div>

            <div className="mower-item-bar">
              <button type="button" onClick={rerollReserve} disabled={(round.freeRerolls <= 0 && progress.rerolls <= 0) || round.phase !== 'playing'}>
                <RefreshCw size={17} /><span><strong>刷新选中格</strong><small>{round.freeRerolls > 0 ? `本关免费 ${round.freeRerolls} 次` : `刷新券 ${progress.rerolls} 张`}</small></span>
              </button>
              <button type="button" onClick={() => setUniversalTarget(round.selectedReserve)} disabled={progress.universalLaunchers <= 0 || round.phase !== 'playing'}>
                <WandSparkles size={17} /><span><strong>万能配置</strong><small>剩余 {progress.universalLaunchers}</small></span>
              </button>
              <button
                type="button"
                className={`mower-discard-zone ${dragGesture?.kind === 'active' ? 'is-ready' : ''}`}
                data-discard-zone
                onClick={() => DEVICE_PROFILE === 'tv' ? setTvSlotAction({ kind: 'discard' }) : setRound((current) => ({ ...current, message: '把战场中的发射器拖到这里丢弃；备用池发射器不可丢弃' }))}
                disabled={round.phase !== 'playing'}
              >
                <Trash2 size={17} /><span><strong>丢弃发射器</strong><small>本次 {discardCost} 积分 · 次数不限</small></span>
              </button>
            </div>
            <div className="mower-guarantee-note"><Check size={15} /><span>紧缺类型最多第三次补出；若库存彻底无解，补给站会在 2.8 秒后自动救场。</span></div>
            <button type="button" className="mower-workshop-button" onClick={() => setWorkshopOpen(true)}><ShoppingBag size={17} />局外成长工坊<span>{progress.coins} 积分</span></button>
          </aside>
        </main>

        {dragGesture?.moved && dragLauncher && (
          <div className="mower-drag-ghost" style={{ left: dragGesture.x, top: dragGesture.y, ...signatureStyle(dragLauncher.signatureId) }} aria-hidden="true"><LauncherFace launcher={dragLauncher} compact /></div>
        )}

        {paused && round.phase === 'playing' && !workshopOpen && !helpOpen && !resetOpen && !levelSelectOpen && universalTarget === null && tvSlotAction === null && (
          <div className="mower-v2-overlay"><section className="mower-pause-card"><Pause size={30} /><h2>游戏已暂停</h2><p>方块和充能计时都已停止。</p><button type="button" className="button button-primary" autoFocus onClick={() => setPaused(false)}><Play size={17} />继续守护</button></section></div>
        )}

        {round.phase !== 'playing' && (
          <div className="mower-v2-overlay">
            <section className={`mower-result-card is-${round.phase}`}>
              <span className="mower-result-icon">{round.phase === 'won' ? <Trophy size={38} /> : <Shield size={38} />}</span>
              <span className="eyebrow">LEVEL {round.level}</span>
              <h2>{round.phase === 'won' ? '防线守住了' : '这次差一点'}</h2>
              <p>{round.phase === 'won' ? (round.reward?.firstClear ? '首次守住这一关，获得完整首通奖励和 10 点体力。' : '重复挑战成功，仍会获得少量升级材料。') : `已清理 ${Math.round(round.total > 0 ? round.destroyed / round.total * 100 : 0)}%，本关可以直接重新挑战。`}</p>
              {round.phase === 'won' && <span className={`mower-clear-badge ${round.reward?.firstClear ? 'is-first' : ''}`}>{round.reward?.firstClear ? '首次通关奖励' : '重复通关奖励'}</span>}
              <div className="mower-reward-row"><span><Coins size={18} />+{round.reward?.coins ?? 0}</span><span><Settings2 size={18} />+{round.reward?.gears ?? 0}</span>{Boolean(round.reward?.energy) && <span><Heart size={18} />+{round.reward?.energy}</span>}</div>
              <div className="mower-result-actions">
                <button type="button" className="button button-quiet" onClick={() => setLevelSelectOpen(true)}><MapPinned size={17} />选择关卡</button>
                <button type="button" className="button button-quiet" onClick={() => setWorkshopOpen(true)}><ShoppingBag size={17} />先升级</button>
                <button type="button" className="button button-primary" autoFocus onClick={() => startLevel(round.phase === 'won' ? Math.min(MAX_LEVEL, round.level + 1) : round.level, round.difficulty)}>{round.phase === 'won' ? (round.level >= MAX_LEVEL ? '再次挑战' : '下一关') : '重试本关'}<ChevronRight size={17} /></button>
              </div>
            </section>
          </div>
        )}

        {levelSelectOpen && (
          <div className="mower-v2-overlay mower-level-overlay">
            <section className="mower-level-select" role="dialog" aria-modal="true" aria-label="彩块防线选关">
              <header><div><span className="eyebrow">60 LEVELS · 3 DIFFICULTIES</span><h2><ListChecks size={22} />选择关卡</h2><p>每关包含简单、普通和困难模式；关卡首次解锁消耗 10 体力，该关首通返还 10 体力。</p></div><button type="button" aria-label="关闭选关" onClick={() => setLevelSelectOpen(false)}><X size={20} /></button></header>
              <div className="mower-difficulty-bar" role="tablist" aria-label="选择关卡难度">
                {DIFFICULTY_ORDER.map((difficulty) => <button type="button" role="tab" aria-selected={selectedDifficulty === difficulty} className={selectedDifficulty === difficulty ? 'is-active' : ''} key={difficulty} onClick={() => { setSelectedDifficulty(difficulty); setLevelNotice('') }}><strong>{DIFFICULTIES[difficulty].label}</strong><span>{DIFFICULTIES[difficulty].ammo} 发 · {difficulty === 'easy' ? '慢速' : difficulty === 'normal' ? '标准速度' : '高速'}</span></button>)}
                <span className="mower-energy-badge"><Heart size={16} fill="currentColor" />体力 {progress.energy}/{MAX_ENERGY}<small>每 15 分钟恢复 1 点</small></span>
              </div>
              {levelNotice && <p className="mower-level-notice" role="alert">{levelNotice}</p>}
              <div className="mower-level-chapters">
                {LEVEL_CHAPTERS.map((chapter, chapterIndex) => (
                  <section key={chapter.name}>
                    <div><strong>{chapterIndex + 1}. {chapter.name}</strong><small>{chapter.label}</small></div>
                    <div className="mower-level-grid">
                      {BLOCK_DEFENSE_LEVELS.slice(chapterIndex * 10, chapterIndex * 10 + 10).map((definition) => {
                        const unlocked = definition.level <= progress.unlockedLevel
                        const completed = progress.completedVariants.includes(variantKey(definition.level, selectedDifficulty))
                        const paid = progress.energyUnlockedLevels.includes(definition.level)
                        const current = definition.level === round.level && selectedDifficulty === round.difficulty
                        return (
                          <button
                            type="button"
                            key={definition.level}
                            disabled={!unlocked}
                            className={`${completed ? 'is-complete' : ''} ${current ? 'is-current' : ''}`}
                            aria-label={`第 ${definition.level} 关${DIFFICULTIES[selectedDifficulty].label}模式，${completed ? '已通关' : unlocked ? paid ? '可挑战' : '需要 10 体力解锁' : '未解锁'}`}
                            data-tv-initial={current ? true : undefined}
                            onClick={() => startLevel(definition.level, selectedDifficulty)}
                          >
                            <strong>{definition.level}</strong>
                            <span>{completed ? <><Check size={13} />已通关</> : unlocked ? paid ? '可挑战' : <><Heart size={11} />10</> : '锁定'}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </div>
        )}

        {workshopOpen && (
          <div className="mower-v2-overlay mower-workshop-overlay">
            <section className="mower-workshop" role="dialog" aria-modal="true" aria-label="成长工坊">
              <header><div><span className="eyebrow">GROWTH WORKSHOP</span><h2>成长工坊</h2><p>升级价格逐级按指数增长；弹量由关卡难度固定，穿透和丢弃改为局内积分操作。</p></div><button type="button" aria-label="关闭成长工坊" onClick={() => setWorkshopOpen(false)}><X size={20} /></button></header>
              <div className="mower-wallet"><span><Coins size={17} />积分 <strong>{progress.coins}</strong></span><span><Settings2 size={17} />零件 <strong>{progress.gears}</strong></span><span><Heart size={17} />体力 <strong>{progress.energy}/{MAX_ENERGY}</strong></span></div>
              <div className="mower-upgrade-grid">
                {UPGRADES.map((upgrade) => {
                  const level = upgradeLevel(progress, upgrade.id)
                  const cost = upgradeCost(upgrade, level)
                  const reachedMax = level >= upgrade.maxLevel
                  const affordable = progress.coins >= cost.coins && progress.gears >= cost.gears
                  const Icon = upgrade.icon
                  return (
                    <article key={upgrade.id} className="mower-upgrade-card">
                      <span className="mower-upgrade-icon"><Icon size={21} /></span>
                      <div><strong>{upgrade.title}</strong><small>{upgrade.detail}</small><i><b style={{ width: `${Math.min(100, level / upgrade.maxLevel * 100)}%` }} /></i></div>
                      <span className="mower-upgrade-level">Lv.{level}</span>
                      <button type="button" onClick={() => buyUpgrade(upgrade)} disabled={reachedMax || !affordable}>{reachedMax ? '已满级' : <><Coins size={13} />{cost.coins}<Settings2 size={13} />{cost.gears}</>}</button>
                    </article>
                  )
                })}
              </div>
              <div className="mower-shop-row">
                <article><RefreshCw size={21} /><div><strong>定点刷新券</strong><small>随机刷新一个指定备用格</small></div><span>持有 {progress.rerolls}</span><button type="button" onClick={() => buyConsumable('reroll')} disabled={progress.coins < 45}><Coins size={13} />45</button></article>
                <article><WandSparkles size={21} /><div><strong>万能发射器</strong><small>从本关目标中自选一种</small></div><span>持有 {progress.universalLaunchers}</span><button type="button" onClick={() => buyConsumable('universal')} disabled={progress.coins < 180}><Coins size={13} />180</button></article>
              </div>
              <footer><button type="button" className="button button-danger-quiet" onClick={() => setResetOpen(true)}><RotateCcw size={16} />从第 1 关重新开始</button><button type="button" className="button button-primary" autoFocus onClick={() => setWorkshopOpen(false)}>{round.phase === 'playing' ? '回到战场' : '完成升级'}<ChevronRight size={17} /></button></footer>
            </section>
          </div>
        )}

        {helpOpen && (
          <div className="mower-v2-overlay">
            <section className="mower-help-card" role="dialog" aria-modal="true" aria-label="彩块防线玩法说明">
              <header><div><span className="eyebrow">HOW TO PLAY</span><h2>不是无脑点点点</h2></div><button type="button" aria-label="关闭玩法说明" onClick={() => setHelpOpen(false)}><X size={20} /></button></header>
              <ol>
                <li><span>1</span><div><strong>看每列最前方</strong><p>发射器会攻击各投影列最前面的同类型方块；某列被挡住，不影响旁边空列后方的色块。</p></div></li>
                <li><span>2</span><div><strong>拖动换装</strong><p>手机用手指、电脑用鼠标把备用发射器拖到目标槽位；电视选中备用格后选择几号槽位。换装后需要 2.5～1 秒充能。</p></div></li>
                <li><span>3</span><div><strong>局内做取舍</strong><p>穿透一层每局最多三次，依次消耗 200、400、800 积分；把当前发射器拖到丢弃区则从 20 积分起逐次加 10。</p></div></li>
              </ol>
              <p className="mower-help-tip">共 60 关，每关有三种难度。花纹块在困难第 15 关、普通第 25 关、简单第 35 关开始出现；体力上限 50，每 15 分钟恢复 1 点。</p>
              <button type="button" className="button button-primary" autoFocus onClick={() => setHelpOpen(false)}><Play size={17} />明白了</button>
            </section>
          </div>
        )}

        {tvSlotAction !== null && (
          <div className="mower-v2-overlay">
            <section className="mower-slot-picker" role="dialog" aria-modal="true" aria-label={tvSlotAction.kind === 'install' ? '选择换装槽位' : '选择丢弃槽位'}>
              <header><div><span className="eyebrow">TV SLOT PICKER</span><h2>{tvSlotAction.kind === 'install' ? '换到几号发射器？' : '丢弃几号发射器？'}</h2></div><button type="button" aria-label="取消槽位选择" onClick={() => setTvSlotAction(null)}><X size={20} /></button></header>
              <p>{tvSlotAction.kind === 'install' ? `备用格 ${tvSlotAction.reserveIndex + 1} 将与所选槽位交换，装入后需要充能。` : `本次丢弃消耗 ${discardCost} 积分，下一次再增加 10 积分。`}</p>
              <div>{round.active.map((launcher, index) => <button type="button" key={index} data-tv-initial={index === round.selectedActive ? true : undefined} disabled={tvSlotAction.kind === 'discard' && !launcher} onClick={() => { if (tvSlotAction.kind === 'install') installReserve(tvSlotAction.reserveIndex, index); else discardLauncher(index); setTvSlotAction(null) }}><span>{index + 1}</span>{launcher ? <LauncherFace launcher={launcher} compact /> : <strong>空槽位</strong>}</button>)}</div>
            </section>
          </div>
        )}

        {universalTarget !== null && (
          <div className="mower-v2-overlay">
            <section className="mower-universal-card" role="dialog" aria-modal="true" aria-label="选择万能发射器类型">
              <header><div><span className="eyebrow">UNIVERSAL LAUNCHER</span><h2>选择当前最需要的类型</h2></div><button type="button" aria-label="取消万能配置" onClick={() => setUniversalTarget(null)}><X size={20} /></button></header>
              <p>会替换备用池第 {universalTarget + 1} 格，使用后消耗 1 个万能发射器。</p>
              <div>{presentSignatures.map((signatureId) => {
                const signature = SIGNATURE_MAP.get(signatureId) ?? SIGNATURES[0]
                return <button type="button" key={signatureId} onClick={() => installUniversal(signatureId)}><span className={`mower-mini-block shape-${signature.shape} pattern-${signature.pattern}`} style={signatureStyle(signature.id)} /><strong>{signature.shortLabel}</strong><small>{signature.label}</small></button>
              })}</div>
            </section>
          </div>
        )}

        {resetOpen && (
          <div className="mower-v2-overlay">
            <section className="mower-reset-card" role="alertdialog" aria-modal="true" aria-labelledby="mower-reset-title">
              <RotateCcw size={30} /><h2 id="mower-reset-title">从第 1 关重新开始？</h2><p>关卡、积分、零件、升级和道具都会清空。这个操作不能撤销。</p>
              <div><button type="button" className="button button-quiet" autoFocus onClick={() => setResetOpen(false)}>保留进度</button><button type="button" className="button button-danger" onClick={resetAdventure}>确认重开</button></div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
