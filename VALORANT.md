# 无畏契约（Valorant）音效联动

给 qwerty-learner 加的一层「游戏反馈」：打字时的连击、连错、章节结束，会用枪皮击杀音和特工语录回应你；
背景是全局的（所有页面都生效），音效与背景都能在设置页里自定义。

入口：练习页顶栏的 **VAL** 按钮，或直接访问 `/valorant`。

---

## 一、触发规则

仓库里的打字计数是两套（已核对 `src/pages/Typing/components/WordPanel/components/Word/index.tsx`）：

| 计数 | 粒度 | 含义 |
|---|---|---|
| correctCount / wrongCount | **字符级** | 每打对一个键 / 打错一个键就 +1 |
| chapterData.index / wordCount | **词级** | 换词时 +1 |

所以引擎这样判定：

- **连对（streak，词级）**：一个词从头到尾零错键才算「干净通过」，streak +1；这个词里打错过一个键，streak 归零。
- **连错（errorStreak，字符级）**：每打错一个键 +1。**这是「一直错一直错」的核心** —— 同一个词上反复打错会持续累积，
  到达阈值就有人开口嘲讽；错得越多语气越凶（errorRageAt 之后音量 ×1.18）。
  连错只在「整词干净通过」或「章节重开」时清零，所以错-对-错-对的反复挣扎也会被念。

七类事件：

| 事件 | 触发时机 | 默认资源 |
|---|---|---|
| kill 连击击杀音 | 连对 ≥3 个干净词，之后每 3 个词一次（700ms 冷却） | 当前枪皮的击杀音 |
| ace ACE 爆发音 | 连对达到 12（每段连击只响一次） | 该枪皮的 ACE 音 |
| finalKill 最终击杀 | 本章打完 | 枪皮 ACE / 击杀音，音量 ×1.1 |
| agentTaunt 特工嘲讽 | 连错 ≥5 个键（冷却 4.5s） | 当前特工的打错台词 |
| agentPraise 特工夸奖 | 干净通过一个词时按 25% 概率 | 当前特工的夸奖台词 |
| agentStart 开场台词 | 进入 / 重开一章 | 当前特工的开场台词 |
| agentFinish 收尾台词 | 本章完成 | 当前特工的收场台词 |

所有阈值、冷却、概率都在「触发规则」页可调，可一键恢复默认。

---

## 二、素材来源（都是真实游戏音频）

**枪皮击杀音：63 / 63 全部是真实音效**，来自 Valorant 官方 Wiki（Fandom 镜像）的音频库，
由 `scripts/fetch-val-kills.mjs` 抓取并按皮肤 id 落盘：

| 类型 | 数量 | manifest 标记 |
|---|---|---|
| 枪皮专属击杀音（如 `Reaver_Kill_1.mp3`） | 31 | `matchKind: "exact"` |
| 同系列借用（prime-2 ← Prime） | 1 | `line-variant` |
| 官方素材里没有该枪皮专属击杀音，用游戏默认击杀音 `Base_Kill_N` | 31 | `default-kill-sound` |
| ACE 音 | 12 / 12 全部真实（`*_Kill_Successive`） | — |

设置页「总览」里每个枪皮下面会写明它属于哪一种，**不把默认击杀音冒充成专属音效**。

**特工台词：28 位 × 4 句，默认中文**（贴合国服配音语气），英文原文保留在 `linesEn` 里供参考。
语音由 `scripts/val-gen-agent-voices.mjs` 用 macOS 中文语音（Tingting / Flo / Sandy / Shelley / Eddy / Reed / Rocko）
按角色分配音色合成。真实国服配音音频没有公开素材，这里用中文 TTS 兜底；要换成真实配音，在设置页上传即可。

重新抓取 / 重新合成：

    node scripts/fetch-val-kills.mjs              # 增量，只补缺的
    node scripts/fetch-val-kills.mjs --force      # 全部重抓（默认只认专属音效）
    node scripts/fetch-val-kills.mjs --force --base-fallback   # 缺专属音时用游戏默认击杀音补满
    node scripts/val-gen-agent-voices.mjs --force # 重生成 112 句中文台词

抓取脚本的两个坑（已处理）：Fandom 音频 CDN 用浏览器 UA 会 403（要带 `Referer: https://valorant.fandom.com/` + 朴素 UA）；
前缀匹配必须做词边界校验，否则 `Black` 会误命中 `Blackthorn_Kill_1.mp3`。

**自定义素材**：设置页 → 音效绑定 → 某类事件 → 「上传自定义」，文件存进浏览器 IndexedDB（`valorant-audio`），
不经过任何服务器；也可以直接覆盖 `public/val/` 下同名文件后重新构建。

---

## 三、背景（全局）

- 挂载点在 `src/index.tsx` 的 Root 里，**所有页面**（练习 / 设置 / 词库 / 统计 / 错题本 / 移动端）都生效。
- 默认背景：`public/val/bg/valorant-bg.jpg`（你提供的那张壁纸）。
- 三层结构：壁纸层（可虚化 / 可调浓度）→ 薄纱层（浅色主题是白纱，深色主题是黑纱）→ 内容。
- 正文不套任何矩形遮罩：可读性靠「文字光晕」（`text-shadow` 描同色柔光），所以壁纸始终看得见。
- 外观页可调：启用 / 壁纸浓度（不透明度）/ 背景虚化 / 薄纱浓度 / 上传自己的图。

层级要点（踩过的坑）：
1. 背景层必须 `createPortal` 到 `document.body`。留在 `#root` 里时，即使 `z-index: 0`，
   按绘制顺序也会盖住所有非定位内容 → 单词面板直接消失过。
2. `body` 自带不透明底色会盖住背景层，需 `html.val-bg-on body { background-color: transparent }`。
3. 配置有 `bgv` 版本号，默认观感调整时会一次性迁移老配置（只动背景，不动其它设置）。

---

## 四、代码结构

    src/valorant/
      types.ts              类型契约（事件、资源、配置）
      config.ts             jotai 配置原子 + 默认值 + 中文标签 + 背景迁移
      catalog.data.json     枪皮 / 特工 / 中文台词（唯一数据源）
      catalog.ts            JSON 的类型化包装 + 查询函数
      audio-manifest.json   每个枪皮用的是哪条真实音频（含来源 URL）
      storage.ts            IndexedDB：自定义音频、背景图（dexie）
      audioEngine.ts        HTMLAudioElement 播放池、idb:/custom: 解析、解锁
      triggers.ts           纯函数触发引擎（时间外部注入，无 DOM）
      useValorantEffects.ts 快照 → 引擎 → 播放 / 连击浮层状态
      ValorantBridge.tsx    挂进 TypingContext，取打字快照
      Background.tsx        全局背景层（portal 到 body）
      ComboOverlay.tsx      COMBO ×N + 最近触发的台词
      page.tsx              /valorant 设置页（四个 panel）
      settings/*.tsx        总览 / 触发规则 / 音效绑定 / 外观背景
      val.css               背景层、文字光晕、浮层样式
    scripts/
      fetch-val-kills.mjs       从官方 Wiki 抓真实枪皮击杀音
      val-gen-agent-voices.mjs  中文台词 TTS → m4a
      val-patch-agent-lines.mjs 把中文台词写进 catalog.data.json
      val-agent-lines-zh.json   28 位特工的中文台词源
      val-gen-assets.mjs        最早那版占位音生成器（保留，可作兜底）
    public/val/                  内置素材（kills / agents / bg）

集成点：`src/index.tsx`（全局背景 + `/valorant` 懒加载路由）、`src/pages/Typing/index.tsx`（VAL 入口 + `<ValorantBridge />`）。

配置存储：`localStorage["valorantConfig"]`；自定义音频 / 背景：IndexedDB `valorant-audio`。

---

## 五、构建与部署

    cd qwerty-learner
    ./node_modules/.bin/vite build --base=/     # 产物在 build/，public/val 会一起拷进去
    cd .. && ./qwerty-start.sh                  # 本地静态服务 http://127.0.0.1:8080/

注意：必须用 `--base=/`（绝对路径）；发音走本地同源代理 `/dictvoice`（见 `qwerty-serve.mjs`），
换 nginx 等其它服务器时记得补这条反代，否则有道音频会被跨域拦掉。
