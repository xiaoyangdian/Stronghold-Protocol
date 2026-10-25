# MOBILE.md — 手机端路线

**状态**：方案评估，未开工。本文只写**结论与依据**，不写教程。

先明确「手机端」指哪一种，三条路线的工作量与依赖完全不同：

| 路线 | 形态 | 手机要跑的东西 | 依赖 |
|---|---|---|---|
| **A 本地服务器** | 手机自己开服，同网段设备可连 | 内嵌 Node 跑 `server/index.js` | 无外部服务 |
| **B 客户端壳** | WebView + 本地素材，联机走远程服 | 只有浏览器引擎 | 别人开服 |
| **C 壳 + 可选内置服务器** | B 的基础上，用户可自己开关服 | 两者 | 无 |

社区三种都有人做（见 §1）。**本分支要做的应是 C**：理由见 §4。

---

## 1. 社区现状（2026-10-25 数据）

| 项目 | ★ | 路线 | 关键事实 |
|---|---|---|---|
| `liyuanfurry/Stronghold-Protocol-APK` | 3 | **A/C** | 内嵌真 Node 跑**未修改**的上游 `server/index.js`；615 MiB 素材预装；ETag 增量（`baseline/etags.tsv` 覆盖 12256 文件，校对只拉 `/data/assets.json` 676 KB）；**手机上可列上游版本并一键切换**；`v6.2` APK **950 MiB**，minSdk 21 / targetSdk 34；要求系统 WebView ≥ Chrome/89（用了 import maps）；明确不含任何内置服务器地址 |
| `lilyco-42/StrongholdProtocolClient` | 3 | **B** | Android APK 777 MiB / iOS unsigned ipa 741 MiB / macOS dmg 846 MiB / Windows zip；素材本地读 260 MB；服务器地址**写死** `150.158.38.174:3000`；跟踪上游 0.3.1 |
| `LaoYinBai/Stronghold-Protocol-Android` | 1 | B? | 10-19 仍有推送，无说明 |
| `MarryDream/stronghold-protocol-android` | 0 | ? | 10-18 创建 |

`liyuanfurry` 自己在 README 里点名 `jingjiangze` 那套更全（大厅整合、签名服务器清单、下载站、完整发布流水线）。

---

## 2. 本分支跑在手机上的五个前提（逐条核实过）

### 2.1 可写目录：整棵树必须解压到应用私有目录

`server/data.js:22` `ROOT = path.resolve(dirname(server/), '..')` —— 根目录由**代码位置**推导，**没有** `SP_PUBLIC` 之类的环境变量可重定位。所以：

- 不能把 Node 代码留在 APK 内（只读），必须解压到应用私有目录再启动
- 素材 763 MiB 同理，预装进 APK 再解压一次（这也是为什么别人的包 676→950 MiB）

### 2.2 worker 池：可以整机关掉，退回进程内

`server/index.js:162` 读 `SP_MATCH_WORKERS`，为 0 时不创建池 → 走 `startMatchWithLocal` 那条进程内路径（modded 房间本来就走这条）。

**意义**：`worker_threads` 在移动端 Node 上的兼容性与内存压力是最大的未知，但它**不是必经之路**。单人模式下 `SP_MATCH_WORKERS=0` 即可绕开。

### 2.3 持久化：**默认不工作，要补一个文件后端**

- `server/persist.js` 把状态写成 Redis 里的一个 JSON 文档（`<prefix>state`，每 30 s 一次）
- `server/redis.js:3` 注释写得很清楚：没有 `SP_REDIS_URL`/`REDIS_URL` 就**什么都不构造**，房间与对局状态只在内存里

所以手机上「断点续玩」这个卖点**默认不存在**。要它就得加一个本地存储后端：`openStoreFromEnv()` 目前只返回 Redis 的 `StateStore`，接口面不大（读/写/过期），加一个文件或 SQLite 实现是可行的一小块工作，而不是改造。

### 2.4 Node 运行时：**实测 18 / 20 都能跑**，只有脚本插件需要 22

`package.json` 两边都写 `"node": ">=22"`，但检索 `server/` 与 `shared/` 里用到的新 API：

| 用到 | 未用到 |
|---|---|
| `structuredClone`（7 个文件，Node 17+）、`worker_threads`（11 个文件） | `AbortSignal.any`、`Object.groupBy`、`Promise.withResolvers`、`node:sqlite`、`import.meta.dirname` |

**所以 `>=22` 是上游的政策选择，不是硬 API 依赖 —— 已实测确认：**

| 运行时 | 起服（`/healthz` + 首页） | `test/match/sim-host.test.js` |
|---|---|---|
| **Node 18.20.5** | ✅ 200 / 200，横幅与局域网地址正常 | **5/6** —— 唯一失败是 `script operator: permission child and Worker have byte-identical ev/results`（`PLUGIN_WORKER_FAILED`） |
| **Node 20.18.0** | ✅ 同上 | **5/6**，失败的还是同一条 |
| **Node 22.22.2** | ✅ | **6/6** |

结论：**普通玩法（含 worker 里的战斗模拟）在 18 上就能跑**；只有**脚本类插件**（`script` class，默认关闭）需要 22。
本机便携版留在 `.cache/node18/`、`.cache/node20/`（gitignore，可随时重下）。

依赖侧没有障碍：本分支比上游多的 `@zip.js/zip.js`、`redis`、`marked` **全是纯 JS，无 native 编译**。

### 2.5 素材分发：我们的 resource packs 在这件事上比 ETag 更合适

- 别人（`liyuanfurry`）：素材预装 + `etags.tsv` 比对 `/data/assets.json`，只下变动文件
- 我们：`public/js/resources/*` + `resource-sw.js` + `server/resources.js` 的分区 pack + 完整性校验（`sha1Stream`）+ CDN

移动端恰好是 pack 的强项：分区按需取、断点续传、校验后才用。**这是一次把 fork 的差异化真正用上的机会**，而不是负担。

---

## 3. 与社区实现的定位差异

| 维度 | `liyuanfurry` | `lilyco-42` | 本分支（若做） |
|---|---|---|---|
| 服务器 | 手机本地跑上游 | 远程，地址写死 | 手机本地跑**本分支**（持久化 + 资源包 + 监控） |
| 版本追新 | 手机上切上游 tag | 靠作者重新发包 | 同样需要「不发包也能升」，但升的是本分支 |
| 素材 | 预装 + ETag | 预装 260 MB | 预装基线 + pack 增量 |
| 持久化 | 无（上游没有） | 无 | 补文件后端后**有** |

---

## 4. 推荐路线：先 C 的桌面形态，再 Android

Android 打包是时间黑洞（SDK、签名、WebView 版本差异、机型内存）。而 **80% 的技术风险可以在桌面上用几小时验证完**：

### P0 可行性（半天，桌面）
1. ~~用现有 `scripts/launch.mjs` 起服，测 Node 18/20 能不能跑~~ **已完成，见 §2.4：能跑**
2. 用现有 `scripts/launch.mjs` 起服，`SP_MATCH_WORKERS=0` 跑一局单人，记录内存峰值与 `maxFrameMs`
3. 关掉 Redis 跑一次「杀进程 → 重启 → 能否回到房间」，确认 §2.3 的行为与文档一致

**P0 的停止条件（已解除）**：原本担心 18/20 起不来导致移动端必须绑 Node ≥22；实测 18 即可，只有脚本插件需要 22 ——
而脚本插件默认关闭，可先不支持。

### P1 桌面壳（1–2 天）
Electron 或 Tauri 包一层，素材放本地，`SP_MATCH_WORKERS=0`，验证「双击即玩、不联网也能单人开局」。这一步产出的壳代码在 P2 能直接复用思路。

### P2 Android 壳（3–5 天，不确定性最高）
WebView + 预装素材 + 内嵌 Node（若 P0 允许）。注意上游用 import maps，**系统 WebView 需 ≥ Chrome/89**，低版本要弹窗提示。

### P3 可选：手机当服务器
局域网广播、开机自启、省电策略；这部分 `liyuanfurry` 已经踩过，直接照它的取舍走。

---

## 5. 现在就该测的两个数（决定成败）

| 测什么 | 为什么 | 怎么测 |
|---|---|---|
| **单人一局的内存峰值** | 决定中低端机能不能跑（浏览器 + Node 双份内存） | `SP_MATCH_WORKERS=0` + `/metrics` 的 heap 指标 |
| **`maxFrameMs` / `catchups`** | 手机 CPU 弱，决定倍速功能与高负载战斗是否可用 | `public/js/diag.js` 面板 |

（原本第三项「Node 18/20 能否起服」已测完，见 §2.4）

---

## 6. 不建议做的事

1. **不要在 APK 里内置服务器地址**。`liyuanfurry` 的取舍是对的：包会流传，写死地址等于给搭建者的机器挂公网招牌。
2. **不要试图把 iOS 当成一等目标**。`lilyco-42` 有 9 个 open issue，其中一个就是 iOS 立绘不显示；WebView 行为差异会吃掉大量时间。
3. **不要先做 UI**。手机端的界面适配（上游有 #866 长计划，我们已有 `managementScale` + `utility-mobile.css`）比起「能不能跑」是次要矛盾。
4. **不要为了手机端去改上游文件**。`SP_MATCH_WORKERS` 已经是官方开关；新增能力都做成新文件或环境变量，否则每次合上游都要重新解一遍（见 `docs/BRANCH_VS_UPSTREAM.md` §5）。
