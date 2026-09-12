import type {
  AccountRegistration,
  AssetRecord,
  AssetReviewDraft,
  BilibiliDownloadDraft,
  AdultCredentials,
  BilibiliAccountStatus,
  BilibiliInteractions,
  CloudSubmission,
  ContentCollection,
  ContentItem,
  ContentRequest,
  DownloadJob,
  ExternalFeed,
  ExternalFeedDraft,
  ExternalItemDraft,
  LibraryItemRecord,
  LibraryScanResult,
  LocalImportDraft,
  ManagedUser,
  OperatorAccountDraft,
  OperatorPasswordResetDraft,
  OperatorRecoveryQuestion,
  RegistrationDraft,
  Role,
  SessionUser,
  SourceRecord,
  StoragePaths,
  SystemStatus,
  PlaybackResult,
} from './types'
import { APP_EDITION } from './edition'

const TOKEN_KEY = 'lumi-family-platform-session-v1'
const API_BASE_KEY = 'lumi-family-platform-api-base-v1'
const DEFAULT_SERVER_ORIGIN = 'http://127.0.0.1:2521'

function normalizeApiBase(value: string): string {
  let normalized = value.trim()
  if (!normalized) return ''
  if (!/^https?:\/\//i.test(normalized)) normalized = `http://${normalized}`
  normalized = normalized.replace(/\/+$/, '')
  if (!/\/api\/v1$/i.test(normalized)) normalized += '/api/v1'
  return normalized
}

export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false
  const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown }
  return Boolean(tauriWindow.__TAURI_INTERNALS__) || window.location.hostname === 'tauri.localhost'
}

export async function openBilibiliLogin(browser: 'edge' | 'chrome' | 'firefox'): Promise<string> {
  const url = 'https://www.bilibili.com/'
  if (!isNativeShell()) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) throw new Error('浏览器阻止了新窗口，请允许 Lumi 打开 B站登录页')
    return 'default'
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('open_bilibili_login', { browser })
}

function defaultApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  let stored = ''
  try {
    stored = window.localStorage.getItem(API_BASE_KEY)?.trim() ?? ''
  } catch {
    stored = ''
  }
  if (configured) return normalizeApiBase(configured)
  if (stored) {
    const normalized = normalizeApiBase(stored)
    if (isNativeShell() && !/Android/i.test(window.navigator.userAgent) && /^https?:\/\/(?:127\.0\.0\.1|localhost):8000\/api\/v1$/i.test(normalized)) {
      const migrated = normalized.replace(':8000/', ':2521/')
      try {
        window.localStorage.setItem(API_BASE_KEY, migrated)
      } catch {
        // 存储不可用时仍使用本次迁移结果，避免 Windows 客户端继续连接旧端口。
      }
      return migrated
    }
    return normalized
  }
  if (isNativeShell()) {
    return /Android/i.test(window.navigator.userAgent) ? '' : `${DEFAULT_SERVER_ORIGIN}/api/v1`
  }
  return `${window.location.origin}/api/v1`
}

export let API_BASE = defaultApiBase()

function endpointLabel(): string {
  return APP_EDITION === 'server' ? '本机 Server 服务' : '家庭主机'
}

export function setApiBase(value: string): string {
  API_BASE = normalizeApiBase(value)
  try {
    if (API_BASE) window.localStorage.setItem(API_BASE_KEY, API_BASE)
    else window.localStorage.removeItem(API_BASE_KEY)
  } catch {
    // 隐私 WebView 可能禁用存储，但内存中的地址仍然立即生效。
  }
  return API_BASE
}

export function getApiBaseInput(): string {
  return API_BASE.replace(/\/api\/v1\/?$/, '')
}

export function apiBaseOrigin(): string {
  return API_BASE.replace(/\/api\/v1\/?$/, '')
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getAuthToken(): string | null {
  return window.sessionStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string | null): void {
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token)
  else window.sessionStorage.removeItem(TOKEN_KEY)
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const detail = (payload as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0]
    if (first && typeof first === 'object' && typeof (first as { msg?: unknown }).msg === 'string') {
      return (first as { msg: string }).msg
    }
  }
  return fallback
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { authenticated?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 8000)
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (options.authenticated !== false) {
    const token = getAuthToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  try {
    if (!API_BASE) throw new ApiError(0, APP_EDITION === 'server' ? '本机 Server 服务尚未就绪' : '请先设置家庭主机地址')
    // API 响应绑定账户和会话，不能让浏览器或离线壳层复用其他角色的响应。
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      throw new ApiError(response.status, errorMessage(payload, `请求失败 (${response.status})`))
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, `${endpointLabel()}响应超时`)
    }
    throw new ApiError(0, `无法连接${endpointLabel()}`)
  } finally {
    window.clearTimeout(timeout)
  }
}

interface ApiUser {
  id: string
  username: string
  role: Role
  display_name: string
  child_age?: number | null
}

interface ApiManagedUser extends ApiUser {
  status: ManagedUser['status']
  created_at: string
}

interface ApiRegistration {
  id: string
  username: string
  requested_role: AccountRegistration['requestedRole']
  display_name: string
  child_age?: number | null
  status: AccountRegistration['status']
  review_note: string
  reviewed_at?: string | null
  created_at: string
}

interface ApiContent {
  id: string
  kind: ContentItem['kind']
  title: string
  subtitle: string
  language: string
  age_from: number
  age_to: number
  duration_minutes: number
  description: string
  tags: string[]
  accent: string
  cover_ref?: string | null
  acquisition_mode: string
  offline_activity: string
  featured: boolean
  favorite: boolean
  completed: boolean
  local_available: boolean
  playable?: boolean
  playback_mode?: string
  launch_allowed?: boolean
  provider?: string
  audience: string
  collection_id?: string | null
  collection_title?: string | null
  collection_kind?: string | null
  episode_index?: number | null
  episode_count?: number | null
  section_title?: string | null
  collection_card?: boolean
}

interface ApiContentCollection {
  id: string
  title: string
  description: string
  collection_kind: string
  episode_count: number
  current_episode_index: number
  episodes: ApiContent[]
}

interface ApiContentRequest {
  id: string
  item_id: string
  requester_name: string
  reason: string
  status: ContentRequest['status']
  created_at: string
}

interface ApiSubmission {
  id: string
  title: string
  provider: CloudSubmission['provider']
  publisher_note: string
  rights_status: string
  transfer_status: string
  review_status: string
  created_at: string
}

interface ApiJob {
  id: string
  external_id: string
  title: string
  content_kind: ContentItem['kind']
  source_id: string
  stage: string
  progress: number
  bytes_done: number
  expected_bytes?: number | null
  retry_count: number
  scheduled_at: string
  created_at: string
  updated_at: string
  error_code?: string | null
  proof_url?: string | null
}

interface ApiSource {
  id: string
  name: string
  kind: string
  owner: string
  allow_download: boolean
  reviewed_at?: string | null
  review_expire_at?: string | null
  disabled_at?: string | null
}

interface ApiAsset {
  id: string
  provider: string
  inbound_ref: string
  quarantine_ref: string
  original_name: string
  mime_type: string
  size_bytes: number
  scan_status: string
  quarantine_status: string
  review_note?: string | null
  created_at: string
}

interface ApiSystemStatus {
  node: string
  storage: {
    total_bytes: number
    used_bytes: number
    free_bytes: number
    free_ratio: number
    threshold: number
  }
  services: Record<string, boolean>
  paths: {
    runtime: string
    database: string
    inbox: string
    quarantine: string
    library: string
    video?: string
    book?: string
    audio?: string
    image?: string
    cache?: string
  }
}

interface ApiStoragePaths {
  video: string
  book: string
  audio: string
  image: string
  cache: string
  inbox: string
  quarantine: string
}

interface ApiLibraryItem {
  id: string
  title: string
  subtitle: string
  kind: 'video' | 'book' | 'audio'
  language: string
  age_from: number
  age_to: number
  description: string
  tags: string[]
  cover_ref?: string | null
  acquisition_mode: string
  publication_status: string
  audience: string
  featured: boolean
  source_id?: string | null
  file_path?: string | null
  file_size: number
  file_available: boolean
  external_url?: string | null
  collection_id?: string | null
  collection_title?: string | null
  collection_kind?: string | null
  episode_index?: number | null
  episode_count?: number | null
  section_title?: string | null
  collection_card?: boolean
  updated_at: string
}

interface ApiExternalFeed {
  id: string
  name: string
  provider: string
  url: string
  cookie_file?: string | null
  audience: string
  age_from: number
  age_to: number
  language: string
  tags: string[]
  max_items: number
  sync_interval_hours: number
  enabled: boolean
  item_count: number
  last_synced_at?: string | null
  last_attempt_at?: string | null
  last_error?: string | null
}

interface ApiBilibiliAccountStatus {
  connected: boolean
  account_name?: string | null
  account_id?: string | null
  vip: boolean
  browser?: 'edge' | 'chrome' | 'firefox' | null
  updated_at?: string | null
}

export interface BootstrapPayload {
  user: ApiUser
  catalog: ApiContent[]
  active_minutes: number
  downloads_paused: boolean
  requests?: ApiContentRequest[]
  submissions?: ApiSubmission[]
  jobs?: ApiJob[]
  sources?: ApiSource[]
  assets?: ApiAsset[]
  registrations?: ApiRegistration[]
  managed_users?: ApiManagedUser[]
  library_items?: ApiLibraryItem[]
  storage_paths?: ApiStoragePaths
  external_feeds?: ApiExternalFeed[]
  bilibili_account?: ApiBilibiliAccountStatus
}

export interface HealthPayload {
  status: 'ok' | 'degraded'
  version: string
  database: string
  setup_required: boolean
}

interface LoginPayload {
  access_token: string
  user: ApiUser
}

interface ApiOperatorRecoveryQuestion {
  username: string
  question?: string | null
  legacy_setup_required: boolean
}

function shortDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '刚刚'
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatBytes(value: number): string {
  if (!value) return '待探测'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`
}

export function mapUser(user: ApiUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
    childAge: user.child_age ?? undefined,
  }
}

export function mapManagedUser(user: ApiManagedUser): ManagedUser {
  return {
    ...mapUser(user),
    status: user.status,
    createdAt: user.created_at,
  }
}

export function mapRegistration(item: ApiRegistration): AccountRegistration {
  return {
    id: item.id,
    username: item.username,
    requestedRole: item.requested_role,
    displayName: item.display_name,
    childAge: item.child_age ?? undefined,
    status: item.status,
    reviewNote: item.review_note,
    reviewedAt: item.reviewed_at ?? undefined,
    createdAt: item.created_at,
  }
}

export function mapContent(item: ApiContent): ContentItem {
  const age = item.age_from === item.age_to ? `${item.age_from} 岁` : `${item.age_from}-${item.age_to} 岁`
  const sourceLabels: Record<string, string> = {
    official_stream: '官方入口',
    owned_or_official: '家庭馆藏 / 官方来源',
    cloud_inbox: '家庭审核馆藏',
    direct_http: '开放授权来源',
    local_library: '家庭本地馆藏',
    external_bilibili: 'B站在线收藏',
    external_quark: '夸克官方分享',
    direct_stream: '开放媒体直链',
    external_link: '第三方官方页面',
  }
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    kind: item.kind,
    language: item.language,
    age,
    duration: `${item.duration_minutes} 分钟`,
    description: item.description,
    tags: item.tags,
    accent: item.accent,
    cover: item.cover_ref ?? '/covers/photo-1473445361085-b9a07f55608b.jpg',
    progress: item.completed ? 100 : undefined,
    featured: item.featured,
    source: sourceLabels[item.acquisition_mode] ?? '家庭已审核来源',
    offlineActivity: item.offline_activity,
    localAvailable: item.local_available,
    playable: item.playable ?? item.local_available,
    playbackMode: (item.playback_mode ?? (item.local_available ? 'local_asset' : 'none')) as ContentItem['playbackMode'],
    launchAllowed: item.launch_allowed ?? false,
    provider: item.provider ?? 'local',
    audience: item.audience,
    collectionId: item.collection_id ?? undefined,
    collectionTitle: item.collection_title ?? undefined,
    collectionKind: item.collection_kind ?? undefined,
    episodeIndex: item.episode_index ?? undefined,
    episodeCount: item.episode_count ?? undefined,
    sectionTitle: item.section_title ?? undefined,
    collectionCard: item.collection_card ?? false,
  }
}

export function mapStoragePaths(item: ApiStoragePaths): StoragePaths {
  return {
    video: item.video,
    book: item.book,
    audio: item.audio,
    image: item.image,
    cache: item.cache,
    inbox: item.inbox,
    quarantine: item.quarantine,
  }
}

export function mapLibraryItem(item: ApiLibraryItem): LibraryItemRecord {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    kind: item.kind,
    language: item.language,
    ageFrom: item.age_from,
    ageTo: item.age_to,
    description: item.description,
    tags: item.tags ?? [],
    coverRef: item.cover_ref ?? undefined,
    acquisitionMode: item.acquisition_mode,
    publicationStatus: item.publication_status,
    audience: item.audience,
    featured: item.featured,
    sourceId: item.source_id ?? undefined,
    filePath: item.file_path ?? undefined,
    fileSize: item.file_size,
    fileAvailable: item.file_available,
    externalUrl: item.external_url ?? undefined,
    collectionId: item.collection_id ?? undefined,
    collectionTitle: item.collection_title ?? undefined,
    collectionKind: item.collection_kind ?? undefined,
    episodeIndex: item.episode_index ?? undefined,
    episodeCount: item.episode_count ?? undefined,
    sectionTitle: item.section_title ?? undefined,
    collectionCard: item.collection_card ?? false,
    updatedAt: item.updated_at,
  }
}

export function mapExternalFeed(item: ApiExternalFeed): ExternalFeed {
  return {
    id: item.id,
    name: item.name,
    provider: item.provider,
    url: item.url,
    cookieFile: item.cookie_file ?? undefined,
    audience: item.audience,
    ageFrom: item.age_from,
    ageTo: item.age_to,
    language: item.language,
    tags: item.tags ?? [],
    maxItems: item.max_items,
    syncIntervalHours: item.sync_interval_hours,
    enabled: item.enabled,
    itemCount: item.item_count,
    lastSyncedAt: item.last_synced_at ?? undefined,
    lastAttemptAt: item.last_attempt_at ?? undefined,
    lastError: item.last_error ?? undefined,
  }
}

export function mapRequest(item: ApiContentRequest): ContentRequest {
  return {
    id: item.id,
    itemId: item.item_id,
    childName: item.requester_name,
    reason: item.reason,
    createdAt: shortDate(item.created_at),
    status: item.status,
  }
}

const providerLabels: Record<NonNullable<CloudSubmission['provider']>, string> = {
  baidu: '百度网盘',
  quark: '夸克网盘',
  creator: '创作者页面',
  other: '其他来源',
}

export function mapSubmission(item: ApiSubmission): CloudSubmission {
  const status: CloudSubmission['status'] =
    item.review_status === 'frozen' || item.review_status === 'rejected'
      ? 'frozen'
      : item.review_status === 'scanning' || item.review_status === 'review'
        ? 'review'
        : item.transfer_status === 'confirmed'
          ? 'transferred'
          : 'candidate'
  const provider = item.provider ?? 'other'
  return {
    id: item.id,
    title: item.title,
    provider,
    source: providerLabels[provider],
    note: item.publisher_note || (item.rights_status === 'claimed' ? '已附权利说明' : '等待权利说明'),
    status,
    createdAt: shortDate(item.created_at),
  }
}

export function mapJob(item: ApiJob): DownloadJob {
  const known = ['queued', 'downloading', 'review', 'published', 'failed', 'paused', 'blocked']
  const status = (known.includes(item.stage) ? item.stage : 'review') as DownloadJob['status']
  return {
    id: item.id,
    externalId: item.external_id,
    title: item.title,
    kind: item.content_kind,
    status,
    progress: item.progress,
    size: formatBytes(item.expected_bytes ?? item.bytes_done),
    source: item.source_id,
    eta: status === 'queued' ? shortDate(item.scheduled_at) : status === 'paused' ? '已暂停' : status === 'failed' ? (item.error_code ?? '下载失败') : status === 'blocked' ? '文件已冻结' : '等待复核',
    bytesDone: item.bytes_done,
    expectedBytes: item.expected_bytes ?? undefined,
    retryCount: item.retry_count,
    scheduledAt: item.scheduled_at,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    errorCode: item.error_code ?? undefined,
    proofUrl: item.proof_url ?? undefined,
  }
}

export function mapSource(item: ApiSource): SourceRecord {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    owner: item.owner,
    allowDownload: item.allow_download,
    reviewedAt: item.reviewed_at ?? undefined,
    reviewExpireAt: item.review_expire_at ?? undefined,
    disabledAt: item.disabled_at ?? undefined,
  }
}

export function mapAsset(item: ApiAsset): AssetRecord {
  return {
    id: item.id,
    provider: item.provider,
    inboundRef: item.inbound_ref,
    quarantineRef: item.quarantine_ref,
    originalName: item.original_name,
    mimeType: item.mime_type,
    sizeBytes: item.size_bytes,
    scanStatus: item.scan_status,
    quarantineStatus: item.quarantine_status,
    reviewNote: item.review_note ?? undefined,
    createdAt: item.created_at,
  }
}

export function mapSystemStatus(item: ApiSystemStatus): SystemStatus {
  return {
    node: item.node,
    storage: {
      totalBytes: item.storage.total_bytes,
      usedBytes: item.storage.used_bytes,
      freeBytes: item.storage.free_bytes,
      freeRatio: item.storage.free_ratio,
      threshold: item.storage.threshold,
    },
    services: item.services,
    paths: item.paths,
  }
}

export async function healthApi(): Promise<HealthPayload> {
  return apiRequest<HealthPayload>('/health', {}, { authenticated: false, timeoutMs: 2500 })
}

export async function probeApi(): Promise<boolean> {
  try {
    await healthApi()
    return true
  } catch {
    return false
  }
}

export async function loginApi(username: string, password: string): Promise<LoginPayload> {
  return apiRequest<LoginPayload>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        device_name: APP_EDITION === 'server' ? 'lumi-server' : 'lumi-client',
        app_edition: APP_EDITION,
      }),
    },
    { authenticated: false },
  )
}

export async function registerAccountApi(payload: RegistrationDraft): Promise<AccountRegistration> {
  const result = await apiRequest<ApiRegistration>(
    '/auth/registrations',
    {
      method: 'POST',
      body: JSON.stringify({
        username: payload.username,
        password: payload.password,
        display_name: payload.displayName,
        requested_role: payload.requestedRole,
        child_age: payload.requestedRole === 'child' ? payload.childAge : null,
      }),
    },
    { authenticated: false },
  )
  return mapRegistration(result)
}

function operatorAccountBody(payload: OperatorAccountDraft) {
  return {
    username: payload.username,
    password: payload.password,
    display_name: payload.displayName,
    recovery_question: payload.recoveryQuestion,
    recovery_answer: payload.recoveryAnswer,
  }
}

export async function setupOperatorApi(payload: OperatorAccountDraft): Promise<SessionUser> {
  const result = await apiRequest<ApiUser>(
    '/auth/operator-setup',
    {
      method: 'POST',
      body: JSON.stringify(operatorAccountBody(payload)),
    },
    { authenticated: false },
  )
  return mapUser(result)
}

export async function registerOperatorApi(payload: OperatorAccountDraft): Promise<SessionUser> {
  const result = await apiRequest<ApiUser>(
    '/auth/operators',
    { method: 'POST', body: JSON.stringify(operatorAccountBody(payload)) },
    { authenticated: false },
  )
  return mapUser(result)
}

export async function operatorRecoveryQuestionApi(username: string): Promise<OperatorRecoveryQuestion> {
  const result = await apiRequest<ApiOperatorRecoveryQuestion>(
    '/auth/operator-recovery/question',
    { method: 'POST', body: JSON.stringify({ username }) },
    { authenticated: false },
  )
  return {
    username: result.username,
    question: result.question ?? undefined,
    legacySetupRequired: result.legacy_setup_required,
  }
}

export async function resetOperatorPasswordApi(payload: OperatorPasswordResetDraft): Promise<string> {
  const result = await apiRequest<{ message: string }>(
    '/auth/operator-recovery/reset',
    {
      method: 'POST',
      body: JSON.stringify({
        username: payload.username,
        recovery_answer: payload.recoveryAnswer,
        new_password: payload.newPassword,
        recovery_question: payload.recoveryQuestion ?? null,
      }),
    },
    { authenticated: false },
  )
  return result.message
}

export async function logoutApi(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' })
}

export async function bootstrapApi(): Promise<BootstrapPayload> {
  return apiRequest<BootstrapPayload>('/bootstrap')
}

export async function createRequestApi(itemId: string, reason: string): Promise<ApiContentRequest> {
  return apiRequest<ApiContentRequest>('/content-requests', {
    method: 'POST',
    body: JSON.stringify({ item_id: itemId, purpose: 'watch', reason }),
  })
}

export async function decideRequestApi(id: string, decision: ContentRequest['status']): Promise<ApiContentRequest> {
  if (decision === 'pending') throw new ApiError(400, '无效的审批状态')
  return apiRequest<ApiContentRequest>(`/guardian/content-requests/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, scope: 'week' }),
  })
}

export async function toggleFavoriteApi(itemId: string): Promise<{ favorite: boolean }> {
  return apiRequest(`/catalog/${encodeURIComponent(itemId)}/favorite`, { method: 'POST' })
}

export async function completeItemApi(itemId: string): Promise<void> {
  await apiRequest(`/catalog/${encodeURIComponent(itemId)}/complete`, {
    method: 'POST',
    body: JSON.stringify({ seconds: 480 }),
  })
}

export async function queueWatchlistApi(itemId: string): Promise<ApiJob> {
  return apiRequest<ApiJob>(`/guardian/watchlist/${encodeURIComponent(itemId)}/queue`, { method: 'POST' })
}

export async function createSubmissionApi(payload: {
  title: string
  provider: NonNullable<CloudSubmission['provider']>
  url: string
  rightsNote: string
}): Promise<ApiSubmission> {
  return apiRequest<ApiSubmission>('/community-submissions', {
    method: 'POST',
    body: JSON.stringify({
      title: payload.title,
      provider: payload.provider,
      original_url: payload.url,
      publisher_note: '由家长提交，等待在官方客户端预览并人工转存。',
      rights_note: payload.rightsNote,
    }),
  })
}

export async function confirmTransferApi(id: string, provider: NonNullable<CloudSubmission['provider']>): Promise<void> {
  await apiRequest(`/guardian/community-submissions/${encodeURIComponent(id)}/confirm-transfer`, {
    method: 'POST',
    body: JSON.stringify({ confirmed: true, provider }),
  })
}

export async function pauseJobApi(id: string): Promise<ApiJob> {
  return apiRequest<ApiJob>(`/ops/jobs/${encodeURIComponent(id)}/pause`, { method: 'POST' })
}

export async function retryJobApi(id: string): Promise<ApiJob> {
  return apiRequest<ApiJob>(`/ops/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' })
}

export async function queueBilibiliApi(payload: BilibiliDownloadDraft): Promise<ApiJob> {
  return apiRequest<ApiJob>('/ops/downloads/bilibili', {
    method: 'POST',
    body: JSON.stringify({
      url: payload.url,
      title: payload.title || null,
      max_height: payload.maxHeight,
      start_now: payload.startNow,
      rights_confirmed: payload.rightsConfirmed ?? true,
      rights_note: payload.rightsNote?.trim() || '由家庭运维管理员提交，仅用于有权保存的家庭离线观看内容',
    }),
  })
}

export async function reviewAssetApi(id: string, payload: AssetReviewDraft): Promise<ApiAsset> {
  return apiRequest<ApiAsset>(`/ops/cloud-inbox/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    body: JSON.stringify({
      decision: 'approved',
      rights_confirmed: payload.rightsConfirmed,
      security_confirmed: payload.securityConfirmed,
      review_note: payload.reviewNote,
      title: payload.title,
      content_kind: payload.contentKind,
      audience: payload.audience,
      age_from: payload.ageFrom,
      age_to: payload.ageTo,
      language: payload.language,
      tags: payload.tags,
      license_ref: payload.licenseRef?.trim() || null,
    }),
  })
}

export async function launchContentApi(id: string): Promise<PlaybackResult> {
  const result = await apiRequest<{ mode: string; url?: string; service?: string; quality?: string; expires_at?: string }>(
    `/catalog/${encodeURIComponent(id)}/launch`,
    { method: 'POST' },
    { timeoutMs: 60000 },
  )
  if (result.url?.startsWith('/')) result.url = apiBaseOrigin() + result.url
  return { ...result, expiresAt: result.expires_at }
}

export async function contentCollectionApi(id: string): Promise<ContentCollection> {
  const result = await apiRequest<ApiContentCollection>(`/catalog/${encodeURIComponent(id)}/collection`)
  return {
    id: result.id,
    title: result.title,
    description: result.description,
    collectionKind: result.collection_kind,
    episodeCount: result.episode_count,
    currentEpisodeIndex: result.current_episode_index,
    episodes: result.episodes.map(mapContent),
  }
}

export function mapBilibiliAccount(item?: ApiBilibiliAccountStatus): BilibiliAccountStatus {
  return {
    connected: Boolean(item?.connected),
    accountName: item?.account_name ?? undefined,
    accountId: item?.account_id ?? undefined,
    vip: Boolean(item?.vip),
    browser: item?.browser ?? undefined,
    updatedAt: item?.updated_at ?? undefined,
  }
}

function adultCredentialBody(credentials: AdultCredentials) {
  return { username: credentials.username, password: credentials.password }
}

export async function verifyBilibiliAdultApi(credentials: AdultCredentials): Promise<string> {
  const result = await apiRequest<{ message: string }>('/ops/bilibili-account/verify', {
    method: 'POST',
    body: JSON.stringify(adultCredentialBody(credentials)),
  })
  return result.message
}

export async function importBilibiliAccountApi(
  browser: 'edge' | 'chrome' | 'firefox',
  credentials: AdultCredentials,
): Promise<BilibiliAccountStatus> {
  const result = await apiRequest<ApiBilibiliAccountStatus>('/ops/bilibili-account/import', {
    method: 'POST',
    body: JSON.stringify({ ...adultCredentialBody(credentials), browser }),
  }, { timeoutMs: 60000 })
  return mapBilibiliAccount(result)
}

export async function switchBilibiliAccountApi(
  browser: 'edge' | 'chrome' | 'firefox',
  credentials: AdultCredentials,
): Promise<BilibiliAccountStatus> {
  const result = await apiRequest<ApiBilibiliAccountStatus>('/ops/bilibili-account/switch', {
    method: 'POST',
    body: JSON.stringify({ ...adultCredentialBody(credentials), browser }),
  }, { timeoutMs: 60000 })
  return mapBilibiliAccount(result)
}

export async function disconnectBilibiliAccountApi(credentials: AdultCredentials): Promise<BilibiliAccountStatus> {
  const result = await apiRequest<ApiBilibiliAccountStatus>('/ops/bilibili-account/disconnect', {
    method: 'POST',
    body: JSON.stringify(adultCredentialBody(credentials)),
  })
  return mapBilibiliAccount(result)
}

export async function contentInteractionsApi(id: string): Promise<BilibiliInteractions> {
  return apiRequest<BilibiliInteractions>(`/catalog/${encodeURIComponent(id)}/interactions`, {}, { timeoutMs: 45000 })
}

export async function pauseAllApi(): Promise<void> {
  await apiRequest('/ops/downloads/pause-all', { method: 'POST' })
}

export async function resumeAllApi(): Promise<void> {
  await apiRequest('/ops/downloads/resume-all', { method: 'POST' })
}

export async function syncInboxApi(): Promise<void> {
  await apiRequest('/ops/cloud-inbox/sync', { method: 'POST' })
}

export async function systemStatusApi(): Promise<SystemStatus> {
  return mapSystemStatus(await apiRequest<ApiSystemStatus>('/ops/system-status'))
}

export async function decideRegistrationApi(
  id: string,
  decision: 'approved' | 'rejected',
  reviewNote = '',
): Promise<AccountRegistration> {
  const result = await apiRequest<ApiRegistration>(
    `/ops/account-registrations/${encodeURIComponent(id)}/decision`,
    { method: 'POST', body: JSON.stringify({ decision, review_note: reviewNote }) },
  )
  return mapRegistration(result)
}

export async function updateManagedUserStatusApi(
  id: string,
  status: ManagedUser['status'],
): Promise<ManagedUser> {
  const result = await apiRequest<ApiManagedUser>(
    `/ops/users/${encodeURIComponent(id)}/status`,
    { method: 'POST', body: JSON.stringify({ status }) },
  )
  return mapManagedUser(result)
}

export async function storagePathsApi(): Promise<StoragePaths> {
  return mapStoragePaths(await apiRequest<ApiStoragePaths>('/ops/storage-paths'))
}

export async function saveStoragePathsApi(paths: StoragePaths): Promise<StoragePaths> {
  return mapStoragePaths(await apiRequest<ApiStoragePaths>('/ops/storage-paths', {
    method: 'PUT',
    body: JSON.stringify(paths),
  }))
}

export async function libraryItemsApi(): Promise<LibraryItemRecord[]> {
  return (await apiRequest<ApiLibraryItem[]>('/ops/library')).map(mapLibraryItem)
}

export async function scanLibraryApi(): Promise<LibraryScanResult> {
  return apiRequest<LibraryScanResult>('/ops/library/scan', { method: 'POST' })
}

export async function importLocalLibraryApi(payload: LocalImportDraft): Promise<LibraryItemRecord> {
  return mapLibraryItem(await apiRequest<ApiLibraryItem>('/ops/library/import', {
    method: 'POST',
    body: JSON.stringify({
      source_path: payload.sourcePath,
      kind: payload.kind,
      title: payload.title?.trim() || null,
      audience: payload.audience,
      age_from: payload.ageFrom,
      age_to: payload.ageTo,
      language: payload.language,
      description: payload.description,
      tags: payload.tags,
      copy_to_library: payload.copyToLibrary,
      publish: payload.publish,
    }),
  }))
}

export async function updateLibraryItemApi(id: string, changes: Record<string, unknown>): Promise<LibraryItemRecord> {
  return mapLibraryItem(await apiRequest<ApiLibraryItem>(`/ops/library/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  }))
}

export async function archiveLibraryItemApi(id: string): Promise<LibraryItemRecord> {
  return mapLibraryItem(await apiRequest<ApiLibraryItem>(`/ops/library/${encodeURIComponent(id)}`, { method: 'DELETE' }))
}

export async function refreshExternalItemApi(id: string): Promise<LibraryItemRecord> {
  return mapLibraryItem(await apiRequest<ApiLibraryItem>(
    `/ops/library/${encodeURIComponent(id)}/refresh-metadata`,
    { method: 'POST' },
    { timeoutMs: 60000 },
  ))
}

export async function deleteExternalItemApi(id: string): Promise<void> {
  await apiRequest<void>(`/ops/library/${encodeURIComponent(id)}/permanent`, { method: 'DELETE' })
}

export async function deleteExternalCollectionApi(id: string): Promise<void> {
  await apiRequest(`/ops/library/collections/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function addExternalItemApi(payload: ExternalItemDraft): Promise<LibraryItemRecord> {
  return mapLibraryItem(await apiRequest<ApiLibraryItem>('/ops/library/external', {
    method: 'POST',
    body: JSON.stringify({
      url: payload.url,
      provider: payload.provider,
      title: payload.title?.trim() || null,
      kind: payload.kind,
      cover_url: payload.coverUrl?.trim() || null,
      audience: payload.audience,
      age_from: payload.ageFrom,
      age_to: payload.ageTo,
      language: payload.language,
      description: payload.description,
      tags: payload.tags,
    }),
  }, { timeoutMs: 60000 }))
}

export async function externalFeedsApi(): Promise<ExternalFeed[]> {
  return (await apiRequest<ApiExternalFeed[]>('/ops/external-feeds')).map(mapExternalFeed)
}

export async function createExternalFeedApi(payload: ExternalFeedDraft): Promise<ExternalFeed> {
  return mapExternalFeed(await apiRequest<ApiExternalFeed>('/ops/external-feeds', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      url: payload.url,
      cookie_file: payload.cookieFile?.trim() || null,
      audience: payload.audience,
      age_from: payload.ageFrom,
      age_to: payload.ageTo,
      language: payload.language,
      tags: payload.tags,
      max_items: payload.maxItems,
      sync_interval_hours: payload.syncIntervalHours,
    }),
  }, { timeoutMs: 60000 }))
}

export async function syncExternalFeedApi(id: string): Promise<ExternalFeed> {
  return mapExternalFeed(await apiRequest<ApiExternalFeed>(`/ops/external-feeds/${encodeURIComponent(id)}/sync`, {
    method: 'POST',
  }, { timeoutMs: 60000 }))
}

export async function deleteExternalFeedApi(id: string): Promise<void> {
  await apiRequest<void>(`/ops/external-feeds/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
