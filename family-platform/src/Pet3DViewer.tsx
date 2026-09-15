import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PetAction } from './types'

type ViewerAnimation = PetAction | 'idle'

const ACTION_CLIPS: Record<ViewerAnimation, string[]> = {
  idle: ['idle', 'idle_2', 'static'],
  feed: ['eating', 'eat', 'idle_headlow', 'idle_2_headlow'],
  play: ['dance', 'gallop_jump', 'jump_toidle', 'run', 'gallop', 'walk'],
  groom: ['gesture-positive', 'idle_hitreact1', 'idle_2'],
  story: ['idle_2', 'gesture-positive', 'idle'],
  talk: ['gesture-negative', 'idle_hitreact2', 'idle_2_headlow', 'idle_2'],
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function pickClip(clips: THREE.AnimationClip[], animation: ViewerAnimation): THREE.AnimationClip | undefined {
  const candidates = ACTION_CLIPS[animation].map(normalized)
  return candidates
    .map((candidate) => clips.find((clip) => normalized(clip.name) === candidate))
    .find(Boolean)
    ?? clips.find((clip) => normalized(clip.name).includes(candidates[0] ?? 'idle'))
    ?? clips[0]
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

export function Pet3DViewer({
  assetPath,
  name,
  accent,
  animation = 'idle',
  animationNonce = 0,
  compact = false,
}: {
  assetPath?: string
  name: string
  accent: string
  animation?: ViewerAnimation
  animationNonce?: number
  compact?: boolean
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const clipsRef = useRef<THREE.AnimationClip[]>([])
  const currentActionRef = useRef<THREE.AnimationAction | null>(null)
  const modelPivotRef = useRef<THREE.Group | null>(null)
  const turnTargetRef = useRef<number | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(assetPath ? 'loading' : 'error')
  const [clipName, setClipName] = useState('准备动作')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !assetPath) {
      setState('error')
      return undefined
    }
    setState('loading')
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

    const play = (requested: ViewerAnimation) => {
      const mixer = mixerRef.current
      if (!mixer) return
      const clip = pickClip(clipsRef.current, requested)
      if (!clip) return
      const next = mixer.clipAction(clip)
      if (currentActionRef.current !== next) currentActionRef.current?.fadeOut(0.18)
      next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.18)
      if (requested === 'idle') next.setLoop(THREE.LoopRepeat, Infinity)
      else {
        next.setLoop(THREE.LoopOnce, 1)
        next.clampWhenFinished = true
      }
      next.play()
      currentActionRef.current = next
      setClipName(clip.name || requested)
      if (requested === 'play') turnTargetRef.current = pivot.rotation.y + Math.PI * 2
    }

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
          if (mesh.isMesh) {
            mesh.castShadow = !compact
            mesh.receiveShadow = !compact
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
        const onFinished = () => play('idle')
        mixerRef.current.addEventListener('finished', onFinished)
        play('idle')
        setState('ready')
      },
      undefined,
      () => {
        if (!disposed) setState('error')
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
      const target = turnTargetRef.current
      if (target !== null) {
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
      if (loadedRoot) releaseObject(loadedRoot)
      floor.geometry.dispose()
      ;(floor.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [accent, assetPath, compact])

  useEffect(() => {
    if (state !== 'ready') return
    const mixer = mixerRef.current
    const clips = clipsRef.current
    if (!mixer || clips.length === 0) return
    const clip = pickClip(clips, animation)
    if (!clip) return
    const next = mixer.clipAction(clip)
    if (currentActionRef.current !== next) currentActionRef.current?.fadeOut(0.18)
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.18)
    if (animation === 'idle') next.setLoop(THREE.LoopRepeat, Infinity)
    else {
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = true
    }
    next.play()
    currentActionRef.current = next
    setClipName(clip.name || animation)
    if (animation === 'play' && modelPivotRef.current) {
      turnTargetRef.current = modelPivotRef.current.rotation.y + Math.PI * 2
    }
  }, [animation, animationNonce, state])

  return (
    <div className={`pet-3d-viewer ${compact ? 'is-compact' : ''}`} style={{ '--pet-model-accent': accent } as CSSProperties}>
      <div ref={mountRef} className="pet-3d-canvas" role="img" aria-label={`${name} 3D 动画模型`} />
      {state === 'loading' && <div className="pet-3d-state"><span />正在加载 {name} 的 3D 模型…</div>}
      {state === 'error' && <div className="pet-3d-state is-error">3D 模型未能加载，请重新进入伙伴页面</div>}
      {state === 'ready' && !compact && <div className="pet-3d-toolbar"><span>当前动作：{clipName}</span><small>拖动旋转 · 滚轮或双指缩放</small></div>}
    </div>
  )
}
