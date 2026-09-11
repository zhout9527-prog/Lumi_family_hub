import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { LogOut, Minus, X } from 'lucide-react'
import { isNativeShell } from './api'
import { APP_EDITION } from './edition'

export function DesktopClosePrompt() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (APP_EDITION !== 'client' || !isNativeShell() || /Android/i.test(navigator.userAgent)) return
    let removeListener: (() => void) | undefined
    let active = true
    void listen('lumi://close-requested', () => setOpen(true)).then((remove) => {
      if (active) removeListener = remove
      else remove()
    })
    return () => {
      active = false
      removeListener?.()
    }
  }, [])

  if (!open) return null
  const respond = async (action: 'exit' | 'minimize' | 'cancel') => {
    if (action !== 'exit') setOpen(false)
    await invoke('respond_to_close', { action })
  }

  return (
    <div className="desktop-close-backdrop" role="presentation">
      <section className="desktop-close-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-close-title">
        <button type="button" className="icon-button desktop-close-x" aria-label="取消关闭" onClick={() => { void respond('cancel') }}><X size={17} /></button>
        <span className="eyebrow">WINDOW ACTION</span>
        <h2 id="desktop-close-title">关闭 Lumi Client？</h2>
        <p>隐藏后应用会继续在后台运行，可从系统托盘再次打开。</p>
        <div className="desktop-close-actions">
          <button type="button" className="button button-primary" onClick={() => { void respond('minimize') }}><Minus size={16} />隐藏到托盘</button>
          <button type="button" className="button button-quiet" onClick={() => { void respond('exit') }}><LogOut size={16} />退出应用</button>
          <button type="button" className="text-button" onClick={() => { void respond('cancel') }}>取消</button>
        </div>
      </section>
    </div>
  )
}
