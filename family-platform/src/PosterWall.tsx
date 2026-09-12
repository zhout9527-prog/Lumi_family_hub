import { useMemo, useState } from 'react'
import { Cloud, Film, HardDrive, Heart, Play, Search } from 'lucide-react'
import { DEFAULT_COVER, useArtworkSource } from './artwork'
import { matchesContentSearch } from './search'
import type { ContentItem } from './types'

type PosterFilter = 'all' | 'local' | 'online'
type AudienceFilter = 'adult-family' | 'child' | 'all'

function isLocalVideo(item: ContentItem): boolean {
  return Boolean(item.localAvailable || item.playbackMode === 'local_asset')
}

function PosterArtwork({ item }: { item: ContentItem }) {
  const source = useArtworkSource(item.cover)
  return (
    <img
      src={source}
      alt=""
      loading="lazy"
      onError={(event) => {
        if (!event.currentTarget.src.endsWith(DEFAULT_COVER)) event.currentTarget.src = DEFAULT_COVER
      }}
    />
  )
}

export function PosterWall({
  items,
  favoriteIds,
  onOpen,
  onFavorite,
}: {
  items: ContentItem[]
  favoriteIds: string[]
  onOpen: (item: ContentItem) => void
  onFavorite: (id: string) => void
}) {
  const [filter, setFilter] = useState<PosterFilter>('all')
  const [audience, setAudience] = useState<AudienceFilter>('adult-family')
  const [tag, setTag] = useState('all')
  const [query, setQuery] = useState('')
  const videos = useMemo(
    () => items.filter((item) => item.kind === 'video' && item.playable),
    [items],
  )
  const visible = useMemo(
    () => videos.filter((item) => {
      const local = isLocalVideo(item)
      const audienceMatches = audience === 'all'
        || (audience === 'child' ? item.audience === 'child' : item.audience !== 'child')
      return audienceMatches
        && (tag === 'all' || item.tags.includes(tag))
        && (filter === 'all' || (filter === 'local' ? local : !local))
        && matchesContentSearch(item, query)
    }),
    [audience, filter, query, tag, videos],
  )
  const tagOptions = useMemo(() => Array.from(new Set(videos.flatMap((item) => item.tags)))
    .filter((value) => !['在线内容', '本地馆藏', 'B站', '合集'].includes(value))
    .slice(0, 12), [videos])
  const localCount = videos.filter(isLocalVideo).length

  return (
    <div className="dashboard poster-wall-dashboard">
      <section className="page-intro poster-wall-intro">
        <div>
          <span className="eyebrow">FAMILY CINEMA</span>
          <h1>家庭海报墙</h1>
          <p>把值得重看的故事，留在一个安静的影库里。</p>
        </div>
        <div className="poster-wall-totals" aria-label="海报墙统计">
          <span><Film size={15} /><strong>{videos.length}</strong> 部影片</span>
          <span><HardDrive size={15} /><strong>{localCount}</strong> 部本地可用</span>
        </div>
      </section>

      <div className="poster-wall-toolbar">
        <div className="poster-filter" role="group" aria-label="海报来源筛选">
          <button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}><Film size={15} />全部</button>
          <button type="button" className={filter === 'local' ? 'active' : ''} aria-pressed={filter === 'local'} onClick={() => setFilter('local')}><HardDrive size={15} />本地</button>
          <button type="button" className={filter === 'online' ? 'active' : ''} aria-pressed={filter === 'online'} onClick={() => setFilter('online')}><Cloud size={15} />在线</button>
        </div>
        <label className="poster-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索海报墙" placeholder="搜索片名、语言或标签" />
        </label>
      </div>
      <div className="content-filter-bar poster-content-filters">
        <div className="audience-filter" role="group" aria-label="海报墙受众筛选">
          <button type="button" className={audience === 'adult-family' ? 'active' : ''} onClick={() => setAudience('adult-family')}>家长与全家</button>
          <button type="button" className={audience === 'child' ? 'active' : ''} onClick={() => setAudience('child')}>儿童</button>
          <button type="button" className={audience === 'all' ? 'active' : ''} onClick={() => setAudience('all')}>全部</button>
        </div>
        {tagOptions.length > 0 && <div className="tag-filter" role="group" aria-label="海报标签筛选">
          <button type="button" className={tag === 'all' ? 'active' : ''} onClick={() => setTag('all')}>全部标签</button>
          {tagOptions.map((value) => <button type="button" key={value} className={tag === value ? 'active' : ''} onClick={() => setTag(value)}>{value}</button>)}
        </div>}
      </div>

      {visible.length ? (
        <div className="poster-grid" aria-live="polite">
          {visible.map((item, index) => {
            const local = isLocalVideo(item)
            const favorite = favoriteIds.includes(item.id)
            return (
              <article className="poster-card" key={item.id}>
                <button
                  type="button"
                  className="poster-open"
                  aria-label={`播放 ${item.title}`}
                  data-tv-initial={index === 0 ? '' : undefined}
                  onClick={() => onOpen(item)}
                >
                  <span className="poster-art">
                    <PosterArtwork item={item} />
                    <span className="poster-shade" />
                    <span className="poster-play"><Play size={22} fill="currentColor" /></span>
                    <span className={'poster-source ' + (local ? 'local' : 'online')}>
                      {local ? <HardDrive size={12} /> : <Cloud size={12} />}
                      {local ? '本地' : '在线'}
                    </span>
                    {item.collectionCard && <span className="poster-collection-count">合集 · {item.episodeCount ?? 0} 集</span>}
                  </span>
                  <span className="poster-copy">
                    <strong>{item.title}</strong>
                    <small>{item.language} · {item.duration}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className={'poster-favorite ' + (favorite ? 'active' : '')}
                  aria-label={favorite ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
                  aria-pressed={favorite}
                  onClick={() => onFavorite(item.id)}
                >
                  <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />
                </button>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="poster-empty">
          <Film size={28} />
          <strong>这里还没有匹配的影片</strong>
          <span>{filter === 'local' ? '在 Lumi Server 发布本地视频后，它会出现在这里。' : '换一个片名或来源看看。'}</span>
        </div>
      )}
    </div>
  )
}
