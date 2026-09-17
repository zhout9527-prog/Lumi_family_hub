import psola from '@audio/shift-psola'

export interface CharacterVoiceProfile {
  label: string
  role: string
  description: string
  tags: string[]
  semitones: number
  highPassHz: number
  lowPassHz: number
  warmthDb: number
  presenceHz: number
  presenceDb: number
  airDb: number
  drive: number
  chorusMix: number
  chorusRate: number
  echoMix: number
  echoSeconds: number
  reverbMix: number
  roomSeconds: number
  robotMix: number
  robotHz: number
  outputGain: number
}

const DEFAULT_PROFILE: CharacterVoiceProfile = {
  label: '伙伴角色声线',
  role: '温暖讲述者',
  description: '保留原话节奏，加入柔和的角色音色。',
  tags: ['自然变频', '温暖', '轻空间感'],
  semitones: 1.5,
  highPassHz: 75,
  lowPassHz: 10500,
  warmthDb: 1.5,
  presenceHz: 2600,
  presenceDb: 1,
  airDb: 1,
  drive: 0.04,
  chorusMix: 0.08,
  chorusRate: 0.8,
  echoMix: 0.03,
  echoSeconds: 0.1,
  reverbMix: 0.07,
  roomSeconds: 0.45,
  robotMix: 0,
  robotHz: 34,
  outputGain: 0.92,
}

export const CHARACTER_VOICE_PROFILES: Record<string, CharacterVoiceProfile> = {
  alpaca: {
    ...DEFAULT_PROFILE,
    label: '棉花糖声线',
    role: '慢慢讲故事的云朵向导',
    description: '轻软、带一点梦幻合唱感，像从云里飘来。',
    tags: ['轻软', '梦幻', '双层声'],
    semitones: 3.2,
    warmthDb: 2.5,
    chorusMix: 0.2,
    chorusRate: 0.65,
    reverbMix: 0.13,
    roomSeconds: 0.7,
  },
  bull: {
    ...DEFAULT_PROFILE,
    label: '岩石队长',
    role: '沉稳可靠的冒险队长',
    description: '低沉但不拖慢，句子会带有稳稳的胸腔共鸣。',
    tags: ['低沉', '坚定', '厚实'],
    semitones: -4.2,
    highPassHz: 55,
    lowPassHz: 7200,
    warmthDb: 5,
    presenceHz: 1500,
    presenceDb: 2,
    airDb: -2,
    drive: 0.1,
    chorusMix: 0.04,
    reverbMix: 0.08,
    roomSeconds: 0.5,
    outputGain: 0.88,
  },
  cow: {
    ...DEFAULT_PROFILE,
    label: '暖灯声线',
    role: '会耐心倾听的暖心搭档',
    description: '圆润、柔和，尾音有很轻的房间回响。',
    tags: ['圆润', '治愈', '温柔'],
    semitones: 0.8,
    warmthDb: 4,
    presenceHz: 2100,
    presenceDb: -1,
    airDb: 0.5,
    chorusMix: 0.07,
    reverbMix: 0.12,
    roomSeconds: 0.75,
  },
  deer: {
    ...DEFAULT_PROFILE,
    label: '林间精灵',
    role: '好奇又轻快的森林向导',
    description: '清亮的变频和细小空间回声，有童话感但不加速。',
    tags: ['清亮', '童话', '灵动'],
    semitones: 4.1,
    highPassHz: 105,
    lowPassHz: 12500,
    warmthDb: -1,
    presenceHz: 3300,
    presenceDb: 3.5,
    airDb: 3,
    chorusMix: 0.12,
    chorusRate: 1.2,
    echoMix: 0.07,
    echoSeconds: 0.13,
    reverbMix: 0.16,
    roomSeconds: 0.9,
  },
  donkey: {
    ...DEFAULT_PROFILE,
    label: '憨憨鼻音',
    role: '笑点有点奇怪的喜剧搭档',
    description: '稍低的音高配上明显中频共鸣，像动画里的搞笑角色。',
    tags: ['喜剧', '鼻音', '憨厚'],
    semitones: -2.1,
    lowPassHz: 8200,
    warmthDb: 2,
    presenceHz: 1050,
    presenceDb: 5,
    airDb: -2.5,
    drive: 0.12,
    chorusMix: 0.05,
    echoMix: 0.05,
    echoSeconds: 0.085,
    robotMix: 0.025,
    robotHz: 27,
  },
  fox: {
    ...DEFAULT_PROFILE,
    label: '灵光侦探',
    role: '语气俏皮的秘密侦探',
    description: '明亮、敏捷，加入短促的动画式回声。',
    tags: ['俏皮', '灵巧', '明亮'],
    semitones: 5.2,
    highPassHz: 130,
    lowPassHz: 13500,
    warmthDb: -2,
    presenceHz: 3900,
    presenceDb: 4.5,
    airDb: 4,
    drive: 0.035,
    chorusMix: 0.1,
    chorusRate: 1.65,
    echoMix: 0.1,
    echoSeconds: 0.075,
    reverbMix: 0.05,
  },
  horse: {
    ...DEFAULT_PROFILE,
    label: '阳光行者',
    role: '充满行动力的同行伙伴',
    description: '自然偏亮、语气爽朗，像动画冒险片里的主角。',
    tags: ['爽朗', '自然', '冒险感'],
    semitones: 1.4,
    warmthDb: 1,
    presenceHz: 2800,
    presenceDb: 3,
    airDb: 2,
    drive: 0.06,
    chorusMix: 0.06,
    echoMix: 0.04,
    echoSeconds: 0.095,
  },
  'horse-white': {
    ...DEFAULT_PROFILE,
    label: '星光讲述者',
    role: '会演绎童话的优雅故事家',
    description: '通透、有呼吸感，加入更宽的童话舞台空间。',
    tags: ['优雅', '空灵', '故事感'],
    semitones: 2.8,
    highPassHz: 110,
    lowPassHz: 14500,
    warmthDb: 0,
    presenceHz: 3200,
    presenceDb: 2.5,
    airDb: 5,
    chorusMix: 0.14,
    chorusRate: 0.55,
    reverbMix: 0.22,
    roomSeconds: 1.25,
    outputGain: 0.88,
  },
  husky: {
    ...DEFAULT_PROFILE,
    label: '热血队友',
    role: '一说话就充满干劲的队友',
    description: '稍低的角色音高，加入轻微沙砾感和舞台存在感。',
    tags: ['热血', '有力', '轻沙哑'],
    semitones: -2.8,
    highPassHz: 65,
    lowPassHz: 9000,
    warmthDb: 3,
    presenceHz: 2200,
    presenceDb: 4,
    airDb: -0.5,
    drive: 0.18,
    chorusMix: 0.08,
    echoMix: 0.04,
    reverbMix: 0.08,
  },
  shibainu: {
    ...DEFAULT_PROFILE,
    label: '元气小队长',
    role: '反应很快的快乐小队长',
    description: '清晰、富有弹性，带一点点卡通合唱感。',
    tags: ['元气', '弹性', '卡通感'],
    semitones: 4.5,
    highPassHz: 120,
    lowPassHz: 12800,
    warmthDb: -0.5,
    presenceHz: 3500,
    presenceDb: 4,
    airDb: 3,
    drive: 0.05,
    chorusMix: 0.16,
    chorusRate: 1.4,
    echoMix: 0.055,
    echoSeconds: 0.07,
  },
  stag: {
    ...DEFAULT_PROFILE,
    label: '古树长者',
    role: '像古树一样沉稳的故事家',
    description: '深、暖、有缓慢散开的森林空间感，但保持原话节奏。',
    tags: ['深沉', '叙事', '森林感'],
    semitones: -5.4,
    highPassHz: 48,
    lowPassHz: 6800,
    warmthDb: 6,
    presenceHz: 1200,
    presenceDb: 1.5,
    airDb: -3,
    drive: 0.08,
    chorusMix: 0.05,
    reverbMix: 0.2,
    roomSeconds: 1.4,
    outputGain: 0.86,
  },
  wolf: {
    ...DEFAULT_PROFILE,
    label: '月夜守护者',
    role: '来自月光森林的勇敢守护者',
    description: '低沉主声线下藏着很轻的神秘双层声，适合冒险故事。',
    tags: ['神秘', '双层声', '守护者'],
    semitones: -4.6,
    highPassHz: 50,
    lowPassHz: 7600,
    warmthDb: 4.5,
    presenceHz: 1700,
    presenceDb: 2.5,
    airDb: -1.5,
    drive: 0.11,
    chorusMix: 0.13,
    chorusRate: 0.42,
    echoMix: 0.08,
    echoSeconds: 0.16,
    reverbMix: 0.17,
    roomSeconds: 1.05,
    robotMix: 0.055,
    robotHz: 39,
    outputGain: 0.85,
  },
}

export function voiceProfileFor(speciesId: string): CharacterVoiceProfile {
  return CHARACTER_VOICE_PROFILES[speciesId] ?? DEFAULT_PROFILE
}

function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 4096
  const curve = new Float32Array(samples)
  const strength = 4 + amount * 70
  for (let index = 0; index < samples; index += 1) {
    const value = (index * 2) / (samples - 1) - 1
    curve[index] = ((1 + strength) * value) / (1 + strength * Math.abs(value))
  }
  return curve
}

function roomImpulse(context: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.round(context.sampleRate * seconds))
  const impulse = context.createBuffer(2, length, context.sampleRate)
  let seed = 0x6c756d69
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      const noise = ((seed >>> 0) / 0xffffffff) * 2 - 1
      const envelope = Math.pow(1 - index / length, 2.4)
      data[index] = noise * envelope * 0.68
    }
  }
  return impulse
}

function validShifted(input: Float32Array, shifted: Float32Array): boolean {
  if (shifted.length !== input.length || shifted.length === 0) return false
  const step = Math.max(1, Math.floor(shifted.length / 2000))
  for (let index = 0; index < shifted.length; index += step) {
    if (!Number.isFinite(shifted[index])) return false
  }
  return true
}

function normalizeChannels(buffer: AudioBuffer): Float32Array[] {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
    new Float32Array(buffer.getChannelData(channel)),
  )
  let peak = 0
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) peak = Math.max(peak, Math.abs(channel[index]))
  }
  if (peak <= 0.0001) return channels
  const gain = Math.min(1.65, 0.92 / peak)
  if (Math.abs(gain - 1) < 0.015) return channels
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) channel[index] *= gain
  }
  return channels
}

function encodeWave(channels: Float32Array[], sampleRate: number): Blob {
  const channelCount = Math.max(1, Math.min(2, channels.length))
  const frameCount = channels[0]?.length ?? 0
  const bytesPerSample = 2
  const dataSize = frameCount * channelCount * bytesPerSample
  const bytes = new ArrayBuffer(44 + dataSize)
  const view = new DataView(bytes)
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true)
  view.setUint16(32, channelCount * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel]?.[frame] ?? channels[0]?.[frame] ?? 0))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += bytesPerSample
    }
  }
  return new Blob([bytes], { type: 'audio/wav' })
}

async function renderEffects(
  shiftedChannels: Float32Array[],
  sampleRate: number,
  profile: CharacterVoiceProfile,
): Promise<Float32Array[]> {
  const OfflineConstructor = window.OfflineAudioContext
  if (!OfflineConstructor) return shiftedChannels
  const channelCount = Math.max(1, Math.min(2, shiftedChannels.length))
  const length = shiftedChannels[0]?.length ?? 0
  if (length === 0) return shiftedChannels
  const context = new OfflineConstructor(channelCount, length, sampleRate)
  const input = context.createBuffer(channelCount, length, sampleRate)
  shiftedChannels.slice(0, channelCount).forEach((channel, index) => input.copyToChannel(Float32Array.from(channel), index))
  const source = context.createBufferSource()
  source.buffer = input

  const highPass = context.createBiquadFilter()
  highPass.type = 'highpass'
  highPass.frequency.value = profile.highPassHz
  highPass.Q.value = 0.72
  const lowPass = context.createBiquadFilter()
  lowPass.type = 'lowpass'
  lowPass.frequency.value = profile.lowPassHz
  lowPass.Q.value = 0.62
  const warmth = context.createBiquadFilter()
  warmth.type = 'lowshelf'
  warmth.frequency.value = 320
  warmth.gain.value = profile.warmthDb
  const presence = context.createBiquadFilter()
  presence.type = 'peaking'
  presence.frequency.value = profile.presenceHz
  presence.Q.value = 0.9
  presence.gain.value = profile.presenceDb
  const air = context.createBiquadFilter()
  air.type = 'highshelf'
  air.frequency.value = 5600
  air.gain.value = profile.airDb
  source.connect(highPass).connect(lowPass).connect(warmth).connect(presence).connect(air)

  let tone: AudioNode = air
  if (profile.drive > 0) {
    const shaper = context.createWaveShaper()
    shaper.curve = distortionCurve(profile.drive)
    shaper.oversample = '2x'
    tone.connect(shaper)
    tone = shaper
  }

  const master = context.createGain()
  master.gain.value = profile.outputGain
  const wetTotal = profile.chorusMix + profile.echoMix + profile.reverbMix + profile.robotMix
  const dry = context.createGain()
  dry.gain.value = Math.max(0.65, 1 - wetTotal * 0.32)
  tone.connect(dry).connect(master)

  const renderSeconds = length / sampleRate
  if (profile.chorusMix > 0) {
    const delay = context.createDelay(0.05)
    delay.delayTime.value = 0.018
    const wet = context.createGain()
    wet.gain.value = profile.chorusMix
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = profile.chorusRate
    const depth = context.createGain()
    depth.gain.value = 0.0038
    oscillator.connect(depth).connect(delay.delayTime)
    tone.connect(delay).connect(wet).connect(master)
    oscillator.start(0)
    oscillator.stop(renderSeconds)
  }

  if (profile.echoMix > 0) {
    const delay = context.createDelay(0.45)
    delay.delayTime.value = profile.echoSeconds
    const feedback = context.createGain()
    feedback.gain.value = 0.18
    const wet = context.createGain()
    wet.gain.value = profile.echoMix
    tone.connect(delay)
    delay.connect(feedback).connect(delay)
    delay.connect(wet).connect(master)
  }

  if (profile.reverbMix > 0) {
    const convolver = context.createConvolver()
    convolver.buffer = roomImpulse(context, profile.roomSeconds)
    const wet = context.createGain()
    wet.gain.value = profile.reverbMix
    tone.connect(convolver).connect(wet).connect(master)
  }

  if (profile.robotMix > 0) {
    const ring = context.createGain()
    ring.gain.value = 0
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = profile.robotHz
    const depth = context.createGain()
    depth.gain.value = 1
    oscillator.connect(depth).connect(ring.gain)
    const wet = context.createGain()
    wet.gain.value = profile.robotMix
    tone.connect(ring).connect(wet).connect(master)
    oscillator.start(0)
    oscillator.stop(renderSeconds)
  }

  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -15
  compressor.knee.value = 9
  compressor.ratio.value = 3
  compressor.attack.value = 0.004
  compressor.release.value = 0.14
  master.connect(compressor).connect(context.destination)
  source.start(0)
  const rendered = await context.startRendering()
  return normalizeChannels(rendered)
}

export async function renderCharacterVoice(recording: Blob, speciesId: string): Promise<Blob> {
  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) throw new Error('当前设备不支持音频解码')
  const context = new AudioContextConstructor()
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    const channelCount = Math.max(1, Math.min(2, decoded.numberOfChannels))
    const profile = voiceProfileFor(speciesId)
    const shifted = Array.from({ length: channelCount }, (_, channel) => {
      const input = new Float32Array(decoded.getChannelData(channel))
      try {
        const output = psola(input, {
          semitones: profile.semitones,
          sampleRate: decoded.sampleRate,
          minFreq: 65,
          maxFreq: 700,
        })
        return validShifted(input, output) ? output : input
      } catch {
        return input
      }
    })
    const effected = await renderEffects(shifted, decoded.sampleRate, profile)
    return encodeWave(effected, decoded.sampleRate)
  } finally {
    await context.close().catch(() => undefined)
  }
}
