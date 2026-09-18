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

async function aimAtTutorialTreasure(page, kind = 'diamond') {
  const targetAngle = await page.locator(`.gold-treasure[data-kind="${kind}"][data-treasure-id*="guide"]`).evaluateAll((items) => {
    const target = items
      .map((item) => {
        const x = Number.parseFloat(item.style.left) * 10
        const y = Number.parseFloat(item.style.top) * 6.5
        return { angle: Math.atan2(x - 500, y - 104) * 180 / Math.PI, distance: Math.hypot(x - 500, y - 104) }
      })
      .filter(({ angle }) => Math.abs(angle) < 64)
      .sort((left, right) => left.distance - right.distance)[0]
    return target.angle
  })
  await page.waitForFunction((angle) => Math.abs(Number(document.querySelector('.gold-miner-stage')?.getAttribute('data-angle')) - angle) < 1.2, targetAngle)
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
  check(await child.locator('.game-launch-card').count() === 6, '电脑端没有展示完整的六个游戏入口')
  await child.screenshot({ path: `${artifactsPath}games-desktop-${runId}.png`, fullPage: true })
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
  await child.getByRole('button', { name: /彩块防线/ }).click()
  await child.getByRole('dialog', { name: '彩块防线' }).waitFor()
  check(await child.locator('.mower-v2-block').count() >= 60, '彩块防线没有生成密集方块阵列')
  check(await child.locator('.mower-active-slot').count() === 2, '彩块防线初始发射槽位不是两个')
  check(await child.locator('.mower-reserve-card').count() === 3, '彩块防线初始备用池不是三格')
  check(await child.locator('.mower-v2-block.is-targetable').count() > 0 && await child.locator('.mower-v2-block.is-covered').count() > 0, '彩块防线没有区分可攻击前层与被遮挡后层')
  await child.locator('.mower-reserve-card').first().click()
  await child.getByText(/已装入，正在充能/).waitFor()
  check(await child.locator('.mower-active-slot.is-charging').count() > 0, '备用发射器换装后没有充能等待')
  await child.getByRole('button', { name: '成长工坊', exact: true }).click()
  await child.getByRole('heading', { name: '成长工坊' }).waitFor()
  check(await child.locator('.mower-upgrade-card').count() === 5, '成长工坊没有展示完整五类升级')
  await child.getByRole('button', { name: '回到战场' }).click()
  await child.screenshot({ path: `${artifactsPath}block-defense-desktop-${runId}.png` })
  await child.getByRole('button', { name: '退出彩块防线' }).click()
  await child.getByRole('button', { name: /深岩淘金/ }).click()
  await child.getByRole('dialog', { name: '深岩淘金' }).waitFor()
  check(await child.locator('.gold-treasure[data-kind]').count() === 20, '深岩淘金第一关没有生成完整的新手宝藏')
  await child.getByText('300', { exact: true }).first().waitFor()
  await aimAtTutorialTreasure(child)
  await child.keyboard.press('ArrowDown')
  await child.waitForFunction(() => Number((document.querySelector('[data-testid="gold-score"]')?.textContent ?? '0').replace(/\D/g, '')) >= 600, undefined, { timeout: 12_000 })
  await child.keyboard.press('p')
  await child.getByText('已暂停', { exact: true }).waitFor()
  await child.keyboard.press('p')
  check(await child.getByText('已暂停', { exact: true }).count() === 0, '电脑键盘没有恢复淘金游戏')
  await child.getByRole('button', { name: /目标达成，提前收工/ }).click()
  await child.getByRole('heading', { name: '矿镇补给站' }).waitFor()
  await child.screenshot({ path: `${artifactsPath}gold-miner-shop-desktop-${runId}.png` })
  const goldBook = child.locator('.gold-shop-card.tool-gold-book')
  await goldBook.getByRole('button', { name: '购买 160' }).click()
  await goldBook.getByRole('button', { name: '下关使用一个' }).click()
  await goldBook.getByText('下关已准备').waitFor()
  await child.getByRole('button', { name: '进入第 2 关' }).click()
  await child.locator('.gold-miner-stage').waitFor()
  check(await child.locator('[data-testid="gold-score"]').textContent() === '440', '购买道具后的累计积分没有正确带入下一关')
  check(await child.locator('.gold-treasure[data-kind]').count() === 26, '幸运金块书没有为下一关增加四块金块')
  await child.screenshot({ path: `${artifactsPath}gold-miner-desktop-${runId}.png` })
  await child.keyboard.press('Escape')
  check(await child.getByRole('dialog', { name: '深岩淘金' }).count() === 0, '电脑端没有退出深岩淘金')
  await child.evaluate(() => {
    const key = 'lumi:deep-mine-progress:v2'
    const progress = JSON.parse(localStorage.getItem(key) ?? '{}')
    progress.inventory = { ...(progress.inventory ?? {}), dynamite: 2 }
    localStorage.setItem(key, JSON.stringify(progress))
  })
  await child.getByRole('button', { name: /深岩淘金/ }).click()
  await child.getByText('炸药 × 2', { exact: true }).waitFor()
  await aimAtTutorialTreasure(child, 'gold-large')
  const treasureCountBeforeExplosion = await child.locator('.gold-treasure[data-kind]').count()
  await child.keyboard.press('ArrowDown')
  await child.locator('.gold-treasure.is-caught').waitFor({ timeout: 8_000 })
  await child.waitForTimeout(450)
  check(await child.locator('.gold-treasure.is-caught').count() === 1, '大金块上拉速度仍然过快，没有呈现重量感')
  await child.keyboard.press('ArrowUp')
  await child.waitForFunction((count) => document.querySelectorAll('.gold-treasure[data-kind]').length === count - 1, treasureCountBeforeExplosion)
  await child.getByText('炸药 × 1', { exact: true }).waitFor()
  await child.keyboard.press('Escape')
  await child.getByRole('button', { name: /深岩淘金/ }).click()
  await child.getByText('炸药 × 1', { exact: true }).waitFor()
  await child.getByRole('button', { name: '从第1关重新开始' }).click()
  await child.getByRole('alertdialog').waitFor()
  await child.getByText('当前关卡、最高关卡、累计积分、背包道具和本关增益都会清空。').waitFor()
  await child.getByRole('button', { name: '继续当前进度' }).click()
  await child.getByText('炸药 × 1', { exact: true }).waitFor()
  await child.getByRole('button', { name: '从第1关重新开始' }).click()
  await child.getByRole('button', { name: '清空进度并重开' }).click()
  await child.getByText('炸药 × 0', { exact: true }).waitFor()
  await child.getByText('300', { exact: true }).first().waitFor()
  await child.waitForFunction(() => {
    const progress = JSON.parse(localStorage.getItem('lumi:deep-mine-progress:v2') ?? '{}')
    return progress.level === 1 && progress.highestLevel === 1 && progress.score === 0 && progress.inventory?.dynamite === 0
  })
  await child.keyboard.press('Escape')

  await child.evaluate(() => localStorage.setItem('lumi:deep-mine-progress:v2', JSON.stringify({
    level: 15,
    highestLevel: 15,
    score: 25_000,
    inventory: { 'lucky-charm': 0, strength: 0, dynamite: 0, 'gold-book': 0, 'diamond-book': 0 },
    activeEffects: { luckyCharm: false, strength: false, goldBook: false, diamondBook: false },
  })))
  await child.getByRole('button', { name: /深岩淘金/ }).click()
  check(await child.locator('.gold-treasure[data-kind="barrel"]').count() >= 2, '第 15 关没有引入炸药桶')
  await child.keyboard.press('Escape')
  await child.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem('lumi:deep-mine-progress:v2') ?? '{}')
    progress.level = 20
    progress.highestLevel = 20
    progress.score = 45_000
    localStorage.setItem('lumi:deep-mine-progress:v2', JSON.stringify(progress))
  })
  await child.getByRole('button', { name: /深岩淘金/ }).click()
  check(await child.locator('.gold-treasure[data-kind^="trash-"]').count() >= 7, '第 20 关没有生成完整垃圾干扰物')
  await child.keyboard.press('Escape')

  await child.getByRole('button', { name: /贪吃蛇/ }).click()
  await child.getByRole('dialog', { name: '贪吃蛇' }).waitFor()
  await child.waitForFunction(() => document.querySelector('.snake-game-frame')?.contentDocument?.readyState === 'complete')
  const desktopSnakeFrame = child.frames().find((frame) => frame.url().includes('/games/snake/index.html'))
  check(Boolean(desktopSnakeFrame), '贪吃蛇内置页面没有加载')
  const guideButton = desktopSnakeFrame.getByRole('button', { name: '明白了，开始游戏' })
  if (await guideButton.isVisible()) await guideButton.click()
  else await desktopSnakeFrame.getByRole('button', { name: '开始游戏' }).click()
  await desktopSnakeFrame.waitForFunction(() => window.__snakeGame?.getState().state === 'running')
  await desktopSnakeFrame.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
  await child.screenshot({ path: `${artifactsPath}snake-desktop-${runId}.png` })
  await child.getByRole('button', { name: '退出贪吃蛇' }).click()

  await child.getByRole('button', { name: /小小画室/ }).click()
  await child.getByRole('dialog', { name: '小小画室' }).waitFor()
  await child.getByRole('tab', { name: '照着画' }).click()
  const desktopCanvas = await child.getByLabel('绘画画布').boundingBox()
  check(Boolean(desktopCanvas), '桌面画室没有绘画画布')
  await child.mouse.move(desktopCanvas.x + desktopCanvas.width * 0.25, desktopCanvas.y + desktopCanvas.height * 0.55)
  await child.mouse.down()
  await child.mouse.move(desktopCanvas.x + desktopCanvas.width * 0.5, desktopCanvas.y + desktopCanvas.height * 0.25, { steps: 12 })
  await child.mouse.move(desktopCanvas.x + desktopCanvas.width * 0.75, desktopCanvas.y + desktopCanvas.height * 0.55, { steps: 12 })
  await child.mouse.up()
  await child.getByRole('button', { name: '看看完成度' }).click()
  await child.getByText('临摹完成度', { exact: true }).waitFor()
  check(await child.getByRole('button', { name: /保存作品/ }).isEnabled(), '完成绘画后保存作品仍不可用')
  await child.screenshot({ path: `${artifactsPath}art-studio-desktop-${runId}.png` })
  await child.getByRole('button', { name: '退出小小画室' }).click()

  await child.evaluate(() => {
    window.__lumiOpenedUrl = ''
    window.open = (url) => { window.__lumiOpenedUrl = String(url); return window }
  })
  await child.getByRole('button', { name: /画线人冒险/ }).click()
  check((await child.evaluate(() => window.__lumiOpenedUrl)).startsWith('https://drawastickman.com/'), '画线人入口没有打开官方网站')
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
  await mobile.getByRole('button', { name: /彩块防线/ }).click()
  await mobile.getByRole('dialog', { name: '彩块防线' }).waitFor()
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机彩块防线横向溢出')
  check(await mobile.locator('.mower-reserve-card').count() === 3, '手机彩块防线备用池不完整')
  await mobile.screenshot({ path: `${artifactsPath}block-defense-mobile-${runId}.png` })
  await mobile.getByRole('button', { name: '退出彩块防线' }).click()
  await mobile.getByRole('button', { name: /深岩淘金/ }).click()
  await mobile.getByRole('dialog', { name: '深岩淘金' }).waitFor()
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机深岩淘金横向溢出')
  await mobile.screenshot({ path: `${artifactsPath}gold-miner-mobile-${runId}.png` })
  await aimAtTutorialTreasure(mobile)
  await mobile.locator('.gold-miner-stage').click()
  await mobile.waitForFunction(() => Number((document.querySelector('[data-testid="gold-score"]')?.textContent ?? '0').replace(/\D/g, '')) >= 600, undefined, { timeout: 12_000 })
  await mobile.getByRole('button', { name: /目标达成，提前收工/ }).click()
  await mobile.getByRole('heading', { name: '矿镇补给站' }).waitFor()
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机补给站横向溢出')
  check(await mobile.locator('.gold-shop-card').count() === 5, '手机补给站没有展示完整五类道具')
  await mobile.screenshot({ path: `${artifactsPath}gold-miner-shop-mobile-${runId}.png` })
  await mobile.getByRole('button', { name: '进入第 2 关' }).scrollIntoViewIfNeeded()
  check(await mobile.getByRole('button', { name: '进入第 2 关' }).isVisible(), '手机补给站无法滚动到下一关按钮')
  await mobile.getByRole('button', { name: '退出深岩淘金' }).click()
  await mobile.getByRole('button', { name: /贪吃蛇/ }).click()
  await mobile.getByRole('dialog', { name: '贪吃蛇' }).waitFor()
  await mobile.waitForFunction(() => document.querySelector('.snake-game-frame')?.contentDocument?.readyState === 'complete')
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机贪吃蛇横向溢出')
  const mobileSnakeFrame = mobile.frames().find((frame) => frame.url().includes('/games/snake/index.html'))
  check(Boolean(mobileSnakeFrame), '手机贪吃蛇内置页面没有加载')
  await mobileSnakeFrame.getByRole('button', { name: '明白了，开始游戏' }).click()
  await mobileSnakeFrame.waitForFunction(() => window.__snakeGame?.getState().state === 'running')
  await mobileSnakeFrame.getByRole('button', { name: '向下' }).click()
  await mobile.screenshot({ path: `${artifactsPath}snake-mobile-${runId}.png` })
  await mobile.getByRole('button', { name: '退出贪吃蛇' }).click()
  await mobile.getByRole('button', { name: /小小画室/ }).click()
  await mobile.getByRole('dialog', { name: '小小画室' }).waitFor()
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机小小画室横向溢出')
  await mobile.getByRole('tab', { name: '照着画' }).click()
  await mobile.screenshot({ path: `${artifactsPath}art-studio-mobile-${runId}.png` })
  await mobile.getByRole('button', { name: '退出小小画室' }).click()
  check(await mobile.getByRole('button', { name: /画线人冒险/ }).count() === 1, '手机端没有官方画线人入口')
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
  check(await tv.locator('.game-launch-card').count() === 5, '电视端游戏入口数量不正确')
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
  await tv.getByRole('button', { name: /彩块防线/ }).focus()
  await tv.keyboard.press('Enter')
  await tv.getByRole('dialog', { name: '彩块防线' }).waitFor()
  const initialSlot = tv.locator('.mower-active-slot').first()
  await initialSlot.focus()
  await tv.keyboard.press('ArrowRight')
  check(await tv.evaluate(() => document.activeElement?.classList.contains('mower-active-slot')) === true, '电视彩块防线没有按发射槽位移动焦点')
  await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true })))
  check(await tv.getByRole('dialog', { name: '彩块防线' }).count() === 0, '电视返回键没有退出彩块防线')
  await tv.getByRole('button', { name: /深岩淘金/ }).focus()
  await tv.keyboard.press('Enter')
  await tv.getByRole('dialog', { name: '深岩淘金' }).waitFor()
  check(await tv.evaluate(() => document.activeElement?.classList.contains('gold-miner-stage')) === true, '电视深岩淘金没有把焦点放到矿洞')
  await aimAtTutorialTreasure(tv)
  await tv.keyboard.press('ArrowDown')
  await tv.waitForFunction(() => Number((document.querySelector('[data-testid="gold-score"]')?.textContent ?? '0').replace(/\D/g, '')) >= 600, undefined, { timeout: 12_000 })
  await tv.getByRole('button', { name: /目标达成，提前收工/ }).focus()
  await tv.keyboard.press('Enter')
  await tv.getByRole('heading', { name: '矿镇补给站' }).waitFor()
  await tv.keyboard.press('ArrowDown')
  check(await tv.evaluate(() => document.activeElement?.classList.contains('gold-buy-button')) === true, '电视补给站没有聚焦第一个购买按钮')
  await tv.screenshot({ path: `${artifactsPath}gold-miner-shop-tv-${runId}.png` })
  await tv.getByRole('button', { name: '从第1关重开' }).focus()
  await tv.keyboard.press('Enter')
  await tv.getByRole('alertdialog').waitFor()
  await tv.waitForFunction(() => document.activeElement?.textContent?.includes('继续当前进度') === true)
  check(await tv.evaluate(() => document.activeElement?.textContent?.includes('继续当前进度')) === true, '电视端重新闯关确认框没有安全聚焦取消按钮')
  await tv.keyboard.press('Enter')
  check(await tv.getByRole('alertdialog').count() === 0, '电视端无法取消重新闯关')
  await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true })))
  check(await tv.getByRole('dialog', { name: '深岩淘金' }).count() === 0, '电视返回键没有退出深岩淘金')
  check(await tv.getByRole('button', { name: /画线人冒险/ }).count() === 0, '电视端不应显示难以用遥控器操作的画线人')
  await tv.getByRole('button', { name: /贪吃蛇/ }).focus()
  await tv.keyboard.press('Enter')
  await tv.getByRole('dialog', { name: '贪吃蛇' }).waitFor()
  await tv.waitForFunction(() => document.querySelector('.snake-game-frame')?.contentDocument?.readyState === 'complete')
  const tvSnakeFrame = tv.frames().find((frame) => frame.url().includes('/games/snake/index.html'))
  check(Boolean(tvSnakeFrame), '电视贪吃蛇内置页面没有加载')
  await tvSnakeFrame.locator('#overlayButton').focus()
  await tv.keyboard.press('Enter')
  await tvSnakeFrame.waitForFunction(() => window.__snakeGame?.getState().state === 'running')
  const snakeHeadBefore = await tvSnakeFrame.evaluate(() => window.__snakeGame.getState().snake[0])
  await tv.keyboard.press('ArrowDown')
  await tvSnakeFrame.waitForFunction((head) => {
    const current = window.__snakeGame?.getState().snake[0]
    return current && (current.x !== head.x || current.y !== head.y)
  }, snakeHeadBefore)
  await tv.keyboard.press('Enter')
  await tvSnakeFrame.waitForFunction(() => window.__snakeGame?.getState().state === 'paused')
  await tv.keyboard.press('Enter')
  await tvSnakeFrame.waitForFunction(() => window.__snakeGame?.getState().state === 'running')
  await tv.screenshot({ path: `${artifactsPath}snake-tv-${runId}.png` })
  await tvSnakeFrame.evaluate(() => window.setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true })), 0))
  check(await tv.getByRole('dialog', { name: '贪吃蛇' }).count() === 0, '电视返回键没有退出贪吃蛇')
  await tv.getByRole('button', { name: /小小画室/ }).focus()
  await tv.keyboard.press('Enter')
  await tv.getByRole('dialog', { name: '小小画室' }).waitFor()
  const tvCanvas = tv.getByLabel(/画布，确认键开始或结束绘画/)
  await tvCanvas.focus()
  await tv.keyboard.press('Enter')
  await tv.keyboard.press('ArrowRight')
  await tv.keyboard.press('ArrowDown')
  await tv.keyboard.press('ArrowRight')
  await tv.keyboard.press('Enter')
  check(await tv.getByRole('button', { name: /保存作品/ }).isEnabled(), '电视遥控器没有在画布上完成笔画')
  await tv.screenshot({ path: `${artifactsPath}art-studio-tv-${runId}.png` })
  await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true })))
  check(await tv.getByRole('dialog', { name: '小小画室' }).count() === 0, '电视返回键没有退出小小画室')
  await tvContext.close()

  check(failures.length === 0, failures.join('\n'))
  console.log(JSON.stringify({ status: 'ok', posterWall: true, childGate: true, desktop: true, mobile: true, tv: true, failures }))
} finally {
  await browser.close()
}
