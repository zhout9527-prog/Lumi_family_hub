import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const clientUrl = process.env.FAMILYHUB_E2E_CLIENT_URL ?? 'http://127.0.0.1:4175'
const serverUrl = process.env.FAMILYHUB_E2E_SERVER_URL ?? 'http://127.0.0.1:4176'
const apiBase = process.env.FAMILYHUB_E2E_API_BASE ?? 'http://127.0.0.1:8010/api/v1'
const artifactsPath = fileURLToPath(new URL('./artifacts/', import.meta.url))
const runId = Date.now().toString(36)
const childUsername = `xiaodou-${runId}`
const childPassword = 'XiaoDou2026'
const operatorUsername = `operator-${runId}`
let operatorPassword = 'Operator-E2E-2026'
const operatorRecoveryQuestion = '本次端到端测试的编号是什么？'
const operatorRecoveryAnswer = `answer-${runId}`

function check(condition, message) {
  if (!condition) throw new Error(message)
}

async function createContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'zh-CN' })
  await context.route('**/api/v1/**', (route) => {
    const requestUrl = new URL(route.request().url())
    const destination = new URL(apiBase)
    requestUrl.protocol = destination.protocol
    requestUrl.host = destination.host
    return route.continue({ url: requestUrl.toString() })
  })
  return context
}

async function login(page, username, password, expectedRole) {
  await page.getByLabel('账号').fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.locator(`.role-${expectedRole}`).waitFor({ state: 'visible', timeout: 10000 })
}

function collectFailures(page, failures, prefix) {
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('status of 401')) {
      failures.push(`${prefix} console: ${message.text()}`)
    }
  })
  page.on('requestfailed', (request) => {
    if (!request.url().endsWith('/auth/logout')) {
      failures.push(`${prefix} request: ${request.url()} ${request.failure()?.errorText ?? ''}`)
    }
  })
}

await mkdir(artifactsPath, { recursive: true })
const browser = await chromium.launch({ executablePath: edgePath, headless: true })
const failures = []

try {
  const healthResponse = await fetch(`${apiBase}/health`)
  check(healthResponse.ok, `Server API 健康检查失败：${healthResponse.status}`)
  const health = await healthResponse.json()

  const clientContext = await createContext(browser, { width: 1440, height: 980 })
  const client = await clientContext.newPage()
  collectFailures(client, failures, 'client')
  await client.goto(clientUrl, { waitUntil: 'networkidle' })
  await client.getByRole('heading', { name: '登录 Lumi Client' }).waitFor()
  check(await client.getByText('家庭主机已连接').count() === 1, 'Client 未连接本机 Server API')
  check(await client.getByRole('tab', { name: '注册申请' }).count() === 1, 'Client 缺少注册入口')

  await client.getByRole('tab', { name: '注册申请' }).click()
  await client.getByLabel('显示名称').fill('小豆')
  await client.getByLabel('儿童年龄').fill('6')
  await client.getByLabel('账号').fill(childUsername)
  await client.getByLabel('密码', { exact: true }).fill(childPassword)
  await client.getByLabel('确认密码').fill(childPassword)
  const registrationResponse = client.waitForResponse((response) =>
    response.url().endsWith('/api/v1/auth/registrations') && response.status() === 201,
  )
  await client.getByRole('button', { name: '提交注册申请' }).click()
  await registrationResponse
  await client.getByText('小豆，申请已提交').waitFor()
  await client.getByRole('button', { name: '返回登录' }).click()
  await client.getByLabel('密码', { exact: true }).fill(childPassword)
  await client.getByRole('button', { name: '登录', exact: true }).click()
  await client.getByText('账号正在等待运维管理员审批').waitFor()

  const serverContext = await createContext(browser, { width: 1440, height: 980 })
  const server = await serverContext.newPage()
  collectFailures(server, failures, 'server')
  await server.goto(serverUrl, { waitUntil: 'networkidle' })
  check(await server.getByRole('tab', { name: '注册申请' }).count() === 0, 'Server 不应开放普通账户注册')
  if (health.setup_required) {
    await server.getByRole('heading', { name: '创建首个运维账户' }).waitFor()
    await server.getByLabel('显示名称').fill('本机验收管理员')
    await server.getByLabel('账号').fill(operatorUsername)
    await server.getByLabel('密保问题', { exact: true }).fill(operatorRecoveryQuestion)
    await server.getByLabel('密保答案', { exact: true }).fill(operatorRecoveryAnswer)
    await server.getByLabel('密码', { exact: true }).fill(operatorPassword)
    await server.getByLabel('确认密码').fill(operatorPassword)
    await server.getByRole('button', { name: '创建运维账户' }).click()
    await server.getByRole('heading', { name: '登录 Lumi Server' }).waitFor()
  } else {
    await server.getByRole('heading', { name: '登录 Lumi Server' }).waitFor()
    check(await server.getByRole('tab', { name: '新增运维' }).count() === 1, 'Server 缺少新增运维入口')
    check(await server.getByRole('tab', { name: '找回密码' }).count() === 1, 'Server 缺少密码恢复入口')
    await server.getByRole('tab', { name: '新增运维' }).click()
    await server.getByLabel('显示名称').fill('本机验收管理员')
    await server.getByLabel('账号').fill(operatorUsername)
    await server.getByLabel('密保问题', { exact: true }).fill(operatorRecoveryQuestion)
    await server.getByLabel('密保答案', { exact: true }).fill(operatorRecoveryAnswer)
    await server.getByLabel('密码', { exact: true }).fill(operatorPassword)
    await server.getByLabel('确认密码').fill(operatorPassword)
    await server.getByRole('button', { name: '创建新的运维账户' }).click()
    await server.getByRole('heading', { name: '登录 Lumi Server' }).waitFor()
  }

  await server.getByRole('tab', { name: '找回密码' }).click()
  await server.getByLabel('账号').fill(operatorUsername)
  await server.getByRole('button', { name: '查看密保问题' }).click()
  await server.getByText(operatorRecoveryQuestion).waitFor()
  operatorPassword = 'Operator-E2E-Reset-2026'
  await server.getByLabel('密保答案', { exact: true }).fill(operatorRecoveryAnswer)
  await server.getByLabel('新密码', { exact: true }).fill(operatorPassword)
  await server.getByLabel('确认新密码').fill(operatorPassword)
  await server.getByRole('button', { name: '重置密码' }).click()
  await server.getByText('密码已重置，请使用新密码登录').waitFor()
  await login(server, operatorUsername, operatorPassword, 'operator')
  check(await server.getByRole('button', { name: '探索馆' }).count() === 0, 'Server 出现了儿童导航')
  await server.getByRole('heading', { name: '运维概览' }).waitFor()
  check(await server.getByLabel('B站视频链接').count() === 0, '运维概览仍然显示下载表单')
  await server.getByRole('button', { name: '下载队列' }).click()
  await server.getByRole('heading', { name: '下载队列' }).waitFor()
  await server.getByLabel('B站视频链接').fill('https://www.bilibili.com/video/BV18T3G6jEVM/?vd_source=e2e')
  const downloadResponse = server.waitForResponse((response) =>
    response.url().endsWith('/api/v1/ops/downloads/bilibili') && response.status() === 201,
  )
  await server.getByRole('button', { name: '开始下载' }).click()
  await downloadResponse
  const downloadRow = server.locator('.job-item').filter({ hasText: 'BV18T3G6jEVM' }).first()
  await downloadRow.waitFor()
  const queueBadge = server.getByLabel('主导航').locator('.nav-item').filter({ hasText: '下载队列' }).locator('em')
  await queueBadge.waitFor()
  check(await queueBadge.textContent() === '1', '下载队列角标没有反映实际任务数量')
  await downloadRow.getByRole('button', { name: '查看任务详情' }).click()
  await downloadRow.getByRole('region', { name: /任务详情/ }).waitFor()
  check(await downloadRow.getByText('视频编号').count() === 1, '任务详情没有显示视频编号')
  await server.screenshot({ path: `${artifactsPath}server-download-0.3.0.png`, fullPage: true })
  await server.getByRole('button', { name: '运维概览' }).click()
  await server.getByRole('heading', { name: '运维概览' }).waitFor()
  check(await server.getByLabel('B站视频链接').count() === 0, '从下载页返回概览后仍显示下载表单')
  await server.getByRole('button', { name: '资源管理' }).click()
  await server.getByRole('heading', { name: '资源管理' }).waitFor()
  check(!await server.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '资源管理页横向溢出')
  await server.getByRole('tab', { name: '在线播放' }).click()
  await server.getByLabel('在线资源 URL').fill(`https://media.example.com/e2e-${runId}.mp4`)
  await server.getByLabel('在线资源标题').fill(`端到端在线播放 ${runId}`)
  const externalResponse = server.waitForResponse((response) =>
    response.url().endsWith('/api/v1/ops/library/external') && response.status() === 201,
  )
  await server.getByRole('button', { name: '保存在线播放入口' }).click()
  await externalResponse
  await server.getByText(`端到端在线播放 ${runId}`, { exact: true }).waitFor()
  await server.screenshot({ path: `${artifactsPath}server-library-0.3.0.png`, fullPage: true })
  await server.getByRole('button', { name: '主机设置' }).click()
  await server.getByRole('heading', { name: '主机设置' }).waitFor()
  check((await server.getByLabel('视频目录').inputValue()).length > 0, '主机设置没有视频目录')
  check((await server.getByLabel('缓存目录').inputValue()).length > 0, '主机设置没有缓存目录')
  check(!await server.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '主机设置页横向溢出')
  await server.getByRole('button', { name: '账户管理' }).click()
  const pendingRow = server.locator('.account-row').filter({ hasText: childUsername }).first()
  await pendingRow.waitFor()
  const approvalResponse = server.waitForResponse((response) =>
    response.url().includes('/ops/account-registrations/') && response.url().endsWith('/decision') && response.status() === 200,
  )
  await pendingRow.getByRole('button', { name: '批准' }).click()
  await approvalResponse
  await server.locator('.account-row').filter({ hasText: childUsername }).filter({ hasText: '使用中' }).waitFor()
  await server.screenshot({ path: `${artifactsPath}server-accounts-0.3.0.png`, fullPage: true })

  await client.getByLabel('密码').fill(childPassword)
  await client.getByRole('button', { name: '登录', exact: true }).click()
  await client.locator('.role-child').waitFor()
  await client.getByRole('heading', { name: '给小豆的探索清单' }).waitFor()
  check(await client.getByRole('button', { name: '运维概览' }).count() === 0, 'Client 出现了运维导航')
  check(await client.getByRole('button', { name: '当前账号 小豆' }).count() === 1, 'Client 没有使用服务器账户显示名')
  await client.getByLabel('主导航').getByRole('button', { name: '连接设置' }).click()
  await client.getByRole('heading', { name: '连接设置' }).waitFor()
  check((await client.getByLabel('家庭主机地址').inputValue()).length > 0, '登录后连接设置没有主机地址')

  const operatorClientContext = await createContext(browser, { width: 900, height: 700 })
  const operatorClient = await operatorClientContext.newPage()
  await operatorClient.goto(clientUrl, { waitUntil: 'networkidle' })
  await login(operatorClient, operatorUsername, operatorPassword, 'guardian')
  check(await operatorClient.getByRole('button', { name: '家庭概览' }).count() === 1, '运维账号没有以家长身份进入 Client')
  check(await operatorClient.getByRole('button', { name: '运维概览' }).count() === 0, 'Client 暴露了运维功能')

  const wrongServerContext = await createContext(browser, { width: 900, height: 700 })
  const wrongServer = await wrongServerContext.newPage()
  await wrongServer.goto(serverUrl, { waitUntil: 'networkidle' })
  await wrongServer.getByLabel('账号').fill(childUsername)
  await wrongServer.getByLabel('密码', { exact: true }).fill(childPassword)
  await wrongServer.getByRole('button', { name: '登录', exact: true }).click()
  await wrongServer.getByText('儿童和家长账号请使用 Lumi Client').waitFor()
  check(await wrongServer.locator('.role-child').count() === 0, '儿童账号进入了 Server')

  const mobileContext = await createContext(browser, { width: 390, height: 844 })
  const mobile = await mobileContext.newPage()
  collectFailures(mobile, failures, 'mobile')
  await mobile.goto(clientUrl, { waitUntil: 'networkidle' })
  await mobile.getByRole('heading', { name: '登录 Lumi Client' }).waitFor()
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机登录页横向溢出')
  await login(mobile, childUsername, childPassword, 'child')
  await mobile.locator('.content-card').first().waitFor()
  check(!await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), '手机儿童页横向溢出')
  await mobile.screenshot({ path: `${artifactsPath}client-mobile-child-0.3.0.png`, fullPage: true })

  const detailCard = mobile.locator('.content-card').nth(1)
  await detailCard.scrollIntoViewIfNeeded()
  const scrollBefore = await mobile.evaluate(() => window.scrollY)
  await detailCard.locator('button.card-copy').click()
  await mobile.locator('.detail-modal').waitFor()
  const lock = await mobile.evaluate(() => ({
    bodyPosition: document.body.style.position,
    rootOverflow: document.documentElement.style.overflow,
  }))
  check(lock.bodyPosition === 'fixed' && lock.rootOverflow === 'hidden', '手机详情页没有锁定底层滚动')
  await mobile.mouse.wheel(0, 900)
  check(await mobile.evaluate(() => window.scrollY) === 0, '详情页滚动带动了底层页面')
  await mobile.getByRole('button', { name: '关闭详情' }).click()
  check(Math.abs((await mobile.evaluate(() => window.scrollY)) - scrollBefore) <= 1, '关闭详情后滚动位置没有恢复')

  check(failures.length === 0, failures.join('\n'))
  console.log(JSON.stringify({
    status: 'ok',
    registeredUser: childUsername,
    displayName: '小豆',
    clientEdition: true,
    serverEdition: true,
    packagedServerVersion: health.version,
    mobileWidth: await mobile.evaluate(() => window.innerWidth),
    failures,
  }))

  await mobileContext.close()
  await wrongServerContext.close()
  await operatorClientContext.close()
  await serverContext.close()
  await clientContext.close()
} finally {
  await browser.close()
}
