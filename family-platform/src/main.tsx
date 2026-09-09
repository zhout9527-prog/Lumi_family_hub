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
      // Native packages already bundle the shell. Remove browser caches so an
      // app update cannot keep serving assets from the previous APK/EXE.
      Promise.all([
        navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        ),
        caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
      ]).catch(() => undefined)
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline shell is optional during local development.
    })
  })
}
