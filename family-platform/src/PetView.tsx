import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { BookOpen, Heart, MessageCircle, PawPrint, Sparkles, Utensils, WandSparkles, Waves, Play } from 'lucide-react'
import type { PetAction, PetSpecies, PetState, Role, SessionUser } from './types'

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
      className={'pet-species-card ' + (selected ? 'is-selected' : '')}
      style={{ '--pet-accent': species.accent } as CSSProperties}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      data-tv-initial={selected ? true : undefined}
    >
      <span className="pet-species-emoji" aria-hidden="true">{species.emoji}</span>
      <span className="pet-species-name">{species.name}</span>
      <small>{species.englishName}</small>
      <em>{species.temperament}</em>
    </button>
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
  const selected = useMemo(() => species.find((item) => item.id === selectedSpecies) ?? species[0], [selectedSpecies, species])
  const readOnly = connection !== 'backend' || busy

  if (!pet) {
    return (
      <section className="pet-dashboard pet-adoption-view">
        <div className="pet-hero pet-hero-intro">
          <div className="pet-hero-copy">
            <span className="eyebrow">LUMI COMPANION</span>
            <h1>{user.role === 'child' ? `${user.displayName}，挑选你的伙伴` : '家庭伙伴'}</h1>
            <p>{user.role === 'child' ? '从 12 种 Quaternius 动物和一只 Lumi 小猫中选择一位伙伴。每个儿童账号先养一只，之后一起完成故事和小任务。' : '孩子还没有领养伙伴。这里会同步显示 Server 中的伙伴目录。'}</p>
            <div className="pet-credit-row"><PawPrint size={15} /><span>低多边形动物目录 · CC0 资源</span><a href="https://quaternius.com/packs/ultimateanimatedanimals.html" target="_blank" rel="noreferrer">查看官方资源页</a></div>
          </div>
          <img src="/pets/quaternius-preview.jpg" alt="Quaternius 动物资源预览" />
        </div>
        {user.role === 'child' && canAdopt ? (
          <div className="pet-adoption-panel">
            <div className="section-heading"><div><span className="eyebrow">CHOOSE A FRIEND</span><h2>选择一个形象</h2></div><span className="soft-badge">{species.length} 个可选</span></div>
            <div className="pet-species-grid">
              {species.map((item) => <SpeciesCard key={item.id} species={item} selected={selected?.id === item.id} disabled={readOnly} onSelect={() => { setSelectedSpecies(item.id); setName(item.name) }} />)}
            </div>
            <div className="pet-adoption-form">
              <label><span>给伙伴起个名字</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="例如：小豆" disabled={readOnly || !selected} /></label>
              <button type="button" className="button button-primary" data-tv-initial onClick={() => { if (selected) void onAdopt(selected.id, name || selected.name).then(() => setMessage('伙伴已经来到你的身边！')).catch((error) => setMessage(error instanceof Error ? error.message : '领养没有完成')) }} disabled={readOnly || !selected}><Heart size={16} fill="currentColor" />领养 {selected?.name ?? '伙伴'}</button>
            </div>
            {connection === 'offline' && <p className="pet-inline-note">连接 Server 后才能保存领养结果。</p>}
          </div>
        ) : (
          <div className="pet-empty-state"><Sparkles size={22} /><strong>等待孩子选择伙伴</strong><span>领养完成后，成长状态会在所有客户端同步。</span></div>
        )}
      </section>
    )
  }

  const currentSpecies = species.find((item) => item.id === pet.species)
  return (
    <section className="pet-dashboard">
      <div className="pet-hero pet-hero-active" style={{ '--pet-accent': currentSpecies?.accent ?? '#6a91b9' } as CSSProperties}>
        <div className="pet-hero-copy">
          <span className="eyebrow">MY COMPANION</span>
          <h1>{pet.name}</h1>
          <p>{pet.speciesName} · {pet.speciesEnglishName} · {pet.growthStage}</p>
          <span className="pet-owner-note">{pet.ownerName === user.displayName ? '这是你的伙伴' : `由 ${pet.ownerName} 照顾`}</span>
          {message && <div className="pet-message" role="status"><Sparkles size={15} />{message}</div>}
        </div>
        <div className="pet-avatar-wrap"><img src="/pets/quaternius-preview.jpg" alt="" /><span className="pet-avatar" aria-label={pet.speciesName}>{currentSpecies?.emoji ?? '🐾'}</span><i /></div>
      </div>
      <div className="pet-content-grid">
        <section className="pet-panel pet-status-panel">
          <div className="section-heading"><div><span className="eyebrow">TODAY</span><h2>伙伴状态</h2></div><span className="soft-badge">{pet.growthPoints} 成长点</span></div>
          <div className="pet-stats"><StatBar label="心情" value={pet.mood} tone="mood" /><StatBar label="活力" value={pet.energy} tone="energy" /><StatBar label="好奇心" value={pet.curiosity} tone="curiosity" /><StatBar label="整洁度" value={pet.cleanliness} tone="cleanliness" /></div>
          <div className="pet-growth-line"><span>成长阶段</span><strong>{pet.growthStage}</strong><small>继续陪伴，下一阶段会解锁更多故事。</small></div>
        </section>
        <section className="pet-panel pet-action-panel">
          <div className="section-heading"><div><span className="eyebrow">SPEND TIME TOGETHER</span><h2>陪伴一下</h2></div><Heart size={19} className="pet-heart-icon" /></div>
          <div className="pet-actions">{ACTIONS.map(({ action, label, icon: ActionIcon, hint }) => <button key={action} type="button" className="pet-action-button" disabled={readOnly} data-tv-initial={action === 'feed' ? true : undefined} onClick={() => { void onAction(pet.id, action).then((result) => setMessage(`${result.message} +${result.points} 成长点`)).catch((error) => setMessage(error instanceof Error ? error.message : '互动没有完成')) }}><ActionIcon size={18} /><span><strong>{label}</strong><small>{hint}</small></span></button>)}</div>
          {connection === 'offline' && <p className="pet-inline-note">Server 离线时只能查看上次同步的状态。</p>}
        </section>
      </div>
      <div className="pet-footer-note"><WandSparkles size={14} /><span>伙伴资料由家庭 Server 保存，手机、电脑和电视端会自动同步。</span>{currentSpecies?.sourceUrl && <a href={currentSpecies.sourceUrl} target="_blank" rel="noreferrer">资源来源</a>}</div>
    </section>
  )
}
