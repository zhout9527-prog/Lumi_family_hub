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
const childPassword = 'XiaoDou-2026'
let operatorUsername = process.env.FAMILYHUB_E2E_OPERATOR_USERNAME ?? 'operator-demo'
let operatorPassword = process.env.FAMILYHUB_E2E_OPERATOR_PASSWORD ?? 'operator-demo'

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
    operatorUsername = process.env.FAMILYHUB_E2E_OPERATOR_USERNAME ?? `operator-${runId}`
    operatorPassword = process.env.FAMILYHUB_E2E_OPERATOR_PASSWORD ?? 'Operator-E2E-2026'
    await server.getByRole('heading', { name: '创建运维账户' }).waitFor()
    await server.getByLabel('显示名称').fill('本机验收管理员')
    await server.getByLabel('账号').fill(operatorUsername)
    await server.getByLabel('密码', { exact: true }).fill(operatorPassword)
    await server.getByLabel('确认密码').fill(operatorPassword)
    await server.getByRole('button', { name: '创建运维账户' }).click()
    await server.getByRole('heading', { name: '登录 Lumi Server' }).waitFor()
  } else {
    await server.getByRole('heading', { name: '登录 Lumi Server' }).waitFor()
  }
  await login(server, operatorUsername, operatorPassword, 'operator')
  check(await server.getByRole('button', { name: '探索馆' }).count() === 0, 'Server 出现了儿童导航')
  await server.getByRole('button', { name: '账户管理' }).click()
  const pendingRow = server.locator('.account-row').filter({ hasText: childUsername }).first()
  await pendingRow.waitFor()
  const approvalResponse = server.waitForResponse((response) =>
    response.url().includes('/ops/account-registrations/') && response.url().endsWith('/decision') && response.status() === 200,
  )
  await pendingRow.getByRole('button', { name: '批准' }).click()
  await approvalResponse
  await server.locator('.account-row').filter({ hasText: childUsername }).filter({ hasText: '使用中' }).waitFor()
  await server.screenshot({ path: `${artifactsPath}server-accounts-0.2.0.png`, fullPage: true })

  await client.getByLabel('密码').fill(childPassword)
  await client.getByRole('button', { name: '登录', exact: true }).click()
  await client.locator('.role-child').waitFor()
  await client.getByRole('heading', { name: '给小豆的探索清单' }).waitFor()
  check(await client.getByRole('button', { name: '运维概览' }).count() === 0, 'Client 出现了运维导航')
  check(await client.getByRole('button', { name: '当前账号 小豆' }).count() === 1, 'Client 没有使用服务器账户显示名')
  await client.getByLabel('主导航').getByRole('button', { name: '连接设置' }).click()
  await client.getByRole('heading', { name: '连接设置' }).waitFor()
  check((await client.getByLabel('家庭主机地址').inputValue()).length > 0, '登录后连接设置没有主机地址')

  const wrongClientContext = await createContext(browser, { width: 900, height: 700 })
  const wrongClient = await wrongClientContext.newPage()
  await wrongClient.goto(clientUrl, { waitUntil: 'networkidle' })
  await wrongClient.getByLabel('账号').fill(operatorUsername)
  await wrongClient.getByLabel('密码', { exact: true }).fill(operatorPassword)
  await wrongClient.getByRole('button', { name: '登录', exact: true }).click()
  await wrongClient.getByText('运维账号只能登录 Lumi Server').waitFor()
  check(await wrongClient.locator('.role-operator').count() === 0, '运维账号进入了 Client')

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
  await mobile.screenshot({ path: `${artifactsPath}client-mobile-child-0.2.0.png`, fullPage: true })

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
  await wrongClientContext.close()
  await serverContext.close()
  await clientContext.close()
} finally {
  await browser.close()
}
