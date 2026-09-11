import { useEffect, useState } from 'react'
import { apiBaseOrigin, getAuthToken } from './api'

export const DEFAULT_COVER = '/covers/photo-1473445361085-b9a07f55608b.jpg'

export function useArtworkSource(source: string): string {
  const protectedArtwork = source.startsWith('/api/')
  const [resolved, setResolved] = useState(protectedArtwork ? '' : source)

  useEffect(() => {
    if (!source.startsWith('/api/')) {
      setResolved(source)
      return
    }
    const controller = new AbortController()
    let objectUrl = ''
    const token = getAuthToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined
    const origin = apiBaseOrigin()
    void fetch(`${origin}${source}`, { headers, cache: 'default', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('封面加载失败')
        return response.blob()
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setResolved(objectUrl)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setResolved(DEFAULT_COVER)
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [source])

  return resolved
}
