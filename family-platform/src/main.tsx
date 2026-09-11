import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DesktopClosePrompt } from './DesktopClosePrompt'
import { isNativeShell } from './api'
import { DEVICE_PROFILE } from './device'

if (isNativeShell()) document.documentElement.classList.add('native-shell')
document.documentElement.classList.add(`${DEVICE_PROFILE}-mode`)
document.documentElement.dataset.device = DEVICE_PROFILE

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <DesktopClosePrompt />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (isNativeShell()) {
      // 原生安装包已经自带前端文件，升级后清理旧缓存，避免继续加载上一版界面。
      Promise.all([
        navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        ),
        caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
      ]).catch(() => undefined)
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 本地开发时离线外壳不是必需功能。
    })
  })
}
