export type Role = 'child' | 'guardian' | 'operator'

export type ConnectionMode = 'checking' | 'backend' | 'offline'

export type ContentKind = 'video' | 'book' | 'audio' | 'game' | 'create' | 'discover'

export type PlaybackMode = 'none' | 'local_asset' | 'embed' | 'direct_stream' | 'external_link' | 'local_service'

export type NavKey =
  | 'explore'
  | 'library'
  | 'progress'
  | 'approvals'
  | 'planning'
  | 'ops'
  | 'queue'
  | 'sources'
  | 'accounts'
  | 'connection'
  | 'ops-library'
  | 'settings'

export type RequestStatus = 'pending' | 'approved' | 'rejected'

export type JobStatus = 'queued' | 'downloading' | 'review' | 'published' | 'failed' | 'paused' | 'blocked'

export interface ContentItem {
  id: string
  title: string
  subtitle: string
  kind: ContentKind
  language: string
  age: string
  duration: string
  description: string
  tags: string[]
  accent: string
  cover: string
  progress?: number
  featured?: boolean
  source?: string
  offlineActivity?: string
  localAvailable?: boolean
  playable?: boolean
  playbackMode?: PlaybackMode
  launchAllowed?: boolean
  provider?: string
}

export interface ContentRequest {
  id: string
  itemId: string
  childName: string
  reason: string
  createdAt: string
  status: RequestStatus
}

export interface DownloadJob {
  id: string
  externalId: string
  title: string
  kind: ContentKind
  status: JobStatus
  progress: number
  size: string
  source: string
  eta: string
  bytesDone: number
  expectedBytes?: number
  retryCount: number
  scheduledAt: string
  createdAt: string
  updatedAt: string
  errorCode?: string
  proofUrl?: string
}

export interface BilibiliDownloadDraft {
  url: string
  title?: string
  maxHeight: 480 | 720 | 1080
  startNow: boolean
  rightsConfirmed?: boolean
  rightsNote?: string
}

export interface CloudSubmission {
  id: string
  title: string
  source: string
  provider?: 'baidu' | 'quark' | 'creator' | 'other'
  note: string
  status: 'candidate' | 'transferred' | 'review' | 'frozen'
  createdAt: string
}

export interface SessionUser {
  id: string
  username: string
  role: Role
  displayName: string
  childAge?: number
}

export interface RegistrationDraft {
  username: string
  password: string
  displayName: string
  requestedRole: 'child' | 'guardian'
  childAge?: number
}

export interface OperatorAccountDraft {
  username: string
  password: string
  displayName: string
  recoveryQuestion: string
  recoveryAnswer: string
}

export interface OperatorRecoveryQuestion {
  username: string
  question?: string
  legacySetupRequired: boolean
}

export interface OperatorPasswordResetDraft {
  username: string
  recoveryAnswer: string
  newPassword: string
  recoveryQuestion?: string
}

export interface AccountRegistration {
  id: string
  username: string
  requestedRole: 'child' | 'guardian'
  displayName: string
  childAge?: number
  status: 'pending' | 'approved' | 'rejected'
  reviewNote: string
  reviewedAt?: string
  createdAt: string
}

export interface ManagedUser extends SessionUser {
  status: 'active' | 'suspended'
  createdAt: string
}

export interface SourceRecord {
  id: string
  name: string
  kind: string
  owner: string
  allowDownload: boolean
  reviewedAt?: string
  reviewExpireAt?: string
  disabledAt?: string
}

export interface AssetRecord {
  id: string
  provider: string
  inboundRef: string
  originalName: string
  mimeType: string
  sizeBytes: number
  scanStatus: string
  quarantineStatus: string
  reviewNote?: string
  createdAt: string
}

export interface AssetReviewDraft {
  title: string
  contentKind: 'video' | 'book' | 'audio'
  audience: 'child' | 'family' | 'adult'
  ageFrom: number
  ageTo: number
  language: string
  licenseRef: string
  reviewNote: string
  rightsConfirmed: boolean
  securityConfirmed: boolean
}

export interface SystemStatus {
  node: string
  storage: {
    totalBytes: number
    usedBytes: number
    freeBytes: number
    freeRatio: number
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

export interface StoragePaths {
  video: string
  book: string
  audio: string
  image: string
  cache: string
  inbox: string
  quarantine: string
}

export interface LibraryItemRecord {
  id: string
  title: string
  subtitle: string
  kind: 'video' | 'book' | 'audio'
  language: string
  ageFrom: number
  ageTo: number
  description: string
  tags: string[]
  coverRef?: string
  acquisitionMode: string
  publicationStatus: 'draft' | 'published' | 'archived' | string
  audience: 'child' | 'family' | 'adult' | string
  featured: boolean
  sourceId?: string
  filePath?: string
  fileSize: number
  fileAvailable: boolean
  externalUrl?: string
  updatedAt: string
}

export interface LocalImportDraft {
  sourcePath: string
  kind: 'video' | 'book' | 'audio'
  title?: string
  audience: 'child' | 'family' | 'adult'
  ageFrom: number
  ageTo: number
  language: string
  description: string
  copyToLibrary: boolean
  publish: boolean
}

export interface ExternalItemDraft {
  url: string
  provider: 'auto' | 'bilibili' | 'douyin' | 'quark' | 'direct' | 'other'
  title?: string
  kind: 'video' | 'book' | 'audio'
  coverUrl?: string
  audience: 'child' | 'family' | 'adult'
  ageFrom: number
  ageTo: number
  language: string
  description: string
}

export interface ExternalFeed {
  id: string
  name: string
  provider: string
  url: string
  cookieFile?: string
  audience: 'child' | 'family' | 'adult' | string
  ageFrom: number
  ageTo: number
  language: string
  maxItems: number
  syncIntervalHours: number
  enabled: boolean
  itemCount: number
  lastSyncedAt?: string
  lastAttemptAt?: string
  lastError?: string
}

export interface ExternalFeedDraft {
  name: string
  url: string
  cookieFile?: string
  audience: 'child' | 'family' | 'adult'
  ageFrom: number
  ageTo: number
  language: string
  maxItems: number
  syncIntervalHours: number
}

export interface LibraryScanResult {
  discovered: number
  skipped: number
  failed: number
}

export interface AppState {
  role: Role
  requests: ContentRequest[]
  jobs: DownloadJob[]
  submissions: CloudSubmission[]
  favorites: string[]
  completed: string[]
  activeMinutes: number
  lastSyncAt: string
}
