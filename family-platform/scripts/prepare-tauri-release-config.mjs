import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const releaseTemplatePath = resolve(projectRoot, 'src-tauri', 'tauri.release.conf.json')
const generatedConfigPath = resolve(projectRoot, 'src-tauri', 'tauri.release.generated.conf.json')

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required for a signed native release.`)
  }
  return value
}

function updaterPublicKey() {
  const inline = process.env.TAURI_UPDATER_PUBKEY?.trim()
  if (inline) {
    return inline
  }

  const publicKeyFile = process.env.TAURI_UPDATER_PUBKEY_FILE?.trim()
  if (!publicKeyFile) {
    throw new Error('Set TAURI_UPDATER_PUBKEY or TAURI_UPDATER_PUBKEY_FILE for a signed native release.')
  }

  return readFileSync(publicKeyFile, 'utf8').trim()
}

function validateEndpoint(endpoint) {
  let parsed
  try {
    parsed = new URL(endpoint)
  } catch {
    throw new Error('FAMILYHUB_TAURI_UPDATER_ENDPOINT must be a valid HTTPS URL.')
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('FAMILYHUB_TAURI_UPDATER_ENDPOINT must use HTTPS and must not contain credentials.')
  }

  for (const placeholder of ['{{target}}', '{{current_version}}']) {
    if (!endpoint.includes(placeholder)) {
      throw new Error(`FAMILYHUB_TAURI_UPDATER_ENDPOINT must include ${placeholder}.`)
    }
  }
}

const endpoint = requiredEnvironment('FAMILYHUB_TAURI_UPDATER_ENDPOINT')
const publicKey = updaterPublicKey()

if (publicKey.length < 32 || publicKey.includes('REPLACE_WITH')) {
  throw new Error('TAURI updater public key is missing or invalid.')
}

requiredEnvironment('TAURI_SIGNING_PRIVATE_KEY')
validateEndpoint(endpoint)

const releaseConfig = JSON.parse(readFileSync(releaseTemplatePath, 'utf8'))
releaseConfig.plugins ??= {}
releaseConfig.plugins.updater ??= {}
releaseConfig.plugins.updater.pubkey = publicKey
releaseConfig.plugins.updater.endpoints = [endpoint]

writeFileSync(generatedConfigPath, `${JSON.stringify(releaseConfig, null, 2)}\n`, 'utf8')
console.log(`Prepared signed Tauri release config: ${generatedConfigPath}`)
