// All gameplay portraits follow the operator's owner and the viewer's skin switch.
import { html } from './components.js';
import { Img } from './gameComponents.js';
import { chessPortraitUrl } from './assetUrls.js';
import { useStore } from '../store.js';
import { skinsStore, SKINS_KEY } from './skins.js';
import { settingsStore } from './settings.js';
import { visibleSkin } from '../../../shared/skins.js';

export function portraitSkin(chess, { state, entries, settings, ownerId, skin } = {}) {
  if (!chess || chess.isDiy || chess.isHidden || chess.standInFor) return null;
  if (skin !== undefined) return visibleSkin(skin, settings);
  // 0.3.1 keys a skin by the OPERATOR (charId), not by the chess slot: ui/skins.js documents it, the server agrees
  // (PlayerBasics.skinFor → skinCharIdOf, and players[].skins in publicView). A 补位 or 自选 piece of the same operator
  // therefore shares one entry. The chess id this file used to read is now an alias nothing else in the tree writes.
  const id = chess.charId || null;
  if (!id) return null;
  const owner = ownerId === undefined ? state?.me?.playerId : ownerId;
  const player = state?.match?.public?.players?.find((p) => p.playerId === owner);
  if (player?.isBot) return null;
  // An explicit foreign owner must never inherit this browser's selection.
  const selected = player ? player.skins?.[id]
    : ownerId === undefined || (owner != null && owner === state?.me?.playerId) ? entries?.[id] : null;
  return visibleSkin(selected, settings);
}

export function OperatorPortrait({ m, chess, ownerId, skin, fallback = null, ...props }) {
  const id = chess?.charId || null;
  const enabled = useStore((s) => s.skinsEnabled, undefined, settingsStore);
  const local = useStore((s) => (id ? (s[SKINS_KEY] || {})[id] || null : null), undefined, skinsStore);
  // Subscribe to this portrait's resolved choice, so unrelated snapshots do not redraw every roster image.
  const selected = useStore((state) => portraitSkin(chess, {
    state, entries: id ? { [id]: local } : {}, settings: { skinsEnabled: enabled }, ownerId, skin,
  }));
  const base = chessPortraitUrl(m, chess);
  const src = chessPortraitUrl(m, chess, { skin: selected });
  return html`<${Img} ...${props} src=${src} fallback=${src !== base
    ? html`<${Img} ...${props} src=${base} fallback=${fallback} />` : fallback} />`;
}
