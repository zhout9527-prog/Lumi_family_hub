import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: {
  env: Record<string, string | undefined>
}

const apiProxyTarget = process.env.FAMILYHUB_PROXY_TARGET?.trim() || 'http://127.0.0.1:2521'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // 快照构建可能运行在受限的 Windows 进程中，避免 Vite 为解析 junction 调用额外的系统命令。
  resolve: {
    preserveSymlinks: true,
  },
  build: {
    outDir: mode === 'server' ? 'dist-server' : 'dist',
    // 让浏览器/WebView 使用现代语法，避免文件保护器在最后一轮转换期间改写临时 chunk。
    target: 'esnext',
    minify: false,
  },
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: false,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: false,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
}))
