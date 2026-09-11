import { match } from 'pinyin-pro'
import type { ContentItem } from './types'

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN')
}

export function matchesContentSearch(item: ContentItem, query: string): boolean {
  const needle = normalize(query)
  if (!needle) return true
  const values = [item.title, item.subtitle, item.language, item.source ?? '', ...item.tags]
  return values.some((value) => {
    const candidate = normalize(value)
    return candidate.includes(needle) || match(candidate, needle) !== null
  })
}
