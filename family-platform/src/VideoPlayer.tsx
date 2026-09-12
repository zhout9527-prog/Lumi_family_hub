import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import Hls from 'hls.js'
import {
  Check,
  Gauge,
  ListVideo,
  Maximize2,
  Minimize2,
  MessageSquareText,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SunMedium,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { DeviceProfile } from './device'
import { useArtworkSource } from './artwork'
import { getAndroidBridge, isAndroidNative } from './api'
import type { BilibiliDanmaku, ContentItem } from './types'
import type { ContentCollection } from './types'

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2, 3] as const
const DANMAKU_AREAS = [
  { value: 'full', label: '全屏' },
  { value: 'half', label: '半屏' },
  { value: 'quarter', label: '四分之一' },
] as const
type DanmakuArea = (typeof DANMAKU_AREAS)[number]['value']
const DANMAKU_SPEEDS = [0.6, 0.8, 1, 1.2] as const

interface GestureSession {
  pointerId: number
  startX: number
  startY: number
  startTime: number
  targetTime: number
  wasPlaying: boolean
  mode: 'pending' | 'seek' | 'boost' | 'brightness' | 'volume' | 'ignore'
  locked: boolean
  startRatio: number
  startBrightness: number
  startVolume: number
  startMuted: boolean
  startSystemVolume: number | null
}

interface ProgressGesture {
  pointerId: number
  startX: number
  startTime: number
  duration: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '00:00'
  const total = Math.floor(value)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function rateLabel(rate: number): string {
  return rate === 1 ? '正常' : `${rate}x`
}

function parseDurationHint(value: string): number {
  const text = value.trim().toLowerCase()
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|小時|h)/)
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分鐘|分|min|m)/)
  const seconds = text.match(/(\d+(?:\.\d+)?)\s*(?:秒|sec|s)/)
  const total = (hours ? Number(hours[1]) * 3600 : 0) + (minutes ? Number(minutes[1]) * 60 : 0) + (seconds ? Number(seconds[1]) : 0)
  return Number.isFinite(total) && total > 0 ? Math.round(total) : 0
}

function seekDeltaForSwipe(distanceRatio: number, duration: number): number {
  const ratio = clamp(Math.abs(distanceRatio), 0, 1)
  const fineSpan = clamp(duration * 0.015, 6, 15)
  if (ratio <= 0.12) return fineSpan * (ratio / 0.12)
  // 小幅移动保持秒级精度，大幅移动逐渐切换到分钟级跳转。
  const fastRatio = (ratio - 0.12) / 0.88
  return Math.max(fineSpan, duration * (0.02 + 0.65 * Math.pow(fastRatio, 1.1)))
}

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>
  unlock?: () => void
}

function unlockScreenOrientation(): void {
  const orientation = window.screen.orientation as LockableScreenOrientation
  try {
    orientation.unlock?.()
  } catch {
    // 原生壳会在退出全屏时恢复方向，这里只处理支持标准接口的浏览器。
  }
}

export function VideoPlayer({
  item,
  url,
  profile,
  danmaku = [],
  collection = null,
  autoNext = false,
  onAutoNextChange,
  onSelectEpisode,
  onEnded,
  onClose,
}: {
  item: ContentItem
  url: string
  profile: DeviceProfile
  danmaku?: BilibiliDanmaku[]
  collection?: ContentCollection | null
  autoNext?: boolean
  onAutoNextChange?: (enabled: boolean) => void
  onSelectEpisode?: (item: ContentItem) => void
  onEnded?: () => void
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<HTMLInputElement>(null)
  const hideTimerRef = useRef<number | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const keyHoldTimerRef = useRef<number | null>(null)
  const keyHoldIntervalRef = useRef<number | null>(null)
  const heldKeyRef = useRef<string | null>(null)
  const gestureRef = useRef<GestureSession | null>(null)
  const progressGestureRef = useRef<ProgressGesture | null>(null)
  const progressWasPlayingRef = useRef(false)
  const selectedRateRef = useRef(1)
  const initialPositionPendingRef = useRef(true)
  const onCloseRef = useRef(onClose)
  const poster = useArtworkSource(item.cover)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [selectedRate, setSelectedRate] = useState(1)
  const [rateMenuOpen, setRateMenuOpen] = useState(false)
  const [danmakuMenuOpen, setDanmakuMenuOpen] = useState(false)
  const [episodeMenuOpen, setEpisodeMenuOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement))
  const [lockedBoost, setLockedBoost] = useState(false)
  const [seekPreview, setSeekPreview] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [danmakuVisible, setDanmakuVisible] = useState(true)
  const [danmakuArea, setDanmakuArea] = useState<DanmakuArea>('half')
  const [danmakuSpeed, setDanmakuSpeed] = useState(0.8)
  const [brightness, setBrightness] = useState(1)
  const androidNative = isAndroidNative()
  const androidBridge = getAndroidBridge()
  const gestureTapFallbackRef = useRef(false)
  const isHlsSource = /\.m3u8(?:$|\?)/i.test(url)
  const durationHint = parseDurationHint(item.duration)
  const displayDuration = isHlsSource && durationHint > 0 ? durationHint : duration

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const clearTimer = (reference: { current: number | null }) => {
    if (reference.current !== null) window.clearTimeout(reference.current)
    reference.current = null
  }

  const revealControls = useCallback(() => {
    setControlsVisible(true)
    clearTimer(hideTimerRef)
    const video = videoRef.current
    if (video && !video.paused && profile !== 'tv' && !rateMenuOpen && !danmakuMenuOpen && !episodeMenuOpen) {
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2800)
    }
  }, [danmakuMenuOpen, episodeMenuOpen, profile, rateMenuOpen])

  const flashNotice = useCallback((message: string, timeout = 1100) => {
    clearTimer(noticeTimerRef)
    setNotice(message)
    if (timeout > 0) noticeTimerRef.current = window.setTimeout(() => setNotice(''), timeout)
  }, [])

  const nativeScreenBrightness = useCallback(() => {
    const value = androidBridge?.getScreenBrightnessPercent?.()
    return typeof value === 'number' && Number.isFinite(value) ? clamp(value / 100, 0.05, 1) : brightness
  }, [androidBridge, brightness])

  const nativeMediaVolume = useCallback(() => {
    const value = androidBridge?.getMediaVolumePercent?.()
    return typeof value === 'number' && Number.isFinite(value) ? clamp(value / 100, 0, 1) : null
  }, [androidBridge])

  const applyBrightness = useCallback((value: number) => {
    const next = androidNative ? clamp(value, 0.05, 1) : clamp(value, 0.35, 1.6)
    setBrightness(next)
    if (androidNative) androidBridge?.setScreenBrightnessPercent?.(Math.round(next * 100))
    return next
  }, [androidBridge, androidNative])

  const applyVolume = useCallback((value: number) => {
    const next = clamp(value, 0, 1)
    const video = videoRef.current
    if (androidNative) {
      androidBridge?.setMediaVolumePercent?.(Math.round(next * 100))
      if (video) {
        video.muted = false
        video.volume = 1
      }
    } else if (video) {
      video.muted = false
      video.volume = next
    }
    return next
  }, [androidBridge, androidNative])

  const togglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
    revealControls()
  }, [revealControls])

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current
    if (!video) return
    const mediaDuration = isHlsSource && durationHint > 0 ? Math.max(video.duration || 0, durationHint) : video.duration
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return
    video.currentTime = clamp(video.currentTime + seconds, 0, mediaDuration)
    setCurrentTime(video.currentTime)
    flashNotice(`${seconds < 0 ? '后退' : '前进'} ${Math.abs(seconds)} 秒`)
    revealControls()
  }, [durationHint, flashNotice, isHlsSource, revealControls])

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current
    if (!root) return
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } finally {
        unlockScreenOrientation()
      }
      return
    }
    try {
      await root.requestFullscreen()
    } catch {
      const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
      video?.webkitEnterFullscreen?.()
      return
    }
    if (profile === 'mobile') {
      const orientation = window.screen.orientation as LockableScreenOrientation
      try {
        await orientation.lock?.('landscape')
      } catch {
        // Android 原生全屏容器还会执行横屏切换，不让浏览器差异中断播放。
      }
    }
  }, [profile])

  useEffect(() => {
    const update = () => {
      const active = Boolean(document.fullscreenElement)
      setFullscreen(active)
      if (!active) unlockScreenOrientation()
    }
    update()
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: Hls | null = null
    const beginPlayback = () => {
      // 只在新媒体源首次进入时归零，避免浏览器/WebView 恢复旧的媒体时间点。
      try { video.currentTime = 0 } catch { /* 某些 HLS WebView 在元数据前不允许写入 */ }
      video.playbackRate = selectedRateRef.current
      void video.play().catch(() => setControlsVisible(true))
    }
    video.playbackRate = selectedRateRef.current
    initialPositionPendingRef.current = true
    try { video.currentTime = 0 } catch { /* 等待 loadedmetadata 再归零 */ }
    setCurrentTime(0)
    setDuration(0)
    if (profile !== 'mobile') rootRef.current?.focus()
    if (/\.m3u8(?:$|\?)/i.test(url) && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, maxBufferLength: 60, backBufferLength: 30 })
      hls.attachMedia(video)
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(url))
      hls.on(Hls.Events.MANIFEST_PARSED, beginPlayback)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) flashNotice('在线播放暂时中断，请关闭后重试', 3000)
      })
    } else {
      video.src = url
      video.load()
      beginPlayback()
    }
    return () => {
      hls?.destroy()
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [flashNotice, profile, url])

  const adjustVolume = useCallback((delta: number) => {
    const video = videoRef.current
    if (!video) return
    const current = androidNative ? (nativeMediaVolume() ?? volume) : video.volume
    const next = applyVolume(current + delta)
    setVolume(next)
    flashNotice(`音量 ${Math.round(next * 100)}%`)
    revealControls()
  }, [androidNative, applyVolume, flashNotice, nativeMediaVolume, revealControls, volume])

  const stopHeldSeek = useCallback(() => {
    clearTimer(keyHoldTimerRef)
    if (keyHoldIntervalRef.current !== null) window.clearInterval(keyHoldIntervalRef.current)
    keyHoldIntervalRef.current = null
    heldKeyRef.current = null
  }, [])

  const startHeldSeek = useCallback((key: 'ArrowLeft' | 'ArrowRight', fine: boolean) => {
    if (heldKeyRef.current === key) return
    stopHeldSeek()
    heldKeyRef.current = key
    const direction = key === 'ArrowLeft' ? -1 : 1
    seekBy(direction * (fine ? 1 : 5))
    keyHoldTimerRef.current = window.setTimeout(() => {
      keyHoldIntervalRef.current = window.setInterval(() => seekBy(direction * 2), 140)
    }, 360)
  }, [seekBy, stopHeldSeek])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const root = rootRef.current
      if (!root) return
      const active = document.activeElement
      const inside = active instanceof Node && root.contains(active)
      const remoteBack = event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'GoBack' || event.keyCode === 461
      if (remoteBack) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (!inside) return
      if (event.key === 'MediaPlayPause' || event.key === 'Play' || event.key === 'Pause') {
        event.preventDefault()
        togglePlayback()
        return
      }
      if (profile === 'tv') {
        if (active === root) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            togglePlayback()
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            seekBy(event.key === 'ArrowLeft' ? -10 : 10)
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            progressRef.current?.focus()
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            root.querySelector<HTMLElement>('[data-tv-close]')?.focus()
          }
          return
        }
        if (active === progressRef.current && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault()
          seekBy(event.key === 'ArrowLeft' ? -10 : 10)
        }
        return
      }
      const interactive = active instanceof HTMLElement && Boolean(active.closest('button, input'))
      if (interactive) return
      if (event.key === ' ' || event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        togglePlayback()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        if (!event.repeat) startHeldSeek(event.key, event.shiftKey)
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        adjustVolume(event.key === 'ArrowUp' ? 0.05 : -0.05)
      } else if (event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault()
        void toggleFullscreen()
      } else if (event.key.toLocaleLowerCase() === 'm') {
        event.preventDefault()
        if (videoRef.current) videoRef.current.muted = !videoRef.current.muted
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === heldKeyRef.current) stopHeldSeek()
    }
    const handleBlur = () => stopHeldSeek()
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
      stopHeldSeek()
    }
  }, [adjustVolume, profile, seekBy, startHeldSeek, stopHeldSeek, toggleFullscreen, togglePlayback])

  useEffect(() => () => {
    clearTimer(hideTimerRef)
    clearTimer(noticeTimerRef)
    clearTimer(holdTimerRef)
    stopHeldSeek()
  }, [stopHeldSeek])

  useEffect(() => () => {
    androidBridge?.resetScreenBrightness?.()
  }, [androidBridge])

  const beginGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (profile !== 'mobile') return
    const video = videoRef.current
    if (!video) return
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    const session: GestureSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: video.currentTime,
      targetTime: video.currentTime,
      wasPlaying: !video.paused,
      mode: 'pending',
      locked: false,
      startRatio: clamp((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1),
      startBrightness: androidNative ? nativeScreenBrightness() : brightness,
      startVolume: androidNative ? (nativeMediaVolume() ?? video.volume) : video.volume,
      startMuted: video.muted,
      startSystemVolume: androidNative ? nativeMediaVolume() : null,
    }
    gestureRef.current = session
    gestureTapFallbackRef.current = true
    clearTimer(holdTimerRef)
    holdTimerRef.current = window.setTimeout(() => {
      if (gestureRef.current !== session || session.mode !== 'pending') return
      session.mode = 'boost'
      video.playbackRate = 2
      void video.play()
      setControlsVisible(false)
      setNotice('2倍速播放中 · 上滑锁定')
    }, 520)
  }

  const moveGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = gestureRef.current
    const video = videoRef.current
    if (!session || session.pointerId !== event.pointerId || !video) return
    const deltaX = event.clientX - session.startX
    const deltaY = event.clientY - session.startY
    if (session.mode === 'pending' && (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12)) {
      gestureTapFallbackRef.current = false
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
        clearTimer(holdTimerRef)
        if (session.startRatio <= 0.36) session.mode = 'brightness'
        else if (session.startRatio >= 0.64) session.mode = 'volume'
        else session.mode = 'ignore'
      } else if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
        clearTimer(holdTimerRef)
        session.mode = 'seek'
        video.pause()
      }
    }
    if (session.mode === 'seek') {
      const width = Math.max(240, event.currentTarget.clientWidth)
      const mediaDuration = (isHlsSource && durationHint > 0 ? durationHint : video.duration || duration) || 0
      const span = seekDeltaForSwipe(deltaX / width, mediaDuration)
      session.targetTime = clamp(Math.round(session.startTime + (deltaX < 0 ? -span : span)), 0, mediaDuration)
      setSeekPreview(session.targetTime)
      setNotice(`${deltaX < 0 ? '后退' : '前进'}至 ${formatTime(session.targetTime)}`)
      return
    }
    if (session.mode === 'brightness') {
      const next = applyBrightness(session.startBrightness - (deltaY / Math.max(1, event.currentTarget.clientHeight)) * 1.05)
      setNotice(`亮度 ${Math.round(next * 100)}%`)
      return
    }
    if (session.mode === 'volume') {
      const next = applyVolume(session.startVolume - (deltaY / Math.max(1, event.currentTarget.clientHeight)) * 1.05)
      setVolume(next)
      setNotice(`音量 ${Math.round(next * 100)}%`)
      return
    }
    if (session.mode === 'boost' && deltaY < -58 && !session.locked) {
      session.locked = true
      setLockedBoost(true)
      setNotice('')
    }
  }

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = gestureRef.current
    const video = videoRef.current
    if (!session || session.pointerId !== event.pointerId || !video) return
    clearTimer(holdTimerRef)
    gestureTapFallbackRef.current = false
    if (session.mode === 'seek') {
      video.currentTime = session.targetTime
      setCurrentTime(session.targetTime)
      setSeekPreview(null)
      flashNotice(`已定位到 ${formatTime(session.targetTime)}`)
      if (session.wasPlaying) void video.play()
    } else if (session.mode === 'brightness' || session.mode === 'volume') {
      flashNotice(session.mode === 'brightness'
        ? `亮度 ${Math.round((androidNative ? nativeScreenBrightness() : brightness) * 100)}%`
        : `音量 ${Math.round((androidNative ? (nativeMediaVolume() ?? volume) : video.volume) * 100)}%`)
    } else if (session.mode === 'boost') {
      if (!session.locked) {
        video.playbackRate = selectedRateRef.current
        if (!session.wasPlaying) video.pause()
        setNotice('')
      }
    } else if (session.mode === 'ignore') {
      setNotice('')
    } else {
      setControlsVisible((visible) => !visible)
    }
    gestureRef.current = null
  }

  const cancelGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = gestureRef.current
    const video = videoRef.current
    if (!session || session.pointerId !== event.pointerId || !video) return
    clearTimer(holdTimerRef)
    if (session.mode === 'boost' && !session.locked) {
      video.playbackRate = selectedRateRef.current
      if (!session.wasPlaying) video.pause()
    }
    gestureTapFallbackRef.current = false
    if (session.mode === 'brightness') applyBrightness(session.startBrightness)
    if (session.mode === 'volume') {
      video.muted = session.startMuted
      applyVolume(session.startVolume)
      setVolume(session.startVolume)
    }
    setSeekPreview(null)
    setNotice('')
    gestureRef.current = null
  }

  const unlockBoost = () => {
    const video = videoRef.current
    if (video) video.playbackRate = selectedRateRef.current
    setLockedBoost(false)
    flashNotice(`已恢复 ${rateLabel(selectedRateRef.current)}速度`)
  }

  const chooseRate = (rate: number) => {
    selectedRateRef.current = rate
    setSelectedRate(rate)
    setLockedBoost(false)
    if (videoRef.current) videoRef.current.playbackRate = rate
    setRateMenuOpen(false)
    flashNotice(`${rateLabel(rate)}速度`)
  }

  const updateBuffered = () => {
    const video = videoRef.current
    if (!video || !video.duration || !video.buffered.length) return
    setBuffered(video.buffered.end(video.buffered.length - 1))
  }

  const beginProgressSeek = (event: ReactPointerEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    progressWasPlayingRef.current = !video.paused
    video.pause()
    if (profile === 'mobile' && (video.duration > 0 || displayDuration > 0)) {
      progressGestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startTime: video.currentTime,
        duration: displayDuration || video.duration,
      }
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 兼容旧版 WebView */ }
    }
  }

  const moveProgressSeek = (event: ReactPointerEvent<HTMLInputElement>) => {
    const gesture = progressGestureRef.current
    const video = videoRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || !video) return
    const width = Math.max(180, event.currentTarget.clientWidth)
    const delta = seekDeltaForSwipe((event.clientX - gesture.startX) / width, gesture.duration)
    const next = clamp(Math.round(gesture.startTime + (event.clientX < gesture.startX ? -delta : delta)), 0, gesture.duration)
    event.preventDefault()
    setSeekPreview(next)
    setCurrentTime(next)
    video.currentTime = next
    flashNotice(`定位到 ${formatTime(next)}`)
  }

  const finishProgressSeek = (event?: ReactPointerEvent<HTMLInputElement>) => {
    if (event && progressGestureRef.current && progressGestureRef.current.pointerId !== event.pointerId) return
    if (progressWasPlayingRef.current) void videoRef.current?.play()
    progressWasPlayingRef.current = false
    progressGestureRef.current = null
    setSeekPreview(null)
  }

  const togglePictureInPicture = async () => {
    const video = videoRef.current
    if (!video || !document.pictureInPictureEnabled) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch {
      flashNotice('当前设备不支持画中画')
    }
  }

  const progress = displayDuration > 0 ? ((seekPreview ?? currentTime) / displayDuration) * 100 : 0
  const bufferProgress = displayDuration > 0 ? (buffered / displayDuration) * 100 : 0
  const progressStyle = {
    '--played-percent': `${clamp(progress, 0, 100)}%`,
    '--buffered-percent': `${clamp(bufferProgress, 0, 100)}%`,
  } as CSSProperties
  const danmakuLaneCount = danmakuArea === 'full' ? 10 : danmakuArea === 'half' ? 6 : 3
  const danmakuWindow = 7 / danmakuSpeed
  const danmakuLaneGap = 2.8 / danmakuSpeed
  const danmakuLanes = Array.from({ length: danmakuLaneCount }, () => -Infinity)
  const activeDanmaku = danmakuVisible
    ? danmaku
      .filter((entry) => entry.time <= currentTime && entry.time > currentTime - danmakuWindow)
      .sort((left, right) => left.time - right.time)
      .map((entry) => {
        const lane = danmakuLanes.findIndex((lastTime) => entry.time - lastTime >= danmakuLaneGap)
        if (lane < 0) return null
        danmakuLanes[lane] = entry.time
        return { entry, lane }
      })
      .filter((entry): entry is { entry: BilibiliDanmaku; lane: number } => Boolean(entry))
      .slice(-danmakuLaneCount * 2)
    : []
  const danmakuLayerStyle = {
    '--danmaku-area-height': danmakuArea === 'full' ? '82%' : danmakuArea === 'half' ? '50%' : '25%',
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      className={`lumi-video-player controls-${controlsVisible || profile === 'tv' ? 'visible' : 'hidden'} profile-${profile}`}
      style={{ '--video-brightness': androidNative ? 1 : brightness } as CSSProperties}
      tabIndex={0}
      data-tv-initial
      onMouseMove={profile === 'mobile' ? undefined : revealControls}
      onFocus={revealControls}
    >
      <video
        ref={videoRef}
        poster={poster || undefined}
        autoPlay
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0)
          if (initialPositionPendingRef.current) {
            try { event.currentTarget.currentTime = 0 } catch { /* 忽略不支持元数据前定位的 WebView */ }
            initialPositionPendingRef.current = false
            setCurrentTime(0)
          }
          event.currentTarget.playbackRate = selectedRateRef.current
          void event.currentTarget.play().catch(() => undefined)
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onProgress={updateBuffered}
        onPlay={() => { setPlaying(true); revealControls() }}
        onPause={() => { setPlaying(false); setControlsVisible(true) }}
        onVolumeChange={(event) => {
          const systemVolume = androidNative ? nativeMediaVolume() : null
          setVolume(systemVolume ?? event.currentTarget.volume)
          setMuted(androidNative ? (systemVolume ?? 0) <= 0 : event.currentTarget.muted)
        }}
        onEnded={() => { setPlaying(false); setControlsVisible(true); onEnded?.() }}
      />
      {activeDanmaku.length > 0 && (
        <div className={`video-danmaku-layer area-${danmakuArea}`} style={danmakuLayerStyle} aria-hidden="true">
          {activeDanmaku.map(({ entry, lane }) => (
            <span
              key={entry.id}
              style={{
                top: `${6 + lane * (88 / danmakuLaneCount)}%`,
                color: `#${entry.color.toString(16).padStart(6, '0')}`,
                animationDuration: `${7 / danmakuSpeed}s`,
              }}
            >{entry.text}</span>
          ))}
        </div>
      )}
      <div
        className="video-gesture-zone"
        aria-hidden="true"
        onPointerDown={beginGesture}
        onPointerMove={moveGesture}
        onPointerUp={finishGesture}
        onPointerCancel={cancelGesture}
        onClick={() => {
          if (profile !== 'mobile') {
            togglePlayback()
            return
          }
          if (!gestureTapFallbackRef.current) return
          gestureTapFallbackRef.current = false
          clearTimer(holdTimerRef)
          gestureRef.current = null
          setControlsVisible((visible) => !visible)
        }}
      />
      <div className="video-top-controls" data-player-control>
        <div className="video-title"><span>{item.source ?? '家庭馆藏'}</span><strong>{item.title}</strong></div>
        <button type="button" className="player-icon-button" aria-label="关闭播放器" data-tv-close onClick={onClose}><X size={22} /></button>
      </div>
      {!playing && (
        <button type="button" className="video-center-play" aria-label="播放" data-player-control onClick={togglePlayback}><Play size={38} fill="currentColor" /></button>
      )}
      {notice && <div className="video-notice" aria-live="polite">{notice.startsWith('亮度') && <SunMedium size={16} />}{notice}</div>}
      {lockedBoost && (
        <button type="button" className="boost-lock" data-player-control onClick={unlockBoost}><Check size={16} />2倍速已锁定 · 点击解锁</button>
      )}
      <div className="video-bottom-controls" data-player-control>
        <div className="video-progress-wrap" style={progressStyle}>
          <input
            ref={progressRef}
            className="video-progress"
            type="range"
            min="0"
            max={displayDuration || 0}
            step="0.1"
            value={seekPreview ?? currentTime}
            aria-label="播放进度"
            onPointerDown={beginProgressSeek}
            onPointerMove={moveProgressSeek}
            onPointerUp={finishProgressSeek}
            onPointerCancel={finishProgressSeek}
            onChange={(event) => {
              if (progressGestureRef.current) return
              const next = Number(event.target.value)
              if (videoRef.current) videoRef.current.currentTime = next
              setCurrentTime(next)
            }}
          />
        </div>
        <div className="video-control-row">
          <button type="button" className="player-icon-button" aria-label={playing ? '暂停' : '播放'} onClick={togglePlayback}>
            {playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
          </button>
          <button type="button" className="player-icon-button seek-button" aria-label="后退10秒" onClick={() => seekBy(-10)}><RotateCcw size={19} /><span>10</span></button>
          <button type="button" className="player-icon-button seek-button" aria-label="前进10秒" onClick={() => seekBy(10)}><RotateCw size={19} /><span>10</span></button>
          {profile !== 'tv' && (
            <div className="video-volume-control">
              <button type="button" className="player-icon-button" aria-label={muted ? '取消静音' : '静音'} onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted }}>
                {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              {profile === 'desktop' && <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} aria-label="音量" onChange={(event) => { if (videoRef.current) { videoRef.current.muted = false; videoRef.current.volume = Number(event.target.value) } }} />}
            </div>
          )}
          <span className="video-time">{formatTime(seekPreview ?? currentTime)} / {formatTime(displayDuration)}</span>
          <div className="video-control-spacer" />
          {danmaku.length > 0 && (
            <div className="video-danmaku-control">
              <button type="button" className={'player-text-button ' + (danmakuVisible ? 'active' : '')} aria-label={danmakuVisible ? '关闭弹幕' : '开启弹幕'} onClick={() => setDanmakuVisible((visible) => !visible)}>
                <MessageSquareText size={18} />弹幕
              </button>
              <button type="button" className="player-text-button danmaku-area-button" aria-label="弹幕显示范围" aria-expanded={danmakuMenuOpen} onClick={() => { setDanmakuMenuOpen((open) => !open); setRateMenuOpen(false); setEpisodeMenuOpen(false); setControlsVisible(true) }}>
                {DANMAKU_AREAS.find((entry) => entry.value === danmakuArea)?.label}
              </button>
              {danmakuMenuOpen && <div className="video-danmaku-menu">
                {DANMAKU_AREAS.map((entry) => <button type="button" key={entry.value} className={danmakuArea === entry.value ? 'active' : ''} aria-pressed={danmakuArea === entry.value} onClick={() => { setDanmakuArea(entry.value); setDanmakuMenuOpen(false); flashNotice(`弹幕显示范围：${entry.label}`) }}><span>{entry.label}</span>{danmakuArea === entry.value && <Check size={16} />}</button>)}
                <div className="video-menu-heading">弹幕速度</div>
                {DANMAKU_SPEEDS.map((speed) => <button type="button" key={speed} className={danmakuSpeed === speed ? 'active' : ''} aria-pressed={danmakuSpeed === speed} onClick={() => { setDanmakuSpeed(speed); flashNotice(`弹幕速度 ${speed}x`) }}><span>{speed}x</span>{danmakuSpeed === speed && <Check size={16} />}</button>)}
              </div>}
            </div>
          )}
          {collection && onSelectEpisode && (
            <div className="video-episode-control">
              <button type="button" className="player-text-button" aria-label="切换合集选集" aria-expanded={episodeMenuOpen} onClick={() => { setEpisodeMenuOpen((open) => !open); setRateMenuOpen(false); setDanmakuMenuOpen(false); setControlsVisible(true) }}><ListVideo size={18} />选集</button>
              {episodeMenuOpen && (
                <div className="video-episode-menu" aria-label="合集选集">
                  <label className="video-autoplay-option"><input type="checkbox" checked={autoNext} onChange={(event) => onAutoNextChange?.(event.target.checked)} /><span>自动连播下一集</span></label>
                  <div className="video-menu-heading">{collection.title}</div>
                  {collection.episodes.map((episode) => <button type="button" key={episode.id} className={episode.id === item.id ? 'active' : ''} aria-current={episode.id === item.id ? 'true' : undefined} onClick={() => { if (episode.id !== item.id) onSelectEpisode(episode); setEpisodeMenuOpen(false) }}><span>{episode.episodeIndex ?? '-'}</span><strong>{episode.title}</strong>{episode.id === item.id && <Check size={16} />}</button>)}
                </div>
              )}
            </div>
          )}
          <div className="video-rate-control">
            <button type="button" className="player-text-button" aria-label="播放速度" aria-expanded={rateMenuOpen} onClick={() => { setRateMenuOpen((open) => !open); setDanmakuMenuOpen(false); setEpisodeMenuOpen(false); setControlsVisible(true) }}><Gauge size={18} />{rateLabel(selectedRate)}</button>
            {rateMenuOpen && (
              <div className="video-rate-menu">
                {PLAYBACK_RATES.map((rate) => (
                  <button type="button" className={selectedRate === rate ? 'active' : ''} key={rate} onClick={() => chooseRate(rate)}>
                    <span>{rateLabel(rate)}</span>{selectedRate === rate && <Check size={16} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {profile === 'desktop' && document.pictureInPictureEnabled && (
            <button type="button" className="player-icon-button" aria-label="画中画" onClick={() => { void togglePictureInPicture() }}><PictureInPicture2 size={20} /></button>
          )}
          <button type="button" className="player-icon-button" aria-label={fullscreen ? '退出全屏' : '全屏'} onClick={() => { void toggleFullscreen() }}>
            {fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </div>
      </div>
    </div>
  )
}
