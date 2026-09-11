import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import Hls from 'hls.js'
import {
  Check,
  Gauge,
  Maximize2,
  Minimize2,
  MessageSquareText,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { DeviceProfile } from './device'
import { useArtworkSource } from './artwork'
import type { BilibiliDanmaku, ContentItem } from './types'

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2, 3] as const

interface GestureSession {
  pointerId: number
  startX: number
  startY: number
  startTime: number
  targetTime: number
  wasPlaying: boolean
  mode: 'pending' | 'seek' | 'boost'
  locked: boolean
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

export function VideoPlayer({
  item,
  url,
  profile,
  danmaku = [],
  onClose,
}: {
  item: ContentItem
  url: string
  profile: DeviceProfile
  danmaku?: BilibiliDanmaku[]
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
  const progressWasPlayingRef = useRef(false)
  const selectedRateRef = useRef(1)
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
  const [fullscreen, setFullscreen] = useState(false)
  const [lockedBoost, setLockedBoost] = useState(false)
  const [seekPreview, setSeekPreview] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [danmakuVisible, setDanmakuVisible] = useState(true)

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
    if (video && !video.paused && profile !== 'tv' && !rateMenuOpen) {
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2800)
    }
  }, [profile, rateMenuOpen])

  const flashNotice = useCallback((message: string, timeout = 1100) => {
    clearTimer(noticeTimerRef)
    setNotice(message)
    if (timeout > 0) noticeTimerRef.current = window.setTimeout(() => setNotice(''), timeout)
  }, [])

  const togglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
    revealControls()
  }, [revealControls])

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration)) return
    video.currentTime = clamp(video.currentTime + seconds, 0, video.duration)
    setCurrentTime(video.currentTime)
    flashNotice(`${seconds < 0 ? '后退' : '前进'} ${Math.abs(seconds)} 秒`)
    revealControls()
  }, [flashNotice, revealControls])

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current
    if (!root) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await root.requestFullscreen()
    } catch {
      const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
      video?.webkitEnterFullscreen?.()
    }
  }, [])

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: Hls | null = null
    const beginPlayback = () => {
      video.playbackRate = selectedRateRef.current
      void video.play().catch(() => setControlsVisible(true))
    }
    video.playbackRate = selectedRateRef.current
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
    video.muted = false
    video.volume = clamp(video.volume + delta, 0, 1)
    flashNotice(`音量 ${Math.round(video.volume * 100)}%`)
    revealControls()
  }, [flashNotice, revealControls])

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

  const beginGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (profile !== 'mobile') return
    const video = videoRef.current
    if (!video) return
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
    }
    gestureRef.current = session
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
    if (session.mode === 'pending' && Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
      clearTimer(holdTimerRef)
      session.mode = 'seek'
      video.pause()
    }
    if (session.mode === 'seek') {
      const width = Math.max(240, event.currentTarget.clientWidth)
      const span = clamp((video.duration || duration) * 0.04, 12, 32)
      session.targetTime = clamp(Math.round(session.startTime + (deltaX / width) * span), 0, video.duration || duration || 0)
      setSeekPreview(session.targetTime)
      setNotice(`${deltaX < 0 ? '后退' : '前进'}至 ${formatTime(session.targetTime)}`)
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
    if (session.mode === 'seek') {
      video.currentTime = session.targetTime
      setCurrentTime(session.targetTime)
      setSeekPreview(null)
      flashNotice(`已定位到 ${formatTime(session.targetTime)}`)
      if (session.wasPlaying) void video.play()
    } else if (session.mode === 'boost') {
      if (!session.locked) {
        video.playbackRate = selectedRateRef.current
        if (!session.wasPlaying) video.pause()
        setNotice('')
      }
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

  const beginProgressSeek = () => {
    const video = videoRef.current
    if (!video) return
    progressWasPlayingRef.current = !video.paused
    video.pause()
  }

  const finishProgressSeek = () => {
    if (progressWasPlayingRef.current) void videoRef.current?.play()
    progressWasPlayingRef.current = false
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

  const progress = duration > 0 ? ((seekPreview ?? currentTime) / duration) * 100 : 0
  const bufferProgress = duration > 0 ? (buffered / duration) * 100 : 0
  const progressStyle = {
    '--played-percent': `${clamp(progress, 0, 100)}%`,
    '--buffered-percent': `${clamp(bufferProgress, 0, 100)}%`,
  } as CSSProperties
  const activeDanmaku = danmakuVisible
    ? danmaku.filter((entry) => entry.time <= currentTime && entry.time > currentTime - 7).slice(-10)
    : []

  return (
    <div
      ref={rootRef}
      className={`lumi-video-player controls-${controlsVisible || profile === 'tv' ? 'visible' : 'hidden'} profile-${profile}`}
      tabIndex={0}
      data-tv-initial
      onMouseMove={revealControls}
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
          event.currentTarget.playbackRate = selectedRateRef.current
          void event.currentTarget.play().catch(() => undefined)
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onProgress={updateBuffered}
        onPlay={() => { setPlaying(true); revealControls() }}
        onPause={() => { setPlaying(false); setControlsVisible(true) }}
        onVolumeChange={(event) => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted) }}
        onEnded={() => { setPlaying(false); setControlsVisible(true) }}
      />
      {activeDanmaku.length > 0 && (
        <div className="video-danmaku-layer" aria-hidden="true">
          {activeDanmaku.map((entry, index) => (
            <span
              key={entry.id}
              style={{ top: `${8 + (index % 6) * 10}%`, color: `#${entry.color.toString(16).padStart(6, '0')}` }}
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
        onClick={() => { if (profile !== 'mobile') togglePlayback() }}
      />
      <div className="video-top-controls" data-player-control>
        <div className="video-title"><span>{item.source ?? '家庭馆藏'}</span><strong>{item.title}</strong></div>
        <button type="button" className="player-icon-button" aria-label="关闭播放器" data-tv-close onClick={onClose}><X size={22} /></button>
      </div>
      {!playing && (
        <button type="button" className="video-center-play" aria-label="播放" data-player-control onClick={togglePlayback}><Play size={38} fill="currentColor" /></button>
      )}
      {notice && <div className="video-notice" aria-live="polite">{notice}</div>}
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
            max={duration || 0}
            step="0.1"
            value={seekPreview ?? currentTime}
            aria-label="播放进度"
            onPointerDown={beginProgressSeek}
            onPointerUp={finishProgressSeek}
            onPointerCancel={finishProgressSeek}
            onChange={(event) => {
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
          <span className="video-time">{formatTime(seekPreview ?? currentTime)} / {formatTime(duration)}</span>
          <div className="video-control-spacer" />
          {danmaku.length > 0 && (
            <button type="button" className={'player-text-button ' + (danmakuVisible ? 'active' : '')} aria-label={danmakuVisible ? '关闭弹幕' : '开启弹幕'} onClick={() => setDanmakuVisible((visible) => !visible)}>
              <MessageSquareText size={18} />弹幕
            </button>
          )}
          <div className="video-rate-control">
            <button type="button" className="player-text-button" aria-label="播放速度" aria-expanded={rateMenuOpen} onClick={() => { setRateMenuOpen((open) => !open); setControlsVisible(true) }}><Gauge size={18} />{rateLabel(selectedRate)}</button>
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
