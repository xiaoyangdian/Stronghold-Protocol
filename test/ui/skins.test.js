// The branch's skin-UI contracts that survived 0.3.1 (docs/SKINS.md, docs/MERGE_0.3.1.md).
//
// The rest moved or was superseded by upstream's own coverage, which is why this file is this small:
//   * the picker's rows (availableSkins / hasAnySkinChoices: one row per manifest skin plus the operator's 默认 row)
//     are upstream's — test/ui/skin-picker.test.js;
//   * the store→server sync engine is now ui/loadoutSync.js `installSkinsSync` (one installPrefSync for skins, loadout,
//     ownership, 自选, …) — test/ui/loadout-sync-stale.test.js, test/lobby-skins.test.js;
//   * the settings defaults (skinsEnabled / preloadSkins) — test/ui/gameLogic.test.js; visibleSkin's viewer rule —
//     test/skins-lifecycle.test.js and the renderer source contracts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanSkins, freezeSkins, SKIN_LIMITS } from '../../shared/skins.js';

const SKIN = 'char_498_inside@kitchen#2';
const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('a stored selection is capped and refuses prototype keys and malformed ids', () => {
  const big = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`chess_${i}`, SKIN]));
  assert.equal(Object.keys(cleanSkins(big)).length, SKIN_LIMITS.entries);
  assert.deepEqual(cleanSkins(JSON.parse('{"__proto__":"char_x@s#1","constructor":"char_x@s#1","x":"bad/id"}')), {});
});

test('freezeSkins keeps the chess ids the match still has and drops the rest', () => {
  const chess = { good: {}, hidden: { visible: false }, golden: { isGolden: true }, diy: { isDiy: true }, alias: { baseId: 'good' } };
  assert.deepEqual(freezeSkins(Object.fromEntries(Object.keys(chess).map((id) => [id, SKIN])), (id) => chess[id]), { good: SKIN });
});

test('the skin sync is the shared pref engine in ui/loadoutSync.js, not in ui/skins.js', () => {
  const sync = read('public/js/ui/loadoutSync.js');
  assert.match(sync, /export function installSkinsSync\(\{ net, timers, target = skinsStore, notify \} = \{\}\) \{/);
  assert.match(sync, /msgType: 'room\.skins', field: 'skins'/);
  // ui/skins.js is the store and the catalogue: it must not grow a second publisher
  assert.doesNotMatch(read('public/js/ui/skins.js'), /export function installSkinsSync/);
});
