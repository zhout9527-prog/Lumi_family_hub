import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  bootstrapApi,
  completeItemApi,
  confirmTransferApi,
  createRequestApi,
  createSubmissionApi,
  decideRegistrationApi,
  decideRequestApi,
  getAuthToken,
  getApiBaseInput,
  healthApi,
  loginApi,
  launchContentApi,
  logoutApi,
  mapAsset,
  mapContent,
  mapJob,
  mapManagedUser,
  mapRegistration,
  mapRequest,
  mapSource,
  mapSubmission,
  mapUser,
  pauseAllApi,
  pauseJobApi,
  queueBilibiliApi,
  queueWatchlistApi,
  registerAccountApi,
  retryJobApi,
  reviewAssetApi,
  setAuthToken,
  setApiBase,
  setupOperatorApi,
  syncInboxApi,
  systemStatusApi,
  toggleFavoriteApi,
  updateManagedUserStatusApi,
  type BootstrapPayload,
} from './api'
import { APP_EDITION, isRoleAllowed } from './edition'
import type {
  AccountRegistration,
  AppState,
  AssetRecord,
  AssetReviewDraft,
  BilibiliDownloadDraft,
  CloudSubmission,
  ConnectionMode,
  ContentItem,
  ContentRequest,
  DownloadJob,
  ManagedUser,
  RegistrationDraft,
  SessionUser,
  SourceRecord,
  SystemStatus,
} from './types'

const defaultState: AppState = {
  role: APP_EDITION === 'server' ? 'operator' : 'child',
  requests: [],
  jobs: [],
  submissions: [],
  favorites: [],
  completed: [],
  activeMinutes: 0,
  lastSyncAt: '尚未同步',
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return '操作没有完成，请稍后重试'
}

export function useFamilyStore() {
  const [state, setState] = useState<AppState>(defaultState)
  const [catalog, setCatalog] = useState<ContentItem[]>([])
  const [connection, setConnection] = useState<ConnectionMode>('checking')
  const [serverAddress, setServerAddress] = useState(getApiBaseInput())
  const [setupRequired, setSetupRequired] = useState(false)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [authError, setAuthError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sources, setSources] = useState<SourceRecord[]>([])
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [downloadsPaused, setDownloadsPaused] = useState(false)
  const [registrations, setRegistrations] = useState<AccountRegistration[]>([])
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const authTransition = useRef<Promise<void>>(Promise.resolve())

  const clearSessionState = () => {
    setAuthToken(null)
    setUser(null)
    setCatalog([])
    setSources([])
    setAssets([])
    setSystemStatus(null)
    setRegistrations([])
    setManagedUsers([])
    setState(defaultState)
  }

  const applyBootstrap = async (payload: BootstrapPayload, refreshSystemStatus = true) => {
    const mappedUser = mapUser(payload.user)
    if (!isRoleAllowed(mappedUser.role)) {
      throw new ApiError(
        403,
        APP_EDITION === 'server' ? '儿童和家长账号请使用 Lumi Client' : '运维账号只能登录 Lumi Server',
      )
    }
    const mappedCatalog = payload.catalog.map(mapContent)
    setCatalog(mappedCatalog)
    setUser(mappedUser)
    setSources((payload.sources ?? []).map(mapSource))
    setAssets((payload.assets ?? []).map(mapAsset))
    setRegistrations((payload.registrations ?? []).map(mapRegistration))
    setManagedUsers((payload.managed_users ?? []).map(mapManagedUser))
    setDownloadsPaused(payload.downloads_paused)
    setState({
      role: mappedUser.role,
      requests: (payload.requests ?? []).map(mapRequest),
      jobs: (payload.jobs ?? []).map(mapJob),
      submissions: (payload.submissions ?? []).map(mapSubmission),
      favorites: payload.catalog.filter((item) => item.favorite).map((item) => item.id),
      completed: payload.catalog.filter((item) => item.completed).map((item) => item.id),
      activeMinutes: payload.active_minutes,
      lastSyncAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    })
    if (mappedUser.role === 'operator' && refreshSystemStatus) {
      try {
        setSystemStatus(await systemStatusApi())
      } catch {
        setSystemStatus(null)
      }
    } else if (mappedUser.role !== 'operator') {
      setSystemStatus(null)
    }
  }

  const refreshBackend = async () => {
    const payload = await bootstrapApi()
    await applyBootstrap(payload)
    setConnection('backend')
  }

  useEffect(() => {
    let active = true
    void (async () => {
      const attempts = APP_EDITION === 'server' ? 24 : 1
      for (let attempt = 0; attempt < attempts && active; attempt += 1) {
        try {
          const health = await healthApi()
          if (!active) return
          setConnection('backend')
          setSetupRequired(health.setup_required)
          if (!getAuthToken()) return
          try {
            await applyBootstrap(await bootstrapApi())
          } catch {
            clearSessionState()
          }
          return
        } catch {
          if (attempt + 1 < attempts) {
            await new Promise((resolve) => window.setTimeout(resolve, 500))
          }
        }
      }
      if (active) setConnection('offline')
    })()
    return () => {
      active = false
    }
    // 主机地址和已保存令牌只在启动时读取一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (user?.role !== 'operator') return
    let active = true
    let running = false
    const poll = async () => {
      if (running || document.visibilityState !== 'visible') return
      running = true
      try {
        const payload = await bootstrapApi()
        if (active) await applyBootstrap(payload, false)
      } catch {
        // 短暂的轮询失败不应清除当前会话。
      } finally {
        running = false
      }
    }
    const timer = window.setInterval(() => { void poll() }, 4000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
    // 轮询跟随已认证的运维账户，不随每次状态刷新重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role])

  const login = async (username: string, password: string) => {
    setBusy(true)
    setAuthError('')
    try {
      await authTransition.current
      const session = await loginApi(username, password)
      if (!isRoleAllowed(session.user.role)) {
        throw new ApiError(403, APP_EDITION === 'server' ? '请使用运维账号登录' : '请使用儿童或家长账号登录')
      }
      setAuthToken(session.access_token)
      await applyBootstrap(await bootstrapApi())
      setConnection('backend')
    } catch (error) {
      clearSessionState()
      setAuthError(messageFrom(error))
      throw error
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    const request = getAuthToken() ? logoutApi() : Promise.resolve()
    clearSessionState()
    setAuthError('')
    const transition = request.catch(() => {
      // 即使主机不可用，也要清除本地凭据。
    })
    authTransition.current = transition
    await transition
  }

  const registerAccount = async (payload: RegistrationDraft): Promise<AccountRegistration> => {
    setBusy(true)
    setAuthError('')
    try {
      const registration = await registerAccountApi(payload)
      setConnection('backend')
      return registration
    } catch (error) {
      setAuthError(messageFrom(error))
      throw error
    } finally {
      setBusy(false)
    }
  }

  const setupOperator = async (payload: { username: string; password: string; displayName: string }) => {
    setBusy(true)
    setAuthError('')
    try {
      await setupOperatorApi(payload)
      setSetupRequired(false)
      setConnection('backend')
    } catch (error) {
      setAuthError(messageFrom(error))
      throw error
    } finally {
      setBusy(false)
    }
  }

  const retryConnection = async () => {
    setConnection('checking')
    try {
      const health = await healthApi()
      setSetupRequired(health.setup_required)
      setConnection('backend')
      if (getAuthToken()) await refreshBackend()
    } catch (error) {
      setConnection('offline')
      throw new ApiError(0, messageFrom(error))
    }
  }

  const configureHost = async (host: string) => {
    setBusy(true)
    setAuthError('')
    const previousAddress = getApiBaseInput()
    const hadUser = Boolean(user)
    try {
      setApiBase(host)
      setServerAddress(getApiBaseInput())
      const health = await healthApi()
      setSetupRequired(health.setup_required)
      setConnection('backend')
      if (getApiBaseInput() !== previousAddress) clearSessionState()
      else if (getAuthToken()) await refreshBackend()
    } catch (error) {
      if (hadUser) {
        setApiBase(previousAddress)
        setServerAddress(previousAddress)
        setConnection('backend')
      } else {
        setConnection('offline')
      }
      setAuthError(messageFrom(error))
      throw error
    } finally {
      setBusy(false)
    }
  }

  const decideRequest = async (id: string, status: ContentRequest['status']) => {
    const updated = mapRequest(await decideRequestApi(id, status))
    setState((current) => ({
      ...current,
      requests: current.requests.map((request) => request.id === id ? updated : request),
    }))
  }

  const addRequest = async (request: ContentRequest) => {
    const created = mapRequest(await createRequestApi(request.itemId, request.reason))
    setState((current) => ({ ...current, requests: [created, ...current.requests] }))
  }

  const toggleFavorite = async (itemId: string) => {
    const wasFavorite = state.favorites.includes(itemId)
    setState((current) => ({
      ...current,
      favorites: wasFavorite ? current.favorites.filter((id) => id !== itemId) : [...current.favorites, itemId],
    }))
    try {
      const result = await toggleFavoriteApi(itemId)
      setState((current) => ({
        ...current,
        favorites: result.favorite
          ? Array.from(new Set([...current.favorites, itemId]))
          : current.favorites.filter((id) => id !== itemId),
      }))
    } catch (error) {
      setState((current) => ({
        ...current,
        favorites: wasFavorite
          ? Array.from(new Set([...current.favorites, itemId]))
          : current.favorites.filter((id) => id !== itemId),
      }))
      throw error
    }
  }

  const completeItem = async (itemId: string) => {
    await completeItemApi(itemId)
    setState((current) => ({
      ...current,
      completed: current.completed.includes(itemId) ? current.completed : [...current.completed, itemId],
      activeMinutes: current.activeMinutes + 8,
    }))
  }

  const updateJob = async (id: string, status: DownloadJob['status']) => {
    const updated = status === 'paused' ? mapJob(await pauseJobApi(id)) : mapJob(await retryJobApi(id))
    setState((current) => ({
      ...current,
      jobs: current.jobs.map((job) => job.id === id ? updated : job),
    }))
  }

  const queueItem = async (item: ContentItem) => {
    const job = mapJob(await queueWatchlistApi(item.id))
    setState((current) => ({
      ...current,
      jobs: [job, ...current.jobs.filter((candidate) => candidate.id !== job.id)],
    }))
  }

  const queueBilibili = async (payload: BilibiliDownloadDraft) => {
    const job = mapJob(await queueBilibiliApi(payload))
    setState((current) => ({
      ...current,
      jobs: [job, ...current.jobs.filter((candidate) => candidate.id !== job.id)],
    }))
    return job
  }

  const reviewAsset = async (id: string, payload: AssetReviewDraft) => {
    await reviewAssetApi(id, payload)
    await refreshBackend()
  }

  const launchContent = async (id: string) => launchContentApi(id)

  const pauseAll = async () => {
    await pauseAllApi()
    setDownloadsPaused(true)
    setState((current) => ({
      ...current,
      jobs: current.jobs.map((job) =>
        job.status === 'queued' || job.status === 'downloading' ? { ...job, status: 'paused', eta: '已暂停' } : job,
      ),
    }))
  }

  const addSubmission = async (payload: {
    title: string
    provider: NonNullable<CloudSubmission['provider']>
    url: string
    rightsNote: string
  }) => {
    const submission = mapSubmission(await createSubmissionApi(payload))
    setState((current) => ({ ...current, submissions: [submission, ...current.submissions] }))
  }

  const updateSubmission = async (id: string, status: CloudSubmission['status']) => {
    const submission = state.submissions.find((item) => item.id === id)
    if (status === 'transferred') await confirmTransferApi(id, submission?.provider ?? 'other')
    setState((current) => ({
      ...current,
      submissions: current.submissions.map((item) => item.id === id ? { ...item, status } : item),
    }))
  }

  const syncNow = async () => {
    await syncInboxApi()
    await refreshBackend()
  }

  const decideRegistration = async (id: string, decision: 'approved' | 'rejected') => {
    const updated = await decideRegistrationApi(id, decision)
    setRegistrations((current) => current.map((item) => item.id === id ? updated : item))
    if (decision === 'approved') await refreshBackend()
  }

  const updateManagedUser = async (id: string, status: ManagedUser['status']) => {
    const updated = await updateManagedUserStatusApi(id, status)
    setManagedUsers((current) => current.map((item) => item.id === id ? updated : item))
  }

  return {
    state,
    catalog,
    connection,
    serverAddress,
    setupRequired,
    user,
    authError,
    busy,
    sources,
    assets,
    systemStatus,
    downloadsPaused,
    registrations,
    managedUsers,
    login,
    logout,
    registerAccount,
    setupOperator,
    retryConnection,
    configureHost,
    refreshBackend,
    decideRequest,
    addRequest,
    toggleFavorite,
    completeItem,
    updateJob,
    queueItem,
    queueBilibili,
    reviewAsset,
    launchContent,
    pauseAll,
    addSubmission,
    updateSubmission,
    syncNow,
    decideRegistration,
    updateManagedUser,
    clearAuthError: () => setAuthError(''),
  }
}
