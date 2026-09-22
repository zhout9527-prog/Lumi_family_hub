import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  Brush,
  CheckCircle2,
  Download,
  Droplets,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  Image as ImageIcon,
  Highlighter,
  LetterText,
  Lightbulb,
  Maximize2,
  Minus,
  Palette,
  Paintbrush,
  PenTool,
  Pencil,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  SprayCan,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { ART_TRACE_SOURCES, type ArtTraceNode } from './artTraceLibrary'
import { DEVICE_PROFILE } from './device'

type DrawTool = 'pencil' | 'brush' | 'flat' | 'marker' | 'spray' | 'ink' | 'wash' | 'text' | 'eraser'
type DrawMode = 'free' | 'copy'
type ArtDifficulty = 'easy' | 'medium'
type GuideRole = 'outline' | 'construction' | 'shade' | 'highlight'

interface Point {
  x: number
  y: number
  pressure?: number
}

interface CanvasBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface PanGesture {
  pointerId: number
  clientX: number
  clientY: number
}

interface DrawingStroke {
  id: string
  points: Point[]
  color: string
  size: number
  tool: DrawTool
  text?: string
}

interface TemplatePath {
  points: Point[]
  closed?: boolean
  role?: GuideRole
}

interface DrawingTemplate {
  id: string
  title: string
  hint: string
  accent: string
  difficulty: ArtDifficulty
  category: string
  lesson: string
  steps: string[]
  concepts: string[]
  paths?: TemplatePath[]
  iconNodes?: readonly ArtTraceNode[]
  sourceUrl?: string
}

interface DrawingScore {
  total: number
  coverage: number
  precision: number
  colors: number
  tip: string
}

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 640
const CANVAS_EXPAND_X = 480
const CANVAS_EXPAND_Y = 320
const MAX_CANVAS_WIDTH = 2880
const MAX_CANVAS_HEIGHT = 1920
const DEFAULT_CANVAS_BOUNDS: CanvasBounds = { minX: 0, minY: 0, maxX: CANVAS_WIDTH, maxY: CANVAS_HEIGHT }
const GALLERY_KEY = 'lumi:kids-art-gallery:v1'
const COLORS = ['#263238', '#778086', '#ef5350', '#ff8f3d', '#f2c94c', '#62ad65', '#27a9c4', '#4279df', '#9b59c9', '#ec6fae']
const DIFFICULTIES: Array<{ id: ArtDifficulty; label: string; caption: string }> = [
  { id: 'easy', label: '简单', caption: '大轮廓' },
  { id: 'medium', label: '中等', caption: '结构细节' },
]

function ellipsePath(cx: number, cy: number, rx: number, ry: number, role: GuideRole = 'outline', segments = 30): TemplatePath {
  return {
    role,
    closed: true,
    points: Array.from({ length: segments }, (_, index) => {
      const angle = index / segments * Math.PI * 2
      return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry }
    }),
  }
}

function arcPath(cx: number, cy: number, rx: number, ry: number, start: number, end: number, role: GuideRole = 'outline', segments = 18): TemplatePath {
  return {
    role,
    points: Array.from({ length: segments + 1 }, (_, index) => {
      const angle = start + (end - start) * index / segments
      return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry }
    }),
  }
}

function radialPetals(cx: number, cy: number, count: number, innerRadius: number, outerRadius: number): TemplatePath[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2 - Math.PI / 2
    const spread = Math.PI / count * 0.58
    return {
      closed: true,
      points: [
        { x: cx + Math.cos(angle - spread) * innerRadius, y: cy + Math.sin(angle - spread) * innerRadius },
        { x: cx + Math.cos(angle - spread * 0.35) * outerRadius, y: cy + Math.sin(angle - spread * 0.35) * outerRadius },
        { x: cx + Math.cos(angle + spread * 0.35) * outerRadius, y: cy + Math.sin(angle + spread * 0.35) * outerRadius },
        { x: cx + Math.cos(angle + spread) * innerRadius, y: cy + Math.sin(angle + spread) * innerRadius },
      ],
    }
  })
}

function hatchPaths(x: number, y: number, width: number, height: number, count: number, slant = 24): TemplatePath[] {
  return Array.from({ length: count }, (_, index) => {
    const offset = count <= 1 ? 0 : index / (count - 1) * width
    return { role: 'shade', points: [{ x: x + offset, y }, { x: x + offset + slant, y: y + height }] }
  })
}

const CORE_TEMPLATES: DrawingTemplate[] = [
  {
    id: 'house',
    title: '森林小屋',
    hint: '先画大形，再补门窗和树叶。',
    accent: '#df7655',
    difficulty: 'easy',
    category: '生活与空间',
    lesson: '用三角形、长方形认识物体的大轮廓。',
    steps: ['屋顶和墙面', '门窗的位置', '树木与太阳'],
    concepts: ['基本形', '前后关系', '画面中心'],
    paths: [
      { points: [{ x: 205, y: 315 }, { x: 480, y: 105 }, { x: 755, y: 315 }] },
      { points: [{ x: 260, y: 285 }, { x: 260, y: 535 }, { x: 700, y: 535 }, { x: 700, y: 285 }], closed: true },
      { points: [{ x: 420, y: 535 }, { x: 420, y: 385 }, { x: 535, y: 385 }, { x: 535, y: 535 }], closed: true },
      { points: [{ x: 300, y: 350 }, { x: 380, y: 350 }, { x: 380, y: 425 }, { x: 300, y: 425 }], closed: true },
      { points: [{ x: 585, y: 350 }, { x: 660, y: 350 }, { x: 660, y: 425 }, { x: 585, y: 425 }], closed: true },
      { points: [{ x: 95, y: 535 }, { x: 130, y: 370 }, { x: 165, y: 535 }] },
      { points: [{ x: 72, y: 390 }, { x: 132, y: 245 }, { x: 193, y: 390 }], closed: true },
      { points: [{ x: 758, y: 145 }, { x: 758, y: 255 }] },
      { points: [{ x: 702, y: 200 }, { x: 814, y: 200 }] },
    ],
  },
  {
    id: 'fish',
    title: '泡泡小鱼',
    hint: '注意鱼身的弧线，再添加鳍和泡泡。',
    accent: '#36a9c2',
    difficulty: 'easy',
    category: '海洋动物',
    lesson: '观察鱼的身体、尾巴和鱼鳍分别是什么形状。',
    steps: ['鱼身大弧线', '尾巴和鱼鳍', '眼睛与泡泡'],
    concepts: ['流线形', '方向', '重复圆形'],
    paths: [
      { points: [{ x: 205, y: 330 }, { x: 300, y: 220 }, { x: 485, y: 185 }, { x: 650, y: 250 }, { x: 720, y: 330 }, { x: 650, y: 410 }, { x: 485, y: 455 }, { x: 300, y: 420 }, { x: 205, y: 330 }], closed: true },
      { points: [{ x: 205, y: 330 }, { x: 85, y: 235 }, { x: 105, y: 350 }, { x: 82, y: 445 }, { x: 205, y: 330 }], closed: true },
      { points: [{ x: 410, y: 205 }, { x: 490, y: 95 }, { x: 560, y: 205 }] },
      { points: [{ x: 430, y: 445 }, { x: 510, y: 545 }, { x: 575, y: 420 }] },
      { points: [{ x: 625, y: 275 }, { x: 655, y: 260 }, { x: 675, y: 285 }, { x: 655, y: 305 }, { x: 625, y: 275 }], closed: true },
      { points: [{ x: 745, y: 195 }, { x: 770, y: 170 }, { x: 795, y: 195 }, { x: 770, y: 220 }, { x: 745, y: 195 }], closed: true },
      { points: [{ x: 810, y: 125 }, { x: 840, y: 95 }, { x: 870, y: 125 }, { x: 840, y: 155 }, { x: 810, y: 125 }], closed: true },
    ],
  },
  {
    id: 'rocket',
    title: '星空火箭',
    hint: '画面对称会更稳，火焰可以大胆一点。',
    accent: '#6e65ce',
    difficulty: 'easy',
    category: '科学与太空',
    lesson: '沿中轴线观察左右对称，认识火箭的基本结构。',
    steps: ['中间的箭体', '左右尾翼', '舷窗、火焰和星星'],
    concepts: ['左右对称', '中轴线', '大小对比'],
    paths: [
      { points: [{ x: 480, y: 75 }, { x: 375, y: 225 }, { x: 390, y: 450 }, { x: 480, y: 515 }, { x: 570, y: 450 }, { x: 585, y: 225 }, { x: 480, y: 75 }], closed: true },
      { points: [{ x: 390, y: 340 }, { x: 300, y: 420 }, { x: 300, y: 535 }, { x: 410, y: 455 }] },
      { points: [{ x: 570, y: 340 }, { x: 660, y: 420 }, { x: 660, y: 535 }, { x: 550, y: 455 }] },
      { points: [{ x: 435, y: 250 }, { x: 480, y: 205 }, { x: 525, y: 250 }, { x: 480, y: 295 }, { x: 435, y: 250 }], closed: true },
      { points: [{ x: 435, y: 515 }, { x: 455, y: 600 }, { x: 480, y: 548 }, { x: 505, y: 600 }, { x: 525, y: 515 }] },
      { points: [{ x: 170, y: 180 }, { x: 183, y: 215 }, { x: 220, y: 218 }, { x: 190, y: 240 }, { x: 200, y: 278 }, { x: 170, y: 255 }, { x: 140, y: 278 }, { x: 150, y: 240 }, { x: 120, y: 218 }, { x: 157, y: 215 }, { x: 170, y: 180 }], closed: true },
      { points: [{ x: 760, y: 105 }, { x: 770, y: 132 }, { x: 800, y: 134 }, { x: 777, y: 152 }, { x: 785, y: 180 }, { x: 760, y: 163 }, { x: 735, y: 180 }, { x: 743, y: 152 }, { x: 720, y: 134 }, { x: 750, y: 132 }, { x: 760, y: 105 }], closed: true },
    ],
  },
  {
    id: 'flower',
    title: '微笑花园',
    hint: '从花心向外画花瓣，最后补叶子。',
    accent: '#df5b91',
    difficulty: 'easy',
    category: '植物',
    lesson: '从花心向外观察放射结构，理解花瓣的重复规律。',
    steps: ['花心和大花瓣', '茎与左右叶片', '表情和小细节'],
    concepts: ['放射结构', '重复', '曲线'],
    paths: [
      { points: [{ x: 480, y: 305 }, { x: 430, y: 230 }, { x: 455, y: 160 }, { x: 515, y: 210 }, { x: 555, y: 150 }, { x: 585, y: 230 }, { x: 665, y: 220 }, { x: 625, y: 300 }, { x: 690, y: 350 }, { x: 600, y: 380 }, { x: 610, y: 465 }, { x: 530, y: 420 }, { x: 480, y: 485 }, { x: 435, y: 415 }, { x: 350, y: 455 }, { x: 365, y: 370 }, { x: 280, y: 335 }, { x: 355, y: 285 }, { x: 325, y: 205 }, { x: 410, y: 225 }, { x: 480, y: 305 }], closed: true },
      { points: [{ x: 420, y: 310 }, { x: 480, y: 260 }, { x: 545, y: 310 }, { x: 480, y: 365 }, { x: 420, y: 310 }], closed: true },
      { points: [{ x: 480, y: 485 }, { x: 480, y: 595 }] },
      { points: [{ x: 480, y: 535 }, { x: 395, y: 500 }, { x: 425, y: 560 }, { x: 480, y: 575 }] },
      { points: [{ x: 480, y: 545 }, { x: 565, y: 505 }, { x: 540, y: 570 }, { x: 480, y: 590 }] },
      { points: [{ x: 455, y: 305 }, { x: 465, y: 315 }] },
      { points: [{ x: 500, y: 315 }, { x: 510, y: 305 }] },
      { points: [{ x: 452, y: 338 }, { x: 480, y: 352 }, { x: 510, y: 338 }] },
    ],
  },
  {
    id: 'butterfly',
    title: '花园蝴蝶',
    hint: '先找身体中轴，再画左右两边相似的翅膀。',
    accent: '#aa62c7',
    difficulty: 'easy',
    category: '昆虫',
    lesson: '认识昆虫的头、胸腹和左右对称翅膀。',
    steps: ['细长的身体', '两对对称翅膀', '触角和翅膀圆点'],
    concepts: ['昆虫结构', '左右对称', '图案重复'],
    paths: [
      ellipsePath(480, 330, 32, 170),
      { points: [{ x: 463, y: 175 }, { x: 405, y: 92 }] },
      { points: [{ x: 497, y: 175 }, { x: 555, y: 92 }] },
      { points: [{ x: 452, y: 240 }, { x: 320, y: 130 }, { x: 180, y: 175 }, { x: 205, y: 330 }, { x: 445, y: 350 }], closed: true },
      { points: [{ x: 508, y: 240 }, { x: 640, y: 130 }, { x: 780, y: 175 }, { x: 755, y: 330 }, { x: 515, y: 350 }], closed: true },
      { points: [{ x: 445, y: 350 }, { x: 260, y: 350 }, { x: 245, y: 505 }, { x: 430, y: 470 }], closed: true },
      { points: [{ x: 515, y: 350 }, { x: 700, y: 350 }, { x: 715, y: 505 }, { x: 530, y: 470 }], closed: true },
      ellipsePath(315, 235, 32, 25), ellipsePath(645, 235, 32, 25), ellipsePath(335, 420, 25, 20), ellipsePath(625, 420, 25, 20),
    ],
  },
  {
    id: 'tree',
    title: '四季大树',
    hint: '树干向上分叉，树冠由几个大小不同的圆团组成。',
    accent: '#5e9f55',
    difficulty: 'easy',
    category: '植物与季节',
    lesson: '观察树根、树干、树枝和树冠怎样共同支撑一棵树。',
    steps: ['树干和树根', '分叉的树枝', '大大小小的树冠'],
    concepts: ['生长方向', '疏密', '大小变化'],
    paths: [
      { points: [{ x: 405, y: 560 }, { x: 425, y: 345 }, { x: 390, y: 265 }, { x: 455, y: 340 }, { x: 480, y: 185 }, { x: 505, y: 340 }, { x: 575, y: 260 }, { x: 535, y: 355 }, { x: 555, y: 560 }], closed: true },
      { points: [{ x: 405, y: 560 }, { x: 315, y: 592 }, { x: 455, y: 585 }, { x: 480, y: 560 }, { x: 510, y: 585 }, { x: 650, y: 592 }, { x: 555, y: 560 }] },
      ellipsePath(350, 245, 145, 118), ellipsePath(505, 180, 165, 125), ellipsePath(650, 260, 140, 115), ellipsePath(485, 300, 210, 130),
    ],
  },
  {
    id: 'panda',
    title: '竹林熊猫',
    hint: '用轻线找中轴和眼睛高度，再补耳朵、眼圈和四肢。',
    accent: '#48575a',
    difficulty: 'medium',
    category: '哺乳动物',
    lesson: '学习用辅助线确定动物五官的对称和身体比例。',
    steps: ['头部中轴与眼线', '头、身体和四肢', '耳朵、眼圈与竹叶'],
    concepts: ['动物比例', '辅助线', '对称五官'],
    paths: [
      ellipsePath(480, 245, 175, 155), ellipsePath(480, 455, 150, 135), ellipsePath(350, 125, 62, 58), ellipsePath(610, 125, 62, 58),
      ellipsePath(410, 235, 48, 64), ellipsePath(550, 235, 48, 64), ellipsePath(480, 305, 64, 42),
      arcPath(480, 315, 34, 24, 0.15, Math.PI - 0.15),
      ellipsePath(370, 470, 55, 105), ellipsePath(590, 470, 55, 105),
      { role: 'construction', points: [{ x: 480, y: 85 }, { x: 480, y: 398 }] },
      { role: 'construction', points: [{ x: 320, y: 235 }, { x: 640, y: 235 }] },
      { points: [{ x: 735, y: 570 }, { x: 770, y: 145 }] },
      { points: [{ x: 760, y: 235 }, { x: 825, y: 190 }, { x: 780, y: 280 }], closed: true },
      { points: [{ x: 748, y: 355 }, { x: 690, y: 315 }, { x: 735, y: 405 }], closed: true },
    ],
  },
  {
    id: 'owl',
    title: '夜行猫头鹰',
    hint: '大眼睛是视觉中心，羽毛用有节奏的短弧线表现。',
    accent: '#7c6658',
    difficulty: 'medium',
    category: '鸟类',
    lesson: '认识鸟类的眼、喙、翅膀和羽毛排列。',
    steps: ['头部与身体比例', '同高的大眼睛和鸟喙', '翅膀与成排羽毛'],
    concepts: ['视觉中心', '羽毛节奏', '局部重复'],
    paths: [
      ellipsePath(480, 240, 178, 150), ellipsePath(480, 445, 165, 165),
      { points: [{ x: 330, y: 155 }, { x: 345, y: 65 }, { x: 410, y: 115 }] },
      { points: [{ x: 550, y: 115 }, { x: 615, y: 65 }, { x: 630, y: 155 }] },
      ellipsePath(410, 225, 65, 65), ellipsePath(550, 225, 65, 65), ellipsePath(410, 225, 20, 28), ellipsePath(550, 225, 20, 28),
      { points: [{ x: 480, y: 260 }, { x: 448, y: 295 }, { x: 512, y: 295 }], closed: true },
      arcPath(370, 450, 82, 130, -1.15, 1.15), arcPath(590, 450, 82, 130, Math.PI - 1.15, Math.PI + 1.15),
      ...[355, 405, 455, 505].flatMap((y, row) => [
        arcPath(420 + row * 7, y, 35, 22, 0, Math.PI),
        arcPath(500 + row * 7, y, 35, 22, 0, Math.PI),
      ]),
    ],
  },
  {
    id: 'sunflower',
    title: '向光的向日葵',
    hint: '花瓣从花盘向外生长，叶脉跟着叶片方向展开。',
    accent: '#cf9136',
    difficulty: 'medium',
    category: '植物观察',
    lesson: '观察花瓣的放射排列、叶片的方向与叶脉结构。',
    steps: ['圆形花盘', '一圈有方向的花瓣', '茎、叶片和叶脉'],
    concepts: ['放射排列', '叶脉', '疏密变化'],
    paths: [
      ...radialPetals(480, 245, 18, 86, 170), ellipsePath(480, 245, 92, 92),
      { points: [{ x: 480, y: 337 }, { x: 480, y: 610 }] },
      { points: [{ x: 478, y: 420 }, { x: 350, y: 365 }, { x: 285, y: 440 }, { x: 385, y: 500 }, { x: 478, y: 455 }], closed: true },
      { points: [{ x: 482, y: 485 }, { x: 610, y: 425 }, { x: 690, y: 505 }, { x: 585, y: 565 }, { x: 482, y: 520 }], closed: true },
      { points: [{ x: 475, y: 447 }, { x: 310, y: 430 }] },
      { points: [{ x: 485, y: 512 }, { x: 665, y: 495 }] },
      ...hatchPaths(420, 190, 110, 110, 7, 18),
    ],
  },
]

const OPEN_TRACE_TEMPLATES: DrawingTemplate[] = ART_TRACE_SOURCES.map((source) => ({
  id: source.id,
  title: source.title,
  hint: source.difficulty === 'easy' ? '先看整体轮廓，尽量连续、轻松地画下来。' : '先找主体比例，再逐步补齐内部结构和小细节。',
  accent: source.accent,
  difficulty: source.difficulty,
  category: source.category,
  lesson: `观察“${source.title}”由哪些基本线条和形状组成。`,
  steps: source.difficulty === 'easy' ? ['找到起笔位置', '沿外轮廓连续运笔', '补上内部短线'] : ['观察整体占比', '完成主要轮廓', '检查转折和内部细节'],
  concepts: source.difficulty === 'easy' ? ['连续运笔', '轮廓观察', '手眼协调'] : ['比例', '转折', '细节观察'],
  iconNodes: source.nodes,
  sourceUrl: source.sourceUrl,
}))

const TEMPLATES: DrawingTemplate[] = [...CORE_TEMPLATES, ...OPEN_TRACE_TEMPLATES]

const DAILY_IDEAS = [
  ['给月亮设计一顶帽子', '今晚的月亮准备去旅行，它会戴什么帽子？', ['月亮', '帽子', '夜空']],
  ['画一座动物学校', '谁是老师？教室里有哪些特别的桌椅？', ['动物', '学校', '朋友']],
  ['会飞的海底朋友', '把海洋动物和翅膀组合起来，看看它会飞去哪里。', ['海洋', '翅膀', '旅行']],
  ['未来的环保汽车', '它不用汽油，也不会制造垃圾，它靠什么前进？', ['汽车', '能源', '未来']],
  ['四季住在一棵树上', '让一棵树同时长出春花、夏叶、秋果和冬雪。', ['树木', '四季', '颜色']],
  ['昆虫音乐会', '瓢虫、蝴蝶和蜜蜂分别演奏什么乐器？', ['昆虫', '音乐', '舞台']],
  ['云朵变形记', '画三朵形状完全不同的云，再给它们起名字。', ['云朵', '想象', '天空']],
  ['一颗种子的旅行', '从泥土出发，画出它发芽、长叶和开花的过程。', ['种子', '成长', '植物']],
  ['我的太空早餐', '宇航员在失重环境里会怎样吃早餐？', ['太空', '食物', '科学']],
  ['给小鱼建一座城市', '海底的房子、道路和公园会是什么样？', ['小鱼', '城市', '海底']],
  ['雨天观察日记', '画下雨伞、水洼、雨滴和躲雨的小动物。', ['下雨', '观察', '动物']],
  ['如果花会说话', '它今天是什么心情？用花瓣、叶子和表情告诉大家。', ['花朵', '表情', '故事']],
  ['我发明的机器人', '它能帮家里做什么？给它设计三种工具。', ['机器人', '发明', '家庭']],
  ['恐龙来到现代城市', '它怎样坐公交、过马路，又会交到什么朋友？', ['恐龙', '城市', '故事']],
  ['看不见的风', '不用文字，只用树叶、头发和风筝画出风的方向。', ['风', '方向', '观察']],
  ['早餐颜色挑战', '只用红、黄、绿三种颜色画一顿健康早餐。', ['早餐', '颜色', '健康']],
  ['一间会走路的房子', '它用脚、轮子还是翅膀移动？里面住着谁？', ['房子', '移动', '想象']],
  ['夜行动物地图', '画出猫头鹰、蝙蝠和萤火虫夜里活动的位置。', ['夜晚', '动物', '地图']],
  ['我心中的超级树', '它能结出不同水果，还能为谁提供一个家？', ['大树', '水果', '生态']],
  ['给情绪画天气', '开心、紧张和安静分别像哪一种天气？', ['情绪', '天气', '颜色']],
  ['纸上的小小博物馆', '选三件最想收藏的自然宝物，为它们画展柜。', ['博物馆', '自然', '收藏']],
  ['会发光的深海世界', '在深色背景里画水母、鱼群和神秘的光。', ['深海', '光', '生物']],
  ['一张友善城市地图', '画出学校、公园、医院和安全回家的路线。', ['地图', '社区', '安全']],
  ['春天的声音', '鸟叫、流水和风吹树叶，要怎样变成画面？', ['春天', '声音', '自然']],
  ['我和宠物的一天', '从早晨到睡前，画出最有趣的三个时刻。', ['伙伴', '生活', '时间']],
  ['小小气象站', '把今天的温度、云、风和降水画成图标。', ['天气', '科学', '记录']],
  ['蔬菜王国运动会', '胡萝卜、番茄和玉米会参加什么项目？', ['蔬菜', '运动', '故事']],
  ['海陆空交通大集合', '让汽车、轮船和飞机在同一幅画里各得其所。', ['交通', '空间', '分类']],
  ['我的梦境邮票', '把昨晚最奇妙的一幕画进一枚小小邮票里。', ['梦', '邮票', '构图']],
  ['给地球写一张明信片', '画下你最想保护的动物、植物和一片蓝天。', ['地球', '环保', '心愿']],
] as const

function effectiveStrokeSize(tool: DrawTool, size: number): number {
  if (tool === 'eraser') return size * 1.8
  if (tool === 'pencil') return Math.max(2, size * 0.55)
  return size
}

function drawSmoothPath(context: CanvasRenderingContext2D, points: Point[], closed = false) {
  if (points.length === 0) return
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  if (points.length === 1) {
    context.lineTo(points[0].x + 0.01, points[0].y + 0.01)
  } else {
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index]
      const next = points[index + 1]
      context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2)
    }
    const finalPoint = points[points.length - 1]
    context.lineTo(finalPoint.x, finalPoint.y)
  }
  if (closed) context.closePath()
  context.stroke()
}

function drawStroke(context: CanvasRenderingContext2D, stroke: DrawingStroke, textRight = CANVAS_WIDTH) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  context.strokeStyle = stroke.color
  context.fillStyle = stroke.color

  if (stroke.tool === 'text') {
    const point = stroke.points[0]
    if (point && stroke.text) {
      context.globalAlpha = 1
      context.font = `800 ${Math.max(18, stroke.size * 2.2)}px "Microsoft YaHei", "Noto Sans SC", sans-serif`
      context.textBaseline = 'top'
      context.fillText(stroke.text, point.x, point.y, Math.max(60, textRight - point.x - 12))
    }
    context.restore()
    return
  }

  if (stroke.tool === 'spray') {
    context.globalAlpha = 0.22
    stroke.points.forEach((point, pointIndex) => {
      const count = Math.max(5, Math.round(stroke.size * 0.72))
      for (let dot = 0; dot < count; dot += 1) {
        const seed = `${stroke.id}:${pointIndex}:${dot}`
        let hash = 2166136261
        for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619)
        const angle = ((hash >>> 0) % 360) / 180 * Math.PI
        const radiusSeed = ((Math.imul(hash, 1103515245) >>> 0) % 1000) / 1000
        const radius = Math.sqrt(radiusSeed) * stroke.size * 1.25
        const dotSize = Math.max(0.7, stroke.size * (0.025 + ((hash >>> 12) & 7) * 0.008))
        context.beginPath()
        context.arc(point.x + Math.cos(angle) * radius, point.y + Math.sin(angle) * radius, dotSize, 0, Math.PI * 2)
        context.fill()
      }
    })
    context.restore()
    return
  }

  if (stroke.tool === 'ink') {
    context.globalAlpha = 0.94
    if (stroke.points.length === 1) {
      context.beginPath()
      context.arc(stroke.points[0].x, stroke.points[0].y, stroke.size * 0.28, 0, Math.PI * 2)
      context.fill()
    } else {
      stroke.points.slice(1).forEach((point, index) => {
        const previous = stroke.points[index]
        const pressure = point.pressure && point.pressure > 0 ? point.pressure : 0.52
        const tail = Math.min(1, (stroke.points.length - index - 1) / 5)
        context.lineWidth = Math.max(1.2, stroke.size * (0.22 + pressure * 0.95) * (0.36 + tail * 0.64))
        context.beginPath()
        context.moveTo(previous.x, previous.y)
        context.lineTo(point.x, point.y)
        context.stroke()
      })
    }
    context.restore()
    return
  }

  if (stroke.tool === 'wash') {
    context.globalAlpha = 0.13
    context.lineWidth = stroke.size * 1.75
    context.shadowColor = stroke.color
    context.shadowBlur = stroke.size * 0.7
    ;[-0.24, 0, 0.24].forEach((offset) => {
      context.save()
      context.translate(offset * stroke.size, -offset * stroke.size * 0.55)
      drawSmoothPath(context, stroke.points)
      context.restore()
    })
    context.restore()
    return
  }

  context.lineCap = stroke.tool === 'flat' ? 'square' : 'round'
  context.lineJoin = stroke.tool === 'flat' ? 'bevel' : 'round'
  context.lineWidth = stroke.tool === 'flat' ? stroke.size * 1.25 : stroke.size
  context.globalAlpha = stroke.tool === 'marker' ? 0.46 : stroke.tool === 'pencil' ? 0.72 : 1
  drawSmoothPath(context, stroke.points)
  context.restore()
}

function drawIconNode(context: CanvasRenderingContext2D, node: ArtTraceNode) {
  const [tag, attributes] = node
  const number = (name: string, fallback = 0) => Number(attributes[name] ?? fallback)
  context.beginPath()
  if (tag === 'path') {
    context.stroke(new Path2D(String(attributes.d ?? '')))
    return
  }
  if (tag === 'circle') context.arc(number('cx'), number('cy'), number('r'), 0, Math.PI * 2)
  else if (tag === 'ellipse') context.ellipse(number('cx'), number('cy'), number('rx'), number('ry'), 0, 0, Math.PI * 2)
  else if (tag === 'line') {
    context.moveTo(number('x1'), number('y1'))
    context.lineTo(number('x2'), number('y2'))
  } else if (tag === 'rect') {
    context.rect(number('x'), number('y'), number('width'), number('height'))
  } else {
    const values = String(attributes.points ?? '').trim().split(/[ ,]+/).map(Number).filter(Number.isFinite)
    for (let index = 0; index + 1 < values.length; index += 2) {
      if (index === 0) context.moveTo(values[index], values[index + 1])
      else context.lineTo(values[index], values[index + 1])
    }
    if (tag === 'polygon') context.closePath()
  }
  context.stroke()
}

function drawTemplate(context: CanvasRenderingContext2D, template: DrawingTemplate, color: string, lineWidth: number) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (template.iconNodes) {
    const scale = Math.min((CANVAS_WIDTH - 250) / 24, (CANVAS_HEIGHT - 100) / 24)
    context.translate((CANVAS_WIDTH - 24 * scale) / 2, (CANVAS_HEIGHT - 24 * scale) / 2)
    context.scale(scale, scale)
    context.lineWidth = lineWidth / scale
    context.strokeStyle = color
    template.iconNodes.forEach((node) => drawIconNode(context, node))
    context.restore()
    return
  }
  ;(template.paths ?? []).forEach((path) => {
    context.save()
    context.lineWidth = path.role === 'shade' ? lineWidth * 0.58 : path.role === 'construction' ? lineWidth * 0.52 : lineWidth
    context.strokeStyle = color
    context.globalAlpha = path.role === 'construction' ? 0.5 : path.role === 'shade' ? 0.72 : path.role === 'highlight' ? 0.62 : 1
    context.setLineDash(path.role === 'construction' ? [lineWidth * 1.7, lineWidth * 1.35] : path.role === 'highlight' ? [lineWidth * 0.7, lineWidth] : [])
    drawSmoothPath(context, path.points, path.closed)
    context.restore()
  })
  context.restore()
}

function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number, bounds: CanvasBounds): Point {
  const rect = canvas.getBoundingClientRect()
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, bounds.minX + (clientX - rect.left) / rect.width * width)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, bounds.minY + (clientY - rect.top) / rect.height * height)),
  }
}

function TemplatePreview({ template }: { template: DrawingTemplate }) {
  if (template.iconNodes) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke={template.accent} strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
        {template.iconNodes.map(([tag, attributes], index) => createElement(tag, { ...attributes, key: `${template.id}-${index}` }))}
      </svg>
    )
  }
  return (
    <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} aria-hidden="true">
      {(template.paths ?? []).map((path, index) => path.closed
        ? <polygon key={index} className={`is-${path.role ?? 'outline'}`} points={path.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={template.accent} strokeWidth={path.role === 'shade' || path.role === 'construction' ? 8 : 13} strokeDasharray={path.role === 'construction' ? '22 15' : path.role === 'highlight' ? '10 13' : undefined} strokeLinecap="round" strokeLinejoin="round" />
        : <polyline key={index} className={`is-${path.role ?? 'outline'}`} points={path.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={template.accent} strokeWidth={path.role === 'shade' || path.role === 'construction' ? 8 : 13} strokeDasharray={path.role === 'construction' ? '22 15' : path.role === 'highlight' ? '10 13' : undefined} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  )
}

function scoreDrawing(template: DrawingTemplate, strokes: DrawingStroke[]): DrawingScore {
  const target = document.createElement('canvas')
  const drawing = document.createElement('canvas')
  target.width = CANVAS_WIDTH
  target.height = CANVAS_HEIGHT
  drawing.width = CANVAS_WIDTH
  drawing.height = CANVAS_HEIGHT
  const targetContext = target.getContext('2d', { willReadFrequently: true })
  const drawingContext = drawing.getContext('2d', { willReadFrequently: true })
  if (!targetContext || !drawingContext || strokes.length === 0) {
    return { total: 0, coverage: 0, precision: 0, colors: 0, tip: '先落下第一笔，完成主要轮廓后再来评分。' }
  }
  const targetWidth = template.difficulty === 'easy' ? 44 : 34
  drawTemplate(targetContext, template, '#000', targetWidth)
  strokes.forEach((stroke) => drawStroke(drawingContext, stroke))
  const targetPixels = targetContext.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data
  const drawingPixels = drawingContext.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data
  let targetCount = 0
  let coveredCount = 0
  let drawingCount = 0
  let nearTargetCount = 0
  for (let y = 0; y < CANVAS_HEIGHT; y += 4) {
    for (let x = 0; x < CANVAS_WIDTH; x += 4) {
      const alphaIndex = (y * CANVAS_WIDTH + x) * 4 + 3
      const isTarget = targetPixels[alphaIndex] > 20
      const isDrawn = drawingPixels[alphaIndex] > 20
      if (isTarget) targetCount += 1
      if (isTarget && isDrawn) coveredCount += 1
      if (isDrawn) drawingCount += 1
      if (isDrawn && isTarget) nearTargetCount += 1
    }
  }
  const coverage = targetCount > 0 ? coveredCount / targetCount : 0
  const precision = drawingCount > 0 ? Math.min(1, nearTargetCount / drawingCount * 1.65) : 0
  const colors = new Set(strokes.filter((stroke) => stroke.tool !== 'eraser').map((stroke) => stroke.color)).size
  const total = Math.max(0, Math.min(100, Math.round(coverage * 67 + precision * 27 + Math.min(6, colors * 2))))
  let tip = '轮廓很完整。下一张可以试试线条粗细变化，让画面更有远近感。'
  if (coverage < 0.38) tip = '先用大笔画完主要轮廓，不必急着补小细节。'
  else if (precision < 0.42) tip = '手腕放松，沿参考线慢一点转弯，线条会更稳。'
  else if (colors < 2) tip = '轮廓已经不错，再选一种颜色突出主角吧。'
  else if (coverage < 0.68) tip = '主体完成了，再观察参考图中遗漏的短线和小形状。'
  return { total, coverage, precision, colors, tip }
}

export function KidsArtStudio({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const guideRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const currentStrokeRef = useRef<DrawingStroke | null>(null)
  const tvStrokeRef = useRef<DrawingStroke | null>(null)
  const panGestureRef = useRef<PanGesture | null>(null)
  const canvasBoundsRef = useRef<CanvasBounds>({ ...DEFAULT_CANVAS_BOUNDS })
  const expansionTimesRef = useRef<Record<'left' | 'right' | 'top' | 'bottom', number>>({ left: 0, right: 0, top: 0, bottom: 0 })
  const [mode, setMode] = useState<DrawMode>('free')
  const [difficulty, setDifficulty] = useState<ArtDifficulty>('easy')
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id)
  const [guideVisible, setGuideVisible] = useState(true)
  const [guideOpacity, setGuideOpacity] = useState(0.28)
  const [zoom, setZoom] = useState(1)
  const [panMode, setPanMode] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [canvasBounds, setCanvasBounds] = useState<CanvasBounds>({ ...DEFAULT_CANVAS_BOUNDS })
  const [tool, setTool] = useState<DrawTool>('brush')
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(14)
  const [textValue, setTextValue] = useState('')
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateCategory, setTemplateCategory] = useState('全部主题')
  const [visibleTemplateCount, setVisibleTemplateCount] = useState(24)
  const [ideaIndex, setIdeaIndex] = useState(() => Math.floor(Date.now() / 86_400_000) % DAILY_IDEAS.length)
  const [strokes, setStrokes] = useState<DrawingStroke[]>([])
  const [redoStack, setRedoStack] = useState<DrawingStroke[]>([])
  const [score, setScore] = useState<DrawingScore | null>(null)
  const [savedMessage, setSavedMessage] = useState('')
  const [tvCursor, setTvCursor] = useState<Point>({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 })
  const [tvDrawing, setTvDrawing] = useState(false)

  const difficultyTemplates = useMemo(() => TEMPLATES.filter((item) => item.difficulty === difficulty), [difficulty])
  const templateCategories = useMemo(() => ['全部主题', ...Array.from(new Set(difficultyTemplates.map((item) => item.category)))], [difficultyTemplates])
  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLocaleLowerCase('zh-CN')
    return difficultyTemplates.filter((item) => (templateCategory === '全部主题' || item.category === templateCategory)
      && (!query || `${item.title}${item.category}${item.concepts.join('')}`.toLocaleLowerCase('zh-CN').includes(query)))
  }, [difficultyTemplates, templateCategory, templateSearch])
  const template = useMemo(() => TEMPLATES.find((item) => item.id === templateId) ?? difficultyTemplates[0] ?? TEMPLATES[0], [difficultyTemplates, templateId])
  const dailyIdea = DAILY_IDEAS[ideaIndex % DAILY_IDEAS.length]
  const canvasWidth = canvasBounds.maxX - canvasBounds.minX
  const canvasHeight = canvasBounds.maxY - canvasBounds.minY

  useEffect(() => { setVisibleTemplateCount(24) }, [difficulty, templateCategory, templateSearch])

  const chooseTool = (nextTool: DrawTool) => {
    setTool(nextTool)
    setPanMode(false)
  }

  const centerCanvas = () => {
    const frame = frameRef.current
    const current = canvasBoundsRef.current
    const canvasCenterX = (current.minX + current.maxX) / 2
    const canvasCenterY = (current.minY + current.maxY) / 2
    const visualScale = frame ? frame.getBoundingClientRect().width / (current.maxX - current.minX) / zoom : 1
    setZoom(1)
    setPanOffset({
      x: (canvasCenterX - CANVAS_WIDTH / 2) * visualScale,
      y: (canvasCenterY - CANVAS_HEIGHT / 2) * visualScale,
    })
  }

  const expandCanvas = useCallback((direction: 'left' | 'right' | 'top' | 'bottom', displayScale: number) => {
    const now = performance.now()
    if (now - expansionTimesRef.current[direction] < 140) return
    const current = canvasBoundsRef.current
    const width = current.maxX - current.minX
    const height = current.maxY - current.minY
    const horizontal = direction === 'left' || direction === 'right'
    const step = horizontal
      ? Math.min(CANVAS_EXPAND_X, MAX_CANVAS_WIDTH - width)
      : Math.min(CANVAS_EXPAND_Y, MAX_CANVAS_HEIGHT - height)
    if (step <= 0) return
    expansionTimesRef.current[direction] = now
    const next = { ...current }
    if (direction === 'left') next.minX -= step
    if (direction === 'right') next.maxX += step
    if (direction === 'top') next.minY -= step
    if (direction === 'bottom') next.maxY += step
    canvasBoundsRef.current = next
    setCanvasBounds(next)
    const visualShift = step * displayScale / 2
    setPanOffset((offset) => ({
      x: offset.x + (direction === 'right' ? visualShift : direction === 'left' ? -visualShift : 0),
      y: offset.y + (direction === 'bottom' ? visualShift : direction === 'top' ? -visualShift : 0),
    }))
  }, [])

  const selectDifficulty = (nextDifficulty: ArtDifficulty) => {
    const firstTemplate = TEMPLATES.find((item) => item.difficulty === nextDifficulty)
    setDifficulty(nextDifficulty)
    setTemplateCategory('全部主题')
    setTemplateSearch('')
    if (firstTemplate) setTemplateId(firstTemplate.id)
    setScore(null)
  }

  const renderStrokes = useCallback((nextStrokes: DrawingStroke[]) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.save()
    context.translate(-canvasBounds.minX, -canvasBounds.minY)
    nextStrokes.forEach((stroke) => drawStroke(context, stroke, canvasBounds.maxX))
    context.restore()
  }, [canvasBounds])

  useEffect(() => { renderStrokes(strokes) }, [renderStrokes, strokes])

  useEffect(() => {
    const guide = guideRef.current
    const context = guide?.getContext('2d')
    if (!guide || !context) return
    context.clearRect(0, 0, guide.width, guide.height)
    if (mode === 'copy' && guideVisible) {
      context.save()
      context.translate(-canvasBounds.minX, -canvasBounds.minY)
      drawTemplate(context, template, template.accent, 8)
      context.restore()
    }
  }, [canvasBounds, guideVisible, mode, template])

  useEffect(() => {
    const previousRootOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => {
      if (!['Escape', 'BrowserBack', 'GoBack'].includes(event.key)) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => {
      window.removeEventListener('keydown', handleKey, true)
      document.documentElement.style.overflow = previousRootOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [onClose])

  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    event.preventDefault()
    if (panMode || event.button === 1) {
      canvas.setPointerCapture(event.pointerId)
      panGestureRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY }
      return
    }
    const point = { ...canvasPoint(canvas, event.clientX, event.clientY, canvasBoundsRef.current), pressure: event.pressure || 0.5 }
    const strokeSize = effectiveStrokeSize(tool, size)
    const stroke: DrawingStroke = { id: `stroke-${Date.now()}-${event.pointerId}`, points: [point], color, size: strokeSize, tool, text: tool === 'text' ? textValue.trim() : undefined }
    if (tool === 'text') {
      if (!stroke.text) {
        setSavedMessage('先输入要放进画面的文字')
        window.setTimeout(() => setSavedMessage(''), 2200)
        return
      }
      setStrokes((current) => [...current, stroke])
      setRedoStack([])
      setScore(null)
      return
    }
    canvas.setPointerCapture(event.pointerId)
    currentStrokeRef.current = stroke
    const context = canvas.getContext('2d')
    if (context) {
      context.save()
      context.translate(-canvasBoundsRef.current.minX, -canvasBoundsRef.current.minY)
      drawStroke(context, stroke, canvasBoundsRef.current.maxX)
      context.restore()
    }
  }

  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const panGesture = panGestureRef.current
    if (canvas && panGesture?.pointerId === event.pointerId && canvas.hasPointerCapture(event.pointerId)) {
      event.preventDefault()
      const deltaX = event.clientX - panGesture.clientX
      const deltaY = event.clientY - panGesture.clientY
      panGesture.clientX = event.clientX
      panGesture.clientY = event.clientY
      setPanOffset((offset) => ({ x: offset.x + deltaX, y: offset.y + deltaY }))
      const frameRect = frameRef.current?.getBoundingClientRect()
      const viewportRect = viewportRef.current?.getBoundingClientRect()
      if (frameRect && viewportRect) {
        const currentBounds = canvasBoundsRef.current
        const displayScale = frameRect.width / Math.max(1, currentBounds.maxX - currentBounds.minX)
        if (deltaX > 0 && frameRect.left + deltaX > viewportRect.left + 10) expandCanvas('left', displayScale)
        if (deltaX < 0 && frameRect.right + deltaX < viewportRect.right - 10) expandCanvas('right', displayScale)
        if (deltaY > 0 && frameRect.top + deltaY > viewportRect.top + 10) expandCanvas('top', displayScale)
        if (deltaY < 0 && frameRect.bottom + deltaY < viewportRect.bottom - 10) expandCanvas('bottom', displayScale)
      }
      return
    }
    const stroke = currentStrokeRef.current
    if (!canvas || !stroke || !canvas.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    const point = { ...canvasPoint(canvas, event.clientX, event.clientY, canvasBoundsRef.current), pressure: event.pressure || 0.5 }
    const previousPoint = stroke.points[stroke.points.length - 1]
    if (Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < 2) return
    stroke.points.push(point)
    const context = canvas.getContext('2d')
    if (context) {
      if (['spray', 'ink', 'wash', 'flat'].includes(stroke.tool)) renderStrokes([...strokes, { ...stroke, points: [...stroke.points] }])
      else {
        context.save()
        context.translate(-canvasBoundsRef.current.minX, -canvasBoundsRef.current.minY)
        drawStroke(context, { ...stroke, points: [previousPoint, point] }, canvasBoundsRef.current.maxX)
        context.restore()
      }
    }
  }

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const panGesture = panGestureRef.current
    if (canvas && panGesture?.pointerId === event.pointerId) {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      panGestureRef.current = null
      return
    }
    const stroke = currentStrokeRef.current
    if (!canvas || !stroke) return
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    currentStrokeRef.current = null
    setStrokes((current) => [...current, { ...stroke, points: [...stroke.points] }])
    setRedoStack([])
    setScore(null)
  }

  const undo = () => {
    setStrokes((current) => {
      const last = current[current.length - 1]
      if (!last) return current
      setRedoStack((redo) => [...redo, last])
      return current.slice(0, -1)
    })
    setScore(null)
  }

  const redo = () => {
    setRedoStack((current) => {
      const next = current[current.length - 1]
      if (!next) return current
      setStrokes((drawing) => [...drawing, next])
      return current.slice(0, -1)
    })
    setScore(null)
  }

  const clearDrawing = () => {
    if (strokes.length > 0 && !window.confirm('确认清空这张画？')) return
    setStrokes([])
    setRedoStack([])
    setScore(null)
    canvasBoundsRef.current = { ...DEFAULT_CANVAS_BOUNDS }
    setCanvasBounds({ ...DEFAULT_CANVAS_BOUNDS })
    setPanOffset({ x: 0, y: 0 })
    setZoom(1)
  }

  const saveArtwork = () => {
    const drawing = canvasRef.current
    if (!drawing) return
    const output = document.createElement('canvas')
    output.width = drawing.width
    output.height = drawing.height
    const context = output.getContext('2d')
    if (!context) return
    context.fillStyle = '#fffdf8'
    context.fillRect(0, 0, output.width, output.height)
    context.drawImage(drawing, 0, 0)
    const dataUrl = output.toDataURL('image/webp', 0.82)
    try {
      const gallery = JSON.parse(window.localStorage.getItem(GALLERY_KEY) ?? '[]') as Array<{ createdAt: string; template: string; image: string }>
      window.localStorage.setItem(GALLERY_KEY, JSON.stringify([{ createdAt: new Date().toISOString(), template: mode === 'copy' ? template.title : '自由创作', image: dataUrl }, ...gallery].slice(0, 4)))
      setSavedMessage('作品已保存到这台设备，并生成图片文件')
    } catch {
      setSavedMessage('设备空间不足，已为你准备下载文件')
    }
    const anchor = document.createElement('a')
    anchor.href = output.toDataURL('image/png')
    anchor.download = `Lumi-小小画室-${new Date().toISOString().slice(0, 10)}.png`
    anchor.click()
    window.setTimeout(() => setSavedMessage(''), 2800)
  }

  const evaluate = () => {
    if (mode === 'free') {
      const colors = new Set(strokes.filter((stroke) => stroke.tool !== 'eraser').map((stroke) => stroke.color)).size
      setScore({ total: Math.min(100, 45 + strokes.length * 3 + colors * 5), coverage: 0, precision: 0, colors, tip: strokes.length === 0 ? '先落下第一笔，再来看看作品记录。' : '自由创作不比较“像不像”，试试给画面加入一个主角和一个背景。' })
      return
    }
    setScore(scoreDrawing(template, strokes))
  }

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (DEVICE_PROFILE !== 'tv') return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (tvDrawing) {
        const stroke = tvStrokeRef.current
        if (stroke) {
          setStrokes((current) => [...current, stroke])
          setRedoStack([])
          setScore(null)
        }
        tvStrokeRef.current = null
        setTvDrawing(false)
      } else {
        const strokeSize = effectiveStrokeSize(tool, size)
        if (tool === 'text') {
          if (textValue.trim()) {
            setStrokes((current) => [...current, { id: `tv-text-${Date.now()}`, points: [tvCursor], color, size: strokeSize, tool, text: textValue.trim() }])
            setRedoStack([])
            setScore(null)
          } else {
            setSavedMessage('先输入要放进画面的文字')
          }
          return
        }
        const stroke: DrawingStroke = { id: `tv-stroke-${Date.now()}`, points: [{ ...tvCursor, pressure: 0.55 }], color, size: strokeSize, tool }
        tvStrokeRef.current = stroke
        setTvDrawing(true)
      }
      return
    }
    const movement: Record<string, Point> = {
      ArrowLeft: { x: -18, y: 0 },
      ArrowRight: { x: 18, y: 0 },
      ArrowUp: { x: 0, y: -18 },
      ArrowDown: { x: 0, y: 18 },
    }
    const delta = movement[event.key]
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    const next = {
      x: Math.max(canvasBounds.minX, Math.min(canvasBounds.maxX, tvCursor.x + delta.x)),
      y: Math.max(canvasBounds.minY, Math.min(canvasBounds.maxY, tvCursor.y + delta.y)),
    }
    if (tvDrawing && tvStrokeRef.current) {
      const previous = tvStrokeRef.current.points[tvStrokeRef.current.points.length - 1]
      tvStrokeRef.current.points.push(next)
      const context = canvasRef.current?.getContext('2d')
      if (context) {
        context.save()
        context.translate(-canvasBounds.minX, -canvasBounds.minY)
        drawStroke(context, { ...tvStrokeRef.current, points: [previous, next] }, canvasBounds.maxX)
        context.restore()
      }
    }
    setTvCursor(next)
  }

  return (
    <div className="art-studio-backdrop" role="dialog" aria-modal="true" aria-label="小小画室" data-art-template-total={TEMPLATES.length} data-open-trace-total={ART_TRACE_SOURCES.length}>
      <header className="art-studio-header">
        <div><span className="art-studio-logo"><Palette size={20} /></span><div><strong>小小画室</strong><span>自由创作 · 分级简笔画 · 每日灵感</span></div></div>
        <div className="art-mode-switch" role="tablist" aria-label="绘画模式">
          <button type="button" role="tab" aria-selected={mode === 'free'} className={mode === 'free' ? 'is-active' : ''} onClick={() => { setMode('free'); setScore(null) }}><Sparkles size={15} />自由画</button>
          <button type="button" role="tab" aria-selected={mode === 'copy'} className={mode === 'copy' ? 'is-active' : ''} onClick={() => { setMode('copy'); setScore(null) }}><ImageIcon size={15} />照着画</button>
        </div>
        <button type="button" className="art-close" aria-label="退出小小画室" data-tv-close onClick={onClose}><X size={21} /></button>
      </header>

      <main className="art-studio-main">
        <aside className="art-toolbox" aria-label="画笔工具">
          <div className="art-tool-group">
            <span>画笔</span>
            <div className="art-tool-segment">
              <button type="button" title="铅笔" aria-label="铅笔" aria-pressed={tool === 'pencil'} className={tool === 'pencil' ? 'is-active' : ''} onClick={() => chooseTool('pencil')}><Pencil size={18} /></button>
              <button type="button" title="画笔" aria-label="画笔" aria-pressed={tool === 'brush'} className={tool === 'brush' ? 'is-active' : ''} onClick={() => chooseTool('brush')}><Brush size={18} /></button>
              <button type="button" title="平刷" aria-label="平刷" aria-pressed={tool === 'flat'} className={tool === 'flat' ? 'is-active' : ''} onClick={() => chooseTool('flat')}><Paintbrush size={18} /></button>
              <button type="button" title="马克笔" aria-label="马克笔" aria-pressed={tool === 'marker'} className={tool === 'marker' ? 'is-active' : ''} onClick={() => chooseTool('marker')}><Highlighter size={18} /></button>
              <button type="button" title="喷漆" aria-label="喷漆" aria-pressed={tool === 'spray'} className={tool === 'spray' ? 'is-active' : ''} onClick={() => chooseTool('spray')}><SprayCan size={18} /></button>
              <button type="button" title="毛笔" aria-label="毛笔" aria-pressed={tool === 'ink'} className={tool === 'ink' ? 'is-active' : ''} onClick={() => chooseTool('ink')}><PenTool size={18} /></button>
              <button type="button" title="水墨" aria-label="水墨" aria-pressed={tool === 'wash'} className={tool === 'wash' ? 'is-active' : ''} onClick={() => chooseTool('wash')}><Droplets size={18} /></button>
              <button type="button" title="插入文字" aria-label="插入文字" aria-pressed={tool === 'text'} className={tool === 'text' ? 'is-active' : ''} onClick={() => chooseTool('text')}><LetterText size={18} /></button>
              <button type="button" title="橡皮擦" aria-label="橡皮擦" aria-pressed={tool === 'eraser'} className={tool === 'eraser' ? 'is-active' : ''} onClick={() => chooseTool('eraser')}><Eraser size={18} /></button>
            </div>
          </div>
          {tool === 'text' && <label className="art-text-control"><span>文字</span><input type="text" value={textValue} maxLength={24} placeholder="输入后点击画布" aria-label="要插入画面的文字" onChange={(event) => setTextValue(event.target.value)} /></label>}
          <div className="art-tool-group art-color-group">
            <span>颜色</span>
            <div>{COLORS.map((swatch) => <button type="button" key={swatch} aria-label={`选择颜色 ${swatch}`} aria-pressed={color === swatch} className={color === swatch ? 'is-active' : ''} style={{ backgroundColor: swatch }} onClick={() => { setColor(swatch); if (tool === 'eraser') setTool('brush') }} />)}<label className="art-custom-color" title="自定义颜色" style={{ backgroundColor: color }}><input type="color" value={color} aria-label="自定义画笔颜色" onChange={(event) => { setColor(event.target.value); if (tool === 'eraser') setTool('brush') }} /></label></div>
          </div>
          <label className="art-size-control"><span>{tool === 'text' ? '字号' : '粗细'} <b>{size}</b></span><input type="range" min="2" max="64" step="1" value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
          <div className="art-history-actions">
            <button type="button" title="撤销" aria-label="撤销" onClick={undo} disabled={strokes.length === 0}><Undo2 size={17} /></button>
            <button type="button" title="重做" aria-label="重做" onClick={redo} disabled={redoStack.length === 0}><Redo2 size={17} /></button>
            <button type="button" title="清空" aria-label="清空画布" onClick={clearDrawing} disabled={strokes.length === 0}><Trash2 size={17} /></button>
          </div>
        </aside>

        <section className="art-canvas-section">
          <div ref={viewportRef} className={`art-canvas-viewport ${zoom !== 1 || canvasWidth !== CANVAS_WIDTH || canvasHeight !== CANVAS_HEIGHT ? 'is-expanded' : ''} ${panMode ? 'is-panning' : ''}`}>
            <div
              ref={frameRef}
              className="art-canvas-frame"
              data-canvas-width={canvasWidth}
              data-canvas-height={canvasHeight}
              data-canvas-min-x={canvasBounds.minX}
              data-canvas-min-y={canvasBounds.minY}
              style={{
                width: `${canvasWidth / CANVAS_WIDTH * zoom * 100}%`,
                maxWidth: `${1080 * canvasWidth / CANVAS_WIDTH * zoom}px`,
                aspectRatio: `${canvasWidth} / ${canvasHeight}`,
                transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0)`,
              }}
            >
              <canvas ref={guideRef} width={canvasWidth} height={canvasHeight} className={`art-guide-canvas ${mode === 'copy' && guideVisible ? 'is-visible' : ''}`} style={{ opacity: mode === 'copy' && guideVisible ? guideOpacity : 0 }} aria-hidden="true" />
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="art-drawing-canvas"
                aria-label={DEVICE_PROFILE === 'tv' ? '画布，确认键开始或结束绘画，方向键移动画笔' : '绘画画布'}
                aria-roledescription={panMode ? '可拖动扩展的画布' : '可绘画的画布'}
                data-pan-mode={panMode}
                tabIndex={0}
                data-tv-initial
                onPointerDown={beginStroke}
                onPointerMove={continueStroke}
                onPointerUp={finishStroke}
                onPointerCancel={finishStroke}
                onKeyDown={handleCanvasKeyDown}
              />
              {DEVICE_PROFILE === 'tv' && <span className={`art-tv-cursor ${tvDrawing ? 'is-drawing' : ''}`} style={{ left: `${(tvCursor.x - canvasBounds.minX) / canvasWidth * 100}%`, top: `${(tvCursor.y - canvasBounds.minY) / canvasHeight * 100}%`, backgroundColor: tool === 'eraser' ? '#fff' : color }} />}
              {strokes.length === 0 && mode === 'free' && <div className="art-empty-hint"><Brush size={25} /><strong>这里是你的画布</strong><span>{DEVICE_PROFILE === 'tv' ? '聚焦画布后按确认键落笔' : '手指、鼠标或触控笔都可以'}</span></div>}
            </div>
          </div>
          <div className="art-canvas-actions">
            {mode === 'copy' && <button type="button" className="button button-quiet" onClick={() => setGuideVisible((current) => !current)}>{guideVisible ? <EyeOff size={16} /> : <Eye size={16} />}{guideVisible ? '隐藏辅助线' : '显示辅助线'}</button>}
            {DEVICE_PROFILE !== 'tv' && <button type="button" className={`button button-quiet art-pan-toggle ${panMode ? 'is-active' : ''}`} aria-label="拖动画布" aria-pressed={panMode} title="拖到边缘可扩展画布" onClick={() => setPanMode((current) => !current)}><Hand size={16} />拖动画布</button>}
            {DEVICE_PROFILE !== 'tv' && <div className="art-zoom-control" aria-label="画布缩放"><button type="button" aria-label="缩小画布" disabled={zoom <= 0.5} onClick={() => setZoom((current) => Math.max(0.5, current - 0.5))}><Minus size={15} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="放大画布" disabled={zoom >= 3} onClick={() => setZoom((current) => Math.min(3, current + 0.5))}><Plus size={15} /></button></div>}
            {DEVICE_PROFILE !== 'tv' && <button type="button" className="art-center-canvas" aria-label="画布回到中心" title="画布回到中心" onClick={centerCanvas}><Maximize2 size={16} /></button>}
            <span className="art-canvas-size" aria-label={`画布尺寸 ${canvasWidth} 乘 ${canvasHeight}`}>{canvasWidth} × {canvasHeight}</span>
            <button type="button" className="button button-quiet" onClick={evaluate}><CheckCircle2 size={16} />{mode === 'copy' ? '看看完成度' : '看看作品建议'}</button>
            <button type="button" className="button button-primary" onClick={saveArtwork} disabled={strokes.length === 0}><Download size={16} />保存作品</button>
          </div>
          {savedMessage && <div className="art-save-message" role="status"><Save size={15} />{savedMessage}</div>}
        </section>

        <aside className="art-reference-panel">
          {mode === 'copy' ? (
            <>
              <div className="art-difficulty-switch" role="tablist" aria-label="临摹难度">
                {DIFFICULTIES.map((item) => <button type="button" role="tab" key={item.id} aria-selected={difficulty === item.id} className={difficulty === item.id ? 'is-active' : ''} onClick={() => selectDifficulty(item.id)}><strong>{item.label}</strong><span>{item.caption}</span></button>)}
              </div>
              <div className="art-reference-heading" data-art-difficulty={template.difficulty}><span className="eyebrow">{template.category} · {DIFFICULTIES.find((item) => item.id === template.difficulty)?.label}</span><h2>{template.title}</h2><p>{template.hint}</p></div>
              <div className="art-reference-image"><TemplatePreview template={template} /></div>
              {template.sourceUrl && <span className="art-source-note">开源线稿 · Lucide ISC</span>}
              <label className="art-guide-opacity"><span>参考线深浅</span><input type="range" min="0.12" max="0.65" step="0.01" value={guideOpacity} onChange={(event) => setGuideOpacity(Number(event.target.value))} /></label>
              <section className="art-lesson-card" aria-label={`${template.title}学习提示`}>
                <strong>{template.lesson}</strong>
                <ol>{template.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
                <div>{template.concepts.map((concept) => <span key={concept}>{concept}</span>)}</div>
              </section>
              <div className="art-template-filters">
                <label><Lightbulb size={14} /><input type="search" aria-label="搜索临摹图" placeholder="搜索动物、植物……" value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} /></label>
                <select aria-label="筛选临摹主题" value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)}>{templateCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
              </div>
              <div className="art-template-picker" aria-label="选择临摹图" data-filtered-total={filteredTemplates.length}>
                {filteredTemplates.slice(0, visibleTemplateCount).map((item) => <button type="button" key={item.id} className={item.id === template.id ? 'is-active' : ''} aria-pressed={item.id === template.id} aria-label={`${item.title}，${item.category}`} onClick={() => { setTemplateId(item.id); setScore(null) }}><TemplatePreview template={item} /><span>{item.title}</span><small>{item.category}</small></button>)}
              </div>
              {filteredTemplates.length === 0 && <p className="art-template-empty">没有匹配的临摹图，换个关键词试试。</p>}
              {filteredTemplates.length > 24 && <button type="button" className="art-template-more" onClick={() => setVisibleTemplateCount((current) => current >= filteredTemplates.length ? 24 : Math.min(filteredTemplates.length, current + 24))}>{visibleTemplateCount >= filteredTemplates.length ? '收起题库' : `再看一些（${Math.min(visibleTemplateCount, filteredTemplates.length)}/${filteredTemplates.length}）`}</button>}
            </>
          ) : (
            <div className="art-free-prompt"><Sparkles size={30} /><span className="eyebrow">TODAY'S IDEA · {ideaIndex % DAILY_IDEAS.length + 1}/{DAILY_IDEAS.length}</span><h2>{dailyIdea[0]}</h2><p>{dailyIdea[1]}</p><div>{dailyIdea[2].map((tag) => <span key={tag}>{tag}</span>)}</div><button type="button" onClick={() => setIdeaIndex((current) => (current + 1) % DAILY_IDEAS.length)}><RefreshCw size={14} />换个灵感</button></div>
          )}
          {score && (
            <section className="art-score-panel" aria-live="polite">
              <span className="art-score-number">{score.total}<small>/ 100</small></span>
              <div><strong>{mode === 'copy' ? '临摹完成度' : '创作记录'}</strong><p>{score.tip}</p></div>
              {mode === 'copy' && <ul><li><span>轮廓覆盖</span><b>{Math.round(score.coverage * 100)}%</b></li><li><span>落笔贴合</span><b>{Math.round(score.precision * 100)}%</b></li><li><span>使用颜色</span><b>{score.colors} 种</b></li></ul>}
              <small>这是练习辅助评分，不评价想象力和作品好坏。</small>
            </section>
          )}
        </aside>
      </main>
    </div>
  )
}
