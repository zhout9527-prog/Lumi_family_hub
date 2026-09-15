import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.FAMILYHUB_PET_E2E_URL ?? 'http://127.0.0.1:4186'
const artifactsPath = fileURLToPath(new URL('./artifacts/', import.meta.url))
const runId = Date.now().toString(36)

function check(condition, message) {
  if (!condition) throw new Error(message)
}

const speciesSource = [
  ['alpaca', '羊驼', 'Alpaca', 'alpaca.gltf'],
  ['bull', '小公牛', 'Bull', 'bull.gltf'],
  ['cow', '小奶牛', 'Cow', 'cow.gltf'],
  ['deer', '小鹿', 'Deer', 'deer.gltf'],
  ['donkey', '小驴', 'Donkey', 'donkey.gltf'],
  ['fox', '小狐狸', 'Fox', 'fox.gltf'],
  ['horse', '小马', 'Horse', 'horse.gltf'],
  ['horse-white', '白马', 'Horse White', 'horse-white.gltf'],
  ['husky', '哈士奇', 'Husky', 'husky.gltf'],
  ['shibainu', '柴犬', 'Shiba Inu', 'shibainu.gltf'],
  ['stag', '大角鹿', 'Stag', 'stag.gltf'],
  ['wolf', '小狼', 'Wolf', 'wolf.gltf'],
]

const species = speciesSource.map(([id, name, englishName, fileName]) => ({
  id,
  name,
  english_name: englishName,
  source: 'Quaternius Ultimate Animated Animals Pack',
  source_url: 'https://quaternius.com/packs/ultimateanimatedanimals.html',
  license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  accent: '#6f927e',
  emoji: '3D',
  temperament: '喜欢陪伴你',
  asset_path: `/pets/quaternius/${fileName}`,
  animation_hint: 'Idle · Eating · Walk · Gallop · Jump',
})).concat({
  id: 'cat',
  name: '小猫',
  english_name: 'Cat',
  source: 'Cat by J-Toastie · Poly Pizza',
  source_url: 'https://poly.pizza/m/DJ9rpAhrh3',
  license_url: 'https://creativecommons.org/licenses/by/3.0/',
  accent: '#849cab',
  emoji: '3D',
  temperament: '温柔好奇，喜欢倾听和学你说话',
  asset_path: '/pets/poly-pizza/cat.glb',
  animation_hint: 'IdleCat · Lumi procedural actions',
})

const child = {
  id: 'pet-child',
  username: 'pet-child',
  role: 'child',
  display_name: '小豆',
  birth_date: '2020-01-01',
}

const pet = {
  id: 'pet-e2e',
  owner_user_id: child.id,
  owner_name: child.display_name,
  name: '林林',
  species: 'deer',
  species_name: '小鹿',
  species_english_name: 'Deer',
  personality: 'curious',
  growth_stage: '初遇',
  growth_points: 12,
  mood: 78,
  energy: 82,
  curiosity: 60,
  cleanliness: 90,
  revision: 1,
  last_interaction_at: null,
  created_at: '2026-09-14T00:00:00Z',
  updated_at: '2026-09-14T00:00:00Z',
}

const approvalItem = {
  id: 'pet-e2e-approval-item',
  kind: 'video',
  title: '需要家长同意的自然纪录片',
  subtitle: '窄窗口详情弹窗画幅测试',
  language: '中文 / English',
  age_from: 6,
  age_to: 9,
  duration_minutes: 18,
  duration_seconds: 1080,
  description: '跟随镜头观察森林里的动物，学习它们如何寻找食物和保护自己的家园。',
  tags: ['自然观察', '双语启蒙', '亲子讨论'],
  accent: '#6f927e',
  cover_ref: '/covers/photo-1473445361085-b9a07f55608b.jpg',
  acquisition_mode: 'local_library',
  offline_activity: '画下最喜欢的动物，并说出一个新发现。',
  featured: true,
  favorite: false,
  completed: false,
  local_available: true,
  playable: true,
  playback_mode: 'local_asset',
  launch_allowed: false,
  provider: 'local',
  audience: 'child',
  collection_card: false,
}

async function installApi(context, adoption = false) {
  await context.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/health')) return json({ status: 'ok', version: 'test', database: 'ok', setup_required: false })
    if (path.endsWith('/auth/login')) return json({ access_token: 'pet-e2e-token', token_type: 'bearer', user: child })
    if (path.endsWith('/bootstrap')) return json({
      user: child,
      catalog: [approvalItem],
      active_minutes: 0,
      downloads_paused: false,
      pet: adoption ? null : pet,
      pets: adoption ? [] : [pet],
      pet_species: species,
      pet_can_adopt: adoption,
    })
    if (path.endsWith('/pets/pet-e2e/actions')) return json({
      pet: { ...pet, growth_points: 18, revision: 2, mood: 85, energy: 74 },
      action: 'play',
      message: '一起玩真开心，发现力提升了！',
      points: 6,
      idempotent: false,
    })
    return json({ detail: 'not found' }, 404)
  })
}

async function login(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByLabel('账号').fill('pet-child')
  await page.getByLabel('密码', { exact: true }).fill('PetChild2026')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.locator('.role-child').waitFor()
}

async function openPetView(page, mobile = false) {
  if (mobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByLabel('主导航').getByRole('button', { name: '我的伙伴', exact: true }).click()
}

async function waitForModel(page) {
  await page.locator('.pet-3d-toolbar').waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('.pet-3d-state').waitFor({ state: 'detached', timeout: 30000 })
}

async function canvasStats(page) {
  // WebGL 默认帧缓冲在合成后可能被浏览器清空，因此检查最终合成截图的像素。
  const screenshot = await page.locator('.pet-3d-canvas canvas').screenshot()
  return page.evaluate(async (encoded) => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    const surface = document.createElement('canvas')
    surface.width = image.naturalWidth
    surface.height = image.naturalHeight
    const context = surface.getContext('2d', { willReadFrequently: true })
    if (!context) return { samples: 0, visible: 0, spread: 0, hash: 0 }
    context.drawImage(image, 0, 0)
    const width = surface.width
    const height = surface.height
    const pixels = context.getImageData(0, 0, width, height).data
    let samples = 0
    let visible = 0
    let minimum = 255
    let maximum = 0
    let hash = 2166136261
    const step = Math.max(1, Math.floor(Math.min(width, height) / 90))
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const offset = (y * width + x) * 4
        const red = pixels[offset]
        const green = pixels[offset + 1]
        const blue = pixels[offset + 2]
        const alpha = pixels[offset + 3]
        const light = Math.round((red + green + blue) / 3)
        if (alpha > 8) visible += 1
        minimum = Math.min(minimum, light)
        maximum = Math.max(maximum, light)
        hash = Math.imul(hash ^ red ^ (green << 8) ^ (blue << 16) ^ alpha, 16777619) >>> 0
        samples += 1
      }
    }
    return { samples, visible, spread: maximum - minimum, hash }
  }, screenshot.toString('base64'))
}

function checkCanvas(stats, label) {
  check(stats.samples > 1000, `${label} 3D 画布像素采样不足`)
  check(stats.visible > stats.samples * 0.04, `${label} 3D 画布是空白的`)
  check(stats.spread > 20, `${label} 3D 模型没有形成有效画面`)
}

function collectFailures(page, failures, label) {
  page.on('pageerror', (error) => failures.push(`${label} page: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`${label} console: ${message.text()}`)
  })
}

await mkdir(artifactsPath, { recursive: true })
const browser = await chromium.launch({ executablePath: edgePath, headless: true })
const failures = []

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' })
  await installApi(desktopContext)
  const desktop = await desktopContext.newPage()
  await desktop.addInitScript(() => {
    class FakeMediaRecorder {
      static isTypeSupported() { return true }
      constructor(stream, options = {}) {
        this.stream = stream
        this.mimeType = options.mimeType || 'audio/webm'
        this.state = 'inactive'
        this.ondataavailable = null
        this.onstop = null
      }
      start() {
        this.state = 'recording'
        setTimeout(() => this.ondataavailable?.({ data: new Blob(['echo-sample'], { type: this.mimeType }) }), 20)
      }
      stop() {
        this.state = 'inactive'
        setTimeout(() => this.onstop?.(), 20)
      }
    }
    class FakeAudio {
      constructor(source) { this.src = source; this.currentTime = 0; this.playbackRate = 1; this.onended = null; this.onerror = null }
      play() { setTimeout(() => this.onended?.(), 80); return Promise.resolve() }
      pause() {}
    }
    class FakeAudioContext {
      createAnalyser() { return { fftSize: 1024, getByteTimeDomainData: (samples) => samples.fill(128) } }
      createMediaStreamSource() { return { connect() {} } }
      close() { return Promise.resolve() }
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } })
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder })
    Object.defineProperty(window, 'Audio', { configurable: true, value: FakeAudio })
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext })
  })
  collectFailures(desktop, failures, 'desktop')
  await login(desktop)
  await openPetView(desktop)
  await waitForModel(desktop)
  check(await desktop.locator('.pet-animation-chip').count() === 13, '小鹿没有展示全部 13 个原生动作')
  const firstFrame = await canvasStats(desktop)
  checkCanvas(firstFrame, '桌面端')
  await desktop.waitForTimeout(900)
  const animatedFrame = await canvasStats(desktop)
  checkCanvas(animatedFrame, '桌面端动画')
  check(firstFrame.hash !== animatedFrame.hash, '桌面端 3D 模型没有播放动画或自动转动')
  await desktop.getByRole('button', { name: /玩耍/ }).click()
  await desktop.locator('.pet-3d-toolbar').getByText(/当前动作：(?!Idle)/i).waitFor()
  await desktop.getByRole('button', { name: /连续展示全部/ }).click()
  check(await desktop.getByRole('button', { name: /停止连续展示/ }).getAttribute('aria-pressed') === 'true', '动作连续展示没有启动')
  await desktop.getByRole('button', { name: /停止连续展示/ }).click()
  await desktop.getByRole('button', { name: /去声声岛玩/ }).click()
  await desktop.locator('.echo-modal').waitFor()
  check(await desktop.locator('.echo-species').count() === 13, '声声岛没有提供全部 13 种伙伴声线')
  await desktop.getByRole('button', { name: '开始说话' }).click()
  await desktop.getByRole('button', { name: '说完了' }).waitFor()
  await desktop.getByRole('button', { name: '说完了' }).click()
  await desktop.getByText('还想听一次，或者换一位伙伴试试吗？').waitFor()
  await desktop.locator('.echo-species').filter({ hasText: '小猫' }).click()
  await desktop.getByRole('button', { name: '再听一次' }).click()
  await desktop.getByText('还想听一次，或者换一位伙伴试试吗？').waitFor()
  await desktop.screenshot({ path: `${artifactsPath}echo-companion-desktop-${runId}.png` })
  await desktop.getByRole('button', { name: '关闭声声岛' }).click()
  check(!await desktop.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '桌面宠物页横向溢出')
  await desktop.screenshot({ path: `${artifactsPath}pet-3d-desktop-${runId}.png`, fullPage: true })
  await desktopContext.close()

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 16; 24129PN74C) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36',
  })
  await installApi(mobileContext, true)
  const mobile = await mobileContext.newPage()
  collectFailures(mobile, failures, 'mobile')
  await login(mobile)
  await openPetView(mobile, true)
  await waitForModel(mobile)
  check(await mobile.locator('.pet-species-card').count() === 13, '手机端没有提供全部 13 种真实 3D 宠物')
  await mobile.locator('.pet-species-card').first().click()
  for (const item of species) {
    const card = mobile.locator('.pet-species-card').filter({ hasText: item.name })
    const alreadySelected = await card.getAttribute('aria-pressed') === 'true'
    const modelResponse = alreadySelected
      ? null
      : mobile.waitForResponse((response) => response.url().endsWith(item.asset_path) && response.ok())
    await card.click()
    if (modelResponse) await modelResponse
    await waitForModel(mobile)
    await mobile.locator('.pet-preview-index strong').getByText(item.name, { exact: true }).waitFor()
    const expectedActions = item.id === 'cat' ? 9 : ['fox', 'husky', 'shibainu', 'wolf'].includes(item.id) ? 12 : 13
    check(await mobile.locator('.pet-animation-chip').count() === expectedActions, `${item.name} 的动作图鉴数量不正确`)
    check((await canvasStats(mobile)).spread > 20, `${item.name} 的 3D 模型没有形成有效画面`)
  }
  await mobile.getByRole('button', { name: '下一个伙伴' }).click()
  await mobile.locator('.pet-preview-index strong').getByText('羊驼', { exact: true }).waitFor()
  await mobile.locator('.pet-species-card').filter({ hasText: '小猫' }).click()
  await waitForModel(mobile)
  const mobileFrame = await canvasStats(mobile)
  checkCanvas(mobileFrame, '手机端猫咪')
  const viewer = await mobile.locator('.pet-3d-viewer').boundingBox()
  check(viewer && viewer.x >= 0 && viewer.x + viewer.width <= 390, '手机端 3D 模型超出屏幕')
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机宠物页横向溢出')
  await mobile.screenshot({ path: `${artifactsPath}pet-3d-mobile-${runId}.png`, fullPage: true })
  await mobileContext.close()

  const tvContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  })
  await installApi(tvContext)
  const tv = await tvContext.newPage()
  collectFailures(tv, failures, 'tv')
  await login(tv)
  await openPetView(tv)
  await waitForModel(tv)
  check(await tv.evaluate(() => document.documentElement.classList.contains('tv-mode')), '电视环境没有启用遥控器模式')
  const tvFrame = await canvasStats(tv)
  checkCanvas(tvFrame, '电视端')
  const feed = tv.getByRole('button', { name: /喂食/ })
  await feed.focus()
  await tv.keyboard.press('ArrowRight')
  check(await tv.evaluate(() => document.activeElement?.textContent?.includes('玩耍')), '电视遥控器方向键没有切换互动按钮')
  await tv.screenshot({ path: `${artifactsPath}pet-3d-tv-${runId}.png` })
  await tvContext.close()

  const narrowContext = await browser.newContext({ viewport: { width: 759, height: 903 }, locale: 'zh-CN' })
  await installApi(narrowContext)
  const narrow = await narrowContext.newPage()
  collectFailures(narrow, failures, 'narrow-detail')
  await login(narrow)
  await narrow.locator('.content-card').filter({ hasText: approvalItem.title }).locator('button.card-copy').click()
  const detail = narrow.locator('.detail-modal')
  await detail.waitFor()
  const layout = await detail.evaluate((modal) => ({
    clientWidth: modal.clientWidth,
    scrollWidth: modal.scrollWidth,
    contentWidth: modal.querySelector('.modal-content')?.getBoundingClientRect().width ?? 0,
    coverWidth: modal.querySelector('.modal-cover')?.getBoundingClientRect().width ?? 0,
  }))
  check(layout.scrollWidth <= layout.clientWidth + 1, '儿童申请播放详情弹窗仍存在横向滚动')
  check(layout.contentWidth > 600 && layout.coverWidth > 600, '759 像素窄窗口下详情弹窗没有使用上下画幅')
  check(!await narrow.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '儿童详情弹窗撑宽了应用')
  await narrow.screenshot({ path: `${artifactsPath}child-request-detail-${runId}.png` })
  await narrowContext.close()

  check(failures.length === 0, failures.join('\n'))
  console.log(JSON.stringify({ status: 'ok', species: 13, nativeActionRange: '12-13', catActions: 9, echoVoices: 13, detail759: true, desktop: true, mobile: true, tv: true, animated: true }))
} finally {
  await browser.close()
}
