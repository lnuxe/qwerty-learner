#!/usr/bin/env node
/* 无畏契约联动音效 —— 占位素材生成器
 *
 * 版权音频不能随仓库分发，这里用「本地可生成」的方式给每个枪皮 / 每句特工台词
 * 生成一条可辨识的占位音频，开箱即可听到反馈；真实素材由用户在设置页里替换。
 *
 * 用法：
 *   node scripts/val-gen-assets.mjs            # 增量生成（已存在跳过）
 *   node scripts/val-gen-assets.mjs --force    # 全部重生成
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, 'src/valorant/catalog.data.json')
const OUT = path.join(ROOT, 'public/val')
const TMP = path.join(ROOT, '.val-tmp')
const FORCE = process.argv.includes('--force')

const catalog = JSON.parse(fs.readFileSync(DATA, 'utf8'))

/* ---------------- WAV 合成 ---------------- */
const SR = 44100

function fnv1a(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function writeWav(samples, sampleRate = SR) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buf
}

/** 每个枪皮有自己的「音色指纹」：基频、泛音比、衰减、噪声量、是否双击 */
function synthSkin(skinId, variant) {
  const h = fnv1a(skinId + ':' + variant)
  const isAce = variant === 'ace'
  const base = 360 + (h % 980) // 360 - 1340 Hz
  const ratios = [1.5, 2, 2.498, 3, 3.99, 5.01]
  const ratio = ratios[h % ratios.length]
  const decay = 0.1 + ((h >>> 3) % 12) / 45
  const noiseAmt = (((h >>> 7) % 100) / 100) * (isAce ? 0.3 : 0.16)
  const dur = isAce ? 1.0 : 0.6
  const n = Math.floor(SR * dur)
  const out = new Float32Array(n)
  const twoHit = ((h >>> 11) % 3) === 0
  const secondAt = isAce ? 0.3 : 0.11

  let seed = h || 1
  const rand = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    seed >>>= 0
    return (seed / 0xffffffff) * 2 - 1
  }

  for (let i = 0; i < n; i++) {
    const t = i / SR
    const attack = Math.min(1, t / 0.003)
    const env = Math.exp(-t / decay)
    let s = Math.sin(2 * Math.PI * base * t) * env
    s += Math.sin(2 * Math.PI * base * ratio * t) * env * 0.42
    s += Math.sin(2 * Math.PI * (base / 2) * t) * Math.exp(-t / (decay * 1.6)) * 0.22 // 低频体感
    s += rand() * Math.exp(-t / 0.028) * noiseAmt
    if (twoHit) {
      const t2 = t - secondAt
      if (t2 > 0) s += Math.sin(2 * Math.PI * base * 1.5 * t2) * Math.exp(-t2 / (decay * 0.8)) * 0.5
    }
    if (isAce) {
      // ACE：叠一个下行的尾音，像播报
      const t3 = t - 0.25
      if (t3 > 0) s += Math.sin(2 * Math.PI * (base * 0.62) * t3) * Math.exp(-t3 / 0.5) * 0.3
    }
    out[i] = s * attack
  }

  // 简易反馈延迟，做出空间感
  const delay = Math.floor(SR * 0.075)
  const fb = isAce ? 0.34 : 0.22
  for (let i = delay; i < n; i++) out[i] += out[i - delay] * fb

  // 归一
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]))
  const g = peak > 0 ? 0.86 / peak : 1
  for (let i = 0; i < n; i++) out[i] *= g
  // 尾部淡出避免爆音
  const fade = Math.floor(SR * 0.02)
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade
  return out
}

/* ---------------- 转码 ---------------- */
async function toM4a(wavPath, m4aPath) {
  await execFileAsync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '96000', wavPath, m4aPath], { timeout: 30000 })
}

async function pickVoice(candidates, langHint) {
  let list = ''
  try {
    const r = await execFileAsync('say', ['-v', '?'], { timeout: 15000 })
    list = r.stdout
  } catch {
    return null
  }
  const names = list
    .split('\n')
    .map((l) => l.split(/\s{2,}/)[0]?.trim())
    .filter(Boolean)
  for (const c of candidates) if (names.includes(c)) return c
  // 退而求其次：语言匹配的第一条
  const line = list.split('\n').find((l) => langHint && l.includes(langHint))
  return line ? line.split(/\s{2,}/)[0].trim() : null
}

async function sayToM4a(text, voice, m4aPath) {
  const aiff = path.join(TMP, path.basename(m4aPath).replace(/\.m4a$/, '.aiff'))
  const args = []
  if (voice) args.push('-v', voice)
  args.push('-r', '180', '-o', aiff, text)
  await execFileAsync('say', args, { timeout: 40000 })
  await execFileAsync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', aiff, m4aPath], { timeout: 30000 })
  fs.existsSync(aiff) && fs.unlinkSync(aiff)
}

/* ---------------- 任务编排 ---------------- */
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

async function pool(tasks, limit) {
  const results = []
  let i = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++
      try {
        results.push(await tasks[idx]())
      } catch (e) {
        results.push({ error: String(e && e.message ? e.message : e) })
      }
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  ensureDir(TMP)
  ensureDir(path.join(OUT, 'kills'))
  ensureDir(path.join(OUT, 'agents'))

  const stats = { kill: 0, ace: 0, line: 0, skipped: 0, failed: [] }
  const killTasks = []

  for (const skin of catalog.skins) {
    const jobs = [['kill', true]]
    if (skin.ace) jobs.push(['ace', true])
    for (const [variant] of jobs) {
      const target = path.join(OUT, 'kills', skin.id + '-' + variant + '.m4a')
      if (!FORCE && fs.existsSync(target)) {
        stats.skipped++
        continue
      }
      killTasks.push(async () => {
        const wav = path.join(TMP, skin.id + '-' + variant + '.wav')
        fs.writeFileSync(wav, writeWav(synthSkin(skin.id, variant)))
        await toM4a(wav, target)
        fs.unlinkSync(wav)
        stats[variant]++
      })
    }
  }

  await pool(killTasks, 6)

  const voice = await pickVoice(['Samantha', 'Ava', 'Karen', 'Tessa', 'Moira', 'Daniel', 'Alex'], 'en_US')
  console.log('[val] TTS voice =', voice || '(system default)')

  const lineTasks = []
  for (const agent of catalog.agents) {
    ensureDir(path.join(OUT, 'agents', agent.id))
    for (const key of ['praise', 'taunt', 'start', 'finish']) {
      const target = path.join(OUT, 'agents', agent.id, key + '.m4a')
      if (!FORCE && fs.existsSync(target)) {
        stats.skipped++
        continue
      }
      const text = agent.lines[key]
      lineTasks.push(async () => {
        await sayToM4a(text, voice, target)
        stats.line++
      })
    }
  }

  await pool(lineTasks, 4)

  const total =
    fs.readdirSync(path.join(OUT, 'kills')).length +
    catalog.agents.reduce((sum, a) => sum + fs.readdirSync(path.join(OUT, 'agents', a.id)).length, 0)

  console.log('[val] generated:', JSON.stringify(stats))
  console.log('[val] audio files on disk:', total)
  if (stats.failed.length) console.log('[val] failed:', stats.failed.slice(0, 10))

  // 清空临时目录
  try {
    for (const f of fs.readdirSync(TMP)) fs.unlinkSync(path.join(TMP, f))
    fs.rmdirSync(TMP)
  } catch {}
}

main().catch((e) => {
  console.error('[val] generator failed:', e)
  process.exit(1)
})
