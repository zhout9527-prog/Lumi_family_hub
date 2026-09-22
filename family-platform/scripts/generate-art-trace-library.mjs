import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const iconRoot = resolve(root, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons')
const outputPath = resolve(root, 'src', 'artTraceLibrary.ts')

const groups = {
  '动物伙伴': [
    ['cat', '好奇小猫'], ['dog', '快乐小狗'], ['rabbit', '长耳兔'], ['squirrel', '松鼠'],
    ['turtle', '小海龟'], ['snail', '蜗牛'], ['worm', '小蚯蚓'], ['bird', '枝头小鸟'],
    ['fish', '小鱼'], ['bug', '小甲虫'], ['rat', '小老鼠'], ['shell', '海螺'],
    ['paw-print', '动物脚印'], ['bone', '小骨头'], ['egg', '生命之蛋'],
  ],
  '植物与食物': [
    ['flower', '六瓣花'], ['flower-2', '盛开的花'], ['sprout', '小幼苗'], ['leaf', '一片叶子'],
    ['tree-deciduous', '落叶树'], ['tree-pine', '松树'], ['tree-palm', '棕榈树'], ['trees', '小树林'],
    ['clover', '四叶草'], ['wheat', '麦穗'], ['cherry', '樱桃'],
    ['apple', '苹果'], ['banana', '香蕉'], ['grape', '葡萄'], ['carrot', '胡萝卜'],
    ['citrus', '柑橘'], ['bean', '豆子'], ['nut', '坚果'], ['salad', '蔬菜沙拉'],
  ],
  '天空与自然': [
    ['sun', '太阳'], ['moon', '月亮'], ['star', '星星'], ['cloud', '云朵'],
    ['cloud-sun', '云后的太阳'], ['rainbow', '彩虹'], ['snowflake', '雪花'], ['mountain', '山峰'],
    ['mountain-snow', '雪山'], ['waves', '海浪'], ['wind', '风'], ['tornado', '龙卷风'],
    ['earth', '地球'], ['globe', '地球仪'], ['umbrella', '雨伞'],
  ],
  '科学与太空': [
    ['rocket', '火箭'], ['satellite', '人造卫星'], ['telescope', '天文望远镜'], ['atom', '原子'],
    ['microscope', '显微镜'], ['flask-conical', '实验烧瓶'], ['test-tube', '试管'], ['magnet', '磁铁'],
    ['lightbulb', '灯泡'], ['school', '学校'], ['book-open', '打开的书'], ['pencil', '铅笔'],
  ],
  '交通工具': [
    ['bike', '自行车'], ['car', '小汽车'], ['bus', '公交车'], ['truck', '卡车'],
    ['train-front', '火车'], ['tram-front', '有轨电车'], ['plane', '飞机'], ['ship', '轮船'],
    ['sailboat', '帆船'], ['tractor', '拖拉机'],
  ],
  '建筑与游乐': [
    ['house', '房子'], ['building-2', '高楼'], ['castle', '城堡'], ['tent', '帐篷'],
    ['ferris-wheel', '摩天轮'], ['roller-coaster', '过山车'], ['gift', '礼物盒'],
  ],
  '美味食物': [
    ['cake-slice', '蛋糕'], ['ice-cream-bowl', '冰淇淋'], ['pizza', '披萨'], ['cookie', '饼干'],
    ['cup-soda', '饮料杯'], ['popcorn', '爆米花'], ['sandwich', '三明治'], ['soup', '热汤'],
    ['utensils', '餐具'],
  ],
  '生活用品': [
    ['shirt', '上衣'], ['crown', '皇冠'], ['glasses', '眼镜'], ['watch', '手表'],
    ['backpack', '书包'], ['bed', '小床'], ['lamp-desk', '台灯'], ['sofa', '沙发'],
    ['armchair', '扶手椅'], ['camera', '照相机'],
  ],
  '艺术与游戏': [
    ['palette', '调色盘'], ['music', '音符'], ['drum', '小鼓'], ['guitar', '吉他'],
    ['piano', '钢琴'], ['toy-brick', '积木'], ['puzzle', '拼图'], ['gamepad-2', '游戏手柄'],
  ],
  '运动与成长': [
    ['volleyball', '排球'], ['dumbbell', '哑铃'], ['medal', '奖牌'], ['trophy', '奖杯'],
    ['heart', '爱心'], ['smile', '笑脸'], ['laugh', '大笑脸'], ['baby', '小宝宝'],
    ['footprints', '脚印'], ['hand', '小手'], ['eye', '眼睛'], ['ear', '耳朵'],
  ],
}

const easyIcons = new Set([
  'fish', 'bug', 'shell', 'paw-print', 'bone', 'egg', 'flower', 'sprout', 'leaf', 'tree-deciduous',
  'tree-pine', 'clover', 'cherry', 'apple', 'banana', 'carrot', 'bean', 'sun', 'moon', 'star',
  'cloud', 'rainbow', 'mountain', 'waves', 'wind', 'earth', 'umbrella', 'rocket', 'atom', 'test-tube',
  'magnet', 'lightbulb', 'book-open', 'pencil', 'bike', 'car', 'plane', 'sailboat', 'house', 'tent',
  'gift', 'cake-slice', 'pizza', 'cookie', 'cup-soda', 'shirt', 'crown', 'glasses', 'watch',
  'bed', 'camera', 'palette', 'music', 'toy-brick', 'puzzle', 'volleyball', 'medal', 'heart', 'smile',
  'footprints', 'hand', 'eye', 'ear',
])

function loadIconNodes(name) {
  const source = readFileSync(resolve(iconRoot, `${name}.js`), 'utf8')
  const callStart = source.indexOf('createLucideIcon(')
  const arrayStart = source.indexOf('[', callStart)
  const arrayEnd = source.lastIndexOf(']);')
  if (callStart < 0 || arrayStart < 0 || arrayEnd < arrayStart) throw new Error(`无法解析 Lucide 图标：${name}`)
  const nodes = vm.runInNewContext(`(${source.slice(arrayStart, arrayEnd + 1)})`, Object.create(null))
  return nodes.map(([tag, attributes]) => [tag, Object.fromEntries(Object.entries(attributes).filter(([key]) => key !== 'key'))])
}

const accents = ['#d45d6c', '#268fa5', '#5a7fd1', '#8a63b8', '#4f9565', '#c78332']
const entries = Object.entries(groups).flatMap(([category, icons]) => icons.map(([name, title], index) => ({
  id: `lucide-${name}`,
  title,
  category,
  difficulty: easyIcons.has(name) ? 'easy' : 'medium',
  accent: accents[(index + category.length) % accents.length],
  sourceName: name,
  sourceUrl: `https://lucide.dev/icons/${name}`,
  nodes: loadIconNodes(name),
})))

if (entries.length < 100) throw new Error(`题库不足 100 幅，当前只有 ${entries.length} 幅`)

const banner = `// 本文件由 scripts/generate-art-trace-library.mjs 从 lucide-react 0.468.0 官方源文件生成。\n// Lucide 使用 ISC 许可证，来源：https://lucide.dev/\n\n`
const body = `${banner}export type ArtTraceDifficulty = 'easy' | 'medium'\n\nexport type ArtTraceNode = readonly [\n  tag: 'path' | 'circle' | 'ellipse' | 'line' | 'rect' | 'polyline' | 'polygon',\n  attributes: Readonly<Record<string, string | number>>,\n]\n\nexport interface ArtTraceSource {\n  id: string\n  title: string\n  category: string\n  difficulty: ArtTraceDifficulty\n  accent: string\n  sourceName: string\n  sourceUrl: string\n  nodes: readonly ArtTraceNode[]\n}\n\nexport const ART_TRACE_SOURCES = ${JSON.stringify(entries, null, 2)} as const satisfies readonly ArtTraceSource[]\n`

writeFileSync(outputPath, body, 'utf8')
console.log(`已生成 ${entries.length} 幅开源临摹线稿：${outputPath}`)
