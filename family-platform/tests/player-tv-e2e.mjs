import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.FAMILYHUB_PLAYER_E2E_URL ?? 'http://127.0.0.1:4181'
const apiBase = process.env.FAMILYHUB_PLAYER_E2E_API_BASE
const artifactsPath = fileURLToPath(new URL('./artifacts/', import.meta.url))
const runId = Date.now().toString(36)

function check(condition, message) {
  if (!condition) throw new Error(message)
}

async function createContext(browser, options) {
  const context = await browser.newContext(options)
  // 播放器手势和遥控器测试使用确定性的媒体时钟，不依赖公网视频或正式家庭片库。
  await context.addInitScript(() => {
    const states = new WeakMap()
    const stateFor = (element) => {
      if (!states.has(element)) {
        states.set(element, { paused: true, currentTime: 0, volume: 1, playbackRate: 1 })
      }
      return states.get(element)
    }
    const media = HTMLMediaElement.prototype
    Object.defineProperties(media, {
      paused: { configurable: true, get() { return stateFor(this).paused } },
      duration: { configurable: true, get() { return 120 } },
      currentTime: {
        configurable: true,
        get() { return stateFor(this).currentTime },
        set(value) {
          stateFor(this).currentTime = Math.max(0, Math.min(120, Number(value) || 0))
          this.dispatchEvent(new Event('timeupdate'))
        },
      },
      volume: {
        configurable: true,
        get() { return stateFor(this).volume },
        set(value) {
          stateFor(this).volume = Math.max(0, Math.min(1, Number(value) || 0))
          this.dispatchEvent(new Event('volumechange'))
        },
      },
      playbackRate: {
        configurable: true,
        get() { return stateFor(this).playbackRate },
        set(value) {
          stateFor(this).playbackRate = Number(value) || 1
          this.dispatchEvent(new Event('ratechange'))
        },
      },
    })
    media.play = function play() {
      stateFor(this).paused = false
      this.dispatchEvent(new Event('play'))
      return Promise.resolve()
    }
    media.pause = function pause() {
      stateFor(this).paused = true
      this.dispatchEvent(new Event('pause'))
    }
  })
  await context.route('**/api/v1/bootstrap', async (route) => {
    const response = await route.fetch()
    const payload = await response.json()
    const testVideo = payload.catalog?.find((item) => item.id === 'great-movie')
    if (testVideo) {
      testVideo.title = '千与千寻'
      testVideo.subtitle = '播放器自动测试条目'
      testVideo.tags = ['动画', '宫崎骏']
      testVideo.local_available = true
      testVideo.playable = true
      testVideo.playback_mode = 'local_asset'
      testVideo.launch_allowed = true
    }
    await route.fulfill({ response, json: payload })
  })
  await context.route('**/api/v1/catalog/great-movie/launch', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ mode: 'local_asset', url: 'https://media.lumi.test/player-sample.mp4' }),
  }))
  await context.route('https://media.lumi.test/**', (route) => route.fulfill({
    status: 200,
    contentType: 'video/mp4',
    body: '',
  }))
  if (apiBase) {
    await context.route('**/api/v1/**', (route) => {
      const requestUrl = new URL(route.request().url())
      const destination = new URL(apiBase)
      requestUrl.protocol = destination.protocol
      requestUrl.host = destination.host
      return route.continue({ url: requestUrl.toString() })
    })
  }
  return context
}

async function login(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByLabel('账号').fill('guardian-demo')
  await page.getByLabel('密码', { exact: true }).fill('GuardianDemo2026')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.locator('.role-guardian').waitFor()
}

async function openTestVideo(page) {
  const search = page.getByLabel('搜索全部家庭资源')
  if ((await search.getAttribute('readonly')) === null) await search.fill('qyqx')
  const card = page.locator('.content-card').filter({ hasText: '千与千寻' }).first()
  await card.waitFor()
  await card.locator('button.card-copy').click()
  await page.locator('.lumi-video-player').waitFor()
  check(await page.locator('.detail-modal').count() === 0, '点击可播放视频仍然打开了详情弹窗')
  await page.locator('.lumi-video-player video').evaluate((video) => video.play().catch(() => undefined))
}

async function playerLayout(page, label) {
  const player = await page.locator('.lumi-video-player').boundingBox()
  const controls = await page.locator('.video-bottom-controls').boundingBox()
  check(player && controls, `${label}: 播放器或控制栏不可见`)
  check(controls.x >= player.x - 1 && controls.y >= player.y - 1, `${label}: 控制栏越出播放器左上边界`)
  check(controls.x + controls.width <= player.x + player.width + 1, `${label}: 控制栏横向越界`)
  check(controls.y + controls.height <= player.y + player.height + 1, `${label}: 控制栏纵向越界`)
  check(!await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), `${label}: 页面产生横向溢出`)
}

await mkdir(artifactsPath, { recursive: true })
const browser = await chromium.launch({ executablePath: edgePath, headless: true })
try {
  const desktopContext = await createContext(browser, { viewport: { width: 1440, height: 980 }, locale: 'zh-CN' })
  const desktop = await desktopContext.newPage()
  await login(desktop)
  await desktop.getByLabel('仅视频').check()
  const videoCount = await desktop.locator('.content-card').count()
  check(videoCount > 0, '仅视频筛选没有返回视频内容')
  check(await desktop.locator('.content-card .kind-chip').evaluateAll((chips) => chips.every((chip) => chip.textContent?.includes('看一看'))), '仅视频筛选混入了其他资源类型')
  await desktop.getByLabel('仅视频').uncheck()
  await openTestVideo(desktop)
  await playerLayout(desktop, '桌面端')
  const desktopVideo = desktop.locator('.lumi-video-player video')
  const clickSurface = desktop.locator('.video-gesture-zone')
  await desktop.waitForFunction(() => {
    const video = document.querySelector('.lumi-video-player video')
    return video instanceof HTMLVideoElement && !video.paused
  })
  await clickSurface.click({ position: { x: 180, y: 220 } })
  await desktop.waitForFunction(() => document.querySelector('.lumi-video-player video')?.paused === true)
  await clickSurface.click({ position: { x: 180, y: 220 } })
  await desktop.waitForFunction(() => document.querySelector('.lumi-video-player video')?.paused === false)
  await desktop.getByRole('button', { name: '播放速度' }).click()
  await desktop.getByRole('button', { name: '3x' }).click()
  check(await desktopVideo.evaluate((video) => video.playbackRate) === 3, '桌面端 3 倍速没有生效')
  await desktop.locator('.lumi-video-player').focus()
  await desktopVideo.evaluate((video) => { video.currentTime = 1 })
  await desktop.keyboard.press('Shift+ArrowRight')
  check(await desktopVideo.evaluate((video) => video.currentTime) >= 1.8, '桌面端一秒精确前进没有生效')
  await desktopVideo.evaluate((video) => { video.pause(); video.currentTime = 2 })
  await desktop.keyboard.down('ArrowRight')
  // 无头浏览器会同时降低延时器和循环计时器的频率，等待两次降频边界。
  await desktop.waitForTimeout(2500)
  await desktop.keyboard.up('ArrowRight')
  const heldForwardTime = await desktopVideo.evaluate((video) => video.currentTime)
  check(heldForwardTime >= 8.5, `桌面端长按右键没有连续快进，实际位置：${heldForwardTime}`)
  await desktop.keyboard.down('ArrowLeft')
  await desktop.waitForTimeout(2500)
  await desktop.keyboard.up('ArrowLeft')
  check(await desktopVideo.evaluate((video) => video.currentTime) <= heldForwardTime - 7, '桌面端长按左键没有连续快退')
  await desktopVideo.evaluate((video) => { video.muted = false; video.volume = 0.5 })
  await desktop.keyboard.press('ArrowUp')
  check(await desktopVideo.evaluate((video) => video.volume) > 0.5, '桌面端上键没有提高音量')
  await desktop.keyboard.press('ArrowDown')
  check(Math.abs(await desktopVideo.evaluate((video) => video.volume) - 0.5) < 0.01, '桌面端下键没有降低音量')
  await desktop.screenshot({ path: `${artifactsPath}player-desktop-${runId}.png` })
  await desktop.getByRole('button', { name: '关闭播放器' }).click()
  await desktopContext.close()

  const mobileContext = await createContext(browser, {
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 16; 24129PN74C) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36',
  })
  const mobile = await mobileContext.newPage()
  await login(mobile)
  await mobile.locator('.search-box').click()
  await mobile.getByLabel('搜索全部家庭资源').fill('qyqx')
  await openTestVideo(mobile)
  await playerLayout(mobile, '手机端')
  const mobilePlayer = await mobile.locator('.lumi-video-player').boundingBox()
  check(mobilePlayer, '手机端播放器没有尺寸')
  check(await mobile.locator('video').evaluate((video) => video.currentTime === 0), '手机端新视频没有从 0 秒开始播放')
  const startTime = await mobile.locator('video').evaluate((video) => { video.currentTime = 2; return video.currentTime })
  await mobile.mouse.move(mobilePlayer.x + 90, mobilePlayer.y + mobilePlayer.height / 2)
  await mobile.mouse.down()
  await mobile.mouse.move(mobilePlayer.x + 190, mobilePlayer.y + mobilePlayer.height / 2, { steps: 8 })
  check(await mobile.locator('video').evaluate((video) => video.paused), '手机横滑预览时没有暂停播放')
  await mobile.mouse.up()
  const swipedTime = await mobile.locator('video').evaluate((video) => video.currentTime)
  check(swipedTime > startTime, '手机向右滑动没有前进')
  await mobile.locator('video').evaluate((video) => { video.pause(); video.currentTime = 2 })
  await mobile.mouse.move(mobilePlayer.x + 90, mobilePlayer.y + mobilePlayer.height / 2)
  await mobile.mouse.down()
  await mobile.mouse.move(mobilePlayer.x + 115, mobilePlayer.y + mobilePlayer.height / 2, { steps: 4 })
  await mobile.mouse.up()
  const fineSeekTime = await mobile.locator('video').evaluate((video) => video.currentTime)
  await mobile.locator('video').evaluate((video) => { video.pause(); video.currentTime = 2 })
  await mobile.mouse.move(mobilePlayer.x + 90, mobilePlayer.y + mobilePlayer.height / 2)
  await mobile.mouse.down()
  await mobile.mouse.move(mobilePlayer.x + 340, mobilePlayer.y + mobilePlayer.height / 2, { steps: 8 })
  await mobile.mouse.up()
  const fastSeekTime = await mobile.locator('video').evaluate((video) => video.currentTime)
  check(fastSeekTime - 2 > (fineSeekTime - 2) * 2, `手机大幅横滑没有切换到非线性快速定位：精细=${fineSeekTime}，快速=${fastSeekTime}`)
  await mobile.locator('video').evaluate((video) => { video.muted = false; video.volume = 0.4 })
  await mobile.mouse.move(mobilePlayer.x + 24, mobilePlayer.y + mobilePlayer.height * 0.68)
  await mobile.mouse.down()
  await mobile.mouse.move(mobilePlayer.x + 24, mobilePlayer.y + mobilePlayer.height * 0.34, { steps: 6 })
  await mobile.mouse.up()
  const brightValue = await mobile.locator('.lumi-video-player').evaluate((player) => Number.parseFloat(player.style.getPropertyValue('--video-brightness')))
  check(brightValue > 1, '手机左侧上滑没有提高画面亮度')
  await mobile.mouse.move(mobilePlayer.x + mobilePlayer.width - 24, mobilePlayer.y + mobilePlayer.height * 0.68)
  await mobile.mouse.down()
  await mobile.mouse.move(mobilePlayer.x + mobilePlayer.width - 24, mobilePlayer.y + mobilePlayer.height * 0.34, { steps: 6 })
  await mobile.mouse.up()
  check(await mobile.locator('video').evaluate((video) => video.volume > 0.4), '手机右侧上滑没有提高音量')
  await mobile.mouse.move(mobilePlayer.x + mobilePlayer.width / 2, mobilePlayer.y + mobilePlayer.height * 0.68)
  await mobile.mouse.down()
  await mobile.waitForTimeout(620)
  await mobile.getByText('2倍速播放中 · 上滑锁定').waitFor()
  await mobile.mouse.move(mobilePlayer.x + mobilePlayer.width / 2, mobilePlayer.y + mobilePlayer.height * 0.38, { steps: 6 })
  await mobile.mouse.up()
  await mobile.getByRole('button', { name: /2倍速已锁定/ }).waitFor()
  check(await mobile.locator('video').evaluate((video) => video.playbackRate) === 2, '手机长按锁定倍速没有生效')
  await mobile.getByRole('button', { name: /2倍速已锁定/ }).click()
  check(await mobile.locator('video').evaluate((video) => video.playbackRate) === 1, '手机倍速解锁后没有恢复正常速度')
  await mobile.getByRole('button', { name: '全屏' }).click({ force: true })
  await mobile.waitForFunction(() => Boolean(document.fullscreenElement))
  const fullscreenPlayer = await mobile.locator('.lumi-video-player').boundingBox()
  check(fullscreenPlayer && fullscreenPlayer.width >= 389 && fullscreenPlayer.height >= 843, '手机播放器没有覆盖全屏')
  const controlsBeforeTap = await mobile.locator('.lumi-video-player').evaluate((player) => player.classList.contains('controls-visible'))
  await mobile.locator('.video-gesture-zone').click({ position: { x: fullscreenPlayer.width / 2, y: fullscreenPlayer.height / 2 } })
  await mobile.waitForFunction((before) => document.querySelector('.lumi-video-player')?.classList.contains('controls-visible') !== before, controlsBeforeTap)
  await mobile.locator('.video-gesture-zone').click({ position: { x: fullscreenPlayer.width / 2, y: fullscreenPlayer.height / 2 } })
  await mobile.waitForFunction((before) => document.querySelector('.lumi-video-player')?.classList.contains('controls-visible') === before, controlsBeforeTap)
  await mobile.screenshot({ path: `${artifactsPath}player-mobile-${runId}.png` })
  const nativeBackHandled = await mobile.evaluate(() => {
    const event = new Event('lumi:native-back', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
  check(nativeBackHandled, '手机系统返回没有被播放器接管')
  await mobile.locator('.lumi-video-player').waitFor({ state: 'detached' })
  await mobile.waitForFunction(() => !document.fullscreenElement)
  await mobileContext.close()

  const tvContext = await createContext(browser, {
    viewport: { width: 1280, height: 720 },
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Linux; Android 11; SHIELD Android TV) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  })
  const tv = await tvContext.newPage()
  await login(tv)
  check(await tv.evaluate(() => document.documentElement.classList.contains('tv-mode')), '电视设备没有进入电视交互模式')
  await tv.getByLabel('搜索全部家庭资源').click()
  await tv.locator('.tv-keyboard').waitFor()
  const keyboardBackdrop = await tv.locator('.tv-keyboard-backdrop').boundingBox()
  check(keyboardBackdrop && keyboardBackdrop.x === 0 && keyboardBackdrop.y === 0 && keyboardBackdrop.width === 1280 && keyboardBackdrop.height === 720, '电视搜索键盘没有覆盖完整屏幕')
  check(await tv.getByText('搜索视频、图书与音乐', { exact: true }).isVisible(), '电视搜索键盘标题被屏幕裁掉')
  await tv.screenshot({ path: `${artifactsPath}tv-search-keyboard-${runId}.png` })
  check((await tv.evaluate(() => document.activeElement?.textContent?.trim())) === '1', '电视键盘没有把焦点放到首个按键')
  await tv.keyboard.press('ArrowRight')
  const focusedAfterRight = await tv.evaluate(() => document.activeElement?.textContent?.trim())
  check(focusedAfterRight === '2', `电视方向键没有逐键移动焦点，实际落在：${focusedAfterRight}`)
  await tv.keyboard.press('ArrowLeft')
  await tv.keyboard.press('ArrowDown')
  await tv.keyboard.press('Enter')
  check((await tv.evaluate(() => document.activeElement?.textContent?.trim())) === 'Q', '输入字母后电视键盘焦点被重置')
  for (let index = 0; index < 5; index += 1) await tv.keyboard.press('ArrowRight')
  await tv.keyboard.press('Enter')
  for (let index = 0; index < 5; index += 1) await tv.keyboard.press('ArrowLeft')
  await tv.keyboard.press('Enter')
  await tv.keyboard.press('ArrowDown')
  await tv.keyboard.press('ArrowDown')
  await tv.keyboard.press('ArrowRight')
  await tv.keyboard.press('Enter')
  const remoteQuery = await tv.locator('.tv-keyboard-query span').textContent()
  check(remoteQuery === 'qyqx', `电视遥控器连续输入没有得到 qyqx，实际为：${remoteQuery}`)
  await tv.getByRole('button', { name: '完成' }).focus()
  await tv.keyboard.press('Enter')
  const tvCard = tv.locator('.content-card').filter({ hasText: '千与千寻' }).first()
  await tvCard.waitFor()
  check(await tv.locator('.content-card').count() === 1, '电视拼音首字母搜索没有准确找到千与千寻')
  await tvCard.locator('button.card-copy').focus()
  await tv.keyboard.press('Enter')
  await tv.locator('.lumi-video-player').waitFor()
  await playerLayout(tv, '电视端')
  check((await tv.evaluate(() => document.activeElement?.classList.contains('lumi-video-player'))) === true, '电视播放器没有接管遥控器焦点')
  await tv.locator('video').evaluate((video) => { video.pause(); video.currentTime = 0 })
  await tv.keyboard.press('ArrowRight')
  check(await tv.locator('video').evaluate((video) => video.currentTime) >= 9.5, '电视遥控器右键没有前进十秒')
  await tv.keyboard.press('ArrowDown')
  check(await tv.evaluate(() => document.activeElement?.getAttribute('aria-label')) === '播放进度', '电视遥控器下键没有进入播放控制栏')
  await tv.screenshot({ path: `${artifactsPath}player-tv-${runId}.png` })
  await tvContext.close()

  console.log(JSON.stringify({ status: 'ok', desktop: true, mobile: true, tv: true, pinyin: 'qyqx' }))
} finally {
  await browser.close()
}
