# 干员皮肤 (Operator skins)

An operator's Spine model and its pictures can be replaced by one of its official alternative outfits (时装). This
document is the normative reference for that feature; the art itself is **never** downloaded or written by the server —
it comes from a **cosmetic plugin's overlay** (docs/PLUGINS.md §9), which the server's owner installs in `plugins/` and
each player switches on for themself.

> 上游 #652 被关闭的原因写在这里，因为它是这个设计的出发点：**服务器不提供安装通道**。当时的 `room.skin.install`
> 让任何已连接的客户端都能让服务器去网上下载文件并改写所有客户端共读的 `data/assets.json`，而随包发布的
> `data/skins-installed.json` 又会让更新校验对不上。本实现没有安装报文、不写 `data/` 下的任何文件、不随包发布任何
> 安装状态：皮肤属于插件，插件怎么落地是 `plugins/` 目录（安装、studio、ZIP）本来就有的问题。

## The data: one overlay, no catalogue file

```
plugins/<id>/plugin.json
  └── assets (or a .json file):  chars[<charId>].illust ……     the operator's own 立绘 (one picture)
                                 chars[<charId>].skins[<skinKey>] = { name, group, avatar, avatarE2,
                                                                      portrait, portraitE2, illust,
                                                                      spine: { front, back? } }
        │
        ├── the server checks the overlay (shared/plugins/visual.js, docs/PLUGINS.md §9) and serves it as a document:
        │   /vs/<vs16>/overlay.json — composed on the INSTALLATION's manifest, never on a copy of it
        │
        └── the browser composes it (public/js/cosmetics.js cosmetics.apply) on the manifest it already loaded
                 │
                 └── data.get('assets') — what every screen reads (public/js/data.js setView)
                          │
                          ├── chars[<charId>].skins[<skinKey>]  →  the picker's rows (public/js/ui/skins.js availableSkins)
                          └── chars[<charId>].skins[<skinKey>].spine  →  the model (public/js/assets.js spineEntry { skin })
```

Three properties are load-bearing:

- **A skin key is the KEY, and it is data.** It carries `@` `#` `+` `.` (`char_002_amiya@winter#1`), so it is **not** an
  `isId` (shared/protocol.js `isSkinId`). A plugin that has no official id for a skin may write the stem form
  (`char_102_texas_epoque_7`) [ASSUMED: docs/PLUGINS.md §9]. Whatever writes a skin and whatever wears it must agree on
  that exact string.
- **The choice is keyed by OPERATOR (charId), not by chess.** `chars[<charId>].skins` is the manifest's own grouping, so
  one entry covers an operator's normal piece, its elite (the merge) and a 自选 slot fielding it. The renderer agrees:
  a unit's skin resolves through `d.spine ?? d.charId ?? u.defId` (server/sim/snapshot.js), i.e. the charId.
  Every owner/scout board, hand, temp and battle input resolves the **effective body** with `PlayerState.fieldRecord`:
  a stand-in uses `backup.charId`, a 自选 slot its pick. Official source:
  `activity_table.activity.AUTOCHESS_SEASON.act2autochess.charShopChessDatas` `backupCharId` (for example
  `chess_char_3_01_a`: `char_103_angel` → `char_603_csnipe`). [ASSUMED] Skin choices follow that body too, so an original
  operator's selected outfit never dresses its stand-in; the official table specifies bodies, not this cosmetic UI.
- **A missing piece falls back; nothing is ever a placeholder.** `spineEntry(m, id, { skin })` draws the operator's own
  model when the skin (or its model) is not in the manifest; `avatarUrl` / `portraitUrl` / `illustUrl` fall back to the
  operator's own pictures. The picker shows the operator's portrait on a skin that ships none.

## The switch model: the owner installs, each player switches on

| Who | What they do | Where it is stored |
|---|---|---|
| The server's owner | Drops the plugin folder into `plugins/` (the studio, a ZIP, or by hand), and switches it on for the **room** if they want a set everyone in that room sees | `plugins/`, a room's `vs` |
| A player | Switches a `scope: ["personal"]` cosmetic plugin on for **themself** — a skin of their own choosing | `sp.pref.cosmetics` (this browser only, never sent) |

A room's **host is not part of it**: an appearance a player wears comes from *their* browser's layers, so a plugin with
`scope: ["personal"]` never appears in the room's 插件 panel and no room setting can force a skin on anyone. Two players
of the same co-op match may therefore see different models for the same piece — see the switch below.

## 设置「显示其他玩家的皮肤」 (default on)

A pure client preference (`settings.otherSkins`, `sp.pref.settings`; **never sent**):

- **on** (the default) — a piece draws the appearance its owner chose, which the match published
  (`Match.publicView().players[].skins`, and `UnitInfo.skin` of every unit);
- **off** — every other seat's piece draws the operator's own model; **this player's own pieces keep their skin**.

The asymmetry is deliberate and is what the setting is for: what you draw is your own choice, what others draw is theirs.
Turning it off hides *their* look from *you* and changes nothing on their screen (public/js/render/app.js `skinOf`). The
renderer decides who is "other" from `UnitInfo.ownerId` and the local `me.playerId`
(public/js/ui/fieldHost.js `setMe`) — never from the seat whose camera happens to be on screen.

[ASSUMED] Switching off retains the received skin ID separately (`sourceSkin`) and derives only the displayed `skin`.
Switching back on restores already loaded units immediately, including a boss partner's read-only prep pieces and
units received while hidden. `room.skins` remains valid in every phase: `Match.setSkins` marks the owner's private
view, which also refreshes existing prep scouts and the boss partner. `fieldHost` forwards public seat choices to
`view.setSkins(players)` on mount and when they change. The current battle's operators use that latest selection
(an omitted `skins` map clears it), even if later spawn metadata carries an older choice. This rebuilds appearance
only: it neither changes the running sim / BattleSpec nor restarts playback. Live refresh timing is a remake UI
choice, not a rule established by the official tables.

## The picker: two display rules

In 干员调配 (`screens/loadout.js Detail`) and in the 自选编队 picker's detail (`screens/diy.js DiyPickerView`), the 皮肤
section sits under the operator's name. 潜能与练度 immediately follows 皮肤 wherever cultivation is offered.
The preserved 0.3.1 order is 皮肤 → 潜能与练度 → 特质 → 技能 → 局内数值 → 模组 in 干员调配, and
皮肤 → 潜能与练度 → 局内数值 → 技能 → 模组 in 自选编队 (prototype picks omit cultivation).
[ASSUMED] This is the existing remake panel order; official tables do not prescribe a skin picker layout.

1. **The section is GLOBAL: every operator shows it, or none does.** The one question `SkinSection` asks is
   `public/js/ui/skins.js hasAnySkinChoices()` — **at least one** operator of the composed manifest has one **wear-able**
   skin (`chars[<charId>].skins[<skinKey>]` with a model this client resolves). While that is false — no plugin at all,
   a plugin that writes only pictures, or only skins that are art without a model — nothing is drawn anywhere, header
   included: an installation without a cosmetic layer looks exactly as it did before this feature.
   While it is true, **every** operator shows the section, including one the plugins wrote no skin for. That operator
   gets the 默认 tile alone, a real picture on it and no empty art box, and the header's note reads `0 套外观`: the count
   is kept at zero on purpose, because the whole point of the global rule is that this box **means something** — "the
   plugin is on, this operator has no 时装". A section hidden per operator said nothing, and left the player unable to
   tell an operator without skins from a plugin that failed to load. This is the **reverse** of the rule this feature
   first shipped with (a per-operator `hasSkinChoices`: 默认 plus a wear-able skin of *that* operator, else no section),
   and it must not be turned back. `hasSkinChoices` remains the single-operator criterion — no production code calls it
   — and is what `hasAnySkinChoices` is counted from, so the two can never disagree about "wear-able".
   The gate counts **wear-able appearances**, never pictures: a plugin that writes only 立绘 (`chars[<charId>].illust`) and
   no skin turns the section on nowhere, and this picker then shows none of its pictures. That is deliberate — the
   section exists to choose a 时装 and its note counts 套外观, so one replaced 立绘 must not put a `0 套外观` box on every
   operator of the installation. A plugin whose 立绘 has to be seen has to give some operator a wear-able skin (then every
   operator's 默认 tile draws the 立绘 it has, per the rule below), or needs a surface of its own. Should the gate ever be
   meant to count a 立绘 as well, the one line that changes is the body of `hasAnySkinChoices`.
2. **A missing layer falls back to the operator's own art** — a skin with no `portrait` shows the operator's portrait
   (its `illust`, then the portrait), never a slash or a placeholder; the tile is dimmed (`.lo-skin--fallback`) so the
   replacement is legible. The enlarged preview (`.lo-skin-preview`, a `Modal`) shows the skin's 立绘.

The 默认 tile is the operator's **real** appearance, not an empty slot: it draws the operator's own 立绘
(`chars[<charId>].illust` — the picture an appearance plugin may write for an operator it gives no skin at all, and this
tile is the only place that picture is seen), else `chars[<charId>].portrait`, else its avatar. The 立绘 wins over the
portrait on purpose, for the same reason the section is global: what a plugin wrote for the operator has to be visible,
and the 1:2 tile crops to the top exactly as it already does for a skin that ships only an illust. It is never empty
while the record has any of the three; an operator the composed manifest does not hold at all (not even a 默认 tile
exists) gets no section rather than an empty grid.

## New files

| Path | What |
|---|---|
| `public/js/ui/skins.js` | The client store (`sp.pref.skins`, `{ [charId]: skinId }`, at most `SKIN_LIMITS.entries` pairs: `parseStoredSkins` is the one parse of a stored selection — the store's initial state, every edit and what the sync sends — so the wire's own limit is applied where the selection is read), `availableSkins` (the composed manifest's rows, with `playable` and with art already resolved and fallen back; the 默认 row exists for every operator the manifest holds, also one with no `skins`), `hasAnySkinChoices` (the section's global rule), `hasSkinChoices` (the single-operator criterion, kept for tests and future rules), `chosenSkin` (a stored entry that is not one of this operator's wear-able skins counts as 默认), `setSkin` / `clearSkin` |
| `public/js/ui/skinPicker.js` | The 皮肤 section itself: `SkinSection` (nothing while `hasAnySkinChoices` is false — for every operator alike; the 默认 tile alone for an operator without a skin), `SkinPreview` (the enlarged 立绘), the five-tile grid's markup |
| `test/skins.test.js` | The wire shape (`isSkinId` / `isSkinSelection`), the lobby → Match → PlayerState chain, the public view, reconnect, the sim's UnitInfo, the client's fallbacks, and the absence of the install channel |
| `test/lobby-skins.test.js` | `room.skins` over WebSocket: validation, session and seat storage, the seats handed to the Match, bots, the change made mid-match |
| `test/ui/skin-picker.test.js` | The picker's rules against a composed manifest: the rows, `playable`, the art fallbacks, the global `hasAnySkinChoices` and the per-operator `hasSkinChoices`, `chosenSkin`, and that the section's gate is the global one |
| `docs/SKINS.md` | This document |

## Edits to existing files

| File | Where | What |
|---|---|---|
| `shared/protocol.js` | before `isNotOwnedList` | `SKIN_LIMITS` (256 [ASSUMED]), `isSkinId` (**not** `isId`; the same character class as `isSkinKey`), `isCharId`, `isSkinSelection`, `operatorCharIds`, `checkSkinSelection` |
| `shared/protocol.js` | `C2S` | `'room.skins'` — and **no** `'room.skin.install'` |
| `server/net.js` | `HEAVY_TYPES`, `Session` ctor | `'room.skins'`; `session.skins` |
| `server/lobby.js` | after `freezeDiy`, `onMessage`, after `diy()`, `humanSeat`, `seatSettings`, `startMatch` | `freezeSkins` (charId + skinId, drop operators the room lacks; a bad map is BAD_MSG and does not clear), `case 'room.skins'`, `skins()` — **no phase gate**, unlike the loadout — and the selection riding into the match |
| `server/match/PlayerState.js` | ctor | `this.skins = Object.freeze({})` + `setSkins(seat.skins)` |
| `server/match/player/basics.js` | after `setLoadout` | `skinCharIdOf` / `skinFor` / `setSkins` (bots refused; a bad map refused whole, unknown operators dropped) |
| `server/match/match/platform.js` | after `setLoadout` | `setSkins(playerId, skins)` — any phase, `markPrivate()` (owner, prep scouts, boss partner) and `markPublic()` |
| `server/match/match/views.js` | `publicView().players[]`, `_prepBoardUnits`, the scouted bench | `skins` (omitted when empty), and `skin` on every unit the player owns |
| `server/match/player/round.js` | `battleInput` | the unit's `skin`, from the player's own selection and the piece's operator (a 自选 slot follows its pick) |
| `server/match/player/views.js` | `pieceView` | `skin` on the prep board / hand / temp views |
| `server/sim/units.js`, `server/sim/battle/players.js`, `server/sim/snapshot.js` | `Unit`, `_createAllyFromInput` / `_makeAlly`, `unitInfo` | carried to the client; `skin: u.skin ?? undefined`, so a piece without one adds no key to the wire |
| `public/js/assets.js` | `portraitUrl` / `illustUrl` (new) / `spineEntry` / `hasBackSpine` / `unitPictureUrl` / `skinsOf` / `skinHasModel` | every helper takes `opts.skin` (the skinId) and falls back to the operator's own art |
| `public/js/render/units.js` | `_pictureUrl`, `_modelEntry`, `_wantsBack`, `_loadPicture` | `info.skin` reaches the Spine entry, the diamond and the Front/Back question; the picture's cache key carries the skinId |
| `public/js/render/app.js` | `otherSkins` setting, `ctx.myPlayerId`, `applyInfo`, `refreshSkins`, `setSettings`, `setMe`, `setSkins`, `pieceInfo` | received `sourceSkin` is retained while displayed `skin` follows the switch and latest public selection; a changed appearance drops the view; read-only prep pieces refresh too |
| `public/js/render/app/info.js` | `renderInfo` | `skin` |
| `public/js/ui/loadoutSync.js` | header, `installSkinsSync` | the fourth `installPrefSync` setting (`room.skins { skins }`) |
| `public/js/main.js` | boot | `installSkinsSync({ net })` |
| `public/js/ui/settings.js` | `CosmeticSection` | the 显示其他玩家的皮肤 switch — with or without a cosmetic plugin |
| `public/js/ui/gameLogic/settings.js` | `DEFAULT_SETTINGS`, `sanitizeSettings` | `otherSkins: true` |
| `public/js/ui/fieldHost.js` | mount, store subscription, `OPTIONAL` | `view.setMe` and `view.setSkins` adopt and follow local identity / public seat choices; unmount removes the subscription |
| `public/css/screens/loadout.css` | end | `.lo-skins` / `.lo-skin*` tiles, `.lo-skin-preview` |
| `public/i18n/*.json` | — | the strings above, in every pack (`node tools/i18n.mjs check --all --strict`) |

## Invariants

- **No `cs`.** An appearance is never part of a room's content set: it changes nothing a battle does, so no battle
  identity moves for it (docs/PLUGINS.md §6).
- **No `server/sim/` rule.** The sim carries `skin` as opaque data (`Unit.skin` → `unitInfo().skin`); no rule reads it
  (`server/sim/units.js` stores it, `battle/players.js` copies it onto the ally, `snapshot.js` publishes it). The same
  seeded battle run with and without a skin returns the same `Battle.result()` (`test/skins.test.js`), and
  `test/golden/*.json` is unchanged. `skin` is listed with the sim fields in `docs/design/engine.md` §5.2 and
  `docs/SIM.md` §2 as display-only.
- **No `data/` write.** Nothing in this feature writes a data file; a plugin's own files are served from
  `plugins/<id>/` under `/p/<id>/<hash>/…` (docs/PLUGINS.md §9).
- **No game art in git.** As ever: skin art belongs to a plugin (or to a locally extracted client), never to this
  repository.
- **A bad map is refused whole.** `isSkinSelection` / `validateC2S` (`room.skins`), the lobby (`freezeSkins` / `skins()`)
  and `PlayerState.setSkins` all require a plain object, a charId key (`isCharId`: official `char_<digits>_<token>` or
  a plugin `char_x_…`, never a chess id) and a skinId value (`isSkinId`). An array, a null-prototype object, one bad
  key or value, or more than 256 entries [ASSUMED] is BAD_MSG and does **not** clear a choice already stored. A charId
  the room's content does not have (`operatorCharIds`: chess records, `backups.units`, `diy.ownedPool`,
  `diy.operators`) is dropped and the rest kept, so the stored map is at most that operator count. An unknown skinId
  of an operator the room does have still draws the default model (`spineEntry`).
- **The client never sends more than the wire accepts.** `SKIN_LIMITS.entries` (256 [ASSUMED]) is applied in
  `public/js/ui/skins.js parseStoredSkins`, the one place a stored selection is read — the store's initial state, every
  edit and the `room.skins` payload the sync prepares. The limit has to be honoured there because an over-long map is not
  trimmed entry by entry on the server: `isSkinSelection` refuses the WHOLE message (BAD_MSG), so nothing would be stored
  and the sync would sit in `error` (public/js/ui/loadoutSync.js `installPrefSync`) instead of saving the rest.
- **A tile never outgrows the panel it sits in.** `.lo-skins` is `repeat(5, minmax(0, 1fr))` (three columns below 900 px,
  where the detail panel is a whole phone width — or a narrow window — and tall enough for the 1:2 box), so a tile is a
  share of the detail panel and its size never moves with how many skins an operator has. The tile draws the appearance's
  1:2 portrait, and on a panel too short for that box it draws the same appearance's 1:1 `avatar` instead —
  `@media (max-width: 1000px) and (max-height: 520px)` at the end of the picker's block in
  `public/css/screens/loadout.css`. That query is a phone in landscape: its detail panel is 193–263 px tall (measured
  740×360 … 932×430) while the 1:2 tile is 264–379 px there, which made 皮肤 the ONE section of that panel a phone could
  not see whole (潜能与练度 / 技能 / 局内数值 / 模组 are 135–163 px in the same panel). Both images of a tile are in the DOM
  (`public/js/ui/skinPicker.js`, `availableSkins().avatar`) and CSS alone decides, so no resize listener and no re-render;
  273/273 of the installed skins ship an `avatar` of their own (measured), and a row whose manifest has none keeps its
  portrait on every screen. A 1:2 box is still what every wider panel draws, with `min-height: max(1.5rem, 130px)` as
  the floor of a narrow one. Portrait is not a case to solve: a portrait phone is covered by 「请将设备横屏」
  (`public/index.html .rotate-hint`, shown by `public/css/theme.css`
  `@media (orientation: portrait) and (max-width: 1024px) { .sp-rotatable .rotate-hint { display: grid } }` for the
  `sp-rotatable` that `public/js/ui/device.js` sets on a coarse pointer whose screen is not landscape).

## Known limitations

- **Bots always wear the default model** (`PlayerState.setSkins` refuses a bot, as `setLoadout` does).
- **The studio does not list skins.** It finds an operator, an enemy or an interface picture by its official name
  (`server/studio/targets.js`), so a skin key is copied from the installation's manifest or written in the stem form.
- **No skin effects and no operator voices** (a separate piece of work; docs/ASSETS.md).
- **A 自选 slot's own record has `charId: null`**, so it wears its **pick's** operator's skin — the slot has no body of
  its own. The picker offers the appearance while picking that operator, and the choice is kept per operator, so
  changing the slot's operator changes the appearance with it.

---

## 本分支补充（名片、立绘补全与协议）

## 名片皮肤头像

头像选择分两步：先搜索或按稀有度选择干员，再选择该干员的默认头像或皮肤头像。第二步可返回干员列表，
保留搜索和稀有度；取消或关闭不更改原选择。皮肤目录仅在第二步读取，失败可重试，默认头像始终可选。
只列出目录中且 `assets.chars[charId].skins[skinId].avatar` 已有头像的皮肤，不要求部署战场模型，
不切换 `skinsEnabled` / `preloadSkins`，也不下载模型。缺少所选皮肤时保留偏好并显示该干员默认头像。

沿用 `sp.pref.room.card` 和 `room.card` 的 `{ charId, avatar }`：`avatar` 可为旧的干员 ID 或完整皮肤 ID
（如 `char_498_inside@kitchen#2`）。`charId` 决定房间立绘，也支持完整皮肤 ID。服务端校验格式及各自所属干员，
URL 仅从该干员的素材清单解析；未知皮肤不构成任意 URL。大厅、房间、成就和结算页使用同一选择。
结算同盟卡的立绘优先使用该玩家选择的房间立绘；未选、素材缺失或旧数据沿用阵容最高阶干员作为回退，
不使用头像或其他玩家的本机选择替代立绘。
复用原同步、断线重发及 Session/座位持久化，旧偏好无需迁移，不进入 Match Worker 游戏状态。

## 皮肤立绘

现有立绘位置统一支持皮肤：干员调配详情和卡片、商店、干员详情（含查看队友和战斗单位）、自选卡片的默认回退、
个人结算阵容和同盟结算卡。游戏内立绘沿用所属玩家的基础 chessId 皮肤选择及观看者的 `skinsEnabled`，
精锐沿用同一选择；战斗单位优先使用该场战斗携带的皮肤。AI、补位及自选槽位继续默认，不借用观看者的皮肤。
关闭显示立即恢复默认，保留已选皮肤；立绘缺失或请求失败按普通/精锐回退原立绘。

房间“更换立绘”先选干员，再选默认或已部署的皮肤立绘；返回保留搜索和稀有度，取消不保存。
目录仅第二步按需加载，保留加载、重试、空状态及已选素材缺失提示。
沿用 `{ charId, avatar }`，`charId` 可为旧干员 ID 或完整皮肤 ID，与头像独立，按所属干员的素材清单解析。
名片立绘与名片头像一样独立于战场显示/预载开关，不要求模型；同房玩家、观战者及结算读取该玩家自己的选择。
未知皮肤保留偏好并回退该干员原立绘，陌生干员、外部 URL 或非法路径仍拒绝。

素材来自 yuanyan3060/ArknightsGameResource 的 `portrait/{portraitId}.png`（180×360），
`portraitId` 已按官方 `skin_table.json` 对照写入研究表。无需下载数 MiB 的全尺寸 `skin/` 原画。
清单字段为 `chars[charId].skins[skinId].portrait`；立绘属于可选皮肤预载、缓存与 ZIP 范围，沿用素材 CDN。

## 部署皮肤素材

没有浏览器安装接口或 `room.skin.install`，游戏服务器不代玩家访问第三方下载站。
管理员在部署机运行以下命令，不对开发机现有共享素材目录自动执行安装：

```sh
node tools/build-skins.mjs
node tools/install-skins.mjs list
node tools/install-skins.mjs add 'char_498_inside@kitchen#2'
node tools/install-skins.mjs add-char char_498_inside
node tools/install-skins.mjs add-all
# 只为当前已安装的皮肤补齐立绘，不重装模型或改动安装选择：
node tools/install-skins.mjs portraits
node tools/asset-hashes.mjs
```

`add-all` 可选，下载量以实际成功文件为准。通过原 `processModels()` / 动画角色解析，以成功 Front 模型更新
`data/assets.json`。`data/skins-installed.json` 是本部署选择记录，忽略且不随源码提交，不复制另一部署记录。
再次 `npm run assets` 只保留该记录中的皮肤；`remove <skinId…>` 移出清单，磁盘文件暂留。
安装可中断重试；清单和记录各自原子写入，中断在两次写入之间时重新安装修复。不要并行运行安装/素材重建工具。

同步新的 `data/assets.json`、`data/skins.json`、`data/asset-hashes.json` 到服务器及数据 CDN；
同步 `public/assets/spine/op/<charId>/<skinStem>/`、`public/assets/char/avatar/skin/` 和 `public/assets/char/portrait/skin/` 到素材 CDN。
保留 CDN 前缀、CORS 头并按既有策略刷新缓存，目录表不能替代素材部署。数据更新后，若部署提供
`scripts/copy-data-to-nginx.sh`，核对实际 Nginx alias；当前 `srv` 配置在仓库根目录执行：

```sh
sudo bash scripts/copy-data-to-nginx.sh ./data /opt/1panel/www/sites/wei.linxia.dev/index/srv
```

重新构建并重建镜像/容器，保留挂载、Redis 和公告排期；旧数据/素材挂载可能覆盖镜像内容。
更新 SW（`resources/common.js` 变化）和 UI 语言 JSON。不承诺未经实测的线上进行中对局跨版本无缝恢复。
本机直接运行 Node 时同样需要重启原服务进程：只重新构建、刷新页面会更新前端文件，但旧进程仍可能按旧规则拒绝
皮肤立绘的 `room.card.charId`，返回 `BAD_MSG / bad field charId`，此时房间继续展示上次已确认的立绘。

## 协议和恢复

`room.skins { skins: { [baseChessId]: skinId } }` 有数量/长度/格式约束及重消息限流；
服务端过滤隐藏、精锐、自选、非基础棋子，身份取当前会话。观战者只保存未来偏好，不修改被观战者。
未知但格式合法的 skinId 不构成 URL；渲染只查部署清单，查不到用默认。
偏好进入 Session、座位、等待队列、外部匹配队友、Match Worker、检查点和连续恢复；旧检查点为空，
退出/存活/空原房间容器规则不变。
`m.public.players[].skins` 仅非空时出现，战斗输入 → Unit → `unitInfo.skin` 传递所属玩家选择；
普通快照元组和战斗结果不变。

## 验证范围

新增 `test/skins*.test.js`、`test/skin-tools.test.js`、`test/ui/skins.test.js`、`test/render/skins.test.js`，
并补资源范围、ZIP、战斗闸门、Vite 模拟比对及恢复回归。Node/Fake Pixi 不等于真机浏览器或 CDN 验收。
发布前手动验证：多玩家不同皮肤、另一观看者关闭显示、精锐和向上朝向、简化战场、断线重连、SW 更新、
仅音频/仅皮肤预载、战斗中切换范围和 ZIP 导入后的补缺。

### 2026-10-14 本次验证

- 修改前相关资源/大厅/匹配/持久化/Worker 基线：408 通过、0 失败。
- Node 22.23.3，`node --test --test-concurrency=4`：7041 项，7020 通过、0 失败、21 跳过；
  跳过的浏览器等测试不作为实测证据。最终全量耗时约 402 秒。
- `npm run golden`：全部 287 场景匹配，无黄金基线变更。
- `npm run build`、Vite 打包/Node 模拟比对（包括所属玩家皮肤及不改变战斗结果）、`npm run typecheck`、
  发行包白名单、`git diff --check` 均通过。构建保留原有大分包警告。
- 真实 Redis 可达；原恢复测试通过，补充完整 Match Worker 经过三次 Redis 重启后皮肤 Session/检查点仍一致；
  新增外部匹配队友的本地/Worker 双重连续恢复、观战权限及旧检查点默认值回归通过。
- lint：0 错误、154 警告；导入检查仍列出与修改前完全相同的 3 条 Node-only `nodeData.js` 提示。
  新界面文本补齐四个语言包；英语 1379/1379，另三包保留既有 197 条缺译回退，无格式错误。
- 首次全量暴露文档头部约定、协议监控白名单、设置/模型签名断言和发行白名单预期，均已适配；
  ZIP 配额测试原先假定并发文件顺序，改为先等待首个成功写入再制造配额失败，不改变生产导入逻辑。
- 未下载整套皮肤，开发工作树当前安装数为 0；未改动原工作区公告、素材清单或其他正在进行的修改。
  浏览器、真机、Docker 和真实 CDN 素材下载尚未实测。
