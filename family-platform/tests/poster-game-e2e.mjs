import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.FAMILYHUB_GAME_E2E_URL ?? 'http://127.0.0.1:4183'
const apiBaseUrl = process.env.FAMILYHUB_GAME_E2E_API ?? 'http://127.0.0.1:2521/api/v1'
const artifactsPath = fileURLToPath(new URL('./artifacts/', import.meta.url))
const runId = Date.now().toString(36)

function check(condition, message) {
  if (!condition) throw new Error(message)
}

function collectFailures(page, failures, label) {
  page.on('pageerror', (error) => failures.push(`${label} page: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    // 浏览器偶尔会在页面/iframe 关闭的瞬间取消资源请求；没有异常和功能断言失败时不视为产品错误。
    if (/Failed to load resource: net::ERR_(?:ABORTED|CONNECTION_REFUSED)$/.test(text)) return
    failures.push(`${label} console: ${text}`)
  })
}

async function login(page, username, password, role) {
  await page.addInitScript((apiBase) => {
    window.localStorage.setItem('lumi-family-platform-api-base-v1', apiBase)
  }, apiBaseUrl)
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

async function isolateBlockDefenseProfile(page) {
  await page.route('**/api/v1/games/block-defense/profile', async (route) => {
    const request = route.request()
    const payload = request.method() === 'PUT' ? request.postDataJSON() : { progress: {}, score: 0 }
    const timestamp = payload.client_updated_at ?? null
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        game_id: 'block-defense',
        user_id: 'child-demo',
        progress: payload.progress ?? {},
        best_score: payload.score ?? 0,
        best_score_at: null,
        client_updated_at: timestamp,
        updated_at: timestamp,
      }),
    })
  })
}

async function pointerDrag(page, source, target) {
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  check(sourceBox && targetBox, '拖拽目标没有出现在屏幕中')
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 })
  await page.mouse.up()
}

async function seedBlockDefenseProgress(page, level = 1, difficulty = 'normal', patch = {}) {
  await page.evaluate(({ currentLevel, currentDifficulty, progressPatch }) => {
    const now = new Date().toISOString()
    const progress = {
      unlockedLevel: 60,
      currentLevel,
      completedLevels: [],
      levelBestScores: {},
      coins: 2_000,
      gears: 60,
      slowLevel: 0,
      chargeLevel: 0,
      slotLevel: 0,
      reserveLevel: 0,
      rerolls: 1,
      universalLaunchers: 0,
      currentDifficulty,
      completedVariants: [],
      energyUnlockedLevels: Array.from({ length: 60 }, (_, index) => index + 1),
      energy: 50,
      energyUpdatedAt: now,
      bestScore: 0,
      ...progressPatch,
    }
    localStorage.setItem('lumi:block-defense-progress:v4:child-demo', JSON.stringify({ progress, updatedAt: now }))
  }, { currentLevel: level, currentDifficulty: difficulty, progressPatch: patch })
}

async function chooseBlockDefenseLevel(page, level, difficultyLabel) {
  await page.getByRole('button', { name: '选择关卡' }).click()
  await page.getByRole('dialog', { name: '彩块防线选关' }).waitFor()
  await page.getByRole('tab', { name: new RegExp(difficultyLabel) }).click()
  await page.getByRole('button', { name: new RegExp(`第 ${level} 关${difficultyLabel}模式`) }).click()
  await page.locator(`.mower-v2-backdrop[data-level="${level}"]`).waitFor()
}

async function loadedSnakeFrame(page, errorMessage) {
  await page.waitForFunction(() => {
    const frame = document.querySelector('.snake-game-frame')
    try {
      return frame?.contentWindow?.location.pathname.endsWith('/games/snake/index.html')
        && frame.contentDocument?.readyState === 'complete'
        && Boolean(frame.contentWindow.__snakeGame)
    } catch {
      return false
    }
  })
  const frame = page.frames().find((candidate) => candidate.url().includes('/games/snake/index.html'))
  check(Boolean(frame), errorMessage)
  return frame
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
  await isolateBlockDefenseProfile(child)
  await login(child, 'child-demo', 'ChildDemo2026', 'child')
  check(await child.getByRole('button', { name: '家庭海报墙' }).count() === 0, '儿童端不应出现家长海报墙')
  await child.getByLabel('主导航').getByRole('button', { name: '小游戏', exact: true }).click()
  await child.getByRole('heading', { name: '小游戏' }).waitFor()
  check(await child.locator('.game-launch-card').count() === 6, '电脑端没有展示完整的六个游戏入口')
  await child.getByRole('button', { name: '排行榜', exact: true }).click()
  await child.getByRole('dialog', { name: '家庭游戏排行榜' }).waitFor()
  check(await child.getByRole('tab').count() === 4, '家庭排行榜没有覆盖四款积分游戏')
  await child.screenshot({ path: `${artifactsPath}game-leaderboard-desktop-${runId}.png` })
  await child.getByRole('button', { name: '关闭排行榜' }).click()
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
  check(await child.locator('.mower-v2-block').count() === 30, '彩块防线第一关应生成 30 个教学色块')
  check(await child.locator('.mower-v2-field').getAttribute('data-lanes') === '3', '彩块防线第一关应从三列开始')
  check(Number(await child.locator('.mower-v2-field').getAttribute('data-front-progress')) < 34, '彩块防线初始刷新位置没有向远处移动约 20%')
  check(await child.locator('.mower-active-slot').count() === 2, '彩块防线初始发射槽位不是两个')
  check(await child.locator('.mower-reserve-card').count() === 5, '彩块防线初始备用池不是五格')
  check(await child.locator('.mower-active-slot').first().getAttribute('data-capacity') === '9', '普通难度发射器弹量不是 9 发')
  check(await child.locator('.mower-v2-block.is-targetable').count() > 0 && await child.locator('.mower-v2-block.is-covered').count() > 0, '彩块防线没有区分可攻击前层与被遮挡后层')
  const targetableLanes = await child.locator('.mower-v2-block.is-targetable').evaluateAll((blocks) => blocks.map((block) => block.getAttribute('data-lane')))
  check(new Set(targetableLanes).size === targetableLanes.length, '彩块防线同一投影列暴露了多个未穿透目标')
  await child.getByRole('button', { name: '选择关卡' }).click()
  await child.getByRole('dialog', { name: '彩块防线选关' }).waitFor()
  check(await child.getByRole('tab').count() === 3, '选关页没有简单、普通、困难三档')
  check(await child.locator('.mower-level-grid button').count() === 60, '彩块防线没有生成 60 个固定关卡')
  check(await child.getByRole('button', { name: /第 2 关普通模式，请先通关前一关/ }).isDisabled(), '未通关第一关时仍然可以跳到第二关')
  check(await child.getByRole('button', { name: /第 20 关普通模式，请先通关前一关/ }).isDisabled(), '未通关关卡仍然允许跨关跳转')
  check(await child.locator('.mower-level-grid button:not([disabled])').count() === 1, '新账户应只解锁第 1 关')
  await child.getByRole('tab', { name: /困难/ }).click()
  await child.getByRole('button', { name: /第 1 关困难模式/ }).click()
  check(await child.locator('.mower-v2-backdrop').getAttribute('data-difficulty') === 'hard', '关卡没有切换到困难模式')
  check(await child.locator('.mower-active-slot').first().getAttribute('data-capacity') === '12', '困难难度发射器弹量不是 12 发')
  await child.getByRole('button', { name: '选择关卡' }).click()
  await child.getByRole('tab', { name: /简单/ }).click()
  await child.getByRole('button', { name: /第 1 关简单模式/ }).click()
  check(await child.locator('.mower-active-slot').first().getAttribute('data-capacity') === '7', '简单难度发射器弹量不是 7 发')
  await child.getByRole('button', { name: '选择关卡' }).click()
  await child.getByRole('tab', { name: /普通/ }).click()
  await child.getByRole('button', { name: /第 1 关普通模式/ }).click()
  await child.screenshot({ path: `${artifactsPath}block-defense-levels-desktop-${runId}.png` })
  await pointerDrag(child, child.locator('.mower-reserve-card').first(), child.locator('.mower-active-slot').first())
  await child.getByText(/已装入，正在充能/).waitFor()
  check(await child.locator('.mower-active-slot.is-charging').count() > 0, '备用发射器换装后没有充能等待')
  await child.getByRole('button', { name: '成长工坊', exact: true }).click()
  await child.getByRole('heading', { name: '成长工坊' }).waitFor()
  check(await child.locator('.mower-upgrade-card').count() === 4, '成长工坊应只保留缓速、充能、槽位和备用池四类升级')
  await child.getByRole('button', { name: '回到战场' }).click()
  await child.screenshot({ path: `${artifactsPath}block-defense-desktop-${runId}.png` })
  await child.getByRole('button', { name: '退出彩块防线' }).click()

  await seedBlockDefenseProgress(child, 1, 'normal', { slotLevel: 8 })
  await child.getByRole('button', { name: /彩块防线/ }).click()
  check(await child.locator('.mower-active-slot').count() === 10, '发射槽位升到 8 级后没有扩展为 10 个')
  check(await child.locator('.mower-v2-active-row.is-multirow').count() === 1, '十槽位没有启用双排布局')
  await child.screenshot({ path: `${artifactsPath}block-defense-ten-slots-desktop-${runId}.png` })
  await child.getByRole('button', { name: '退出彩块防线' }).click()

  await seedBlockDefenseProgress(child, 1, 'normal', { completedLevels: Array.from({ length: 59 }, (_, index) => index + 1) })
  await child.getByRole('button', { name: /彩块防线/ }).click()
  const field = child.locator('.mower-v2-field')
  for (const [level, lanes] of [[1, 3], [2, 5], [3, 7], [4, 9], [5, 11]]) {
    if (level > 1) await chooseBlockDefenseLevel(child, level, '普通')
    check(await field.getAttribute('data-lanes') === String(lanes), `彩块防线第 ${level} 关列数不是 ${lanes}`)
  }
  for (const [level, total] of [[20, 150], [30, 200], [40, 300], [50, 400]]) {
    await chooseBlockDefenseLevel(child, level, '普通')
    check(await field.getAttribute('data-block-total') === String(total), `彩块防线第 ${level} 关色块总量不是 ${total}`)
  }
  await chooseBlockDefenseLevel(child, 60, '困难')
  check(Number(await field.getAttribute('data-signature-types')) <= 30, '高关卡生成了颜色和五种形状之外的目标类型')
  check(await field.locator('[class*="pattern-"]').count() === 0, '高关卡仍然生成了花纹块')
  const hardSpeed = Number(await field.getAttribute('data-advance-speed'))
  check(await field.getAttribute('data-field-length') === '120', '彩块防线场景长度没有扩展到 120%')
  await chooseBlockDefenseLevel(child, 15, '普通')
  const normalSpeed = Number(await field.getAttribute('data-advance-speed'))
  await chooseBlockDefenseLevel(child, 15, '简单')
  const easySpeed = Number(await field.getAttribute('data-advance-speed'))
  check(hardSpeed > normalSpeed && normalSpeed > easySpeed, '三档难度没有按简单、普通、困难逐级加快')
  check(normalSpeed < 0.9, '彩块防线普通难度推进速度没有整体降低约 20%')
  await child.getByRole('button', { name: '退出彩块防线' }).click()

  await seedBlockDefenseProgress(child, 1, 'easy', { completedLevels: [1], completedVariants: ['easy:1'] })
  await child.getByRole('button', { name: /彩块防线/ }).click()
  await child.getByRole('button', { name: '选择关卡' }).click()
  await child.getByRole('tab', { name: /简单/ }).click()
  check(await child.getByRole('button', { name: /第 1 关简单模式，本难度已通关/ }).count() === 1, '简单模式通关记录没有保留')
  await child.getByRole('tab', { name: /普通/ }).click()
  check(await child.getByRole('button', { name: /第 1 关普通模式，已通关关卡，可重玩/ }).count() === 1, '已通关关卡不能切换其他难度重玩')
  check(!await child.getByRole('button', { name: /第 2 关普通模式，下一关/ }).isDisabled(), '首关通关后没有开放紧邻的下一关')
  check(await child.getByRole('button', { name: /第 3 关普通模式，请先通关前一关/ }).isDisabled(), '首关通关后仍然可以越过第二关')
  await child.getByRole('button', { name: '关闭选关' }).click()
  await child.getByRole('button', { name: '退出彩块防线' }).click()

  await child.getByRole('button', { name: /深岩淘金/ }).click()
  await child.getByRole('dialog', { name: '深岩淘金' }).waitFor()
  check(await child.locator('.gold-treasure[data-kind]').count() === 20, '深岩淘金第一关没有生成完整的新手宝藏')
  await child.getByText('600', { exact: true }).first().waitFor()
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
    const key = 'lumi:deep-mine-progress:v2:child-demo'
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
  await child.getByText('600', { exact: true }).first().waitFor()
  await child.waitForFunction(() => {
    const progress = JSON.parse(localStorage.getItem('lumi:deep-mine-progress:v2:child-demo') ?? '{}')
    return progress.level === 1 && progress.highestLevel === 1 && progress.score === 0 && progress.inventory?.dynamite === 0
  })
  await child.keyboard.press('Escape')

  await child.evaluate(() => localStorage.setItem('lumi:deep-mine-progress:v2:child-demo', JSON.stringify({
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
    const progress = JSON.parse(localStorage.getItem('lumi:deep-mine-progress:v2:child-demo') ?? '{}')
    progress.level = 20
    progress.highestLevel = 20
    progress.score = 45_000
    localStorage.setItem('lumi:deep-mine-progress:v2:child-demo', JSON.stringify(progress))
  })
  await child.getByRole('button', { name: /深岩淘金/ }).click()
  check(await child.locator('.gold-treasure[data-kind^="trash-"]').count() >= 7, '第 20 关没有生成完整垃圾干扰物')
  await child.keyboard.press('Escape')

  await child.getByRole('button', { name: /贪吃蛇/ }).click()
  await child.getByRole('dialog', { name: '贪吃蛇' }).waitFor()
  const desktopSnakeFrame = await loadedSnakeFrame(child, '贪吃蛇内置页面没有加载')
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
  check(await child.getByRole('tab', { name: /简单/ }).count() === 1 && await child.getByRole('tab', { name: /中等/ }).count() === 1 && await child.getByRole('tab', { name: /复杂/ }).count() === 0, '小小画室没有按要求保留简单、中等并移除复杂光影课程')
  check(Number(await child.locator('.art-studio-backdrop').getAttribute('data-open-trace-total')) >= 100, '开源简笔画题库不足 100 幅')
  check(Number(await child.locator('.art-studio-backdrop').getAttribute('data-art-template-total')) >= 109, '小小画室总题库没有包含保留课程和开源线稿')
  check(await child.locator('.art-template-picker button').count() === 24, '简单临摹题库没有按 24 幅分页展示')
  await child.getByRole('searchbox', { name: '搜索临摹图' }).fill('苹果')
  check(await child.locator('.art-template-picker button').count() === 1, '临摹题库搜索没有定位到苹果线稿')
  await child.locator('.art-template-picker button').first().click()
  check(await child.locator('.art-source-note').textContent() === '开源线稿 · Lucide ISC', '开源线稿没有展示来源标识')
  await child.getByRole('tab', { name: /中等/ }).click()
  check(await child.locator('.art-template-picker button').count() === 24, '中等临摹题库没有正确加载')
  await child.getByRole('searchbox', { name: '搜索临摹图' }).fill('好奇小猫')
  check(await child.locator('.art-template-picker button').count() === 1, '中等临摹题库搜索没有定位到小猫线稿')
  check(await child.locator('.art-reference-heading').getAttribute('data-art-difficulty') === 'medium', '中等课题没有切换成功')
  check(await child.locator('.art-lesson-card li').count() === 3, '中等课题没有分步骤绘画指导')
  await child.getByRole('button', { name: '放大画布' }).click()
  check(await child.locator('.art-zoom-control span').textContent() === '150%', '精细绘画缩放没有生效')
  for (const toolName of ['铅笔', '画笔', '平刷', '马克笔', '喷漆', '毛笔', '水墨', '插入文字', '橡皮擦']) {
    check(await child.getByRole('button', { name: toolName, exact: true }).count() === 1, `小小画室缺少${toolName}工具`)
  }
  check(await child.getByLabel('自定义画笔颜色').count() === 1, '小小画室缺少自定义颜色')
  await child.getByRole('button', { name: '缩小画布' }).click()
  const drawingCanvas = child.getByLabel('绘画画布')
  const strokesBefore = await drawingCanvas.evaluate((canvas) => canvas.toDataURL())
  for (const [index, toolName] of ['喷漆', '毛笔', '水墨', '平刷'].entries()) {
    await child.getByRole('button', { name: toolName, exact: true }).click()
    const box = await drawingCanvas.boundingBox()
    check(Boolean(box), `${toolName}未找到画布`)
    await child.mouse.move(box.x + box.width * (0.14 + index * 0.18), box.y + box.height * 0.72)
    await child.mouse.down()
    await child.mouse.move(box.x + box.width * (0.20 + index * 0.18), box.y + box.height * 0.62, { steps: 5 })
    await child.mouse.up()
  }
  check(await drawingCanvas.evaluate((canvas) => canvas.toDataURL()) !== strokesBefore, '新增画笔没有在画布像素上产生笔迹')
  await child.getByRole('button', { name: '插入文字', exact: true }).click()
  await child.getByLabel('要插入画面的文字').fill('你好，世界')
  const artCanvasBox = await child.getByLabel('绘画画布').boundingBox()
  check(Boolean(artCanvasBox), '小小画室画布不可见')
  await child.mouse.click(artCanvasBox.x + artCanvasBox.width * 0.25, artCanvasBox.y + artCanvasBox.height * 0.25)
  check(await child.getByRole('button', { name: /保存作品/ }).isEnabled(), '插入文字没有写入画布历史')
  await child.getByRole('button', { name: '画笔', exact: true }).click()
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
  const desktopFrame = child.locator('.art-canvas-frame')
  const desktopWidthBeforePan = Number(await desktopFrame.getAttribute('data-canvas-width'))
  await child.getByRole('button', { name: '拖动画布' }).click()
  const desktopPanCanvas = await drawingCanvas.boundingBox()
  check(Boolean(desktopPanCanvas), '桌面画室无法进入画布拖动模式')
  await child.mouse.move(desktopPanCanvas.x + desktopPanCanvas.width * 0.5, desktopPanCanvas.y + desktopPanCanvas.height * 0.5)
  await child.mouse.down()
  await child.mouse.move(desktopPanCanvas.x + desktopPanCanvas.width * 0.72, desktopPanCanvas.y + desktopPanCanvas.height * 0.5, { steps: 8 })
  await child.mouse.up()
  await child.waitForFunction((previousWidth) => Number(document.querySelector('.art-canvas-frame')?.getAttribute('data-canvas-width')) > previousWidth, desktopWidthBeforePan)
  check(Number(await desktopFrame.getAttribute('data-canvas-min-x')) < 0, '桌面画布向左拖动后没有生成新的可绘制区域')
  const originalDrawingPreserved = await drawingCanvas.evaluate((canvas) => {
    const frame = canvas.parentElement
    const x = -Number(frame?.getAttribute('data-canvas-min-x') ?? 0)
    const y = -Number(frame?.getAttribute('data-canvas-min-y') ?? 0)
    const pixels = canvas.getContext('2d').getImageData(x, y, 960, 640).data
    let painted = 0
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 20) painted += 1
    return painted > 100
  })
  check(originalDrawingPreserved, '扩展画布后原有笔迹消失或坐标偏移')
  const newRegion = await child.evaluate(() => {
    const frame = document.querySelector('.art-canvas-frame')
    const viewport = document.querySelector('.art-canvas-viewport')
    const bounds = frame.getBoundingClientRect()
    const view = viewport.getBoundingClientRect()
    const origin = bounds.left + (-Number(frame.getAttribute('data-canvas-min-x')) / Number(frame.getAttribute('data-canvas-width'))) * bounds.width
    return { x: view.left + 20, y: Math.max(view.top + 20, Math.min(view.bottom - 20, bounds.top + bounds.height / 2)), origin }
  })
  check(newRegion.x < newRegion.origin - 8, '画布扩展没有露出可绘制的新区域')
  await child.getByRole('button', { name: '拖动画布' }).click()
  await child.mouse.move(newRegion.x, newRegion.y)
  await child.mouse.down()
  await child.mouse.move(newRegion.x + 12, newRegion.y + 12, { steps: 4 })
  await child.mouse.up()
  check(await drawingCanvas.evaluate((canvas, position) => {
    const bounds = canvas.getBoundingClientRect()
    const x = Math.floor((position.x - bounds.left) / bounds.width * canvas.width)
    const y = Math.floor((position.y - bounds.top) / bounds.height * canvas.height)
    const pixels = canvas.getContext('2d').getImageData(x - 8, y - 8, 36, 36).data
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 20) return true
    return false
  }, newRegion), '扩展区域无法落笔')
  await child.screenshot({ path: `${artifactsPath}art-studio-expanded-desktop-${runId}.png` })
  await child.getByRole('button', { name: '看看完成度' }).click()
  await child.getByRole('button', { name: '画布回到中心' }).click()
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
  await isolateBlockDefenseProfile(mobile)
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
  await seedBlockDefenseProgress(mobile, 1, 'normal', { slotLevel: 8 })
  await mobile.getByRole('button', { name: /彩块防线/ }).click()
  await mobile.getByRole('dialog', { name: '彩块防线' }).waitFor()
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机彩块防线横向溢出')
  check(await mobile.locator('.mower-active-slot').count() === 10, '手机端没有显示升级后的 10 个发射槽位')
  check(await mobile.locator('.mower-reserve-card').count() === 5, '手机彩块防线备用池不完整')
  await pointerDrag(mobile, mobile.locator('.mower-reserve-card').first(), mobile.locator('.mower-active-slot').first())
  await mobile.getByText(/已装入，正在充能/).waitFor()
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
  check(await mobile.locator('.gold-shop-card').count() === 6, '手机补给站没有展示完整六类道具')
  await mobile.locator('.gold-shop-card.tool-aim-guide').getByText('矿洞瞄准镜', { exact: true }).waitFor()
  await mobile.locator('.gold-shop-card.tool-aim-guide').getByRole('button', { name: '购买 480' }).waitFor()
  await mobile.screenshot({ path: `${artifactsPath}gold-miner-shop-mobile-${runId}.png` })
  await mobile.getByRole('button', { name: '进入第 2 关' }).scrollIntoViewIfNeeded()
  check(await mobile.getByRole('button', { name: '进入第 2 关' }).isVisible(), '手机补给站无法滚动到下一关按钮')
  await mobile.getByRole('button', { name: '退出深岩淘金' }).click()
  await mobile.getByRole('button', { name: /贪吃蛇/ }).click()
  await mobile.getByRole('dialog', { name: '贪吃蛇' }).waitFor()
  const mobileSnakeFrame = await loadedSnakeFrame(mobile, '手机贪吃蛇内置页面没有加载')
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机贪吃蛇横向溢出')
  await mobileSnakeFrame.getByRole('button', { name: '明白了，开始游戏' }).click()
  await mobileSnakeFrame.waitForFunction(() => window.__snakeGame?.getState().state === 'running')
  await mobileSnakeFrame.getByRole('button', { name: '向下' }).click()
  await mobile.screenshot({ path: `${artifactsPath}snake-mobile-${runId}.png` })
  await mobile.getByRole('button', { name: '退出贪吃蛇' }).click()
  await mobile.getByRole('button', { name: /小小画室/ }).click()
  await mobile.getByRole('dialog', { name: '小小画室' }).waitFor()
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机小小画室横向溢出')
  check(await mobile.locator('.art-tool-segment button').count() === 9, '手机画室没有显示完整的九种工具')
  check(await mobile.locator('.art-tool-segment button').last().isVisible(), '手机画室最后一个工具被隐藏')
  await mobile.getByRole('tab', { name: '照着画' }).click()
  const mobileFrame = mobile.locator('.art-canvas-frame')
  const mobileWidthBeforePan = Number(await mobileFrame.getAttribute('data-canvas-width'))
  await mobile.getByRole('button', { name: '拖动画布' }).scrollIntoViewIfNeeded()
  await mobile.getByRole('button', { name: '拖动画布' }).click()
  const mobileDrawingCanvas = mobile.getByLabel('绘画画布')
  const mobileCanvasBox = await mobileDrawingCanvas.boundingBox()
  check(Boolean(mobileCanvasBox), '手机画室无法进入画布拖动模式')
  await mobile.mouse.move(mobileCanvasBox.x + mobileCanvasBox.width * 0.5, mobileCanvasBox.y + mobileCanvasBox.height * 0.5)
  await mobile.mouse.down()
  await mobile.mouse.move(mobileCanvasBox.x + mobileCanvasBox.width * 0.72, mobileCanvasBox.y + mobileCanvasBox.height * 0.5, { steps: 8 })
  await mobile.mouse.up()
  await mobile.waitForFunction((previousWidth) => Number(document.querySelector('.art-canvas-frame')?.getAttribute('data-canvas-width')) > previousWidth, mobileWidthBeforePan)
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机扩展画布后出现页面横向溢出')
  await mobile.getByRole('button', { name: '画布回到中心' }).click()
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
  await isolateBlockDefenseProfile(tv)
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
  await seedBlockDefenseProgress(tv, 1, 'normal', { slotLevel: 8 })
  await tv.getByRole('button', { name: /彩块防线/ }).focus()
  await tv.keyboard.press('Enter')
  await tv.getByRole('dialog', { name: '彩块防线' }).waitFor()
  check(await tv.locator('.mower-active-slot').count() === 10, '电视端没有显示升级后的 10 个发射槽位')
  const initialSlot = tv.locator('.mower-active-slot').first()
  await initialSlot.focus()
  await tv.keyboard.press('ArrowRight')
  check(await tv.evaluate(() => document.activeElement?.closest('.mower-active-unit') !== null) === true, '电视彩块防线焦点离开了当前发射单元')
  await tv.locator('.mower-reserve-card').first().focus()
  await tv.keyboard.press('Enter')
  await tv.getByRole('dialog', { name: '选择换装槽位' }).waitFor()
  check(await tv.locator('.mower-slot-picker > div > button').count() === 10, '电视换装弹窗没有列出全部 10 个发射槽位')
  await tv.locator('.mower-slot-picker > div > button').first().focus()
  await tv.keyboard.press('Enter')
  await tv.getByText(/已装入，正在充能/).waitFor()
  await tv.screenshot({ path: `${artifactsPath}block-defense-tv-${runId}.png` })
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
  const tvSnakeFrame = await loadedSnakeFrame(tv, '电视贪吃蛇内置页面没有加载')
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
