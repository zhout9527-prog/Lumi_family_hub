import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isNativeShell } from './api'

if (isNativeShell()) document.documentElement.classList.add('native-shell')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (isNativeShell()) {
      // 原生包已经包含应用外壳，清理浏览器缓存以免升级后继续使用旧资源。
      Promise.all([
        navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        ),
        caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
      ]).catch(() => undefined)
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 本地开发时允许不启用离线外壳。
    })
  })
}
