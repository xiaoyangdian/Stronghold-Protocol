# 上游 v0.3.1 合并记录

状态：**已完成并提交**（`c313380f`，父 `e01036ae` + `b3deebda`），全量测试与黄金场景通过。合并分支
`feat/upstream-0.3.1`，锚定上游 tag `v0.3.1`（`b3deebda`），不纳入标签后的开发提交（上游 `master` 已到 0.3.2，
合并 PR #728）。

配套文档：这次合并**为什么花了六个多小时**、哪些弯路可以避免 → `docs/MERGE_0.3.1_RETRO.md`；
下次合并照着做的流程 → `docs/MERGE_PLAYBOOK.md`；本地与真机怎么验 → `docs/TESTING_LOCAL.md`。

## 锚点与基线

| 项 | 值 |
|---|---|
| 本分支合并前 | `e01036a`（2026-10-18，perf(persist)） |
| 共同祖先（= 上游 v0.3.0 标签） | `c24e17ee`（2026-10-16） |
| 上游目标 | tag `v0.3.1` = `b3deebda`（2026-10-18） |
| 分叉后本分支提交 | 139 |
| 分叉后上游提交 | 215 |

分叉点等于 `v0.3.0` 标签，与 `docs/MERGE_0.3.0.md` 记录的锚点一致，历史链完整。

## 冲突规模（实测）

| 指标 | 数量 |
|---|---|
| 从 `v0.3.0` 起本分支改动文件 | 561 |
| 从 `v0.3.0` 起上游改动文件 | 537 |
| 两侧都改过（潜在冲突） | 183 |
| **试合并真实冲突文件** | **89** |
| **冲突块合计** | **225** |
| 冲突分布 | 1 块 45 个 / 2 块 26 个 / 3–4 块 10 个 / 5–9 块 4 个 / 10+ 块 4 个 |

冲突最集中的四个文件（75 块，占 33%）：`settle.js` 28、`sweep.js` 22、`game.js` 15、`matchPopups.js` 10。

## 特殊冲突类型

**本分支删除、上游持续修改（5 个）** —— 按 0.3.0 既有决策保持删除：

| 文件 | 依据 |
|---|---|
| `public/js/assetCache.js` | 本分支用自己的预载 / Cache Storage 实现 |
| `public/js/assetPack.js` | 0.3.0「排除导入素材包及配套导入器 / 打包模式」 |
| `server/http/assetViews.js` | 同上 |
| `server/http/csp.js` | 0.3.0「移除新增 CSP、SP_CSP 配置和 Pixi no-eval 适配器」 |
| `test/ui/asset-import.test.js` | 对应被排除的导入素材包 |

**add/add（两边各自新建同名文件，8 个）**：`docs/SKINS.md`、`public/js/screens/settle.js`、
`public/js/screens/sweep.js`、`public/js/ui/matchPopups.js`、`public/js/ui/skinPicker.js`、
`public/js/ui/skins.js`、`test/skins.test.js`、`test/ui/sweep.test.js`。

## 取舍原则

沿用 `docs/MERGE_0.3.0.md`：**玩法与数值同步上游，本分支的优化与特色功能保留**。

1. 战斗 / 数值 / 数据（`server/sim/**`、`data/*.json`）：以上游为准，除非触及已记录的本分支规则差异。
2. 服务端性能与部署（`server/workers`、`server/match` 增量协议、监控、持久化）：以本分支为准，上游新增能力合并进来。
3. 前端体验（`public/js`、`public/css`）：逐块判断——上游新增玩法界面元素要合入，本分支的按需加载 / 缓存 / 移动端密度 / 快捷键 / FPS 上限要保留。
4. 0.3.0 已明确排除的上游特性继续排除：导入素材包、CSP。
5. 文档、测试、工具链：两边都要，冲突处取并集。

## 未完成

- [x] 89 个冲突文件的逐块解决（无残留冲突标记）
- [x] `data/assets.json` 与 `data/config.json` 的取舍
- [x] 版本号、CHANGELOG
- [x] 验收：`npm run build`（7.1s，index 997 kB / gzip 343 kB）、`node tools/golden.mjs`（**288/288** 与基准一致）、`node --test`（根目录 1892 通过 / 0 失败，11 个子目录全绿，合计约 9.3k 项）、`node tools/doctor.mjs`（基本环境正常）
- [ ] 浏览器冒烟：只做到 HTTP 层（`/`、`/build/index.html`、首屏 JS、`/data/chess.json`、`/js/asset-cdn.js`、`/css/screens/sweep.css` 全 200，服务端日志无 error）。
  `SP_E2E=1 CHROME_PATH=… node --test test/ui/downed-plate.e2e.test.js` 试跑过一次：4 个用例全部停在
  `Waiting for selector .gm__hud failed`（30 秒超时）。判定为**前置资源缺失** —— `public/assets` 为空
  （约 720 MB 素材被 gitignore，本机未下载），而不是渲染逻辑坏了；错误发生在 mock 页面的 HUD 挂载之前，
  与这次删除的 `DownedPlate` 无关。**素材就位后需要重跑这一组**，以及 `test/ui/*.e2e.test.js`（69 个）与
  `test/render/*.browser.test.js`（26 个）里的其余用例。
  真实渲染与联机对局仍需人工过一遍，检查表见 `docs/TESTING_LOCAL.md` §5。

### 数据文件的取舍（逐叶子比对）

用逐叶子 diff 工具比对合并结果与两侧：与上游差 34 个叶子，与本分支差 125 个。

| 文件 | 结论 |
|---|---|
| `data/assets.json`、`data/chess.json`、`data/factions.json`、`data/backups.json` | **与上游完全一致（0 叶子差异）**，含 `hash`/`stats`。本分支除按同一表版本重新生成外没有本地改动。 |
| `data/config.json` | 保留本分支独有的 29 个叶子（全部是 `modes.*.bossHpScale.{coop,aliveScaling,aliveFull,aliveAssumed,solo,soloAssumed}`，2026-10-06 房主决策 PR #209）；**丢弃上游的 `bossHpScale.perPlayer`**：全仓库无读者（唯一的 `result.perPlayer` 是无关的映射）。 |

### 版本号

`package.json` = `package-lock.json` = `shared/constants.js APP_VERSION` = `0.3.1`，`DEV_BUILD` 为 false，`CHANGELOG.md` 最新的小节标题也是 `0.3.1`（`test/version.test.js` 要求三者一致）——**无需改动**。`CHANGELOG.md` 的 0.3.1 小节原先写着引入了上游的「素材存储」，与本分支既有的排除决定不符，已改写为本分支实际的预载 / Cache Storage 实现。


## 解决记录（按文件族）

### 以上游为准（上游实现更新 / 官方美术 / 上游测试钉死）

| 文件 | 依据 |
|---|---|
| `public/js/ui/matchPopups.js` | 上游用官方 `roundStartDialog/*` 素材 + `Sprite` 回退；`test/ui/match-popups.test.js` 第 5 项 `doesNotMatch(/PixBot|pixbots/)`。fork 的 `PixBot` 手绘整套退役。 |
| `public/js/ui/skins.js`、`skinPicker.js` | 上游以 operator `charId` 为键；server 侧 `operatorCharIds`/`checkSkinSelection` 已是 charId。fork 的 chess id 目录模型退役。fork 的 `skinsEnabled` 总开关以新增分支保留。 |
| `public/js/screens/sweep.js`、`test/ui/sweep.test.js` | 上游 `enemyGrade` 读 `factions.json handbookLevels`（官方 10 档 E…SS）；fork 用自造 `CUTS`（7 档）。上游用 `Modal` 做焦点陷阱。两侧测试对 lobby 的导入方式互斥，取上游。 |
| `public/js/screens/settle.js` | 上游为严格超集（多 `levelOf`/`dayKey`/`dailyPointsFor`/`levelProgress`/`opLevel`），并带官方 `settle/*` 素材。`test/ui/settle.test.js`（上游新增）钉死这些导出。 |
| `public/js/screens/game.js` | 上游把 `matchPlates.js`/`matchIntro.js` 重构为 `bossPlates.js`/`downedPlate.js`/`protocolBoot.js`；fork 的对应模块为重复实现。fork 唯一专有增量「主机控制台」（`ui/console.js`）已接回。 |
| `public/css/screens/game.css` | 删除 fork 残留的 `.mpop` 整块（97 行）：样式已独立到 `css/screens/match-popups.css`，两处并存时 `.mpop--phase .mpop__bot { width }` 会压过上游 `inset:0` 布局。 |

### 以本分支为准（上游只做增量 / fork 为超集）

| 文件 | 依据 |
|---|---|
| `public/js/screens/lobby.js` | base→上游仅差 52 行（未动结构），base→fork 差 158 行（hub 重构）；6 个 fork 测试钉住 hub 布局。上游 12 处增量逐条移植（`joinKnown`、`TestMark`、`NoticesButton`、`rememberRoom(code, test)`、测试房勾选框落在 `ProtocolSelect` 的 `proto-foot`）。 |
| `public/js/render/units.js` | 上游的裸 `this.info.skin` 会绕过 `skinsEnabled` 总开关，与 `shared/skins.js visibleSkin` 冲突；取 fork 的 `_displaySkin`（已按 `visibleSkin` 过滤）。 |
| `test/ui/fork-redesign.test.js` | 两处断言随契约更新：`SkinSection` 由 `chess=` 改 `charId=`；删除对 `LevelStrip|levelProgress` 的封禁（上游的卫戍认证等级结算由 `config.rewards.milestones` + 本机记录算出，不发明 XP，也仍无 `accountApi`/`fetch`/`net.request`）。 |

### 因 fork 既有排除决策而连带处理

`docs/MERGE_0.3.0.md` 第 25 行：「不引入标题页新增的『导入素材包』及配套独立导入器 / SW / 缓存 / 打包模式 / 翻译 / 测试预期」。据此：

| 项 | 处理 |
|---|---|
| `ui/settings.js` `StorageSection`（素材存储 / 清理旧版本素材 / 申请持久保存） | 删除。它依赖 fork 已删的 `assetCache.js`、`assetPack.js`，合并后成为悬空导入。 |
| `test/ui/settings-storage.e2e.test.js`（上游新增） | 删除：测的就是被排除的素材存储。 |
| `test/render/plugin-official-art.test.js`（上游新增） | 裁剪：保留 5 个用例中前 2 个（local/room/personal 美术 → `avatarUrl`/`portraitUrl`/`spineEntry`，`mergeLocalChars` 改由 `server/plugins/artReferences.js` 提供），删除依赖已排除 `server/http/assetViews.js`、`assetIndex.js` 的后 3 个。 |

### 合并过程中修掉的真实缺陷

1. `ui/settings.js` 悬空导入 `../assetCache.js`、`../assetPack.js`（前一批遗留）。
2. `ui/testConsole.js`（上游新增）导入 `actionForKey`，而本分支的 `gameLogic/shortcuts.js` 是另一套键位模型（`DEFAULT_SHORTCUTS`/`shortcutFor`/`shortcutLabel`，无 `keys` 设置项）。改用 `shortcutFor(e, shortcutsStore.get())`，与对战内的判定同源。
3. `ui/components.js`、`ui/hud.js`、`screens/loadout.js`、`ui/choiceOverlay.js` 的 git 静默重复声明（`Modal`、`reducedMotion`、`SkinSection` 导入、`spMarks`）。

### 收尾阶段（跑通全量测试时）修掉的静默缺陷

自动合并最危险的形态是「git 认为冲突已解决、代码也语法正确，但语义被悄悄替换」。以下都是这一形态，逐条都是跑测试 + 定向探针才暴露的：

| # | 位置 | 症状 | 为什么 git 不会报 |
|---|---|---|---|
| 1 | `server/match/player/basics.js`、`server/match/match/platform.js` | **同一类里两份 `setSkins`**：后定义者胜。前者是 fork 的 `freezeSkins`（chess 键），后者是上游的 charId 校验版；`platform.js` 里被覆盖的正是「拒绝非法皮肤并刷新侦查」的那份，于是非法选择回答 `ok` | 类成员重复声明是合法 JS |
| 2 | `server/match/PlayerState.js` | 构造函数里 fork 的 `freezeSkins` 初始化与上游的 `this.skins = Object.freeze({})` 并存，后者静默覆盖前者 | 同行赋值不冲突 |
| 3 | `server/match/match/views.js` | 同一个 `units.push({...})` 字面量里两个 `skin:` 键（chess 键在前、charId 键在后），前者成为死代码 | 对象字面量重复键合法 |
| 4 | `public/js/render/app.js`（`pieceInfo`）、`public/js/render/app/info.js`（`renderInfo`） | 同上：对象字面量两个 `skin:`，后者覆盖前者。**收尾定案**：`renderInfo` 留「读快照 `UnitInfo.skin`」那一份（`typeof u.skin === 'string' && u.skin ? u.skin : null`，另一份是同一读取的重复）；`pieceInfo` 反过来取上游的 `skin: piece.skin || null`，本分支那句 `si \|\| dr ? null : …` 守卫**退役**——0.3.1 把「补位 / 自选穿谁的皮肤」整条规则搬进了服务端（`PlayerBasics.skinFor` → `fieldRecord`），客户端再抹一次会把服务端已解析对的皮肤抹掉，并与战场里的同一枚棋子不一致 | 同上（`eslint no-dupe-keys` 才发现） |
| 5 | `server/match/host/proxy.js` | 两份 `setHost`：fork 的一行通知被上游实现覆盖，主机迁移不再通知 worker | 类成员重复 |
| 6 | `public/js/audio.js` | 调用 `unhashedUrl(url)` 但**没有导入**，且 `shared/assetPaths.js` 整个文件未被合并进来 → 池化攻击音效解码后必抛 `ReferenceError`（等于所有战斗音效失效） | 只在运行到该分支时炸 |
| 7 | `public/js/render/app.js` `setSettings` | 本分支的 `skinsEnabled` 分支被错误嵌套进上游的 `otherSkins` 分支内：只发 `skinsEnabled` 的调用被整段跳过；旁边还留着删掉的旧键 `mysticEnergy` | 缩进不同、语法合法 |
| 8 | `server/lobby.js` `routeGameNow` | 用了上游的 `room.test` 表达式却没带上游的 `if (!room)` 早退：排队中的对局被路由时 `Cannot read properties of null` | 两处都「看起来对」 |
| 9 | `server/lobby.js` `startMatch*` | ① 构造里没调用 `setTestHost(testHostOpt)`，`testEnabled` 永远 false；② 本地 / worker 两条启动路径都**没转发 `test`**；③ 重组后的 `startMatchWith` 丢了 `room.test && !testEnabled → TEST_DISABLED` 复检 | 逻辑缺行 |
| 10 | `server/match/host/proxy.js` `wireOptions` | 基础键表里带上 `hostId`，使普通对局的 worker 载荷与 0.3.1 不同（上游只在 `test === true` 时附加） | 多一个键 |
| 11 | `server/net.js` `HEAVY_TYPES` | 上游的集合覆盖了本分支的：`room.card`、`state.resync` 掉出限流桶（两者都还在协议与 lobby 里） | 集合取并集才算对 |
| 12 | `server/studio/index.js` | `meta` 路由 `json(200, changed(id))` **少了 `await`**：`changed` 是 async，返回体被序列化成 `{}`，工作室拿不到 version / manifest | 同样是合法表达式 |
| 13 | `deploy/monitoring/exporter/metrics.mjs` | 硬编码的协议类型集缺 `g.unequip` / `g.offer` / `g.offerRefresh` / `g.test`，这些处理器的延迟被静默丢出标签集 | 只是个白名单 |
| 14 | `public/js/screens/stats.js` `Overview` | 上游的 总览 实现被整段拼进本分支的函数体，引用 `nickname`/`records`/`fonts`/`uiUrl`/`trophyMedalOf`/`unknownMode`/`ModdedSwitch`/`TitleHexagon`。上游那套还依赖 `RecordHeading`/`MatchRecords`/`BondAchievement`/`ui/titleHexagon.js`，这些模块本分支没有 → 保留本分支的 总览，删掉拼入片段 | 词法上全是「标识符」 |
| 15 | `public/css/screens/title.css`、`public/css/screens/game.css` | 「按选择器取差集追加」把 0.3.0 已排除的素材包导入样式（`.title-assets`/`.asset-download*`/`.asset-import*`）、上游页脚仓库链接（`.title-repo`/`.title-foot__meta`）、以及本分支重复实现的下野板 `.downpl` 全块一起带了进来，全部无生产者 | CSS 无引用检查 |
| 16 | `tools/fetch-assets.mjs` | 保留了 `buildPlan({ statsTemplate })` 的实参，却既没导入 `statsTemplateJobs` 也没定义它（`ReferenceError`）；本分支的统计页不消费这些官方素材，改为不传 | 只在跑抓取时炸 |

### 皮肤键模型统一（0.3.1 契约）

`room.skins` / `PlayerState.skins` / `mUnitInfo.skin` 一律以**干员 charId** 为键（`shared/protocol.js` 的 `isSkinSelection` / `checkSkinSelection` / `operatorCharIds`），本分支此前的 chess 键模型退役：

- `lobby.skins` → `PlayerState.setSkins` → 快照恢复 → `views.js` 单条单位信息，四条路径统一；
- 快照恢复改用 `checkSkinSelection(ps.skins, id => operatorCharIds(...).has(id))`（内容集丢掉的干员退回默认）；
- 测试数据同步改写：`test/skins-lifecycle.test.js`（`INSIDE` 仍是棋盘断言用的 chess id，新增 `SKIN_KEY = char_498_inside`）、`test/persist-redis.test.js`。

### 跑全量测试时发现的**分支既有**问题（非合并引入，已确认基线同样红）

用 `.cache/baseline`（`e01036ae`）在合并前的工作树上复跑确认，以下不是这次合并带来的，但挡住了「全绿」：

- `public/js/screens/title.js` 的 UI 署名 `B站雨千代Chiyo` 是一个裸中文字面量，`tools/i18n.mjs` 的 `i18n-ignore` 是**行级**标记，而该文本位于 `html\`\`` 模板内，无法在同行写 `//` 注释 → 基线 `test/i18n.test.js` 一直红（全仓库唯一一条）。按仓库既有写法在该行末尾补一个 HTML 注释标记（`htm` 会丢弃注释，`test/ui/official-damage-numbers.test.js` 钉的 `>B站雨千代Chiyo</a>` 原样保留）。
- `test/resources/panel.test.js` 的 `.title-preload` 正则仍按旧的绝对偏移写，实际 CSS 已是 `calc(N * var(--ui-unit, 1rem))`（基线同样红）。

### 因取上游而退役 / 改写的测试与实现

| 项 | 处理 | 理由 |
|---|---|---|
| 本分支版 `DownedPlate`（`ui/matchPlates.js` 的 `.downpl`）+ 其 CSS | 删除 | 上游 `ui/downedPlate.js` + `.downm` 是 `screens/game.js` 实际渲染的实现，e2e 断言的是 `[data-testid="downed-plate"]` 与 `.downm__btn--watch`；本分支那份是重复实现，且它的注释与上游同名导致上游样式测试切错区块 |
| `public/js/screens/sweep.js` 的 lobby 接入 | 改回上游的**静态导入** + `sweepOpen` | `test/ui/sweep.test.js`（上游）钉住该写法。本分支的 `import('./sweep.js')` 是它那套 hub 页面导航（S.W.E.E.P. 作为独立 `screen` + 非模态 `SweepLoadingPage`）的一部分，而那套导航整体让位给了 0.3.1 的 lobby，所以惰性入口随之一并退役：报告现在与 lobby 同 chunk（即首屏 chunk），`test/vite.test.js` 从「sweep 是动态入口」改为**断言报告标记确实被打进首屏产物**（`sw-tabs`），而不是留一条恒真的放宽断言 |
| `test/ui/skins.test.js` | 重写 | 原文件导入 `ui/skins.js:installSkinsSync`，0.3.1 把同步引擎收敛到 `ui/loadoutSync.js` 的 `installPrefSync`；选择器行、设置默认、`visibleSkin` 分别由 `test/ui/skin-picker.test.js`、`test/ui/gameLogic.test.js`、`test/skins-lifecycle.test.js` 覆盖。重写后只保留 `cleanSkins`/`freezeSkins` 的上限与原型键契约，并钉住同步引擎的归属 |
| `test/ui/skin-picker-layout.test.js` 第 3 例 | 对齐新标记 | 0.3.1 把名称 / 系列画进格子、tooltip 改为「点击选择 / 点击放大预览」，`x.`/`chessId` 变量名也不再存在 |
| `test/ui/playtest3.test.js`、`test/ui/standin-ui.test.js`、`test/ui/text-scale.test.js`、`test/resources/panel.test.js` | 陈旧断言对齐 | 分别对应：皮肤目录并入 `assets` 清单（没有独立 `skins` 文件）、skin 只在使用时才进渲染签名、`--ui-unit` 统一回 `rem`（同一文件里两条互斥断言只留一条）、`--ui-unit` 化的 `.title-preload` 偏移 |

