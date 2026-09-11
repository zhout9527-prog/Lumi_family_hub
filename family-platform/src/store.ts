import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  bootstrapApi,
  completeItemApi,
  disconnectBilibiliAccountApi,
  addExternalItemApi,
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
  mapBilibiliAccount,
  mapContent,
  mapExternalFeed,
  mapJob,
  mapLibraryItem,
  mapManagedUser,
  mapRegistration,
  mapRequest,
  mapSource,
  mapStoragePaths,
  mapSubmission,
  mapUser,
  operatorRecoveryQuestionApi,
  pauseAllApi,
  pauseJobApi,
  queueBilibiliApi,
  queueWatchlistApi,
  createExternalFeedApi,
  deleteExternalFeedApi,
  externalFeedsApi,
  importLocalLibraryApi,
  libraryItemsApi,
  registerAccountApi,
  registerOperatorApi,
  importBilibiliAccountApi,
  resetOperatorPasswordApi,
  resumeAllApi,
  retryJobApi,
  reviewAssetApi,
  setAuthToken,
  setApiBase,
  saveStoragePathsApi,
  scanLibraryApi,
  setupOperatorApi,
  syncInboxApi,
  systemStatusApi,
  syncExternalFeedApi,
  toggleFavoriteApi,
  updateManagedUserStatusApi,
  archiveLibraryItemApi,
  updateLibraryItemApi,
  verifyBilibiliAdultApi,
  type BootstrapPayload,
} from './api'
import { APP_EDITION, isRoleAllowed } from './edition'
import type {
  AccountRegistration,
  AppState,
  AssetRecord,
  AssetReviewDraft,
  AdultCredentials,
  BilibiliAccountStatus,
  BilibiliDownloadDraft,
  CloudSubmission,
  ConnectionMode,
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
  SessionUser,
  SourceRecord,
  StoragePaths,
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
  const [libraryItems, setLibraryItems] = useState<LibraryItemRecord[]>([])
  const [storagePaths, setStoragePaths] = useState<StoragePaths | null>(null)
  const [externalFeeds, setExternalFeeds] = useState<ExternalFeed[]>([])
  const [bilibiliAccount, setBilibiliAccount] = useState<BilibiliAccountStatus>({ connected: false, vip: false })
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
    setLibraryItems([])
    setStoragePaths(null)
    setExternalFeeds([])
    setBilibiliAccount({ connected: false, vip: false })
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
    setLibraryItems((payload.library_items ?? []).map(mapLibraryItem))
    setStoragePaths(payload.storage_paths ? mapStoragePaths(payload.storage_paths) : null)
    setExternalFeeds((payload.external_feeds ?? []).map(mapExternalFeed))
    setBilibiliAccount(mapBilibiliAccount(payload.bilibili_account))
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
    // 启动时只读取一次主机地址和已保存的会话令牌。
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
        // 短暂的轮询失败不应清掉当前有效会话。
      } finally {
        running = false
      }
    }
    const timer = window.setInterval(() => { void poll() }, 4000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
    // 轮询绑定当前运维会话，而不是绑定每次状态刷新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role])

  useEffect(() => {
    if (!user || user.role === 'operator') return
    let active = true
    let running = false
    const poll = async () => {
      if (running || document.visibilityState !== 'visible') return
      running = true
      try {
        const payload = await bootstrapApi()
        if (active) await applyBootstrap(payload, false)
      } catch {
        // Client 只在后台静默刷新，不能因为一次网络抖动打断正在播放的内容。
      } finally {
        running = false
      }
    }
    const timer = window.setInterval(() => { void poll() }, 30000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
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
      // 即使主机暂时不可用，也先清除本地会话凭据。
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

  const setupOperator = async (payload: OperatorAccountDraft) => {
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

  const registerOperator = async (payload: OperatorAccountDraft) => {
    setBusy(true)
    setAuthError('')
    try {
      await registerOperatorApi(payload)
      setConnection('backend')
    } catch (error) {
      setAuthError(messageFrom(error))
      throw error
    } finally {
      setBusy(false)
    }
  }

  const lookupOperatorRecovery = async (username: string): Promise<OperatorRecoveryQuestion> => {
    setBusy(true)
    setAuthError('')
    try {
      return await operatorRecoveryQuestionApi(username)
    } catch (error) {
      setAuthError(messageFrom(error))
      throw error
    } finally {
      setBusy(false)
    }
  }

  const recoverOperator = async (payload: OperatorPasswordResetDraft): Promise<string> => {
    setBusy(true)
    setAuthError('')
    try {
      return await resetOperatorPasswordApi(payload)
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

  const resumeAll = async () => {
    await resumeAllApi()
    setDownloadsPaused(false)
    setState((current) => ({
      ...current,
      jobs: current.jobs.map((job) =>
        job.status === 'paused' ? { ...job, status: 'queued', progress: 0, eta: '即将开始' } : job,
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

  const saveStoragePaths = async (paths: StoragePaths) => {
    setBusy(true)
    try {
      const updated = await saveStoragePathsApi(paths)
      setStoragePaths(updated)
      return updated
    } finally {
      setBusy(false)
    }
  }

  const scanLibrary = async (): Promise<LibraryScanResult> => {
    setBusy(true)
    try {
      const result = await scanLibraryApi()
      setLibraryItems(await libraryItemsApi())
      await refreshBackend()
      return result
    } finally {
      setBusy(false)
    }
  }

  const importLocalLibrary = async (payload: LocalImportDraft) => {
    setBusy(true)
    try {
      const item = await importLocalLibraryApi(payload)
      setLibraryItems((current) => [item, ...current.filter((candidate) => candidate.id !== item.id)])
      await refreshBackend()
      return item
    } finally {
      setBusy(false)
    }
  }

  const updateLibraryItem = async (id: string, changes: Record<string, unknown>) => {
    const item = await updateLibraryItemApi(id, changes)
    setLibraryItems((current) => current.map((candidate) => candidate.id === id ? item : candidate))
    await refreshBackend()
    return item
  }

  const archiveLibraryItem = async (id: string) => {
    const item = await archiveLibraryItemApi(id)
    setLibraryItems((current) => current.map((candidate) => candidate.id === id ? item : candidate))
    await refreshBackend()
    return item
  }

  const addExternalItem = async (payload: ExternalItemDraft) => {
    setBusy(true)
    try {
      const item = await addExternalItemApi(payload)
      setLibraryItems((current) => [item, ...current.filter((candidate) => candidate.id !== item.id)])
      await refreshBackend()
      return item
    } finally {
      setBusy(false)
    }
  }

  const createExternalFeed = async (payload: ExternalFeedDraft) => {
    setBusy(true)
    try {
      const feed = await createExternalFeedApi(payload)
      setExternalFeeds((current) => [feed, ...current.filter((candidate) => candidate.id !== feed.id)])
      await refreshBackend()
      return feed
    } finally {
      setBusy(false)
    }
  }

  const syncExternalFeed = async (id: string) => {
    setBusy(true)
    try {
      const feed = await syncExternalFeedApi(id)
      setExternalFeeds((current) => current.map((candidate) => candidate.id === id ? feed : candidate))
      await refreshBackend()
      return feed
    } finally {
      setBusy(false)
    }
  }

  const deleteExternalFeed = async (id: string) => {
    await deleteExternalFeedApi(id)
    setExternalFeeds((current) => current.filter((candidate) => candidate.id !== id))
  }

  const importBilibiliAccount = async (
    browser: 'edge' | 'chrome' | 'firefox',
    credentials: AdultCredentials,
  ) => {
    await verifyBilibiliAdultApi(credentials)
    const status = await importBilibiliAccountApi(browser, credentials)
    setBilibiliAccount(status)
    return status
  }

  const disconnectBilibiliAccount = async (credentials: AdultCredentials) => {
    const status = await disconnectBilibiliAccountApi(credentials)
    setBilibiliAccount(status)
    return status
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
    libraryItems,
    storagePaths,
    externalFeeds,
    bilibiliAccount,
    login,
    logout,
    registerAccount,
    setupOperator,
    registerOperator,
    lookupOperatorRecovery,
    recoverOperator,
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
    resumeAll,
    addSubmission,
    updateSubmission,
    syncNow,
    decideRegistration,
    updateManagedUser,
    saveStoragePaths,
    scanLibrary,
    importLocalLibrary,
    updateLibraryItem,
    archiveLibraryItem,
    addExternalItem,
    createExternalFeed,
    syncExternalFeed,
    deleteExternalFeed,
    importBilibiliAccount,
    disconnectBilibiliAccount,
    clearAuthError: () => setAuthError(''),
  }
}
