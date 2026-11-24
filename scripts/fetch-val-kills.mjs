#!/usr/bin/env node
/**
 * fetch-val-kills.mjs
 * ----------------------------------------------------------------------------
 * 把 public/val/kills 里的合成占位音，换成 Valorant 官方 Wiki（Fandom 镜像）
 * 上真实存在的游戏击杀 / ACE 音效。
 *
 * 数据源：https://valorant.fandom.com/api.php
 *   - list=allimages&aiprefix=<皮肤英文名前缀>&aiprop=url|mime|size
 *   - 音频直链在 static.wikia.nocookie.net/valorant/images/...（必须带 Referer，
 *     且不要用浏览器 UA，否则 CDN 会回 403）
 *
 * 产出：
 *   - public/val/kills/<skinId>-kill.m4a   （AAC 96k 单声道）
 *   - public/val/kills/<skinId>-ace.m4a    （仅 catalog 里 ace:true 的皮肤）
 *   - src/valorant/audio-manifest.json     （每个皮肤用了哪个真实文件 + 来源 URL）
 *
 * 用法：
 *   node scripts/fetch-val-kills.mjs                 # 增量补全（manifest 已 real 且文件在就跳过）
 *   node scripts/fetch-val-kills.mjs --force         # 全部重下
 *   node scripts/fetch-val-kills.mjs --only=reaver,prime
 *   node scripts/fetch-val-kills.mjs --concurrency=4
 *   node scripts/fetch-val-kills.mjs --dry-run       # 只探测不写文件
 *   node scripts/fetch-val-kills.mjs --base-fallback # 无专属音效者改用游戏默认击杀音（真实音频）
 *
 * 规则：
 *   - 只下 mp3（不 rip 视频、不依赖 yt-dlp）
 *   - 下载校验：文件 > 6KB 且 ffprobe 能读出时长 > 0.2s，否则算失败、保留原占位音
 *   - 个别皮肤失败不影响整体，全部写进 manifest.failed
 * ----------------------------------------------------------------------------
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CATALOG_PATH = path.join(ROOT, 'src/valorant/catalog.data.json')
const OUT_DIR = path.join(ROOT, 'public/val/kills')
const MANIFEST_PATH = path.join(ROOT, 'src/valorant/audio-manifest.json')
const TMP_DIR = path.join(os.tmpdir(), 'val-kills-cache')

const API = 'https://valorant.fandom.com/api.php'
const API_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
}
const DL_HEADERS = {
  'User-Agent': 'val-kill-fetch/1.0 (local asset script)',
  Referer: 'https://valorant.fandom.com/',
  Accept: '*/*',
}

const MIN_BYTES = 6 * 1024
const MIN_DURATION = 0.2

// ---------------------------------------------------------------- CLI args
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const valOf = (f, dflt) => {
  const hit = argv.find((a) => a.startsWith(f + '='))
  return hit ? hit.slice(f.length + 1) : dflt
}
const FLAGS = {
  force: has('--force'),
  dryRun: has('--dry-run'),
  baseFallback: has('--base-fallback'),
  concurrency: Math.max(1, Math.min(8, Number(valOf('--concurrency', '3')) || 3)),
  only: (valOf('--only', '') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
}

// ------------------------------------------------------- 皮肤名 → 前缀候选
/**
 * 有些皮肤的英文名带标点，Wiki 上的文件名却千奇百怪，这里手工给出额外的
 * 前缀变体（都会在通用变体之前尝试）。顺序 = 优先级。
 */
const SPECIAL_PREFIXES = {
  'prime-2': ['Prime_2.0', 'Prime_2', 'Prime 2.0', 'Prime2', 'Prime'],
  'black-market': ['Black_Market', 'BlackMarket', 'Black.Market'],
  gun: ['G.U.N', 'GUN', 'G_U_N'],
  'gaia-vengeance': ["Gaia's_Vengeance", 'Gaias_Vengeance', 'Gaia'],
  'rgx-11z-pro': ['RGX_11z_Pro', 'RGX_11z', 'RGX'],
  'protocol-781a': ['Protocol_781-A', 'Protocol_781', 'Protocol'],
  'task-force-809': ['Task_Force_809', 'Task_Force', 'Task'],
  'radiant-crisis-001': ['Radiant_Crisis_001', 'Radiant_Crisis'],
  'sentinels-of-light': ['Sentinels_of_Light', 'Sentinels'],
  'prelude-to-chaos': ['Prelude_to_Chaos', 'Prelude'],
  'neo-frontier': ['Neo_Frontier', 'Neo'],
  'tethered-realms': ['Tethered_Realms', 'Tethered'],
  'champions-2021': ['Champions_2021', 'Champions'],
  'champions-2022': ['Champions_2022', 'Champions'],
  'champions-2023': ['Champions_2023', 'Champions'],
  'champions-2024': ['Champions_2024', 'Champions'],
  'champions-2025': ['Champions_2025', 'Champions'],
  xenohunter: ['Xenohunter', 'Xeno'],
  wunderkind: ['Wunderkind', 'Winterwunderland'],
  silk: ['SilkLeaf', 'Silk'],
}

/** 名字的通用变体：原名 / 空格转下划线 / 只留字母数字 / 首词 / 去撇号 */
function genericPrefixes(name) {
  const out = []
  const push = (v) => {
    const s = (v || '').trim().replace(/^_+|_+$/g, '')
    if (s.length >= 3 && !out.includes(s)) out.push(s)
  }
  push(name)
  push(name.replace(/\s+/g, '_'))
  push(name.replace(/[^A-Za-z0-9]/g, ''))
  push(name.replace(/[^A-Za-z0-9]/g, '_'))
  push(name.replace(/['\u2019\u0060]/g, '').replace(/\s+/g, '_'))
  push(name.split(/[\s_/,]/)[0])
  return out
}

function prefixCandidates(skin) {
  const specials = SPECIAL_PREFIXES[skin.id] || []
  const all = [...specials, ...genericPrefixes(skin.name)]
  return [...new Set(all)]
}

// ------------------------------------------------------------- wiki 请求
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function wikiQuery(params, attempt = 0) {
  const u = API + '?' + new URLSearchParams({ format: 'json', ...params }).toString()
  try {
    const res = await fetch(u, { headers: API_HEADERS })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()
    if (json && json.error) throw new Error('API ' + json.error.code)
    return json
  } catch (e) {
    if (attempt < 2) {
      await sleep(600 * (attempt + 1))
      return wikiQuery(params, attempt + 1)
    }
    throw e
  }
}

/** 拉某个前缀下的全部文件（分页，最多 4 页），只回 audio/* 的文件 */
async function listAudioForPrefix(prefix) {
  const files = []
  let cont = null
  for (let page = 0; page < 4; page++) {
    const params = {
      action: 'query',
      list: 'allimages',
      aiprefix: prefix,
      ailimit: '500',
      aiprop: 'url|mime|size',
    }
    if (cont) params.aicontinue = cont
    const json = await wikiQuery(params)
    const imgs = (json && json.query && json.query.allimages) || []
    for (const im of imgs) {
      if (!/audio/i.test(im.mime || '')) continue
      if (!/\.(mp3|ogg|wav|m4a)$/i.test(im.name || '')) continue
      files.push({ name: im.name, url: im.url, mime: im.mime, size: Number(im.size) || 0 })
    }
    if (!json || !json.continue || imgs.length < 500) break
    cont = json.continue.aicontinue
    await sleep(120)
  }
  return files
}


// --------------------------------------------------------------- 选文件
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')

/** 按"词"切分：Prime_Kill_1.mp3 → ['prime','kill','1']（先去掉扩展名） */
function words(s) {
  return String(s)
    .replace(/\.[A-Za-z0-9]+$/, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/**
 * 前缀必须落在词边界上：prefix=Black 不能命中 Blackthorn_Kill_1。
 * 首词必须完全相等；后续词允许被续写（RGX 11z Pro / Protocol 781-A 这类）。
 */
function startsWithPrefix(fileName, prefix) {
  const fw = words(fileName)
  const pw = words(prefix)
  if (!pw.length || fw.length < pw.length) return false
  if (fw[0] !== pw[0]) return false
  for (let i = 1; i < pw.length; i++) {
    if (!fw[i] || !fw[i].startsWith(pw[i])) return false
  }
  return true
}

/** 击杀音：优先 _Kill_1 → _Kill_2..5 → 任意 *Kill*（排除 Successive/Inspect 等） */
function pickKill(files, skin, usedPrefix) {
  const banned = /successive|inspect|reload|equip|finisher|showcase/i
  const pool = files.filter((f) => /kill/i.test(f.name) && !banned.test(f.name))
  if (!pool.length) return null
  // 只认落在词边界上的前缀，避免 Prime 命中 Primexx、Black 命中 Blackthorn 这类串皮
  const usable = pool.filter((f) => startsWithPrefix(f.name, usedPrefix))
  if (!usable.length) return null

  const tier1 = usable.find((f) => /_kill_?1(\.|_|$)/i.test(f.name))
  if (tier1) return tier1
  const tier2 = usable
    .filter((f) => /_kill_?[2-5](\.|_|$)/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))[0]
  if (tier2) return tier2
  return usable.slice().sort((a, b) => a.name.length - b.name.length)[0]
}

/** ACE 音：*_Kill_Successive → _Kill_5 → 体积第二大的击杀音（近似"第二长"） */
function pickAce(files, skin, usedPrefix, killFile) {
  const scoped = files.filter((f) => startsWithPrefix(f.name, usedPrefix))
  const successive = scoped.find((f) => /successive/i.test(f.name) && /kill/i.test(f.name))
  if (successive) return successive
  const fifth = scoped.find((f) => /_kill_?5(\.|_|$)/i.test(f.name) && /kill/i.test(f.name))
  if (fifth) return fifth
  const kills = scoped
    .filter((f) => /kill/i.test(f.name) && !/inspect|reload|equip/i.test(f.name))
    .sort((a, b) => b.size - a.size)
  if (kills.length >= 2) return kills[1]
  if (kills.length === 1 && kills[0].name !== killFile.name) return kills[0]
  return null
}

// -------------------------------------------------------------- 下载/转码
function which(bin) {
  const r = spawnSync('sh', ['-c', 'command -v ' + bin], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}

const HAS_FFMPEG = !!which('ffmpeg') && !!which('ffprobe')
const HAS_AFCONVERT = !!which('afconvert')

async function downloadTo(fileUrl, destPath, attempt = 0) {
  try {
    const res = await fetch(fileUrl, { headers: DL_HEADERS, redirect: 'follow' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const ct = res.headers.get('content-type') || ''
    if (/text\/html/i.test(ct)) throw new Error('HTML 响应（CDN 拒绝）：' + ct)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 2048) throw new Error('响应过小 ' + buf.length + 'B')
    fs.writeFileSync(destPath, buf)
    return buf.length
  } catch (e) {
    if (attempt < 2) {
      await sleep(800 * (attempt + 1))
      return downloadTo(fileUrl, destPath, attempt + 1)
    }
    throw e
  }
}

function probeDuration(file) {
  if (!HAS_FFMPEG) return NaN
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) return NaN
  return Number(String(r.stdout).trim())
}

function toM4a(srcMp3, destM4a) {
  if (HAS_FFMPEG) {
    const r = spawnSync(
      'ffmpeg',
      [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', srcMp3,
        '-vn',
        '-ac', '1',
        '-ar', '44100',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-f', 'ipod',
        destM4a,
      ],
      { encoding: 'utf8' },
    )
    if (r.status !== 0) throw new Error('ffmpeg 失败：' + String(r.stderr).slice(0, 200))
    return
  }
  if (HAS_AFCONVERT) {
    const r = spawnSync(
      'afconvert',
      ['-f', 'm4af', '-d', 'aac', '-b', '96000', '-c', '1', srcMp3, destM4a],
      { encoding: 'utf8' },
    )
    if (r.status !== 0) throw new Error('afconvert 失败：' + String(r.stderr).slice(0, 200))
    return
  }
  throw new Error('缺少 ffmpeg / afconvert，无法转码')
}

/** 校验：> 6KB 且时长 > 0.2s */
function validate(file) {
  const st = fs.statSync(file)
  if (st.size <= MIN_BYTES) return { ok: false, reason: 'too-small:' + st.size + 'B' }
  const dur = probeDuration(file)
  if (!Number.isFinite(dur) || dur <= MIN_DURATION) return { ok: false, reason: 'too-short:' + dur + 's' }
  return { ok: true, size: st.size, duration: dur }
}


// ------------------------------------------------------------- 单皮肤处理
async function fetchOne(skin, manifest, ctx) {
  const outKill = path.join(OUT_DIR, skin.id + '-kill.m4a')
  const outAce = path.join(OUT_DIR, skin.id + '-ace.m4a')
  const prev = manifest.skins[skin.id]
  const wantAce = !!skin.ace

  // 幂等：manifest 已 real 且文件都在 → 跳过
  const aceOk = !wantAce || (prev && prev.aceStatus === 'real' && fs.existsSync(outAce))
  if (!FLAGS.force && prev && prev.status === 'real' && fs.existsSync(outKill) && aceOk) {
    ctx.skipped++
    console.log('  · ' + skin.id.padEnd(20) + ' 已存在，跳过')
    return
  }

  const prefixes = prefixCandidates(skin)
  let chosen = null
  const tried = []
  for (const p of prefixes) {
    tried.push(p)
    let list = []
    try {
      list = await listAudioForPrefix(p)
    } catch (e) {
      await sleep(200)
      continue
    }
    await sleep(80)
    const kf = pickKill(list, skin, p)
    if (kf) {
      chosen = { prefix: p, kill: kf, ace: wantAce ? pickAce(list, skin, p, kf) : null }
      break
    }
  }

  if (!chosen && FLAGS.baseFallback) {
    // 该皮肤没有专属音效：退回游戏默认击杀音（真实音频）
    let baseFiles = []
    try {
      baseFiles = await listAudioForPrefix('Base_Kill')
    } catch (e) {
      baseFiles = []
    }
    const idx = (ctx.baseRotate++ % 5) + 1
    const bKill =
      baseFiles.find((f) => new RegExp('base_kill_?' + idx + '\\.', 'i').test(f.name)) || baseFiles[0]
    const bAce = baseFiles.find((f) => /successive/i.test(f.name))
    if (bKill) chosen = { prefix: 'Base_Kill', kill: bKill, ace: wantAce ? bAce || null : null, base: true }
  }

  if (!chosen) {
    ctx.failures.push({
      skinId: skin.id,
      name: skin.name,
      target: 'kill',
      reason: 'no-audio-on-wiki',
      triedPrefixes: tried,
    })
    manifest.skins[skin.id] = {
      status: 'fallback',
      fallback: 'synth',
      sourceUrl: null,
      sourceFile: null,
      note: 'Fandom Wiki 上该皮肤没有击杀音效，保留原合成占位音',
      triedPrefixes: tried,
    }
    ctx.fallback++
    console.log('  x ' + skin.id.padEnd(20) + ' 无真实音效（' + skin.name + '）→ 保留占位音')
    return
  }

  fs.mkdirSync(TMP_DIR, { recursive: true })
  const tmpMp3 = path.join(TMP_DIR, skin.id + '-kill.mp3')
  const tmpM4a = path.join(TMP_DIR, skin.id + '-kill.m4a')

  let result
  try {
    await downloadTo(chosen.kill.url, tmpMp3)
    toM4a(tmpMp3, tmpM4a)
    result = validate(tmpM4a)
    if (!result.ok) throw new Error(result.reason)
    if (!FLAGS.dryRun) fs.copyFileSync(tmpM4a, outKill)
  } catch (e) {
    const msg = String(e.message || e)
    ctx.failures.push({ skinId: skin.id, name: skin.name, target: 'kill', reason: msg, triedPrefixes: tried })
    manifest.skins[skin.id] = {
      status: 'fallback',
      fallback: 'synth',
      sourceUrl: chosen.kill.url,
      sourceFile: chosen.kill.name,
      note: '下载/校验失败：' + msg,
    }
    ctx.fallback++
    console.log('  x ' + skin.id.padEnd(20) + ' 失败 ' + chosen.kill.name + '：' + msg)
    return
  }

  // ACE
  let aceInfo = { aceStatus: 'none' }
  if (wantAce) {
    if (!chosen.ace) {
      aceInfo = { aceStatus: 'fallback', aceNote: 'Wiki 上没有 Successive 音效，保留原占位 ACE 音' }
      if (fs.existsSync(outAce)) ctx.aceFallback++
    } else {
      const tmpAceMp3 = path.join(TMP_DIR, skin.id + '-ace.mp3')
      const tmpAceM4a = path.join(TMP_DIR, skin.id + '-ace.m4a')
      try {
        await downloadTo(chosen.ace.url, tmpAceMp3)
        toM4a(tmpAceMp3, tmpAceM4a)
        const v = validate(tmpAceM4a)
        if (!v.ok) throw new Error(v.reason)
        if (!FLAGS.dryRun) fs.copyFileSync(tmpAceM4a, outAce)
        aceInfo = {
          aceStatus: 'real',
          aceSourceUrl: chosen.ace.url,
          aceSourceFile: chosen.ace.name,
          aceBytes: v.size,
          aceDuration: Number(v.duration.toFixed(3)),
        }
      } catch (e) {
        const msg = String(e.message || e)
        aceInfo = { aceStatus: 'fallback', aceNote: 'ACE 下载/校验失败：' + msg }
        ctx.failures.push({ skinId: skin.id, name: skin.name, target: 'ace', reason: msg })
      }
    }
  }

  // 精确命中 / 同系列借用（例如 Prime//2.0 用 Prime 线的音效）
  const matchKind = chosen.base
    ? 'default-kill-sound'
    : norm(skin.name) === norm(chosen.prefix)
      ? 'exact'
      : 'line-variant'
  manifest.skins[skin.id] = {
    status: 'real',
    sourceUrl: chosen.kill.url,
    sourceFile: chosen.kill.name,
    matchedPrefix: chosen.prefix,
    matchKind,
    bytes: result.size,
    duration: Number(result.duration.toFixed(3)),
    ...(chosen.base ? { scope: 'default-kill-sound' } : {}),
    ...aceInfo,
  }
  ctx.real++
  console.log(
    '  + ' + skin.id.padEnd(20) + chosen.kill.name.padEnd(38) +
      Number((result.size / 1024).toFixed(1)).toString().padStart(6) + 'KB ' +
      result.duration.toFixed(2) + 's' + (aceInfo.aceStatus === 'real' ? '  [+ace]' : ''),
  )
}

// ------------------------------------------------------------------ main
async function main() {
  if (!fs.existsSync(CATALOG_PATH)) throw new Error('找不到 catalog.data.json: ' + CATALOG_PATH)
  if (!HAS_FFMPEG && !HAS_AFCONVERT) throw new Error('需要 ffmpeg/ffprobe 或 afconvert')
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))
  let skins = catalog.skins
  if (FLAGS.only.length) {
    const set = new Set(FLAGS.only)
    skins = skins.filter((s) => set.has(s.id))
  }

  // 读取已有 manifest（幂等用；只继承 skins，failed 每轮重算）
  const manifest = { generatedAt: null, skins: {}, failed: [] }
  let prevFailed = []
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const old = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
      manifest.skins = old.skins || {}
      prevFailed = Array.isArray(old.failed) ? old.failed : []
    } catch (e) {
      /* 损坏则重建 */
    }
  }

  console.log(
    '皮肤总数: ' + skins.length + ' | 并发: ' + FLAGS.concurrency +
      (FLAGS.force ? ' | --force' : '') + (FLAGS.dryRun ? ' | --dry-run' : '') +
      (FLAGS.baseFallback ? ' | --base-fallback' : ''),
  )
  console.log('数据源: valorant.fandom.com (list=allimages&aiprefix=)  →  ' + path.relative(ROOT, OUT_DIR) + '\n')

  const ctx = { real: 0, fallback: 0, skipped: 0, aceFallback: 0, failures: [], baseRotate: 0 }
  const queue = skins.slice()
  const workerCount = Math.min(FLAGS.concurrency, Math.max(1, queue.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const skin = queue.shift()
      try {
        await fetchOne(skin, manifest, ctx)
      } catch (e) {
        const msg = String(e.message || e)
        ctx.failures.push({ skinId: skin.id, name: skin.name, target: 'kill', reason: msg })
        ctx.fallback++
        console.log('  x ' + skin.id + ' 异常：' + msg)
      }
    }
  })
  await Promise.all(workers)

  manifest.generatedAt = new Date().toISOString()
  manifest.source = 'https://valorant.fandom.com (Valorant Wiki / Fandom) — 真实游戏内击杀音效'
  const allVals = Object.values(manifest.skins)
  manifest.stats = {
    total: catalog.skins.length,
    real: allVals.filter((s) => s.status === 'real').length,
    realExact: allVals.filter((s) => s.status === 'real' && s.matchKind === 'exact').length,
    realLineVariant: allVals.filter((s) => s.status === 'real' && s.matchKind === 'line-variant').length,
    realDefaultSound: allVals.filter((s) => s.status === 'real' && s.matchKind === 'default-kill-sound').length,
    fallback: allVals.filter((s) => s.status === 'fallback').length,
    aceReal: allVals.filter((s) => s.aceStatus === 'real').length,
  }
  // --only 只覆盖本轮处理过的皮肤，其他皮肤的历史失败记录保留
  const processed = new Set(skins.map((s) => s.id))
  manifest.failed = [...prevFailed.filter((f) => !processed.has(f.skinId)), ...ctx.failures]
  if (!FLAGS.dryRun) fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')

  const sizeTotal = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith('.m4a'))
    .reduce((n, f) => n + fs.statSync(path.join(OUT_DIR, f)).size, 0)

  console.log('\n──── 汇总 ────')
  console.log('真实音效: ' + manifest.stats.real + ' / ' + manifest.stats.total +
    '（精确同名 ' + manifest.stats.realExact + ' + 同系列借用 ' + manifest.stats.realLineVariant +
    '；ACE 真实 ' + manifest.stats.aceReal + ' 个）')
  console.log('保留占位音 fallback=synth: ' + manifest.stats.fallback)
  console.log('本次跳过(已存在): ' + ctx.skipped + ' | ACE 保留占位: ' + ctx.aceFallback)
  console.log('失败条目: ' + ctx.failures.length)
  console.log('public/val/kills 总大小: ' + (sizeTotal / 1024 / 1024).toFixed(2) + ' MB')
  for (const f of ctx.failures) console.log('  ! ' + f.skinId + ' [' + f.target + '] ' + f.reason)
  console.log('manifest: ' + path.relative(ROOT, MANIFEST_PATH))
}

main().catch((e) => {
  console.error('致命错误:', e)
  process.exit(1)
})

