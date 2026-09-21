import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  Brush,
  CheckCircle2,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Highlighter,
  Minus,
  Palette,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { DEVICE_PROFILE } from './device'

type DrawTool = 'pencil' | 'brush' | 'marker' | 'eraser'
type DrawMode = 'free' | 'copy'
type ArtDifficulty = 'easy' | 'medium' | 'advanced'
type GuideRole = 'outline' | 'construction' | 'shade' | 'highlight'

interface Point {
  x: number
  y: number
}

interface DrawingStroke {
  id: string
  points: Point[]
  color: string
  size: number
  tool: DrawTool
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
  paths: TemplatePath[]
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
const GALLERY_KEY = 'lumi:kids-art-gallery:v1'
const COLORS = ['#263238', '#778086', '#ef5350', '#ff8f3d', '#f2c94c', '#62ad65', '#27a9c4', '#4279df', '#9b59c9', '#ec6fae']
const DIFFICULTIES: Array<{ id: ArtDifficulty; label: string; caption: string }> = [
  { id: 'easy', label: '简单', caption: '大轮廓' },
  { id: 'medium', label: '中等', caption: '结构细节' },
  { id: 'advanced', label: '复杂', caption: '光影素描' },
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

const TEMPLATES: DrawingTemplate[] = [
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
  {
    id: 'sphere-light',
    title: '球体光影练习',
    hint: '先画球，再分清高光、灰面、明暗交界线和投影。',
    accent: '#596a78',
    difficulty: 'advanced',
    category: '素描基础',
    lesson: '光从左上方照来：左上最亮，右下最暗，桌面投影朝右。',
    steps: ['轻画球体外轮廓', '标出明暗交界线', '用平行排线逐层加深暗部'],
    concepts: ['光源方向', '明暗五调子', '投影'],
    paths: [
      ellipsePath(450, 310, 190, 190),
      arcPath(438, 320, 145, 182, -1.2, 1.25, 'construction'),
      ellipsePath(370, 235, 48, 35, 'highlight'),
      ellipsePath(610, 485, 220, 55, 'shade'),
      ...hatchPaths(465, 175, 120, 260, 10, 65),
      { role: 'construction', points: [{ x: 145, y: 105 }, { x: 285, y: 215 }] },
      { role: 'construction', points: [{ x: 145, y: 105 }, { x: 210, y: 102 }, { x: 180, y: 160 }] },
    ],
  },
  {
    id: 'apple-study',
    title: '苹果静物素描',
    hint: '轮廓不是正圆；顺着苹果体积排线，暗部要逐层加深。',
    accent: '#765b57',
    difficulty: 'advanced',
    category: '静物素描',
    lesson: '用轮廓变化和弧形排线表现苹果的体积与桌面空间。',
    steps: ['概括苹果外轮廓', '确定果窝、梗和叶片', '从明暗交界线向暗部叠加排线'],
    concepts: ['结构素描', '体积排线', '接触阴影'],
    paths: [
      { points: [{ x: 480, y: 175 }, { x: 410, y: 135 }, { x: 290, y: 185 }, { x: 240, y: 320 }, { x: 275, y: 485 }, { x: 390, y: 550 }, { x: 480, y: 520 }, { x: 570, y: 550 }, { x: 685, y: 485 }, { x: 720, y: 320 }, { x: 670, y: 185 }, { x: 550, y: 135 }, { x: 480, y: 175 }], closed: true },
      { points: [{ x: 480, y: 175 }, { x: 495, y: 72 }] },
      { points: [{ x: 495, y: 100 }, { x: 585, y: 72 }, { x: 640, y: 125 }, { x: 545, y: 155 }, { x: 495, y: 100 }], closed: true },
      arcPath(515, 330, 155, 175, -1.1, 1.15, 'construction'),
      ellipsePath(585, 520, 235, 48, 'shade'),
      ...hatchPaths(505, 205, 130, 245, 12, 52),
      ...hatchPaths(560, 290, 105, 155, 8, 34),
      ellipsePath(375, 255, 38, 28, 'highlight'),
    ],
  },
  {
    id: 'botanical-leaf',
    title: '植物学叶片',
    hint: '先抓住叶片外形和主叶脉，再观察侧叶脉的角度与疏密。',
    accent: '#4e765e',
    difficulty: 'advanced',
    category: '植物科学',
    lesson: '像植物观察员一样记录叶形、叶缘、叶脉和受光方向。',
    steps: ['叶柄和弯曲主脉', '左右不完全对称的叶缘', '侧叶脉、明暗和投影'],
    concepts: ['植物结构', '不完全对称', '纹理与光影'],
    paths: [
      { points: [{ x: 185, y: 535 }, { x: 250, y: 455 }, { x: 290, y: 325 }, { x: 390, y: 185 }, { x: 580, y: 90 }, { x: 745, y: 115 }, { x: 720, y: 275 }, { x: 620, y: 430 }, { x: 470, y: 520 }, { x: 300, y: 545 }, { x: 185, y: 535 }], closed: true },
      { points: [{ x: 165, y: 585 }, { x: 265, y: 500 }, { x: 390, y: 385 }, { x: 520, y: 260 }, { x: 700, y: 125 }] },
      ...[
        [300, 470, 250, 390], [355, 420, 300, 315], [415, 365, 360, 245], [475, 310, 430, 185],
        [520, 265, 610, 350], [575, 220, 665, 290], [625, 180, 715, 220],
      ].map(([x1, y1, x2, y2]) => ({ role: 'construction' as const, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] })),
      ...hatchPaths(515, 245, 135, 140, 10, 40),
      ellipsePath(520, 555, 255, 35, 'shade'),
    ],
  },
]

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

function drawStroke(context: CanvasRenderingContext2D, stroke: DrawingStroke) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = stroke.size
  context.globalAlpha = stroke.tool === 'marker' ? 0.5 : stroke.tool === 'pencil' ? 0.72 : 1
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  context.strokeStyle = stroke.color
  drawSmoothPath(context, stroke.points)
  context.restore()
}

function drawTemplate(context: CanvasRenderingContext2D, template: DrawingTemplate, color: string, lineWidth: number) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  template.paths.forEach((path) => {
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

function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): Point {
  const rect = canvas.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH, (clientX - rect.left) / rect.width * CANVAS_WIDTH)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT, (clientY - rect.top) / rect.height * CANVAS_HEIGHT)),
  }
}

function TemplatePreview({ template }: { template: DrawingTemplate }) {
  return (
    <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} aria-hidden="true">
      {template.paths.map((path, index) => path.closed
        ? <polygon key={index} className={`is-${path.role ?? 'outline'}`} points={path.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={template.accent} strokeWidth={path.role === 'shade' || path.role === 'construction' ? 8 : 13} strokeDasharray={path.role === 'construction' ? '22 15' : path.role === 'highlight' ? '10 13' : undefined} strokeLinecap="round" strokeLinejoin="round" />
        : <polyline key={index} className={`is-${path.role ?? 'outline'}`} points={path.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={template.accent} strokeWidth={path.role === 'shade' || path.role === 'construction' ? 8 : 13} strokeDasharray={path.role === 'construction' ? '22 15' : path.role === 'highlight' ? '10 13' : undefined} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  )
}

function scoreDrawing(canvas: HTMLCanvasElement, template: DrawingTemplate, strokes: DrawingStroke[]): DrawingScore {
  const target = document.createElement('canvas')
  target.width = CANVAS_WIDTH
  target.height = CANVAS_HEIGHT
  const targetContext = target.getContext('2d', { willReadFrequently: true })
  const drawingContext = canvas.getContext('2d', { willReadFrequently: true })
  if (!targetContext || !drawingContext || strokes.length === 0) {
    return { total: 0, coverage: 0, precision: 0, colors: 0, tip: '先落下第一笔，完成主要轮廓后再来评分。' }
  }
  const targetWidth = template.difficulty === 'easy' ? 44 : template.difficulty === 'medium' ? 34 : 26
  drawTemplate(targetContext, template, '#000', targetWidth)
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
  let tip = template.difficulty === 'advanced'
    ? '结构和明暗关系已经建立。再比较亮部、灰面和暗部的过渡是否自然。'
    : '轮廓很完整。下一张可以试试线条粗细变化，让画面更有远近感。'
  if (coverage < 0.38) tip = '先用大笔画完主要轮廓，不必急着补小细节。'
  else if (precision < 0.42) tip = '手腕放松，沿参考线慢一点转弯，线条会更稳。'
  else if (colors < 2) tip = '轮廓已经不错，再选一种颜色突出主角吧。'
  else if (coverage < 0.68) tip = template.difficulty === 'advanced' ? '主体完成了，再补上结构线、排线和投影的方向。' : '主体完成了，再观察参考图中遗漏的短线和小形状。'
  return { total, coverage, precision, colors, tip }
}

export function KidsArtStudio({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const guideRef = useRef<HTMLCanvasElement>(null)
  const currentStrokeRef = useRef<DrawingStroke | null>(null)
  const tvStrokeRef = useRef<DrawingStroke | null>(null)
  const [mode, setMode] = useState<DrawMode>('free')
  const [difficulty, setDifficulty] = useState<ArtDifficulty>('easy')
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id)
  const [guideVisible, setGuideVisible] = useState(true)
  const [guideOpacity, setGuideOpacity] = useState(0.28)
  const [zoom, setZoom] = useState(1)
  const [tool, setTool] = useState<DrawTool>('brush')
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(14)
  const [strokes, setStrokes] = useState<DrawingStroke[]>([])
  const [redoStack, setRedoStack] = useState<DrawingStroke[]>([])
  const [score, setScore] = useState<DrawingScore | null>(null)
  const [savedMessage, setSavedMessage] = useState('')
  const [tvCursor, setTvCursor] = useState<Point>({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 })
  const [tvDrawing, setTvDrawing] = useState(false)

  const filteredTemplates = useMemo(() => TEMPLATES.filter((item) => item.difficulty === difficulty), [difficulty])
  const template = useMemo(() => TEMPLATES.find((item) => item.id === templateId) ?? filteredTemplates[0] ?? TEMPLATES[0], [filteredTemplates, templateId])

  const selectDifficulty = (nextDifficulty: ArtDifficulty) => {
    const firstTemplate = TEMPLATES.find((item) => item.difficulty === nextDifficulty)
    setDifficulty(nextDifficulty)
    if (firstTemplate) setTemplateId(firstTemplate.id)
    setScore(null)
  }

  const renderStrokes = useCallback((nextStrokes: DrawingStroke[]) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    nextStrokes.forEach((stroke) => drawStroke(context, stroke))
  }, [])

  useEffect(() => { renderStrokes(strokes) }, [renderStrokes, strokes])

  useEffect(() => {
    const guide = guideRef.current
    const context = guide?.getContext('2d')
    if (!guide || !context) return
    context.clearRect(0, 0, guide.width, guide.height)
    if (mode === 'copy' && guideVisible) drawTemplate(context, template, template.accent, 8)
  }, [guideVisible, mode, template])

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
    canvas.setPointerCapture(event.pointerId)
    const point = canvasPoint(canvas, event.clientX, event.clientY)
    const strokeSize = tool === 'eraser' ? size * 1.8 : tool === 'pencil' ? Math.max(2, size * 0.55) : size
    const stroke: DrawingStroke = { id: `stroke-${Date.now()}-${event.pointerId}`, points: [point], color, size: strokeSize, tool }
    currentStrokeRef.current = stroke
    const context = canvas.getContext('2d')
    if (context) drawStroke(context, stroke)
  }

  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const stroke = currentStrokeRef.current
    if (!canvas || !stroke || !canvas.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    const point = canvasPoint(canvas, event.clientX, event.clientY)
    const previousPoint = stroke.points[stroke.points.length - 1]
    if (Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < 2) return
    stroke.points.push(point)
    const context = canvas.getContext('2d')
    if (context) drawStroke(context, { ...stroke, points: [previousPoint, point] })
  }

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
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
  }

  const saveArtwork = () => {
    const drawing = canvasRef.current
    if (!drawing) return
    const output = document.createElement('canvas')
    output.width = CANVAS_WIDTH
    output.height = CANVAS_HEIGHT
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
    const canvas = canvasRef.current
    if (!canvas) return
    if (mode === 'free') {
      const colors = new Set(strokes.filter((stroke) => stroke.tool !== 'eraser').map((stroke) => stroke.color)).size
      setScore({ total: Math.min(100, 45 + strokes.length * 3 + colors * 5), coverage: 0, precision: 0, colors, tip: strokes.length === 0 ? '先落下第一笔，再来看看作品记录。' : '自由创作不比较“像不像”，试试给画面加入一个主角和一个背景。' })
      return
    }
    setScore(scoreDrawing(canvas, template, strokes))
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
        const strokeSize = tool === 'eraser' ? size * 1.8 : tool === 'pencil' ? Math.max(2, size * 0.55) : size
        const stroke: DrawingStroke = { id: `tv-stroke-${Date.now()}`, points: [tvCursor], color, size: strokeSize, tool }
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
    const next = { x: Math.max(0, Math.min(CANVAS_WIDTH, tvCursor.x + delta.x)), y: Math.max(0, Math.min(CANVAS_HEIGHT, tvCursor.y + delta.y)) }
    if (tvDrawing && tvStrokeRef.current) {
      const previous = tvStrokeRef.current.points[tvStrokeRef.current.points.length - 1]
      tvStrokeRef.current.points.push(next)
      const context = canvasRef.current?.getContext('2d')
      if (context) drawStroke(context, { ...tvStrokeRef.current, points: [previous, next] })
    }
    setTvCursor(next)
  }

  return (
    <div className="art-studio-backdrop" role="dialog" aria-modal="true" aria-label="小小画室">
      <header className="art-studio-header">
        <div><span className="art-studio-logo"><Palette size={20} /></span><div><strong>小小画室</strong><span>自由创作 · 分级临摹 · 光影素描</span></div></div>
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
              <button type="button" title="铅笔" aria-label="铅笔" aria-pressed={tool === 'pencil'} className={tool === 'pencil' ? 'is-active' : ''} onClick={() => setTool('pencil')}><Pencil size={18} /></button>
              <button type="button" title="画笔" aria-label="画笔" aria-pressed={tool === 'brush'} className={tool === 'brush' ? 'is-active' : ''} onClick={() => setTool('brush')}><Brush size={18} /></button>
              <button type="button" title="马克笔" aria-label="马克笔" aria-pressed={tool === 'marker'} className={tool === 'marker' ? 'is-active' : ''} onClick={() => setTool('marker')}><Highlighter size={18} /></button>
              <button type="button" title="橡皮擦" aria-label="橡皮擦" aria-pressed={tool === 'eraser'} className={tool === 'eraser' ? 'is-active' : ''} onClick={() => setTool('eraser')}><Eraser size={18} /></button>
            </div>
          </div>
          <div className="art-tool-group art-color-group">
            <span>颜色</span>
            <div>{COLORS.map((swatch) => <button type="button" key={swatch} aria-label={`选择颜色 ${swatch}`} aria-pressed={color === swatch} className={color === swatch ? 'is-active' : ''} style={{ backgroundColor: swatch }} onClick={() => { setColor(swatch); if (tool === 'eraser') setTool('brush') }} />)}</div>
          </div>
          <label className="art-size-control"><span>粗细 <b>{size}</b></span><input type="range" min="2" max="40" step="1" value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
          <div className="art-history-actions">
            <button type="button" title="撤销" aria-label="撤销" onClick={undo} disabled={strokes.length === 0}><Undo2 size={17} /></button>
            <button type="button" title="重做" aria-label="重做" onClick={redo} disabled={redoStack.length === 0}><Redo2 size={17} /></button>
            <button type="button" title="清空" aria-label="清空画布" onClick={clearDrawing} disabled={strokes.length === 0}><Trash2 size={17} /></button>
          </div>
        </aside>

        <section className="art-canvas-section">
          <div className={`art-canvas-viewport ${zoom > 1 ? 'is-zoomed' : ''}`}>
            <div className="art-canvas-frame" style={{ width: zoom === 1 ? 'min(100%, 1080px)' : `${zoom * 100}%`, maxWidth: `${1080 * zoom}px` }}>
              <canvas ref={guideRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className={`art-guide-canvas ${mode === 'copy' && guideVisible ? 'is-visible' : ''}`} style={{ opacity: mode === 'copy' && guideVisible ? guideOpacity : 0 }} aria-hidden="true" />
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="art-drawing-canvas"
                aria-label={DEVICE_PROFILE === 'tv' ? '画布，确认键开始或结束绘画，方向键移动画笔' : '绘画画布'}
                tabIndex={0}
                data-tv-initial
                onPointerDown={beginStroke}
                onPointerMove={continueStroke}
                onPointerUp={finishStroke}
                onPointerCancel={finishStroke}
                onKeyDown={handleCanvasKeyDown}
              />
              {DEVICE_PROFILE === 'tv' && <span className={`art-tv-cursor ${tvDrawing ? 'is-drawing' : ''}`} style={{ left: `${tvCursor.x / CANVAS_WIDTH * 100}%`, top: `${tvCursor.y / CANVAS_HEIGHT * 100}%`, backgroundColor: tool === 'eraser' ? '#fff' : color }} />}
              {strokes.length === 0 && <div className="art-empty-hint"><Brush size={25} /><strong>{mode === 'copy' ? '沿着浅色参考线开始画' : '这里是你的画布'}</strong><span>{DEVICE_PROFILE === 'tv' ? '聚焦画布后按确认键落笔' : '手指、鼠标或触控笔都可以'}</span></div>}
            </div>
          </div>
          <div className="art-canvas-actions">
            {mode === 'copy' && <button type="button" className="button button-quiet" onClick={() => setGuideVisible((current) => !current)}>{guideVisible ? <EyeOff size={16} /> : <Eye size={16} />}{guideVisible ? '隐藏辅助线' : '显示辅助线'}</button>}
            {DEVICE_PROFILE !== 'tv' && <div className="art-zoom-control" aria-label="画布缩放"><button type="button" aria-label="缩小画布" disabled={zoom <= 1} onClick={() => setZoom((current) => Math.max(1, current - 0.5))}><Minus size={15} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="放大画布" disabled={zoom >= 2.5} onClick={() => setZoom((current) => Math.min(2.5, current + 0.5))}><Plus size={15} /></button></div>}
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
              <label className="art-guide-opacity"><span>参考线深浅</span><input type="range" min="0.12" max="0.65" step="0.01" value={guideOpacity} onChange={(event) => setGuideOpacity(Number(event.target.value))} /></label>
              <section className="art-lesson-card" aria-label={`${template.title}学习提示`}>
                <strong>{template.lesson}</strong>
                <ol>{template.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
                <div>{template.concepts.map((concept) => <span key={concept}>{concept}</span>)}</div>
              </section>
              <div className="art-template-picker" aria-label="选择临摹图">
                {filteredTemplates.map((item) => <button type="button" key={item.id} className={item.id === template.id ? 'is-active' : ''} aria-pressed={item.id === template.id} aria-label={`${item.title}，${item.category}`} onClick={() => { setTemplateId(item.id); setScore(null) }}><TemplatePreview template={item} /><span>{item.title}</span><small>{item.category}</small></button>)}
              </div>
            </>
          ) : (
            <div className="art-free-prompt"><Sparkles size={30} /><span className="eyebrow">TODAY'S IDEA</span><h2>画一位会飞的朋友</h2><p>它住在哪里？最喜欢什么颜色？给画面留一块安静的天空。</p><div><span>主角</span><span>家</span><span>天空</span></div></div>
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
