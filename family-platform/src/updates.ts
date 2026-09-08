import { API_BASE, apiBaseOrigin, isNativeShell } from './api'

export interface ReleaseArtifact {
  url: string
  signature?: string | null
  sha256?: string | null
  size_bytes?: number | null
  content_type?: string | null
  install_mode: 'tauri' | 'manual' | 'store'
}

export interface ReleaseManifest {
  app_id: string
  channel: string
  version: string
  min_supported_version: string
  host_api_min_version?: string | null
  published_at?: string | null
  notes: string
  platforms: Record<string, ReleaseArtifact>
  tauri_platforms: Record<string, ReleaseArtifact>
  android_store_url?: string | null
}

export type UpdateCheckResult =
  | { status: 'current'; currentVersion: string; manifest: ReleaseManifest }
  | { status: 'unavailable'; currentVersion: string; reason: string; manifest: ReleaseManifest }
  | {
      status: 'available'
      currentVersion: string
      version: string
      notes: string
      mode: 'desktop-auto' | 'android-manual' | 'browser-manual'
      artifactUrl?: string
      manifest: ReleaseManifest
    }

const FALLBACK_VERSION = '0.2.0'

export function currentAppVersion(): string {
  return import.meta.env.VITE_APP_VERSION?.trim() || FALLBACK_VERSION
}

function versionParts(value: string): number[] {
  const match = value.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i)
  return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : [0, 0, 0]
}

function isNewer(candidate: string, current: string): boolean {
  const left = versionParts(candidate)
  const right = versionParts(current)
  return left.some((part, index) => part !== right[index] && part > right[index] && left.slice(0, index).every((value, i) => value === right[i]))
}

function fallbackManifest(version: string, notes: string, currentVersion: string): ReleaseManifest {
  return {
    app_id: 'cn.lumi.familyhub',
    channel: 'stable',
    version,
    min_supported_version: currentVersion,
    host_api_min_version: null,
    published_at: null,
    notes,
    platforms: {},
    tauri_platforms: {},
    android_store_url: null,
  }
}

function isAndroid(): boolean {
  return /Android/i.test(window.navigator.userAgent)
}

function absoluteArtifactUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value
  return new URL(value, apiBaseOrigin() + '/').toString()
}

function androidArtifact(manifest: ReleaseManifest): ReleaseArtifact | undefined {
  const entries = Object.entries(manifest.platforms)
  const tv = /TV|AFT|BRAVIA|SHIELD|Leanback/i.test(window.navigator.userAgent)
  const preferred = tv
    ? ['android-tv-arm64-apk', 'android-tv-universal-apk', 'android-arm64-apk', 'android-universal-apk']
    : ['android-arm64-apk', 'android-universal-apk', 'android-armv7-apk', 'android-tv-arm64-apk']
  for (const key of preferred) {
    const artifact = manifest.platforms[key]
    if (artifact) return artifact
  }
  return entries.find(([key]) => key.toLowerCase().includes('android') && key.toLowerCase().includes('apk'))?.[1]
}

async function fetchManifest(): Promise<ReleaseManifest> {
  if (!API_BASE) throw new Error('请先连接家庭主机，再检查更新')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(`${API_BASE}/updates/manifest`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`更新服务响应异常 (${response.status})`)
    return (await response.json()) as ReleaseManifest
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('检查更新超时')
    throw error instanceof Error ? error : new Error('无法检查更新')
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = currentAppVersion()
  let updaterFailed = false
  let updaterFailureReason = '桌面签名更新服务暂不可用，请检查发布端点'

  // Tauri 签名更新器仅用于桌面端。优先调用它，以便插件选择匹配系统和架构的
  // 安装包并校验签名。更新通道独立于家庭主机，主机离线时仍可获取安全更新。
  if (isNativeShell() && !isAndroid()) {
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (update) {
        const notes = update.body || '包含功能与稳定性更新'
        await update.close()
        let manifest: ReleaseManifest
        try {
          manifest = await fetchManifest()
        } catch {
          manifest = fallbackManifest(update.version, notes, currentVersion)
        }
        return {
          status: 'available',
          currentVersion: update.currentVersion || currentVersion,
          version: update.version,
          notes,
          mode: 'desktop-auto',
          manifest,
        }
      }
    } catch (error) {
      updaterFailed = true
      if (error instanceof Error && error.message) updaterFailureReason = `${updaterFailureReason}：${error.message}`
    }
  }

  let manifest: ReleaseManifest
  try {
    manifest = await fetchManifest()
  } catch (error) {
    if (updaterFailed) {
      throw new Error(`${updaterFailureReason}；家庭主机清单也无法访问`)
    }
    throw error
  }

  if (!isNewer(manifest.version, currentVersion)) {
    return { status: 'current', currentVersion, manifest }
  }

  if (isNativeShell() && !isAndroid() && updaterFailed) {
    return {
      status: 'unavailable',
      currentVersion,
      reason: `${updaterFailureReason}，暂不提供未验证的桌面安装包`,
      manifest,
    }
  }

  if (isAndroid()) {
    const artifact = androidArtifact(manifest)
    const artifactUrl = artifact?.url
      ? absoluteArtifactUrl(artifact.url)
      : manifest.android_store_url || undefined
    if (!artifactUrl) {
      return {
        status: 'unavailable',
        currentVersion,
        reason: `已发现 ${manifest.version}，但还没有发布 Android APK 或应用商店入口`,
        manifest,
      }
    }
    return {
      status: 'available',
      currentVersion,
      version: manifest.version,
      notes: manifest.notes,
      mode: 'android-manual',
      artifactUrl,
      manifest,
    }
  }

  const fallback = Object.values(manifest.tauri_platforms)[0] || Object.values(manifest.platforms)[0]
  return {
    status: 'available',
    currentVersion,
    version: manifest.version,
    notes: manifest.notes,
    mode: 'browser-manual',
    artifactUrl: fallback?.url ? absoluteArtifactUrl(fallback.url) : undefined,
    manifest,
  }
}

export async function installDesktopUpdate(onProgress?: (percent: number) => void): Promise<void> {
  if (!isNativeShell() || isAndroid()) throw new Error('此设备不支持应用内自动安装')
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check()
  if (!update) throw new Error('没有可安装的新版本')
  let downloaded = 0
  let total = 0
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') total = event.data.contentLength ?? 0
    if (event.event === 'Progress') downloaded += event.data.chunkLength
    if (event.event === 'Progress' && total > 0) onProgress?.(Math.min(99, Math.round((downloaded / total) * 100)))
    if (event.event === 'Finished') onProgress?.(100)
  })
  // Windows 会由安装程序退出；macOS/Linux 安装签名包后需要显式重启。
  try {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  } catch {
    // Windows 更新器通常会先结束当前进程。
  }
}
