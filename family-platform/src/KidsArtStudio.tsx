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
  Palette,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { DEVICE_PROFILE } from './device'

type DrawTool = 'brush' | 'marker' | 'eraser'
type DrawMode = 'free' | 'copy'

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
}

interface DrawingTemplate {
  id: string
  title: string
  hint: string
  accent: string
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
const COLORS = ['#263238', '#ef5350', '#ff8f3d', '#f2c94c', '#62ad65', '#27a9c4', '#4279df', '#9b59c9', '#ec6fae']

const TEMPLATES: DrawingTemplate[] = [
  {
    id: 'house',
    title: '森林小屋',
    hint: '先画大形，再补门窗和树叶。',
    accent: '#df7655',
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
  context.globalAlpha = stroke.tool === 'marker' ? 0.5 : 1
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  context.strokeStyle = stroke.color
  drawSmoothPath(context, stroke.points)
  context.restore()
}

function drawTemplate(context: CanvasRenderingContext2D, template: DrawingTemplate, color: string, lineWidth: number) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = lineWidth
  context.strokeStyle = color
  template.paths.forEach((path) => drawSmoothPath(context, path.points, path.closed))
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
        ? <polygon key={index} points={path.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={template.accent} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
        : <polyline key={index} points={path.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={template.accent} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />)}
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
  drawTemplate(targetContext, template, '#000', 42)
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
  const currentStrokeRef = useRef<DrawingStroke | null>(null)
  const tvStrokeRef = useRef<DrawingStroke | null>(null)
  const [mode, setMode] = useState<DrawMode>('free')
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id)
  const [guideVisible, setGuideVisible] = useState(true)
  const [tool, setTool] = useState<DrawTool>('brush')
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(14)
  const [strokes, setStrokes] = useState<DrawingStroke[]>([])
  const [redoStack, setRedoStack] = useState<DrawingStroke[]>([])
  const [score, setScore] = useState<DrawingScore | null>(null)
  const [savedMessage, setSavedMessage] = useState('')
  const [tvCursor, setTvCursor] = useState<Point>({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 })
  const [tvDrawing, setTvDrawing] = useState(false)

  const template = useMemo(() => TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0], [templateId])

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
    const stroke: DrawingStroke = { id: `stroke-${Date.now()}-${event.pointerId}`, points: [point], color, size: tool === 'eraser' ? size * 1.8 : size, tool }
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
        const stroke: DrawingStroke = { id: `tv-stroke-${Date.now()}`, points: [tvCursor], color, size: tool === 'eraser' ? size * 1.8 : size, tool }
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
        <div><span className="art-studio-logo"><Palette size={20} /></span><div><strong>小小画室</strong><span>自由创作 · 临摹练习 · 作品建议</span></div></div>
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
              <button type="button" title="画笔" aria-label="画笔" aria-pressed={tool === 'brush'} className={tool === 'brush' ? 'is-active' : ''} onClick={() => setTool('brush')}><Brush size={18} /></button>
              <button type="button" title="马克笔" aria-label="马克笔" aria-pressed={tool === 'marker'} className={tool === 'marker' ? 'is-active' : ''} onClick={() => setTool('marker')}><Highlighter size={18} /></button>
              <button type="button" title="橡皮擦" aria-label="橡皮擦" aria-pressed={tool === 'eraser'} className={tool === 'eraser' ? 'is-active' : ''} onClick={() => setTool('eraser')}><Eraser size={18} /></button>
            </div>
          </div>
          <div className="art-tool-group art-color-group">
            <span>颜色</span>
            <div>{COLORS.map((swatch) => <button type="button" key={swatch} aria-label={`选择颜色 ${swatch}`} aria-pressed={color === swatch} className={color === swatch ? 'is-active' : ''} style={{ backgroundColor: swatch }} onClick={() => { setColor(swatch); if (tool === 'eraser') setTool('brush') }} />)}</div>
          </div>
          <label className="art-size-control"><span>粗细 <b>{size}</b></span><input type="range" min="4" max="40" step="2" value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
          <div className="art-history-actions">
            <button type="button" title="撤销" aria-label="撤销" onClick={undo} disabled={strokes.length === 0}><Undo2 size={17} /></button>
            <button type="button" title="重做" aria-label="重做" onClick={redo} disabled={redoStack.length === 0}><Redo2 size={17} /></button>
            <button type="button" title="清空" aria-label="清空画布" onClick={clearDrawing} disabled={strokes.length === 0}><Trash2 size={17} /></button>
          </div>
        </aside>

        <section className="art-canvas-section">
          <div className="art-canvas-frame">
            <canvas ref={guideRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className={`art-guide-canvas ${mode === 'copy' && guideVisible ? 'is-visible' : ''}`} aria-hidden="true" />
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
          <div className="art-canvas-actions">
            {mode === 'copy' && <button type="button" className="button button-quiet" onClick={() => setGuideVisible((current) => !current)}>{guideVisible ? <EyeOff size={16} /> : <Eye size={16} />}{guideVisible ? '隐藏辅助线' : '显示辅助线'}</button>}
            <button type="button" className="button button-quiet" onClick={evaluate}><CheckCircle2 size={16} />{mode === 'copy' ? '看看完成度' : '看看作品建议'}</button>
            <button type="button" className="button button-primary" onClick={saveArtwork} disabled={strokes.length === 0}><Download size={16} />保存作品</button>
          </div>
          {savedMessage && <div className="art-save-message" role="status"><Save size={15} />{savedMessage}</div>}
        </section>

        <aside className="art-reference-panel">
          {mode === 'copy' ? (
            <>
              <div className="art-reference-heading"><span className="eyebrow">COPY PRACTICE</span><h2>{template.title}</h2><p>{template.hint}</p></div>
              <div className="art-reference-image"><TemplatePreview template={template} /></div>
              <div className="art-template-picker" aria-label="选择临摹图">
                {TEMPLATES.map((item) => <button type="button" key={item.id} className={item.id === template.id ? 'is-active' : ''} aria-pressed={item.id === template.id} onClick={() => { setTemplateId(item.id); setScore(null) }}><TemplatePreview template={item} /><span>{item.title}</span></button>)}
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
