# 싱크탱크 목업 Implementation Plan (개정 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거시 이슈 → 분기 시나리오 제출·토론·지지(star) → 시간축 트리에서 현실화된 결정 흐름 확인 → 지도 반영·편집 → AI 4관점 분석까지 관통하는 클릭 가능한 정적 목업.

**Architecture:** 순수 HTML/CSS/바닐라 JS, 빌드·프레임워크 없음. 목 데이터 `web/data.js`(전역 `window.DB`). 레코드 화면은 단일 템플릿 + `?id=` 쿼리 파라미터. 타임라인 트리는 라이브러리 없이 SVG 직접 렌더 — treeX는 날짜에서 계산, treeLane(정수)만 하드코딩. 상태 지속은 localStorage 오버라이드.

**Tech Stack:** HTML5, CSS3, 바닐라 JS(ES modules), Node(무결성 체크 스크립트만).

## Global Constraints

- 빌드 스텝 없음. `python3 -m http.server`로 서빙해서 열기 (ES module이라 `file://` 직접 열기는 CORS로 막힘).
- 프레임워크·번들러·CSS 프레임워크·그래프 시각화 라이브러리 **금지**.
- 모든 데이터·분석·시간 진행·현실 동기화는 목. 실제 수집·LLM·인증·영속 저장·현실 피드 없음.
- 화면당 정적 HTML 파일 증식 금지 — 레코드 화면은 `?id=` 파라미터 + 단일 템플릿.
- `web/data.js`는 클래식 `<script src>`로 로드 → **`export` 문 절대 금지** (`window.DB`만 할당). ES `export`는 `web/app.js`에서만.
- `DB.now = '2026-07-23'`(MOCK_NOW) 고정. 모든 `realizedAt`은 `createdAt` 이후·`DB.now` 이전.
- 세 상태 독립: `star`(지지·가지치기), `realizedAt`(트리 강조 줄기), `reflected`(지도 표시). **지도 핫스팟 = `reflected`**.
- 파일 배치: 목업 루트 `web/`. 데이터 `web/data.js`, 공용 로직 `web/app.js`, 스타일 `web/styles.css`, 화면 HTML `web/*.html`. 무결성 체크 `test/check-data.mjs`(node `assert`).

---

### Task 1: 스캐폴드 + 목 데이터 + 헬퍼 + 무결성 체크

**Files:**
- Create: `web/data.js`, `web/app.js`, `web/styles.css`, `test/check-data.mjs`

**Interfaces:**
- Produces (`web/data.js`, 전역 `window.DB` **만** — export 금지):
  - `DB.now`: `'2026-07-23'`; `DB.badwords`: `string[]`
  - `DB.issues`: `[{ id, title, summary, sources[], traffic, heat }]`
  - `DB.scenarios`: `[{ id, issueId, parentScenarioId|null, title, body, rationale, discussionSummary, stars, createdAt, realizedAt|null, treeLane, reflected, mapLocation{x,y,label}|null }]`
  - `DB.comments`: `[{ id, scenarioId, author, body, ts }]`
  - `DB.analyses`: `[{ scenarioId, lenses{political,economic,military,civilian} }]`
- Produces (`web/app.js`, ES exports): `DB, NOW, qs, byId, scenariosOfIssue, childrenOf, el, mountNav, dnum, toggleStar, starCount, isStarred, setReflected, isReflected, setEdit, applyEdit, lastVisit, markVisit, moderate`.

- [ ] **Step 1: 무결성 체크 작성 (실패하도록)**

`test/check-data.mjs`:
```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../web/data.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
new Function('window', src)(sandbox.window);
const DB = sandbox.window.DB;
const dnum = (d) => Date.parse(d);

assert.ok(DB, 'DB 존재');
assert.equal(DB.now, '2026-07-23', 'MOCK_NOW 고정');
assert.ok(Array.isArray(DB.badwords) && DB.badwords.length, '금지어 배열');
assert.ok(DB.issues.length >= 4, '이슈 4개 이상');

const issueIds = new Set(DB.issues.map(i => i.id));
const scenIds = new Set(DB.scenarios.map(s => s.id));
const parentOf = id => DB.scenarios.find(s => s.id === id)?.parentScenarioId;
const chainLen = s => { let n = 1, p = s.parentScenarioId; while (p) { n++; p = parentOf(p); } return n; };

for (const s of DB.scenarios) {
  assert.ok(issueIds.has(s.issueId), `${s.id} issueId 유효`);
  if (s.parentScenarioId !== null) assert.ok(scenIds.has(s.parentScenarioId), `${s.id} 부모 유효`);
  assert.equal(typeof s.stars, 'number', `${s.id} stars 숫자`);
  assert.equal(typeof s.treeLane, 'number', `${s.id} treeLane 숫자`);
  if (s.realizedAt) {
    assert.ok(dnum(s.realizedAt) >= dnum(s.createdAt), `${s.id} realizedAt>=createdAt`);
    assert.ok(dnum(s.realizedAt) <= dnum(DB.now), `${s.id} realizedAt<=now`);
  }
  if (s.reflected) assert.ok(s.mapLocation, `${s.id} reflected면 mapLocation 필수`);
}
for (const c of DB.comments) assert.ok(scenIds.has(c.scenarioId), `코멘트 ${c.id} scenarioId 유효`);
for (const a of DB.analyses) {
  assert.ok(scenIds.has(a.scenarioId), `분석 ${a.scenarioId} 유효`);
  for (const lens of ['political','economic','military','civilian'])
    assert.ok(a.lenses[lens], `분석 ${a.scenarioId} ${lens} 존재`);
}
// 시연 전제 데이터
assert.ok(DB.scenarios.some(s => chainLen(s) >= 4), 'depth≥3 트리 존재(가지치기 시연)');
assert.ok(DB.comments.some(c => DB.badwords.some(w => c.body.includes(w))), '금지어 코멘트 샘플 존재');
assert.ok(DB.issues.some(i => DB.scenarios.every(s => s.issueId !== i.id)), '빈 트리 이슈 존재');
assert.ok(DB.issues.some(i => { const ss = DB.scenarios.filter(s => s.issueId === i.id); return ss.length && ss.every(s => !s.realizedAt); }), 'realizedAt 전부 null 이슈 존재');
assert.ok(DB.scenarios.some(s => s.reflected), 'reflected 시나리오 존재');

console.log('check-data OK');
```

- [ ] **Step 2: 실패 확인**

Run: `node test/check-data.mjs`
Expected: FAIL — `web/data.js` 없음(ENOENT).

- [ ] **Step 3: `web/data.js` 작성**

```js
window.DB = {
  now: '2026-07-23',
  badwords: ['젠장', '바보', '멍청'],
  issues: [
    { id: 'i1', title: '반도체 수출 규제 확대', summary: '주요국의 첨단 반도체 수출 통제가 공급망 재편을 촉발.', sources: ['news','sns','gov'], traffic: 92000, heat: 'high' },
    { id: 'i2', title: '북극 항로 상용화', summary: '해빙 가속으로 북극 항로 상업 운항 논의 본격화.', sources: ['report','news'], traffic: 31000, heat: 'medium' },
    { id: 'i3', title: '중앙은행 디지털화폐(CBDC) 도입', summary: '주요국 CBDC 파일럿 확대 — 아직 현실화된 분기 없음.', sources: ['gov','report'], traffic: 47000, heat: 'medium' },
    { id: 'i4', title: '희토류 공급 다변화', summary: '신규 이슈 — 아직 제출된 시나리오 없음.', sources: ['news'], traffic: 8000, heat: 'low' }
  ],
  scenarios: [
    // i1 — 강조 줄기 s1→s2, depth·star 분산으로 가지치기 시연
    { id:'s1', issueId:'i1', parentScenarioId:null, title:'규제 전면 확대', body:'통제 품목이 성숙 공정까지 확대되는 경로.', rationale:'과거 제재 확대 패턴 + 정책 발언 정황.', discussionSummary:'다수 참여자가 확대 기조에 동의, 산업계 반발을 변수로 지목.', stars:41, createdAt:'2026-01-10', realizedAt:'2026-03-01', treeLane:0, reflected:true, mapLocation:{x:300,y:180,label:'동아시아'} },
    { id:'s2', issueId:'i1', parentScenarioId:'s1', title:'역내 자급 가속', body:'규제 대응으로 역내 생산 내재화가 급진전.', rationale:'보조금 규모·팹 착공 발표.', discussionSummary:'보조금 규모가 결정적이라는 데 합의.', stars:28, createdAt:'2026-03-15', realizedAt:'2026-05-20', treeLane:0, reflected:true, mapLocation:{x:340,y:200,label:'한·중·대만'} },
    { id:'s3', issueId:'i1', parentScenarioId:'s1', title:'우회 무역 확산', body:'제3국 경유 우회로 형성.', rationale:'무역 통계 이상 징후.', discussionSummary:'단기 과대평가 우려가 다수.', stars:12, createdAt:'2026-03-20', realizedAt:null, treeLane:-1, reflected:false, mapLocation:null },
    { id:'s6', issueId:'i1', parentScenarioId:'s2', title:'팹 국산화 완성', body:'핵심 공정 국산화 완료.', rationale:'착공 팹 가동률 근거.', discussionSummary:'낙관론과 시점 논쟁 병존.', stars:15, createdAt:'2026-06-01', realizedAt:null, treeLane:0, reflected:false, mapLocation:null },
    { id:'s7', issueId:'i1', parentScenarioId:'s2', title:'보조금 축소 역풍', body:'재정 부담으로 보조금 축소.', rationale:'재정 적자 추계.', discussionSummary:'지지 낮음.', stars:6, createdAt:'2026-06-05', realizedAt:null, treeLane:1, reflected:false, mapLocation:null },
    { id:'s8', issueId:'i1', parentScenarioId:'s2', title:'수출 반등', body:'우회 수요로 수출 반등.', rationale:'선적 데이터 반등.', discussionSummary:'중간 지지.', stars:22, createdAt:'2026-06-10', realizedAt:null, treeLane:2, reflected:false, mapLocation:null },
    { id:'s9', issueId:'i1', parentScenarioId:'s3', title:'제3국 제재 확대', body:'우회로 차단 위한 제재 확대.', rationale:'제재 명단 확대 정황.', discussionSummary:'가능성 중간.', stars:9, createdAt:'2026-05-01', realizedAt:null, treeLane:-1, reflected:false, mapLocation:null },
    { id:'s10', issueId:'i1', parentScenarioId:'s9', title:'글로벌 통제망 형성', body:'다자 통제 레짐 성립.', rationale:'다자 협의체 논의.', discussionSummary:'장기·불확실.', stars:3, createdAt:'2026-06-15', realizedAt:null, treeLane:-2, reflected:false, mapLocation:null },
    // i2 — 단일 현실화 줄기
    { id:'s4', issueId:'i2', parentScenarioId:null, title:'항로 조기 상용화', body:'2030 이전 정기 상업 운항.', rationale:'쇄빙선 발주·보험 상품 출시.', discussionSummary:'조기 상용화에 무게.', stars:19, createdAt:'2026-02-01', realizedAt:'2026-04-10', treeLane:0, reflected:true, mapLocation:{x:400,y:60,label:'북극해'} },
    // i3 — realizedAt 전부 null (현실화 0 시연)
    { id:'s5', issueId:'i3', parentScenarioId:null, title:'리테일 CBDC 우선', body:'개인 대상 CBDC 우선 확산.', rationale:'파일럿 대상·한도.', discussionSummary:'리테일 우선론 우세.', stars:15, createdAt:'2026-02-15', realizedAt:null, treeLane:0, reflected:false, mapLocation:null },
    { id:'s11', issueId:'i3', parentScenarioId:'s5', title:'홀세일 우선 반론', body:'기관 간 결제부터 도입.', rationale:'결제 인프라 우선순위.', discussionSummary:'소수 지지.', stars:8, createdAt:'2026-04-01', realizedAt:null, treeLane:1, reflected:false, mapLocation:null }
  ],
  comments: [
    { id:'c1', scenarioId:'s1', author:'분석가_김', body:'정책 발언 타임라인이 이 경로를 지지함.', ts:'2026-02-20' },
    { id:'c2', scenarioId:'s1', author:'연구원_이', body:'산업계 반발 변수 고려 필요.', ts:'2026-02-21' },
    { id:'c3', scenarioId:'s3', author:'트레이더_박', body:'우회 무역은 과대평가일 수 있음, 젠장.', ts:'2026-04-02' },
    { id:'c4', scenarioId:'s2', author:'분석가_최', body:'보조금 규모가 결정적이었음.', ts:'2026-05-22' }
  ],
  analyses: [
    { scenarioId:'s1', lenses:{ political:'수출 통제 동맹 결속 강화, 비동맹국과 마찰 확대.', economic:'단기 공급 충격·가격 상승, 중기 재고 조정.', military:'이중용도 부품 통제로 방산 공급망 재정렬.', civilian:'전자제품 가격 전가, 역내 팹 투자로 고용 부분 상쇄.' } },
    { scenarioId:'s2', lenses:{ political:'산업 정책 주도권 경쟁 심화.', economic:'보조금 재정 부담↑, 장기 자급률↑.', military:'전략물자 국산화로 자율성 확보.', civilian:'지역 고용 창출, 초기 제품 단가 상승.' } },
    { scenarioId:'s4', lenses:{ political:'북극 연안국 관할권 분쟁 부상.', economic:'운송 거리 단축으로 물류비 절감.', military:'북극 해군 존재감 경쟁 가속.', civilian:'연안 환경 리스크·원주민 공동체 영향.' } }
  ]
};
```

- [ ] **Step 4: 통과 확인**

Run: `node test/check-data.mjs`
Expected: PASS — `check-data OK`.

- [ ] **Step 5: `web/app.js` 작성**

```js
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
```

- [ ] **Step 6: `web/styles.css` 작성**

```css
:root { --bg:#0f1420; --panel:#1a2230; --line:#2b3547; --fg:#e6ecf5; --muted:#8a97ab; --accent:#4f9dff; --realized:#6ee7a8; --dim:#3a4658; --heat-high:#ff5c5c; --heat-medium:#ffb84f; --heat-low:#6ee7a8; }
* { box-sizing: border-box; }
body { margin:0; font:15px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--fg); }
a { color:var(--accent); text-decoration:none; }
.topnav { display:flex; align-items:center; gap:18px; padding:12px 20px; background:var(--panel); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:10; }
.topnav a.on { font-weight:700; color:var(--fg); }
.topnav .spacer { flex:1; } .topnav .userbadge { color:var(--muted); font-size:13px; }
main { max-width:1000px; margin:0 auto; padding:24px 20px; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:12px; }
.badge { display:inline-block; font-size:12px; padding:2px 8px; border-radius:999px; border:1px solid var(--line); color:var(--muted); margin-right:6px; }
.heat-high{color:var(--heat-high);border-color:var(--heat-high);} .heat-medium{color:var(--heat-medium);border-color:var(--heat-medium);} .heat-low{color:var(--heat-low);border-color:var(--heat-low);}
.empty { color:var(--muted); font-style:italic; padding:24px; text-align:center; border:1px dashed var(--line); border-radius:10px; }
.btn { display:inline-block; background:var(--accent); color:#fff; padding:8px 14px; border-radius:8px; border:none; cursor:pointer; font-size:14px; }
.btn.ghost { background:transparent; color:var(--accent); border:1px solid var(--accent); }
.btn.on { background:var(--realized); color:#0b1526; border-color:var(--realized); }
.lens-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.crumb { color:var(--muted); font-size:13px; margin-bottom:8px; }
.star { cursor:pointer; user-select:none; }
/* 트리 */
.treewrap { background:#0b1526; border:1px solid var(--line); border-radius:10px; }
.tnode circle { transition: opacity .4s, fill .4s; cursor:pointer; }
.tnode text { fill:var(--fg); font-size:11px; }
.tnode.dim { opacity:.4; } .tnode.dim text { fill:var(--muted); }
.tedge { transition: opacity .4s, stroke .4s; }
```

- [ ] **Step 7: 커밋**

```bash
git add web/data.js web/app.js web/styles.css test/check-data.mjs
git commit -m "feat: 목업 스캐폴드 — 확장 목데이터, 3상태 헬퍼, 무결성 체크"
```

---

### Task 2: 이슈 대시보드 (홈)

**Files:** Create: `web/index.html`

**Interfaces:** Consumes `DB, el, mountNav, scenariosOfIssue`.

- [ ] **Step 1: `web/index.html` 작성**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>이슈 대시보드 · 싱크탱크</title><link rel="stylesheet" href="styles.css"></head>
<body><main>
<h1>AI 선정 거시 이슈</h1><div id="list"></div>
</main>
<script src="data.js"></script>
<script type="module">
import { DB, el, mountNav, scenariosOfIssue } from './app.js';
mountNav('dashboard');
const list = document.getElementById('list');
for (const i of DB.issues) {
  const n = scenariosOfIssue(i.id).length;
  list.append(el('a', { href:`issue.html?id=${i.id}`, class:'card', style:'display:block;color:inherit' }, [
    el('div', {}, [ el('span',{class:`badge heat-${i.heat}`},i.heat), ...i.sources.map(s=>el('span',{class:'badge'},s)) ]),
    el('h3', { style:'margin:8px 0 4px' }, i.title),
    el('p', { class:'crumb', style:'margin:0 0 8px' }, i.summary),
    el('div', { class:'crumb' }, `트래픽 ${i.traffic.toLocaleString()} · 시나리오 ${n}개`)
  ]));
}
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

Run: `cd web && python3 -m http.server 8080` → `http://localhost:8080/index.html`.
Expected: 이슈 4개 카드, heat 배지, 시나리오 수(i4=0). 카드 클릭 → `issue.html?id=`.

- [ ] **Step 3: 커밋**

```bash
git add web/index.html
git commit -m "feat: 이슈 대시보드 화면"
```

---

### Task 3: 이슈 타임라인 트리 그래프 (핵심)

**Files:** Create: `web/issue.html`

**Interfaces:** Consumes `DB, NOW, qs, byId, scenariosOfIssue, dnum, starCount, lastVisit, markVisit, el, mountNav`.

**설계 메모:**
- x = `createdAt` 날짜를 [이슈 최소 createdAt, NOW] → [60, W-60]px로 선형 매핑. y = `treeLane`으로 레인 배치.
- 커서(cursorDate): 슬라이더 값. 노드 표시 조건 `createdAt ≤ cursor`. 현실화 `realizedAt && realizedAt ≤ cursor` → 강조(줄기), 아니면 흐림.
- 가지치기(커서 기준): 현실화 노드로부터 depth(비현실 단계 수) ≤ 2, 부모별 비현실 형제는 `starCount` 상위 2개만.
- 애니메이션: `prev = lastVisit() || '2026-04-01'`. prev<NOW면 커서를 prev→NOW로 setInterval 이산 스윕(약 12스텝). CSS transition이 점등 담당. "▶ 다시 재생" 버튼 제공. 끝나면 `markVisit()`.
- ponytail: 트리 레이아웃은 하드코딩 lane + 날짜 매핑. 정밀 rAF·자동 리레이아웃 없음.

- [ ] **Step 1: `web/issue.html` 작성**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>이슈 타임라인 · 싱크탱크</title><link rel="stylesheet" href="styles.css"></head>
<body><main id="root"></main>
<script src="data.js"></script>
<script type="module">
import { DB, NOW, qs, byId, scenariosOfIssue, dnum, starCount, lastVisit, markVisit, el, mountNav } from './app.js';
mountNav('dashboard');
const root = document.getElementById('root');
const issue = byId(DB.issues, qs('id'));
const SVGNS = 'http://www.w3.org/2000/svg';
const W = 860, LANE_H = 56;

if (!issue) { root.append(el('p',{class:'empty'},'이슈를 찾을 수 없음')); }
else {
  root.append(el('div',{class:'crumb'}, `대시보드 › ${issue.title}`));
  root.append(el('h1',{}, issue.title));
  root.append(el('p',{}, issue.summary));
  root.append(el('a',{href:`submit.html?issue=${issue.id}`,class:'btn'},'+ 시나리오 제출'));

  const scen = scenariosOfIssue(issue.id);
  if (!scen.length) { root.append(el('p',{class:'empty',style:'margin-top:20px'},'아직 분기 없음. 첫 시나리오를 제출해 보세요.')); }
  else {
    const lanes = scen.map(s=>s.treeLane);
    const laneMin = Math.min(...lanes), laneMax = Math.max(...lanes);
    const H = (laneMax - laneMin + 2) * LANE_H;
    const minD = Math.min(...scen.map(s=>dnum(s.createdAt))), maxD = dnum(NOW);
    const xOf = s => 60 + (maxD===minD ? 0 : (dnum(s.createdAt)-minD)/(maxD-minD)) * (W-120);
    const yOf = s => (s.treeLane - laneMin + 1) * LANE_H;
    const realizedAll = scen.some(s=>s.realizedAt);
    if (!realizedAll) root.append(el('p',{class:'crumb'},'아직 현실화된 분기 없음 — 전부 후보로 표시됩니다.'));

    // 슬라이더 + 재생 버튼
    const slider = el('input',{type:'range', min:String(minD), max:String(maxD), value:String(maxD), step:String(24*3600*1000), style:'flex:1'});
    const cursorLabel = el('span',{class:'crumb'});
    const replay = el('button',{class:'btn ghost'},'▶ 다시 재생');
    root.append(el('div',{style:'display:flex;align-items:center;gap:12px;margin:16px 0 4px'}, ['시점', slider, replay, cursorLabel]));

    const wrap = el('div',{class:'treewrap'});
    const svg = document.createElementNS(SVGNS,'svg');
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('width','100%');
    wrap.append(svg); root.append(wrap);

    const isRealized = (s,cur) => s.realizedAt && dnum(s.realizedAt) <= cur;

    function shownAt(cur) {
      const vis = scen.filter(s => dnum(s.createdAt) <= cur);
      const find = id => vis.find(s=>s.id===id);
      const depthCache = {};
      function depth(s){
        if (s.id in depthCache) return depthCache[s.id];
        let d;
        if (isRealized(s,cur)) d = 0;
        else { const p = s.parentScenarioId && find(s.parentScenarioId); d = p ? 1 + depth(p) : 1; }
        return depthCache[s.id] = d;
      }
      let kept = vis.filter(s => depth(s) <= 2);
      // 비현실 형제 star 상위 2개만
      const keep = new Set(kept.filter(s=>isRealized(s,cur)).map(s=>s.id));
      const groups = {};
      kept.filter(s=>!isRealized(s,cur)).forEach(s=>{ const k=s.parentScenarioId||'root'; (groups[k]=groups[k]||[]).push(s); });
      for (const k in groups) groups[k].sort((a,b)=>starCount(b)-starCount(a)).slice(0,2).forEach(s=>keep.add(s.id));
      kept = kept.filter(s=>keep.has(s.id));
      // 부모가 잘린 노드는 고아 방지로 제거
      const ids = new Set(kept.map(s=>s.id));
      return kept.filter(s => !s.parentScenarioId || ids.has(s.parentScenarioId) || !find(s.parentScenarioId));
    }

    function render(cur) {
      cursorLabel.textContent = new Date(cur).toISOString().slice(0,10);
      svg.textContent = '';
      const shown = shownAt(cur);
      const ids = new Set(shown.map(s=>s.id));
      // 엣지
      for (const s of shown) {
        if (s.parentScenarioId && ids.has(s.parentScenarioId)) {
          const p = byId(DB.scenarios, s.parentScenarioId);
          const line = document.createElementNS(SVGNS,'line');
          line.setAttribute('x1',xOf(p)); line.setAttribute('y1',yOf(p));
          line.setAttribute('x2',xOf(s)); line.setAttribute('y2',yOf(s));
          const trunk = isRealized(s,cur) && isRealized(p,cur);
          line.setAttribute('class','tedge');
          line.setAttribute('stroke', trunk ? 'var(--realized)' : 'var(--dim)');
          line.setAttribute('stroke-width', trunk ? '3' : '1.5');
          svg.append(line);
        }
      }
      // 노드
      for (const s of shown) {
        const g = document.createElementNS(SVGNS,'g');
        g.setAttribute('class', 'tnode' + (isRealized(s,cur) ? '' : ' dim'));
        const c = document.createElementNS(SVGNS,'circle');
        c.setAttribute('cx',xOf(s)); c.setAttribute('cy',yOf(s)); c.setAttribute('r','8');
        c.setAttribute('fill', isRealized(s,cur) ? 'var(--realized)' : 'none');
        c.setAttribute('stroke','var(--accent)'); c.setAttribute('stroke-width','2');
        const t = document.createElementNS(SVGNS,'text');
        t.setAttribute('x',xOf(s)); t.setAttribute('y',yOf(s)-14); t.setAttribute('text-anchor','middle');
        t.textContent = `${s.title} ★${starCount(s)}`;
        g.append(c,t);
        g.addEventListener('click',()=>{ location.href = `scenario.html?id=${s.id}`; });
        svg.append(g);
      }
    }

    render(maxD);
    slider.addEventListener('input', () => render(Number(slider.value)));

    function animate() {
      const prev = lastVisit() || '2026-04-01';
      const p = dnum(prev);
      if (p >= maxD) { render(maxD); slider.value = String(maxD); markVisit(); return; }
      const steps = 12, dt = (maxD - p) / steps; let i = 0;
      const timer = setInterval(() => {
        i++; const cur = i >= steps ? maxD : p + dt*i;
        slider.value = String(Math.round(cur)); render(cur);
        if (i >= steps) { clearInterval(timer); markVisit(); }
      }, 130);
    }
    replay.addEventListener('click', () => { localStorage.setItem('lastVisit','2026-04-01'); animate(); });
    animate();
  }
}
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

- `issue.html?id=i1` — 열면 커서가 2026-04-01→07-23 스윕(약 1.5초), s1→s2 강조 줄기 점등. 최종: s1·s2 진하게(줄기), s3·s6·s8·s9 흐리게 표시, **s7(star 6, 형제 star 하위) 숨김**, **s10(depth 3) 숨김**. 노드 클릭 → `scenario.html?id=`.
- 슬라이더를 2026-04-15로 내리면 s2(realizedAt 05-20) 미현실(흐림), 06월 생성 노드 숨김. "▶ 다시 재생"으로 애니 재생.
- `issue.html?id=i3` — "아직 현실화된 분기 없음" 안내, s5·s11 전부 흐림.
- `issue.html?id=i4` — "아직 분기 없음" 빈 상태, 슬라이더 없음.

- [ ] **Step 3: 커밋**

```bash
git add web/issue.html
git commit -m "feat: 이슈 타임라인 트리 그래프 — 슬라이더·애니·가지치기, 빈 상태"
```

---

### Task 4: 시나리오 제출 폼

**Files:** Create: `web/submit.html`

**Interfaces:** Consumes `DB, qs, byId, scenariosOfIssue, el, mountNav`. 제출은 목.

- [ ] **Step 1: `web/submit.html` 작성**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>시나리오 제출 · 싱크탱크</title><link rel="stylesheet" href="styles.css"></head>
<body><main id="root"></main>
<script src="data.js"></script>
<script type="module">
import { DB, qs, byId, scenariosOfIssue, el, mountNav } from './app.js';
mountNav('dashboard');
const root = document.getElementById('root');
const issue = byId(DB.issues, qs('issue'));
if (!issue) { root.append(el('p',{class:'empty'},'이슈 없음')); }
else {
  root.append(el('div',{class:'crumb'},`대시보드 › ${issue.title} › 시나리오 제출`));
  root.append(el('h1',{},'시나리오 제출'));
  const parentSel = el('select',{}, [ el('option',{value:''},'(최상위 — 부모 없음)'),
    ...scenariosOfIssue(issue.id).map(s => el('option',{value:s.id}, s.title)) ]);
  const title = el('input',{placeholder:'시나리오 제목',style:'width:100%;margin:6px 0'});
  const bodyT = el('textarea',{placeholder:'시나리오 설명',rows:'4',style:'width:100%;margin:6px 0'});
  const rat = el('textarea',{placeholder:'분기 근거',rows:'3',style:'width:100%;margin:6px 0'});
  const form = el('div',{class:'card'}, [
    el('label',{},'부모 시나리오(선택)'), parentSel,
    el('label',{},'제목'), title, el('label',{},'설명'), bodyT, el('label',{},'근거'), rat,
    el('button',{class:'btn', onclick:() => {
      if (!title.value.trim()) { alert('제목을 입력하세요'); return; }
      alert('(목) 제출됨 — 영속 저장이 없어 트리에 실제 추가되진 않습니다. 이슈로 돌아갑니다.');
      location.href = `issue.html?id=${issue.id}`;
    }},'제출')
  ]);
  form.querySelectorAll('label').forEach(l => l.style.display='block');
  root.append(form);
}
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

`submit.html?issue=i1` — 부모 드롭다운에 i1 시나리오, 제목 빈 채 제출 → 경고, 입력 후 제출 → alert 후 `issue.html?id=i1` 복귀.

- [ ] **Step 3: 커밋**

```bash
git add web/submit.html
git commit -m "feat: 시나리오 제출 폼 (목 제출)"
```

---

### Task 5: 시나리오 토론 (star·모더레이션·반영 토글·편집)

**Files:** Create: `web/scenario.html`

**Interfaces:** Consumes `DB, qs, byId, childrenOf, el, mountNav, toggleStar, isStarred, starCount, isReflected, setReflected, setEdit, applyEdit, moderate`.

- [ ] **Step 1: `web/scenario.html` 작성**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>시나리오 토론 · 싱크탱크</title><link rel="stylesheet" href="styles.css"></head>
<body><main id="root"></main>
<script src="data.js"></script>
<script type="module">
import { DB, qs, byId, childrenOf, el, mountNav, toggleStar, isStarred, starCount, isReflected, setReflected, setEdit, applyEdit, moderate } from './app.js';
mountNav('dashboard');
const root = document.getElementById('root');
const raw = byId(DB.scenarios, qs('id'));
if (!raw) { root.append(el('p',{class:'empty'},'시나리오 없음')); }
else {
  const s = applyEdit(raw);   // 편집 반영본
  const issue = byId(DB.issues, s.issueId);
  const parent = s.parentScenarioId ? byId(DB.scenarios, s.parentScenarioId) : null;
  root.append(el('div',{class:'crumb'}, `대시보드 › ${issue.title}`));
  if (parent) root.append(el('div',{class:'crumb'}, ['분기 출처: ', el('a',{href:`scenario.html?id=${parent.id}`}, parent.title)]));

  const h = el('h1',{}, s.title); root.append(h);
  // star (지지) — realizedAt/reflected와 독립
  const starEl = el('span',{class:'star'}, `${isStarred(raw)?'★':'☆'} ${starCount(raw)}`);
  starEl.addEventListener('click',()=>{ toggleStar(raw.id); starEl.textContent = `${isStarred(raw)?'★':'☆'} ${starCount(raw)}`; });
  root.append(el('div',{style:'margin:4px 0 12px'}, [starEl, s.realizedAt ? el('span',{class:'badge heat-low',style:'margin-left:10px'}, `현실화 ${s.realizedAt}`) : el('span',{class:'badge',style:'margin-left:10px'},'미현실')]));

  const body = el('p',{}, s.body); root.append(body);
  root.append(el('div',{class:'card'}, [ el('strong',{},'토론 요약'), el('p',{style:'margin:6px 0 0'}, s.discussionSummary) ]));
  root.append(el('div',{class:'card'}, [ el('strong',{},'근거'), el('p',{style:'margin:6px 0 0'}, s.rationale) ]));

  // 지도 반영 토글 (reflected)
  let refd = isReflected(raw);
  const refBtn = el('button',{class:'btn ' + (refd?'on':'ghost')}, refd?'지도 반영됨 ✓':'지도에 반영');
  if (!raw.mapLocation) { refBtn.disabled = true; refBtn.textContent = '지도 좌표 없음 — 반영 불가(목)'; refBtn.className = 'btn ghost'; }
  else refBtn.addEventListener('click',()=>{ refd=!refd; setReflected(raw.id,refd); refBtn.textContent = refd?'지도 반영됨 ✓':'지도에 반영'; refBtn.className='btn '+(refd?'on':'ghost'); });
  root.append(el('div',{style:'margin:12px 0'}, refBtn));

  // 인라인 편집 (목 → localStorage → 지도·분석 반영)
  const editWrap = el('div',{class:'card',style:'display:none'});
  const eTitle = el('input',{value:s.title,style:'width:100%;margin:6px 0'});
  const eBody = el('textarea',{rows:'4',style:'width:100%;margin:6px 0'}); eBody.value = s.body;
  editWrap.append(el('strong',{},'시나리오 편집(목)'), eTitle, eBody,
    el('button',{class:'btn',onclick:()=>{ setEdit(raw.id,{title:eTitle.value,body:eBody.value}); h.textContent=eTitle.value; body.textContent=eBody.value; editWrap.style.display='none'; }},'저장'));
  const editBtn = el('button',{class:'btn ghost',onclick:()=>{ editWrap.style.display = editWrap.style.display==='none'?'block':'none'; }},'✎ 편집');
  root.append(editBtn, editWrap);

  // 코멘트 (모더레이션 마스킹)
  root.append(el('h2',{},'토론'));
  const cs = DB.comments.filter(c => c.scenarioId === raw.id);
  if (!cs.length) root.append(el('p',{class:'empty'},'아직 코멘트 없음'));
  cs.forEach(c => root.append(el('div',{class:'card'}, [ el('strong',{},c.author), el('span',{class:'crumb'},` · ${c.ts}`), el('p',{style:'margin:6px 0 0'}, moderate(c.body)) ])));

  // 하위 분기
  const kids = childrenOf(raw.id);
  if (kids.length) { root.append(el('h2',{},'여기서 분기된 시나리오'));
    kids.forEach(k => root.append(el('div',{class:'card'}, el('a',{href:`scenario.html?id=${k.id}`}, k.title)))); }
}
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

- `scenario.html?id=s2` — breadcrumb "분기 출처: 규제 전면 확대", 토론 요약·근거 박스, 현실화 배지(2026-05-20). star 클릭 시 ☆↔★ 카운트 변화. "지도 반영됨 ✓"(s2 reflected true) 토글. ✎ 편집 → 본문 수정·저장 → 즉시 반영.
- `scenario.html?id=s3` — 코멘트 c3의 "젠장" → "**" 마스킹. mapLocation 없어 반영 버튼 비활성. 하위 분기 s9.
- `scenario.html?id=s1` — 하위 분기 s2·s3.

- [ ] **Step 3: 커밋**

```bash
git add web/scenario.html
git commit -m "feat: 시나리오 토론 — star, 모더레이션, 반영 토글, 인라인 편집"
```

---

### Task 6: 디지털 트윈 지도

**Files:** Create: `web/map.html`

**Interfaces:** Consumes `DB, NOW, el, mountNav, isReflected, applyEdit`. 핫스팟 = `isReflected` 시나리오.

- [ ] **Step 1: `web/map.html` 작성**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>디지털 트윈 지도 · 싱크탱크</title><link rel="stylesheet" href="styles.css">
<style>.mapwrap{position:relative} .hot{cursor:pointer} .hot circle{fill:var(--accent);opacity:.85} .hot:hover circle{fill:#fff}</style></head>
<body><main>
<div style="display:flex;align-items:center;gap:12px">
  <h1 style="margin-right:auto">디지털 트윈 지도</h1>
  <span class="badge heat-low" id="sync"></span>
</div>
<p class="crumb">지도 반영된(reflected) 시나리오를 확인 → AI 분석 실행</p>
<div class="mapwrap treewrap"><svg viewBox="0 0 600 320" width="100%" id="map">
  <rect x="0" y="0" width="600" height="320" fill="#0b1526"/>
  <path d="M40,120 Q120,60 220,100 T420,90 T560,140 L560,240 Q400,220 260,250 T40,230 Z" fill="#16243a" stroke="#233047"/>
</svg></div>
<div id="panel" style="margin-top:16px"></div>
</main>
<script src="data.js"></script>
<script type="module">
import { DB, NOW, el, mountNav, isReflected, applyEdit } from './app.js';
mountNav('map');
document.getElementById('sync').textContent = `현실 동기화: ${NOW} (목)`;
const svg = document.getElementById('map'), panel = document.getElementById('panel');
const SVGNS='http://www.w3.org/2000/svg';
const spots = DB.scenarios.filter(s => isReflected(s) && s.mapLocation).map(applyEdit);
if (!spots.length) panel.append(el('p',{class:'empty'},'아직 지도에 반영된 시나리오 없음. 토론 화면에서 "지도에 반영"을 켜세요.'));
function select(s){
  panel.innerHTML='';
  panel.append(el('div',{class:'card'}, [
    el('h3',{}, s.title), el('div',{class:'crumb'}, s.mapLocation.label),
    el('div',{class:'card'}, [ el('strong',{},'토론 요약'), el('p',{style:'margin:6px 0 0'}, s.discussionSummary) ]),
    el('div',{class:'card'}, [ el('strong',{},'근거'), el('p',{style:'margin:6px 0 0'}, s.rationale) ]),
    el('a',{href:`analysis.html?id=${s.id}`,class:'btn'},'AI 분석 실행 →')
  ]));
}
spots.forEach(s => {
  const g = document.createElementNS(SVGNS,'g'); g.setAttribute('class','hot');
  const c = document.createElementNS(SVGNS,'circle'); c.setAttribute('cx',s.mapLocation.x); c.setAttribute('cy',s.mapLocation.y); c.setAttribute('r','8');
  const t = document.createElementNS(SVGNS,'text'); t.setAttribute('x',s.mapLocation.x+12); t.setAttribute('y',s.mapLocation.y+4);
  t.setAttribute('fill','#e6ecf5'); t.setAttribute('font-size','12'); t.textContent=s.title;
  g.append(c,t); g.addEventListener('click',()=>select(s)); svg.append(g);
});
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

`map.html` — "현실 동기화: 2026-07-23 (목)" 배지. 반영 시나리오(s1·s2·s4) 핫스팟. 클릭 → 패널에 토론 요약+근거+"AI 분석 실행" → `analysis.html?id=`. Task 5에서 s2 반영 끄면 s2 핫스팟 사라짐(localStorage 병합). 빈 상태는 콘솔 `localStorage.setItem('reflected',JSON.stringify({s1:false,s2:false,s4:false}))` 후 새로고침, `localStorage.removeItem('reflected')`로 복구.

- [ ] **Step 3: 커밋**

```bash
git add web/map.html
git commit -m "feat: 디지털 트윈 지도 — reflected 핫스팟, 요약·근거 패널, 동기화 배지"
```

---

### Task 7: AI 분석 뷰

**Files:** Create: `web/analysis.html`

**Interfaces:** Consumes `DB, qs, byId, el, mountNav, applyEdit`. 편집 반영된 본문 기준.

- [ ] **Step 1: `web/analysis.html` 작성**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI 분석 · 싱크탱크</title><link rel="stylesheet" href="styles.css"></head>
<body><main id="root"></main>
<script src="data.js"></script>
<script type="module">
import { DB, qs, byId, el, mountNav, applyEdit } from './app.js';
mountNav('map');
const root = document.getElementById('root');
const raw = byId(DB.scenarios, qs('id'));
if (!raw) { root.append(el('p',{class:'empty'},'시나리오 없음')); }
else {
  const s = applyEdit(raw);
  root.append(el('div',{class:'crumb'}, [ el('a',{href:'map.html'},'지도'), ' › AI 분석' ]));
  root.append(el('h1',{}, `AI 분석: ${s.title}`));
  root.append(el('p',{class:'crumb'}, s.body));
  const loading = el('p',{class:'empty'},'AI 분석 중…'); root.append(loading);
  const a = DB.analyses.find(x => x.scenarioId === raw.id);
  setTimeout(() => {
    loading.remove();
    if (!a) { root.append(el('p',{class:'empty'},'(목) 이 시나리오의 분석 데이터 없음')); return; }
    const labels = { political:'정치', economic:'경제', military:'군사', civilian:'민간' };
    const grid = el('div',{class:'lens-grid'});
    for (const key of ['political','economic','military','civilian'])
      grid.append(el('div',{class:'card'}, [ el('h3',{},labels[key]), el('p',{style:'margin:6px 0 0'}, a.lenses[key]) ]));
    root.append(grid);
  }, 700);
}
</script></body></html>
```

- [ ] **Step 2: 전체 흐름 검증 + 커밋**

- `analysis.html?id=s1` — "분석 중…" 0.7초 후 정치·경제·군사·민간 2×2. 상단에 편집 반영된 본문. `analysis.html?id=s3`(분석 없음, 직접 URL) — "분석 데이터 없음".
- 전체 관통: 대시보드 → i1 타임라인(애니·슬라이더) → s1 토론(star·편집·반영) → 지도(요약·근거) → 분석. nav로 대시보드/지도 이동.

```bash
git add web/analysis.html
git commit -m "feat: AI 분석 4관점 뷰 (편집 반영)"
```

---

## Self-Review 결과

- **스펙 커버리지:** 6화면 + 공용 셸 = Task 2~7 + Task 1. 두 층 분리(star/realizedAt/reflected 독립), 타임라인 트리(슬라이더·애니·가지치기), 토론 요약·근거, 모더레이션, 편집→반영, 결정 흐름(현실화 줄기 강조) 모두 태스크에 존재. 빈 상태(빈 트리 i4, 현실화0 i3, 지도 반영0) 검증 포함.
- **플레이스홀더:** 없음 — 전 화면 실제 코드.
- **타입 정합:** `stars`, `createdAt/realizedAt`, `treeLane`, `reflected`, `mapLocation{x,y,label}`, `lenses{political,economic,military,civilian}` — data.js·check-data·화면 전반 일치. 헬퍼명(`toggleStar/isStarred/starCount/isReflected/setReflected/setEdit/applyEdit/moderate/lastVisit/markVisit/dnum` 등) Task1 정의와 Task2~7 사용 일치.
- **3상태 독립 확인:** star=토론 화면 토글·트리 가지치기, realizedAt=트리 강조(하드코딩), reflected=지도 핫스팟·토론 화면 토글. 지도 기준은 reflected 단일 — 혼동 없음.
- **범위:** 목업 단일 계획으로 적정. 화면 5(별도 지도-반영-편집) 삭제해 토론 화면에 병합(과설계 제거). 트리는 하드코딩 lane+날짜 매핑, 라이브러리·줌/팬 없음.

