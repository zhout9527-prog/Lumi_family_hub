import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Mic, Play, RefreshCw, ShieldCheck, Square, Volume2, Waves, X } from 'lucide-react'
import { Pet3DViewer } from './Pet3DViewer'
import type { PetSpecies } from './types'

const VOICE_PROFILES: Record<string, { label: string; rate: number }> = {
  alpaca: { label: '软绵绵声线', rate: 1.18 },
  bull: { label: '沉稳低音', rate: 0.76 },
  cow: { label: '温柔慢声', rate: 0.88 },
  deer: { label: '林间清声', rate: 1.1 },
  donkey: { label: '憨厚鼻音', rate: 0.82 },
  fox: { label: '机灵高音', rate: 1.3 },
  horse: { label: '爽朗中音', rate: 0.94 },
  'horse-white': { label: '轻柔亮声', rate: 1.04 },
  husky: { label: '活力低音', rate: 0.84 },
  shibainu: { label: '元气声线', rate: 1.2 },
  stag: { label: '森林深声', rate: 0.72 },
  wolf: { label: '勇敢低声', rate: 0.68 },
  cat: { label: '奶呼呼声线', rate: 1.38 },
}

type EchoState = 'idle' | 'requesting' | 'recording' | 'processing' | 'ready' | 'playing' | 'error'

function recorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find((type) => MediaRecorder.isTypeSupported(type))
}

export function EchoCompanion({
  species,
  initialSpeciesId,
  onClose,
}: {
  species: PetSpecies[]
  initialSpeciesId?: string
  onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState(
    species.some((item) => item.id === initialSpeciesId) ? initialSpeciesId! : species[0]?.id ?? '',
  )
  const [state, setState] = useState<EchoState>('idle')
  const [message, setMessage] = useState('点一下麦克风，说完后停顿一秒，伙伴就会学你说话。')
  const [animationNonce, setAnimationNonce] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioUrlRef = useRef('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const analyserFrameRef = useRef(0)
  const maximumTimerRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const disposedRef = useRef(false)
  const selectedIdRef = useRef(selectedId)
  const onCloseRef = useRef(onClose)

  const selected = useMemo(
    () => species.find((item) => item.id === selectedId) ?? species[0],
    [selectedId, species],
  )
  const voice = VOICE_PROFILES[selected?.id ?? ''] ?? { label: '伙伴声线', rate: 1.08 }

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const stopPlayback = () => {
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current.currentTime = 0
    audioRef.current = null
  }

  const releaseCapture = () => {
    window.cancelAnimationFrame(analyserFrameRef.current)
    window.clearTimeout(maximumTimerRef.current)
    analyserFrameRef.current = 0
    maximumTimerRef.current = 0
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void audioContextRef.current?.close().catch(() => undefined)
    audioContextRef.current = null
  }

  const playEcho = async () => {
    const source = audioUrlRef.current
    if (!source) return
    stopPlayback()
    const profile = VOICE_PROFILES[selectedIdRef.current] ?? { label: '伙伴声线', rate: 1.08 }
    const audio = new Audio(source)
    audio.preload = 'auto'
    audio.playbackRate = profile.rate
    audio.preservesPitch = false
    const webkitAudio = audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }
    webkitAudio.webkitPreservesPitch = false
    audio.onended = () => {
      if (!disposedRef.current) {
        setState('ready')
        setMessage('还想听一次，或者换一位伙伴试试吗？')
      }
      audioRef.current = null
    }
    audio.onerror = () => {
      if (!disposedRef.current) {
        setState('error')
        setMessage('这次录音没有播放成功，请重新录一句。')
      }
    }
    audioRef.current = audio
    setAnimationNonce((value) => value + 1)
    setState('playing')
    setMessage(`${profile.label}正在学你说话…`)
    try {
      await audio.play()
    } catch {
      setState('ready')
      setMessage('系统暂时阻止了自动播放，点“再听一次”就可以播放。')
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setState('processing')
    setMessage('伙伴正在认真学这句话…')
    recorder.stop()
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('error')
      setMessage('当前设备没有提供录音能力，请在手机或带麦克风的电脑上试玩。')
      return
    }
    stopPlayback()
    setState('requesting')
    setMessage('请允许 Lumi 使用麦克风；录音只在这台设备里处理。')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (disposedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = recorderMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const chunks = chunksRef.current
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm'
        releaseCapture()
        recorderRef.current = null
        if (disposedRef.current) return
        if (chunks.length === 0) {
          setState('error')
          setMessage('没有听清这句话，请靠近麦克风再试一次。')
          return
        }
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = URL.createObjectURL(new Blob(chunks, { type }))
        setState('ready')
        void playEcho()
      }
      recorder.start(160)
      setState('recording')
      setMessage('我在听，说完后停顿一秒，或再点一下结束。')

      try {
        const AudioContextConstructor = window.AudioContext
        if (AudioContextConstructor) {
          const audioContext = new AudioContextConstructor()
          audioContextRef.current = audioContext
          const analyser = audioContext.createAnalyser()
          analyser.fftSize = 1024
          audioContext.createMediaStreamSource(stream).connect(analyser)
          const samples = new Uint8Array(analyser.fftSize)
          const startedAt = performance.now()
          let heardSpeech = false
          let lastSpeechAt = startedAt
          const monitorSilence = () => {
            if (recorder.state !== 'recording') return
            analyser.getByteTimeDomainData(samples)
            let squareSum = 0
            for (const sample of samples) {
              const normalized = (sample - 128) / 128
              squareSum += normalized * normalized
            }
            const volume = Math.sqrt(squareSum / samples.length)
            const now = performance.now()
            if (volume > 0.035) {
              heardSpeech = true
              lastSpeechAt = now
            }
            if (heardSpeech && now - lastSpeechAt > 1050 && now - startedAt > 1400) {
              stopRecording()
              return
            }
            analyserFrameRef.current = window.requestAnimationFrame(monitorSilence)
          }
          monitorSilence()
        }
      } catch {
        // 某些电视 WebView 没有音量分析能力，仍保留手动停止和最长时限。
      }
      maximumTimerRef.current = window.setTimeout(stopRecording, 12_000)
    } catch (error) {
      releaseCapture()
      setState('error')
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      setMessage(denied ? '麦克风权限没有开启。请到系统设置允许 Lumi 使用麦克风后再试。' : '麦克风暂时不可用，请检查是否被其他应用占用。')
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      disposedRef.current = true
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      releaseCapture()
      stopPlayback()
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    }
  }, [])

  if (!selected) return null

  const isRecording = state === 'recording'
  const disabled = state === 'requesting' || state === 'processing'

  return (
    <div className="echo-backdrop" onMouseDown={onClose}>
      <section className="echo-modal" role="dialog" aria-modal="true" aria-labelledby="echo-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="echo-header">
          <div><span className="eyebrow">VOICE PLAYGROUND</span><h2 id="echo-title">声声岛</h2><p>你说一句，伙伴会换成自己的声线学一句。</p></div>
          <button type="button" className="icon-button echo-close" aria-label="关闭声声岛" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="echo-stage">
          <div className="echo-model" style={{ '--pet-accent': selected.accent } as CSSProperties}>
            <Pet3DViewer
              assetPath={selected.assetPath}
              speciesId={selected.id}
              name={selected.name}
              accent={selected.accent}
              animation={state === 'playing' ? 'talk' : 'idle'}
              animationNonce={animationNonce}
            />
          </div>
          <div className="echo-console">
            <div className="echo-voice-title"><Volume2 size={18} /><div><strong>{selected.name}</strong><span>{voice.label} · {voice.rate.toFixed(2)} 倍音高</span></div></div>
            <div className={`echo-wave ${isRecording ? 'is-listening' : ''}`} aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => <i key={index} style={{ '--echo-bar': index } as CSSProperties} />)}
            </div>
            <p className="echo-message" role="status">{message}</p>
            <div className="echo-controls">
              <button
                type="button"
                className={`button button-primary echo-record ${isRecording ? 'is-recording' : ''}`}
                onClick={isRecording ? stopRecording : () => void startRecording()}
                disabled={disabled}
              >
                {isRecording ? <Square size={17} fill="currentColor" /> : <Mic size={18} />}
                {isRecording ? '说完了' : state === 'requesting' ? '等待授权' : '开始说话'}
              </button>
              <button type="button" className="button button-quiet" onClick={() => void playEcho()} disabled={!audioUrlRef.current || isRecording || disabled}>
                {state === 'ready' ? <Play size={17} fill="currentColor" /> : <RefreshCw size={17} />}再听一次
              </button>
            </div>
            <div className="echo-privacy"><ShieldCheck size={15} /><span>录音不上传、不保存到 Server，关闭声声岛后立即清除。</span></div>
          </div>
        </div>
        <div className="echo-picker-heading"><div><Waves size={17} /><strong>换一位伙伴试玩</strong></div><span>{species.length} 种声线</span></div>
        <div className="echo-species-grid" role="list" aria-label="声声岛伙伴声线">
          {species.map((item) => {
            const profile = VOICE_PROFILES[item.id] ?? { label: '伙伴声线', rate: 1.08 }
            const active = item.id === selected.id
            return (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={`echo-species ${active ? 'is-selected' : ''}`}
                style={{ '--pet-accent': item.accent } as CSSProperties}
                aria-pressed={active}
                onClick={() => {
                  stopPlayback()
                  selectedIdRef.current = item.id
                  setSelectedId(item.id)
                  if (audioUrlRef.current) {
                    setState('ready')
                    setMessage(`已经换成${item.name}，点“再听一次”比较它的声音。`)
                  }
                }}
                disabled={isRecording || state === 'processing' || state === 'requesting'}
              >
                <span aria-hidden="true">{item.emoji}</span><strong>{item.name}</strong><small>{profile.label}</small>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
