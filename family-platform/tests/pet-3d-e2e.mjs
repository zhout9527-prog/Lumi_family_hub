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
  source: 'Kenney Cube Pets',
  source_url: 'https://kenney.nl/assets/cube-pets',
  license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  accent: '#8b82bd',
  emoji: '3D',
  temperament: '安静，喜欢陪伴和聊天',
  asset_path: '/pets/kenney/cat.glb',
  animation_hint: 'idle · walk · run · eat · dance',
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

async function installApi(context, adoption = false) {
  await context.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/health')) return json({ status: 'ok', version: 'test', database: 'ok', setup_required: false })
    if (path.endsWith('/auth/login')) return json({ access_token: 'pet-e2e-token', token_type: 'bearer', user: child })
    if (path.endsWith('/bootstrap')) return json({
      user: child,
      catalog: [],
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
  collectFailures(desktop, failures, 'desktop')
  await login(desktop)
  await openPetView(desktop)
  await waitForModel(desktop)
  const firstFrame = await canvasStats(desktop)
  checkCanvas(firstFrame, '桌面端')
  await desktop.waitForTimeout(900)
  const animatedFrame = await canvasStats(desktop)
  checkCanvas(animatedFrame, '桌面端动画')
  check(firstFrame.hash !== animatedFrame.hash, '桌面端 3D 模型没有播放动画或自动转动')
  await desktop.getByRole('button', { name: /玩耍/ }).click()
  await desktop.locator('.pet-3d-toolbar').getByText(/当前动作：(?!Idle)/i).waitFor()
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
  const catResponse = mobile.waitForResponse((response) => response.url().endsWith('/pets/kenney/cat.glb') && response.ok())
  await mobile.locator('.pet-species-card').filter({ hasText: '小猫' }).click()
  await catResponse
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

  check(failures.length === 0, failures.join('\n'))
  console.log(JSON.stringify({ status: 'ok', species: 13, desktop: true, mobile: true, tv: true, animated: true }))
} finally {
  await browser.close()
}
