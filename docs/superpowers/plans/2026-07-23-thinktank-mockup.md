# 싱크탱크 목업 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거시 이슈 → 분기 시나리오 제출 → 토론·채택 → 지도 선택 → AI 4관점 분석까지 전체 흐름을 관통하는 클릭 가능한 정적 목업 구축.

**Architecture:** 순수 HTML/CSS/바닐라 JS, 빌드·프레임워크 없음. 목 데이터는 `data.js` 한 파일에 전역 객체로. 상세/토론/분석 화면은 화면당 정적 파일을 늘리지 않고 단일 템플릿 + `?id=` 쿼리 파라미터로 `data.js`를 렌더. 공용 nav·스타일은 `app.js` / `styles.css`로 공유.

**Tech Stack:** HTML5, CSS3(그리드/플렉스), 바닐라 JS(ES modules), Node(무결성 체크 스크립트만).

## Global Constraints

- 빌드 스텝 없음. 브라우저에서 파일 직접 열거나 `python3 -m http.server`로 서빙.
- 프레임워크·번들러·CSS 프레임워크·그래프 시각화 라이브러리 **금지**.
- 모든 데이터·분석은 목. 실제 수집·LLM·인증·영속 저장 없음.
- 화면당 정적 HTML 파일 증식 금지 — 레코드 화면은 `?id=` 파라미터 + 단일 템플릿.
- 분기 트리는 CSS 들여쓰기로 표현 (라이브러리 없음).
- 파일 배치: 목업 루트는 `web/`. 데이터 `web/data.js`, 공용 로직 `web/app.js`, 스타일 `web/styles.css`, 화면 HTML은 `web/*.html`.
- 무결성 체크: `test/check-data.mjs` (node `assert` 기반, 프레임워크 없음).
- 이슈당 여러 시나리오 채택 허용. 지도 핫스팟 = 채택된 시나리오.

---

### Task 1: 프로젝트 스캐폴드 + 목 데이터 + 무결성 체크

**Files:**
- Create: `web/data.js`
- Create: `web/app.js`
- Create: `web/styles.css`
- Create: `test/check-data.mjs`

**Interfaces:**
- Produces (`web/data.js`, 전역 `window.DB` 및 ES export `DB`):
  - `DB.issues`: `[{ id, title, summary, sources:[], traffic, heat }]`
  - `DB.scenarios`: `[{ id, issueId, parentScenarioId|null, title, body, rationale, votes:{up,down}, adopted:bool, mapLocation:{x,y,label}|null }]`
  - `DB.comments`: `[{ id, scenarioId, author, body, ts }]`
  - `DB.analyses`: `[{ scenarioId, lenses:{ political, economic, military, civilian } }]`
- Produces (`web/app.js`, ES exports): `qs(name)` — URL 쿼리 파라미터 읽기; `el(tag, props, children)` — DOM 헬퍼; `mountNav(active)` — 상단 nav 삽입; `byId(coll, id)`; `childrenOf(scenarioId)`; `scenariosOfIssue(issueId)`.

- [ ] **Step 1: 무결성 체크 테스트 작성 (실패하도록)**

`test/check-data.mjs`:
```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// data.js는 브라우저용이라 window에 붙임. node에서 평가하려고 shim.
const src = readFileSync(new URL('../web/data.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
new Function('window', src)(sandbox.window);
const DB = sandbox.window.DB;

assert.ok(DB, 'DB 존재');
assert.ok(DB.issues.length >= 3, '이슈 3개 이상');

const issueIds = new Set(DB.issues.map(i => i.id));
const scenIds = new Set(DB.scenarios.map(s => s.id));

for (const s of DB.scenarios) {
  assert.ok(issueIds.has(s.issueId), `시나리오 ${s.id}의 issueId 유효`);
  if (s.parentScenarioId !== null)
    assert.ok(scenIds.has(s.parentScenarioId), `시나리오 ${s.id}의 부모 유효`);
  if (s.adopted)
    assert.ok(s.mapLocation, `채택 시나리오 ${s.id}는 mapLocation 필수`);
}
for (const c of DB.comments)
  assert.ok(scenIds.has(c.scenarioId), `코멘트 ${c.id}의 scenarioId 유효`);
for (const a of DB.analyses) {
  assert.ok(scenIds.has(a.scenarioId), `분석 ${a.scenarioId} 유효`);
  for (const lens of ['political','economic','military','civilian'])
    assert.ok(a.lenses[lens], `분석 ${a.scenarioId}에 ${lens} 관점 존재`);
}
// 빈 상태 검증용: 시나리오 0개 이슈, 채택 0개 이슈가 각각 최소 1개
assert.ok(DB.issues.some(i => DB.scenarios.every(s => s.issueId !== i.id)),
  '시나리오 0개 이슈 최소 1개 (빈 상태)');
assert.ok(DB.scenarios.some(s => s.adopted), '채택 시나리오 최소 1개');

console.log('check-data OK');
```

- [ ] **Step 2: 실패 확인**

Run: `node test/check-data.mjs`
Expected: FAIL — `web/data.js` 없음 (`ENOENT` 또는 `DB 존재` assert 실패).

- [ ] **Step 3: `web/data.js` 작성 (목 데이터)**

```js
window.DB = {
  issues: [
    { id: 'i1', title: '반도체 수출 규제 확대', summary: '주요국의 첨단 반도체 수출 통제가 공급망 재편을 촉발.', sources: ['news','sns','gov'], traffic: 92000, heat: 'high' },
    { id: 'i2', title: '북극 항로 상용화', summary: '해빙 가속으로 북극 항로 상업 운항 논의 본격화.', sources: ['report','news'], traffic: 31000, heat: 'medium' },
    { id: 'i3', title: '중앙은행 디지털화폐(CBDC) 도입', summary: '주요국 CBDC 파일럿 확대에 따른 금융질서 변화.', sources: ['gov','report'], traffic: 47000, heat: 'medium' },
    { id: 'i4', title: '희토류 공급 다변화', summary: '신규 이슈 — 아직 제출된 시나리오 없음.', sources: ['news'], traffic: 8000, heat: 'low' }
  ],
  scenarios: [
    { id: 's1', issueId: 'i1', parentScenarioId: null, title: '규제 전면 확대', body: '통제 품목이 성숙 공정까지 확대되는 경로.', rationale: '토론 채택 근거: 과거 제재 확대 패턴 + 정책 발언 정황.', votes: { up: 41, down: 6 }, adopted: true, mapLocation: { x: 300, y: 180, label: '동아시아' } },
    { id: 's2', issueId: 'i1', parentScenarioId: 's1', title: '역내 자급 가속', body: '규제 확대 대응으로 역내 생산 내재화가 급진전.', rationale: '보조금 규모·팹 착공 발표 근거.', votes: { up: 28, down: 9 }, adopted: true, mapLocation: { x: 340, y: 200, label: '한·중·대만' } },
    { id: 's3', issueId: 'i1', parentScenarioId: 's1', title: '우회 무역 확산', body: '제3국 경유 우회로가 형성되는 분기.', rationale: '무역 통계 이상 징후 근거.', votes: { up: 12, down: 15 }, adopted: false, mapLocation: null },
    { id: 's4', issueId: 'i2', parentScenarioId: null, title: '항로 조기 상용화', body: '2030 이전 정기 상업 운항 개시.', rationale: '쇄빙선 발주·보험 상품 출시 근거.', votes: { up: 19, down: 4 }, adopted: true, mapLocation: { x: 400, y: 60, label: '북극해' } },
    { id: 's5', issueId: 'i3', parentScenarioId: null, title: '리테일 CBDC 우선', body: '개인 대상 CBDC가 먼저 확산.', rationale: '파일럿 대상·한도 정책 근거.', votes: { up: 15, down: 11 }, adopted: false, mapLocation: null }
  ],
  comments: [
    { id: 'c1', scenarioId: 's1', author: '분석가_김', body: '정책 발언 타임라인이 이 경로를 지지함.', ts: '2026-07-20' },
    { id: 'c2', scenarioId: 's1', author: '연구원_이', body: '다만 산업계 반발 변수 고려 필요.', ts: '2026-07-21' },
    { id: 'c3', scenarioId: 's3', author: '트레이더_박', body: '우회 무역은 단기엔 과대평가일 수 있음.', ts: '2026-07-22' }
  ],
  analyses: [
    { scenarioId: 's1', lenses: {
      political: '수출 통제 동맹 결속 강화, 비동맹국과 마찰 확대.',
      economic: '단기 공급 충격·가격 상승, 중기 재고 조정.',
      military: '이중용도 부품 통제로 방산 공급망 재정렬.',
      civilian: '전자제품 가격 전가, 고용은 역내 팹 투자로 부분 상쇄.' } },
    { scenarioId: 's2', lenses: {
      political: '산업 정책 주도권 경쟁 심화.',
      economic: '보조금 재정 부담↑, 장기 자급률↑.',
      military: '전략물자 국산화로 자율성 확보.',
      civilian: '지역 고용 창출, 초기 제품 단가 상승.' } },
    { scenarioId: 's4', lenses: {
      political: '북극 연안국 관할권 분쟁 부상.',
      economic: '운송 거리 단축으로 물류비 절감.',
      military: '북극 해군 존재감 경쟁 가속.',
      civilian: '연안 환경 리스크 및 원주민 공동체 영향.' } }
  ]
};
```

- [ ] **Step 4: 통과 확인**

Run: `node test/check-data.mjs`
Expected: PASS — `check-data OK`.

- [ ] **Step 5: `web/app.js` 공용 헬퍼 작성**

```js
export const DB = window.DB;
export const qs = (name) => new URLSearchParams(location.search).get(name);
export const byId = (coll, id) => coll.find(x => x.id === id);
export const scenariosOfIssue = (issueId) => DB.scenarios.filter(s => s.issueId === issueId);
export const childrenOf = (scenarioId) => DB.scenarios.filter(s => s.parentScenarioId === scenarioId);

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

- [ ] **Step 6: `web/styles.css` 기본 스타일 작성**

```css
:root { --bg:#0f1420; --panel:#1a2230; --line:#2b3547; --fg:#e6ecf5; --muted:#8a97ab; --accent:#4f9dff; --heat-high:#ff5c5c; --heat-medium:#ffb84f; --heat-low:#6ee7a8; }
* { box-sizing: border-box; }
body { margin:0; font:15px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--fg); }
a { color:var(--accent); text-decoration:none; }
.topnav { display:flex; align-items:center; gap:18px; padding:12px 20px; background:var(--panel); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:10; }
.topnav a.on { font-weight:700; color:var(--fg); }
.topnav .spacer { flex:1; }
.topnav .userbadge { color:var(--muted); font-size:13px; }
main { max-width:1000px; margin:0 auto; padding:24px 20px; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:12px; }
.badge { display:inline-block; font-size:12px; padding:2px 8px; border-radius:999px; border:1px solid var(--line); color:var(--muted); margin-right:6px; }
.heat-high{color:var(--heat-high);border-color:var(--heat-high);} .heat-medium{color:var(--heat-medium);border-color:var(--heat-medium);} .heat-low{color:var(--heat-low);border-color:var(--heat-low);}
.empty { color:var(--muted); font-style:italic; padding:24px; text-align:center; border:1px dashed var(--line); border-radius:10px; }
.tree { list-style:none; padding-left:0; } .tree ul { list-style:none; border-left:1px solid var(--line); margin-left:10px; padding-left:16px; }
.btn { display:inline-block; background:var(--accent); color:#fff; padding:8px 14px; border-radius:8px; border:none; cursor:pointer; font-size:14px; }
.btn.ghost { background:transparent; color:var(--accent); border:1px solid var(--accent); }
.lens-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.crumb { color:var(--muted); font-size:13px; margin-bottom:8px; }
```

- [ ] **Step 7: 커밋**

```bash
git add web/data.js web/app.js web/styles.css test/check-data.mjs
git commit -m "feat: 목업 스캐폴드 — 목 데이터, 공용 헬퍼, 무결성 체크"
```

---

### Task 2: 이슈 대시보드 (홈)

**Files:**
- Create: `web/index.html`

**Interfaces:**
- Consumes: `DB.issues`, `mountNav`, `el`, `scenariosOfIssue`.

- [ ] **Step 1: `web/index.html` 작성**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>이슈 대시보드 · 싱크탱크</title><link rel="stylesheet" href="styles.css"></head>
<body><main>
<h1>AI 선정 거시 이슈</h1>
<div id="list"></div>
</main>
<script src="data.js"></script>
<script type="module">
import { DB, el, mountNav, scenariosOfIssue } from './app.js';
mountNav('dashboard');
const list = document.getElementById('list');
for (const i of DB.issues) {
  const n = scenariosOfIssue(i.id).length;
  list.append(el('a', { href: `issue.html?id=${i.id}`, class: 'card', style:'display:block;color:inherit' }, [
    el('div', {}, [ el('span', { class:`badge heat-${i.heat}` }, i.heat), ...i.sources.map(s => el('span',{class:'badge'},s)) ]),
    el('h3', { style:'margin:8px 0 4px' }, i.title),
    el('p', { class:'crumb', style:'margin:0 0 8px' }, i.summary),
    el('div', { class:'crumb' }, `트래픽 ${i.traffic.toLocaleString()} · 시나리오 ${n}개`)
  ]));
}
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

Run: `cd web && python3 -m http.server 8080` 후 `http://localhost:8080/index.html` 열기.
Expected: 이슈 4개 카드, heat 색 배지, 시나리오 개수(i4는 0개) 표시. 카드 클릭 → `issue.html?id=` 이동.

- [ ] **Step 3: 커밋**

```bash
git add web/index.html
git commit -m "feat: 이슈 대시보드 화면"
```

---

### Task 3: 이슈 상세 + 분기 트리

**Files:**
- Create: `web/issue.html`

**Interfaces:**
- Consumes: `DB`, `qs`, `byId`, `scenariosOfIssue`, `childrenOf`, `el`, `mountNav`.

- [ ] **Step 1: `web/issue.html` 작성**

들여쓰기 트리는 재귀 렌더. 부모가 `null`인 시나리오를 루트로, `childrenOf`로 하위를 중첩 `<ul>`.

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>이슈 상세 · 싱크탱크</title><link rel="stylesheet" href="styles.css"></head>
<body><main id="root"></main>
<script src="data.js"></script>
<script type="module">
import { DB, qs, byId, scenariosOfIssue, childrenOf, el, mountNav } from './app.js';
mountNav('dashboard');
const root = document.getElementById('root');
const issue = byId(DB.issues, qs('id'));
if (!issue) { root.append(el('p',{class:'empty'},'이슈를 찾을 수 없음')); }
else {
  root.append(el('div',{class:'crumb'},'대시보드 › 이슈'));
  root.append(el('h1',{},issue.title));
  root.append(el('p',{},issue.summary));
  root.append(el('a',{href:`submit.html?issue=${issue.id}`,class:'btn'},'+ 시나리오 제출'));
  root.append(el('h2',{style:'margin-top:24px'},'분기 시나리오'));
  const roots = scenariosOfIssue(issue.id).filter(s => !s.parentScenarioId);
  if (!roots.length) { root.append(el('p',{class:'empty'},'아직 제출된 시나리오 없음. 첫 분기를 제출해 보세요.')); }
  else {
    const render = (s) => {
      const li = el('li',{style:'margin:6px 0'}, [
        el('a',{href:`scenario.html?id=${s.id}`}, s.title),
        s.adopted ? el('span',{class:'badge heat-low',style:'margin-left:8px'},'채택') : '',
        el('span',{class:'crumb',style:'margin-left:8px'}, `▲${s.votes.up} ▼${s.votes.down}`)
      ]);
      const kids = childrenOf(s.id);
      if (kids.length) { const ul = el('ul',{}); kids.forEach(k => ul.append(render(k))); li.append(ul); }
      return li;
    };
    const ul = el('ul',{class:'tree'}); roots.forEach(s => ul.append(render(s))); root.append(ul);
  }
}
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

`issue.html?id=i1` — s1 아래 s2·s3 들여쓰기 트리, 채택 배지. `issue.html?id=i4` — 빈 상태 문구. `issue.html?id=zzz` — "찾을 수 없음".

- [ ] **Step 3: 커밋**

```bash
git add web/issue.html
git commit -m "feat: 이슈 상세 + 분기 트리 + 빈 상태"
```

---

### Task 4: 시나리오 제출 폼

**Files:**
- Create: `web/submit.html`

**Interfaces:**
- Consumes: `DB`, `qs`, `byId`, `scenariosOfIssue`, `el`, `mountNav`. 제출은 목 — 저장 없이 알림 후 이슈로 복귀.

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
      alert('(목) 제출됨 — 실제 저장은 다음 단계. 이슈로 돌아갑니다.');
      location.href = `issue.html?id=${issue.id}`;
    }},'제출')
  ]);
  form.querySelectorAll('label').forEach(l => l.style.display='block');
  root.append(form);
}
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

`submit.html?issue=i1` — 부모 드롭다운에 i1 시나리오들, 제목 빈 채 제출 → 경고, 입력 후 제출 → 알림 후 `issue.html?id=i1` 복귀.

- [ ] **Step 3: 커밋**

```bash
git add web/submit.html
git commit -m "feat: 시나리오 제출 폼 (목 제출)"
```

---

### Task 5: 시나리오 토론

**Files:**
- Create: `web/scenario.html`

**Interfaces:**
- Consumes: `DB`, `qs`, `byId`, `childrenOf`, `el`, `mountNav`. 코멘트는 `DB.comments` 필터. 투표·채택 버튼은 목(로컬 상태만).

- [ ] **Step 1: `web/scenario.html` 작성**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>시나리오 토론 · 싱크탱크</title><link rel="stylesheet" href="styles.css"></head>
<body><main id="root"></main>
<script src="data.js"></script>
<script type="module">
import { DB, qs, byId, childrenOf, el, mountNav } from './app.js';
mountNav('dashboard');
const root = document.getElementById('root');
const s = byId(DB.scenarios, qs('id'));
if (!s) { root.append(el('p',{class:'empty'},'시나리오 없음')); }
else {
  const issue = byId(DB.issues, s.issueId);
  const parent = s.parentScenarioId ? byId(DB.scenarios, s.parentScenarioId) : null;
  root.append(el('div',{class:'crumb'}, `대시보드 › ${issue.title}`));
  if (parent) root.append(el('div',{class:'crumb'}, [ '분기 출처: ', el('a',{href:`scenario.html?id=${parent.id}`}, parent.title) ]));
  root.append(el('h1',{}, s.title));
  let adopted = s.adopted;
  const status = el('span',{class:'badge heat-low'}, adopted ? '채택됨' : '검토중');
  root.append(el('div',{}, [ status, ' ',
    el('button',{class:'btn ghost',onclick:(e)=>{ adopted=!adopted; status.textContent = adopted?'채택됨':'검토중'; e.target.textContent = adopted?'채택 취소':'채택으로 표시'; }}, adopted?'채택 취소':'채택으로 표시') ]));
  root.append(el('p',{}, s.body));
  root.append(el('div',{class:'card'}, [ el('strong',{},'정리된 근거'), el('p',{style:'margin:6px 0 0'}, s.rationale) ]));
  // 투표
  let up=s.votes.up, down=s.votes.down;
  const vlabel = el('span',{class:'crumb'}, `▲${up} ▼${down}`);
  root.append(el('div',{style:'margin:12px 0'}, [
    el('button',{class:'btn ghost',onclick:()=>{up++;vlabel.textContent=`▲${up} ▼${down}`;}},'▲ 찬성'), ' ',
    el('button',{class:'btn ghost',onclick:()=>{down++;vlabel.textContent=`▲${up} ▼${down}`;}},'▼ 반대'), ' ', vlabel ]));
  // 코멘트 (평면)
  root.append(el('h2',{},'토론'));
  const cs = DB.comments.filter(c => c.scenarioId === s.id);
  if (!cs.length) root.append(el('p',{class:'empty'},'아직 코멘트 없음'));
  cs.forEach(c => root.append(el('div',{class:'card'}, [ el('strong',{},c.author), el('span',{class:'crumb'},` · ${c.ts}`), el('p',{style:'margin:6px 0 0'},c.body) ])));
  // 하위 분기
  const kids = childrenOf(s.id);
  if (kids.length) { root.append(el('h2',{},'여기서 분기된 시나리오'));
    kids.forEach(k => root.append(el('div',{class:'card'}, el('a',{href:`scenario.html?id=${k.id}`}, k.title)))); }
}
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

`scenario.html?id=s2` — "분기 출처: 규제 전면 확대" breadcrumb, 근거 박스, 투표 버튼 증가, 채택 토글. `scenario.html?id=s1` — 하위 분기 s2·s3 목록. `scenario.html?id=s5` — 코멘트 빈 상태.

- [ ] **Step 3: 커밋**

```bash
git add web/scenario.html
git commit -m "feat: 시나리오 토론 — breadcrumb, 투표, 채택 토글, 코멘트, 하위 분기"
```

---

### Task 6: 디지털 트윈 지도

**Files:**
- Create: `web/map.html`

**Interfaces:**
- Consumes: `DB`, `el`, `mountNav`. 채택 시나리오(`adopted && mapLocation`)만 핫스팟. 선택 → 패널 → "AI 분석 실행" → `analysis.html?id=`.

- [ ] **Step 1: `web/map.html` 작성 (SVG 플레이스홀더 지도)**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>디지털 트윈 지도 · 싱크탱크</title><link rel="stylesheet" href="styles.css">
<style>.mapwrap{position:relative;background:#0b1526;border:1px solid var(--line);border-radius:10px}
.hot{cursor:pointer} .hot circle{fill:var(--accent);opacity:.85} .hot:hover circle{fill:#fff}
.panel{margin-top:16px}</style></head>
<body><main>
<h1>디지털 트윈 지도</h1>
<p class="crumb">채택된 시나리오를 지도에서 선택 → AI 분석 실행</p>
<div class="mapwrap"><svg viewBox="0 0 600 320" width="100%" id="map">
  <rect x="0" y="0" width="600" height="320" fill="#0b1526"/>
  <path d="M40,120 Q120,60 220,100 T420,90 T560,140 L560,240 Q400,220 260,250 T40,230 Z" fill="#16243a" stroke="#233047"/>
</svg></div>
<div id="panel" class="panel"></div>
</main>
<script src="data.js"></script>
<script type="module">
import { DB, el, mountNav } from './app.js';
mountNav('map');
const svg = document.getElementById('map');
const panel = document.getElementById('panel');
const spots = DB.scenarios.filter(s => s.adopted && s.mapLocation);
if (!spots.length) panel.append(el('p',{class:'empty'},'아직 채택된 시나리오 없음. 토론에서 시나리오를 채택하면 지도에 표시됩니다.'));
const SVGNS='http://www.w3.org/2000/svg';
function select(s){
  panel.innerHTML='';
  panel.append(el('div',{class:'card'},[
    el('h3',{},s.title),
    el('div',{class:'crumb'}, s.mapLocation.label),
    el('p',{}, s.body),
    el('a',{href:`analysis.html?id=${s.id}`,class:'btn'},'AI 분석 실행 →')
  ]));
}
spots.forEach(s => {
  const g = document.createElementNS(SVGNS,'g'); g.setAttribute('class','hot');
  const c = document.createElementNS(SVGNS,'circle');
  c.setAttribute('cx',s.mapLocation.x); c.setAttribute('cy',s.mapLocation.y); c.setAttribute('r','8');
  const t = document.createElementNS(SVGNS,'text');
  t.setAttribute('x',s.mapLocation.x+12); t.setAttribute('y',s.mapLocation.y+4);
  t.setAttribute('fill','#e6ecf5'); t.setAttribute('font-size','12'); t.textContent=s.title;
  g.append(c,t); g.addEventListener('click',()=>select(s)); svg.append(g);
});
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

`map.html` — 채택 시나리오(s1,s2,s4) 핫스팟 표시, 클릭 시 패널에 상세 + "AI 분석 실행" 버튼 → `analysis.html?id=` 이동. (임시로 data.js에서 채택 전부 false로 바꿔 빈 상태도 1회 확인 후 되돌리기.)

- [ ] **Step 3: 커밋**

```bash
git add web/map.html
git commit -m "feat: 디지털 트윈 지도 — SVG 핫스팟, 선택 패널, 분석 진입"
```

---

### Task 7: AI 분석 뷰

**Files:**
- Create: `web/analysis.html`

**Interfaces:**
- Consumes: `DB`, `qs`, `byId`, `el`, `mountNav`. `DB.analyses`에서 4관점. 분석 없으면 목 생성 문구. "분석 중" 로딩 연출 후 결과.

- [ ] **Step 1: `web/analysis.html` 작성**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI 분석 · 싱크탱크</title><link rel="stylesheet" href="styles.css"></head>
<body><main id="root"></main>
<script src="data.js"></script>
<script type="module">
import { DB, qs, byId, el, mountNav } from './app.js';
mountNav('map');
const root = document.getElementById('root');
const s = byId(DB.scenarios, qs('id'));
if (!s) { root.append(el('p',{class:'empty'},'시나리오 없음')); }
else {
  root.append(el('div',{class:'crumb'},[ el('a',{href:'map.html'},'지도'), ' › AI 분석' ]));
  root.append(el('h1',{}, `AI 분석: ${s.title}`));
  const loading = el('p',{class:'empty'},'AI 분석 중…');
  root.append(loading);
  const a = DB.analyses.find(x => x.scenarioId === s.id);
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

- [ ] **Step 2: 브라우저 검증**

`analysis.html?id=s1` — "분석 중…" 0.7초 후 정치·경제·군사·민간 2×2 그리드. `analysis.html?id=s3`(분석 없음) — 목 데이터 없음 문구.

- [ ] **Step 3: 전체 흐름 클릭 검증 + 커밋**

전체 흐름 1회 관통: 대시보드 → i1 → s1 토론 → 지도 → s1 선택 → 분석. nav로 대시보드/지도 상호 이동.

```bash
git add web/analysis.html
git commit -m "feat: AI 분석 4관점 뷰 + 로딩 연출"
```

---

## Self-Review 결과

- **스펙 커버리지:** 6화면 + 공용 셸 = Task 2~7 + Task 1(셸/데이터). 빈 상태(이슈 시나리오0=i4, 지도 채택0 검증), 분기 트리, 채택 트리거, 화면 전환 진입점 모두 태스크에 존재.
- **플레이스홀더:** 없음 — 모든 화면 실제 코드 포함.
- **타입 정합:** `mapLocation{x,y,label}`, `votes{up,down}`, `lenses{political,economic,military,civilian}` — data.js·check-data·화면 전반 일치. 헬퍼명(`scenariosOfIssue`,`childrenOf`,`byId`,`qs`,`el`,`mountNav`) 정의(Task1)와 사용(Task2~7) 일치.
- **범위:** 목업 단일 계획으로 적정. out-of-scope(인증·대댓글·GIS·라이브러리) 제외 유지.
