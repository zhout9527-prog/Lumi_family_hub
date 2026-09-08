import { run } from '@tauri-apps/cli'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

// Rustup 会更新用户 PATH，但已经打开的终端不会自动继承。
// 这里补全 Cargo 路径，让工具链安装后可以直接执行原生命令。
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
