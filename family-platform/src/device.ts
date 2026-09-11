import { useEffect } from 'react'

export type DeviceProfile = 'desktop' | 'mobile' | 'tv'

export function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') return 'desktop'
  const userAgent = window.navigator.userAgent
  const television = /Android TV|GoogleTV|AFT\w*|BRAVIA|SmartTV|Tizen|Web0S|NetCast|Leanback/i.test(userAgent)
    || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent) && window.innerWidth >= 720)
  if (television) return 'tv'
  if (/Android|iPhone|iPod|Mobile/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

export const DEVICE_PROFILE = detectDeviceProfile()

function visibleFocusableElements(scope: ParentNode): HTMLElement[] {
  const selector = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[role="button"][tabindex="0"]',
    '[tabindex="0"]',
  ].join(',')
  return Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      && element.getAttribute('aria-hidden') !== 'true'
  })
}

function activeNavigationScope(): ParentNode {
  const modals = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'))
    .filter((element) => element.getBoundingClientRect().width > 0)
  return modals.at(-1) ?? document
}

function focusNext(direction: 'left' | 'right' | 'up' | 'down'): void {
  const scope = activeNavigationScope()
  const candidates = visibleFocusableElements(scope)
  if (!candidates.length) return
  const active = document.activeElement instanceof HTMLElement && scope.contains(document.activeElement)
    ? document.activeElement
    : null
  if (!active) {
    ;(candidates.find((element) => element.dataset.tvInitial !== undefined) ?? candidates[0]).focus()
    return
  }
  const origin = active.getBoundingClientRect()
  const originX = origin.left + origin.width / 2
  const originY = origin.top + origin.height / 2
  const vertical = direction === 'up' || direction === 'down'
  const ranked = candidates
    .filter((element) => element !== active)
    .map((element) => {
      const rect = element.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const primary = vertical ? y - originY : x - originX
      const secondary = vertical ? x - originX : y - originY
      const correctDirection = direction === 'up' || direction === 'left' ? primary < -2 : primary > 2
      if (!correctDirection) return null
      const overlaps = vertical
        ? rect.right >= origin.left && rect.left <= origin.right
        : rect.bottom >= origin.top && rect.top <= origin.bottom
      const score = vertical
        ? Math.abs(primary) * 8 + Math.abs(secondary) + (overlaps ? 0 : 100)
        : Math.abs(primary) + Math.abs(secondary) * 8 + (overlaps ? 0 : 700)
      return { element, score }
    })
    .filter((entry): entry is { element: HTMLElement; score: number } => entry !== null)
    .sort((left, right) => left.score - right.score)
  const next = ranked[0]?.element
  if (!next) return
  next.focus({ preventScroll: true })
  next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

export function useTvSpatialNavigation(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target
      const editable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      if (editable && !target.readOnly) return
      const directions: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      }
      const direction = directions[event.key]
      if (direction) {
        event.preventDefault()
        focusNext(direction)
        return
      }
      if ((event.key === 'Enter' || event.key === ' ') && target instanceof HTMLElement && target.getAttribute('role') === 'button') {
        event.preventDefault()
        target.click()
        return
      }
      if (event.key === 'BrowserBack' || event.key === 'GoBack') {
        const scope = activeNavigationScope()
        const close = scope.querySelector<HTMLElement>('[data-tv-close], [aria-label^="关闭"]')
        if (close) {
          event.preventDefault()
          close.click()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}
