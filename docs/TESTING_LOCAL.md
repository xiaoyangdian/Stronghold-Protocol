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
