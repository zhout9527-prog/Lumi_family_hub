import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent, ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Cloud,
  Compass,
  Download,
  ExternalLink,
  FileCheck2,
  Gamepad2,
  Gauge,
  Heart,
  HardDrive,
  Headphones,
  Inbox,
  Layers3,
  Library,
  ListChecks,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  Pause,
  PenTool,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Server,
  Timer,
  UploadCloud,
  Users,
  Wifi,
  WifiOff,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { APP_EDITION, PRODUCT_NAME } from './edition'
import { useFamilyStore } from './store'
import type { AccountRegistration, AssetRecord, AssetReviewDraft, BilibiliDownloadDraft, CloudSubmission, ContentItem, ContentKind, DownloadJob, ManagedUser, NavKey, RegistrationDraft, Role, SessionUser, SourceRecord, SystemStatus } from './types'
import { checkForAppUpdate, installDesktopUpdate } from './updates'
import type { UpdateCheckResult } from './updates'
import type { LucideIcon } from 'lucide-react'
import './styles.css'

type NoticeTone = 'success' | 'info' | 'warning'

interface NavItem {
  key: NavKey
  label: string
  icon: LucideIcon
  count?: number
}

const roleMeta: Record<Role, { label: string; color: string }> = {
  child: { label: '儿童账户', color: '#ef8b58' },
  guardian: { label: '家长账户', color: '#5e9b8d' },
  operator: { label: '运维账户', color: '#6a91b9' },
}

function accountInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase('zh-CN') ?? 'L'
}

const kindMeta: Record<
  ContentKind,
  { label: string; icon: LucideIcon; tone: string; noun: string }
> = {
  video: { label: '看一看', icon: Play, tone: 'coral', noun: '视频' },
  book: { label: '读一读', icon: BookOpen, tone: 'plum', noun: '图书' },
  audio: { label: '听一听', icon: Headphones, tone: 'blue', noun: '音频' },
  game: { label: '玩一玩', icon: Gamepad2, tone: 'green', noun: '互动' },
  create: { label: '做一做', icon: PenTool, tone: 'orange', noun: '创作' },
  discover: { label: '去发现', icon: Compass, tone: 'olive', noun: '户外' },
}

const navByRole: Record<Role, NavItem[]> = {
  child: [
    { key: 'explore', label: '探索馆', icon: Compass },
    { key: 'library', label: '我的书架', icon: Library },
    { key: 'progress', label: '成长记录', icon: Sparkles },
    { key: 'connection', label: '连接设置', icon: Wifi },
  ],
  guardian: [
    { key: 'explore', label: '家庭概览', icon: Layers3 },
    { key: 'approvals', label: '审批中心', icon: ListChecks, count: 3 },
    { key: 'planning', label: '本周编排', icon: Clock3 },
    { key: 'library', label: '家庭书架', icon: Library },
    { key: 'connection', label: '连接设置', icon: Wifi },
  ],
  operator: [
    { key: 'ops', label: '运维概览', icon: Gauge },
    { key: 'accounts', label: '账户管理', icon: Users },
    { key: 'queue', label: '下载队列', icon: Download, count: 2 },
    { key: 'sources', label: '来源与隔离', icon: ShieldCheck },
    { key: 'library', label: '内容目录', icon: Library },
  ],
}

const dateLabel = new Intl.DateTimeFormat('zh-CN', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date())

function IconButton({
  label,
  children,
  onClick,
  className = '',
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={'icon-button ' + className}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Cover({
  item,
  className = '',
  onOpen,
}: {
  item: ContentItem
  className?: string
  onOpen?: () => void
}) {
  const [failed, setFailed] = useState(false)
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpen) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }
  return (
    <div
      className={'cover ' + className}
      style={{ backgroundColor: item.accent }}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      {!failed && (
        <img
          src={item.cover}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <div className="cover-wash" />
      <div className="cover-topline">
        <span className={'kind-chip ' + kindMeta[item.kind].tone}>
          {(() => {
            const KindIcon = kindMeta[item.kind].icon
            return <KindIcon size={13} strokeWidth={2.3} />
          })()}
          {kindMeta[item.kind].label}
        </span>
        {item.progress !== undefined && (
          <span className="progress-chip">{item.progress}%</span>
        )}
      </div>
      <div className="cover-title">{item.title}</div>
    </div>
  )
}

function ContentCard({
  item,
  favorite,
  onOpen,
  onFavorite,
}: {
  item: ContentItem
  favorite: boolean
  onOpen: () => void
  onFavorite: () => void
}) {
  const MetaIcon = kindMeta[item.kind].icon
  return (
    <article className="content-card">
      <div className="card-cover-wrap">
        <Cover item={item} onOpen={onOpen} />
        <IconButton
          label={favorite ? '取消收藏' : '加入收藏'}
          className={'favorite-button ' + (favorite ? 'is-favorite' : '')}
          onClick={onFavorite}
        >
          <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />
        </IconButton>
      </div>
      <button type="button" className="card-copy" onClick={onOpen}>
        <div className="card-label">
          <MetaIcon size={13} />
          <span>{item.subtitle}</span>
        </div>
        <h3>{item.title}</h3>
        <div className="card-meta">
          <span>{item.language}</span>
          <span className="meta-dot" />
          <span>{item.duration}</span>
        </div>
      </button>
    </article>
  )
}

function SectionHeading({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action && (
        <button type="button" className="text-button" onClick={onAction}>
          {action}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  )
}

function StatTile({
  label,
  value,
  detail,
  icon: TileIcon,
  tone,
}: {
  label: string
  value: string
  detail: string
  icon: LucideIcon
  tone: string
}) {
  return (
    <div className={'stat-tile ' + tone}>
      <div className="stat-icon">
        <TileIcon size={17} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  )
}

function Sidebar({
  user,
  connection,
  activeNav,
  onNav,
  onLogout,
  mobileOpen,
  onClose,
}: {
  user: SessionUser
  connection: 'checking' | 'backend' | 'offline'
  activeNav: NavKey
  onNav: (key: NavKey) => void
  onLogout: () => void
  mobileOpen: boolean
  onClose: () => void
}) {
  const role = user.role
  const meta = roleMeta[role]
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileOpen])

  useEffect(() => {
    if (!mobileOpen) setProfileOpen(false)
  }, [mobileOpen])

  return (
    <aside className={'sidebar ' + (mobileOpen ? 'is-open' : '')}>
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={17} />
          </div>
          <div>
            <strong>Lumi</strong>
            <span>{APP_EDITION === 'server' ? 'Server 控制台' : 'Client 家庭端'}</span>
          </div>
        </div>
        <IconButton label="关闭导航" className="mobile-close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className={'profile-switcher ' + (profileOpen ? 'is-open' : '')} ref={profileRef}>
        <button
          type="button"
          className="profile-trigger"
          aria-label={`当前账号 ${user.displayName}`}
          aria-haspopup="menu"
          aria-expanded={profileOpen}
          onClick={() => setProfileOpen((open) => !open)}
        >
          <span className="avatar" style={{ backgroundColor: meta.color }}>
            {accountInitial(user.displayName)}
          </span>
          <span className="profile-copy">
            <strong>{user.displayName}</strong>
            <span>{meta.label} · {user.username}</span>
          </span>
          <ChevronDown size={15} className="muted-icon" />
        </button>
        <div className="profile-menu" role="menu" aria-label="账户菜单">
          <div className="profile-menu-account">
            <strong>{user.displayName}</strong>
            <span>{user.username}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setProfileOpen(false)
              onClose()
              onLogout()
            }}
          >
            <LogOut size={15} />
            切换账号
          </button>
        </div>
      </div>

      <nav className="primary-nav" aria-label="主导航">
        <span className="nav-caption">SPACE</span>
        {navByRole[role].map((item) => {
          const NavIcon = item.icon
          return (
            <button
              type="button"
              key={item.key}
              className={'nav-item ' + (activeNav === item.key ? 'active' : '')}
              onClick={() => {
                onNav(item.key)
                onClose()
              }}
            >
              <NavIcon size={18} strokeWidth={activeNav === item.key ? 2.4 : 1.9} />
              <span>{item.label}</span>
              {item.count && <em>{item.count}</em>}
            </button>
          )
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="node-status">
          <span className={'status-led ' + (connection === 'backend' ? '' : 'is-offline')} />
          <div>
            <strong>{connection === 'backend' ? (APP_EDITION === 'server' ? '本机服务在线' : '家庭主机在线') : (APP_EDITION === 'server' ? '本机服务离线' : '家庭主机离线')}</strong>
            <span>{connection === 'backend' ? `同步于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : APP_EDITION === 'server' ? '请重新启动 Lumi Server' : '进入连接设置检查'}</span>
          </div>
          {connection === 'backend' ? <Wifi size={15} /> : <WifiOff size={15} />}
        </div>
        {APP_EDITION === 'client' && (
          <button type="button" className="settings-link" onClick={() => onNav('connection')}>
            <Settings2 size={16} />
            <span>连接设置</span>
          </button>
        )}
      </div>
    </aside>
  )
}

function Topbar({
  user,
  query,
  onQuery,
  onMenu,
  onLogout,
  onCheckUpdate,
  updateBusy,
}: {
  user: SessionUser
  query: string
  onQuery: (value: string) => void
  onMenu: () => void
  onLogout?: () => void
  onCheckUpdate: () => void
  updateBusy: boolean
}) {
  const role = user.role
  const meta = roleMeta[role]
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const searchExpanded = mobileSearchOpen || Boolean(query)
  return (
    <header className="topbar">
      <div className="topbar-left">
        <IconButton label="打开导航" className="mobile-menu" onClick={onMenu}>
          <Menu size={20} />
        </IconButton>
        <div className="breadcrumb">
          <span>{PRODUCT_NAME}</span>
          <ChevronRight size={14} />
          <strong>{user.displayName}</strong>
        </div>
      </div>
      <div className="topbar-actions">
        <label
          className={'search-box ' + (searchExpanded ? 'mobile-search-open' : '')}
          title="搜索"
          onClick={() => {
            if (!mobileSearchOpen) setMobileSearchOpen(true)
          }}
        >
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="搜索故事、书和活动"
            aria-label="搜索故事、书和活动"
            autoFocus={mobileSearchOpen}
          />
          {searchExpanded && (
            <IconButton
              label={query ? '清除搜索' : '关闭搜索'}
              onClick={() => {
                if (query) onQuery('')
                else setMobileSearchOpen(false)
              }}
            >
              <X size={14} />
            </IconButton>
          )}
        </label>
        <IconButton label="通知">
          <Bell size={18} />
          <span className="notification-dot" />
        </IconButton>
        {role !== 'child' && (
          <IconButton label="检查应用更新" onClick={onCheckUpdate} className={updateBusy ? 'is-busy' : ''}>
            <RefreshCw className={updateBusy ? 'spin' : ''} size={17} />
          </IconButton>
        )}
        {onLogout && <IconButton label="退出当前账号" onClick={onLogout}><LogOut size={17} /></IconButton>}
        <div className="top-avatar" style={{ backgroundColor: meta.color }}>
          {accountInitial(user.displayName)}
        </div>
      </div>
    </header>
  )
}

function CategoryStrip({
  active,
  onChange,
}: {
  active: ContentKind | 'all'
  onChange: (kind: ContentKind | 'all') => void
}) {
  const categories: Array<{ key: ContentKind | 'all'; label: string; icon: LucideIcon }> = [
    { key: 'all', label: '全部', icon: Layers3 },
    { key: 'video', label: '看一看', icon: Play },
    { key: 'book', label: '读一读', icon: BookOpen },
    { key: 'audio', label: '听一听', icon: Headphones },
    { key: 'game', label: '玩一玩', icon: Gamepad2 },
    { key: 'create', label: '做一做', icon: PenTool },
    { key: 'discover', label: '去发现', icon: Compass },
  ]
  return (
    <div className="category-strip" role="tablist" aria-label="内容类型">
      {categories.map(({ key, label, icon: CategoryIcon }) => (
        <button
          type="button"
          role="tab"
          aria-selected={active === key}
          className={'category-tab ' + (active === key ? 'active' : '')}
          key={key}
          onClick={() => onChange(key)}
        >
          <CategoryIcon size={16} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

function ChildDashboard({
  displayName,
  items,
  favoriteIds,
  completedIds,
  onOpen,
  onFavorite,
}: {
  displayName: string
  items: ContentItem[]
  favoriteIds: string[]
  completedIds: string[]
  onOpen: (item: ContentItem) => void
  onFavorite: (id: string) => void
}) {
  const [kind, setKind] = useState<ContentKind | 'all'>('all')
  const featured = items.find((item) => item.featured) ?? items[0]
  const filtered = items.filter((item) => kind === 'all' || item.kind === kind)
  const completedCount = completedIds.length
  return (
    <div className="dashboard child-dashboard">
      <section className="welcome-grid">
        <div className="welcome-copy">
          <div className="date-line">
            <span className="sun-dot" />
            {dateLabel} · 放学后
          </div>
          <h1>
            今天，去发现
            <br />
            一点什么。
          </h1>
          <p>
            先选一个小故事，结束后把它带到现实里。
            <br />
            看、读、听、玩，都算今天的探索。
          </p>
          <div className="welcome-actions">
            <button type="button" className="button button-primary" onClick={() => onOpen(featured)}>
              <Play size={16} fill="currentColor" />
              继续 {featured.title}
            </button>
            <button type="button" className="button button-quiet" onClick={() => onOpen(items.find((item) => item.kind === 'book') ?? featured)}>
              <BookOpen size={16} />
              读一本
            </button>
          </div>
          <div className="micro-note">
            <Check size={14} />
            <span>本周已完成 {completedCount} 个小任务</span>
          </div>
        </div>
        <button type="button" className="feature-art" onClick={() => onOpen(featured)}>
          <Cover item={featured} />
          <div className="feature-sticker">
            <Sparkles size={14} />
            <span>今日推荐</span>
          </div>
          <div className="feature-caption">
            <span>看完之后</span>
            <strong>{featured.offlineActivity}</strong>
          </div>
        </button>
      </section>

      <section className="explore-section">
        <SectionHeading eyebrow="TODAY'S MIX" title={`给${displayName}的探索清单`} action="打开完整书架" />
        <CategoryStrip active={kind} onChange={setKind} />
        <div className="content-grid">
          {filtered.slice(0, 6).map((item) => (
            <ContentCard
              item={item}
              key={item.id}
              favorite={favoriteIds.includes(item.id)}
              onOpen={() => onOpen(item)}
              onFavorite={() => onFavorite(item.id)}
            />
          ))}
        </div>
      </section>

      <section className="child-lower-grid">
        <div className="panel rhythm-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR RHYTHM</span>
              <h2>今天的节奏</h2>
            </div>
            <span className="soft-badge">周三</span>
          </div>
          <div className="rhythm-track">
            <div className="rhythm-step done">
              <span className="step-dot"><Check size={12} /></span>
              <div><strong>英语输入</strong><small>Numberblocks · 5 分钟</small></div>
            </div>
            <div className="rhythm-line active-line" />
            <div className="rhythm-step current">
              <span className="step-dot"><Play size={11} fill="currentColor" /></span>
              <div><strong>故事时间</strong><small>现在 · 8 分钟</small></div>
            </div>
            <div className="rhythm-line" />
            <div className="rhythm-step">
              <span className="step-dot"><PenTool size={12} /></span>
              <div><strong>离屏小任务</strong><small>画一张角色卡</small></div>
            </div>
          </div>
          <div className="rhythm-footer">
            <span><Timer size={14} /> 今日屏幕时间 42 / 60 分钟</span>
            <div className="mini-progress"><span style={{ width: '70%' }} /></div>
          </div>
        </div>
        <div className="panel quote-panel">
          <div className="quote-mark">“</div>
          <p>真正的故事，<br />会在屏幕关掉以后继续。</p>
          <span>— Lumi 家庭探索卡</span>
          <div className="quote-sun"><Sparkles size={18} /></div>
        </div>
      </section>
    </div>
  )
}

function ApprovalRow({
  item,
  reason,
  createdAt,
  onApprove,
  onReject,
}: {
  item: ContentItem
  reason: string
  createdAt: string
  onApprove: () => void
  onReject: () => void
}) {
  const ItemIcon = kindMeta[item.kind].icon
  return (
    <div className="approval-row">
      <div className="approval-thumb" style={{ backgroundColor: item.accent }}>
        <img src={item.cover} alt="" />
        <ItemIcon size={15} />
      </div>
      <div className="approval-copy">
        <strong>{item.title}</strong>
        <span>{reason}</span>
        <small>{createdAt} · {item.duration}</small>
      </div>
      <div className="approval-actions">
        <IconButton label="拒绝" className="reject-button" onClick={onReject}>
          <X size={16} />
        </IconButton>
        <IconButton label="批准" className="approve-button" onClick={onApprove}>
          <Check size={16} />
        </IconButton>
      </div>
    </div>
  )
}

function GuardianDashboard({
  displayName,
  items,
  requests,
  submissions,
  onDecision,
  onOpen,
  onAddSubmission,
  onTransfer,
  focus,
}: {
  displayName: string
  items: ContentItem[]
  requests: ReturnType<typeof useFamilyStore>['state']['requests']
  submissions: CloudSubmission[]
  onDecision: (id: string, status: 'approved' | 'rejected') => void
  onOpen: (item: ContentItem) => void
  onAddSubmission: (payload: {
    title: string
    provider: NonNullable<CloudSubmission['provider']>
    url: string
    rightsNote: string
  }) => void
  onTransfer: (id: string) => void
  focus: NavKey
}) {
  const [submissionTitle, setSubmissionTitle] = useState('')
  const [submissionProvider, setSubmissionProvider] = useState<NonNullable<CloudSubmission['provider']>>('baidu')
  const [submissionUrl, setSubmissionUrl] = useState('')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const pending = requests.filter((request) => request.status === 'pending')
  const getItem = (id: string) => items.find((item) => item.id === id) ?? items[0]
  const title = focus === 'approvals' ? '审批中心' : focus === 'planning' ? '本周编排' : '家庭概览'
  const subtitle =
    focus === 'approvals'
      ? '把每一次选择都变成一次有边界的陪伴。'
      : focus === 'planning'
        ? '让故事、阅读、英语和户外活动轮流出现。'
        : `${displayName}，今天的家庭内容与申请都在这里。`
  const submitCandidate = () => {
    if (!submissionTitle.trim() || !submissionUrl.trim() || !rightsConfirmed) return
    onAddSubmission({
      title: submissionTitle.trim(),
      provider: submissionProvider,
      url: submissionUrl.trim(),
      rightsNote: '家长确认仅供家庭合法使用，并将在发布前复核来源和授权。',
    })
    setSubmissionTitle('')
    setSubmissionUrl('')
    setRightsConfirmed(false)
  }
  return (
    <div className="dashboard guardian-dashboard">
      <section className="page-intro">
        <div>
          <span className="eyebrow">GUARDIAN SPACE</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="intro-actions">
          <button type="button" className="button button-quiet">
            <ExternalLink size={16} />
            打开儿童视图
          </button>
          <IconButton label="更多家庭设置"><MoreHorizontal size={19} /></IconButton>
        </div>
      </section>

      <div className="stats-grid">
        <StatTile label="待处理请求" value={String(pending.length).padStart(2, '0')} detail="需要你看一眼" icon={Bell} tone="coral" />
        <StatTile label="本周完成" value="12" detail="比上周多 3 个" icon={CircleCheck} tone="green" />
        <StatTile label="英语输入" value="2h 40m" detail="自然重复最有效" icon={Headphones} tone="blue" />
        <StatTile label="家庭作品" value="04" detail="最近更新 18:12" icon={Sparkles} tone="yellow" />
      </div>

      <div className="guardian-main-grid">
        <section className="panel approvals-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NEEDS YOUR EYES</span>
              <h2>等你决定</h2>
            </div>
            <span className="count-badge">{pending.length} 项</span>
          </div>
          <div className="approval-list">
            {pending.length === 0 ? (
              <div className="empty-state">
                <CircleCheck size={26} />
                <strong>今天的请求都处理好了</strong>
                <span>可以去看看本周编排。</span>
              </div>
            ) : (
              pending.map((request) => (
                <ApprovalRow
                  key={request.id}
                  item={getItem(request.itemId)}
                  reason={request.reason}
                  createdAt={request.createdAt}
                  onApprove={() => onDecision(request.id, 'approved')}
                  onReject={() => onDecision(request.id, 'rejected')}
                />
              ))
            )}
          </div>
          <button type="button" className="panel-link" onClick={() => onOpen(getItem(pending[0]?.itemId ?? 'bluey'))}>
            查看完整请求记录
            <ArrowRight size={15} />
          </button>
        </section>

        <section className="panel weekly-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">THIS WEEK</span>
              <h2>内容平衡</h2>
            </div>
            <button type="button" className="tiny-select">本周 <ChevronDown size={13} /></button>
          </div>
          <div className="balance-list">
            <BalanceRow label="故事与动画" value="4 / 5" percent={80} tone="coral" />
            <BalanceRow label="阅读" value="3 / 4" percent={75} tone="plum" />
            <BalanceRow label="英语听读" value="3 / 3" percent={100} tone="blue" />
            <BalanceRow label="离屏活动" value="2 / 4" percent={50} tone="green" />
          </div>
          <div className="weekly-tip">
            <Sparkles size={15} />
            <span>明天可以安排一段 15 分钟的亲子共读。</span>
          </div>
        </section>
      </div>

      <section className="panel submissions-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">COMMUNITY INBOX</span>
            <h2>候选投递箱</h2>
          </div>
          <span className="secure-label"><ShieldCheck size={14} /> 私有隔离</span>
        </div>
        <div className="submission-compose">
          <div className="compose-icon"><UploadCloud size={20} /></div>
          <input
            value={submissionTitle}
            onChange={(event) => setSubmissionTitle(event.target.value)}
            placeholder="粘贴一个 UP 主、老师或社区资源的标题"
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCandidate()
            }}
          />
          <input
            value={submissionUrl}
            type="url"
            inputMode="url"
            onChange={(event) => setSubmissionUrl(event.target.value)}
            placeholder="https:// 分享页或创作者页面"
            aria-label="资源来源链接"
          />
          <select value={submissionProvider} onChange={(event) => setSubmissionProvider(event.target.value as NonNullable<CloudSubmission['provider']>)}>
            <option value="baidu">百度网盘</option>
            <option value="quark">夸克网盘</option>
            <option value="creator">创作者网站</option>
            <option value="other">其他网页</option>
          </select>
          <label className="rights-check">
            <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
            <span>已确认家庭合法使用</span>
          </label>
          <button type="button" className="button button-primary small" onClick={submitCandidate} disabled={!submissionTitle.trim() || !submissionUrl.trim() || !rightsConfirmed}>
            <Plus size={15} />
            放入候选箱
          </button>
        </div>
        <div className="submission-list">
          {submissions.slice(0, 3).map((submission) => (
            <div className="submission-row" key={submission.id}>
              <div className="submission-symbol"><Cloud size={16} /></div>
              <div className="submission-copy">
                <strong>{submission.title}</strong>
                <span>{submission.source} · {submission.note}</span>
              </div>
              <span className={'submission-status ' + submission.status}>
                {submission.status === 'candidate' ? '待转存' : submission.status === 'review' ? '扫描中' : submission.status === 'transferred' ? '已转存' : '已冻结'}
              </span>
              {submission.status === 'candidate' && (
                <button type="button" className="text-button compact" onClick={() => onTransfer(submission.id)}>
                  确认转存
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function BalanceRow({
  label,
  value,
  percent,
  tone,
}: {
  label: string
  value: string
  percent: number
  tone: string
}) {
  return (
    <div className="balance-row">
      <div><span>{label}</span><strong>{value}</strong></div>
      <div className="balance-track"><span className={tone} style={{ width: percent + '%' }} /></div>
    </div>
  )
}

function formatStorage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 GB'
  const terabyte = 1024 ** 4
  const gigabyte = 1024 ** 3
  return bytes >= terabyte ? `${(bytes / terabyte).toFixed(2)} TB` : `${(bytes / gigabyte).toFixed(1)} GB`
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

function BilibiliDownloadPanel({
  onQueue,
}: {
  onQueue: (payload: BilibiliDownloadDraft) => Promise<void>
}) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [rightsNote, setRightsNote] = useState('')
  const [maxHeight, setMaxHeight] = useState<480 | 720 | 1080>(1080)
  const [startNow, setStartNow] = useState(true)
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const submit = async () => {
    if (!/^https:\/\/(?:www\.|m\.)?bilibili\.com\/video\/BV[0-9A-Za-z]{10}/i.test(url.trim()) && !/^https:\/\/b23\.tv\//i.test(url.trim())) {
      setFormError('请输入有效的 B 站 BV 视频链接或 b23.tv 短链接')
      return
    }
    if (rightsNote.trim().length < 8) {
      setFormError('请填写至少 8 个字符的下载与家庭使用权利依据')
      return
    }
    if (!rightsConfirmed) {
      setFormError('请先确认你有权下载并在家庭范围内使用该视频')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      await onQueue({
        url: url.trim(),
        title: title.trim() || undefined,
        maxHeight,
        startNow,
        rightsConfirmed,
        rightsNote: rightsNote.trim(),
      })
      setUrl('')
      setTitle('')
      setRightsNote('')
      setRightsConfirmed(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '任务创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="panel bilibili-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">BILIBILI INGEST</span><h2>B站视频下载</h2></div>
        <span className="soft-badge">公开单视频</span>
      </div>
      <form className="bilibili-form" noValidate onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label className="ops-field bilibili-url">
          <span>视频链接</span>
          <div><Play size={16} /><input aria-label="B站视频链接" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.bilibili.com/video/BV..." required /></div>
        </label>
        <label className="ops-field">
          <span>标题（可留空）</span>
          <div><PenTool size={16} /><input aria-label="视频标题" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="下载后自动读取视频标题" maxLength={240} /></div>
        </label>
        <label className="ops-field bilibili-rights">
          <span>权利依据</span>
          <div><ShieldCheck size={16} /><input aria-label="下载权利依据" value={rightsNote} onChange={(event) => setRightsNote(event.target.value)} placeholder="例如：本人投稿，或 UP 主明确允许家庭离线观看" required minLength={8} maxLength={2000} /></div>
        </label>
        <label className="ops-field compact-select">
          <span>最高画质</span>
          <select aria-label="最高画质" value={maxHeight} onChange={(event) => setMaxHeight(Number(event.target.value) as 480 | 720 | 1080)}>
            <option value={1080}>1080p</option>
            <option value={720}>720p</option>
            <option value={480}>480p</option>
          </select>
        </label>
        <div className="bilibili-options">
          <label className="rights-check"><input type="checkbox" checked={startNow} onChange={(event) => setStartNow(event.target.checked)} />立即处理；关闭后进入夜间队列</label>
          <label className="rights-check"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />我确认拥有下载和家庭使用权限</label>
        </div>
        <button type="submit" className="button button-primary bilibili-submit" disabled={submitting}>
          {submitting ? <RefreshCw className="spin" size={16} /> : <Download size={16} />}
          {submitting ? '正在创建' : '加入下载队列'}
        </button>
      </form>
      {formError && <div className="inline-error" role="alert"><AlertTriangle size={14} />{formError}</div>}
      <p className="connector-boundary">不读取浏览器 Cookie，不处理会员、付费、登录专享或 DRM 内容；下载结果仍需在隔离区审核。</p>
    </section>
  )
}

function AssetReviewEditor({
  asset,
  job,
  onCancel,
  onReview,
}: {
  asset: AssetRecord
  job?: DownloadJob
  onCancel: () => void
  onReview: (payload: AssetReviewDraft) => Promise<void>
}) {
  const inferredKind: AssetReviewDraft['contentKind'] = asset.mimeType.startsWith('audio/') ? 'audio' : asset.mimeType === 'application/pdf' ? 'book' : 'video'
  const [title, setTitle] = useState(job?.title ?? asset.originalName.replace(/\.[^.]+$/, ''))
  const [contentKind, setContentKind] = useState<AssetReviewDraft['contentKind']>(inferredKind)
  const [audience, setAudience] = useState<AssetReviewDraft['audience']>('family')
  const [ageFrom, setAgeFrom] = useState(0)
  const [ageTo, setAgeTo] = useState(99)
  const [language, setLanguage] = useState('中文')
  const [licenseRef, setLicenseRef] = useState(job?.proofUrl ?? '')
  const [reviewNote, setReviewNote] = useState('已核对来源、权利说明和文件内容')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [securityConfirmed, setSecurityConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!title.trim() || !/^https:\/\//i.test(licenseRef.trim()) || reviewNote.trim().length < 3) {
      setError('请完整填写标题、HTTPS 权利证明链接和审核说明')
      return
    }
    if (ageFrom < 0 || ageTo < ageFrom || ageTo > 99) {
      setError('适龄范围不正确')
      return
    }
    if (!rightsConfirmed || !securityConfirmed) {
      setError('权利与安全检查必须分别确认')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onReview({ title: title.trim(), contentKind, audience, ageFrom, ageTo, language: language.trim(), licenseRef: licenseRef.trim(), reviewNote: reviewNote.trim(), rightsConfirmed, securityConfirmed })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '审核入库失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="asset-review-form" noValidate onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <label className="ops-field"><span>馆藏标题</span><div><PenTool size={15} /><input aria-label="馆藏标题" value={title} onChange={(event) => setTitle(event.target.value)} /></div></label>
      <label className="ops-field compact-select"><span>类型</span><select aria-label="馆藏类型" value={contentKind} onChange={(event) => setContentKind(event.target.value as AssetReviewDraft['contentKind'])}><option value="video">视频</option><option value="book">图书</option><option value="audio">音频</option></select></label>
      <label className="ops-field compact-select"><span>可见范围</span><select aria-label="可见范围" value={audience} onChange={(event) => setAudience(event.target.value as AssetReviewDraft['audience'])}><option value="family">全家</option><option value="child">儿童</option><option value="adult">仅成人</option></select></label>
      <label className="ops-field"><span>最低年龄</span><div><input aria-label="最低年龄" type="number" min="0" max="18" value={ageFrom} onChange={(event) => setAgeFrom(Number(event.target.value))} /></div></label>
      <label className="ops-field"><span>最高年龄</span><div><input aria-label="最高年龄" type="number" min="0" max="99" value={ageTo} onChange={(event) => setAgeTo(Number(event.target.value))} /></div></label>
      <label className="ops-field"><span>语言</span><div><input aria-label="馆藏语言" value={language} onChange={(event) => setLanguage(event.target.value)} /></div></label>
      <label className="ops-field review-wide"><span>权利证明链接</span><div><ShieldCheck size={15} /><input aria-label="权利证明链接" type="url" value={licenseRef} onChange={(event) => setLicenseRef(event.target.value)} placeholder="原视频页或许可说明的 HTTPS 地址" /></div></label>
      <label className="ops-field review-wide"><span>审核说明</span><div><FileCheck2 size={15} /><input aria-label="审核说明" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></div></label>
      <div className="review-confirmations review-wide">
        <label className="rights-check"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />权利说明已核对</label>
        <label className="rights-check"><input type="checkbox" checked={securityConfirmed} onChange={(event) => setSecurityConfirmed(event.target.checked)} />文件与内容已检查</label>
      </div>
      {error && <div className="inline-error review-wide" role="alert"><AlertTriangle size={14} />{error}</div>}
      <div className="asset-review-actions review-wide">
        <button type="button" className="button button-quiet small" onClick={onCancel} disabled={submitting}>取消</button>
        <button type="submit" className="button button-primary small" disabled={submitting}>{submitting ? <RefreshCw className="spin" size={14} /> : <Check size={14} />}{submitting ? '正在入库' : '确认入库'}</button>
      </div>
    </form>
  )
}

function AssetReviewPanel({
  assets,
  jobs,
  onReview,
}: {
  assets: AssetRecord[]
  jobs: DownloadJob[]
  onReview: (id: string, payload: AssetReviewDraft) => Promise<void>
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const visibleAssets = assets.filter((asset) => asset.quarantineStatus !== 'published').slice(0, 8)
  return (
    <section className="panel asset-review-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">QUARANTINE REVIEW</span><h2>隔离区审核</h2></div>
        <span className="count-badge">{visibleAssets.filter((asset) => asset.quarantineStatus === 'review').length} 待处理</span>
      </div>
      {visibleAssets.length === 0 ? (
        <div className="empty-state compact"><CircleCheck size={22} /><strong>隔离区没有待审核文件</strong></div>
      ) : (
        <div className="asset-review-list">
          {visibleAssets.map((asset) => {
            const jobId = asset.inboundRef.startsWith('download-job:') ? asset.inboundRef.slice('download-job:'.length) : ''
            const job = jobs.find((candidate) => candidate.id === jobId)
            const canReview = asset.quarantineStatus === 'review' && asset.scanStatus !== 'blocked'
            return (
              <div className="asset-review-item" key={asset.id}>
                <div className="asset-review-row">
                  <span className="submission-symbol"><FileCheck2 size={15} /></span>
                  <div className="asset-review-copy"><strong>{job?.title ?? asset.originalName}</strong><span>{asset.provider === 'bilibili' ? 'B站下载' : '家庭投递箱'} · {formatFileSize(asset.sizeBytes)} · {asset.scanStatus}</span></div>
                  <span className={'submission-status ' + (asset.quarantineStatus === 'frozen' ? 'frozen' : 'review')}>{asset.quarantineStatus === 'frozen' ? '已冻结' : '待审核'}</span>
                  {canReview && <button type="button" className="button button-quiet small" onClick={() => setActiveId(activeId === asset.id ? null : asset.id)}>{activeId === asset.id ? <ChevronDown size={14} /> : <FileCheck2 size={14} />}{activeId === asset.id ? '收起' : '审核入库'}</button>}
                </div>
                {activeId === asset.id && <AssetReviewEditor asset={asset} job={job} onCancel={() => setActiveId(null)} onReview={async (payload) => { await onReview(asset.id, payload); setActiveId(null) }} />}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function OperatorDashboard({
  jobs,
  submissions,
  sources,
  assets,
  systemStatus,
  downloadsPaused,
  onJob,
  onPauseAll,
  onSync,
  onQueueBilibili,
  onReviewAsset,
  onOpen,
  focus,
}: {
  jobs: DownloadJob[]
  submissions: CloudSubmission[]
  sources: SourceRecord[]
  assets: AssetRecord[]
  systemStatus: SystemStatus | null
  downloadsPaused: boolean
  onJob: (id: string, status: DownloadJob['status']) => void
  onPauseAll: () => void
  onSync: () => void
  onQueueBilibili: (payload: BilibiliDownloadDraft) => Promise<void>
  onReviewAsset: (id: string, payload: AssetReviewDraft) => Promise<void>
  onOpen: (item: ContentItem) => void
  focus: NavKey
}) {
  const title = focus === 'queue' ? '下载队列' : focus === 'sources' ? '来源与隔离' : '运维概览'
  const activeJobs = jobs.filter((job) => job.status === 'downloading' || job.status === 'queued')
  const reviewCount = jobs.filter((job) => job.status === 'review').length
  const storageUsed = systemStatus ? Math.round((1 - systemStatus.storage.freeRatio) * 100) : null
  const freeStorage = systemStatus ? formatStorage(systemStatus.storage.freeBytes) : '未探测'
  const totalStorage = systemStatus ? formatStorage(systemStatus.storage.totalBytes) : '未探测'
  const healthyServices = systemStatus ? Object.values(systemStatus.services).filter(Boolean).length : 0
  const frozenAssets = assets.filter((asset) => asset.quarantineStatus === 'frozen').length
  const reviewedSources = sources.filter((source) => source.reviewedAt && !source.disabledAt).length
  return (
    <div className="dashboard operator-dashboard">
      <section className="page-intro ops-intro">
        <div>
          <span className="eyebrow">OPERATOR CONSOLE</span>
          <h1>{title}</h1>
          <p>{downloadsPaused ? '自动处理已暂停，隔离扫描仍可手动触发。' : 'PC 节点在线，自动任务只在设定的夜间窗口执行。'}</p>
        </div>
        <div className="ops-actions">
          <button type="button" className="button button-quiet" onClick={onSync}>
            <RefreshCw size={16} />
            立即同步
          </button>
          <button type="button" className="button button-danger" onClick={onPauseAll}>
            <Pause size={15} />
            暂停全部
          </button>
        </div>
      </section>

      {(focus === 'ops' || focus === 'queue') && <BilibiliDownloadPanel onQueue={onQueueBilibili} />}

      <div className="health-strip">
        <div className="health-main">
          <span className="health-led" />
          <div><strong>{systemStatus?.node === 'online' ? '家庭 PC 在线' : '家庭控制面在线'}</strong><span>受控 Worker · 当前页面实时读取</span></div>
        </div>
        <div className="health-stat"><HardDrive size={16} /><span>存储</span><strong>{storageUsed === null ? '--' : storageUsed + '%'}</strong></div>
        <div className="health-stat"><Activity size={16} /><span>队列</span><strong>{activeJobs.length}</strong></div>
        <div className="health-stat"><Cloud size={16} /><span>服务</span><strong>{systemStatus ? healthyServices + '/3' : '--'}</strong></div>
        <div className="health-stat"><ShieldCheck size={16} /><span>冻结</span><strong>{frozenAssets}</strong></div>
      </div>

      <div className="ops-grid">
        <section className="panel jobs-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">NIGHT WORKER</span><h2>任务队列</h2></div>
            <span className="count-badge">{activeJobs.length} 活跃</span>
          </div>
          <div className="jobs-table">
            <div className="jobs-head"><span>内容</span><span>来源</span><span>状态</span><span>进度</span><span /></div>
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onJob={onJob} />
            ))}
          </div>
          <button type="button" className="panel-link">
            打开完整任务日志
            <ArrowRight size={15} />
          </button>
        </section>

        <section className="panel storage-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">STORAGE GUARD</span><h2>空间与保护</h2></div>
            <IconButton label="刷新空间"><RefreshCw size={16} /></IconButton>
          </div>
          <div className="storage-ring">
            <div className="ring" style={storageUsed === null ? undefined : { background: `conic-gradient(var(--coral) ${storageUsed}%, #edf1ed 0)` }}><span>{storageUsed ?? '--'}<small>%</small></span></div>
            <div><strong>{totalStorage} 总空间</strong><span>剩余 {freeStorage}</span></div>
          </div>
          <div className="storage-bars">
            <StorageBar label="已使用" value={storageUsed === null ? '未探测' : storageUsed + '%'} percent={storageUsed ?? 0} tone="coral" />
            <StorageBar label="隔离资产" value={assets.length + ' 项'} percent={Math.min(100, assets.length * 8)} tone="yellow" />
            <StorageBar label="来源白名单" value={reviewedSources + ' 个'} percent={Math.min(100, reviewedSources * 20)} tone="blue" />
          </div>
          {systemStatus?.paths && (
            <div className="storage-paths">
              <div><span>正式资源库</span><code title={systemStatus.paths.library}>{systemStatus.paths.library}</code></div>
              <div><span>账户数据库</span><code title={systemStatus.paths.database}>{systemStatus.paths.database}</code></div>
            </div>
          )}
          <div className="storage-note"><AlertTriangle size={15} /><span>保留 300 GB 空间作为故障恢复缓冲。</span></div>
        </section>
      </div>

      <section className="panel source-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">SOURCE HEALTH</span><h2>来源连接器</h2></div>
          <button type="button" className="text-button">管理白名单 <ArrowRight size={15} /></button>
        </div>
        <div className="source-grid">
          <SourceCard icon={Cloud} name="家庭投递箱" detail={`${assets.length} 项隔离资产 · 人工转存`} status={frozenAssets ? '有冻结项' : '正常'} tone={frozenAssets ? 'yellow' : 'green'} />
          <SourceCard icon={FileCheck2} name="授权来源" detail={`${reviewedSources} 个已复核 · 到期自动禁用`} status={reviewedSources ? '正常' : '待配置'} tone={reviewedSources ? 'green' : 'yellow'} />
          <SourceCard icon={Inbox} name="候选箱" detail={submissions.length + ' 条待处理记录'} status={reviewCount ? '需复核' : '干净'} tone={reviewCount ? 'yellow' : 'blue'} />
        </div>
      </section>
      {(focus === 'ops' || focus === 'sources') && <AssetReviewPanel assets={assets} jobs={jobs} onReview={onReviewAsset} />}
    </div>
  )
}

function JobRow({
  job,
  onJob,
}: {
  job: DownloadJob
  onJob: (id: string, status: DownloadJob['status']) => void
}) {
  const JobIcon = kindMeta[job.kind].icon
  const statusLabel: Record<DownloadJob['status'], string> = {
    queued: '排队中',
    downloading: '下载中',
    review: '待审核',
    published: '已发布',
    failed: '失败',
    paused: '已暂停',
    blocked: '已冻结',
  }
  return (
    <div className="job-row">
      <div className="job-title"><span className={'job-icon ' + kindMeta[job.kind].tone}><JobIcon size={15} /></span><div><strong>{job.title}</strong><small>{job.size}</small></div></div>
      <span className="job-source">{job.source}</span>
      <span className={'job-status ' + job.status}><i />{statusLabel[job.status]}</span>
      <div className="job-progress"><div className="job-progress-track"><span style={{ width: job.progress + '%' }} /></div><small>{job.progress}%</small></div>
      <div className="job-action">
        {(job.status === 'downloading' || job.status === 'queued') && (
          <IconButton label="暂停任务" onClick={() => onJob(job.id, 'paused')}><Pause size={15} /></IconButton>
        )}
        {job.status === 'paused' && (
          <IconButton label="继续任务" onClick={() => onJob(job.id, 'downloading')}><Play size={15} /></IconButton>
        )}
        {job.status === 'failed' && (
          <IconButton label="重试任务" onClick={() => onJob(job.id, 'queued')}><RefreshCw size={15} /></IconButton>
        )}
        {job.status === 'review' && <span className="job-eta">{job.eta}</span>}
        {job.status === 'blocked' && <span className="job-eta">{job.eta}</span>}
        <IconButton label="任务详情"><MoreHorizontal size={16} /></IconButton>
      </div>
    </div>
  )
}

function StorageBar({ label, value, percent, tone }: { label: string; value: string; percent: number; tone: string }) {
  return (
    <div className="storage-bar-row">
      <div><span>{label}</span><strong>{value}</strong></div>
      <div className="storage-track"><span className={tone} style={{ width: percent + '%' }} /></div>
    </div>
  )
}

function SourceCard({
  icon: SourceIcon,
  name,
  detail,
  status,
  tone,
}: {
  icon: LucideIcon
  name: string
  detail: string
  status: string
  tone: string
}) {
  return (
    <div className="source-card">
      <div className={'source-icon ' + tone}><SourceIcon size={17} /></div>
      <div><strong>{name}</strong><span>{detail}</span></div>
      <span className={'source-status ' + tone}><i />{status}</span>
    </div>
  )
}

function LibraryView({
  items,
  favoriteIds,
  onOpen,
  onFavorite,
}: {
  items: ContentItem[]
  favoriteIds: string[]
  onOpen: (item: ContentItem) => void
  onFavorite: (id: string) => void
}) {
  const [kind, setKind] = useState<ContentKind | 'all'>('all')
  const filtered = items.filter((item) => kind === 'all' || item.kind === kind)
  return (
    <div className="dashboard library-dashboard">
      <section className="page-intro">
        <div><span className="eyebrow">FAMILY SHELVES</span><h1>家庭书架</h1><p>已审核、可回到生活里的内容。</p></div>
        <button type="button" className="button button-quiet"><Plus size={16} /> 添加内容</button>
      </section>
      <CategoryStrip active={kind} onChange={setKind} />
      <div className="library-summary">
        <span><strong>{filtered.length}</strong> 个内容</span>
        <span className="summary-divider" />
        <span><ShieldCheck size={14} /> 全部经过家庭策略</span>
        <span className="summary-spacer" />
        <button type="button" className="sort-button">最近加入 <ChevronDown size={14} /></button>
      </div>
      <div className="content-grid library-grid">
        {filtered.map((item) => (
          <ContentCard key={item.id} item={item} favorite={favoriteIds.includes(item.id)} onOpen={() => onOpen(item)} onFavorite={() => onFavorite(item.id)} />
        ))}
      </div>
    </div>
  )
}

function ProgressView({ displayName, completedCount, activeMinutes }: { displayName: string; completedCount: number; activeMinutes: number }) {
  return (
    <div className="dashboard progress-dashboard">
      <section className="page-intro">
        <div><span className="eyebrow">LITTLE LOGBOOK</span><h1>成长记录</h1><p>记录好奇心，不记录排名。</p></div>
        <span className="date-pill"><Clock3 size={15} /> 本周 · 6 月 12 日</span>
      </section>
      <div className="progress-overview">
        <div className="progress-big">
          <span className="eyebrow">本周探索</span>
          <strong>{completedCount + 11}</strong>
          <span>个小任务完成</span>
          <div className="sparkline"><i /><i /><i /><i /><i /><i /><i /></div>
        </div>
        <div className="progress-copy"><Sparkles size={18} /><strong>这周的节奏很好</strong><span>故事、英语和动手活动都出现了。周末可以留一点空白，让{displayName}自己选。</span></div>
        <div className="progress-time"><Timer size={17} /><span>屏幕时间</span><strong>{activeMinutes} 分钟</strong><small>目标 60 分钟</small></div>
      </div>
      <div className="progress-columns">
        <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">BY TYPE</span><h2>探索构成</h2></div></div><BalanceRow label="故事与动画" value="4 次" percent={80} tone="coral" /><BalanceRow label="阅读" value="3 次" percent={65} tone="plum" /><BalanceRow label="英语听读" value="3 次" percent={78} tone="blue" /><BalanceRow label="动手与户外" value="2 次" percent={45} tone="green" /></section>
        <section className="panel note-panel"><div className="note-icon"><PenTool size={18} /></div><span className="eyebrow">FAMILY NOTE</span><h2>“他把 Bluey 里的游戏改成了积木城。”</h2><p>家长记录 · 昨天</p><button type="button" className="text-button">查看作品 <ArrowRight size={15} /></button></section>
      </div>
    </div>
  )
}

function DetailModal({
  item,
  role,
  favorite,
  onClose,
  onFavorite,
  onRequest,
  onComplete,
  onQueue,
  onLaunch,
}: {
  item: ContentItem
  role: Role
  favorite: boolean
  onClose: () => void
  onFavorite: () => void
  onRequest: () => void
  onComplete: () => void
  onQueue: () => void
  onLaunch: () => void
}) {
  const MetaIcon = kindMeta[item.kind].icon
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const scrollTop = window.scrollY
    const body = document.body
    const root = document.documentElement
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      rootOverflow: root.style.overflow,
    }
    root.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollTop}px`
    body.style.width = '100%'

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      root.style.overflow = previous.rootOverflow
      body.style.overflow = previous.bodyOverflow
      body.style.position = previous.bodyPosition
      body.style.top = previous.bodyTop
      body.style.width = previous.bodyWidth
      window.scrollTo(0, scrollTop)
    }
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <IconButton label="关闭详情" className="modal-close" onClick={onClose}><X size={19} /></IconButton>
        <div className="modal-cover"><Cover item={item} /></div>
        <div className="modal-content">
          <div className="modal-kicker"><MetaIcon size={14} /> {kindMeta[item.kind].label} <span /> {item.age}</div>
          <h2>{item.title}</h2>
          <p className="modal-subtitle">{item.subtitle}</p>
          <p className="modal-description">{item.description}</p>
          <div className="modal-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <div className="modal-facts"><div><span>语言</span><strong>{item.language}</strong></div><div><span>时长</span><strong>{item.duration}</strong></div><div><span>来源</span><strong>{item.source}</strong></div></div>
          <div className="modal-activity"><Sparkles size={15} /><div><span>看完之后</span><strong>{item.offlineActivity}</strong></div></div>
          <div className="modal-actions">
            <button type="button" className="button button-primary" onClick={item.localAvailable ? onLaunch : role === 'child' ? onRequest : role === 'guardian' ? onQueue : onComplete}>
              {item.localAvailable ? <><Play size={16} fill="currentColor" />播放本地资源</> : role === 'child' ? <><Play size={16} fill="currentColor" />申请观看</> : role === 'guardian' ? <><Plus size={16} />加入本周计划</> : <><FileCheck2 size={16} />加入审核</>}
            </button>
            <IconButton label={favorite ? '取消收藏' : '加入收藏'} className={'modal-favorite ' + (favorite ? 'is-favorite' : '')} onClick={onFavorite}><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /></IconButton>
            {role === 'child' && item.localAvailable && <button type="button" className="button button-quiet" onClick={onRequest}><ShieldCheck size={16} />申请授权</button>}
            {role === 'child' && <button type="button" className="button button-quiet" onClick={onComplete}><Check size={16} />标记完成</button>}
          </div>
        </div>
      </section>
    </div>
  )
}

function MediaPlayerModal({
  item,
  url,
  onClose,
}: {
  item: ContentItem
  url: string
  onClose: () => void
}) {
  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.documentElement.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div className="modal-backdrop player-backdrop" onMouseDown={onClose}>
      <section className="media-player" role="dialog" aria-modal="true" aria-label={`播放 ${item.title}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="player-heading"><div><span className="eyebrow">LOCAL LIBRARY</span><strong>{item.title}</strong></div><IconButton label="关闭播放器" onClick={onClose}><X size={18} /></IconButton></div>
        {item.kind === 'video' ? (
          <video src={url} controls autoPlay playsInline preload="metadata" />
        ) : item.kind === 'audio' ? (
          <div className="audio-player"><Headphones size={32} /><audio src={url} controls autoPlay /></div>
        ) : (
          <iframe src={url} title={item.title} />
        )}
      </section>
    </div>
  )
}

function Toast({ message, tone, onClose }: { message: string; tone: NoticeTone; onClose: () => void }) {
  return (
    <div className={'toast ' + tone}>
      {tone === 'success' ? <CircleCheck size={17} /> : tone === 'warning' ? <AlertTriangle size={17} /> : <Sparkles size={17} />}
      <span>{message}</span>
      <IconButton label="关闭提示" onClick={onClose}><X size={14} /></IconButton>
    </div>
  )
}

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>

function UpdateBanner({
  update,
  busy,
  progress,
  onInstall,
  onClose,
}: {
  update: AvailableUpdate
  busy: boolean
  progress: number | null
  onInstall: () => void
  onClose: () => void
}) {
  const automatic = update.mode === 'desktop-auto'
  const android = update.mode === 'android-manual'
  const actionLabel = automatic
    ? busy
      ? progress === null
        ? '准备更新'
        : `下载 ${progress}%`
      : '下载并安装'
    : android
      ? '获取 APK'
      : '获取安装包'
  return (
    <section className="update-banner" aria-live="polite">
      <span className="update-icon"><Download size={18} /></span>
      <div className="update-copy">
        <strong>新版本 {update.version} 可用</strong>
        <span>当前 {update.currentVersion} · {update.notes || '包含功能与稳定性更新'}</span>
        {busy && progress !== null && <div className="update-progress"><span style={{ width: `${progress}%` }} /></div>}
      </div>
      {automatic ? (
        <button type="button" className="button button-primary update-action" onClick={onInstall} disabled={busy}>
          {busy ? <RefreshCw className="spin" size={15} /> : <Download size={15} />}
          {actionLabel}
        </button>
      ) : update.artifactUrl ? (
        <a className="button button-primary update-action" href={update.artifactUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={15} />{actionLabel}
        </a>
      ) : (
        <span className="update-pending">安装包待发布</span>
      )}
      <IconButton label="稍后更新" className="update-close" onClick={onClose}><X size={15} /></IconButton>
    </section>
  )
}

function LoginScreen({
  connection,
  serverAddress,
  setupRequired,
  busy,
  error,
  onLogin,
  onRegister,
  onSetupOperator,
  onConfigure,
  onRetry,
  onClearError,
}: {
  connection: 'checking' | 'backend' | 'offline'
  serverAddress: string
  setupRequired: boolean
  busy: boolean
  error: string
  onLogin: (username: string, password: string) => Promise<void>
  onRegister: (payload: RegistrationDraft) => Promise<AccountRegistration>
  onSetupOperator: (payload: { username: string; password: string; displayName: string }) => Promise<void>
  onConfigure: (host: string) => Promise<void>
  onRetry: () => Promise<void>
  onClearError: () => void
}) {
  const [mode, setMode] = useState<'login' | 'register' | 'setup'>(setupRequired && APP_EDITION === 'server' ? 'setup' : 'login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [requestedRole, setRequestedRole] = useState<'child' | 'guardian'>('child')
  const [childAge, setChildAge] = useState('6')
  const [host, setHost] = useState(serverAddress)
  const [connectionOpen, setConnectionOpen] = useState(connection === 'offline' && !serverAddress)
  const [formError, setFormError] = useState('')
  const [registrationSent, setRegistrationSent] = useState<AccountRegistration | null>(null)

  useEffect(() => {
    setHost(serverAddress)
  }, [serverAddress])

  useEffect(() => {
    if (APP_EDITION !== 'server') return
    if (setupRequired) setMode('setup')
    else setMode((current) => current === 'setup' ? 'login' : current)
  }, [setupRequired])

  const chooseMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode)
    setFormError('')
    setRegistrationSent(null)
    onClearError()
    setPassword('')
    setConfirmPassword('')
  }

  const submitRegistration = async () => {
    if (!displayName.trim()) {
      setFormError('请输入家庭成员的显示名称')
      return
    }
    if (username.trim().length < 2 || /\s/.test(username.trim())) {
      setFormError('登录账号至少 2 个字符，且不能包含空格')
      return
    }
    if (password.length < 8) {
      setFormError('儿童或家长账户的密码至少需要 8 位')
      return
    }
    if (password !== confirmPassword) {
      setFormError('两次输入的密码不一致')
      return
    }
    if (requestedRole === 'child' && (!Number.isInteger(Number(childAge)) || Number(childAge) < 3 || Number(childAge) > 17)) {
      setFormError('儿童年龄应在 3 到 17 岁之间')
      return
    }
    setFormError('')
    try {
      const result = await onRegister({
        username: username.trim(),
        password,
        displayName: displayName.trim(),
        requestedRole,
        childAge: requestedRole === 'child' ? Number(childAge) : undefined,
      })
      setRegistrationSent(result)
    } catch {
      // Store 会在表单下方显示服务端返回的错误。
    }
  }

  const submitSetup = async () => {
    if (!displayName.trim()) {
      setFormError('请输入运维账户的显示名称')
      return
    }
    if (username.trim().length < 2 || /\s/.test(username.trim())) {
      setFormError('登录账号至少 2 个字符，且不能包含空格')
      return
    }
    if (password.length < 10) {
      setFormError('运维账户的密码至少需要 10 位')
      return
    }
    if (password !== confirmPassword) {
      setFormError('两次输入的密码不一致')
      return
    }
    setFormError('')
    try {
      await onSetupOperator({ username: username.trim(), password, displayName: displayName.trim() })
      setMode('login')
      setPassword('')
      setConfirmPassword('')
    } catch {
      // Store 会在表单下方显示服务端返回的错误。
    }
  }

  const submitLogin = async () => {
    if (username.trim().length < 2) {
      setFormError('请输入登录账号')
      return
    }
    if (password.length < 6) {
      setFormError('请输入至少 6 位的账户密码')
      return
    }
    setFormError('')
    try {
      await onLogin(username.trim(), password)
    } catch {
      // Store 会在表单下方显示服务端返回的错误。
    }
  }

  const hostStatus = APP_EDITION === 'server'
    ? connection === 'checking' ? '正在启动本机服务' : connection === 'backend' ? '本机服务已启动' : '本机服务未就绪'
    : connection === 'checking' ? '正在连接家庭主机' : connection === 'backend' ? '家庭主机已连接' : '家庭主机未连接'
  const visibleError = formError || error

  return (
    <main className={'login-shell login-edition-' + APP_EDITION}>
      <section className="login-visual" aria-hidden="true">
        <img src="/covers/photo-1502082553048-f009c37129b9.jpg" alt="" />
        <div className="login-brand"><Sparkles size={18} /><span>{PRODUCT_NAME.toUpperCase()}</span></div>
        <div className="login-message">
          <span>{APP_EDITION === 'server' ? 'HOME SERVER' : 'FAMILY SPACE'}</span>
          <strong>{APP_EDITION === 'server' ? <>把账户与内容，<br />稳稳留在家里。</> : <>把好内容留在家里，<br />把选择留给家人。</>}</strong>
        </div>
      </section>
      <section className="login-workspace">
        <div className="login-form">
          <div className={'login-host ' + connection}>
            <span><Server size={14} />{hostStatus}</span>
            {connection === 'checking' ? <RefreshCw className="spin" size={14} /> : <i />}
          </div>
          <div className="login-heading">
            <span className="eyebrow">{mode === 'register' ? 'REQUEST AN ACCOUNT' : mode === 'setup' ? 'INITIAL SETUP' : 'SECURE ACCESS'}</span>
            <h1>{mode === 'register' ? '申请家庭账户' : mode === 'setup' ? '创建运维账户' : `登录 ${PRODUCT_NAME}`}</h1>
            <p>{mode === 'register' ? '提交后由家庭运维管理员审批。' : mode === 'setup' ? '这是本机首次启动，只能创建一次。' : '使用你的账户名称和密码进入。'}</p>
          </div>
          {APP_EDITION === 'client' && (
            <div className="auth-mode-tabs" role="tablist" aria-label="账户入口">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => chooseMode('login')}>登录</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => chooseMode('register')}>注册申请</button>
            </div>
          )}

          {registrationSent ? (
            <div className="registration-success" role="status">
              <CircleCheck size={28} />
              <strong>{registrationSent.displayName}，申请已提交</strong>
              <span>登录账号：{registrationSent.username}</span>
              <span>当前状态：等待运维管理员审批</span>
              <button type="button" className="button button-primary" onClick={() => chooseMode('login')}>返回登录</button>
            </div>
          ) : (
            <form noValidate onSubmit={(event) => {
              event.preventDefault()
              if (mode === 'register') void submitRegistration()
              else if (mode === 'setup') void submitSetup()
              else void submitLogin()
            }}>
              {(mode === 'register' || mode === 'setup') && (
                <label className="login-field">
                  <span>显示名称</span>
                  <div><Users size={17} /><input aria-label="显示名称" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder={mode === 'register' ? '例如：小豆（登录后显示）' : '例如：家庭管理员'} required maxLength={100} /></div>
                  <small className="field-hint">这是界面中显示的称呼，可以使用中文。</small>
                </label>
              )}
              {mode === 'register' && (
                <div className="registration-role" role="group" aria-label="申请账户类型">
                  <button type="button" className={requestedRole === 'child' ? 'active' : ''} onClick={() => setRequestedRole('child')}>儿童账户</button>
                  <button type="button" className={requestedRole === 'guardian' ? 'active' : ''} onClick={() => setRequestedRole('guardian')}>家长账户</button>
                </div>
              )}
              {mode === 'register' && requestedRole === 'child' && (
                <label className="login-field">
                  <span>儿童年龄</span>
                  <div><Sparkles size={17} /><input aria-label="儿童年龄" type="number" min="3" max="17" value={childAge} onChange={(event) => setChildAge(event.target.value)} inputMode="numeric" required /></div>
                  <small className="field-hint">填写 3 到 17 岁，用于筛选适龄内容。</small>
                </label>
              )}
              <label className="login-field">
                <span>登录账号</span>
                <div><Users size={17} /><input aria-label="账号" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus={mode === 'login'} placeholder="至少 2 个字符，不能含空格" required minLength={2} maxLength={80} /></div>
                {mode !== 'login' && <small className="field-hint">这是以后登录时使用的账号，不等同于显示名称。</small>}
              </label>
              <label className="login-field">
                <span>密码</span>
                <div><LockKeyhole size={17} /><input aria-label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'setup' ? '至少 10 位' : mode === 'register' ? '至少 8 位' : '请输入账户密码'} required minLength={mode === 'setup' ? 10 : mode === 'register' ? 8 : 6} maxLength={256} /></div>
                {mode !== 'login' && <small className="field-hint">建议同时使用字母、数字和符号，不要与常用网站相同。</small>}
              </label>
              {(mode === 'register' || mode === 'setup') && (
                <label className="login-field">
                  <span>确认密码</span>
                  <div><LockKeyhole size={17} /><input aria-label="确认密码" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="再次输入同一密码" required minLength={mode === 'setup' ? 10 : 8} maxLength={256} /></div>
                </label>
              )}
              {visibleError && <div className="login-error" role="alert"><AlertTriangle size={15} />{visibleError}</div>}
              <button type="submit" className="button button-primary login-submit" disabled={busy}>
                {busy ? <RefreshCw className="spin" size={17} /> : mode === 'register' ? <Plus size={17} /> : <ArrowRight size={17} />}
                {busy ? '正在处理' : mode === 'register' ? '提交注册申请' : mode === 'setup' ? '创建运维账户' : '登录'}
              </button>
            </form>
          )}

          {APP_EDITION === 'client' && <div className="login-connection">
            <button type="button" className="login-server-toggle" aria-expanded={connectionOpen} onClick={() => setConnectionOpen((open) => !open)}>
              <Settings2 size={14} />
              首次连接或更换家庭主机
              <ChevronDown size={14} />
            </button>
            {connectionOpen && (
              <form className="login-server-form" onSubmit={(event) => {
                event.preventDefault()
                void onConfigure(host).then(() => setConnectionOpen(false)).catch(() => undefined)
              }}>
                <label className="login-field">
                  <span>家庭主机地址</span>
                  <div><Server size={17} /><input aria-label="家庭主机地址" value={host} onChange={(event) => setHost(event.target.value)} placeholder="例如 192.168.1.20:8000" autoComplete="url" /></div>
                </label>
                <div className="login-server-actions">
                  <button type="submit" className="button button-quiet" disabled={busy || !host.trim()}><Wifi size={15} />保存并测试</button>
                  {serverAddress && <button type="button" className="text-button" disabled={busy} onClick={() => { void onRetry().catch(() => undefined) }}>重新检测</button>}
                </div>
              </form>
            )}
          </div>}
        </div>
      </section>
    </main>
  )
}

function ConnectionView({
  address,
  connection,
  busy,
  error,
  onSave,
  onRetry,
}: {
  address: string
  connection: 'checking' | 'backend' | 'offline'
  busy: boolean
  error: string
  onSave: (host: string) => Promise<void>
  onRetry: () => Promise<void>
}) {
  const [host, setHost] = useState(address)
  useEffect(() => setHost(address), [address])
  return (
    <div className="dashboard connection-dashboard">
      <section className="page-intro">
        <div>
          <span className="eyebrow">SERVER CONNECTION</span>
          <h1>连接设置</h1>
          <p>{connection === 'backend' ? '家庭主机连接正常。' : '当前无法访问家庭主机。'}</p>
        </div>
        <span className={'connection-state ' + connection}>{connection === 'backend' ? <Wifi size={15} /> : <WifiOff size={15} />}{connection === 'backend' ? '在线' : connection === 'checking' ? '检测中' : '离线'}</span>
      </section>
      <section className="panel connection-panel">
        <div className="panel-heading"><div><span className="eyebrow">ACTIVE ENDPOINT</span><h2>家庭主机</h2></div><Server size={19} /></div>
        <form className="connection-form" onSubmit={(event) => { event.preventDefault(); void onSave(host).catch(() => undefined) }}>
          <label className="login-field">
            <span>家庭主机地址</span>
            <div><Server size={17} /><input aria-label="家庭主机地址" value={host} onChange={(event) => setHost(event.target.value)} placeholder="例如 192.168.1.20:8000" autoComplete="url" /></div>
          </label>
          {error && <div className="login-error" role="alert"><AlertTriangle size={15} />{error}</div>}
          <div className="connection-actions">
            <button type="submit" className="button button-primary" disabled={busy || !host.trim()}>{busy ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}保存并测试</button>
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => { void onRetry().catch(() => undefined) }}><RefreshCw size={16} />重新检测</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function AccountManagementView({
  registrations,
  users,
  onDecision,
  onStatus,
}: {
  registrations: AccountRegistration[]
  users: ManagedUser[]
  onDecision: (id: string, decision: 'approved' | 'rejected') => void
  onStatus: (id: string, status: ManagedUser['status']) => void
}) {
  const pending = registrations.filter((item) => item.status === 'pending')
  return (
    <div className="dashboard accounts-dashboard">
      <section className="page-intro">
        <div><span className="eyebrow">ACCOUNT CONTROL</span><h1>账户管理</h1><p>审批注册申请，管理儿童与家长账户状态。</p></div>
        <span className="count-badge">{pending.length} 个待审批</span>
      </section>
      <section className="panel accounts-panel">
        <div className="panel-heading"><div><span className="eyebrow">REGISTRATION REQUESTS</span><h2>注册申请</h2></div></div>
        <div className="account-list">
          {pending.length === 0 ? (
            <div className="empty-state"><CircleCheck size={25} /><strong>没有待审批申请</strong><span>新的注册申请会出现在这里。</span></div>
          ) : pending.map((item) => (
            <div className="account-row" key={item.id}>
              <span className="account-avatar" style={{ background: roleMeta[item.requestedRole].color }}>{accountInitial(item.displayName)}</span>
              <div className="account-copy"><strong>{item.displayName}</strong><span>{item.username} · {roleMeta[item.requestedRole].label}{item.childAge ? ` · ${item.childAge} 岁` : ''}</span></div>
              <div className="account-actions">
                <button type="button" className="button button-primary small" onClick={() => onDecision(item.id, 'approved')}><Check size={14} />批准</button>
                <button type="button" className="button button-quiet small" onClick={() => onDecision(item.id, 'rejected')}><X size={14} />拒绝</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel accounts-panel">
        <div className="panel-heading"><div><span className="eyebrow">HOUSEHOLD ACCOUNTS</span><h2>已创建账户</h2></div><span className="soft-badge">{users.length} 个</span></div>
        <div className="account-list">
          {users.map((item) => (
            <div className="account-row" key={item.id}>
              <span className="account-avatar" style={{ background: roleMeta[item.role].color }}>{accountInitial(item.displayName)}</span>
              <div className="account-copy"><strong>{item.displayName}</strong><span>{item.username} · {roleMeta[item.role].label}{item.childAge ? ` · ${item.childAge} 岁` : ''}</span></div>
              <span className={'account-status ' + item.status}>{item.status === 'active' ? '使用中' : '已停用'}</span>
              {item.role !== 'operator' && (
                <button type="button" className="button button-quiet small" onClick={() => onStatus(item.id, item.status === 'active' ? 'suspended' : 'active')}>
                  {item.status === 'active' ? <Pause size={14} /> : <Play size={14} />}{item.status === 'active' ? '停用' : '恢复'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default function App() {
  const store = useFamilyStore()
  const { state } = store
  const [activeNav, setActiveNav] = useState<NavKey>('explore')
  const [query, setQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null)
  const [playback, setPlayback] = useState<{ item: ContentItem; url: string } | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: NoticeTone } | null>(null)
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<number | null>(null)

  useEffect(() => {
    setActiveNav(state.role === 'operator' ? 'ops' : 'explore')
    setSelectedItem(null)
  }, [state.role])

  const items = store.catalog

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter((item) =>
      [item.title, item.subtitle, item.language, ...item.tags].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    )
  }, [items, query])

  const notify = (message: string, tone: NoticeTone = 'success') => {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  const reportError = (error: unknown) => {
    notify(error instanceof Error ? error.message : '操作没有完成，请稍后重试', 'warning')
  }

  const handleCheckUpdate = async (quiet = false) => {
    setUpdateBusy(true)
    try {
      const result = await checkForAppUpdate()
      if (result.status === 'available') {
        setAvailableUpdate(result)
        if (!quiet) notify(`发现新版本 ${result.version}`, 'info')
      } else if (result.status === 'unavailable') {
        setAvailableUpdate(null)
        if (!quiet) notify(result.reason, 'warning')
      } else if (!quiet) {
        setAvailableUpdate(null)
        notify(`当前 ${result.currentVersion} 已是最新版本`, 'info')
      }
    } catch (error) {
      if (!quiet) reportError(error)
    } finally {
      setUpdateBusy(false)
    }
  }

  const handleInstallUpdate = async () => {
    if (!availableUpdate || availableUpdate.mode !== 'desktop-auto') return
    setUpdateBusy(true)
    setUpdateProgress(0)
    try {
      await installDesktopUpdate(setUpdateProgress)
    } catch (error) {
      reportError(error)
      setUpdateBusy(false)
      setUpdateProgress(null)
    }
  }

  useEffect(() => {
    if (store.connection !== 'backend' || (state.role !== 'guardian' && state.role !== 'operator')) return
    const timer = window.setTimeout(() => { void handleCheckUpdate(true) }, 1200)
    return () => window.clearTimeout(timer)
    // 首次连接主机后自动检查一次，家长和运维仍可在顶部手动检查。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.connection, state.role])

  const handleRequest = (item: ContentItem) => {
    const alreadyPending = state.requests.some((request) => request.itemId === item.id && request.status === 'pending')
    if (alreadyPending) {
      notify('这个请求已经在家长的待处理列表里', 'warning')
      return
    }
    void store.addRequest({
      id: 'req-' + Date.now(),
      itemId: item.id,
      childName: store.user?.displayName ?? '',
      reason: '我想探索「' + item.title + '」',
      createdAt: '刚刚',
      status: 'pending',
    }).then(() => {
      setSelectedItem(null)
      notify('请求已送到家长端')
    }).catch(reportError)
  }

  const handleQueue = (item: ContentItem) => {
    void store.queueItem(item).then(() => {
      setSelectedItem(null)
      notify('已加入来源复核队列')
    }).catch(reportError)
  }

  const handleComplete = (item: ContentItem) => {
    void store.completeItem(item.id).then(() => {
      setSelectedItem(null)
      notify('完成记录已保存，去做一件屏幕外的小事吧', 'info')
    }).catch(reportError)
  }

  const handleSubmission = (payload: Parameters<typeof store.addSubmission>[0]) => {
    void store.addSubmission(payload)
      .then(() => notify('已放入候选箱，孩子端不会看到来源信息'))
      .catch(reportError)
  }

  const handleFavorite = (itemId: string) => {
    void store.toggleFavorite(itemId).catch(reportError)
  }

  const handleLaunch = (item: ContentItem) => {
    void store.launchContent(item.id).then((result) => {
      if (result.mode === 'local_asset' && result.url) {
        setSelectedItem(null)
        setPlayback({ item, url: result.url })
        return
      }
      notify('该内容需要在已配置的家庭媒体服务中打开', 'info')
    }).catch(reportError)
  }

  if (!store.user) {
    return (
      <LoginScreen
        connection={store.connection}
        serverAddress={store.serverAddress}
        setupRequired={store.setupRequired}
        busy={store.busy}
        error={store.authError}
        onLogin={store.login}
        onRegister={store.registerAccount}
        onSetupOperator={store.setupOperator}
        onConfigure={store.configureHost}
        onRetry={store.retryConnection}
        onClearError={store.clearAuthError}
      />
    )
  }
  const currentUser = store.user

  const renderDashboard = () => {
    if (APP_EDITION === 'client' && activeNav === 'connection') {
      return <ConnectionView address={store.serverAddress} connection={store.connection} busy={store.busy} error={store.authError} onSave={store.configureHost} onRetry={store.retryConnection} />
    }
    if (state.role === 'child' && (activeNav === 'explore' || activeNav === 'library' || activeNav === 'progress')) {
      if (activeNav === 'library') {
        return <LibraryView items={visibleItems} favoriteIds={state.favorites} onOpen={setSelectedItem} onFavorite={handleFavorite} />
      }
      if (activeNav === 'progress') {
        return <ProgressView displayName={currentUser.displayName} completedCount={state.completed.length} activeMinutes={state.activeMinutes} />
      }
      return <ChildDashboard displayName={currentUser.displayName} items={visibleItems} favoriteIds={state.favorites} completedIds={state.completed} onOpen={setSelectedItem} onFavorite={handleFavorite} />
    }
    if (state.role === 'guardian') {
      if (activeNav === 'library') return <LibraryView items={visibleItems} favoriteIds={state.favorites} onOpen={setSelectedItem} onFavorite={handleFavorite} />
      return <GuardianDashboard displayName={currentUser.displayName} items={visibleItems} requests={state.requests} submissions={state.submissions} onDecision={(id, status) => { void store.decideRequest(id, status).then(() => notify(status === 'approved' ? '已批准，孩子下次打开就能看到' : '已拒绝，并保留了这次决定', status === 'approved' ? 'success' : 'info')).catch(reportError) }} onOpen={setSelectedItem} onAddSubmission={handleSubmission} onTransfer={(id) => { void store.updateSubmission(id, 'transferred').then(() => notify('已记录转存，夜间 Worker 会在隔离区扫描')).catch(reportError) }} focus={activeNav} />
    }
    if (state.role === 'operator') {
      if (activeNav === 'library') return <LibraryView items={visibleItems} favoriteIds={state.favorites} onOpen={setSelectedItem} onFavorite={handleFavorite} />
      if (activeNav === 'accounts') return <AccountManagementView registrations={store.registrations} users={store.managedUsers} onDecision={(id, decision) => { void store.decideRegistration(id, decision).then(() => notify(decision === 'approved' ? '账户已批准并可登录' : '注册申请已拒绝', decision === 'approved' ? 'success' : 'info')).catch(reportError) }} onStatus={(id, status) => { void store.updateManagedUser(id, status).then(() => notify(status === 'active' ? '账户已恢复' : '账户已停用')).catch(reportError) }} />
      return <OperatorDashboard jobs={state.jobs} submissions={state.submissions} sources={store.sources} assets={store.assets} systemStatus={store.systemStatus} downloadsPaused={store.downloadsPaused} onJob={(id, status) => { void store.updateJob(id, status).then(() => notify(status === 'paused' ? '任务已暂停' : '任务已重新排队')).catch(reportError) }} onPauseAll={() => { void store.pauseAll().then(() => notify('所有下载任务已暂停', 'warning')).catch(reportError) }} onSync={() => { void store.syncNow().then(() => notify('同步完成，隔离区清单已刷新', 'info')).catch(reportError) }} onQueueBilibili={async (payload) => { await store.queueBilibili(payload); notify(payload.startNow ? 'B站任务已创建，将立即处理' : 'B站任务已加入夜间队列') }} onReviewAsset={async (id, payload) => { await store.reviewAsset(id, payload); notify('资源已审核入库，Client 刷新后即可访问') }} onOpen={setSelectedItem} focus={activeNav} />
    }
    return null
  }

  return (
    <div className={'app-shell role-' + state.role}>
      <Sidebar user={currentUser} connection={store.connection} activeNav={activeNav} onNav={setActiveNav} onLogout={() => { void store.logout() }} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      {mobileOpen && <button type="button" className="sidebar-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}
      <main className="main-shell">
        <Topbar user={currentUser} query={query} onQuery={setQuery} onMenu={() => setMobileOpen(true)} onLogout={() => { void store.logout() }} onCheckUpdate={() => { void handleCheckUpdate() }} updateBusy={updateBusy} />
        <div className="main-scroll">
          {availableUpdate && (
            <UpdateBanner update={availableUpdate} busy={updateBusy} progress={updateProgress} onInstall={() => { void handleInstallUpdate() }} onClose={() => setAvailableUpdate(null)} />
          )}
          {store.connection === 'offline' && (
            <div className="connection-notice">
              <WifiOff size={16} />
              <span><strong>{APP_EDITION === 'server' ? '本机服务离线' : '家庭主机离线'}</strong> {APP_EDITION === 'server' ? '请重新启动 Lumi Server，界面会自动重试。' : '当前账户数据暂时无法同步。'}</span>
              <button type="button" onClick={() => { void store.retryConnection().catch(reportError) }}>重新连接</button>
            </div>
          )}
          {query && (
            <div className="search-context">
              <span>搜索结果</span>
              <strong>{visibleItems.length} 个内容</strong>
              <button type="button" onClick={() => setQuery('')}>清除</button>
            </div>
          )}
          {renderDashboard()}
        </div>
      </main>
      {selectedItem && (
        <DetailModal
          item={selectedItem}
          role={state.role}
          favorite={state.favorites.includes(selectedItem.id)}
          onClose={() => setSelectedItem(null)}
          onFavorite={() => handleFavorite(selectedItem.id)}
          onRequest={() => handleRequest(selectedItem)}
          onComplete={() => handleComplete(selectedItem)}
          onQueue={() => handleQueue(selectedItem)}
          onLaunch={() => handleLaunch(selectedItem)}
        />
      )}
      {playback && <MediaPlayerModal item={playback.item} url={playback.url} onClose={() => setPlayback(null)} />}
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  )
}
