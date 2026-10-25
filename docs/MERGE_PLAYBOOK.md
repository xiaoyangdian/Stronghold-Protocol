# 上游合并作业手册

适用场景：把上游新版合并进本分支。本文写**做法**，某一次的具体结果记录在 `docs/MERGE_<ver>.md`，那一次
的复盘（哪里慢、哪里走回头路）在 `docs/MERGE_0.3.1_RETRO.md`。

依据是 0.3.1 那次合并：89 个冲突文件、~542 个路径、16 条「git 看不出问题」的静默缺陷、累计 6 小时以上。

---

## 0. 开动前的那一小时（最省时间的投入）

按顺序读完这四样，再动手：

| 读什么 | 得到什么 |
|---|---|
| `CONTRIBUTING.md` §2 | 官方验证入口：`npm test`、`npm run golden`、`npm run lint && npm run check:imports && npm run typecheck`，以及**一条命令跑完全部 CI 检查**的 `npm run ci` |
| `tools/ci.mjs` 头部注释 | `npm run ci` 的步骤表：`setup --check` → `npm test` → 服务器冒烟（空闲端口起服、`/healthz`、首页、`doctor`、关服）→ `lint` → `check:imports` → `typecheck`。你打算手写的「冒烟测试」它已经写了 |
| `docs/MERGE_<上一次>.md` | 上次的取舍原则与**排除项**，直接继承，不要再讨论一遍（例：0.3.0 已排除「导入素材包」与 CSP，0.3.1 不必重新论证） |
| `docs/BRANCH_VS_UPSTREAM.md` + `node tools/upstream-watch.mjs` | 本次的**范围与归属**：哪些目录整块取上游、哪些保留本分支、冲突面有多少、以及同名不同源（add/add）的文件清单。数字自己重跑，别手抄 |
| `git remote -v` 与 `git log --merges -3` | 谁是上游、上次合并合的是哪个 tag |

本仓库的 remote 名字与直觉相反，务必确认一遍（**2026-10-25 已变，别再照旧记忆操作**）：

- `origin` = `xiaoyangdian/Stronghold-Protocol` = **用户自己的 fork**（当前分支 `feat/upstream-0.3.1` 追踪它）
- `upstream` = `sganggs/Stronghold-Protocol` = **上游**（发 `v0.1.0 … v0.3.3` 的那条线）
- `xinhai` = `xinhai-ai/Stronghold-Protocol` = 第三方一级 fork，只作参照，**不要往这里推**

> 0.3.1 的教训：我全程手拼 `node --test test/<dir>/*.test.js` 一个目录一个目录地跑，直到收尾才注意到
> `npm run ci` 与 `npm run typecheck` 的存在。这两条本可以覆盖「服务器冒烟」「类型检查」两项我后来手工补做的事。

---

## 1. 建立两侧坐标系（半小时）

```bash
git fetch upstream --tags
git log -1 --format="%h %ad %s" --date=short origin/master      # 本分支 HEAD
git log -1 --format="%h %ad %s" --date=short upstream/v0.3.2    # 目标 tag
git merge-base --all origin/master upstream/v0.3.2              # 分叉点（通常是上次合并的 tag）
git rev-list --count origin/master..upstream/v0.3.2             # 上游独有提交
git rev-list --count upstream/v0.3.2..origin/master             # 本分支独有提交
```

把四个数写进 `docs/MERGE_<ver>.md` 的「锚点与基线」一节。0.3.1 那次：分叉点 `c24e17ee`（= 上次合并的
v0.3.0），上游 215 个提交、本分支 139 个提交，两侧最后提交都在 2026-10-18。

同时记下两侧**目录层面的分工**，它决定了后面每个冲突该往哪边靠：

| | 上游擅长 | 本分支擅长 |
|---|---|---|
| 域 | 玩法、数值、`data/*.json`、界面重写、plugin / studio / content host、testMode | 构建（vite）、Match Workers、状态增量协议、持久化、监控 exporter、R2 同步、资源 packs、移动端密度 |

---

## 2. 建基线工作树（一小时，回报是三小时）

```bash
git worktree add .cache/baseline <本分支合并前的 HEAD>   # 0.3.1 用的是 e01036ae
cp -r public/vendor .cache/baseline/public/              # 被 gitignore，必须手动抄
```

用途只有一个：**每次遇到红的测试，先在这里跑同一条**，判断是「既有红」还是「合并红」。

- 既有红 → 记录一笔，不要为了让合并「看起来干净」而去改它（除非顺手，且要单独说明）
- 合并红 → 是你要修的东西

> 0.3.1 的教训：`test/i18n.test.js` 从第一条红到最后，我中途才搭了 baseline，才发现它在 `e01036ae` 上**同样红**。
> 在那之前我已经为它改了一轮实现（把署名换成常量又换回来），全是白工。

---

## 3. 静态扫描先于跑测试

两个扫描都是秒级，能在跑测试之前抓出「模块不存在 / 导出被搬走 / 类里重复定义」：

1. **悬空导入与缺失的命名导出** —— 遍历 `public/js`、`server`、`shared`、`test` 里每一条相对
   `import` / `export … from` / `import()`，检查目标文件存在、且具名导入在目标里确实导出（要屏蔽字符串与注释）。
   0.3.1 那次手写成 `.cache/dangling.mjs`，一次抓出 `installSkinsSync` 被搬到 `ui/loadoutSync.js`、
   `tools/fetch-assets.mjs` 里的 `statsTemplate` 未定义。
2. **类体内重复方法名** —— 过滤合法的 get/set 对。0.3.1 的 `setSkins` / `setHost` 都是这一类。

注意区分：`tools/check-imports.mjs`（`npm run check:imports`）查的是**导入边界**（`server/sim` 不得导入
match / lobby / net / public / Node 内置），**不是**模块是否存在。两者互补，不能互相替代。

---

## 4. 冲突裁决三问

对每一个冲突块，按顺序问完再落笔：

1. **这个符号在哪一侧存在？**
   `git ls-tree HEAD <path>` / `git ls-tree MERGE_HEAD <path>`，然后
   `git show HEAD:<path>` / `git show MERGE_HEAD:<path>` 对比。文件在不在，往往一步就能定性。
2. **它是谁、什么时候加进来的？**
   `git log -S '<字符串>' --oneline -- <path>`。带 PR 号、带中文注释、带日期与决策记录的，基本都是本分支特色；
   上游的提交信息多为英文短句 + 版本号。
3. **哪一侧的测试钉着它？**
   `grep -rn '<符号>' test/`。只看实现不看测试，很容易改对了代码、改错了契约。

三条问完仍无法决定，说明这不是合并技术问题，而是产品取舍 —— 见下一节。

---

## 5. 两侧测试互斥时怎么处理

同一行为，两侧各有一套实现、各自有测试钉住，这时**不存在「都让它过」的做法**。

正确顺序：

1. 判定该行为在目标版本里的形态（读上游实现 + 上游测试，不要只读 diff）
2. 选定保留哪一侧，把理由写进 `docs/MERGE_<ver>.md` 的「退役 / 改写」表
3. 改写另一侧的测试断言，并**在断言旁写清为什么**（下一个人会需要这段注释）
4. 如果退役的是本分支的能力，同时更新 `CHANGELOG.md` 或对应 `docs/`

反例（0.3.1 真实发生）：`test/vite.test.js` 里本分支断言「`sweep` 必须是动态入口」，上游断言「必须静态导入」。
我先把本分支的断言**放宽成恒真**（`some(entry => entry.name === 'sweep')` —— 构建里根本没有名为 sweep 的 chunk，
但 `some(...)` 换成不成立的条件就永远为真），等于把这条测试废掉；后来才改成陈述真实事实
（断言报告标记确实被打进首屏产物）。**放宽成恒真是最坏的处理方式**：测试看起来还在，回退再也抓不到。

---

## 6. 静默合并伤害的五种形态

自动合并最危险的不是冲突，是「git 认为已解决、语法合法、语义被替换」。0.3.1 的 17 条全部落在这五类：

| 形态 | 症状 | 例子 | 检测手段 |
|---|---|---|---|
| 同一类体里重复方法/属性 | 后定义者胜，前一份成死代码 | `setSkins`（`player/basics.js`、`match/platform.js`）、`setHost`（`host/proxy.js`） | 类成员扫描；`eslint no-dupe-class-members` |
| 对象字面量重复键 | 同上 | `skin:`（`render/app.js`、`app/info.js`、`match/views.js`） | `eslint no-dupe-keys` |
| 一个函数体被拼进另一个函数体 | 引用本树里不存在的符号，运行时才炸 | `screens/stats.js` 的 `Overview`（引用 9 个不存在符号 + 4 个不存在的模块） | `eslint no-undef`、`npm run typecheck` |
| **定义被整块删掉、调用方留着** | 属性访问不是 undeclared：语法、lint、类型检查全绿。运行时才抛 `x.y is not a function`，而且往往在**启动路径**上，一次打死整个应用 | `battle/runner.js` 的 `setCombatMetrics`：`screens/game.js` 还在推它，实现连同导出一起没了 → `/dev/game-mock.html` 首启即抛错、HUD 挂不上 → **95 个浏览器用例全部超时**，症状极像「素材没下」 | 静态扫描查「调用了但本侧没定义」的成员名；**必须跑一次浏览器 e2e** |
| 缺失的语义片段（不是冲突，是漏行） | 逻辑上少一条路，测试覆盖不到才安静 | `startMatchWith` 丢了 `TEST_DISABLED` 复检；`studio/index.js` 少 `await`；`HEAVY_TYPES` 丢了两个仍在用的类型 | 逐条读非冲突文件的 diff + 端到端测试 |

经验值：**冲突块本身只占这类问题的一小部分**，多数来自「两侧都改过、git 顺利合并」的文件。所以合完之后
必须把**非冲突文件**也过一遍 diff，尤其是有大量增删的文件。

第四种形态特别阴：它是唯一「`npm test` 全量绿、`npm run ci` 也绿，但应用根本起不来」的一类。成因通常是
上游新增了一个 API，调用点落进了本侧保留的文件，而实现所在的文件被本侧整块覆盖。判断方法：拿上游的
新增导出名单去本侧返回对象/`export` 里逐个对，缺的就补 —— 只看调用点存在与否不够。

---

## 7. 验证阶梯（从便宜到贵，前四阶应该反复跑）

| 阶 | 命令 | 量级 |
|---|---|---|
| 1 | 静态扫描（悬空导入、重复类成员） | 秒 |
| 2 | `npm run lint && npm run check:imports && npm run typecheck` | 1 分钟 |
| 3 | 单个文件：`node --test test/<file>.test.js` | 秒 |
| 4 | 单目录：`node --test test/<dir>/*.test.js` | 分 |
| 5 | 全量：`npm test` | 十分钟以上 |
| 6 | 黄金结果：`npm run golden`（288 场景，改了玩法才需要 `--update`） | 1.5 分钟 |
| 7 | 一次跑完 CI：`npm run ci`（含起服冒烟 + `doctor`） | 十五分钟以上 |
| 8 | 浏览器 e2e（默认跳过，见 `docs/TESTING_LOCAL.md`） | 分钟级/个 |

三条硬规则：

- **不要在一个 shell 命令里连跑多个测试目录 —— 但要知道真正的原因。** 0.3.1 那次用
  `for d in content e2e golden match plugins; do node --test test/$d/*.test.js; done`，`plugins` 报 24 个失败；
  单独跑全过。当时的归因是「端口与临时目录的残留」，**2026-10-25 复跑证明这个归因是错的**：真因是宿主
  注入的删除垫片，它按「轮」累计删除次数、到第 50 次就抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`；连跑多个目录
  会很快攒到 50，而「单独跑」发生在计数还很低的时候。删掉那三个环境变量之后，同样的连跑一条红都没有
  （`test/plugins` 48 个文件逐个跑 **0 红**）。所以规则保留、但按新理由执行：**先摘垫片，再谈粒度**。
  详见 `docs/TESTING_LOCAL.md` §1.2。
- **红的测试先看错误文本，再决定改代码还是改断言。** 0.3.1 里有 4 个失败是断言过时（实现是对的），
  1 个是我自己改反了语义，还有一批是环境造成的（缺素材导致超时）。
- **宣布合并完成之前，必须跑一次浏览器 e2e**（第 8 阶）。`npm test` 1892 项全绿 + `npm run ci` 全绿，
  仍然可能有「应用根本起不来」的缺陷（§6 第四种形态就是这么藏的）。跑之前先 `npm run build` ——
  页面加载的是 `public/build` 的哈希产物，改完源码不重打包，看到的还是旧代码，白跑一轮。

---

## 8. 记录与提交

`docs/MERGE_<ver>.md` 至少含这六节：锚点与基线、冲突规模、取舍原则（含继承的排除项）、数据文件取舍、
**静默缺陷表**、**因取某侧而退役/改写的测试与实现**、验收实测数据。写得丑没关系，漏一节就会有人重新踩。

commit message 沿用 0.3.0 / 0.3.1 的写法：合并的确切 tag、保留项与排除项、黄金结果、测试结果、按类别列出修掉的缺陷。

提交前：

```bash
git diff --name-only --diff-filter=U      # 必须为空
git status --short | wc -l                # 心里有数：这次动了多少路径
```

---

## 9. 红线

- 不为了让测试变绿而放宽断言、删用例、改 `skip`。要么修实现，要么明确退役并记录。
- 不把环境失败当功能失败（反之亦然）：先读错误文本，再判断是缺素材、缺端口、缺 `CHROME_PATH`，还是真炸了。
- 不在没有 baseline 对照的情况下宣称「这是既有问题」。
- 不清理「看起来没人用」的代码，除非 `grep` 已覆盖 `public/js`、`server`、`test` 三处，且 `test/` 里没有源码级断言。
- 不在合并锁未结束时用 `git show <ref>:<path> > <path>` 之类的手工重定向 —— 路径解析会出错，文件可能落到仓库根目录。
