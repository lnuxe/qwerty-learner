#!/usr/bin/env node
/**
 * 生成特工中文语音（macOS say + afconvert）
 *
 * 数据源: src/valorant/catalog.data.json -> agents[].lines（中文台词）
 * 输出:   public/val/agents/<agentId>/{praise,taunt,start,finish}.m4a
 *
 * 用法:
 *   node scripts/val-gen-agent-voices.mjs              # 幂等：已存在且够大的跳过
 *   node scripts/val-gen-agent-voices.mjs --force      # 全部重新合成
 *   node scripts/val-gen-agent-voices.mjs --only=jett,viper
 *   node scripts/val-gen-agent-voices.mjs --dry-run    # 只打印计划
 *
 * 依赖: macOS 自带 say / afconvert；ffprobe 可选（用于时长校验）
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG = path.join(ROOT, 'src/valorant/catalog.data.json')
const OUT_ROOT = path.join(ROOT, 'public/val/agents')

const KEYS = ['praise', 'taunt', 'start', 'finish']
const RATE = 190
const CONCURRENCY = 4
const MIN_DURATION = 0.4
const MIN_BYTES = 2000

// zh_CN 音色优先级：第一个可用且能真正出声的作为默认音色
const VOICE_PREFERENCE = ['Tingting', 'Sandy', 'Shelley', 'Flo', 'Eddy', 'Reed', 'Rocko', 'Grandma', 'Grandpa']

const argv = process.argv.slice(2)
const FORCE = argv.includes('--force')
const DRY = argv.includes('--dry-run')
const onlyArg = argv.find((a) => a.startsWith('--only='))
const ONLY = onlyArg ? onlyArg.slice(7).split(',').map((s) => s.trim()).filter(Boolean) : null

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr || '') }))
      else resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })

const sizeOf = (f) => {
  try {
    return fsSync.statSync(f).size
  } catch {
    return 0
  }
}

/** 解析 say -v '?'，只取 zh_CN；返回 base 名 -> say 需要的完整音色名 */
async function resolveVoices() {
  const { stdout } = await run('say', ['-v', '?'])
  const map = new Map()
  const report = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(.+?)\s{2,}(zh_CN)\s+#/)
    if (!m) continue
    const full = m[1].trim()
    const base = full.replace(/\s*\(.*$/, '').trim()
    map.set(full, full)
    map.set(base, full)
    report.push(base)
  }
  return { map, report }
}

/** 试音，确认音色真的能出声（未下载的音色会失败或产出极小文件） */
async function probeVoice(full) {
  const tmp = path.join(os.tmpdir(), 'val-voice-probe.aiff')
  try {
    await run('say', ['-v', full, '-r', String(RATE), '-o', tmp, '--', '中文试音'])
    return sizeOf(tmp) > 20000
  } catch {
    return false
  } finally {
    await fs.rm(tmp, { force: true })
  }
}

async function duration(file) {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
    return Number.parseFloat(stdout.trim())
  } catch {
    return null
  }
}

async function synth(voice, text, outFile) {
  const tmp = path.join(os.tmpdir(), 'val-voice-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.aiff')
  try {
    await run('say', ['-v', voice, '-r', String(RATE), '-o', tmp, '--', text])
    try {
      await run('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', '-c', '1', tmp, outFile])
    } catch {
      await run('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', tmp, outFile])
    }
    const size = sizeOf(outFile)
    if (size < MIN_BYTES) throw new Error('输出过小 ' + size + 'B')
    return size
  } catch (e) {
    await fs.rm(outFile, { force: true })
    throw e
  } finally {
    await fs.rm(tmp, { force: true })
  }
}

async function main() {
  const catalog = JSON.parse(fsSync.readFileSync(CATALOG, 'utf8'))
  const allAgents = catalog.agents ?? []
  if (!allAgents.length) throw new Error('catalog.agents 为空')
  const agents = ONLY ? allAgents.filter((a) => ONLY.includes(a.id)) : allAgents
  if (!agents.length) throw new Error('--only 没有匹配到 agent')

  const { map: voices, report } = await resolveVoices()
  if (!report.length) throw new Error('系统没有 zh_CN 音色')

  let defaultVoice = null
  for (const name of VOICE_PREFERENCE) {
    const full = voices.get(name)
    if (full && (DRY || (await probeVoice(full)))) {
      defaultVoice = full
      break
    }
  }
  if (!defaultVoice) defaultVoice = voices.values().next().value

  console.log('zh_CN 音色:', report.join(' / '))
  console.log('默认音色:', defaultVoice, ' 语速 -r ' + RATE)

  // 组装任务
  const jobs = []
  const voiceOfAgent = new Map()
  for (const agent of agents) {
    const voice = voices.get(agent.voice) || defaultVoice
    voiceOfAgent.set(agent.id, voice)
    const dir = path.join(OUT_ROOT, agent.id)
    for (const key of KEYS) {
      const text = agent.lines?.[key]
      if (!text) {
        console.warn('[skip] ' + agent.id + '.' + key + ' 缺少中文台词')
        continue
      }
      const file = path.join(dir, key + '.m4a')
      jobs.push({ agent: agent.id, key, text, voice, dir, file })
    }
  }

  if (DRY) {
    for (const j of jobs) console.log('[plan] ' + j.agent + '.' + j.key + ' | ' + j.voice + ' | ' + j.text)
    console.log('共 ' + jobs.length + ' 条（dry-run 未生成）')
    return
  }

  let made = 0
  let skipped = 0
  const bad = []
  const queue = [...jobs]

  async function worker() {
    while (queue.length) {
      const job = queue.shift()
      await fs.mkdir(job.dir, { recursive: true })
      if (!FORCE && sizeOf(job.file) >= MIN_BYTES) {
        skipped += 1
        continue
      }
      try {
        const size = await synth(job.voice, job.text, job.file)
        job.size = size
        made += 1
        process.stdout.write('.')
      } catch (e) {
        bad.push(job.agent + '/' + job.key + ': ' + e.message)
        process.stdout.write('x')
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
  process.stdout.write('\n')

  // 逐 agent 汇总（直接读磁盘，保证统计的是最终产物）
  let totalBytes = 0
  let totalFiles = 0
  const shortAudio = []
  console.log('\n每个 agent 的文件数与大小:')
  for (const agent of agents) {
    const voice = voiceOfAgent.get(agent.id)
    let count = 0
    let bytes = 0
    for (const key of KEYS) {
      const f = path.join(OUT_ROOT, agent.id, key + '.m4a')
      const size = sizeOf(f)
      if (!size) continue
      count += 1
      bytes += size
      const d = await duration(f)
      if (d !== null && d <= MIN_DURATION) shortAudio.push(agent.id + '.' + key + '=' + d.toFixed(2) + 's')
    }
    totalBytes += bytes
    totalFiles += count
    console.log(
      '  ' + agent.id.padEnd(10) + ' ' + voice.padEnd(28) + ' ' + String(count) + ' files  ' + (bytes / 1024).toFixed(1) + ' KB',
    )
  }

  const expect = agents.length * KEYS.length
  console.log(
    '\n汇总: 本次合成 ' + made + ' | 跳过(已存在) ' + skipped + ' | 失败 ' + bad.length +
      ' | 磁盘文件 ' + totalFiles + '/' + expect,
  )
  console.log('总大小: ' + (totalBytes / 1024 / 1024).toFixed(2) + ' MB (' + totalBytes + ' bytes)')
  if (shortAudio.length) console.warn('时长过短(<= ' + MIN_DURATION + 's): ' + shortAudio.join(', '))
  if (bad.length) {
    console.error('失败明细: ' + bad.join(' ; '))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('[fatal]', e)
  process.exit(1)
})
