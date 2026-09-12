import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.FAMILYHUB_GAME_E2E_URL ?? 'http://127.0.0.1:4183'
const artifactsPath = fileURLToPath(new URL('./artifacts/', import.meta.url))
const runId = Date.now().toString(36)

function check(condition, message) {
  if (!condition) throw new Error(message)
}

function collectFailures(page, failures, label) {
  page.on('pageerror', (error) => failures.push(`${label} page: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`${label} console: ${message.text()}`)
  })
}

async function login(page, username, password, role) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByLabel('账号').fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.locator(`.role-${role}`).waitFor()
}

async function boardState(page) {
  return page.locator('.game-board').evaluate((board) =>
    Array.from(board.querySelectorAll('.game-block'))
      .map((cell, index) => cell.classList.contains('block-empty') ? null : index)
      .filter((index) => index !== null),
  )
}

await mkdir(artifactsPath, { recursive: true })
const browser = await chromium.launch({ executablePath: edgePath, headless: true })
const failures = []

try {
  const guardianContext = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'zh-CN' })
  const guardian = await guardianContext.newPage()
  collectFailures(guardian, failures, 'guardian')
  await guardian.route('**/api/v1/bootstrap', async (route) => {
    const response = await route.fetch()
    const payload = await response.json()
    const localVideo = payload.catalog?.find((item) => item.kind === 'video')
    if (localVideo) {
      localVideo.local_available = true
      localVideo.playable = true
      localVideo.playback_mode = 'local_asset'
      localVideo.audience = 'family'
    }
    await route.fulfill({ response, json: payload })
  })
  await login(guardian, 'guardian-demo', 'GuardianDemo2026', 'guardian')
  check(await guardian.getByRole('button', { name: '家庭海报墙' }).count() === 1, '家长端没有海报墙入口')
  await guardian.getByRole('button', { name: '家庭海报墙' }).click()
  await guardian.getByRole('heading', { name: '家庭海报墙' }).waitFor()
  check(await guardian.locator('.poster-card').count() > 0, '海报墙没有展示可播放视频')
  await guardian.getByRole('button', { name: '本地', exact: true }).click()
  check(await guardian.locator('.poster-source.local').count() > 0, '本地筛选没有展示 Server 视频')
  check(!await guardian.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '桌面海报墙横向溢出')
  await guardian.screenshot({ path: `${artifactsPath}poster-wall-desktop-${runId}.png`, fullPage: true })
  await guardianContext.close()

  const childContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' })
  const child = await childContext.newPage()
  collectFailures(child, failures, 'desktop')
  await login(child, 'child-demo', 'ChildDemo2026', 'child')
  check(await child.getByRole('button', { name: '家庭海报墙' }).count() === 0, '儿童端不应出现家长海报墙')
  await child.getByLabel('主导航').getByRole('button', { name: '小游戏', exact: true }).click()
  await child.getByRole('heading', { name: '小游戏' }).waitFor()
  await child.getByRole('button', { name: /俄罗斯方块/ }).click()
  await child.getByRole('dialog', { name: '俄罗斯方块' }).waitFor()
  check(await child.locator('.game-board .game-block').count() === 200, '俄罗斯方块棋盘不是 10 × 20')
  const beforeMove = await boardState(child)
  await child.keyboard.press('ArrowRight')
  const afterMove = await boardState(child)
  check(JSON.stringify(beforeMove) !== JSON.stringify(afterMove), '电脑方向键没有移动方块')
  await child.keyboard.press('p')
  await child.getByText('已暂停', { exact: true }).waitFor()
  await child.keyboard.press('p')
  check(await child.getByText('已暂停', { exact: true }).count() === 0, '电脑键盘没有恢复游戏')
  await child.keyboard.press('Escape')
  check(await child.getByRole('dialog', { name: '俄罗斯方块' }).count() === 0, '电脑端没有退出游戏')
  await child.getByRole('button', { name: /方块割草/ }).click()
  await child.getByRole('dialog', { name: '方块割草' }).waitFor()
  check(await child.locator('.block-mower-tile').count() === 80, '方块割草棋盘不是 8 × 10')
  const cleared = await child.locator('.block-mower-board').evaluate((board) => {
    const cells = Array.from(board.querySelectorAll('button'))
    for (let index = 0; index < cells.length; index += 1) {
      const current = cells[index]
      const right = index % 8 < 7 ? cells[index + 1] : null
      const down = index + 8 < cells.length ? cells[index + 8] : null
      if (right && current.className.match(/tile-\w+/)?.[0] === right.className.match(/tile-\w+/)?.[0]) { current.click(); return true }
      if (down && current.className.match(/tile-\w+/)?.[0] === down.className.match(/tile-\w+/)?.[0]) { current.click(); return true }
    }
    return false
  })
  check(cleared, '方块割草初始棋盘没有可清除组合')
  await child.getByText(/个方块连锁清除/).waitFor()
  await child.getByRole('button', { name: '退出方块割草' }).click()
  await childContext.close()

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 16; 24129PN74C) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36',
  })
  const mobile = await mobileContext.newPage()
  collectFailures(mobile, failures, 'mobile')
  await login(mobile, 'child-demo', 'ChildDemo2026', 'child')
  await mobile.getByRole('button', { name: '打开导航' }).click()
  await mobile.getByLabel('主导航').getByRole('button', { name: '小游戏', exact: true }).click()
  await mobile.getByRole('button', { name: /俄罗斯方块/ }).click()
  await mobile.getByRole('dialog', { name: '俄罗斯方块' }).waitFor()
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机游戏横向溢出')
  await mobile.getByRole('button', { name: '旋转方块' }).click()
  await mobile.getByRole('button', { name: '暂停游戏' }).click()
  await mobile.getByText('已暂停', { exact: true }).waitFor()
  await mobile.getByRole('button', { name: '继续游戏' }).click()
  await mobile.screenshot({ path: `${artifactsPath}tetris-mobile-${runId}.png` })
  await mobile.getByRole('button', { name: '退出俄罗斯方块' }).click()
  await mobile.getByRole('button', { name: /方块割草/ }).click()
  await mobile.getByRole('dialog', { name: '方块割草' }).waitFor()
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机方块割草横向溢出')
  await mobile.screenshot({ path: `${artifactsPath}block-mower-mobile-${runId}.png` })
  await mobile.getByRole('button', { name: '退出方块割草' }).click()
  await mobileContext.close()

  const landscapeContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    locale: 'zh-CN',
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 16; 24129PN74C) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36',
  })
  const landscape = await landscapeContext.newPage()
  collectFailures(landscape, failures, 'landscape')
  await login(landscape, 'child-demo', 'ChildDemo2026', 'child')
  await landscape.getByLabel('主导航').getByRole('button', { name: '小游戏', exact: true }).click()
  await landscape.getByRole('button', { name: /俄罗斯方块/ }).click()
  const landscapeBoard = await landscape.locator('.tetris-board-frame').boundingBox()
  const landscapeControls = await landscape.locator('.tetris-controls').boundingBox()
  check(landscapeBoard && landscapeBoard.y >= 0 && landscapeBoard.y + landscapeBoard.height <= 390, '手机横屏棋盘被裁切')
  check(landscapeControls && landscapeControls.y + landscapeControls.height <= 390, '手机横屏控制键被裁切')
  check(!await landscape.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机横屏游戏横向溢出')
  await landscape.screenshot({ path: `${artifactsPath}tetris-mobile-landscape-${runId}.png` })
  await landscapeContext.close()

  const tvContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Linux; Android 11; SHIELD Android TV) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  })
  const tv = await tvContext.newPage()
  collectFailures(tv, failures, 'tv')
  await login(tv, 'child-demo', 'ChildDemo2026', 'child')
  await tv.getByLabel('主导航').getByRole('button', { name: '小游戏', exact: true }).click()
  const launch = tv.getByRole('button', { name: /俄罗斯方块/ })
  await launch.focus()
  await tv.keyboard.press('Enter')
  await tv.getByRole('dialog', { name: '俄罗斯方块' }).waitFor()
  const focusedBefore = await tv.evaluate(() => document.activeElement?.className)
  const tvBefore = await boardState(tv)
  await tv.keyboard.press('ArrowLeft')
  const tvAfter = await boardState(tv)
  check(JSON.stringify(tvBefore) !== JSON.stringify(tvAfter), '电视遥控器方向键没有移动方块')
  check(focusedBefore === await tv.evaluate(() => document.activeElement?.className), '电视游戏中方向键仍在移动页面焦点')
  await tv.keyboard.press('Enter')
  await tv.screenshot({ path: `${artifactsPath}tetris-tv-${runId}.png` })
  await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true })))
  check(await tv.getByRole('dialog', { name: '俄罗斯方块' }).count() === 0, '电视返回键没有退出游戏')
  await tv.getByRole('button', { name: /方块割草/ }).focus()
  await tv.keyboard.press('Enter')
  await tv.getByRole('dialog', { name: '方块割草' }).waitFor()
  const initialTile = tv.locator('.block-mower-tile').first()
  await initialTile.focus()
  await tv.keyboard.press('ArrowRight')
  check(await tv.evaluate(() => document.activeElement?.classList.contains('block-mower-tile')) === true, '电视方块割草没有逐格移动焦点')
  await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true })))
  check(await tv.getByRole('dialog', { name: '方块割草' }).count() === 0, '电视返回键没有退出方块割草')
  await tvContext.close()

  check(failures.length === 0, failures.join('\n'))
  console.log(JSON.stringify({ status: 'ok', posterWall: true, childGate: true, desktop: true, mobile: true, tv: true, failures }))
} finally {
  await browser.close()
}
