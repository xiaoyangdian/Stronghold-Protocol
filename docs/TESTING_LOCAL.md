# 本地运行与真机验证

面向「我要亲手验一遍改动」：从零到能在桌面浏览器、手机和大厅里打通一局，以及自动化能替你验到哪一步。

开服部署、防火墙、反向代理、Docker 见 `docs/DEPLOY.md`；玩法见 `docs/PLAYING.md`；本次合并改了哪些地方、
该重点看什么见本文 §5。

---

## 1. 一次性准备

```bash
npm install          # postinstall 会把 pixi / preact / three 复制到 public/vendor
npm run setup        # 约 720 MB 美术与音频，下载到 public/assets（可中断，再跑续传）
npm run build        # Vite 打包到 public/build
```

`public/assets` 被 gitignore，**新克隆的仓库里是空的**。没有它：标题页能开，但棋盘、立绘、音效、结算图
全部落到替代样式或占位，浏览器 e2e 也会以「等待元素超时」的形式失败（见 §3.3）。

可选：本机装了《明日方舟》PC 客户端时，`node tools/setup.mjs --local` 可提取官方 3D 棋盘、官方战斗特效与
部分图标；没有客户端不影响游玩，这几样会换成 2D 棋盘与相近样式的替代品。

### 1.1 国内网络：为什么「GitHub 下载失败」以及怎么过

先分清两种可能，症状一样但处方不同：

- **只看到一行提示**：`[network] GitHub 下载失败；如需使用第三方镜像…` —— 这是**首次直连失败的一句
  劝告**，不是中断。下载器还有 jsDelivr 后备，会自己继续。此时先看 `[files]` 行的 `ok=` 是否在涨。
- **`err=` 猛涨而 `ok=` 不动**：真的走不通了，见下面。

2026-10 这台机器的实测（有本地代理 `HTTPS_PROXY=http://127.0.0.1:2832`）：

| 通道 | 结果 |
|---|---|
| `raw.githubusercontent.com` | DNS 失败（`ENOENT`），直连不通 |
| `cdn.jsdelivr.net`（后备） | `ECONNRESET` |
| `gh-proxy.com/<github url>` | 200，~0.6–1.3 s |

也就是说 `direct` 模式的两条路都断，**只有镜像能下**。`tools/assets/env-proxy.mjs` 已经处理了代理本身
（检测到 `HTTP(S)_PROXY` 会带 `NODE_USE_ENV_PROXY=1` 自我重启一次，需要 Node ≥ 22.21 或 ≥ 24），不必再去
动 `NODE_OPTIONS`。所以缺的只是「换源」这一步。

**配置（一次性，用户级，新开的终端才生效）**：

```powershell
setx SP_ASSET_SOURCE mirror
```

**关键：必须同时降并发。** 免费镜像会限流，默认 `--concurrency=16` 会瞬间打满并触发下载器自带的熔断
（`MirrorPolicy`：镜像**连续失败 3 次**就在本次运行内彻底停用镜像，回落到那两条已断的路，于是
`ok=0 err=数百`）。实测并发 16 全灭、并发 3 稳定：

```bash
node tools/fetch-assets.mjs --asset-source=mirror --concurrency=3
```

`--concurrency` 只认 `=N` 写法，写成 `--concurrency 3` 会报 `unknown option 3`。环境变量只影响源，不影响
并发，所以这条命令行参数每次都得起手带上；`node tools/setup.mjs` 目前没有透传并发的开关。

**自己校准镜像**（换 `SP_GITHUB_PROXY` 前先测，注意必须带 `NODE_USE_ENV_PROXY=1` 才等于下载器的真实
环境，否则测出来的是「没走代理」的结果）：

```bash
NODE_USE_ENV_PROXY=1 node -e "
const RAW='https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/README.md';
(async()=>{for(const p of ['https://gh-proxy.com/','https://ghfast.top/','https://ghproxy.net/']){
  let ok=0;for(let i=0;i<4;i++){try{const r=await fetch(p+RAW,{signal:AbortSignal.timeout(8000)});if(r.ok)ok++;if(r.body)await r.body.cancel();}catch{}}
  console.log(p,ok+'/4');}})();"
```

串行测起来都通不代表并发也能通 —— 2026-10 那次 `ghfast.top` 串行 4/4、并发 16 却 0/N。**只在降并发
的条件下比较才有意义。**

`SP_GITHUB_PROXY` 只写前缀（如 `https://ghfast.top/`，必须 https、不带 query）；**设成空字符串是「禁用
代理」而不是「恢复默认」**，要恢复默认得删掉这个变量（`[Environment]::SetEnvironmentVariable('SP_GITHUB_PROXY',$null,'User')`）。

### 1.2 在 WorkBuddy / CodeBuddy 里跑测试：两个会凭空造出红点的环境因素

这两条都**不是仓库的问题**，但都会让 `npm test` 红一片，而且报错信息完全不指向真因。2026-10-25 全量复跑时
就是先被它们骗了一轮（一度误判成「合并引入」）。

**（一）删除垫片把「清临时目录」变成异常。** 宿主会给**每一个** node 子进程注入：

```
NODE_OPTIONS=--require="<WorkBuddy>/resources/app.asar.unpacked/cli/vendor/shim/node-language-shim.cjs"
CODEBUDDY_SAFE_DELETE_BULK_GUARD=<…>/safe-delete-bulk-guard.cjs
CODEBUDDY_SAFE_DELETE_SANDBOX=1
```

那个守卫按「轮」累计删除次数，**到第 50 次就抛**
`[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":50,"threshold":50,…}`，抛在 `rimrafSync` 里。
任何「建临时目录 → 断言 → 删掉」的用例都会在删的那一步炸，看起来像用例自己失败：

| 文件 | 假失败数 |
|---|---|
| `test/plugins/forgeImport.test.js` | 9 |
| `test/plugins/forgePanel.test.js` | 2 |
| `test/plugins/fx.test.js` | 1 |
| `test/studio/*` | 8（另有进程/符号链接相关的真实差异，见 §4） |

同一次 `test/plugins/*.test.js` 单进程跑出 **33 个红**，逐文件跑仍然是这些文件红 —— 因为计数器是跨进程共享的
（`scope:"turn"`），换进程也躲不掉。CI 没有这个垫片，所以要在本地得到可信结果，必须把这几个变量摘掉：

```bash
env -u NODE_OPTIONS -u CODEBUDDY_SAFE_DELETE_BULK_GUARD -u CODEBUDDY_SAFE_DELETE_SANDBOX \
  node --test 'test/plugins/*.test.js'
```

```powershell
# PowerShell：只影响这一次调用
$env:NODE_OPTIONS=$null; $env:CODEBUDDY_SAFE_DELETE_BULK_GUARD=$null; $env:CODEBUDDY_SAFE_DELETE_SANDBOX=$null
node --test test/plugins/*.test.js
```

摘掉之后 `test/plugins` 48 个文件 **0 红**。

**（二）Node 小版本把几批用例推向相反方向。** 本机有两个 22.x，行为不一样：

| | 22.22.2（WorkBuddy 托管，默认在 PATH 上） | 22.13.1（系统安装） |
|---|---|---|
| `test/plugins/{csp,contentBattle,dsl-data}`、`test/official-tables.test.js` | **进程退出时崩**，`exitCode 3221226505`（`0xC0000409` = `STATUS_STACK_BUFFER_OVERRUN`） | 正常，4/4 · 7/7 · 12/12 · 全绿 |
| `test/assets-env-proxy.test.js` | 9/9 | **2 红** |
| `test/ui/theme-notices.test.js` | 5/5 | **3 红** |

崩溃的形态很容易认错：子用例**全部 `ok`**，失败的是文件级那条合成用例（`tests 1 / pass 0 / fail 1`），
输出里**一条断言都没有**。`official-tables` 是更极端的一种：连子用例都没跑出来就崩。在 `git stash` 后的
基线上同样崩，所以与改动无关。

另外两类反过来：

- `assets-env-proxy` 的 `envProxyPlan` 只在 **Node ≥ 22.21**（或 ≥ 24）才有「走代理」这一档，22.13.1 落在
  「不转发、直接下载」分支，而用例断言的是**拒绝直连**那句 `Refusing to fetch directly`。
- `ui/theme-notices` 依赖 `await new Promise(r => setTimeout(r, 0))` 这一个宏任务之内把主题变量落盘，
  两个版本的微任务/宏任务交替与 `AbortSignal` 行为不同，22.13.1 上还没写进去就断言了。

即：`package.json` 的 `engines.node` 写的是 `>=22`，实际隐含 **`>=22.21`**，而 22.22.2 又踩到崩溃。

结论与做法：**默认用 22.22.2 跑全量，这 4 个崩溃文件单独用 22.13.1 跑**（它们正好是「不涉及本次改动」的
四个：两个插件宿主、一个 DSL 数据、一个官方表格导入）。这样两边加起来是 0 红。想一条命令跑完就装一个
22.21.x（既满足 ≥22.21 的代理语义，又不在这两个已知崩溃/时序差异里），本次未验证。
真机（`npm start`）不受影响 —— 这些差异只在测试与下载器的代理判定里。

---

## 2. 启动

| 方式 | 命令 | 特点 |
|---|---|---|
| 启动器（推荐） | `node scripts/launch.mjs --test-mode 1` | 自动 setup → 等 `/healthz` → **打印局域网地址** → 开浏览器；`--no-setup` 跳过素材检查，`--no-open` 不开浏览器 |
| 直接起服 | `npm start` | 只起服务器（`node server/index.js`），默认 3000，不开浏览器、不打印地址 |
| 开发模式 | `npm run dev` | `node --watch` + 源码页面（`--source-client`），改前端刷新即可，**不需要 build** |

改了 `public/js`、`public/css` 之后走生产页面的话，**必须 `npm run build` 再重启** —— `/build/` 里的文件名带内容哈希，
浏览器拿不到新代码就会表现成「改了没反应」。

`--test-mode 1` 才会允许开「测试房间」（创建房间页的勾选框）。它只在本机或局域网监听时生效；公网监听会被拒并打印提示，
确实需要时用 `--test-mode force`（或 `SP_TEST_MODE=force`）。

自检：

```bash
curl http://127.0.0.1:3000/healthz     # 存活
curl http://127.0.0.1:3000/metrics     # JSON：持久化、Worker、内存、缓存、限额
DEBUG=1 npm start                      # 详细日志
```

---

## 3. 自动化能替你验到哪一步

### 3.1 官方入口（`CONTRIBUTING.md` §2）

```bash
npm test                                                    # 全部（需要浏览器/素材的用例自动跳过）
npm run golden                                              # 288 个固定种子的战斗与对局
npm run lint && npm run check:imports && npm run typecheck   # 代码、导入边界、类型
npm run ci                                                  # 以上 + 起服冒烟 + doctor，一条命令
```

`npm run ci` 是验收的标准动作（`tools/ci.mjs`，步骤与 `.github/workflows/ci.yml` 一致）。
合并上游之后**应当以它为准**，而不是手工拼零散命令。

### 3.2 单个文件 / 单个用例

```bash
node --test test/ui/skins.test.js
node --test --test-name-pattern="S3" test/content/op_siege.test.js
```

### 3.3 真实浏览器 e2e（默认全跳过）

`test/ui/*.e2e.test.js`（69 个）与 `test/render/*.browser.test.js`（26 个）都要显式开关，否则整组 skip：

```bash
# 界面端到端（走 dev mock，多数不需要素材包）
SP_E2E=1 CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" \
  node --test test/ui/downed-plate.e2e.test.js

# 真实对局（需要已下载的素材）
SP_REAL_E2E=1 CHROME_PATH=... node --test test/ui/real.e2e.test.js

# 渲染 / 浏览器内战斗模拟
RENDER_E2E=1 node --test 'test/render/*.browser.test.js'
SIM_E2E=1     node --test 'test/sim/*.browser.test.js'
```

三个必须知道的前提：

1. **`CHROME_PATH` 的默认值是 macOS 路径**（`/Applications/Google Chrome.app/...`）。Windows 上不设，`existsSync`
   为假，用例静默 skip —— 看到「skipped 15」而不是失败，通常就是这个原因。
2. **部分用例依赖 `public/assets`**。没有素材时它们不是失败在断言上，而是卡在
   `Waiting for selector .gm__hud failed`（30 秒超时），一次跑出 4 个红，非常像渲染崩了。先跑 `npm run setup`。
3. 这些用例会自己起一个服务器（空闲端口）和 headless Chrome，单文件通常 40 秒到 2 分钟。

模拟一致性另有专用工具：`node tools/sim-check.mjs` 记录黄金战斗，然后在任意设备（含手机）打开
`/dev/sim-check.html` 重放比对，首次出现差异的区间会被指出。

### 3.4 dev 页面（手动但很快）

| 页面 | 用途 |
|---|---|
| `/dev/game-mock.html?phase=SETTLE&render=fallback` | 用假状态直接进入某个阶段，改 UI 时比走完整流程快得多 |
| `/dev/sim-check.html` | 浏览器里的战斗与 Node 逐位比对 |
| `/studio/` | 插件工作台（地址与钥匙在启动窗口里打印） |

---

## 4. 手测清单（按模块）

一次完整的桌面验证，大约 25 分钟：

- **标题页**：版本号、关于本服务器的链接（邮箱 / B 站 / 仓库）、语言切换、"开发版"提示是否按构建出现
- **设置**：文本大小四档、画质、FPS 上限、语言、皮肤两个开关、音频音量；刷新后是否保留
- **大厅**：创建房间（难度、AI 队友、测试房间勾选）、按密钥加入、最近同盟、公告
- **房间**：准备就绪、插件面板（原版 / 插件 ×N）、房主移除玩家、复制邀请链接
- **整备**：拖拽摆放、方向切换、手牌与临时整备区、合成、技能选择、双击详情
- **战斗**：单位移动与攻击、伤害数字、技能特效、音效、结算
- **结算**：称号、统计、回到房间
- **S.W.E.E.P. 报告**：四个页签（盟约 / 策略 / 敌方资料 / 图鉴）都能打开、能 Esc 关闭
- **统计**：总览、历史记录、回放
- **断线**：刷新页面后能回原座位（同盟 10 分钟内 / 独立 6 小时内）

---

## 5. 0.3.1 合并专项检查表

这次合并改过下面这些地方，其中**只有真机能看见**的部分优先验：

| 检查点 | 怎么验 | 期望 | 相关文件 |
|---|---|---|---|
| 战斗音效 | 打一场，听攻击 / 技能 / 受击 | 有声音。合并时 `audio.js` 调用了未导入的 `unhashedUrl`，任何池化音效解码都会 `ReferenceError` | `public/js/audio.js` |
| 皮肤四处一致 | 选一个干员皮肤，看整备台 / 手牌 / 临时整备区 / 战场 | 同一个模型；**补位与自选编队棋子不吃皮肤**（该规则 0.3.1 在服务端 `PlayerBasics.skinFor` 解析） | `server/match/player/basics.js`、`public/js/render/app.js` |
| 两个皮肤开关 | 分别关「启用皮肤」「显示其他玩家的皮肤」 | 各自独立生效（合并时前者被错误并进后者） | `public/js/render/app.js` |
| 协议已失效 | 让自己的 LP 归零、队友继续 | 全屏红线板 + 「继续观战」/「离开模拟」，Esc 可关 | 上游 `ui/downedPlate.js`（`.downm`） |
| S.W.E.E.P. 报告 | 大厅点报告 | 作为 Modal 打开，四页签可用（不是独立页面） | `public/js/screens/lobby.js`、`sweep.js` |
| 统计总览 | 打开「统计」 | 能渲染（合并时上游实现被拼进本分支函数体，引用了一批不存在的符号） | `public/js/screens/stats.js` |
| 测试房间 | 勾「测试房间」创建 → 另开窗口用密钥加入 | 加入前弹「这是测试房间，不计入任何记录」二次确认；房间带测试标记 | `server/lobby.js`、`public/js/screens/lobby.js` |
| 限流桶 | 连续开关观战 / 玩家卡 | 重活类型仍受限流（`room.card`、`state.resync` 曾在合并中掉出集合） | `server/net.js` |
| 插件工作台 | 打开 `/studio/`，改一个插件的 meta | 保存后返回新的版本号与 manifest（曾因缺 `await` 恒返回 `{}`） | `server/studio/index.js` |
| 主机迁移 | 房主退出后由他人接手 | 房间不崩、worker 侧收到通知 | `server/match/host/proxy.js` |

---

## 6. 手机真机

1. 手机与开服电脑**同一个 Wi-Fi**。
2. 地址用启动窗口打印的局域网地址（`npm run doctor` 也会列）。**不要用虚拟网卡地址**（如 VPN / 虚拟网关的
   `172.x`），手机通常到不了那里。
3. 手机浏览器打开 `http://<局域网IP>:3000`，**横屏**。
4. 打不开先排 Windows 侧（管理员 PowerShell）：

```powershell
Set-NetConnectionProfile -InterfaceAlias "<网络名>" -NetworkCategory Private
netsh advfirewall firewall add rule name="Stronghold Protocol" dir=in action=allow protocol=TCP localport=3000 profile=private,domain
```

`npm run doctor` 会直接告诉你哪块网卡是「公用网络」、缺哪条规则。访客 Wi-Fi 的 AP 隔离也会导致连不上。

5. 性能不足时加参数：`?board=2d`（强制 2D 棋盘）、`?render=fallback`（不用 WebGL 的简化画面）。
6. 重点摸：触屏拖拽的落点判定、双击查看详情、设置面板的移动端密度、公告弹窗、以及横屏安全区内的按钮有没有被挡住。

---

## 7. 排障

| 现象 | 先查 |
|---|---|
| 改了代码没生效 | 有没有 `npm run build` 并重启；或者干脆用 `npm run dev` |
| 缺图 / 花屏 / 音效没声音 | `public/assets` 是否存在；`npm run doctor` 的素材检查；清除站点数据（素材走 Cache Storage 与 `/resource-sw.js`） |
| e2e 全部 skipped | 没设 `SP_E2E=1` 或 `CHROME_PATH` 指错了 |
| e2e 卡在等待元素 30 秒 | 多半是缺素材，不是渲染坏了 |
| 局域网手机打不开 | 网络类别是不是「公用」、防火墙规则、是否用了虚拟网卡地址、AP 隔离 |
| 服务断了 / 房间没了 | 服务器重启会结束所有对局；Redis 未配置时会话只在内存里 |
| 想看服务器在干什么 | `DEBUG=1 npm start`，`/healthz`，`/metrics`，启动窗口里的 Studio 地址 |
