#!/usr/bin/env node
// 上游跟踪报告：把「我们和 upstream 各自动了哪些文件」算清楚，给合并排期用。
//
//   node tools/upstream-watch.mjs                 # 相对 merge-base 的全量对照
//   node tools/upstream-watch.mjs --no-fetch      # 不联网，用本地已有的 upstream/master
//   node tools/upstream-watch.mjs --list both     # 列出双方都动过的文件（both|ours|theirs|deleted）
//   node tools/upstream-watch.mjs --since v0.3.1  # 换基准（默认 merge-base(HEAD, upstream/master)）
//   node tools/upstream-watch.mjs --json          # 机器可读，供 CI / 文档生成
//
// 三类文件分开看，处置方式完全不同：
//   ours    本分支独有（上游从没有过）        → 合并时无须管
//   theirs  上游独有（我们没跟上的新增）      → 整目录取上游即可
//   both    双方都动过                       → 真正要逐文件解的部分（冲突面）
//   deleted 我们删掉、上游又改过的            → 保持删除，别被上游「复活」
//
// 这里的 base 取 merge-base：合并完后它会自动前移，所以这个脚本可以一直用下去。

import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const UPSTREAM = 'upstream/master';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trimEnd();
const lines = (s) => (s ? s.split('\n').filter(Boolean) : []);

function run(cmd, args) {
  try { return git(...args); } catch (e) { throw new Error(`${cmd}: ${String(e.stderr || e.message).trim()}`, { cause: e }); }
}

if (has('--fetch') || !has('--no-fetch')) {
  try {
    process.stderr.write(`[watch] git fetch ${UPSTREAM.split('/')[0]} …\n`);
    run('fetch', ['fetch', '--quiet', UPSTREAM.split('/')[0]]);
  } catch (e) {
    process.stderr.write(`[watch] fetch 失败，改用本地已有引用：${e.message}\n`);
  }
}

let base = value('--since', '');
if (!base) {
  try { base = run('merge-base', ['merge-base', 'HEAD', UPSTREAM]); }
  catch { console.error(`[watch] 找不到 HEAD 与 ${UPSTREAM} 的共同祖先：先 git remote add upstream <url> && git fetch upstream`); process.exit(2); }
}

const names = (...args) => lines(run('diff', ['diff', '--name-only', ...args])).sort();

const ours = names(base, 'HEAD');
const theirs = names(base, UPSTREAM);
const oursSet = new Set(ours);
const theirsSet = new Set(theirs);
const both = ours.filter((f) => theirsSet.has(f));
const ourOnly = ours.filter((f) => !theirsSet.has(f));
const theirOnly = theirs.filter((f) => !oursSet.has(f));
const deleted = lines(run('diff', ['diff', '--diff-filter=D', '--name-only', base, 'HEAD'])).sort();
const deletedSet = new Set(deleted);
// 删除型冲突：我们删了它，上游却又改/留了它 —— 保持删除即可，不需要逐文件解
const keepDeleted = both.filter((f) => deletedSet.has(f));
const realBoth = both.filter((f) => !deletedSet.has(f));

const counts = (list) => {
  const m = new Map();
  for (const f of list) {
    const key = f.includes('/') ? f.split('/').slice(0, f.startsWith('public/') || f.startsWith('server/') || f.startsWith('test/') || f.startsWith('tools/') || f.startsWith('docs/') ? 2 : 1).join('/') + '/…' : '(根目录)';
    m.set(key, (m.get(key) || 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
};

// 文件集合口径（和上面的变更集不同）：谁有谁没有。合并时要回答的是这两个问题：
//   treeOurOnly  只在 HEAD 里的文件      → 本分支新增的能力
//   treeUpOnly   只在 upstream 里的文件  → 再拆成「我们主动删的」与「上游新增没跟上的」
const tree = (ref) => lines(git('ls-tree', '-r', '--name-only', ref)).sort();
const treeHead = tree('HEAD');
const treeUp = tree(UPSTREAM);
const treeBase = new Set(tree(base));
const headSet = new Set(treeHead);
const upSet = new Set(treeUp);
const treeOurOnly = treeHead.filter((f) => !upSet.has(f));
const treeUpOnly = treeUp.filter((f) => !headSet.has(f));
const treeWeDeleted = treeUpOnly.filter((f) => treeBase.has(f));
const treeNotFollowed = treeUpOnly.filter((f) => !treeBase.has(f));

// 同名不同源：双方在同一个路径上各自新增（base 里谁都没有）。git 只会报 add/add 冲突，
// 但真正的问题是「同一个名字装了两套独立实现」—— 必须按语义决定留谁，机器无法代劳。
const addedByUs = new Set(lines(run('diff', ['diff', '--diff-filter=A', '--name-only', base, 'HEAD'])));
const addedByThem = new Set(lines(run('diff', ['diff', '--diff-filter=A', '--name-only', base, UPSTREAM])));
const sameName = [...addedByUs].filter((f) => addedByThem.has(f)).sort();

const sha = (ref) => { try { return git('rev-parse', '--short', ref); } catch { return '?'; } };
const commits = (a, b) => { try { return Number(git('rev-list', '--count', `${a}..${b}`)); } catch { return -1; } };

if (has('--json')) {
  console.log(JSON.stringify({ base, baseSha: sha(base), upstreamSha: sha(UPSTREAM), headSha: sha('HEAD'),
    upstreamCommits: commits(base, UPSTREAM), ours, theirs, both, ourOnly, theirOnly, deleted, keepDeleted, realBoth,
    treeOurOnly, treeUpOnly, treeWeDeleted, treeNotFollowed, sameName }, null, 2));
  process.exit(0);
}

const list = value('--list', '');
if (list) {
  const pick = { both: realBoth, ours: ourOnly, theirs: theirOnly, deleted, keepDeleted, treeOurs: treeOurOnly, treeTheirs: treeNotFollowed, sameName }[list];
  if (!pick) { console.error('--list 只接受 both | ours | theirs | deleted | keepDeleted | treeOurs | treeTheirs | sameName'); process.exit(2); }
  for (const f of pick) console.log(f);
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n基准 base        : ${sha(base)}  (${base === UPSTREAM ? UPSTREAM : 'merge-base'})`);
console.log(`上游             : ${UPSTREAM} @ ${sha(UPSTREAM)}   base 之后 ${commits(base, UPSTREAM)} 条提交`);
console.log(`本分支           : HEAD @ ${sha('HEAD')}   base 之后 ${commits(base, 'HEAD')} 条提交`);
console.log('');
console.log(`  本分支动过 ours      ${pad(ours.length, 5)} → 相对 base 我们改过的文件（其中 ${both.length} 个上游也改了）`);
console.log(`  上游动过   theirs    ${pad(theirs.length, 5)} → 相对 base 上游改过的文件（其中 ${both.length} 个我们也改了）`);
console.log(`  双方都动过 both      ${pad(both.length, 5)} → 冲突面：其中 ${keepDeleted.length} 个是我们已删除（保持删除），真需逐文件解 ${realBoth.length}`);
console.log('');

for (const [title, list] of [['双方都动过（按目录，前 12）', realBoth], ['上游独有（按目录，前 10）', theirOnly], ['本分支独有（按目录，前 10）', ourOnly]]) {
  const rows = counts(list).slice(0, 12);
  if (!rows.length) continue;
  console.log(`── ${title}`);
  for (const [k, v] of rows) console.log(`   ${pad(v, 5)} ${k}`);
  console.log('');
}

if (keepDeleted.length) {
  console.log('── 我们删掉了、上游又动过（保持删除，勿复活）');
  for (const f of keepDeleted) console.log(`   ${f}`);
  console.log('');
}
if (sameName.length) {
  console.log('── 同名不同源：双方各自新增了同一路径（add/add，必须按语义定谁留）');
  for (const f of sameName) console.log(`   ${f}`);
  console.log('');
}
console.log('── 文件集合口径（谁有谁没有）');
console.log(`   只在 HEAD 里的文件        ${pad(treeOurOnly.length, 5)} → 本分支新增的能力`);
console.log(`   只在 upstream 里的文件    ${pad(treeUpOnly.length, 5)} → 其中主动删除 ${treeWeDeleted.length}，上游新增未跟 ${treeNotFollowed.length}`);
console.log('');
console.log(`   同名不同源（add/add）    ${pad(sameName.length, 5)} → 同一路径两套独立实现，机器无法代劳`);
console.log('');
console.log('用 --list both|ours|theirs|deleted|treeOurs|treeTheirs|sameName 看清单，--json 喂给 CI。\n');
