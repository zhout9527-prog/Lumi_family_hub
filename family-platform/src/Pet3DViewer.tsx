import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PetAction } from './types'

type ViewerAnimation = PetAction | 'idle'
type ProceduralAnimation = 'nod' | 'spin' | 'hop' | 'stretch' | 'listen' | 'talk' | 'sway' | 'bow'

export interface PetAnimationInfo {
  id: string
  label: string
  sourceName: string
  duration: number
  native: boolean
}

const ACTION_CLIPS: Record<ViewerAnimation, string[]> = {
  idle: ['idle', 'idle_2', 'static'],
  feed: ['eating', 'eat', 'idle_headlow', 'idle_2_headlow'],
  play: ['dance', 'gallop_jump', 'jump_toidle', 'run', 'gallop', 'walk'],
  groom: ['gesture-positive', 'idle_hitreact1', 'idle_2'],
  story: ['idle_2', 'gesture-positive', 'idle'],
  talk: ['gesture-negative', 'idle_hitreact2', 'idle_2_headlow', 'idle_2'],
}

const CAT_PROCEDURAL_ANIMATIONS: Array<{ kind: ProceduralAnimation; label: string; duration: number }> = [
  { kind: 'nod', label: '点头问好', duration: 2.4 },
  { kind: 'spin', label: '开心转圈', duration: 3.1 },
  { kind: 'hop', label: '轻轻蹦跳', duration: 2.6 },
  { kind: 'stretch', label: '伸个懒腰', duration: 3.2 },
  { kind: 'listen', label: '歪头倾听', duration: 2.8 },
  { kind: 'talk', label: '跟你说话', duration: 3.4 },
  { kind: 'sway', label: '开心摇摆', duration: 3 },
  { kind: 'bow', label: '礼貌鞠躬', duration: 2.5 },
]

const FRIENDLY_CLIP_LABELS: Record<string, string> = {
  attack: '勇敢挥爪',
  attackheadbutt: '轻轻顶一顶',
  attackkick: '活力踢腿',
  death: '躺下休息',
  eating: '认真吃饭',
  eat: '认真吃饭',
  gallop: '开心奔跑',
  gallopjump: '奔跑跳跃',
  idlehitreact1: '惊喜回应一',
  idlehitreact2: '惊喜回应二',
  idleheadlow: '低头休息',
  idle2headlow: '低头张望',
  idle2: '四处张望',
  idle: '安静待机',
  jumptoidle: '跳跃落地',
  run: '快速奔跑',
  static: '安静站立',
  walk: '悠闲散步',
  dance: '开心跳舞',
  gesturepositive: '开心回应',
  gesturenegative: '摇头回应',
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function petAnimationLabel(value: string): string {
  const key = normalized(value)
  const exact = FRIENDLY_CLIP_LABELS[key]
  if (exact) return exact
  const matched = Object.entries(FRIENDLY_CLIP_LABELS).find(([candidate]) => key.endsWith(candidate) || key.includes(candidate))
  return matched?.[1] ?? value.replaceAll('_', ' ').replaceAll('|', ' · ')
}

function pickClip(clips: THREE.AnimationClip[], animation: ViewerAnimation): THREE.AnimationClip | undefined {
  const candidates = ACTION_CLIPS[animation].map(normalized)
  return candidates
    .map((candidate) => clips.find((clip) => normalized(clip.name) === candidate))
    .find(Boolean)
    ?? clips.find((clip) => candidates.some((candidate) => normalized(clip.name).endsWith(candidate)))
    ?? clips.find((clip) => normalized(clip.name).includes(candidates[0] ?? 'idle'))
    ?? clips[0]
}

function isLoopingClip(clip: THREE.AnimationClip): boolean {
  const key = normalized(clip.name)
  return ['idle', 'idle2', 'idleheadlow', 'idle2headlow', 'static', 'walk', 'run', 'gallop', 'eating', 'eat', 'dance']
    .includes(key)
    || key.endsWith('idlecat')
}

function releaseObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose()
      })
      material.dispose()
    })
  })
}

function resetProceduralTransform(pivot: THREE.Group): void {
  pivot.position.set(0, 0, 0)
  pivot.rotation.x = 0
  pivot.rotation.z = 0
  pivot.scale.set(1, 1, 1)
}

export function Pet3DViewer({
  assetPath,
  speciesId,
  name,
  accent,
  animation = 'idle',
  animationNonce = 0,
  animationClip,
  animationClipNonce = 0,
  onAnimationsChange,
  compact = false,
}: {
  assetPath?: string
  speciesId?: string
  name: string
  accent: string
  animation?: ViewerAnimation
  animationNonce?: number
  animationClip?: string
  animationClipNonce?: number
  onAnimationsChange?: (animations: PetAnimationInfo[]) => void
  compact?: boolean
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const clipsRef = useRef<THREE.AnimationClip[]>([])
  const currentActionRef = useRef<THREE.AnimationAction | null>(null)
  const modelPivotRef = useRef<THREE.Group | null>(null)
  const turnTargetRef = useRef<number | null>(null)
  const playAbstractRef = useRef<(requested: ViewerAnimation) => void>(() => undefined)
  const playShowcaseRef = useRef<(requested: string) => void>(() => undefined)
  const onAnimationsChangeRef = useRef(onAnimationsChange)
  const proceduralRef = useRef<{
    kind: ProceduralAnimation
    startedAt: number
    duration: number
    baseRotationY: number
  } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(assetPath ? 'loading' : 'error')
  const [clipName, setClipName] = useState('准备动作')

  useEffect(() => {
    onAnimationsChangeRef.current = onAnimationsChange
  }, [onAnimationsChange])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !assetPath) {
      setState('error')
      onAnimationsChangeRef.current?.([])
      return undefined
    }
    setState('loading')
    onAnimationsChangeRef.current?.([])
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100)
    camera.position.set(4.4, 2.7, 5.8)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2))
    renderer.shadowMap.enabled = !compact
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.replaceChildren(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 2.2
    controls.maxDistance = 9
    controls.minPolarAngle = Math.PI * 0.23
    controls.maxPolarAngle = Math.PI * 0.52
    controls.target.set(0, 1, 0)
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.55

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6f7a86, 2.4))
    const keyLight = new THREE.DirectionalLight(0xfff5dc, 3.6)
    keyLight.position.set(4, 7, 5)
    keyLight.castShadow = !compact
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(new THREE.Color(accent), 2)
    fillLight.position.set(-4, 3, -2)
    scene.add(fillLight)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 64),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), 0.72), roughness: 0.9 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = !compact
    scene.add(floor)

    let disposed = false
    let loadedRoot: THREE.Object3D | null = null
    const clock = new THREE.Clock()
    const pivot = new THREE.Group()
    modelPivotRef.current = pivot
    scene.add(pivot)

    const playNative = (clip: THREE.AnimationClip, loop: boolean, label = petAnimationLabel(clip.name)) => {
      const mixer = mixerRef.current
      if (!mixer) return
      resetProceduralTransform(pivot)
      proceduralRef.current = null
      const next = mixer.clipAction(clip)
      if (currentActionRef.current !== next) currentActionRef.current?.fadeOut(0.18)
      next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.18)
      if (loop) next.setLoop(THREE.LoopRepeat, Infinity)
      else {
        next.setLoop(THREE.LoopOnce, 1)
        next.clampWhenFinished = true
      }
      next.play()
      currentActionRef.current = next
      setClipName(label)
    }

    const playProcedural = (kind: ProceduralAnimation) => {
      const definition = CAT_PROCEDURAL_ANIMATIONS.find((item) => item.kind === kind)
      if (!definition) return
      const idle = pickClip(clipsRef.current, 'idle')
      if (idle) playNative(idle, true, definition.label)
      proceduralRef.current = {
        kind,
        startedAt: clock.elapsedTime,
        duration: definition.duration,
        baseRotationY: pivot.rotation.y,
      }
      setClipName(definition.label)
    }

    const playAbstract = (requested: ViewerAnimation) => {
      if (speciesId === 'cat' && requested !== 'idle') {
        const catActions: Record<PetAction, ProceduralAnimation> = {
          feed: 'stretch',
          play: 'hop',
          groom: 'sway',
          story: 'listen',
          talk: 'talk',
        }
        playProcedural(catActions[requested])
        return
      }
      const clip = pickClip(clipsRef.current, requested)
      if (!clip) return
      playNative(clip, requested === 'idle' || isLoopingClip(clip))
      if (requested === 'play') turnTargetRef.current = pivot.rotation.y + Math.PI * 2
    }

    const playShowcase = (requested: string) => {
      if (requested.startsWith('lumi:')) {
        playProcedural(requested.slice('lumi:'.length) as ProceduralAnimation)
        return
      }
      const sourceName = requested.startsWith('native:') ? requested.slice('native:'.length) : requested
      const clip = clipsRef.current.find((item) => item.name === sourceName)
      if (clip) playNative(clip, isLoopingClip(clip))
    }

    playAbstractRef.current = playAbstract
    playShowcaseRef.current = playShowcase

    const loader = new GLTFLoader()
    loader.load(
      assetPath,
      (gltf) => {
        if (disposed) {
          releaseObject(gltf.scene)
          return
        }
        loadedRoot = gltf.scene
        loadedRoot.traverse((object) => {
          const mesh = object as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.castShadow = !compact
          mesh.receiveShadow = !compact
          if (speciesId === 'cat') {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            materials.filter(Boolean).forEach((material) => {
              const standard = material as THREE.MeshStandardMaterial
              if (standard.color) standard.color.lerp(new THREE.Color('#a8b8c5'), 0.12)
              if ('roughness' in standard) standard.roughness = Math.max(0.68, standard.roughness ?? 0.68)
              if ('metalness' in standard) standard.metalness = 0
            })
          }
        })
        const bounds = new THREE.Box3().setFromObject(loadedRoot)
        const size = bounds.getSize(new THREE.Vector3())
        const center = bounds.getCenter(new THREE.Vector3())
        const scale = (compact ? 1.9 : 2.35) / Math.max(size.x, size.y, size.z, 0.001)
        loadedRoot.scale.setScalar(scale)
        loadedRoot.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
        pivot.add(loadedRoot)
        mixerRef.current = new THREE.AnimationMixer(loadedRoot)
        clipsRef.current = gltf.animations
        const animations: PetAnimationInfo[] = gltf.animations.map((clip) => ({
          id: `native:${clip.name}`,
          label: petAnimationLabel(clip.name),
          sourceName: clip.name,
          duration: Math.max(0.8, clip.duration || 2),
          native: true,
        }))
        if (speciesId === 'cat') {
          animations.push(...CAT_PROCEDURAL_ANIMATIONS.map((item) => ({
            id: `lumi:${item.kind}`,
            label: item.label,
            sourceName: `Lumi ${item.kind}`,
            duration: item.duration,
            native: false,
          })))
        }
        onAnimationsChangeRef.current?.(animations)
        mixerRef.current.addEventListener('finished', () => playAbstract('idle'))
        playAbstract('idle')
        setState('ready')
      },
      undefined,
      () => {
        if (!disposed) {
          setState('error')
          onAnimationsChangeRef.current?.([])
        }
      },
    )

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()

    let frame = 0
    const render = () => {
      frame = window.requestAnimationFrame(render)
      const delta = Math.min(clock.getDelta(), 0.05)
      mixerRef.current?.update(delta)
      const procedural = proceduralRef.current
      if (procedural) {
        const progress = Math.min(1, Math.max(0, (clock.elapsedTime - procedural.startedAt) / procedural.duration))
        const envelope = Math.sin(Math.PI * progress)
        resetProceduralTransform(pivot)
        pivot.rotation.y = procedural.baseRotationY
        if (procedural.kind === 'nod') pivot.rotation.x = Math.sin(progress * Math.PI * 4) * 0.13 * envelope
        if (procedural.kind === 'spin') pivot.rotation.y = procedural.baseRotationY + progress * Math.PI * 2
        if (procedural.kind === 'hop') pivot.position.y = Math.abs(Math.sin(progress * Math.PI * 2)) * 0.34 * envelope
        if (procedural.kind === 'stretch') {
          pivot.scale.set(1 - envelope * 0.07, 1 + envelope * 0.18, 1 - envelope * 0.07)
          pivot.rotation.x = -envelope * 0.1
        }
        if (procedural.kind === 'listen') pivot.rotation.z = Math.sin(progress * Math.PI * 3) * 0.16 * envelope
        if (procedural.kind === 'talk') {
          pivot.position.y = Math.abs(Math.sin(progress * Math.PI * 7)) * 0.055 * envelope
          pivot.rotation.z = Math.sin(progress * Math.PI * 5) * 0.055 * envelope
        }
        if (procedural.kind === 'sway') pivot.rotation.z = Math.sin(progress * Math.PI * 5) * 0.18 * envelope
        if (procedural.kind === 'bow') pivot.rotation.x = Math.sin(Math.PI * progress) * 0.26
        if (progress >= 1) {
          resetProceduralTransform(pivot)
          pivot.rotation.y = (procedural.baseRotationY + (procedural.kind === 'spin' ? Math.PI * 2 : 0)) % (Math.PI * 2)
          proceduralRef.current = null
          const idle = pickClip(clipsRef.current, 'idle')
          setClipName(idle ? petAnimationLabel(idle.name) : '安静待机')
        }
      }
      const target = turnTargetRef.current
      if (target !== null && !proceduralRef.current) {
        pivot.rotation.y = THREE.MathUtils.damp(pivot.rotation.y, target, 5, delta)
        if (Math.abs(target - pivot.rotation.y) < 0.015) {
          pivot.rotation.y = target % (Math.PI * 2)
          turnTargetRef.current = null
        }
      }
      controls.update()
      renderer.render(scene, camera)
    }
    render()

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      controls.dispose()
      mixerRef.current?.stopAllAction()
      mixerRef.current = null
      clipsRef.current = []
      currentActionRef.current = null
      modelPivotRef.current = null
      proceduralRef.current = null
      playAbstractRef.current = () => undefined
      playShowcaseRef.current = () => undefined
      if (loadedRoot) releaseObject(loadedRoot)
      floor.geometry.dispose()
      ;(floor.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [accent, assetPath, compact, speciesId])

  useEffect(() => {
    if (state === 'ready') playAbstractRef.current(animation)
  }, [animation, animationNonce, state])

  useEffect(() => {
    if (state === 'ready' && animationClip) playShowcaseRef.current(animationClip)
  }, [animationClip, animationClipNonce, state])

  return (
    <div className={`pet-3d-viewer ${compact ? 'is-compact' : ''}`} style={{ '--pet-model-accent': accent } as CSSProperties}>
      <div ref={mountRef} className="pet-3d-canvas" role="img" aria-label={`${name} 3D 动画模型`} />
      {state === 'loading' && <div className="pet-3d-state"><span />正在加载 {name} 的 3D 模型…</div>}
      {state === 'error' && <div className="pet-3d-state is-error">3D 模型未能加载，请重新进入伙伴页面</div>}
      {state === 'ready' && !compact && <div className="pet-3d-toolbar"><span>当前动作：{clipName}</span><small>拖动旋转 · 滚轮或双指缩放</small></div>}
    </div>
  )
}
