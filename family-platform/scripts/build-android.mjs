import { basename, dirname, join, resolve } from 'node:path'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const tauriRoot = join(projectRoot, 'src-tauri')
const artifactRoot = join(projectRoot, 'artifacts', 'android')
const androidTemplateRoot = join(projectRoot, 'native', 'android-template')
const isWindows = process.platform === 'win32'
const abiVariants = {
  arm64: { target: 'aarch64-linux-android', abi: 'arm64-v8a', gradleFlavor: 'Arm64' },
  arm: { target: 'armv7-linux-androideabi', abi: 'armeabi-v7a', gradleFlavor: 'Arm' },
  x86: { target: 'i686-linux-android', abi: 'x86', gradleFlavor: 'X86' },
  x86_64: { target: 'x86_64-linux-android', abi: 'x86_64', gradleFlavor: 'X86_64' },
}

function usage() {
  console.log(`Usage: node scripts/build-android.mjs [options]

Options:
  --format, -Format <apk|aab>       Output format (default: apk)
  --build-type, -BuildType <debug|release>
                                      Build variant (default: debug)
  --abi, -Abi <arm64|arm|x86|x86_64|universal>
                                      ABI/flavor (default: arm64)
  --init, -Init                      Recreate the temporary Android project
  --use-tauri-cli, -UseTauriCli      Use Tauri's direct Android build path
  --help, -?, -h                     Show this help`)
}

function normalizeAbi(abi) {
  const aliases = {
    'arm64-v8a': 'arm64',
    'armeabi-v7a': 'arm',
    x86_64: 'x86_64',
  }
  return aliases[abi] ?? abi
}

function parseArguments(args) {
  const options = { format: 'apk', buildType: 'debug', abi: 'arm64', init: false, useTauriCli: false }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--help' || argument === '-?' || argument === '-h') {
      usage()
      process.exit(0)
    }
    if (argument === '--init' || argument === '-Init') {
      options.init = true
      continue
    }
    if (argument === '--use-tauri-cli' || argument === '-UseTauriCli') {
      options.useTauriCli = true
      continue
    }
    if (argument === '--format' || argument === '-Format') {
      options.format = args[++index]
      continue
    }
    if (argument === '--build-type' || argument === '-BuildType') {
      options.buildType = args[++index]
      continue
    }
    if (argument === '--abi' || argument === '-Abi') {
      options.abi = normalizeAbi(args[++index])
      continue
    }
    throw new Error(`Unknown option: ${argument}`)
  }
  if (!['apk', 'aab'].includes(options.format)) {
    throw new Error(`Unsupported format: ${options.format}`)
  }
  if (!['debug', 'release'].includes(options.buildType)) {
    throw new Error(`Unsupported build type: ${options.buildType}`)
  }
  if (!['universal', ...Object.keys(abiVariants)].includes(options.abi)) {
    throw new Error(`Unsupported ABI: ${options.abi}`)
  }
  return options
}

function quoteForCmd(value) {
  if (!/[\s"]/u.test(value)) {
    return value
  }
  return `"${value.replaceAll('"', '\\"')}"`
}

function run(command, args, { cwd = projectRoot, env = process.env } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    let executable = command
    let commandArgs = args
    if (isWindows && /\.(?:bat|cmd)$/iu.test(command)) {
      executable = process.env.ComSpec ?? 'cmd.exe'
      commandArgs = ['/d', '/s', '/c', `${quoteForCmd(command)} ${args.map(quoteForCmd).join(' ')}`]
    }
    const child = spawn(executable, commandArgs, { cwd, env, stdio: 'inherit' })
    child.on('error', rejectRun)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveRun()
      } else {
        rejectRun(new Error(`${command} ${args.join(' ')} failed (${signal ?? `exit ${code}`}).`))
      }
    })
  })
}

function firstExistingPath(paths) {
  return paths.find((path) => path && existsSync(path))
}

function findGradleExecutable(environment) {
  const candidates = [
    environment.GRADLE_HOME ? join(environment.GRADLE_HOME, 'bin', isWindows ? 'gradle.bat' : 'gradle') : undefined,
    process.env.GRADLE_HOME ? join(process.env.GRADLE_HOME, 'bin', isWindows ? 'gradle.bat' : 'gradle') : undefined,
  ].filter(Boolean)

  const roots = [
    environment.GRADLE_USER_HOME,
    process.env.GRADLE_USER_HOME,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, '.gradle', 'wrapper', 'dists') : undefined,
    process.env.TEMP ? join(process.env.TEMP, 'familyhub-gradle-cache', 'wrapper', 'dists') : undefined,
  ].filter((path, index, all) => path && all.indexOf(path) === index && existsSync(path))

  const visit = (root, depth = 0) => {
    if (depth > 8 || !existsSync(root)) return undefined
    const direct = join(root, 'bin', isWindows ? 'gradle.bat' : 'gradle')
    if (existsSync(direct)) return direct
    let entries
    try {
      entries = readdirSync(root, { withFileTypes: true })
    } catch {
      return undefined
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const found = visit(join(root, entry.name), depth + 1)
      if (found) return found
    }
    return undefined
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  for (const root of roots) {
    const found = visit(root)
    if (found) return found
  }
  return undefined
}

function findAndroidSdk() {
  const sdk = firstExistingPath([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : undefined,
  ].map((path) => path && existsSync(join(path, 'platforms')) ? path : undefined))
  if (!sdk) {
    throw new Error('Android SDK not found. Install an SDK Platform and Build Tools, or set ANDROID_HOME.')
  }
  return resolve(sdk)
}

function findCompileSdk(sdkPath) {
  const versions = readdirSync(join(sdkPath, 'platforms'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ entry, match: /^android-(\d+)$/u.exec(entry.name) }))
    .filter(({ entry, match }) => match && existsSync(join(sdkPath, 'platforms', entry.name, 'android.jar')))
    .map(({ match }) => Number(match[1]))
    .sort((left, right) => right - left)
  if (versions.length === 0) {
    throw new Error('No usable Android platform was found under the Android SDK.')
  }
  return versions[0]
}

function findNdk(sdkPath) {
  const ndkRoot = join(sdkPath, 'ndk')
  if (!existsSync(ndkRoot)) {
    throw new Error('Android NDK was not found. Install NDK (Side by side) in Android Studio.')
  }
  const ndks = readdirSync(ndkRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(ndkRoot, entry.name))
    .filter((path) => existsSync(join(path, 'toolchains', 'llvm', 'prebuilt', 'windows-x86_64', 'bin')))
    .sort()
    .reverse()
  if (ndks.length === 0) {
    throw new Error('No usable Android NDK toolchain was found.')
  }
  return ndks[0]
}

function findJavaHome() {
  const androidStudioJbr = process.env.ProgramFiles
    ? join(process.env.ProgramFiles, 'Android', 'Android Studio', 'jbr')
    : undefined
  const microsoftRoot = process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Microsoft') : undefined
  const installed = microsoftRoot && existsSync(microsoftRoot)
    ? readdirSync(microsoftRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('jdk-17'))
      .map((entry) => join(microsoftRoot, entry.name))
      .sort()
      .reverse()
    : []
  return firstExistingPath([...installed, process.env.JAVA_HOME, androidStudioJbr].map((path) =>
    path && existsSync(join(path, 'bin', isWindows ? 'java.exe' : 'java')) ? path : undefined,
  ))
}

function configureToolchain(sdkPath) {
  const ndkPath = findNdk(sdkPath)
  const javaHome = findJavaHome()
  if (!javaHome) {
    throw new Error('JDK 17 or newer was not found. Install Android Studio or set JAVA_HOME.')
  }
  const environment = { ...process.env, ANDROID_HOME: sdkPath, ANDROID_SDK_ROOT: sdkPath, ANDROID_NDK_HOME: ndkPath, NDK_HOME: ndkPath }
  environment.JAVA_HOME = javaHome
  environment.Path = [join(javaHome, 'bin'), environment.Path ?? environment.PATH ?? ''].filter(Boolean).join(';')
  environment.PATH = environment.Path

  const toolchainBin = join(ndkPath, 'toolchains', 'llvm', 'prebuilt', 'windows-x86_64', 'bin')
  const linkers = {
    CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: 'aarch64-linux-android24-clang.cmd',
    CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER: 'armv7a-linux-androideabi24-clang.cmd',
    CARGO_TARGET_I686_LINUX_ANDROID_LINKER: 'i686-linux-android24-clang.cmd',
    CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER: 'x86_64-linux-android24-clang.cmd',
  }
  for (const [name, file] of Object.entries(linkers)) {
    const linker = join(toolchainBin, file)
    if (!existsSync(linker)) {
      throw new Error(`NDK linker is missing: ${linker}`)
    }
    environment[name] = linker
  }
  return environment
}

function validateGeneratedGradle(androidProjectRoot, installedCompileSdk) {
  const gradlePath = join(androidProjectRoot, 'app', 'build.gradle.kts')
  if (!existsSync(gradlePath)) {
    throw new Error(`Generated Android Gradle file is missing: ${gradlePath}`)
  }
  const source = readFileSync(gradlePath, 'utf8')
  const compileMatch = /^(\s*compileSdk\s*=\s*)(\d+)/mu.exec(source)
  const targetMatch = /^(\s*targetSdk\s*=\s*)(\d+)/mu.exec(source)
  if (!compileMatch || !targetMatch) {
    throw new Error(`Unable to locate compileSdk/targetSdk in ${gradlePath}`)
  }
  const requiredCompileSdk = Number(compileMatch[2])
  const targetSdk = Number(targetMatch[2])
  if (requiredCompileSdk > installedCompileSdk) {
    throw new Error(
      `Generated Android project requires API ${requiredCompileSdk}, but the newest installed platform is API ${installedCompileSdk}. ` +
      `Install Android SDK Platform ${requiredCompileSdk} from Android Studio, then run the build again.`,
    )
  }
  if (targetSdk > requiredCompileSdk) {
    throw new Error(`Generated targetSdk ${targetSdk} cannot exceed compileSdk ${requiredCompileSdk}. Regenerate the Android project with Tauri.`)
  }
  console.log(`Android generated project: compileSdk ${requiredCompileSdk}, targetSdk ${targetSdk}; installed platform API ${installedCompileSdk}`)
}

function cargoExecutable() {
  const candidates = [
    process.env.CARGO_HOME ? join(process.env.CARGO_HOME, 'bin', isWindows ? 'cargo.exe' : 'cargo') : undefined,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, '.cargo', 'bin', isWindows ? 'cargo.exe' : 'cargo') : undefined,
  ]
  const cargo = firstExistingPath(candidates)
  if (!cargo) {
    throw new Error('cargo was not found. Install the Rust stable MSVC toolchain.')
  }
  return cargo
}

function readReleaseIdentity() {
  const config = JSON.parse(readFileSync(join(tauriRoot, 'tauri.conf.json'), 'utf8'))
  const versionName = String(config.version ?? '').trim()
  const versionCode = Number(config.bundle?.android?.versionCode)
  if (!versionName || !Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error('tauri.conf.json must define a version and a positive Android versionCode.')
  }
  return { versionName, versionCode }
}

function findTauriAndroidRuntime() {
  const cargoHomes = [
    process.env.CARGO_HOME,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, '.cargo') : undefined,
  ].filter((path, index, all) => path && all.indexOf(path) === index)
  const lock = readFileSync(join(tauriRoot, 'Cargo.lock'), 'utf8')
  const tauriBlock = lock.split('[[package]]').find((block) => /^name = "tauri"$/mu.test(block))
  const expectedVersion = tauriBlock ? /^version = "([^"]+)"$/mu.exec(tauriBlock)?.[1] : undefined
  const candidates = []

  for (const cargoHome of cargoHomes) {
    const sourceRoot = join(cargoHome, 'registry', 'src')
    if (!existsSync(sourceRoot)) continue
    for (const indexDirectory of readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!indexDirectory.isDirectory()) continue
      const indexPath = join(sourceRoot, indexDirectory.name)
      for (const packageDirectory of readdirSync(indexPath, { withFileTypes: true })) {
        if (!packageDirectory.isDirectory() || !packageDirectory.name.startsWith('tauri-')) continue
        const version = packageDirectory.name.slice('tauri-'.length)
        const runtime = join(indexPath, packageDirectory.name, 'mobile', 'android')
        if (existsSync(join(runtime, 'build.gradle.kts'))) {
          candidates.push({ version, runtime })
        }
      }
    }
  }

  const selected = candidates.find(({ version }) => version === expectedVersion)
    ?? candidates.sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }))[0]
  if (!selected) {
    throw new Error('Tauri Android runtime source was not found in Cargo cache. Run the Rust Android build once with network access.')
  }
  console.log(`Using Tauri Android runtime ${selected.version}: ${selected.runtime}`)
  return selected.runtime
}

function powershellExecutable() {
  return firstExistingPath([
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe') : undefined,
    process.env.SystemRoot ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : undefined,
  ])
}

async function createAndroidBuildContext() {
  if (!existsSync(join(androidTemplateRoot, 'app', 'build.gradle.kts'))) {
    throw new Error(`Android template is missing: ${androidTemplateRoot}`)
  }
  const defaultParent = isWindows
    ? (process.env.PUBLIC ?? resolve(process.env.SystemDrive ?? 'C:\\', 'Users', 'Public'))
    : tmpdir()
  const stageParent = resolve(process.env.FAMILYHUB_ANDROID_STAGING_ROOT ?? defaultParent)
  mkdirSync(stageParent, { recursive: true })
  const stageRoot = mkdtempSync(join(stageParent, 'lumi-familyhub-android-'))
  const androidProjectRoot = join(stageRoot, 'android')
  if (isWindows) {
    const powershell = powershellExecutable()
    if (!powershell) throw new Error('PowerShell was not found for Android staging.')
    await run(
      powershell,
      ['-NoLogo', '-NoProfile', '-File', join(scriptDirectory, 'stage-android-template.ps1'), '-Source', androidTemplateRoot, '-Destination', androidProjectRoot],
    )
  } else {
    const { cpSync } = await import('node:fs')
    cpSync(androidTemplateRoot, androidProjectRoot, { recursive: true })
  }

  console.log(`Android staging project: ${stageRoot}`)
  return { projectRoot, tauriRoot, stageParent, stageRoot, androidProjectRoot }
}

function cleanupAndroidBuildContext(context) {
  const expectedParent = resolve(context.stageParent)
  const actualParent = resolve(dirname(context.stageRoot))
  if (actualParent !== expectedParent || !basename(context.stageRoot).startsWith('lumi-familyhub-android-')) {
    throw new Error(`Refusing to remove unexpected staging path: ${context.stageRoot}`)
  }
  rmSync(context.stageRoot, { recursive: true, force: true })
}

async function copyNativeArtifact(source, destination) {
  if (isWindows) {
    const powershell = powershellExecutable()
    if (!powershell) throw new Error('PowerShell was not found for native artifact copying.')
    await run(
      powershell,
      ['-NoLogo', '-NoProfile', '-File', join(scriptDirectory, 'copy-native-artifact.ps1'), '-Source', source, '-Destination', destination],
    )
  } else {
    copyFileSync(source, destination)
  }
  const signature = readFileSync(destination).subarray(0, 4)
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error(`Copied Android artifact is not a readable ZIP container: ${destination}`)
  }
}

function variantsFor(abi) {
  return abi === 'universal' ? Object.values(abiVariants) : [abiVariants[abi]]
}

function removeOldAndroidArtifacts(keepVersion) {
  if (!existsSync(artifactRoot)) return
  const escapedVersion = keepVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const keepPattern = new RegExp(`^lumi-client(?:-tv)?-${escapedVersion}-`, 'i')
  const managedPattern = /^lumi-(?:client(?:-tv)?|family-hub)-\d+\.\d+\.\d+-.*\.(?:apk|aab)$/i
  for (const entry of readdirSync(artifactRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !managedPattern.test(entry.name) || keepPattern.test(entry.name)) continue
    rmSync(join(artifactRoot, entry.name), { force: true })
    console.log(`Removed old Android artifact: ${entry.name}`)
  }
}

async function buildRustLibraries(buildType, abi, environment) {
  const cargo = cargoExecutable()
  const libraries = []
  for (const variant of variantsFor(abi)) {
    const { target, abi: androidAbi } = variant
    const cargoArgs = [
      'build',
      '--manifest-path', join(tauriRoot, 'Cargo.toml'),
      '--target', target,
      '--features', 'custom-protocol',
    ]
    if (buildType === 'release') {
      cargoArgs.push('--release')
    }
    await run(cargo, cargoArgs, { env: environment })
    const library = join(tauriRoot, 'target', target, buildType, 'liblumi_family_hub_lib.so')
    if (!existsSync(library)) {
      throw new Error(`Rust Android library was not produced: ${library}`)
    }
    libraries.push({ androidAbi, library })
  }
  return libraries
}

function copyRustLibraries(context, libraries) {
  for (const { androidAbi, library } of libraries) {
    const destination = join(context.androidProjectRoot, 'app', 'src', 'main', 'jniLibs', androidAbi, 'liblumi_family_hub_lib.so')
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(library, destination)
  }
}

async function buildFrontend() {
  await run(process.execPath, [join(projectRoot, 'node_modules', 'typescript', 'lib', 'tsc.js'), '-b', '--pretty', 'false'])
  await run(process.execPath, [join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', 'client', '--configLoader', 'runner'])
}

async function runGradle(context, format, buildType, abi, environment) {
  const profile = `${buildType[0].toUpperCase()}${buildType.slice(1)}`
  const flavor = abi === 'universal' ? 'Universal' : abiVariants[abi].gradleFlavor
  const task = format === 'aab' ? `:app:bundle${flavor}${profile}` : `:app:assemble${flavor}${profile}`
  const gradle = findGradleExecutable(environment)
  if (!gradle) {
    throw new Error('Gradle 8.13 or newer was not found. Set GRADLE_HOME or run scripts/install-native-tools.ps1.')
  }
  console.log(`Using Gradle executable: ${gradle}`)
  await run(
    gradle,
    [task, '-Pandroid.useAndroidX=true', '-Pandroid.nonTransitiveRClass=true', '--no-daemon', '--stacktrace'],
    { cwd: context.androidProjectRoot, env: environment },
  )
}

function findArtifacts(androidProjectRoot, format, abi) {
  const root = join(androidProjectRoot, 'app', 'build', 'outputs', format === 'aab' ? 'bundle' : 'apk')
  const result = []
  const visit = (path) => {
    if (!existsSync(path)) return
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile() && child.toLowerCase().endsWith(`.${format}`)) result.push(child)
    }
  }
  visit(root)
  const flavor = abi === 'universal' ? 'universal' : abi
  const matching = result.filter((artifact) => artifact.toLowerCase().includes(flavor))
  return (matching.length > 0 ? matching : result).sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const sdkPath = findAndroidSdk()
  const environment = configureToolchain(sdkPath)
  await buildFrontend()

  if (options.useTauriCli) {
    if (options.abi !== 'universal') {
      console.warn('Tauri CLI mode ignores --abi and uses its own Android target selection.')
    }
    const args = ['android', 'build', options.format === 'aab' ? '--aab' : '--apk', '--ci']
    if (options.buildType === 'debug') args.push('--debug')
    await run(process.execPath, [join(projectRoot, 'scripts', 'run-tauri.mjs'), ...args], { env: environment })
    return
  }

  if (options.init) console.log('Recreating the temporary Android project from the checked-in template.')
  const release = readReleaseIdentity()
  environment.FAMILYHUB_ANDROID_VERSION_NAME = release.versionName
  environment.FAMILYHUB_ANDROID_VERSION_CODE = String(release.versionCode)
  const libraries = await buildRustLibraries(options.buildType, options.abi, environment)
  environment.TAURI_ANDROID_DIR = findTauriAndroidRuntime()
  const context = await createAndroidBuildContext()
  let succeeded = false
  try {
    copyRustLibraries(context, libraries)
    validateGeneratedGradle(context.androidProjectRoot, findCompileSdk(sdkPath))
    await runGradle(context, options.format, options.buildType, options.abi, environment)

    const artifacts = findArtifacts(context.androidProjectRoot, options.format, options.abi)
    if (artifacts.length === 0) {
      throw new Error(`Android ${options.format} build completed but no artifact was found.`)
    }
    mkdirSync(artifactRoot, { recursive: true })
    console.log(`Android ${options.abi} artifacts:`)
    let primaryArtifact = null
    for (const [index, artifact] of artifacts.slice(0, 5).entries()) {
      const suffix = index === 0 ? '' : `-${index + 1}`
      const destination = join(
        artifactRoot,
        `lumi-client-${release.versionName}-${options.abi}-${options.buildType}${suffix}.${options.format}`,
      )
      await copyNativeArtifact(artifact, destination)
      if (index === 0) primaryArtifact = destination
      console.log(`  ${destination}`)
    }
    if (options.format === 'apk' && primaryArtifact) {
      const tvDestination = join(
        artifactRoot,
        `lumi-client-tv-${release.versionName}-${options.abi}-${options.buildType}.apk`,
      )
      await copyNativeArtifact(primaryArtifact, tvDestination)
      console.log(`  ${tvDestination} (Android TV 安装别名)`)
    }
    if (options.buildType === 'release') {
      console.warn('Release artifacts require an independent Android release signing key before distribution or OTA use.')
    }
    removeOldAndroidArtifacts(release.versionName)
    succeeded = true
  } finally {
    if (succeeded) {
      cleanupAndroidBuildContext(context)
    } else {
      console.error(`Android staging project preserved for diagnostics: ${context.stageRoot}`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
