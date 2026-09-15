import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { AudioLines, BookOpen, ChevronLeft, ChevronRight, Heart, MessageCircle, Mic2, PawPrint, Play, Sparkles, Utensils, WandSparkles, Waves } from 'lucide-react'
import { EchoCompanion } from './EchoCompanion'
import { Pet3DViewer } from './Pet3DViewer'
import type { PetAnimationInfo } from './Pet3DViewer'
import type { PetAction, PetSpecies, PetState, SessionUser } from './types'

const ACTIONS: Array<{ action: PetAction; label: string; icon: typeof Heart; hint: string }> = [
  { action: 'feed', label: '喂食', icon: Utensils, hint: '补充一点能量' },
  { action: 'play', label: '玩耍', icon: Play, hint: '一起活动一下' },
  { action: 'groom', label: '整理', icon: Waves, hint: '保持干净整洁' },
  { action: 'story', label: '讲故事', icon: BookOpen, hint: '分享一个故事' },
  { action: 'talk', label: '聊天', icon: MessageCircle, hint: '说说今天发生的事' },
]

function statLabel(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`
}

function StatBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="pet-stat">
      <div><span>{label}</span><strong>{statLabel(value)}</strong></div>
      <div className="pet-stat-track"><i className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
    </div>
  )
}

function SpeciesCard({
  species,
  selected,
  disabled,
  onSelect,
}: {
  species: PetSpecies
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`pet-species-card ${selected ? 'is-selected' : ''}`}
      style={{ '--pet-accent': species.accent } as CSSProperties}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      data-tv-initial={selected ? true : undefined}
    >
      <span className="pet-species-card-head"><span className="pet-species-emoji" aria-hidden="true">{species.emoji}</span><small className="pet-species-model-badge">3D 动画</small></span>
      <span className="pet-species-name">{species.name}</span>
      <small>{species.englishName}</small>
      <em>{species.temperament}</em>
    </button>
  )
}

function AnimationShowcase({
  animations,
  activeId,
  automatic,
  onPlay,
  onToggleAutomatic,
}: {
  animations: PetAnimationInfo[]
  activeId?: string
  automatic: boolean
  onPlay: (animation: PetAnimationInfo) => void
  onToggleAutomatic: () => void
}) {
  return (
    <section className="pet-animation-showcase" aria-label="伙伴动作展示">
      <div className="pet-animation-heading">
        <div><AudioLines size={18} /><span><strong>动作图鉴</strong><small>{animations.length > 0 ? `模型自带与 Lumi 动作共 ${animations.length} 个` : '正在读取模型动作…'}</small></span></div>
        <button type="button" className={`button button-quiet pet-auto-demo ${automatic ? 'is-active' : ''}`} onClick={onToggleAutomatic} disabled={animations.length === 0} aria-pressed={automatic}>
          <Play size={15} fill={automatic ? 'currentColor' : 'none'} />{automatic ? '停止连续展示' : '连续展示全部'}
        </button>
      </div>
      {animations.length > 0 ? (
        <div className="pet-animation-list" role="list">
          {animations.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="listitem"
              className={`pet-animation-chip ${activeId === item.id ? 'is-active' : ''}`}
              aria-pressed={activeId === item.id}
              title={`${item.sourceName} · ${item.duration.toFixed(1)} 秒`}
              onClick={() => onPlay(item)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span><strong>{item.label}</strong><small>{item.native ? '原生' : 'Lumi'}</small>
            </button>
          ))}
        </div>
      ) : <div className="pet-animation-loading"><span />模型准备好后会列出每一个动作</div>}
    </section>
  )
}

export function PetView({
  user,
  pet,
  species,
  canAdopt,
  connection,
  busy,
  onAdopt,
  onAction,
}: {
  user: SessionUser
  pet: PetState | null
  species: PetSpecies[]
  canAdopt: boolean
  connection: 'checking' | 'backend' | 'offline'
  busy: boolean
  onAdopt: (species: string, name: string) => Promise<PetState>
  onAction: (petId: string, action: PetAction) => Promise<{ message: string; points: number }>
}) {
  const [selectedSpecies, setSelectedSpecies] = useState(species[0]?.id ?? '')
  const [name, setName] = useState(species[0]?.name ?? '')
  const [message, setMessage] = useState('')
  const [animation, setAnimation] = useState<PetAction | 'idle'>('idle')
  const [animationNonce, setAnimationNonce] = useState(0)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [autoPreview, setAutoPreview] = useState(true)
  const [modelAnimations, setModelAnimations] = useState<PetAnimationInfo[]>([])
  const [showcaseClip, setShowcaseClip] = useState<string>()
  const [showcaseNonce, setShowcaseNonce] = useState(0)
  const [automaticActions, setAutomaticActions] = useState(false)
  const [automaticActionIndex, setAutomaticActionIndex] = useState(0)
  const [echoOpen, setEchoOpen] = useState(false)
  const selected = useMemo(() => species.find((item) => item.id === selectedSpecies) ?? species[0], [selectedSpecies, species])
  const selectedIndex = useMemo(() => {
    const index = species.findIndex((item) => item.id === selected?.id)
    return index >= 0 ? index : 0
  }, [selected?.id, species])
  const currentSpecies = useMemo(() => species.find((item) => item.id === pet?.species), [pet?.species, species])
  const displayedSpeciesId = pet?.species ?? selected?.id ?? ''
  const readOnly = connection !== 'backend' || busy

  useEffect(() => {
    if (species.length === 0) return
    if (!species.some((item) => item.id === selectedSpecies)) {
      setSelectedSpecies(species[0].id)
      setName(species[0].name)
    }
  }, [selectedSpecies, species])

  useEffect(() => {
    if (selectedIndex !== previewIndex) setPreviewIndex(selectedIndex)
  }, [previewIndex, selectedIndex])

  useEffect(() => {
    setModelAnimations([])
    setShowcaseClip(undefined)
    setShowcaseNonce(0)
    setAutomaticActions(false)
    setAutomaticActionIndex(0)
  }, [displayedSpeciesId])

  useEffect(() => {
    if (pet || !autoPreview || species.length < 2 || connection !== 'backend') return undefined
    const timer = window.setInterval(() => {
      setPreviewIndex((current) => {
        const nextIndex = (current + 1) % species.length
        const nextSpecies = species[nextIndex]
        setSelectedSpecies(nextSpecies.id)
        setName(nextSpecies.name)
        return nextIndex
      })
    }, 4500)
    return () => window.clearInterval(timer)
  }, [autoPreview, connection, pet, species])

  useEffect(() => {
    if (!automaticActions || modelAnimations.length === 0) return undefined
    const next = modelAnimations[automaticActionIndex % modelAnimations.length]
    setShowcaseClip(next.id)
    setShowcaseNonce((value) => value + 1)
    const wait = Math.min(5200, Math.max(1800, next.duration * 1000 + 350))
    const timer = window.setTimeout(() => setAutomaticActionIndex((value) => (value + 1) % modelAnimations.length), wait)
    return () => window.clearTimeout(timer)
  }, [automaticActionIndex, automaticActions, modelAnimations])

  const handleAnimationsChange = useCallback((animations: PetAnimationInfo[]) => {
    setModelAnimations(animations)
    setShowcaseClip(undefined)
    setAutomaticActionIndex(0)
  }, [])

  const chooseSpecies = (index: number) => {
    if (species.length === 0) return
    setAutoPreview(false)
    const nextIndex = (index + species.length) % species.length
    const nextSpecies = species[nextIndex]
    setPreviewIndex(nextIndex)
    setSelectedSpecies(nextSpecies.id)
    setName(nextSpecies.name)
  }

  const playShowcaseAnimation = (item: PetAnimationInfo) => {
    setAutoPreview(false)
    setAutomaticActions(false)
    setShowcaseClip(item.id)
    setShowcaseNonce((value) => value + 1)
  }

  const toggleAutomaticActions = () => {
    setAutoPreview(false)
    setAutomaticActionIndex(0)
    setAutomaticActions((value) => !value)
  }

  const animationShowcase = (
    <AnimationShowcase
      animations={modelAnimations}
      activeId={showcaseClip}
      automatic={automaticActions}
      onPlay={playShowcaseAnimation}
      onToggleAutomatic={toggleAutomaticActions}
    />
  )

  const echoModal = echoOpen ? (
    <EchoCompanion
      species={species}
      initialSpeciesId={pet?.species ?? selected?.id}
      onClose={() => setEchoOpen(false)}
    />
  ) : null

  if (!pet) {
    return (
      <>
        <section className="pet-dashboard pet-adoption-view">
          <div className="pet-hero pet-hero-intro">
            <div className="pet-hero-copy">
              <span className="eyebrow">LUMI COMPANION</span>
              <h1>{user.role === 'child' ? `${user.displayName}，挑选你的伙伴` : '家庭伙伴'}</h1>
              <p>{user.role === 'child' ? '从 12 种 Quaternius 动物和一只全新的蓝灰小猫中选择一位伙伴。每个模型的全部动作都能逐个试玩，也可以连续展示。每个儿童账号目前先养一只。' : '孩子还没有领养伙伴。这里会同步显示 Server 中的伙伴目录，也可以先试玩模型动作和声线。'}</p>
              <div className="pet-hero-buttons"><button type="button" className="button button-quiet" onClick={() => setEchoOpen(true)}><Mic2 size={16} />进入声声岛</button></div>
              <div className="pet-credit-row"><PawPrint size={15} /><span>低多边形动画动物 · CC0 / CC BY 资源</span><a href="https://quaternius.com/packs/ultimateanimatedanimals.html" target="_blank" rel="noreferrer">查看模型来源</a></div>
            </div>
            {selected && (
              <div className="pet-adoption-model">
                <Pet3DViewer
                  assetPath={selected.assetPath}
                  speciesId={selected.id}
                  name={selected.name}
                  accent={selected.accent}
                  animationClip={showcaseClip}
                  animationClipNonce={showcaseNonce}
                  onAnimationsChange={handleAnimationsChange}
                />
                <div className="pet-preview-controls" aria-label="伙伴模型预览">
                  <button type="button" className="icon-button" aria-label="上一个伙伴" title="上一个伙伴" onClick={() => chooseSpecies(selectedIndex - 1)} disabled={readOnly}><ChevronLeft size={18} /></button>
                  <div className="pet-preview-index"><strong>{selected.name}</strong><span>{selectedIndex + 1} / {species.length}</span></div>
                  <button type="button" className="icon-button" aria-label="下一个伙伴" title="下一个伙伴" onClick={() => chooseSpecies(selectedIndex + 1)} disabled={readOnly}><ChevronRight size={18} /></button>
                </div>
              </div>
            )}
          </div>
          {animationShowcase}
          {user.role === 'child' && canAdopt ? (
            <div className="pet-adoption-panel">
              <div className="section-heading"><div><span className="eyebrow">CHOOSE A FRIEND</span><h2>选择一个形象</h2></div><span className="soft-badge">{species.length} 个可选</span></div>
              <div className="pet-species-grid">
                {species.map((item, index) => <SpeciesCard key={item.id} species={item} selected={selected?.id === item.id} disabled={readOnly} onSelect={() => chooseSpecies(index)} />)}
              </div>
              <div className="pet-adoption-form">
                <label><span>给伙伴起个名字</span><input value={name} onChange={(event) => { setAutoPreview(false); setName(event.target.value) }} maxLength={24} placeholder="例如：小豆" disabled={readOnly || !selected} /></label>
                <button type="button" className="button button-primary" data-tv-initial onClick={() => { if (selected) void onAdopt(selected.id, name || selected.name).then(() => setMessage('伙伴已经来到你的身边！')).catch((error) => setMessage(error instanceof Error ? error.message : '领养没有完成')) }} disabled={readOnly || !selected}><Heart size={16} fill="currentColor" />领养 {selected?.name ?? '伙伴'}</button>
              </div>
              <p className="pet-inline-note">更换伙伴和饲养第二只伙伴会使用独立积分；积分规则由家长确认后再开放，不会提前扣除。</p>
              {connection === 'offline' && <p className="pet-inline-note">连接 Server 后才能保存领养结果。</p>}
            </div>
          ) : (
            <div className="pet-empty-state"><Sparkles size={22} /><strong>等待孩子选择伙伴</strong><span>领养完成后，成长状态会在所有客户端同步。</span></div>
          )}
        </section>
        {echoModal}
      </>
    )
  }

  return (
    <>
      <section className="pet-dashboard">
        <div className="pet-hero pet-hero-active" style={{ '--pet-accent': currentSpecies?.accent ?? '#6a91b9' } as CSSProperties}>
          <div className="pet-hero-copy">
            <span className="eyebrow">MY COMPANION</span>
            <h1>{pet.name}</h1>
            <p>{pet.speciesName} · {pet.speciesEnglishName} · {pet.growthStage}</p>
            <span className="pet-owner-note">{pet.ownerName === user.displayName ? '这是你的伙伴' : `由 ${pet.ownerName} 照顾`}</span>
            <div className="pet-hero-buttons"><button type="button" className="button button-quiet" onClick={() => setEchoOpen(true)}><Mic2 size={16} />去声声岛玩</button></div>
            {message && <div className="pet-message" role="status"><Sparkles size={15} />{message}</div>}
          </div>
          <div className="pet-avatar-wrap">
            <Pet3DViewer
              assetPath={currentSpecies?.assetPath}
              speciesId={currentSpecies?.id ?? pet.species}
              name={pet.speciesName}
              accent={currentSpecies?.accent ?? '#6a91b9'}
              animation={animation}
              animationNonce={animationNonce}
              animationClip={showcaseClip}
              animationClipNonce={showcaseNonce}
              onAnimationsChange={handleAnimationsChange}
            />
          </div>
        </div>
        {animationShowcase}
        <div className="pet-content-grid">
          <section className="pet-panel pet-status-panel">
            <div className="section-heading"><div><span className="eyebrow">TODAY</span><h2>伙伴状态</h2></div><span className="soft-badge">{pet.growthPoints} 成长点</span></div>
            <div className="pet-stats"><StatBar label="心情" value={pet.mood} tone="mood" /><StatBar label="活力" value={pet.energy} tone="energy" /><StatBar label="好奇心" value={pet.curiosity} tone="curiosity" /><StatBar label="整洁度" value={pet.cleanliness} tone="cleanliness" /></div>
            <div className="pet-growth-line"><span>成长阶段</span><strong>{pet.growthStage}</strong><small>继续陪伴，下一阶段会解锁更多故事。</small></div>
            <p className="pet-inline-note">更换伙伴与饲养第二只伙伴的积分入口已预留，等家庭积分规则确定后开放。</p>
          </section>
          <section className="pet-panel pet-action-panel">
            <div className="section-heading"><div><span className="eyebrow">SPEND TIME TOGETHER</span><h2>陪伴一下</h2></div><Heart size={19} className="pet-heart-icon" /></div>
            <div className="pet-actions">{ACTIONS.map(({ action, label, icon: ActionIcon, hint }) => <button key={action} type="button" className="pet-action-button" disabled={readOnly} data-tv-initial={action === 'feed' ? true : undefined} onClick={() => { setAutomaticActions(false); setAnimation(action); setAnimationNonce((value) => value + 1); void onAction(pet.id, action).then((result) => setMessage(`${result.message} +${result.points} 成长点`)).catch((error) => setMessage(error instanceof Error ? error.message : '互动没有完成')) }}><ActionIcon size={18} /><span><strong>{label}</strong><small>{hint}</small></span></button>)}</div>
            {connection === 'offline' && <p className="pet-inline-note">Server 离线时只能查看上次同步的状态。</p>}
          </section>
        </div>
        <div className="pet-footer-note"><WandSparkles size={14} /><span>伙伴资料由家庭 Server 保存，手机、电脑和电视端会自动同步；声声岛录音只留在当前设备。</span>{currentSpecies?.sourceUrl && <a href={currentSpecies.sourceUrl} target="_blank" rel="noreferrer">资源来源</a>}</div>
      </section>
      {echoModal}
    </>
  )
}
