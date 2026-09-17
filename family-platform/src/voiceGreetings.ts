export interface CharacterGreetingProfile {
  title: string
  catchphrase: string
  text: (listenerName: string) => string
  pitch: number
  rate: number
  voiceSlot: number
  preferredVoiceNames: string[]
}

const DEFAULT_GREETING: CharacterGreetingProfile = {
  title: '伙伴问候',
  catchphrase: '我想听听你的故事',
  text: (name) => `Hello，${name}！我是你的 Lumi 伙伴。今天过得怎么样？愿意讲一件开心的事给我听吗？`,
  pitch: 1,
  rate: 0.94,
  voiceSlot: 0,
  preferredVoiceNames: [],
}

export const CHARACTER_GREETINGS: Record<string, CharacterGreetingProfile> = {
  alpaca: {
    title: '云朵问候',
    catchphrase: '慢慢说，我在听',
    text: (name) => `Hello，${name}。我是软绵绵的羊驼向导。今天过得怎么样？不着急，我们可以像云朵一样，慢慢把故事说完。`,
    pitch: 1.28,
    rate: 0.84,
    voiceSlot: 0,
    preferredVoiceNames: ['Xiaoxiao', 'Xiaoyi', 'Tingting'],
  },
  bull: {
    title: '队长报到',
    catchphrase: '有难题，一起顶过去',
    text: (name) => `${name}，岩石队长报到！Hello，partner。今天遇到什么难题了吗？别担心，我们站稳脚步，一起顶过去！`,
    pitch: 0.66,
    rate: 0.82,
    voiceSlot: 1,
    preferredVoiceNames: ['Yunjian', 'Yunyang', 'Yunxi'],
  },
  cow: {
    title: '暖灯问候',
    catchphrase: '先给今天一个抱抱',
    text: (name) => `Hello，${name}。我是小奶牛，已经把今天的暖灯打开啦。你现在是开心、有点累，还是想要一个抱抱呢？`,
    pitch: 0.98,
    rate: 0.82,
    voiceSlot: 2,
    preferredVoiceNames: ['Xiaomo', 'Xiaoxiao', 'Huihui'],
  },
  deer: {
    title: '林间邀请',
    catchphrase: '跟我去发现新东西',
    text: (name) => `Hello，${name}！我是林间小鹿。今天的风带来了一个新问题：你有没有发现一件以前没注意到的小事？`,
    pitch: 1.4,
    rate: 1.01,
    voiceSlot: 3,
    preferredVoiceNames: ['Xiaohan', 'Xiaoyi', 'Xiaoxiao'],
  },
  donkey: {
    title: '任务喜剧',
    catchphrase: '先笑一下，再把任务完成',
    text: (name) => `嘿嘿，Hello，${name}！我是小驴任务员。今天过得怎么样？要是遇到麻烦，我们就先笑一下，再一小步一小步把它搞定！`,
    pitch: 0.78,
    rate: 0.96,
    voiceSlot: 4,
    preferredVoiceNames: ['Yunxi', 'Yunyang', 'Kangkang'],
  },
  fox: {
    title: '侦探暗号',
    catchphrase: '嘿，我发现线索了',
    text: (name) => `嘘——Hello，${name}，灵光侦探正在连线。我发现了一条重要线索：你今天一定学会了什么新东西。快告诉我是什么？`,
    pitch: 1.48,
    rate: 1.08,
    voiceSlot: 5,
    preferredVoiceNames: ['Xiaoyi', 'Xiaoshuang', 'Xiaoxiao'],
  },
  horse: {
    title: '阳光出发',
    catchphrase: '准备好就一起出发',
    text: (name) => `Hello，${name}！阳光行者已经准备好啦。今天想挑战一件什么事？你说方向，我陪你一起出发！`,
    pitch: 1.08,
    rate: 1.03,
    voiceSlot: 6,
    preferredVoiceNames: ['Yunxi', 'Xiaoxiao', 'Yunyang'],
  },
  'horse-white': {
    title: '星光开场',
    catchphrase: '把今天变成一页童话',
    text: (name) => `Hello，${name}。我是从星光里走来的白马故事家。如果今天是一本童话，你希望这一页的标题叫什么呢？`,
    pitch: 1.2,
    rate: 0.84,
    voiceSlot: 7,
    preferredVoiceNames: ['Xiaohan', 'Xiaoxiao', 'Yaoyao'],
  },
  husky: {
    title: '热血集合',
    catchphrase: '三、二、一，出发',
    text: (name) => `Hello，${name}！热血队友哈士奇已上线！今天过得怎么样？有好玩的事就快分享，有困难的事就交给我们并肩作战！`,
    pitch: 0.84,
    rate: 1.12,
    voiceSlot: 8,
    preferredVoiceNames: ['Yunyang', 'Yunjian', 'Yunxi'],
  },
  shibainu: {
    title: '元气点名',
    catchphrase: '今天也要收集小成就',
    text: (name) => `Hello，${name}！元气小队长点名啦！今天你做成了哪件值得鼓掌的小事？快说给我听，我要把它收进成就宝箱！`,
    pitch: 1.36,
    rate: 1.1,
    voiceSlot: 9,
    preferredVoiceNames: ['Xiaoshuang', 'Xiaoyi', 'Xiaoxiao'],
  },
  stag: {
    title: '古树问候',
    catchphrase: '慢慢想，答案会长出来',
    text: (name) => `Hello，${name}。我是大角鹿，也是森林的老故事家。今天有什么问题留在你心里？别急，我们慢慢想，答案会像新芽一样长出来。`,
    pitch: 0.6,
    rate: 0.74,
    voiceSlot: 10,
    preferredVoiceNames: ['Yunjian', 'Yunyang', 'Kangkang'],
  },
  wolf: {
    title: '月夜守护',
    catchphrase: '勇敢不是不害怕',
    text: (name) => `Hello，${name}。我是月夜守护者小狼。今天有没有哪一刻，你虽然有点害怕，却还是勇敢地做了？说给我听，我会帮你守住这份勇气。`,
    pitch: 0.7,
    rate: 0.84,
    voiceSlot: 11,
    preferredVoiceNames: ['Yunyang', 'Yunjian', 'Yunxi'],
  },
}

function safeListenerName(listenerName: string): string {
  const normalized = listenerName.trim().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ')
  return normalized.slice(0, 20) || '小伙伴'
}

export function characterGreetingFor(speciesId: string, listenerName: string): CharacterGreetingProfile & { spokenText: string } {
  const profile = CHARACTER_GREETINGS[speciesId] ?? DEFAULT_GREETING
  return { ...profile, spokenText: profile.text(safeListenerName(listenerName)) }
}

export function chooseGreetingVoice(voices: SpeechSynthesisVoice[], profile: CharacterGreetingProfile): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) return undefined
  const chineseVoices = voices.filter((voice) => /^zh(?:-|_)/i.test(voice.lang) || /chinese|mandarin|中文|普通话/i.test(`${voice.name} ${voice.lang}`))
  const candidates = chineseVoices.length > 0 ? chineseVoices : voices
  for (const hint of profile.preferredVoiceNames) {
    const matched = candidates.find((voice) => voice.name.toLowerCase().includes(hint.toLowerCase()))
    if (matched) return matched
  }
  return candidates[profile.voiceSlot % candidates.length]
}
