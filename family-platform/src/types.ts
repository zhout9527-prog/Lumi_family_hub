export type Role = 'child' | 'guardian' | 'operator'

export type ConnectionMode = 'checking' | 'backend' | 'offline'

export type ContentKind = 'video' | 'book' | 'audio' | 'game' | 'create' | 'discover'

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
  title: string
  kind: ContentKind
  status: JobStatus
  progress: number
  size: string
  source: string
  eta: string
  errorCode?: string
  proofUrl?: string
}

export interface BilibiliDownloadDraft {
  url: string
  title?: string
  maxHeight: 480 | 720 | 1080
  startNow: boolean
  rightsConfirmed: boolean
  rightsNote: string
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
  }
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
