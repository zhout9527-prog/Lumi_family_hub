import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  BatteryCharging,
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
  Target,
  TimerReset,
  Trophy,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import { gameProfileApi, saveGameProfileApi } from './api'

type BlockHue = 'coral' | 'cyan' | 'blue' | 'violet' | 'lime' | 'amber'
type BlockShape = 'cube' | 'round' | 'diamond'
type BlockPattern = 'plain' | 'stripe' | 'dot'
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
  firstClear: boolean
}

interface RoundState {
  id: string
  level: number
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
  ammoLevel: number
  chargeLevel: number
  slotLevel: number
  reserveLevel: number
  penetrationLevel: number
  rerolls: number
  universalLaunchers: number
  bestScore: number
}

interface LevelDefinition {
  level: number
  chapter: string
  name: string
  seed: number
  lanes: number
  layerCount: number
  occupancy: number
  catalogCount: number
  startProgress: number
  layerGap: number
  speed: number
  freeRerolls: number
}

interface ProgressSnapshot {
  progress: ProgressState
  updatedAt: string
}

interface UpgradeDefinition {
  id: 'ammo' | 'charge' | 'slot' | 'reserve' | 'penetration'
  title: string
  detail: string
  icon: typeof BatteryCharging
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

const SIGNATURES: SignatureDefinition[] = [
  { id: 'coral-cube-plain', hue: 'coral', shape: 'cube', pattern: 'plain', label: '珊瑚红方块', shortLabel: '红方', color: '#ef6967', darkColor: '#a93f47' },
  { id: 'blue-cube-plain', hue: 'blue', shape: 'cube', pattern: 'plain', label: '海洋蓝方块', shortLabel: '蓝方', color: '#407fee', darkColor: '#2450ad' },
  { id: 'cyan-cube-plain', hue: 'cyan', shape: 'cube', pattern: 'plain', label: '清水青方块', shortLabel: '青方', color: '#35c4d6', darkColor: '#197c95' },
  { id: 'violet-cube-plain', hue: 'violet', shape: 'cube', pattern: 'plain', label: '葡萄紫方块', shortLabel: '紫方', color: '#9a5ce0', darkColor: '#61349d' },
  { id: 'lime-cube-plain', hue: 'lime', shape: 'cube', pattern: 'plain', label: '青柠绿方块', shortLabel: '绿方', color: '#7fc653', darkColor: '#478431' },
  { id: 'amber-cube-plain', hue: 'amber', shape: 'cube', pattern: 'plain', label: '蜜糖黄方块', shortLabel: '黄方', color: '#f3b842', darkColor: '#a7751d' },
  { id: 'coral-round-plain', hue: 'coral', shape: 'round', pattern: 'plain', label: '珊瑚红圆块', shortLabel: '红圆', color: '#ef6967', darkColor: '#a93f47' },
  { id: 'blue-diamond-plain', hue: 'blue', shape: 'diamond', pattern: 'plain', label: '海洋蓝菱块', shortLabel: '蓝菱', color: '#407fee', darkColor: '#2450ad' },
  { id: 'cyan-round-stripe', hue: 'cyan', shape: 'round', pattern: 'stripe', label: '清水青条纹圆块', shortLabel: '青纹', color: '#35c4d6', darkColor: '#197c95' },
  { id: 'violet-diamond-dot', hue: 'violet', shape: 'diamond', pattern: 'dot', label: '葡萄紫星点菱块', shortLabel: '紫点', color: '#9a5ce0', darkColor: '#61349d' },
  { id: 'lime-round-stripe', hue: 'lime', shape: 'round', pattern: 'stripe', label: '青柠绿条纹圆块', shortLabel: '绿纹', color: '#7fc653', darkColor: '#478431' },
  { id: 'amber-diamond-dot', hue: 'amber', shape: 'diamond', pattern: 'dot', label: '蜜糖黄星点菱块', shortLabel: '黄点', color: '#f3b842', darkColor: '#a7751d' },
]

const SIGNATURE_MAP = new Map(SIGNATURES.map((signature) => [signature.id, signature]))

const DEFAULT_PROGRESS: ProgressState = {
  unlockedLevel: 1,
  currentLevel: 1,
  completedLevels: [],
  levelBestScores: {},
  coins: 0,
  gears: 0,
  ammoLevel: 0,
  chargeLevel: 0,
  slotLevel: 0,
  reserveLevel: 0,
  penetrationLevel: 0,
  rerolls: 1,
  universalLaunchers: 0,
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
  return {
    level,
    chapter: chapter.name,
    name: `${chapter.name} ${stage + 1}`,
    seed: 17_029 + level * 7_919,
    lanes: Math.min(11, 8 + Math.floor(chapterIndex / 2) + (stage >= 7 ? 1 : 0)),
    layerCount: Math.min(19, 8 + chapterIndex * 2 + Math.floor(stage / 3)),
    occupancy: Math.min(0.94, 0.68 + chapterIndex * 0.045 + stage * 0.009),
    catalogCount: Math.min(SIGNATURES.length, 3 + chapterIndex + Math.floor(stage / 3)),
    // 第一批色块比旧版后退约四分之一棋盘，给孩子观察和换装时间。
    startProgress: 42 + chapterIndex * 1.4 + Math.floor(stage / 5),
    layerGap: Math.max(4.8, 6.4 - chapterIndex * 0.24),
    speed: 0.54 + chapterIndex * 0.07 + stage * 0.01,
    freeRerolls: level === 1 ? 3 : level <= 3 ? 1 : 0,
  }
})

const UPGRADES: UpgradeDefinition[] = [
  { id: 'ammo', title: '扩容弹仓', detail: '每级增加 3 发，最高 99 发', icon: BatteryCharging, maxLevel: 30, coinBase: 90, gearBase: 1 },
  { id: 'charge', title: '快速充能', detail: '缩短换装后的准备时间', icon: Gauge, maxLevel: 10, coinBase: 120, gearBase: 1 },
  { id: 'slot', title: '发射槽位', detail: '增加一台同时工作的发射器', icon: Crosshair, maxLevel: 2, coinBase: 420, gearBase: 5 },
  { id: 'reserve', title: '备用池扩建', detail: '增加一个备用发射器位置', icon: Layers3, maxLevel: 4, coinBase: 260, gearBase: 3 },
  { id: 'penetration', title: '分层穿透', detail: '可越过一层，攻击更深处目标', icon: Target, maxLevel: 3, coinBase: 520, gearBase: 6 },
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

function normalizeProgress(value: Partial<ProgressState> | null | undefined): ProgressState {
  const unlockedLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(value?.unlockedLevel) || 1)))
  const completedLevels = Array.from(new Set((Array.isArray(value?.completedLevels) ? value.completedLevels : [])
    .map((level) => Math.floor(Number(level)))
    .filter((level) => level >= 1 && level <= MAX_LEVEL))).sort((left, right) => left - right)
  const rawBestScores = value?.levelBestScores && typeof value.levelBestScores === 'object' ? value.levelBestScores : {}
  const levelBestScores = Object.fromEntries(Object.entries(rawBestScores)
    .map(([level, score]) => [String(Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1)))), Math.max(0, Math.floor(Number(score) || 0))]))
  return {
    ...DEFAULT_PROGRESS,
    ...value,
    unlockedLevel,
    currentLevel: Math.max(1, Math.min(unlockedLevel, Math.floor(Number(value?.currentLevel) || unlockedLevel))),
    completedLevels,
    levelBestScores,
    coins: Math.max(0, Math.floor(Number(value?.coins) || 0)),
    gears: Math.max(0, Math.floor(Number(value?.gears) || 0)),
    ammoLevel: Math.max(0, Math.min(30, Math.floor(Number(value?.ammoLevel) || 0))),
    chargeLevel: Math.max(0, Math.min(10, Math.floor(Number(value?.chargeLevel) || 0))),
    slotLevel: Math.max(0, Math.min(2, Math.floor(Number(value?.slotLevel) || 0))),
    reserveLevel: Math.max(0, Math.min(4, Math.floor(Number(value?.reserveLevel) || 0))),
    penetrationLevel: Math.max(0, Math.min(3, Math.floor(Number(value?.penetrationLevel) || 0))),
    rerolls: Math.max(0, Math.floor(Number(value?.rerolls) || 0)),
    universalLaunchers: Math.max(0, Math.floor(Number(value?.universalLaunchers) || 0)),
    bestScore: Math.max(0, Math.floor(Number(value?.bestScore) || 0)),
  }
}

function storageKey(playerId: string): string {
  return `${STORAGE_KEY_PREFIX}:${playerId}`
}

function loadProgress(playerId: string): ProgressSnapshot {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(playerId)) ?? '{}') as Partial<ProgressSnapshot>
    return {
      progress: normalizeProgress(parsed.progress),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    }
  } catch {
    return { progress: normalizeProgress(DEFAULT_PROGRESS), updatedAt: new Date(0).toISOString() }
  }
}

function ammoCapacity(progress: ProgressState): number {
  return Math.min(99, 10 + progress.ammoLevel * 3)
}

function chargeDuration(progress: ProgressState): number {
  return Math.max(1200, 4200 - progress.chargeLevel * 280)
}

function activeSlotCount(progress: ProgressState): number {
  return 2 + Math.min(2, progress.slotLevel)
}

function reserveSlotCount(progress: ProgressState): number {
  return 3 + Math.min(4, progress.reserveLevel)
}

function penetrationDepth(progress: ProgressState): number {
  return 1 + Math.min(3, progress.penetrationLevel)
}

function catalogForLevel(level: number): string[] {
  return SIGNATURES.slice(0, levelDefinition(level).catalogCount).map((signature) => signature.id)
}

function createLayers(level: number, lanes: number, catalog: string[]): BlockLayer[] {
  const definition = levelDefinition(level)
  const layers: BlockLayer[] = []
  for (let layerIndex = 0; layerIndex < definition.layerCount; layerIndex += 1) {
    const blocks: FieldBlock[] = []
    for (let lane = 0; lane < lanes; lane += 1) {
      const shouldFill = seededValue(definition.seed + layerIndex * 67 + lane * 17) <= definition.occupancy
      if (!shouldFill && blocks.length >= Math.max(3, lanes - 3)) continue
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

function createLauncher(signatureId: string, id: string, progress: ProgressState, fullCharge = true): Launcher {
  const capacity = ammoCapacity(progress)
  return {
    id,
    signatureId,
    ammo: capacity,
    capacity,
    readyMs: fullCharge ? chargeDuration(progress) : Math.min(1600, chargeDuration(progress)),
    cooldownMs: 0,
    idle: false,
  }
}

function createRound(level: number, progress: ProgressState): RoundState {
  const definition = levelDefinition(level)
  const lanes = definition.lanes
  const catalog = catalogForLevel(level)
  const layers = createLayers(level, lanes, catalog)
  const frontSignatures = Array.from(new Set(exposedTargets(layers, 1).map(({ block }) => block.signatureId)))
  const active: Array<Launcher | null> = Array.from({ length: activeSlotCount(progress) }, (_, index) => {
    const signatureId = frontSignatures[index % Math.max(1, frontSignatures.length)] ?? catalog[index % catalog.length]
    return createLauncher(signatureId, `active-${level}-${index}`, progress, false)
  })
  const reserve: Launcher[] = []
  let drawIndex = active.length
  for (let index = 0; index < reserveSlotCount(progress); index += 1) {
    const signatureId = chooseOfferSignature(catalog, drawIndex, level, layers, active, reserve)
    reserve.push(createLauncher(signatureId, `reserve-${level}-${drawIndex}`, progress, false))
    drawIndex += 1
  }
  const total = layers.reduce((sum, layer) => sum + layer.blocks.length, 0)
  return {
    id: `${level}-${Date.now()}`,
    level,
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

function advanceSpeed(level: number): number {
  return levelDefinition(level).speed
}

function blockedSignature(
  layers: BlockLayer[],
  active: Array<Launcher | null>,
  reserve: Launcher[],
  depth: number,
): string | null {
  const accessible = exposedTargets(layers, depth)
  const stocked = new Set([
    ...active.flatMap((launcher) => launcher && launcher.ammo > 0 ? [launcher.signatureId] : []),
    ...reserve.flatMap((launcher) => launcher.ammo > 0 ? [launcher.signatureId] : []),
  ])
  const accessibleTypes = Array.from(new Set(accessible.map(({ block }) => block.signatureId)))
  return accessibleTypes.some((signatureId) => stocked.has(signatureId)) ? null : accessibleTypes[0] ?? null
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

  const speed = advanceSpeed(previous.level)
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
    const target = findTarget(layers, launcher.signatureId, launcherIndex, active.length, previous.lanes, penetrationDepth(progress))
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

  const blocked = blockedSignature(layers, active, reserve, penetrationDepth(progress))
  if (blocked) {
    deadlockMs += TICK_MS
    if (deadlockMs >= DEADLOCK_RESCUE_MS && reserve.length > 0) {
      const rescueIndex = Math.min(previous.selectedReserve, reserve.length - 1)
      reserve = [...reserve]
      reserve[rescueIndex] = createLauncher(blocked, `rescue-${previous.level}-${previous.elapsedMs}`, progress, false)
      reserve[rescueIndex].readyMs = 0
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
  if (id === 'ammo') return progress.ammoLevel
  if (id === 'charge') return progress.chargeLevel
  if (id === 'slot') return progress.slotLevel
  if (id === 'reserve') return progress.reserveLevel
  return progress.penetrationLevel
}

function upgradeCost(upgrade: UpgradeDefinition, currentLevel: number): { coins: number; gears: number } {
  return {
    coins: upgrade.coinBase + currentLevel * Math.ceil(upgrade.coinBase * 0.55),
    gears: upgrade.gearBase + Math.floor(currentLevel / 2),
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

const MAX_SCENE_BLOCKS = 320
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
    const roundGeometry = new RoundedBoxGeometry(0.69, 0.68, 0.69, 6, 0.28)
    const diamondGeometry = new THREE.OctahedronGeometry(0.49, 1)
    const shapeGeometry: Record<BlockShape, THREE.BufferGeometry> = {
      cube: cubeGeometry,
      round: roundGeometry,
      diamond: diamondGeometry,
    }
    const bodyMeshes = new Map<string, THREE.InstancedMesh>()
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
          const farCap = row <= 5
          if (outside || farCap) values.push({ lane, row })
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
          dummy.rotation.set(0, signature.shape === 'diamond' ? Math.PI / 4 : 0, 0)
          dummy.scale.setScalar(current.targetable.has(block.id) ? 1 : 0.965)
          dummy.updateMatrix()
          mesh.setMatrixAt(index, dummy.matrix)
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

export function BlockMowerGame({ onClose, playerId }: { onClose: () => void; playerId: string }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const rewardKeyRef = useRef<string | null>(null)
  const initialSnapshotRef = useRef<ProgressSnapshot>(loadProgress(playerId))
  const progressRef = useRef<ProgressState>(initialSnapshotRef.current.progress)
  const snapshotRef = useRef<ProgressSnapshot>(initialSnapshotRef.current)
  const syncTimerRef = useRef<number | null>(null)
  const [progress, setProgress] = useState(progressRef.current)
  const [round, setRound] = useState(() => createRound(progressRef.current.currentLevel, progressRef.current))
  const [paused, setPaused] = useState(false)
  const [workshopOpen, setWorkshopOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [levelSelectOpen, setLevelSelectOpen] = useState(false)
  const [universalTarget, setUniversalTarget] = useState<number | null>(null)
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
    shellRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    let cancelled = false
    const local = snapshotRef.current
    setSyncState('syncing')
    void gameProfileApi<Partial<ProgressState>>('block-defense').then((remote) => {
      if (cancelled) return
      const hasRemoteProgress = remote.progress && Object.keys(remote.progress).length > 0
      const remoteUpdatedAt = remote.clientUpdatedAt ?? remote.updatedAt ?? new Date(0).toISOString()
      if (hasRemoteProgress && Date.parse(remoteUpdatedAt) >= Date.parse(local.updatedAt)) {
        const next = normalizeProgress({ ...remote.progress, bestScore: Math.max(Number(remote.progress.bestScore) || 0, remote.bestScore) })
        const snapshot = { progress: next, updatedAt: remoteUpdatedAt }
        progressRef.current = next
        snapshotRef.current = snapshot
        setProgress(next)
        try { window.localStorage.setItem(storageKey(playerId), JSON.stringify(snapshot)) } catch { /* 本地缓存不可用时继续使用服务端副本 */ }
        rewardKeyRef.current = null
        setRound(createRound(next.currentLevel, next))
        setSyncState('synced')
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
    if (paused || workshopOpen || helpOpen || resetOpen || levelSelectOpen || universalTarget !== null || round.phase !== 'playing') return undefined
    const timer = window.setInterval(() => {
      setRound((current) => stepRound(current, progressRef.current))
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [helpOpen, levelSelectOpen, paused, resetOpen, round.phase, universalTarget, workshopOpen])

  useEffect(() => {
    if (round.phase === 'playing' || round.reward) return
    const rewardKey = `${round.id}:${round.phase}`
    if (rewardKeyRef.current === rewardKey) return
    rewardKeyRef.current = rewardKey
    const completion = round.total > 0 ? round.destroyed / round.total : 0
    const firstClear = round.phase === 'won' && !progressRef.current.completedLevels.includes(round.level)
    const reward: RoundReward = round.phase === 'won'
      ? firstClear
        ? { coins: 120 + round.level * 28, gears: 2 + Math.ceil(round.level / 3), firstClear: true }
        : { coins: 32 + round.level * 7, gears: Math.max(1, Math.ceil(round.level / 15)), firstClear: false }
      : { coins: Math.max(12, Math.round(42 * completion)), gears: completion >= 0.65 ? 1 : 0, firstClear: false }
    updateProgress((current) => ({
      ...current,
      coins: current.coins + reward.coins,
      gears: current.gears + reward.gears,
      unlockedLevel: round.phase === 'won' ? Math.min(MAX_LEVEL, Math.max(current.unlockedLevel, round.level + 1)) : current.unlockedLevel,
      currentLevel: round.phase === 'won' ? Math.min(MAX_LEVEL, round.level + 1) : round.level,
      completedLevels: round.phase === 'won' ? Array.from(new Set([...current.completedLevels, round.level])).sort((left, right) => left - right) : current.completedLevels,
      levelBestScores: { ...current.levelBestScores, [round.level]: Math.max(current.levelBestScores[String(round.level)] ?? 0, round.score) },
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
    if (universalTarget !== null) setUniversalTarget(null)
    else if (resetOpen) setResetOpen(false)
    else if (levelSelectOpen) setLevelSelectOpen(false)
    else if (helpOpen) setHelpOpen(false)
    else if (workshopOpen) setWorkshopOpen(false)
    else if (paused) setPaused(false)
    else onClose()
  }, [helpOpen, levelSelectOpen, onClose, paused, resetOpen, universalTarget, workshopOpen])

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

  const installReserve = (reserveIndex: number) => {
    if (round.phase !== 'playing') return
    setRound((current) => {
      const incoming = current.reserve[reserveIndex]
      if (!incoming) return current
      const outgoing = current.active[current.selectedActive]
      const active = [...current.active]
      active[current.selectedActive] = {
        ...incoming,
        id: `active-${current.level}-${current.elapsedMs}-${current.selectedActive}`,
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
        reserve[reserveIndex] = createLauncher(signatureId, `reserve-${current.level}-${drawIndex}`, progressRef.current, false)
        reserve[reserveIndex].readyMs = 0
        drawIndex += 1
      }
      const signature = SIGNATURE_MAP.get(incoming.signatureId) ?? SIGNATURES[0]
      return {
        ...current,
        active,
        reserve,
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
      reserve[current.selectedReserve] = createLauncher(signatureId, `reserve-${current.level}-${current.drawIndex}`, progressRef.current, false)
      reserve[current.selectedReserve].readyMs = 0
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
      reserve[universalTarget] = createLauncher(signatureId, `universal-${current.level}-${current.elapsedMs}`, progressRef.current, false)
      reserve[universalTarget].readyMs = 0
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
      if (upgrade.id === 'ammo') next.ammoLevel += 1
      else if (upgrade.id === 'charge') next.chargeLevel += 1
      else if (upgrade.id === 'slot') next.slotLevel += 1
      else if (upgrade.id === 'reserve') next.reserveLevel += 1
      else next.penetrationLevel += 1
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

  const startLevel = useCallback((level: number) => {
    const targetLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
    if (targetLevel > progressRef.current.unlockedLevel) return
    rewardKeyRef.current = null
    setPaused(false)
    setWorkshopOpen(false)
    setHelpOpen(false)
    setLevelSelectOpen(false)
    setUniversalTarget(null)
    if (progressRef.current.currentLevel !== targetLevel) {
      persistProgress({ ...progressRef.current, currentLevel: targetLevel })
    }
    setRound(createRound(targetLevel, progressRef.current))
  }, [persistProgress])

  const resetAdventure = () => {
    const fresh = normalizeProgress(DEFAULT_PROGRESS)
    persistProgress(fresh)
    setResetOpen(false)
    startLevel(1)
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
    () => new Set(exposedTargets(round.layers, penetrationDepth(progress)).map(({ block }) => block.id)),
    [progress, round.layers],
  )

  return (
    <div className="mower-v2-backdrop" role="dialog" aria-modal="true" aria-label="彩块防线">
      <div className="mower-v2-shell" ref={shellRef} tabIndex={-1}>
        <header className="mower-v2-header">
          <div className="mower-v2-brand">
            <span className="mower-v2-logo"><Box size={20} /></span>
            <div><strong>彩块防线</strong><span>BLOCK DEFENSE · {round.level}/{MAX_LEVEL}「{levelName(round.level)}」· {syncState === 'synced' ? '已同步' : syncState === 'syncing' ? '同步中' : '离线存档'}</span></div>
          </div>
          <div className="mower-v2-hud">
            <span><Trophy size={14} />{round.score.toLocaleString('zh-CN')}</span>
            <span><Coins size={14} />{progress.coins}</span>
            <span><Settings2 size={14} />{progress.gears}</span>
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
              <div className="mower-v2-goal"><span>清理进度</span><strong>{round.destroyed}/{round.total}</strong><i><b style={{ width: `${Math.min(100, round.total > 0 ? round.destroyed / round.total * 100 : 0)}%` }} /></i></div>
              <span className="mower-v2-depth"><Layers3 size={15} />每列可攻击前 {penetrationDepth(progress)} 个</span>
            </div>

            <div className="mower-v2-field" style={{ '--mower-lanes': round.lanes } as CSSProperties}>
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
                    <button
                      type="button"
                      key={`active-slot-${index}`}
                      className={`mower-active-slot ${round.selectedActive === index ? 'is-selected' : ''} ${charging ? 'is-charging' : ''} ${empty ? 'is-empty' : ''} ${launcher?.idle ? 'is-idle' : ''}`}
                      aria-pressed={round.selectedActive === index}
                      aria-label={`发射槽位 ${index + 1}${launcher ? `，${SIGNATURE_MAP.get(launcher.signatureId)?.label ?? ''}，剩余 ${launcher.ammo} 发` : '，空'}`}
                      data-tv-initial={index === 0 ? true : undefined}
                      onClick={() => setRound((current) => ({ ...current, selectedActive: index, message: `已选择 ${index + 1} 号槽位，请从备用池选择发射器` }))}
                    >
                      <span className="mower-slot-number">{index + 1}</span>
                      {launcher ? <LauncherFace launcher={launcher} compact /> : <span className="mower-empty-mark">+</span>}
                      {launcher && charging && <span className="mower-charge-mask"><Zap size={14} /><b>{(launcher.readyMs / 1000).toFixed(1)}s</b></span>}
                      {launcher && !charging && launcher.ammo <= 0 && <span className="mower-charge-mask is-empty-label">空仓</span>}
                      {launcher?.idle && launcher.ammo > 0 && <span className="mower-idle-label">前层无目标</span>}
                    </button>
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
            <p className="mower-v2-guide">先点亮战场上的槽位，再选择这里的发射器。换装后需要充能，不能立即开火。</p>
            <div className="mower-reserve-grid">
              {round.reserve.map((launcher, index) => {
                const signature = SIGNATURE_MAP.get(launcher.signatureId) ?? SIGNATURES[0]
                return (
                  <button
                    type="button"
                    key={launcher.id}
                    className={`mower-reserve-card ${round.selectedReserve === index ? 'is-last-used' : ''}`}
                    aria-label={`把备用格 ${index + 1} 的${signature.label}装入 ${round.selectedActive + 1} 号槽位`}
                    onClick={() => installReserve(index)}
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
            </div>
            <div className="mower-guarantee-note"><Check size={15} /><span>紧缺类型最多第三次补出；若库存彻底无解，补给站会在 2.8 秒后自动救场。</span></div>
            <button type="button" className="mower-workshop-button" onClick={() => setWorkshopOpen(true)}><ShoppingBag size={17} />局外成长工坊<span>{progress.coins} 金币</span></button>
          </aside>
        </main>

        {paused && round.phase === 'playing' && !workshopOpen && !helpOpen && !resetOpen && !levelSelectOpen && universalTarget === null && (
          <div className="mower-v2-overlay"><section className="mower-pause-card"><Pause size={30} /><h2>游戏已暂停</h2><p>方块和充能计时都已停止。</p><button type="button" className="button button-primary" autoFocus onClick={() => setPaused(false)}><Play size={17} />继续守护</button></section></div>
        )}

        {round.phase !== 'playing' && (
          <div className="mower-v2-overlay">
            <section className={`mower-result-card is-${round.phase}`}>
              <span className="mower-result-icon">{round.phase === 'won' ? <Trophy size={38} /> : <Shield size={38} />}</span>
              <span className="eyebrow">LEVEL {round.level}</span>
              <h2>{round.phase === 'won' ? '防线守住了' : '这次差一点'}</h2>
              <p>{round.phase === 'won' ? (round.reward?.firstClear ? '首次守住这一关，获得完整首通奖励。' : '重复挑战成功，仍会获得少量升级材料。') : `已清理 ${round.destroyed}/${round.total} 个方块，本关可以直接重新挑战。`}</p>
              {round.phase === 'won' && <span className={`mower-clear-badge ${round.reward?.firstClear ? 'is-first' : ''}`}>{round.reward?.firstClear ? '首次通关奖励' : '重复通关奖励'}</span>}
              <div className="mower-reward-row"><span><Coins size={18} />+{round.reward?.coins ?? 0}</span><span><Settings2 size={18} />+{round.reward?.gears ?? 0}</span></div>
              <div className="mower-result-actions">
                <button type="button" className="button button-quiet" onClick={() => setLevelSelectOpen(true)}><MapPinned size={17} />选择关卡</button>
                <button type="button" className="button button-quiet" onClick={() => setWorkshopOpen(true)}><ShoppingBag size={17} />先升级</button>
                <button type="button" className="button button-primary" autoFocus onClick={() => startLevel(round.phase === 'won' ? Math.min(MAX_LEVEL, round.level + 1) : round.level)}>{round.phase === 'won' ? (round.level >= MAX_LEVEL ? '再次挑战' : '下一关') : '重试本关'}<ChevronRight size={17} /></button>
              </div>
            </section>
          </div>
        )}

        {levelSelectOpen && (
          <div className="mower-v2-overlay mower-level-overlay">
            <section className="mower-level-select" role="dialog" aria-modal="true" aria-label="彩块防线选关">
              <header><div><span className="eyebrow">60 FIXED LEVELS</span><h2><ListChecks size={22} />选择关卡</h2><p>每关布局固定；失败重试当前关，已经解锁的关卡可以随时重玩。</p></div><button type="button" aria-label="关闭选关" onClick={() => setLevelSelectOpen(false)}><X size={20} /></button></header>
              <div className="mower-level-chapters">
                {LEVEL_CHAPTERS.map((chapter, chapterIndex) => (
                  <section key={chapter.name}>
                    <div><strong>{chapterIndex + 1}. {chapter.name}</strong><small>{chapter.label}</small></div>
                    <div className="mower-level-grid">
                      {BLOCK_DEFENSE_LEVELS.slice(chapterIndex * 10, chapterIndex * 10 + 10).map((definition) => {
                        const unlocked = definition.level <= progress.unlockedLevel
                        const completed = progress.completedLevels.includes(definition.level)
                        const current = definition.level === round.level
                        return (
                          <button
                            type="button"
                            key={definition.level}
                            disabled={!unlocked}
                            className={`${completed ? 'is-complete' : ''} ${current ? 'is-current' : ''}`}
                            aria-label={`第 ${definition.level} 关，${completed ? '已通关' : unlocked ? '已解锁' : '未解锁'}`}
                            data-tv-initial={current ? true : undefined}
                            onClick={() => startLevel(definition.level)}
                          >
                            <strong>{definition.level}</strong>
                            <span>{completed ? <Check size={13} /> : unlocked ? '可挑战' : '锁定'}</span>
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
              <header><div><span className="eyebrow">GROWTH WORKSHOP</span><h2>成长工坊</h2><p>首通奖励最高，重复通关也能积攒少量资源，升级不需要付费。</p></div><button type="button" aria-label="关闭成长工坊" onClick={() => setWorkshopOpen(false)}><X size={20} /></button></header>
              <div className="mower-wallet"><span><Coins size={17} />金币 <strong>{progress.coins}</strong></span><span><Settings2 size={17} />零件 <strong>{progress.gears}</strong></span></div>
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
                <li><span>2</span><div><strong>换装要预判</strong><p>选择战场槽位，再点备用发射器。装入后要充能数秒，弹仓用完也必须换装。</p></div></li>
                <li><span>3</span><div><strong>局外做取舍</strong><p>用每局奖励升级弹量、充能、槽位、备用池或穿透，也可购买两种非付费道具。</p></div></li>
              </ol>
              <p className="mower-help-tip">共 60 个固定关卡，分六章加入颜色、形状、花纹和纵深；失败可重试本关，也可回到任意已解锁关卡。</p>
              <button type="button" className="button button-primary" autoFocus onClick={() => setHelpOpen(false)}><Play size={17} />明白了</button>
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
              <RotateCcw size={30} /><h2 id="mower-reset-title">从第 1 关重新开始？</h2><p>关卡、金币、零件、升级和道具都会清空。这个操作不能撤销。</p>
              <div><button type="button" className="button button-quiet" autoFocus onClick={() => setResetOpen(false)}>保留进度</button><button type="button" className="button button-danger" onClick={resetAdventure}>确认重开</button></div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
