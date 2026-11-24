import type { CustomSoundMeta } from './types-ext'
import Dexie from 'dexie'
import type { Table } from 'dexie'

type CustomSoundRow = { id: string; name: string; createdAt: number; blob: Blob }
type BackgroundRow = { id: string; blob: Blob; createdAt: number }

class ValDB extends Dexie {
  sounds!: Table<CustomSoundRow, string>
  backgrounds!: Table<BackgroundRow, string>

  constructor() {
    super('valorant-audio')
    this.version(1).stores({
      sounds: 'id, createdAt, name',
      backgrounds: 'id, createdAt',
    })
  }
}

let db: ValDB | null = null
function getDb(): ValDB {
  if (!db) db = new ValDB()
  return db
}

/** blobURL 缓存，避免重复 createObjectURL 造成内存泄漏 */
const urlCache = new Map<string, string>()

function makeId(prefix: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16)
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7) + (safe ? '-' + safe : '')
}

export async function saveCustomSound(file: File, name: string): Promise<CustomSoundMeta> {
  const id = makeId('cs', name)
  const row: CustomSoundRow = { id, name, createdAt: Date.now(), blob: file }
  await getDb().sounds.put(row)
  return { id, name, createdAt: row.createdAt }
}

export async function getCustomSoundUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id)
  if (cached) return cached
  const row = await getDb().sounds.get(id)
  if (!row) return null
  const url = URL.createObjectURL(row.blob)
  urlCache.set(id, url)
  return url
}

export async function deleteCustomSound(id: string): Promise<void> {
  const cached = urlCache.get(id)
  if (cached) {
    URL.revokeObjectURL(cached)
    urlCache.delete(id)
  }
  await getDb().sounds.delete(id)
}

export async function listCustomSounds(): Promise<CustomSoundMeta[]> {
  const rows = await getDb().sounds.toArray()
  return rows
    .map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** 保存背景图，返回 'idb:<id>' 形式的引用 */
export async function saveBackgroundImage(file: File): Promise<string> {
  const id = makeId('bg', file.name || 'background')
  const store = getDb().backgrounds
  await store.put({ id, blob: file, createdAt: Date.now() })
  // 只保留最近 3 张，避免 IndexedDB 无限增长
  const all = await store.toArray()
  if (all.length > 3) {
    const removable = all.sort((a, b) => a.createdAt - b.createdAt).slice(0, all.length - 3)
    for (const row of removable) {
      const cached = urlCache.get(row.id)
      if (cached) {
        URL.revokeObjectURL(cached)
        urlCache.delete(row.id)
      }
      await store.delete(row.id)
    }
  }
  return 'idb:' + id
}

/** ref 既可以是 '/val/...' 静态路径，也可以是 'idb:<id>' */
export async function getBackgroundUrl(ref: string): Promise<string | null> {
  if (!ref) return null
  if (!ref.startsWith('idb:')) return ref
  const id = ref.slice(4)
  const cached = urlCache.get(id)
  if (cached) return cached
  const row = await getDb().backgrounds.get(id)
  if (!row) return null
  const url = URL.createObjectURL(row.blob)
  urlCache.set(id, url)
  return url
}
