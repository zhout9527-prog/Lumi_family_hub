import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AudioLines, MessageCircle, Mic, Play, RefreshCw, ShieldCheck, Sparkles, Square, Volume2, Waves, X } from 'lucide-react'
import { Pet3DViewer } from './Pet3DViewer'
import type { PetSpecies } from './types'
import { renderCharacterVoice, voiceProfileFor } from './voiceEffects'
import { characterGreetingFor, chooseGreetingVoice } from './voiceGreetings'

type EchoState = 'idle' | 'requesting' | 'recording' | 'processing' | 'ready' | 'playing' | 'error'

function recorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find((type) => MediaRecorder.isTypeSupported(type))
}

export function EchoCompanion({ species, initialSpeciesId, listenerName, onClose }: {
  species: PetSpecies[]
  initialSpeciesId?: string
  listenerName: string
  onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState(
    species.some((item) => item.id === initialSpeciesId) ? initialSpeciesId! : species[0]?.id ?? '',
  )
  const [state, setState] = useState<EchoState>('idle')
  const [message, setMessage] = useState('伙伴会先向你问好；也可以录一句话，听它用角色声线演一遍。')
  const [animationNonce, setAnimationNonce] = useState(0)
  const [compareOriginal, setCompareOriginal] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const rawRecordingRef = useRef<Blob | null>(null)
  const renderedUrlRef = useRef('')
  const transientPlaybackUrlRef = useRef('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const analyserFrameRef = useRef(0)
  const maximumTimerRef = useRef(0)
  const captureAudioContextRef = useRef<AudioContext | null>(null)
  const renderTokenRef = useRef(0)
  const greetingTokenRef = useRef(0)
  const initialGreetingTimerRef = useRef(0)
  const greetingUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const disposedRef = useRef(false)
  const selectedIdRef = useRef(selectedId)
  const onCloseRef = useRef(onClose)

  const selected = useMemo(
    () => species.find((item) => item.id === selectedId) ?? species[0],
    [selectedId, species],
  )
  const voice = voiceProfileFor(selected?.id ?? '')
  const greeting = useMemo(
    () => characterGreetingFor(selected?.id ?? '', listenerName),
    [listenerName, selected?.id],
  )

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  const clearRenderedUrl = () => {
    if (renderedUrlRef.current) URL.revokeObjectURL(renderedUrlRef.current)
    renderedUrlRef.current = ''
  }

  const clearTransientPlaybackUrl = () => {
    if (transientPlaybackUrlRef.current) URL.revokeObjectURL(transientPlaybackUrlRef.current)
    transientPlaybackUrlRef.current = ''
  }

  const stopPlayback = () => {
    window.clearTimeout(initialGreetingTimerRef.current)
    initialGreetingTimerRef.current = 0
    greetingTokenRef.current += 1
    greetingUtteranceRef.current = null
    window.speechSynthesis?.cancel()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    audioRef.current = null
    clearTransientPlaybackUrl()
  }

  const playGreeting = (speciesId: string) => {
    stopPlayback()
    setCompareOriginal(false)
    const nextGreeting = characterGreetingFor(speciesId, listenerName)
    const synthesizer = window.speechSynthesis
    if (!synthesizer || typeof window.SpeechSynthesisUtterance === 'undefined') {
      setState(rawRecordingRef.current ? 'ready' : 'idle')
      setMessage('这台设备没有可用的系统语音，仍可录下你的话试听角色变声。')
      return
    }
    const token = ++greetingTokenRef.current
    const utterance = new SpeechSynthesisUtterance(nextGreeting.spokenText)
    utterance.lang = 'zh-CN'
    utterance.pitch = nextGreeting.pitch
    utterance.rate = nextGreeting.rate
    utterance.volume = 1
    utterance.voice = chooseGreetingVoice(synthesizer.getVoices(), nextGreeting) ?? null
    utterance.onstart = () => {
      if (disposedRef.current || token !== greetingTokenRef.current) return
      setAnimationNonce((value) => value + 1)
      setState('playing')
      setMessage(`${nextGreeting.title}正在和 ${listenerName.trim() || '小伙伴'} 打招呼…`)
    }
    utterance.onend = () => {
      if (disposedRef.current || token !== greetingTokenRef.current) return
      greetingUtteranceRef.current = null
      setState(rawRecordingRef.current ? 'ready' : 'idle')
      setMessage(`${nextGreeting.title}试听完成。换一位伙伴，可以直接比较它们的语气。`)
    }
    utterance.onerror = () => {
      if (disposedRef.current || token !== greetingTokenRef.current) return
      greetingUtteranceRef.current = null
      setState(rawRecordingRef.current ? 'ready' : 'idle')
      setMessage('系统语音这次没有播放成功，可以再点一次，或录下你的话试玩。')
    }
    greetingUtteranceRef.current = utterance
    setState('playing')
    setAnimationNonce((value) => value + 1)
    setMessage(`${nextGreeting.title}正在准备…`)
    synthesizer.speak(utterance)
  }

  const releaseCapture = () => {
    window.cancelAnimationFrame(analyserFrameRef.current)
    window.clearTimeout(maximumTimerRef.current)
    analyserFrameRef.current = 0
    maximumTimerRef.current = 0
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void captureAudioContextRef.current?.close().catch(() => undefined)
    captureAudioContextRef.current = null
  }

  const playSource = async (source: string, original = false) => {
    if (!source) return
    stopPlayback()
    if (original) transientPlaybackUrlRef.current = source
    const audio = new Audio(source)
    audio.preload = 'auto'
    // 角色音频已经离线渲染完成，播放时保持正常速度，避免旧版“快放变声”。
    audio.playbackRate = 1
    audio.preservesPitch = true
    const webkitAudio = audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }
    webkitAudio.webkitPreservesPitch = true
    audio.onended = () => {
      if (!disposedRef.current) {
        setState('ready')
        setMessage(original ? '这是原声；点“角色声线”听伙伴演绎。' : '角色声线演完啦，可以换伙伴比较不同风格。')
      }
      audioRef.current = null
      clearTransientPlaybackUrl()
    }
    audio.onerror = () => {
      if (!disposedRef.current) {
        setState('error')
        setMessage('这次音频没有播放成功，请重新录一句。')
      }
      clearTransientPlaybackUrl()
    }
    audioRef.current = audio
    setAnimationNonce((value) => value + 1)
    setState('playing')
    setMessage(original ? '正在播放未经处理的原声…' : `${voiceProfileFor(selectedIdRef.current).label}正在演绎你的话…`)
    try {
      await audio.play()
    } catch {
      stopPlayback()
      setState('ready')
      setMessage('系统暂时阻止了播放，再点一次播放按钮即可。')
    }
  }

  const playCharacter = async () => {
    if (!renderedUrlRef.current) return
    setCompareOriginal(false)
    await playSource(renderedUrlRef.current)
  }

  const playOriginal = async () => {
    const recording = rawRecordingRef.current
    if (!recording) return
    setCompareOriginal(true)
    const source = URL.createObjectURL(recording)
    await playSource(source, true)
  }

  const renderAndPlay = async (recording: Blob, speciesId: string) => {
    const token = ++renderTokenRef.current
    stopPlayback()
    clearRenderedUrl()
    setState('processing')
    setMessage(`${voiceProfileFor(speciesId).role}正在准备角色声线…`)
    try {
      const transformed = await renderCharacterVoice(recording, speciesId)
      if (disposedRef.current || token !== renderTokenRef.current) return
      renderedUrlRef.current = URL.createObjectURL(transformed)
      setState('ready')
      setCompareOriginal(false)
      await playSource(renderedUrlRef.current)
    } catch {
      if (disposedRef.current || token !== renderTokenRef.current) return
      setState('error')
      setMessage('这台设备暂时无法完成角色变声。原声仍可播放，也可以换一台设备再试。')
    }
  }

  const chooseSpecies = (speciesId: string) => {
    stopPlayback()
    selectedIdRef.current = speciesId
    setSelectedId(speciesId)
    setCompareOriginal(false)
    const recording = rawRecordingRef.current
    if (recording) {
      void renderAndPlay(recording, speciesId)
    } else {
      playGreeting(speciesId)
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setState('processing')
    setMessage('伙伴正在分离音高与角色音色…')
    recorder.stop()
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('error')
      setMessage('当前设备没有提供录音能力，请在手机或带麦克风的电脑上试玩。')
      return
    }
    stopPlayback()
    renderTokenRef.current += 1
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
        const recording = new Blob(chunks, { type })
        rawRecordingRef.current = recording
        void renderAndPlay(recording, selectedIdRef.current)
      }
      recorder.start(160)
      setState('recording')
      setMessage('我在听。正常说话即可，说完停顿一秒会自动结束。')

      try {
        const AudioContextConstructor = window.AudioContext
        if (AudioContextConstructor) {
          const audioContext = new AudioContextConstructor()
          captureAudioContextRef.current = audioContext
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
    initialGreetingTimerRef.current = window.setTimeout(() => {
      if (!disposedRef.current && selectedIdRef.current) playGreeting(selectedIdRef.current)
    }, 180)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      disposedRef.current = true
      renderTokenRef.current += 1
      window.clearTimeout(initialGreetingTimerRef.current)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      releaseCapture()
      stopPlayback()
      clearRenderedUrl()
      rawRecordingRef.current = null
    }
  }, [])

  if (!selected) return null
  const isRecording = state === 'recording'
  const disabled = state === 'requesting' || state === 'processing'

  return (
    <div className="echo-backdrop" onMouseDown={onClose}>
      <section className="echo-modal" role="dialog" aria-modal="true" aria-labelledby="echo-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="echo-header">
          <div><span className="eyebrow">CHARACTER VOICE LAB</span><h2 id="echo-title">声声岛</h2><p>保留你的原话和节奏，由伙伴换上完整的角色声线。</p></div>
          <button type="button" className="icon-button echo-close" aria-label="关闭声声岛" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="echo-stage">
          <div className="echo-model" style={{ '--pet-accent': selected.accent } as CSSProperties}>
            <Pet3DViewer assetPath={selected.assetPath} speciesId={selected.id} name={selected.name} accent={selected.accent} animation={state === 'playing' ? 'talk' : 'idle'} animationNonce={animationNonce} />
          </div>
          <div className="echo-console">
            <div className="echo-voice-title"><Volume2 size={18} /><div><strong>{selected.name} · {voice.label}</strong><span>{voice.role}</span></div></div>
            <p className="echo-voice-description">{voice.description}</p>
            <div className="echo-voice-tags" aria-label="声线特征">{voice.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className="echo-greeting-card">
              <span>{greeting.title}</span>
              <p className="echo-greeting-quote">“{greeting.spokenText}”</p>
            </div>
            <div className={`echo-wave ${isRecording ? 'is-listening' : state === 'processing' ? 'is-processing' : ''}`} aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => <i key={index} style={{ '--echo-bar': index } as CSSProperties} />)}
            </div>
            <p className="echo-message" role="status">{message}</p>
            <div className="echo-controls">
              <button type="button" className="button button-quiet echo-greeting-play" aria-label={`听${selected.name}打招呼`} onClick={() => playGreeting(selected.id)} disabled={isRecording || state === 'processing' || state === 'requesting'}>
                <MessageCircle size={17} />听它打招呼
              </button>
              <button type="button" className={`button button-primary echo-record ${isRecording ? 'is-recording' : ''}`} onClick={isRecording ? stopRecording : () => void startRecording()} disabled={disabled}>
                {isRecording ? <Square size={17} fill="currentColor" /> : state === 'processing' ? <Sparkles size={18} /> : <Mic size={18} />}
                {isRecording ? '说完了' : state === 'requesting' ? '等待授权' : state === 'processing' ? '正在塑造声线' : rawRecordingRef.current ? '重新录一句' : '开始说话'}
              </button>
              <button type="button" className={`button button-quiet ${!compareOriginal ? 'is-active' : ''}`} onClick={() => void playCharacter()} disabled={!renderedUrlRef.current || isRecording || disabled}>
                {state === 'ready' ? <Play size={17} fill="currentColor" /> : <RefreshCw size={17} />}角色声线
              </button>
              <button type="button" className={`button button-quiet ${compareOriginal ? 'is-active' : ''}`} onClick={() => void playOriginal()} disabled={!rawRecordingRef.current || isRecording || disabled}>
                <AudioLines size={17} />原声对比
              </button>
            </div>
            <div className="echo-privacy"><ShieldCheck size={15} /><span>录音和变声都在当前设备完成，不上传、不保存到 Server，关闭后立即清除。</span></div>
          </div>
        </div>
        <div className="echo-picker-heading"><div><Waves size={17} /><strong>换一位伙伴试玩</strong></div><span>{species.length} 种角色声线</span></div>
        <div className="echo-species-grid" role="list" aria-label="声声岛伙伴声线">
          {species.map((item) => {
            const profile = voiceProfileFor(item.id)
            const itemGreeting = characterGreetingFor(item.id, listenerName)
            const active = item.id === selected.id
            return (
              <button key={item.id} type="button" role="listitem" className={`echo-species ${active ? 'is-selected' : ''}`} style={{ '--pet-accent': item.accent } as CSSProperties} aria-pressed={active} title={`${itemGreeting.title}：${itemGreeting.spokenText}`} data-greeting={itemGreeting.spokenText} onClick={() => chooseSpecies(item.id)} disabled={isRecording || state === 'processing' || state === 'requesting'}>
                <span aria-hidden="true">{item.emoji}</span><strong>{item.name}</strong><small>{profile.label}</small><em>{itemGreeting.catchphrase}</em><b>点按试听</b>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
