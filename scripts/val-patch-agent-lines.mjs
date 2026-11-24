// 把 catalog.data.json 的 agents 台词换成中文，英文原文留在 linesEn
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const catalogPath = path.join(root, 'src/valorant/catalog.data.json')
const zh = JSON.parse(fs.readFileSync(path.join(root, 'scripts/val-agent-lines-zh.json'), 'utf8'))
const data = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))

let patched = 0
for (const agent of data.agents) {
  const src = zh[agent.id]
  if (!src) {
    console.log('缺少中文台词:', agent.id)
    continue
  }
  const old = agent.lines ?? {}
  agent.linesEn = {
    praise: old.praise ?? '',
    taunt: old.taunt ?? '',
    start: old.start ?? '',
    finish: old.finish ?? '',
  }
  agent.lines = { praise: src.praise, taunt: src.taunt, start: src.start, finish: src.finish }
  agent.voice = src.v
  patched += 1
}

fs.writeFileSync(catalogPath, JSON.stringify(data, null, 2) + '\n')
console.log('patched agents:', patched, '/ total', data.agents.length, '| skins untouched:', data.skins.length)
