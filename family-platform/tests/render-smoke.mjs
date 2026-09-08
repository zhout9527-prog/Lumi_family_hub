import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.FAMILYHUB_E2E_URL ?? 'http://127.0.0.1:4173'
const artifacts = new URL('./artifacts/', import.meta.url)
const artifactsPath = fileURLToPath(artifacts)

function check(condition, message) {
  if (!condition) throw new Error(message)
}

async function verifyViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport, locale: 'zh-CN' })
  try {
    const page = await context.newPage()
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: '登录 Lumi Client' }).waitFor({ timeout: 15000 })
    await page.getByText('家庭主机已连接').waitFor({ timeout: 15000 })
    const body = await page.locator('body').innerText()
    check(body.includes('家庭主机已连接'), `${name}: missing Chinese host status`)
    check(body.includes('SECURE ACCESS'), `${name}: missing English access heading`)
    check(body.includes('注册申请'), `${name}: missing Client registration entry`)
    check(!body.includes('锟斤拷'), `${name}: rendered GBK mojibake`)
    check(!body.includes('\uFFFD'), `${name}: rendered a Unicode replacement character`)
    await page.screenshot({ path: `${artifactsPath}render-${name}-0.2.0.png`, fullPage: true })
    console.log(`${name}-body-length`, body.length)
  } finally {
    await context.close()
  }
}

await mkdir(artifactsPath, { recursive: true })
const browser = await chromium.launch({ executablePath: edgePath, headless: true })
try {
  await verifyViewport(browser, 'desktop', { width: 1440, height: 980 })
  await verifyViewport(browser, 'mobile', { width: 390, height: 844 })
} finally {
  await browser.close()
}

console.log('render-smoke-ok')
