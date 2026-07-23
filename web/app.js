export const DB = window.DB;
export const NOW = window.DB.now;
export const qs = (name) => new URLSearchParams(location.search).get(name);
export const byId = (coll, id) => coll.find(x => x.id === id);
export const scenariosOfIssue = (issueId) => DB.scenarios.filter(s => s.issueId === issueId);
export const childrenOf = (id) => DB.scenarios.filter(s => s.parentScenarioId === id);
export const dnum = (d) => Date.parse(d);

const _get = (k) => JSON.parse(localStorage.getItem(k) || '{}');
const _set = (k, o) => localStorage.setItem(k, JSON.stringify(o));

// star: 유저 지지(오버라이드는 +1 토글). realizedAt/reflected와 독립.
export function toggleStar(id) { const o = _get('stars'); o[id] = !o[id]; _set('stars', o); }
export function isStarred(s) { return !!_get('stars')[s.id]; }
export function starCount(s) { return s.stars + (_get('stars')[s.id] ? 1 : 0); }

// reflected: 지도 표시. 토론 화면 토글.
export function setReflected(id, v) { const o = _get('reflected'); o[id] = v; _set('reflected', o); }
export function isReflected(s) { const o = _get('reflected'); return s.id in o ? o[s.id] : s.reflected; }

// edit: 제목/본문 목 편집 → 지도·분석에 반영.
export function setEdit(id, patch) { const o = _get('edits'); o[id] = { ...(o[id] || {}), ...patch }; _set('edits', o); }
export function applyEdit(s) { const e = _get('edits')[s.id]; return e ? { ...s, ...e } : s; }

// lastVisit: 트리 애니메이션 시작점. 첫 방문이면 목 과거 시점으로 시연.
export function lastVisit() { return localStorage.getItem('lastVisit'); }
export function markVisit() { localStorage.setItem('lastVisit', NOW); }

// moderation: 금지어 마스킹(클라이언트 목).
export function moderate(text) { let t = text; for (const w of DB.badwords) t = t.split(w).join('*'.repeat(w.length)); return t; }

// SVG/커스텀 요소를 클릭·키보드(Enter·Space) 양쪽으로 활성화 (접근성).
// 호출부에서 role·tabindex·aria-label을 함께 지정할 것.
export function activate(node, fn) {
  node.addEventListener('click', fn);
  node.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
  });
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) node.append(c?.nodeType ? c : document.createTextNode(c));
  return node;
}

export function mountNav(active = '') {
  const nav = el('nav', { class: 'topnav' }, [
    el('a', { href: 'index.html', class: active === 'dashboard' ? 'on' : '' }, '대시보드'),
    el('a', { href: 'map.html', class: active === 'map' ? 'on' : '' }, '지도'),
    el('span', { class: 'spacer' }),
    el('span', { class: 'userbadge' }, '👤 분석가_나 (목)')
  ]);
  document.body.prepend(nav);
}
