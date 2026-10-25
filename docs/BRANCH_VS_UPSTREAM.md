# BRANCH_VS_UPSTREAM.md — 本分支相对上游有什么、缺什么、撞在哪

**什么时候看**：每次合并上游之前，和 `docs/MERGE_PLAYBOOK.md` 一起看。PLAYBOOK 讲**流程与红线**，这份讲
**范围与归属** —— 哪些目录整块取上游、哪些必须保留本分支、哪些只能逐文件解、哪些是「同一个名字装了两套实现」。

**数字必须重跑，不要手抄**（上游每天约 100 条提交）：

```bash
node tools/upstream-watch.mjs                     # 全量对照（默认先 git fetch upstream）
node tools/upstream-watch.mjs --no-fetch          # 离线，用本地已有引用
node tools/upstream-watch.mjs --list both         # 冲突面清单（也支持 ours/theirs/deleted/sameName…）
node tools/upstream-watch.mjs --json              # 喂给 CI / 生成文档
```

口径：**HEAD `0a28de7d`** 对 **upstream `f07b8965`（v0.3.3）**，共同祖先 `b3deebda`（v0.3.1），2026-10-25。

---

## 0. 一页数字

| 口径 | 数 | 含义 |
|---|---|---|
| 上游 0.3.1 之后 | **497** 条提交 | `0.3.1→0.3.2` 是 **491 条 / 915 文件**（多版本转向）；`0.3.2→0.3.3` 只有 **6 条 / 38 文件**（热修） |
| 上游改动过的文件 | **927** | |
| 本分支改动过的文件 | **556** | 相对同一祖先 |
| **双方都动过** | **188** | 其中 7 个是「我们已删除」，真正逐文件解 **181** |
| 只在 HEAD 里的文件 | **211** | 本分支新增的能力 |
| 只在 upstream 里的文件 | **394** | = 主动删除 **24** + 上游新增没跟上 **370** |
| **同名不同源（add/add）** | **11** | 同一路径两套独立实现，机器无法代劳 —— 见 §3.1，**合并前必须先定** |

一句话：上游 927 个文件里只有 188 个和我们撞上（20%）；但最危险的**不是这 188 个，是那 11 个同名文件**。

---

## 1. 本分支独有（211 个文件）

以下都用**内容检索**确认过上游 0 命中（`git grep -l <关键词> f07b8965 -- server/ shared/ public/js/`），
不是看文件名猜的。

### 1.1 服务端基础设施

| 能力 | 主要文件 | 上游 |
|---|---|---|
| 房间持久化与崩溃恢复 | `server/persist.js`、`persistRecovery.js`、`redis.js`、`workers/persistence.js`、`workers/persistenceClient.js`、`match/snapshot.js` | 无（只有素材哈希写 `.cache`） |
| 指标端点 + 监控栈 | `deploy/monitoring/**`（exporter、prometheus 规则、grafana 面板、alerts 测试）+ `/metrics` | 无 `/metrics`、无 prometheus/grafana |
| 网络诊断 | `server/netDiagnostics.js`、`shared/traffic.js`、`public/js/ui/resourcePanel.js` | 无 |
| 性能基准 | `tools/{wsbench,match-workerbench,workerbench,healthbench,memorybench,persistbench,server-hotpathsbench,bench-state-delta}.mjs` | 无 |
| R2 同步 | `scripts/{prepare-r2-config,prepare-r2-data,sync-to-r2}`、`config/r2-sync.example.json`、`docs/R2_SYNC.md` | 无 |
| 部署脚手架 | `scripts/deploy-compose.mjs`、`vite.config.js`、`config/**` | 只有 `Dockerfile` |

### 1.2 素材分发 —— 是**整体替换**，不是加功能

本分支主动删掉上游 24 个文件，换成自己的资源包体系：

- 删除：`public/js/{assetCache,assetDownload,assetPack}.js`、`public/sw.js`、`public/js/ui/{assetDownload,assetImport}.js`、
  `server/http/{assetIndex,assetViews,csp}.js`、`shared/assetPaths.js`、`tools/assets/stats-template.mjs`、
  `tools/fetch-stats-assets.mjs` + 6 个对应测试
- 替代：`public/js/resources/**`（11 个）、`public/resource-sw.js`、`server/resources.js`、
  `shared/resourcePackRoutes.js`、`shared/resourcePaths.js`、`public/js/asset-cdn.js`、`tools/resource_delta.py`、
  `tools/resource_packs.py`、`docs/RESOURCE_PACKS.md`

上游是「整包素材下载 / 导入素材包」，本分支是「分区 pack + 增量 + 完整性校验 + CDN」。
**合并时这条边界不能模糊**：上游改 `assetPack.js` 不代表资源包体系要退回去。

### 1.3 玩家侧运营功能

公告（`config/announcements.json` + `server/announcements.js` + `shared/announcements.js` + `ui/announcement*.js` +
`/api/announcement`、`/api/popup-announcement`）、名称审核（`server/nameModeration.js`、`jevNameModeration.js`、
`server/http/nameModeration.js`、`docs/NAME_MODERATION.md`）、成就（`ui/achievements.js`、`achievementModel.js`）、
合作模式（`server/cooperative.js`）、聊天（`shared/chat.js`）、移动端尺度（`public/css/utility-mobile.css`、
`ui/managementScale.js`、`frameRate.js`、`docs/MOBILE_UTILITY_UI.md`）、大厅外观与音乐（`ui/hubAppearance.js`、
`ui/lobbyMusic.js`、`ui/localMedia.js`、`ui/languageMenu.js`）。

---

## 2. 上游独有（394）

### 2.1 我们主动删掉的 24 个（保持删除，别被「复活」）

见 §1.2 删除清单。合并时上游若改了这些文件，**一律保持删除**。当前撞上的 7 个（`--list keepDeleted`）：
`public/js/assetCache.js`、`public/js/ui/assetDownload.js`、`server/http/csp.js`、
`test/ui/asset-download.browser.test.js`、`test/ui/asset-import.test.js`、`test/ui/hotkeys.e2e.test.js`、
`test/ui/hover-hotkeys.e2e.test.js`。

### 2.2 上游新增、我们还没跟的 370 个

| 目录 | 数 | 说明 |
|---|---|---|
| `data/` | 48 | 全是 `data/versions/**` —— **四个官方版本**的整套 JSON，0.3.2 的战略转向 |
| `test/ui/` | 47 | 配套界面测试 |
| `server/sim/` | 36 | 分版本的干员技能 / 天赋 / 敌人数值脚本 |
| `test/match/` `test/sim/` `test/golden/` `test/render/` `test/content/` | 32 + 24 + 18 + 13 + 10 | 配套测试 |
| `public/js/` | 15 | 分版本渲染与界面 |
| `server/match/` | 14 | 版本化对局调度 |
| `docs/research/`、`tools/ai/`、`server/ai/`、`tools/versions/` | 10 + 9 + 8 + 7 | 资料、AI 策略、版本工具 |
| 其余（`test/helpers`、`server/versions.js`、`docs/AI-*.md`、`ci-shards.json`、`types/`…） | 约 70 | 零散新增 |

**这一层几乎全是「新增」而不是「改我们改过的东西」** —— 是 497 条落后的主体，也是最好合的部分（整目录取上游）。

---

## 3. 冲撞面

### 3.1 同名不同源（11 个）—— 最高风险，先定架构再动手

双方在**同一个路径上各自新增**（base 里谁都没有）。git 只会报 add/add，但真正的问题是「一个名字装了两套独立实现」。

| 文件 | 我们的 | 上游的 | 建议 |
|---|---|---|---|
| `shared/stateDelta.js`（116 / 119 行） | `2abc60f0 perf: add delta state transport` | `b452c125 perf(net): delta state wire format and per-connection baselines` | 以上游为基：它有「每连接序号只增不减」语义 + 3 个新测试（`test/state-delta-{bytes,e2e,format}.test.js`）；我们独有的 `attachWorkerState` / `workerFrames` 是纯附加路径，嫁接回去即可 |
| `server/stateTransport.js`（63 / 81 行） | 同上，0.3.1 时代的版本 | 同文件重写 | 同上 |
| `server/workers/pool.js`、`roomPool.js`、`simulation.js`、`memory.js` | `40d4505f feat: move matches into room workers`（带 `persistence.js` / `stateEncoder.js`） | 版本化调度（`SP_VERSIONS`、`SP_MAX_VERSION_HOSTS`） | **必须先定架构**：方向应是「上游 pool/roomPool 为骨架，把我们的 persistence + stateEncoder 挂进去」，不能两边各留一套 |
| `public/js/ui/protocolScene.js`、`seatArt.js`、`transitions.js` | `f15d6fb1` / `fe60c100` 大厅、席位、转场视觉 | 同名独立实现 | **保留本分支**（这是本分支的界面语言） |
| `test/fixtures/pool-worker.mjs`、`test/ui/lobby-media.test.js` | 配套我们的实现 | 配套上游实现 | 跟随上面 worker / 前端的最终选择重写 |

### 3.2 双方都动过（188，真需逐文件解 181）

| 目录 | 数 | 处置原则 |
|---|---|---|
| `public/js/` | 43 | 逐文件。`battle/*`、`render/*`、`screens/*` 基本取上游；`resources/*`、`asset-cdn.js`、`useAssetImage.js` 保留本分支 |
| `test/ui/` | 19 | 逐文件。上游改了断言或导航的取上游后重跑 |
| `server/match/` | 16 | **最需要小心**：worker 宿主 / 快照在这层，上游在改版本化调度 |
| `public/css/` | 13 | 取上游，但 `theme.css`、`devices.css`、`game-panels.css` 里本分支的移动端尺度要保住 |
| `(根目录)` | 7 | `package.json` / `CHANGELOG` / `README`：取上游后补本分支说明 |
| `server/sim/` | 7 | 玩法数值取上游；`sim/snapshot.js` 来源不单一（合并时被改过），逐文件判断 |
| `server/http/` | 6 | 逐文件。`routes.js`、`websocket.js`、`index.js` 是热点 |
| `server/workers/` | 4 | 见 §3.1 |
| `public/i18n/`、`docs/design/` | 8 | 取上游，i18n 记得校验 4 × 100% |

**分层合并顺序**（每层一个提交，红点分开定责）：

1. 先定 §3.1 的架构（worker 宿主 / state delta 留谁）
2. `data/versions/` + `server/sim/`（纯新增为主）
3. `server/match/` + `server/workers/`（接口对接）
4. `server/http/` + `server/index.js`（路由与启动）
5. `public/js/` + `public/css/`（量最大，最后做）
6. `docs/` + 测试（整体取上游，再补本分支用例）

---

## 4. 上游**也有**的东西（别再当护城河）

这一节防自我安慰。以下能力两边都有，**差异在实现不在有无**：

| 能力 | 上游 | 本分支 |
|---|---|---|
| 健康检查 | `server/health/`（含事件循环健康）+ `/healthz` | 同 |
| **状态增量协议** | `shared/stateDelta.js` + `server/stateTransport.js` + 3 个 `test/state-delta-*.test.js`（0.3.2 新写） | 同名文件、独立实现 + worker 帧路径（§3.1） |
| **房间 worker 池** | `server/workers/{pool,roomPool,simulation,memory}.js` | 同名文件、独立实现（§3.1） |
| 皮肤系统 | `docs/SKINS.md` + `ui/skins.js` + `ui/skinPicker.js` + studio 编辑器 | 同，另加 `data/skins.json` + `shared/skins.js` |
| 插件体系 | 5 类插件 + `/studio/` + `plugin-catalog` | 同（消费者） |
| Docker | `Dockerfile` | 同 + 监控栈 + compose 脚本 |
| 素材分发 | `assetPack.js` / `assetDownload.js` / `sw.js` | 资源 pack 体系（§1.2） |
| 多版本 | `data/versions/**` + `server/versions.js` + `SP_VERSIONS` | **没有** —— 这是最大的功能差距 |

**真正只有本分支有的**：持久化与恢复、`/metrics` + 监控栈、资源 pack 增量与 CDN、公告、名称审核、成就、聊天、
合作模式、移动端尺度、R2 同步、网络诊断、8 个 bench 工具、部署 compose。

---

## 5. 追版策略（不落后于官方）

上游节奏：**每天约 100 条提交、1–2 天一个 tag**。靠机制，不靠意志。

1. **热修立刻跟**。0.3.3 只有 6 条 / 38 文件，成本约半小时；攒到下次就变成大合并。
2. **巨型版本提前预读**。0.3.2 那种（491 条 / 915 文件）等发版再合就迟了。拉一个只读 worktree 盯
   `upstream/master`，定期跑 `node tools/upstream-watch.mjs`，**看 §3.1 的同名冲突和冲突面有没有变大**。
3. **只跟 tag，不跟 master 中间态**。以 `v0.3.x` 为锚点（沿用 `up-v0.3.0`、`up-v0.3.1` 本地标记的惯例）。
4. **持续压低交集**。冲突面 = 我们改过的文件 ∩ 上游改过的文件。新功能尽量做成**新增文件**或配置开关，
   改上游文件时把改动写成可识别的块。重灾区：`public/js/screens/*`、`public/js/ui/*`、`server/match/*`、
   `server/http/*`、以及 §3.1 那 11 个同名文件。
5. **不要「修」上游的有意偏差**。维护者会主动偏离官方行为并写进 CHANGELOG（如 0.3.3 第一期允许满整备区互换）。
   看到「上游和官方 wiki 不一致」，先查 CHANGELOG 与 `§3x` 编号，别当 bug。
6. **每次合并后重跑脚本更新本文数字**，并在 `docs/MERGE_<ver>.md` 写「静默合并缺陷」表。
