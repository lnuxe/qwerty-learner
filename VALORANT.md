# 无畏契约（Valorant）音效联动

给 qwerty-learner 加的一层「游戏反馈」：打字时的连击、连错、章节结束，会用枪皮击杀音和特工语录回应你；
背景可以换成无畏契约壁纸，音效与背景都能在设置页里自定义。

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
| ace ACE 爆发音 | 连对达到 12（每段连击只响一次） | 该枪皮的 ACE 音，没有则用击杀音 |
| finalKill 最终击杀 | 本章打完 | 枪皮 ACE / 击杀音，音量 ×1.1 |
| agentTaunt 特工嘲讽 | 连错 ≥5 个键（冷却 4.5s） | 当前特工的打错台词 |
| agentPraise 特工夸奖 | 干净通过一个词时按 25% 概率 | 当前特工的夸奖台词 |
| agentStart 开场台词 | 进入 / 重开一章 | 当前特工的开场台词 |
| agentFinish 收尾台词 | 本章完成 | 当前特工的收场台词 |

所有阈值、冷却、概率都在「触发规则」页可调，可一键恢复默认。

---

## 二、素材

- 内置目录：**63 个枪皮系列** + **28 位特工**，共 **187 条音频**（63 击杀音 + 12 ACE 音 + 112 句特工台词）。
- ⚠️ **仓库里带的是本地生成的占位音**：枪皮音是按每个皮肤 id 派生的合成音色（基频 / 泛音 / 衰减 / 噪声各不相同，
  听得出区别），特工台词用 macOS `say` 朗读英文原文。真实游戏音频有版权，不随仓库分发。
- 换真实素材有两种方式：
  1. **设置页上传（推荐）**：`/valorant` → 音效绑定 → 某类事件 → 「上传自定义」。文件存进浏览器 IndexedDB
     （库名 `valorant-audio`），立刻绑定并可试听，不经过任何服务器。
  2. **直接替换内置文件**：把自己的 mp3 / m4a 放到 `public/val/kills/<皮肤id>-kill.m4a`、
     `public/val/agents/<特工id>/<praise|taunt|start|finish>.m4a`，重新构建即可。
     id 清单见 `src/valorant/catalog.data.json`。

重新生成占位素材（幂等，已存在会跳过）：

    node scripts/val-gen-assets.mjs           # 增量
    node scripts/val-gen-assets.mjs --force   # 全部重生成

---

## 三、背景

- 默认背景：`public/val/bg/valorant-bg.jpg`（你提供的那张壁纸）。
- 「外观背景」页可：开关、上传自己的图、模糊 0-24px、暗化 0-90%、不透明度、毛玻璃内容底。
- 层级要点：`html.val-bg-on body { background-color: transparent }` + `#root { z-index: 1 }`，
  否则背景层会被 body 自带底色盖住（见 `src/valorant/val.css`）。

---

## 四、代码结构

    src/valorant/
      types.ts              类型契约（事件、资源、配置）
      config.ts             jotai 配置原子 + 默认值 + 中文标签
      catalog.data.json     枪皮 / 特工 / 台词数据（唯一数据源）
      catalog.ts            JSON 的类型化包装 + 查询函数
      storage.ts            IndexedDB：自定义音频、背景图（dexie）
      audioEngine.ts        HTMLAudioElement 播放池、idb:/custom: 解析、解锁
      triggers.ts           纯函数触发引擎（时间外部注入，无 DOM）
      useValorantEffects.ts 快照 → 引擎 → 播放 / 连击浮层状态
      ValorantBridge.tsx    挂进 TypingContext，取打字快照
      Background.tsx        全屏背景层 + 毛玻璃工具类
      ComboOverlay.tsx      COMBO ×N + 最近触发的台词
      page.tsx              /valorant 设置页（四个 panel）
      settings/*.tsx        总览 / 触发规则 / 音效绑定 / 外观背景
      val.css               背景层、毛玻璃、浮层样式
    scripts/val-gen-assets.mjs   占位素材生成器（WAV 合成 + afconvert + say）
    public/val/**                内置素材

集成点（不在 src/valorant/ 内）：

- `src/index.tsx`：`/valorant` 懒加载路由
- `src/pages/Typing/index.tsx`：顶栏 **VAL** 入口、`<ValBackground />`、`<ValorantBridge />`、毛玻璃类

配置存储：`localStorage["valorantConfig"]`；自定义音频 / 背景：IndexedDB `valorant-audio`。

---

## 五、构建与部署

    cd qwerty-learner
    ./node_modules/.bin/vite build --base=/     # 产物在 build/，public/val 会一起拷进去
    cd .. && ./qwerty-start.sh                  # 本地静态服务 http://127.0.0.1:8080/

注意：

- 必须用 `--base=/`（绝对路径）。仓库默认的 `--base=./` 配合 BrowserRouter，深层路由会把相对资源路径打歪。
- 发音走本地同源代理 `/dictvoice`（见 `qwerty-serve.mjs`）。换 nginx 等其它服务器时记得补这条反代，
  否则有道音频会被跨域拦掉。
