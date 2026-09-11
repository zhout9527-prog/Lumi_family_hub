import { chromium } from 'playwright-core'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.FAMILYHUB_COLLECTION_E2E_URL ?? 'http://127.0.0.1:4185'

function check(condition, message) {
  if (!condition) throw new Error(message)
}

const content = (id, index, title) => ({
  id,
  kind: 'video',
  title,
  subtitle: `自然课合集 · 第 ${index} 集`,
  language: '中文',
  age_from: 4,
  age_to: 12,
  duration_minutes: 5,
  description: '合集分集',
  tags: ['B站', '合集'],
  accent: '#5e9b8d',
  cover_ref: null,
  acquisition_mode: 'external_bilibili',
  publication_status: 'published',
  audience: 'family',
  stimulation_level: 'reviewed',
  offline_activity: '和家人聊一聊',
  featured: false,
  favorite: false,
  completed: false,
  local_available: false,
  playable: true,
  playback_mode: 'direct_stream',
  launch_allowed: true,
  provider: 'bilibili',
  collection_id: 'collection-e2e',
  collection_title: '自然课合集',
  collection_kind: 'ugc_season',
  episode_index: index,
  episode_count: 2,
  section_title: '第一章',
})

const first = content('episode-1', 1, '认识天空')
const second = content('episode-2', 2, '认识海洋')
const browser = await chromium.launch({ executablePath: edgePath, headless: true })
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 16; 24129PN74C) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36',
  })
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/health')) return json({ status: 'ok', version: 'test', setup_required: false })
    if (path.endsWith('/auth/login')) return json({ access_token: 'e2e-token', token_type: 'bearer', expires_at: '2099-01-01T00:00:00Z', user: { id: 'guardian', username: 'guardian-demo', role: 'guardian', display_name: '家长' } })
    if (path.endsWith('/bootstrap')) return json({ user: { id: 'guardian', username: 'guardian-demo', role: 'guardian', display_name: '家长' }, catalog: [first], active_minutes: 0, downloads_paused: false, requests: [], submissions: [] })
    if (path.endsWith('/collection')) return json({ id: 'collection-e2e', title: '自然课合集', description: '完整合集', collection_kind: 'ugc_season', episode_count: 2, current_episode_index: path.includes('episode-2') ? 2 : 1, episodes: [first, second] })
    if (path.endsWith('/interactions')) return json({ comments: [], danmaku: [] })
    if (path.endsWith('/launch')) return json({ mode: 'direct_stream', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' })
    return json({ detail: 'not found' }, 404)
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByLabel('账号').fill('guardian-demo')
  await page.getByLabel('密码', { exact: true }).fill('GuardianDemo2026')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.locator('.search-box').click()
  await page.getByLabel('搜索全部家庭资源').fill('认识天空')
  const card = page.locator('.content-card').filter({ hasText: '认识天空' }).first()
  await card.waitFor()
  await card.locator('button.card-copy').click()
  await page.getByText('自然课合集', { exact: true }).waitFor()
  check(await page.locator('.player-episode-list button').count() === 2, '播放器没有显示完整选集')
  const episodeTwo = page.locator('.player-episode-list button').filter({ hasText: '认识海洋' })
  await episodeTwo.focus()
  await page.keyboard.press('Enter')
  await page.locator('.player-episode-list button.active').filter({ hasText: '认识海洋' }).waitFor()
  check(await page.locator('.lumi-video-player').count() === 1, '切换分集后播放器被关闭')
  check(await page.evaluate(() => document.documentElement.classList.contains('mobile-mode')), '手机环境没有启用手机播放器布局')
  await page.getByRole('button', { name: '全屏' }).click({ force: true })
  await page.waitForFunction(() => Boolean(document.fullscreenElement))
  const fullscreenPlayer = await page.locator('.lumi-video-player').boundingBox()
  check(fullscreenPlayer && fullscreenPlayer.width >= 389 && fullscreenPlayer.height >= 843, '手机播放器没有覆盖全屏')
  const nativeBackHandled = await page.evaluate(() => {
    const event = new Event('lumi:native-back', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
  check(nativeBackHandled, '手机系统返回没有先关闭播放器')
  await page.locator('.lumi-video-player').waitFor({ state: 'detached' })
  await page.waitForFunction(() => !document.fullscreenElement)
  console.log(JSON.stringify({ status: 'ok', collection: true, episodes: 2, keyboardSelection: true, mobileFullscreen: true, nativeBack: true }))
  await context.close()
} finally {
  await browser.close()
}
