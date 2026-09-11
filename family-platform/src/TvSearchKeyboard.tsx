import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, Delete, Search, Space, Trash2, X } from 'lucide-react'

const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ['-', '_', '.', ',', ':', '/', '?', '!', '@', "'"],
]

export function TvSearchKeyboard({
  value,
  onChange,
  onClose,
}: {
  value: string
  onChange: (value: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    window.setTimeout(() => document.querySelector<HTMLElement>('.tv-keyboard [data-tv-initial]')?.focus(), 0)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.documentElement.style.overflow = previousOverflow
    }
  }, [onClose])

  const append = (key: string) => onChange((value + key.toLocaleLowerCase('zh-CN')).slice(0, 80))
  return createPortal(
    <div className="tv-keyboard-backdrop" onMouseDown={onClose}>
      <section className="tv-keyboard" role="dialog" aria-modal="true" aria-label="电视搜索键盘" onMouseDown={(event) => event.stopPropagation()}>
        <header className="tv-keyboard-heading">
          <div><span>家庭馆藏</span><strong>搜索视频、图书与音乐</strong></div>
          <button type="button" className="tv-keyboard-close" aria-label="关闭电视键盘" data-tv-close onClick={onClose}><X size={24} /></button>
        </header>
        <div className="tv-keyboard-query"><Search size={24} /><span>{value || '输入关键词'}</span></div>
        <div className="tv-keyboard-rows">
          {KEY_ROWS.map((row, rowIndex) => (
            <div className="tv-keyboard-row" key={row.join('')}>
              {row.map((key, keyIndex) => (
                <button type="button" className="tv-key" data-tv-initial={rowIndex === 0 && keyIndex === 0 ? '' : undefined} key={key} onClick={() => append(key)}>{key}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="tv-keyboard-actions">
          <button type="button" className="tv-key action" onClick={() => onChange(Array.from(value).slice(0, -1).join(''))}><Delete size={20} />退格</button>
          <button type="button" className="tv-key action" onClick={() => append(' ')}><Space size={20} />空格</button>
          <button type="button" className="tv-key action" onClick={() => onChange('')}><Trash2 size={20} />清空</button>
          <button type="button" className="tv-key action primary" onClick={onClose}><Check size={20} />完成</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
