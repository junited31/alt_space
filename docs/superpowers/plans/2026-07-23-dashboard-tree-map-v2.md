# 대시보드 통합 트리 + 지도 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드를 단일 통합 트리(채택 스파인 + 이슈 팁 + 선택 시 시나리오 서브트리)로, 지도를 이슈 핀 + 이슈별 시나리오 선택(근거·영향·결과)으로 재설계한다.

**Architecture:** 순수 HTML/CSS/바닐라 JS, SVG 직접 렌더. 대시보드는 개요 트리(스파인+팁, 스윕 애니)와 선택 서브트리(별도 SVG, NOW 기준 v1 기하)를 좌표계 분리로 구성. 지도는 이슈 핀 + 네이티브 radio 선택 + localStorage(`tt:mapChoice`) 지속.

**Tech Stack:** HTML5, CSS3, 바닐라 JS(ES modules), Node(check-data), Playwright(e2e).

## Global Constraints

- 순수 HTML/CSS/바닐라 JS. 빌드·프레임워크·번들러·그래프 라이브러리 **금지**. `python3 -m http.server`로 검증(`file://` 금지 — ES module CORS).
- `web/data.js`는 classic `<script src>` → **`export` 금지**, `window.DB`만. ES `export`는 `web/app.js`만.
- `DB.now = '2026-07-23'` 고정. 모든 `realizedAt`은 `createdAt` 이상·`DB.now` 이하(경계 포함, check-data가 `>=`/`<=`).
- 상태 지속은 localStorage, 키 네임스페이스 `tt:`.
- 세 상태 독립: `star`(지지·트리 가지치기) / `realizedAt`(트리 강조·채택) / `mapChoice`(지도 선택). `reflected`는 v2에서 제거.
- 지도 viewBox `0 0 600 320`. issue `mapLocation.x` ∈ 0..600, `y` ∈ 0..320(유한수).
- 자동 테스트: `test/check-data.mjs`(node assert) + `test/e2e.mjs`(Playwright). `npm test`로 둘 다 실행.

---

### Task 1: 데이터 모델 + 헬퍼 + 무결성 체크

**Files:**
- Modify: `web/data.js` (issues에 mapLocation, scenarios에 impact/outcome 추가·reflected/mapLocation 제거)
- Modify: `web/app.js` (getMapChoice/setMapChoice 추가, setReflected/isReflected 제거)
- Modify: `test/check-data.mjs` (신규 불변식)

**Interfaces:**
- Produces (`web/data.js`, `window.DB`): issues `{id,title,summary,sources[],traffic,heat, mapLocation:{x,y,label}}`; scenarios `{id,issueId,parentScenarioId|null,title,body,rationale,discussionSummary,stars,createdAt,realizedAt|null,treeLane, impact, outcome}` (reflected·mapLocation 없음); comments·analyses 불변.
- Produces (`web/app.js`, ES export 추가): `getMapChoice(issueId) → scenarioId|null` (저장값이 그 이슈 시나리오에 없으면 null), `setMapChoice(issueId, scenarioId)`. **제거**: `setReflected`, `isReflected`.

- [ ] **Step 1: check-data.mjs 갱신 (실패하도록)**

`test/check-data.mjs` 전체를 아래로 교체:
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
const scenById = id => DB.scenarios.find(s => s.id === id);
assert.equal(issueIds.size, DB.issues.length, '이슈 id 유일');
assert.equal(scenIds.size, DB.scenarios.length, '시나리오 id 유일');
assert.equal(new Set(DB.comments.map(c => c.id)).size, DB.comments.length, '코멘트 id 유일');

for (const i of DB.issues) {
  const m = i.mapLocation;
  assert.ok(m, `${i.id} mapLocation 필수`);
  assert.ok(Number.isFinite(m.x) && m.x >= 0 && m.x <= 600, `${i.id} mapLocation.x 0..600`);
  assert.ok(Number.isFinite(m.y) && m.y >= 0 && m.y <= 320, `${i.id} mapLocation.y 0..320`);
  assert.ok(typeof m.label === 'string' && m.label.length, `${i.id} mapLocation.label 문자열`);
}

const parentOf = id => scenById(id)?.parentScenarioId;
const chainLen = s => { const seen = new Set([s.id]); let n = 1, p = s.parentScenarioId; while (p) { assert.ok(!seen.has(p), `순환 참조 체인: ${p}`); seen.add(p); n++; p = parentOf(p); } return n; };

for (const s of DB.scenarios) {
  assert.ok(issueIds.has(s.issueId), `${s.id} issueId 유효`);
  assert.ok(s.parentScenarioId !== s.id, `${s.id} 자기 부모 금지`);
  if (s.parentScenarioId !== null) {
    assert.ok(scenIds.has(s.parentScenarioId), `${s.id} 부모 유효`);
    assert.equal(scenById(s.parentScenarioId).issueId, s.issueId, `${s.id} 부모 동일 이슈`);
  }
  chainLen(s);
  assert.equal(typeof s.stars, 'number', `${s.id} stars 숫자`);
  assert.equal(typeof s.treeLane, 'number', `${s.id} treeLane 숫자`);
  assert.ok(typeof s.impact === 'string' && s.impact.length, `${s.id} impact 문자열`);
  assert.ok(typeof s.outcome === 'string' && s.outcome.length, `${s.id} outcome 문자열`);
  if (s.realizedAt) {
    assert.ok(dnum(s.realizedAt) >= dnum(s.createdAt), `${s.id} realizedAt>=createdAt`);
    assert.ok(dnum(s.realizedAt) <= dnum(DB.now), `${s.id} realizedAt<=now`);
  }
}
for (const c of DB.comments) assert.ok(scenIds.has(c.scenarioId), `코멘트 ${c.id} scenarioId 유효`);
for (const a of DB.analyses) {
  assert.ok(scenIds.has(a.scenarioId), `분석 ${a.scenarioId} 유효`);
  for (const lens of ['political','economic','military','civilian'])
    assert.ok(a.lenses[lens], `분석 ${a.scenarioId} ${lens} 존재`);
}
assert.ok(DB.scenarios.some(s => chainLen(s) >= 4), 'depth≥3 트리 존재');
assert.ok(DB.comments.some(c => DB.badwords.some(w => c.body.includes(w))), '금지어 코멘트 샘플');
assert.ok(DB.issues.some(i => DB.scenarios.every(s => s.issueId !== i.id)), '빈 트리 이슈 존재');
assert.ok(DB.issues.some(i => { const ss = DB.scenarios.filter(s => s.issueId === i.id); return ss.length && ss.every(s => !s.realizedAt); }), 'realizedAt 전부 null 이슈');
assert.ok(DB.scenarios.some(s => s.realizedAt), '현실화 시나리오 존재(스파인 시연)');

console.log('check-data OK');
```

- [ ] **Step 2: 실패 확인**

Run: `node test/check-data.mjs`
Expected: FAIL — 아직 data.js에 mapLocation/impact/outcome 없음(단언 실패).

- [ ] **Step 3: `web/data.js` 교체**

`web/data.js` 전체를 아래로 교체:
```js
window.DB = {
  now: '2026-07-23',
  badwords: ['젠장', '바보', '멍청'],
  issues: [
    { id: 'i1', title: '반도체 수출 규제 확대', summary: '주요국의 첨단 반도체 수출 통제가 공급망 재편을 촉발.', sources: ['news','sns','gov'], traffic: 92000, heat: 'high', mapLocation:{x:430,y:150,label:'동아시아'} },
    { id: 'i2', title: '북극 항로 상용화', summary: '해빙 가속으로 북극 항로 상업 운항 논의 본격화.', sources: ['report','news'], traffic: 31000, heat: 'medium', mapLocation:{x:330,y:55,label:'북극해'} },
    { id: 'i3', title: '중앙은행 디지털화폐(CBDC) 도입', summary: '주요국 CBDC 파일럿 확대 — 아직 현실화된 분기 없음.', sources: ['gov','report'], traffic: 47000, heat: 'medium', mapLocation:{x:150,y:120,label:'유럽·북미'} },
    { id: 'i4', title: '희토류 공급 다변화', summary: '신규 이슈 — 아직 제출된 시나리오 없음.', sources: ['news'], traffic: 8000, heat: 'low', mapLocation:{x:300,y:235,label:'아프리카·남미'} }
  ],
  scenarios: [
    { id:'s1', issueId:'i1', parentScenarioId:null, title:'규제 전면 확대', body:'통제 품목이 성숙 공정까지 확대되는 경로.', rationale:'과거 제재 확대 패턴 + 정책 발언 정황.', discussionSummary:'다수 참여자가 확대 기조에 동의, 산업계 반발을 변수로 지목.', stars:41, createdAt:'2026-01-10', realizedAt:'2026-03-01', treeLane:0, impact:'첨단 반도체 공급망 전반이 재편되고 비동맹국과의 마찰이 확대된다.', outcome:'2026 상반기 통제 품목이 성숙 공정까지 확대되어 역내 투자 압력이 급증했다.' },
    { id:'s2', issueId:'i1', parentScenarioId:'s1', title:'역내 자급 가속', body:'규제 대응으로 역내 생산 내재화가 급진전.', rationale:'보조금 규모·팹 착공 발표.', discussionSummary:'보조금 규모가 결정적이라는 데 합의.', stars:28, createdAt:'2026-03-15', realizedAt:'2026-05-20', treeLane:0, impact:'보조금 경쟁이 심화되고 역내 생산 내재화가 빨라진다.', outcome:'대규모 팹 착공이 발표되며 자급률 목표가 상향됐다.' },
    { id:'s3', issueId:'i1', parentScenarioId:'s1', title:'우회 무역 확산', body:'제3국 경유 우회로 형성.', rationale:'무역 통계 이상 징후.', discussionSummary:'단기 과대평가 우려가 다수.', stars:12, createdAt:'2026-03-20', realizedAt:null, treeLane:-1, impact:'제3국 경유 물류가 늘며 통계 왜곡과 단속 비용이 커진다.', outcome:'후보 단계 — 무역 통계 이상 징후만 관측된다.' },
    { id:'s6', issueId:'i1', parentScenarioId:'s2', title:'팹 국산화 완성', body:'핵심 공정 국산화 완료.', rationale:'착공 팹 가동률 근거.', discussionSummary:'낙관론과 시점 논쟁 병존.', stars:15, createdAt:'2026-06-01', realizedAt:null, treeLane:0, impact:'핵심 공정 자립으로 전략 자율성이 높아지나 초기 단가가 상승한다.', outcome:'후보 단계 — 착공 팹 가동률이 근거로 제시된다.' },
    { id:'s7', issueId:'i1', parentScenarioId:'s2', title:'보조금 축소 역풍', body:'재정 부담으로 보조금 축소.', rationale:'재정 적자 추계.', discussionSummary:'지지 낮음.', stars:6, createdAt:'2026-06-05', realizedAt:null, treeLane:1, impact:'재정 부담 논쟁이 커지며 투자 계획이 지연될 수 있다.', outcome:'후보 단계 — 재정 적자 추계가 논거로 쓰인다.' },
    { id:'s8', issueId:'i1', parentScenarioId:'s2', title:'수출 반등', body:'우회 수요로 수출 반등.', rationale:'선적 데이터 반등.', discussionSummary:'중간 지지.', stars:22, createdAt:'2026-06-10', realizedAt:null, treeLane:2, impact:'우회 수요로 단기 수출이 반등하나 지속성은 불확실하다.', outcome:'후보 단계 — 선적 데이터 반등이 관측된다.' },
    { id:'s9', issueId:'i1', parentScenarioId:'s3', title:'제3국 제재 확대', body:'우회로 차단 위한 제재 확대.', rationale:'제재 명단 확대 정황.', discussionSummary:'가능성 중간.', stars:9, createdAt:'2026-05-01', realizedAt:null, treeLane:-1, impact:'우회로 차단을 위한 제재 명단이 늘며 교역 위축이 우려된다.', outcome:'후보 단계 — 제재 명단 확대 정황이 있다.' },
    { id:'s10', issueId:'i1', parentScenarioId:'s9', title:'글로벌 통제망 형성', body:'다자 통제 레짐 성립.', rationale:'다자 협의체 논의.', discussionSummary:'장기·불확실.', stars:3, createdAt:'2026-06-15', realizedAt:null, treeLane:-2, impact:'다자 통제 레짐이 성립하면 공급망 블록화가 고착된다.', outcome:'후보 단계 — 다자 협의체 논의가 초기 수준이다.' },
    { id:'s4', issueId:'i2', parentScenarioId:null, title:'항로 조기 상용화', body:'2030 이전 정기 상업 운항.', rationale:'쇄빙선 발주·보험 상품 출시.', discussionSummary:'조기 상용화에 무게.', stars:19, createdAt:'2026-02-01', realizedAt:'2026-04-10', treeLane:0, impact:'운송 거리 단축으로 물류비가 절감되나 연안 환경 리스크가 커진다.', outcome:'2026 상반기 쇄빙선 발주와 보험 상품 출시로 정기 운항이 앞당겨졌다.' },
    { id:'s5', issueId:'i3', parentScenarioId:null, title:'리테일 CBDC 우선', body:'개인 대상 CBDC 우선 확산.', rationale:'파일럿 대상·한도.', discussionSummary:'리테일 우선론 우세.', stars:15, createdAt:'2026-02-15', realizedAt:null, treeLane:0, impact:'개인 결제 환경이 바뀌고 상업은행 예금 이탈 우려가 제기된다.', outcome:'후보 단계 — 파일럿 대상·한도가 논의 중이다.' },
    { id:'s11', issueId:'i3', parentScenarioId:'s5', title:'홀세일 우선 반론', body:'기관 간 결제부터 도입.', rationale:'결제 인프라 우선순위.', discussionSummary:'소수 지지.', stars:8, createdAt:'2026-04-01', realizedAt:null, treeLane:1, impact:'기관 간 결제 인프라부터 정비되며 도입 속도가 완만해진다.', outcome:'후보 단계 — 결제 인프라 우선순위가 논거다.' }
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

- [ ] **Step 5: `web/app.js` — reflected 헬퍼 제거, mapChoice 헬퍼 추가**

`web/app.js`에서 아래 두 줄(reflected 블록)을 **삭제**:
```js
// reflected: 지도 표시. 토론 화면 토글.
export function setReflected(id, v) { const o = _get('reflected'); o[id] = v; _set('reflected', o); }
export function isReflected(s) { const o = _get('reflected'); return s.id in o ? o[s.id] : s.reflected; }
```
그 자리에 아래를 삽입(주석 라인 포함):
```js
// mapChoice: 지도에서 이슈별 선택한 시나리오. 저장값이 그 이슈 시나리오에 없으면 무시.
export function getMapChoice(issueId) { const id = _get('mapChoice')[issueId]; return (id && scenariosOfIssue(issueId).some(s => s.id === id)) ? id : null; }
export function setMapChoice(issueId, scenarioId) { const o = _get('mapChoice'); o[issueId] = scenarioId; _set('mapChoice', o); }
```

- [ ] **Step 6: 커밋**

```bash
git add web/data.js web/app.js test/check-data.mjs
git commit -m "feat(v2): 데이터 모델 확장 — issue.mapLocation·scenario.impact/outcome, mapChoice 헬퍼, reflected 제거"
```

---

### Task 2: 대시보드 (`index.html`) — 개요 트리 + 선택 서브트리

**Files:**
- Modify: `web/index.html` (전체 재작성)
- Modify: `web/styles.css` (트리 팁 상태 스타일 추가)

**Interfaces:**
- Consumes (`web/app.js`): `DB, NOW, qs, byId, scenariosOfIssue, dnum, starCount, lastVisit, markVisit, setVisit, el, mountNav, activate`.

- [ ] **Step 1: `web/styles.css` — 팁 상태 스타일 추가**

`web/styles.css` 끝에 아래를 추가:
```css
/* 대시보드 이슈 팁 */
.tnode.tip text { font-size:12px; }
.tnode.tip.sel circle { fill:var(--accent); }
.tnode.tip.sel text { fill:var(--fg); font-weight:700; }
```

- [ ] **Step 2: `web/index.html` 재작성**

`web/index.html` 전체를 아래로 교체:
```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>대시보드 · 싱크탱크</title><link rel="stylesheet" href="styles.css"></head>
<body><main id="root"></main>
<script src="data.js"></script>
<script type="module">
import { DB, NOW, qs, byId, scenariosOfIssue, dnum, starCount, lastVisit, markVisit, setVisit, el, mountNav, activate } from './app.js';
mountNav('dashboard');
const root = document.getElementById('root');
const SVGNS = 'http://www.w3.org/2000/svg';
const W = 860, LANE_H = 56;

root.append(el('h1', {}, '채택된 결정 흐름'));
root.append(el('p', { class:'crumb' }, '지난 접속 이후 채택(현실화)된 결정이 트리로 뻗어나갑니다. 오른쪽 이슈를 선택하면 시나리오 분기를 볼 수 있습니다.'));

// ---- 개요: 스파인(현실화 시나리오) + 이슈 팁 ----
const realized = DB.scenarios.filter(s => s.realizedAt)
  .sort((a,b) => dnum(a.realizedAt)-dnum(b.realizedAt) || dnum(a.createdAt)-dnum(b.createdAt) || (a.id < b.id ? -1 : 1));
const maxD = dnum(NOW);
const minR = realized.length ? Math.min(...realized.map(s=>dnum(s.realizedAt))) : maxD;
const REPLAY_START = realized.length ? new Date(minR).toISOString().slice(0,10) : '2026-01-01';
const spineY = 90, xLeft = 60, xNow = W - 220, tipX = W - 90, tipGap = 46;
const issues = DB.issues;
const xOfR = s => xLeft + (maxD===minR ? 0 : (dnum(s.realizedAt)-minR)/(maxD-minR)) * (xNow-xLeft);
const tipY = idx => spineY + (idx - (issues.length-1)/2) * tipGap;
const OV_H = Math.max(200, spineY + (issues.length/2)*tipGap + 40);

const slider = el('input',{type:'range', min:String(minR), max:String(maxD), value:String(maxD), step:String(24*3600*1000), style:'flex:1', 'aria-label':'채택 시점 커서'});
slider.id = 'timeline-cursor';
const cursorLabel = el('span',{class:'crumb','aria-live':'polite'});
const replay = el('button',{class:'btn ghost'},'▶ 다시 재생');
root.append(el('div',{style:'display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:16px 0 4px'},
  [el('label',{for:'timeline-cursor'},'시점'), slider, replay, cursorLabel]));

const ovWrap = el('div',{class:'treewrap'});
const ovSvg = document.createElementNS(SVGNS,'svg');
ovSvg.setAttribute('viewBox',`0 0 ${W} ${OV_H}`); ovSvg.setAttribute('width','100%');
ovWrap.append(ovSvg); root.append(ovWrap);

const sub = el('div',{id:'sub',style:'margin-top:16px'});
root.append(sub);

let selectedIssue = null;

function renderOverview(cur) {
  cursorLabel.textContent = new Date(cur).toISOString().slice(0,10);
  ovSvg.textContent = '';
  const lit = realized.filter(s => dnum(s.realizedAt) <= cur);
  for (let i=1;i<lit.length;i++){
    const a=lit[i-1], b=lit[i], line=document.createElementNS(SVGNS,'line');
    line.setAttribute('x1',xOfR(a));line.setAttribute('y1',spineY);line.setAttribute('x2',xOfR(b));line.setAttribute('y2',spineY);
    line.setAttribute('class','tedge');line.setAttribute('stroke','var(--realized)');line.setAttribute('stroke-width','3');
    ovSvg.append(line);
  }
  for (const s of realized) {
    const on = dnum(s.realizedAt) <= cur;
    const g=document.createElementNS(SVGNS,'g'); g.setAttribute('class','tnode'+(on?'':' dim'));
    const c=document.createElementNS(SVGNS,'circle');
    c.setAttribute('cx',xOfR(s));c.setAttribute('cy',spineY);c.setAttribute('r','7');
    c.setAttribute('fill',on?'var(--realized)':'none');c.setAttribute('stroke','var(--accent)');c.setAttribute('stroke-width','2');
    const t=document.createElementNS(SVGNS,'text');
    t.setAttribute('x',xOfR(s));t.setAttribute('y',spineY-12);t.setAttribute('text-anchor','middle');
    t.textContent = s.title;
    g.append(c,t); ovSvg.append(g);
  }
  issues.forEach((iss,idx)=>{
    const ty=tipY(idx), sel=selectedIssue===iss.id;
    const line=document.createElementNS(SVGNS,'line');
    line.setAttribute('x1',xNow);line.setAttribute('y1',spineY);line.setAttribute('x2',tipX);line.setAttribute('y2',ty);
    line.setAttribute('class','tedge');line.setAttribute('stroke','var(--dim)');line.setAttribute('stroke-width','1.5');
    ovSvg.append(line);
    const g=document.createElementNS(SVGNS,'g');
    g.setAttribute('class','tnode tip'+(sel?' sel':''));
    g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-expanded',String(sel));
    g.setAttribute('aria-label',`${iss.title} 시나리오 열기`);
    const c=document.createElementNS(SVGNS,'circle');
    c.setAttribute('cx',tipX);c.setAttribute('cy',ty);c.setAttribute('r','9');
    c.setAttribute('fill',sel?'var(--accent)':'none');c.setAttribute('stroke','var(--accent)');c.setAttribute('stroke-width','2');
    const t=document.createElementNS(SVGNS,'text');
    t.setAttribute('x',tipX-14);t.setAttribute('y',ty+4);t.setAttribute('text-anchor','end');
    t.textContent = iss.title;
    g.append(c,t); activate(g, ()=>selectIssue(iss.id)); ovSvg.append(g);
  });
}

function selectIssue(id){
  selectedIssue = id;
  renderOverview(Number(slider.value));
  renderSub(id);
}

function renderSub(id){
  sub.textContent='';
  const issue = byId(DB.issues, id);
  sub.append(el('div',{class:'crumb'}, `선택된 이슈: ${issue.title}`));
  sub.append(el('a',{href:`submit.html?issue=${issue.id}`,class:'btn'},'+ 시나리오 제출'));
  const scen = scenariosOfIssue(id);
  if (!scen.length) { sub.append(el('p',{class:'empty',style:'margin-top:16px'},'아직 분기 없음 — 첫 시나리오를 제출해 보세요.')); return; }
  if (!scen.some(s=>s.realizedAt)) sub.append(el('p',{class:'crumb'},'아직 현실화된 분기 없음 — 전부 후보로 표시됩니다.'));

  const lanes = scen.map(s=>s.treeLane);
  const laneMin = Math.min(...lanes), laneMax = Math.max(...lanes);
  const H = (laneMax - laneMin + 2) * LANE_H;
  const minD = Math.min(...scen.map(s=>dnum(s.createdAt))), cur = maxD;
  const xOf = s => 60 + (cur===minD ? 0 : (dnum(s.createdAt)-minD)/(cur-minD)) * (W-120);
  const yOf = s => (s.treeLane - laneMin + 1) * LANE_H;
  const isReal = s => s.realizedAt && dnum(s.realizedAt) <= cur;

  const vis = scen.filter(s => dnum(s.createdAt) <= cur);
  const find = id2 => vis.find(s=>s.id===id2);
  const depthCache = {};
  function depth(s){ if (s.id in depthCache) return depthCache[s.id]; let d; if (isReal(s)) d=0; else { const p = s.parentScenarioId && find(s.parentScenarioId); d = p ? 1+depth(p) : 1; } return depthCache[s.id]=d; }
  let kept = vis.filter(s => depth(s) <= 2);
  const keep = new Set(kept.filter(s=>isReal(s)).map(s=>s.id));
  const groups = {};
  kept.filter(s=>!isReal(s)).forEach(s=>{ const k=s.parentScenarioId||'root'; (groups[k]=groups[k]||[]).push(s); });
  for (const k in groups) groups[k].sort((a,b)=>starCount(b)-starCount(a)).slice(0,2).forEach(s=>keep.add(s.id));
  kept = kept.filter(s=>keep.has(s.id));
  const ids = new Set(kept.map(s=>s.id));
  const shown = kept.filter(s => !s.parentScenarioId || ids.has(s.parentScenarioId) || !find(s.parentScenarioId));

  const wrap = el('div',{class:'treewrap',style:'margin-top:12px'});
  const svg = document.createElementNS(SVGNS,'svg');
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('width','100%');
  const sid = new Set(shown.map(s=>s.id));
  for (const s of shown) {
    if (s.parentScenarioId && sid.has(s.parentScenarioId)) {
      const p = byId(DB.scenarios, s.parentScenarioId), line = document.createElementNS(SVGNS,'line');
      line.setAttribute('x1',xOf(p));line.setAttribute('y1',yOf(p));line.setAttribute('x2',xOf(s));line.setAttribute('y2',yOf(s));
      const trunk = isReal(s) && isReal(p);
      line.setAttribute('class','tedge');line.setAttribute('stroke',trunk?'var(--realized)':'var(--dim)');line.setAttribute('stroke-width',trunk?'3':'1.5');
      svg.append(line);
    }
  }
  for (const s of shown) {
    const g=document.createElementNS(SVGNS,'g'); g.setAttribute('class','tnode'+(isReal(s)?'':' dim'));
    g.setAttribute('tabindex','0');g.setAttribute('role','link');
    g.setAttribute('aria-label',`${s.title}, 지지 ${starCount(s)}${isReal(s)?', 현실화됨':''} — 시나리오 열기`);
    const c=document.createElementNS(SVGNS,'circle');
    c.setAttribute('cx',xOf(s));c.setAttribute('cy',yOf(s));c.setAttribute('r','8');
    c.setAttribute('fill',isReal(s)?'var(--realized)':'none');c.setAttribute('stroke','var(--accent)');c.setAttribute('stroke-width','2');
    const t=document.createElementNS(SVGNS,'text');
    t.setAttribute('x',xOf(s));t.setAttribute('y',yOf(s)-14);t.setAttribute('text-anchor','middle');
    t.textContent = `${s.title} ★${starCount(s)}`;
    g.append(c,t); activate(g, ()=>{ location.href = `scenario.html?id=${s.id}`; }); svg.append(g);
  }
  wrap.append(svg); sub.append(wrap);

  const list = el('div',{style:'margin-top:12px'});
  list.append(el('h3',{},'시나리오 목록'));
  scen.forEach(s => list.append(el('div',{class:'card'},
    el('a',{href:`scenario.html?id=${s.id}`}, `${s.title} ★${starCount(s)}${s.realizedAt?' · 현실화':''}`))));
  sub.append(list);
}

slider.addEventListener('input', () => { stopAnim(); renderOverview(Number(slider.value)); });
let timer = null;
const stopAnim = () => { if (timer) { clearInterval(timer); timer=null; } };
function animate(){
  stopAnim();
  const lv = lastVisit(); const p = (lv && !isNaN(dnum(lv))) ? dnum(lv) : NaN;
  if (isNaN(p) || p >= maxD) { renderOverview(maxD); slider.value = String(maxD); markVisit(); return; }
  const steps = 12, dt = (maxD - p)/steps; let i = 0;
  renderOverview(p); slider.value = String(Math.round(p));
  timer = setInterval(() => { i++; const c = i>=steps ? maxD : p+dt*i; slider.value = String(Math.round(c)); renderOverview(c); if (i>=steps){ stopAnim(); markVisit(); } }, 130);
}
replay.addEventListener('click', () => { setVisit(REPLAY_START); animate(); });
animate();

const qi = qs('issue');
if (qi && byId(DB.issues, qi)) selectIssue(qi);
</script></body></html>
```

- [ ] **Step 3: 브라우저 검증**

Run: `cd web && python3 -m http.server 8080` → `http://localhost:8080/index.html`.
Expected:
- 개요: 스파인에 현실화 s1·s4·s2 점(realizedAt 순 03-01·04-10·05-20), 오른쪽에 이슈 4개 팁(제목 라벨). 첫 방문이면 정적(전체 점등), "▶ 다시 재생"으로 03-01→now 스윕.
- i1 팁 클릭 → 하단에 i1 서브트리(s1·s2 진한 줄기, s3·s6·s8·s9 흐림, s7·s10 숨김) + "시나리오 목록"(전체) + "+ 시나리오 제출". 노드 클릭 → `scenario.html?id=`.
- i3 팁 클릭 → "아직 현실화된 분기 없음" 안내, s5·s11 흐림. i4 팁 클릭 → "아직 분기 없음" 빈 상태.
- `index.html?issue=i1` 진입 → i1 자동 선택.

- [ ] **Step 4: 커밋**

```bash
git add web/index.html web/styles.css
git commit -m "feat(v2): 대시보드 통합 트리 — 채택 스파인·이슈 팁·선택 서브트리·제출"
```

---

### Task 3: 지도 (`map.html`) — 이슈 핀 + 시나리오 선택

**Files:**
- Modify: `web/map.html` (전체 재작성)

**Interfaces:**
- Consumes (`web/app.js`): `DB, NOW, byId, scenariosOfIssue, el, mountNav, activate, applyEdit, getMapChoice, setMapChoice`.

- [ ] **Step 1: `web/map.html` 재작성**

`web/map.html` 전체를 아래로 교체:
```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>디지털 트윈 지도 · 싱크탱크</title><link rel="stylesheet" href="styles.css">
<style>.mapwrap{position:relative} .pin{cursor:pointer} .pin circle{fill:var(--accent);opacity:.55} .pin.sel circle{fill:#fff;opacity:1} .pin:hover circle{fill:#fff}</style></head>
<body><main>
<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px">
  <h1 style="margin-right:auto">디지털 트윈 지도</h1>
  <span class="badge heat-low" id="sync"></span>
</div>
<p class="crumb">현 시점 이슈 핀을 선택해 시나리오를 고르면 근거·영향·결과를 보여줍니다.</p>
<div class="mapwrap treewrap"><svg viewBox="0 0 600 320" width="100%" id="map">
  <rect x="0" y="0" width="600" height="320" fill="#0b1526"/>
  <path d="M40,120 Q120,60 220,100 T420,90 T560,140 L560,240 Q400,220 260,250 T40,230 Z" fill="#16243a" stroke="#233047"/>
</svg></div>
<div id="panel" style="margin-top:16px" aria-live="polite"><p class="crumb">이슈 핀을 선택하세요.</p></div>
</main>
<script src="data.js"></script>
<script type="module">
import { DB, NOW, byId, scenariosOfIssue, el, mountNav, activate, applyEdit, getMapChoice, setMapChoice } from './app.js';
mountNav('map');
document.getElementById('sync').textContent = `현실 동기화: ${NOW} (목)`;
const svg = document.getElementById('map'), panel = document.getElementById('panel');
const SVGNS = 'http://www.w3.org/2000/svg';
let selected = null;

function renderPins(){
  svg.querySelectorAll('.pin').forEach(n => n.remove());
  DB.issues.forEach(iss => {
    const { x, y } = iss.mapLocation;
    const on = selected === iss.id || !!getMapChoice(iss.id);
    const g = document.createElementNS(SVGNS,'g'); g.setAttribute('class','pin'+(on?' sel':''));
    g.setAttribute('tabindex','0'); g.setAttribute('role','button'); g.setAttribute('aria-label',`${iss.title} 상세 보기`);
    const c = document.createElementNS(SVGNS,'circle'); c.setAttribute('cx',x); c.setAttribute('cy',y); c.setAttribute('r','8');
    const t = document.createElementNS(SVGNS,'text'); t.setAttribute('x',x+12); t.setAttribute('y',y+4); t.setAttribute('fill','#e6ecf5'); t.setAttribute('font-size','12'); t.textContent = iss.title;
    g.append(c,t); activate(g, ()=>select(iss.id)); svg.append(g);
  });
}

function select(id){
  selected = id; renderPins();
  const iss = byId(DB.issues, id);
  panel.textContent='';
  const card = el('div',{class:'card'}, [ el('h3',{}, iss.title), el('div',{class:'crumb'}, iss.mapLocation.label) ]);
  const scen = scenariosOfIssue(id);
  if (!scen.length) { card.append(el('p',{class:'empty'},'제출된 시나리오 없음')); panel.append(card); return; }
  const fs = el('fieldset',{style:'border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:8px'});
  fs.append(el('legend',{},'시나리오 선택'));
  const detail = el('div',{});
  const chosen = getMapChoice(id);
  scen.forEach(s => {
    const rid = `sc-${s.id}`;
    const radio = el('input',{type:'radio', id:rid, name:`scenario-${id}`, value:s.id, style:'margin-right:6px'});
    if (chosen === s.id) radio.checked = true;
    radio.addEventListener('change', () => { setMapChoice(id, s.id); renderDetail(s.id); renderPins(); });
    const label = el('label',{for:rid, style:'display:block;margin:4px 0;cursor:pointer'});
    label.append(radio, `${applyEdit(s).title}${s.realizedAt?' · 현실화':''}`);
    fs.append(label);
  });
  card.append(fs, detail);
  panel.append(card);
  function renderDetail(sid){
    detail.textContent='';
    const v = applyEdit(byId(DB.scenarios, sid));
    detail.append(
      el('div',{class:'card'}, [ el('strong',{},'근거'), el('p',{style:'margin:6px 0 0'}, v.rationale) ]),
      el('div',{class:'card'}, [ el('strong',{},'영향'), el('p',{style:'margin:6px 0 0'}, v.impact) ]),
      el('div',{class:'card'}, [ el('strong',{},'결과'), el('p',{style:'margin:6px 0 0'}, v.outcome) ]),
      el('a',{href:`analysis.html?id=${sid}`, class:'btn'}, 'AI 분석 실행 →')
    );
  }
  if (chosen) renderDetail(chosen);
}

renderPins();
</script></body></html>
```

- [ ] **Step 2: 브라우저 검증**

Run: `cd web && python3 -m http.server 8080` → `http://localhost:8080/map.html`.
Expected:
- "현실 동기화: 2026-07-23 (목)" 배지. 이슈 핀 4개(제목 라벨).
- i1 핀 클릭 → 패널에 라디오 시나리오 목록. 하나 선택 → 근거·영향·결과 3박스 + "AI 분석 실행 →"(→ `analysis.html?id=`). 선택된 핀 강조.
- 새로고침 후에도 선택한 이슈 핀 강조 유지(localStorage). 여러 이슈 각각 선택 가능.
- i4 핀 클릭 → "제출된 시나리오 없음". 분석 없는 시나리오(예 s3) 선택 시에도 "AI 분석 실행 →" 링크 존재(→ `analysis.html`의 "분석 데이터 없음").

- [ ] **Step 3: 커밋**

```bash
git add web/map.html
git commit -m "feat(v2): 지도 — 이슈 핀·시나리오 선택(radio)·근거/영향/결과·선택 지속"
```

---

### Task 4: 정리 — scenario 반영 토글 제거, submit 리다이렉트, issue.html 삭제

**Files:**
- Modify: `web/scenario.html` (지도 반영 토글 제거)
- Modify: `web/submit.html` (리다이렉트 대상 변경)
- Delete: `web/issue.html`

**Interfaces:**
- Consumes: 없음(정리 태스크). scenario.html의 import에서 `isReflected, setReflected` 제거.

- [ ] **Step 1: `web/scenario.html` — import·반영 토글 제거**

import 줄에서 `isReflected, setReflected,`를 제거. 즉:
```js
import { DB, qs, byId, childrenOf, el, mountNav, toggleStar, isStarred, starCount, isReflected, setReflected, setEdit, applyEdit, moderate } from './app.js';
```
를 아래로 변경:
```js
import { DB, qs, byId, childrenOf, el, mountNav, toggleStar, isStarred, starCount, setEdit, applyEdit, moderate } from './app.js';
```
그리고 아래 "지도 반영 토글" 블록 전체를 **삭제**:
```js
  // 지도 반영 토글 (reflected)
  let refd = isReflected(raw);
  const refBtn = el('button',{class:'btn ' + (refd?'on':'ghost')}, refd?'지도 반영됨 ✓':'지도에 반영');
  if (!raw.mapLocation) { refBtn.disabled = true; refBtn.textContent = '지도 좌표 없음 — 반영 불가(목)'; refBtn.className = 'btn ghost'; }
  else refBtn.addEventListener('click',()=>{ refd=!refd; setReflected(raw.id,refd); refBtn.textContent = refd?'지도 반영됨 ✓':'지도에 반영'; refBtn.className='btn '+(refd?'on':'ghost'); });
  root.append(el('div',{style:'margin:12px 0'}, refBtn));
```

추가로 breadcrumb를 대시보드 복귀 링크로 개선(v2 흐름: 이슈 선택→서브트리→토론→복귀). 아래 줄:
```js
  root.append(el('div',{class:'crumb'}, `대시보드 › ${issue.title}`));
```
을 아래로 변경:
```js
  root.append(el('div',{class:'crumb'}, [el('a',{href:`index.html?issue=${issue.id}`}, '대시보드'), ` › ${issue.title}`]));
```

- [ ] **Step 2: `web/submit.html` — 리다이렉트 대상 변경**

제출 성공 후 리다이렉트를 대시보드로:
```js
      location.href = `issue.html?id=${issue.id}`;
```
를 아래로 변경:
```js
      location.href = `index.html?issue=${issue.id}`;
```

- [ ] **Step 3: `web/issue.html` 삭제**

```bash
git rm web/issue.html
```

- [ ] **Step 4: 브라우저 검증**

Run: `cd web && python3 -m http.server 8080`.
Expected:
- `scenario.html?id=s2` — star·토론 요약·근거·편집·코멘트 정상, **"지도 반영" 버튼 없음**, breadcrumb "대시보드" 클릭 → `index.html?issue=i1`, 콘솔 에러 없음(import 정상).
- `submit.html?issue=i1` — 제목 입력 후 제출 → alert 후 `index.html?issue=i1`로 이동(대시보드 i1 자동 선택).
- `issue.html` 접근 → 404(삭제됨).

- [ ] **Step 5: 커밋**

```bash
git add web/scenario.html web/submit.html
git commit -m "chore(v2): scenario 지도 반영 토글 제거·submit 리다이렉트 대시보드로·issue.html 삭제"
```

---

### Task 5: 종단 검증 (`test/e2e.mjs`) v2 재작성

**Files:**
- Modify: `web/../test/e2e.mjs` (전체 재작성)

**Interfaces:**
- Consumes: 실행 중인 `web/` 정적 사이트(자체 서버 내장). `npm test`가 `check-data` + `e2e` 실행.

- [ ] **Step 1: `test/e2e.mjs` 재작성**

`test/e2e.mjs` 전체를 아래로 교체:
```js
// 종단(E2E) 스모크 v2 — 대시보드 통합 트리 + 지도 + 유지 화면.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, resolve, relative, isAbsolute } from 'node:path';
import assert from 'node:assert/strict';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = resolve(WEB, '.' + rel);
  const within = relative(WEB, p);
  if (within.startsWith('..') || isAbsolute(within)) { res.writeHead(403); return res.end('forbidden'); }
  try { const body = await readFile(p); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch (e) { if (e.code === 'ENOENT') { res.writeHead(404); res.end('not found'); } else { res.writeHead(500); res.end('server error'); } }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, cond, extra='') => { assert.ok(cond, `${name} FAILED ${extra}`); results.push(`✓ ${name}`); };
const errors = [];

let b;
try {
  b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addInitScript(() => {
    const rawSet = window.setInterval.bind(window), rawClear = window.clearInterval.bind(window);
    const live = new Set(); window.__active = 0; window.__maxActive = 0;
    window.setInterval = (...a) => { const id = rawSet(...a); live.add(id); window.__active = live.size; window.__maxActive = Math.max(window.__maxActive, live.size); return id; };
    window.clearInterval = (id) => { live.delete(id); window.__active = live.size; return rawClear(id); };
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  const clear = () => page.evaluate(() => localStorage.clear());

  // === 대시보드 ===
  // 첫 방문: 정적(스윕 없이) — active 인터벌이 남지 않음
  await page.goto(`${BASE}/index.html`); await clear(); await page.reload();
  await page.waitForSelector('.treewrap svg .tnode.tip');
  const tips = await page.$$('.treewrap svg .tnode.tip');
  check('dash: 이슈 팁 4개', tips.length === 4, `got ${tips.length}`);
  const spinePts = await page.$$eval('.treewrap svg .tnode:not(.tip) circle', els => els.filter(e=>e.getAttribute('fill')==='var(--realized)').length);
  check('dash: 첫 방문 현실화 점 점등(정적)', spinePts >= 3, `got ${spinePts}`);
  check('dash: 첫 방문 후 스윕 타이머 없음', await page.evaluate(()=>window.__active) === 0);

  // 이슈 팁 선택 → 서브트리 + 목록 + 제출
  const i1tip = (await page.$$('.treewrap svg .tnode.tip'))[0];
  await i1tip.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#sub .treewrap svg .tnode'));
  const subTitles = (await page.$$eval('#sub .treewrap svg .tnode text', els=>els.map(e=>e.textContent))).join(' | ');
  check('dash: i1 서브트리 s1·s2 표시', /규제 전면 확대/.test(subTitles) && /역내 자급 가속/.test(subTitles));
  check('dash: i1 서브트리 s7·s10 가지치기', !/보조금 축소 역풍/.test(subTitles) && !/글로벌 통제망/.test(subTitles), subTitles);
  check('dash: 시나리오 목록 존재', (await page.$$eval('#sub h3', els=>els.some(e=>/시나리오 목록/.test(e.textContent)))));
  check('dash: 제출 링크', await page.getAttribute('#sub a.btn', 'href') === 'submit.html?issue=i1');
  check('dash: 팁 aria-expanded=true', await (await page.$$('.treewrap svg .tnode.tip'))[0].getAttribute('aria-expanded') === 'true');
  check('dash: 슬라이더 <label for>', await page.getAttribute('label[for=timeline-cursor]','for') === 'timeline-cursor');
  // 서브트리 노드 키보드 네비게이션 (Enter → 토론)
  const subNode = await page.$('#sub .treewrap svg .tnode');
  await subNode.focus(); await page.keyboard.press('Enter');
  await page.waitForURL(/scenario\.html\?id=/, { timeout: 3000 });
  check('dash: 서브트리 노드 Enter→토론', /scenario\.html\?id=/.test(page.url()), page.url());

  // ?issue= 자동 선택
  await page.goto(`${BASE}/index.html?issue=i1`);
  await page.waitForFunction(() => document.querySelector('#sub .treewrap svg .tnode'));
  check('dash: ?issue=i1 자동 선택', /선택된 이슈: 반도체/.test(await page.textContent('#sub')));

  // i3(현실화 0) · i4(빈) 선택
  await page.goto(`${BASE}/index.html`);
  await page.waitForSelector('.treewrap svg .tnode.tip');
  const tipEls = await page.$$('.treewrap svg .tnode.tip');
  await tipEls[2].click(); // i3
  await page.waitForFunction(() => /현실화된 분기 없음/.test(document.querySelector('#sub')?.textContent || ''));
  check('dash: i3 현실화 0 안내', /현실화된 분기 없음/.test(await page.textContent('#sub')));
  await (await page.$$('.treewrap svg .tnode.tip'))[3].click(); // i4
  await page.waitForFunction(() => /아직 분기 없음/.test(document.querySelector('#sub')?.textContent || ''));
  check('dash: i4 빈 상태', /아직 분기 없음/.test(await page.textContent('#sub')));

  // replay 타이머 겹침 없음 + 스크럽 정지
  await page.goto(`${BASE}/index.html`); await clear(); await page.reload();
  await page.waitForSelector('#timeline-cursor');
  await page.evaluate(() => { window.__maxActive = 0; });
  await page.click('button.btn.ghost'); await page.click('button.btn.ghost'); await page.click('button.btn.ghost');
  check('dash: replay 연타 동시 인터벌 ≤1', await page.evaluate(()=>window.__maxActive) === 1, `max=${await page.evaluate(()=>window.__maxActive)}`);
  await page.waitForFunction(() => window.__active === 0 && document.querySelector('.crumb[aria-live=polite]')?.textContent === '2026-07-23');
  await page.click('button.btn.ghost');
  await page.$eval('#timeline-cursor', s => { s.value = s.min; s.dispatchEvent(new Event('input')); });
  check('dash: 스크럽이 애니 정지(active 0)', await page.evaluate(()=>window.__active) === 0);

  // === 지도 ===
  await page.goto(`${BASE}/map.html`); await clear(); await page.reload();
  await page.waitForSelector('#map .pin');
  check('map: 이슈 핀 4개', (await page.$$('#map .pin')).length === 4);
  check('map: 동기화 배지', /현실 동기화: 2026-07-23 \(목\)/.test(await page.textContent('#sync')));
  const pin0 = (await page.$$('#map .pin'))[0]; // i1 — 핀 키보드 활성화
  await pin0.focus(); await page.keyboard.press('Enter');
  await page.waitForSelector('#panel fieldset input[type=radio]');
  check('map: 핀 키보드(Enter) 패널 오픈', (await page.$$('#panel fieldset input[type=radio]')).length > 0);
  await page.check('#panel input[type=radio][value=s1]');
  await page.waitForSelector('#panel a.btn');
  const pbody = await page.textContent('#panel');
  check('map: 선택 시 근거·영향·결과', /근거/.test(pbody) && /영향/.test(pbody) && /결과/.test(pbody));
  check('map: 분석 링크', await page.getAttribute('#panel a.btn','href') === 'analysis.html?id=s1');
  check('map: 선택 저장(mapChoice)', (await page.evaluate(()=>JSON.parse(localStorage.getItem('tt:mapChoice')||'{}'))).i1 === 's1');
  // 리로드 후 핀 강조 유지
  await page.reload(); await page.waitForSelector('#map .pin.sel');
  check('map: 리로드 후 선택 핀 강조', (await page.$$('#map .pin.sel')).length >= 1);
  // 분석 없는 시나리오(s3)도 링크 제공
  await (await page.$$('#map .pin'))[0].click();
  await page.check('#panel input[type=radio][value=s3]');
  check('map: 분석 없는 s3도 링크', await page.getAttribute('#panel a.btn','href') === 'analysis.html?id=s3');
  // stale 저장값 무시
  await page.evaluate(() => localStorage.setItem('tt:mapChoice', JSON.stringify({ i1:'zzz' })));
  await page.reload(); await page.waitForSelector('#map .pin');
  check('map: stale 저장값 무시(강조 없음)', (await page.$$('#map .pin.sel')).length === 0);
  // i4 빈 상태
  await (await page.$$('#map .pin'))[3].click();
  await page.waitForFunction(() => /제출된 시나리오 없음/.test(document.querySelector('#panel')?.textContent || ''));
  check('map: i4 제출된 시나리오 없음', /제출된 시나리오 없음/.test(await page.textContent('#panel')));

  // === 유지 화면 ===
  // 시나리오 토론: star·모더레이션·편집·반영토글 없음
  await page.goto(`${BASE}/scenario.html?id=s2`); await clear(); await page.reload();
  await page.waitForSelector('button.star');
  check('scenario: 지도 반영 토글 제거', !/지도에 반영|지도 반영됨/.test(await page.textContent('body')));
  await page.click('button.star');
  check('scenario: star aria-pressed 토글', await page.getAttribute('button.star','aria-pressed') === 'true');
  check('scenario: 편집 aria-expanded=false', await page.getAttribute('button[aria-controls=edit-form]','aria-expanded') === 'false');
  await page.click('button[aria-controls=edit-form]');
  check('scenario: 편집 aria-expanded=true', await page.getAttribute('button[aria-controls=edit-form]','aria-expanded') === 'true');
  page.once('dialog', d => d.accept());
  await page.fill('#edit-title', '');
  await page.click('#edit-form button.btn');
  check('scenario: 빈 제목 저장 거부(편집창 유지)', await page.$eval('#edit-form', f => getComputedStyle(f).display) === 'block');
  await page.goto(`${BASE}/scenario.html?id=s3`);
  check('scenario: s3 젠장 마스킹', /\*\*/.test(await page.textContent('body')) && !/젠장/.test(await page.textContent('body')));
  // 제출 폼
  await page.goto(`${BASE}/submit.html?issue=i1`);
  await page.waitForSelector('form.card');
  check('submit: form·라벨', await page.getAttribute('label[for=f-title]','for') === 'f-title');
  // 분석 4렌즈
  await page.goto(`${BASE}/analysis.html?id=s1`);
  await page.waitForSelector('.lens-grid .card', { timeout: 3000 });
  check('analysis: 4 렌즈', (await page.$$('.lens-grid .card')).length === 4);
} finally {
  if (b) await b.close();
  await new Promise(res => server.close(res));
}

console.log(results.join('\n'));
console.log(`\nConsole errors: ${errors.length}`);
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
console.log(`\nALL ${results.length} E2E CHECKS PASSED`);
```

- [ ] **Step 2: 전체 테스트 통과 확인**

Run: `npm test`
Expected: `check-data OK` + 모든 E2E 체크 PASS, `Console errors: 0`.

- [ ] **Step 3: 커밋**

```bash
git add test/e2e.mjs
git commit -m "test(v2): E2E 재작성 — 대시보드 통합 트리·지도 선택·유지 화면"
```

---

## Self-Review 결과

- **스펙 커버리지:** 데이터 모델(Task1) · 대시보드 개요 트리·스윕·서브트리·`?issue=`(Task2) · 지도 핀·radio·근거/영향/결과·지속·stale(Task3) · reflected 제거·submit 라우팅·breadcrumb 링크·issue.html 삭제(Task4) · e2e 재작성(Task5). 스펙의 각 절에 대응 태스크 존재. **유지 화면 회귀**(scenario 편집 aria-expanded·빈 제목 가드·star, 슬라이더 `<label for>`, 서브트리 노드·지도 핀 키보드)도 Task5 e2e에 포함(fable-reviewer must-fix 반영).
- **플레이스홀더:** 없음 — 전 파일 실제 코드. 데이터 값(좌표·impact/outcome) 구체화 완료.
- **타입 정합:** 신규 헬퍼 `getMapChoice/setMapChoice`(Task1 정의) ↔ map.html(Task3) 사용 일치. `impact/outcome`(data.js) ↔ check-data·map.html 일치. import 정리(scenario.html reflected 제거) 반영. 대시보드 서브트리는 v1 가지치기 로직과 동일 시그니처.
- **좌표계 분리:** 개요(xOfR/spineY) 와 서브트리(xOf/yOf) 는 독립 SVG·독립 매핑 — 충돌 없음(스펙 개정 2 반영).
- **범위:** 목업 단일 계획으로 적정. 5 태스크, 각 독립 테스트 가능.
