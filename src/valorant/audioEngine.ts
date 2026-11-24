import { getCustomSoundUrl } from './storage'
import { CUSTOM_AUDIO_PREFIX, IDB_AUDIO_PREFIX } from './types-ext'

/**
 * 极简音频播放层。
 * 不用 howler / use-sound，避免和仓库自带的按键音互相抢占；
 * 每次播放用一个轻量 HTMLAudioElement，播完即释放。
 */

const MAX_CONCURRENT = 6
const MAX_DURATION_MS = 6000

let ctx: AudioContext | null = null
const playing = new Set<HTMLAudioElement>()
const preloaded = new Map<string, HTMLAudioElement>()

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1)

/** 浏览器要求用户手势后才能出声；首次点击/按键时调用一次 */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) ctx = new Ctor()
    }
    if (ctx && ctx.state === 'suspended') void ctx.resume()
    if (ctx) {
      // 播一个静音 buffer，彻底解锁
      const buffer = ctx.createBuffer(1, 1, 22050)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
    }
  } catch {
    // 静默忽略：某些浏览器 / 无音频设备环境下不要影响打字
  }
}

/** 把 asset 引用解析成浏览器可直接播放的 URL */
export async function resolveSrc(ref: string): Promise<string | null> {
  if (!ref) return null
  if (ref.startsWith(IDB_AUDIO_PREFIX)) return getCustomSoundUrl(ref.slice(IDB_AUDIO_PREFIX.length))
  if (ref.startsWith(CUSTOM_AUDIO_PREFIX)) return getCustomSoundUrl(ref.slice(CUSTOM_AUDIO_PREFIX.length))
  return ref
}

function release(audio: HTMLAudioElement) {
  playing.delete(audio)
  audio.onended = null
  audio.onerror = null
  try {
    audio.pause()
  } catch {}
  audio.removeAttribute('src')
}

export async function playSound(ref: string, opts?: { volume?: number; gain?: number; interrupt?: boolean }): Promise<void> {
  const src = await resolveSrc(ref)
  if (!src) return

  if (opts?.interrupt) stopAll()

  // 简易并发上限：超了就丢掉最早的
  if (playing.size >= MAX_CONCURRENT) {
    const oldest = playing.values().next().value as HTMLAudioElement | undefined
    if (oldest) release(oldest)
  }

  try {
    const audio = new Audio(src)
    audio.volume = clamp01((opts?.volume ?? 1) * (opts?.gain ?? 1))
    audio.preload = 'auto'
    playing.add(audio)
    audio.onended = () => release(audio)
    audio.onerror = () => release(audio)
    window.setTimeout(() => {
      if (playing.has(audio)) release(audio)
    }, MAX_DURATION_MS)
    await audio.play()
  } catch {
    // 自动播放被拦截 / 文件缺失：静默
  }
}

export function stopAll(): void {
  Array.from(playing).forEach(release)
}

export function preload(refs: string[]): void {
  refs.slice(0, 40).forEach((ref) => {
    void resolveSrc(ref).then((src) => {
      if (!src || preloaded.has(src)) return
      try {
        const audio = new Audio(src)
        audio.preload = 'auto'
        preloaded.set(src, audio)
      } catch {}
    })
  })
}
