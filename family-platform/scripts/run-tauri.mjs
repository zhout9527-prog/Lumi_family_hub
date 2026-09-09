import { run } from '@tauri-apps/cli'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

// Rustup updates the user PATH, but long-lived terminals do not inherit it.
// Keep every native command usable immediately after toolchain installation.
const cargoHome = process.env.CARGO_HOME
  ?? (process.env.USERPROFILE ? join(process.env.USERPROFILE, '.cargo') : '')
const cargoBin = cargoHome ? join(cargoHome, 'bin') : ''
const cargoExecutable = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

if (cargoBin && existsSync(join(cargoBin, cargoExecutable))) {
  const inheritedPath = process.env.Path ?? process.env.PATH ?? ''
  const pathValue = [cargoBin, inheritedPath].filter(Boolean).join(delimiter)
  process.env.Path = pathValue
  process.env.PATH = pathValue
}

try {
  await run(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
