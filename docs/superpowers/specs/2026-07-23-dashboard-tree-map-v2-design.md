# 대시보드 통합 트리 + 지도 v2 설계 스펙

**작성일:** 2026-07-23
**대상:** 싱크탱크 목업 (정적 HTML/CSS/바닐라 JS)
**선행:** `2026-07-23-thinktank-mockup-design.md`(v1) 위에 대시보드·지도 재설계

## 목표

- **대시보드(첫 화면)**: 지난 접속 시점 → 현재 시점까지 **채택(현실화)되며 뻗어나가는 단일 통합 트리**를 보여준다. 첫 접속이면 현재 시점 전체 트리를 정적으로 보여준다. 트리 오른쪽 끝(현재)에 현 시점 이슈들이 가지 팁으로 달리고, 이슈를 선택하면 그 가지가 시나리오로 분기해 목록을 보고 제출할 수 있다.
- **지도**: 평면 세계 지도에 현 시점 이슈들을 핀으로 배치하고, 이슈마다 시나리오를 선택(모든 이슈에 선택하지 않아도 됨)해 **근거·영향·결과**를 보여준다.

## Global Constraints (v1에서 계승)

- 순수 HTML/CSS/바닐라 JS, 빌드·프레임워크·그래프 라이브러리 없음. SVG 직접 렌더.
- `python3 -m http.server`로 서빙(ES module CORS로 `file://` 불가).
- `web/data.js`는 classic `<script src>` → `export` 금지, `window.DB`만. ES export는 `web/app.js`만.
- `DB.now = '2026-07-23'` 고정. 모든 `realizedAt`은 `createdAt` 이후·`DB.now` 이전.
- 상태 지속은 localStorage 오버라이드(키 네임스페이스 `tt:`).
- 무결성 체크 `test/check-data.mjs`(node assert), 종단 검증 `test/e2e.mjs`(Playwright), CI/Pages 자동.

## 범위

**변경**
- `web/index.html` — 이슈 카드 리스트 → **단일 통합 트리 + 이슈 팁 + 선택 시 분기·시나리오 목록·제출**로 전면 재작성.
- `web/map.html` — 시나리오 `reflected` 핫스팟 → **이슈 핀 + 이슈별 시나리오 선택 + 근거·영향·결과**로 재작성.
- `web/data.js` — 필드 확장/정리(§ 데이터 모델).
- `web/app.js` — 헬퍼 추가/정리.
- `web/scenario.html` — "지도 반영" 토글 제거(나머지 유지).
- `test/check-data.mjs`, `test/e2e.mjs` — 신동작 검증으로 갱신.

**삭제**
- `web/issue.html` — 대시보드에 흡수(대체).

**유지**
- `web/submit.html`(제출), `web/analysis.html`(AI 4관점 분석), `web/scenario.html`(토론)의 나머지 기능.

## 데이터 모델 (`web/data.js`)

### issues — `mapLocation` 추가
각 이슈에 평면 세계지도 좌표 추가. 지도 viewBox `0 0 600 320` 기준.
```
{ id, title, summary, sources[], traffic, heat, mapLocation:{ x, y, label } }
```
- 4개 이슈 전부에 좌표 부여(라벨 = 지역명).

### scenarios — `impact`·`outcome` 추가, `reflected`·`mapLocation` 제거
```
{ id, issueId, parentScenarioId|null, title, body, rationale,
  discussionSummary, stars, createdAt, realizedAt|null, treeLane,
  impact, outcome }          // + impact(영향)·outcome(결과) 신규
```
- 근거 = 기존 `rationale` 재사용. **영향 = `impact`**, **결과 = `outcome`**(모든 시나리오에 텍스트 부여).
- `reflected`·`mapLocation`은 **제거**(새 지도가 이슈→시나리오 선택으로 대체). `star`(지지)·`realizedAt`(채택/트리 강조)는 유지.

### 상태(localStorage, `tt:` 네임스페이스)
- 기존: `tt:stars`, `tt:edits`, `tt:lastVisit`.
- **신규: `tt:mapChoice`** = `{ [issueId]: scenarioId }` — 지도에서 이슈별 선택한 시나리오.
- **제거: `tt:reflected`**.

## `web/app.js` 헬퍼

**추가**
- `setMapChoice(issueId, scenarioId)` / `getMapChoice(issueId)` — `tt:mapChoice` 읽기·쓰기(오버라이드).

**제거**
- `setReflected` / `isReflected`.

**유지**
- `DB, NOW, qs, byId, scenariosOfIssue, childrenOf, dnum, el, mountNav, activate, toggleStar, isStarred, starCount, setEdit, applyEdit, lastVisit, markVisit, setVisit, moderate`.

## 대시보드 (`web/index.html`)

### 트리 구조
- **x = 시간축**: [모든 시나리오 min createdAt, `DB.now`] → 픽셀 선형 매핑. 오른쪽 끝 = 현재(now).
- **공유 채택 스파인**: 화면 세로 중앙의 **단일 수평선**. 모든 이슈에 걸친 현실화 시나리오(`realizedAt` 존재)를 `realizedAt` 순서로 그 선 위 점으로 찍어 이어붙인 줄기 = "채택되며 뻗어나가는" 흐름. 진한 강조 스타일.
- **이슈 팁(오른쪽 끝, now)**: 현 시점 이슈 1개 = 팁 노드 1개. 스파인 오른쪽 끝에서 각 이슈 팁으로 팬아웃(가지), 팁들은 세로로 나란히 배치(각기 다른 y). 라벨 = 이슈 제목.

### 애니메이션(스윕)
- **재방문**(`lastVisit()` 존재하고 `< now`): 커서를 `lastVisit → now`로 이산 스윕(약 12스텝, setInterval 단일 타이머 관리 — v1 개선 계승). 그 사이 `realizedAt`이 `lastVisit..now`인 채택 점이 순차 점등, CSS transition이 담당. 끝나면 `markVisit()`.
- **첫 방문**(`lastVisit()`이 null): 현재 시점 전체 트리 정적 표시(스윕 없음) 후 `markVisit()`.
- "▶ 다시 재생" 버튼: `setVisit(과거 시점)` 후 스윕 재생. 수동 슬라이더 조작 시 스윕 정지(타이머 계측 회귀 계승).

### 이슈 선택 → 분기
- 이슈 팁 클릭(마우스+키보드, `activate`):
  - 그 이슈의 시나리오 서브트리가 팁에서 뻗어나감(부모/자식 = `parentScenarioId`, `treeLane`; 채택=진한 줄기, 후보=흐림; 가지치기 규칙은 v1 계승 — 현실화 기준 depth≤2, 부모별 비현실 형제 starCount 상위 2개).
  - **패널**(트리 하단, 트리 폭 확보): 그 이슈의 시나리오 목록. 각 항목 클릭 → `scenario.html?id=`(토론). 상단에 "**+ 시나리오 제출**" → `submit.html?issue=`.
  - 빈 이슈(시나리오 0, 예: i4): "아직 분기 없음 — 첫 시나리오를 제출해 보세요" + 제출 버튼.
- 접근성: 이슈 팁·시나리오 노드는 `tabindex=0`, `role`, `aria-label`, Enter/Space 활성화(v1 계승).

## 지도 (`web/map.html`)

- 기존 평면 세계지도 SVG 배경 유지. 동기화 배지 `현실 동기화: {NOW} (목)` 유지.
- **이슈 핀**: 모든 이슈를 `issue.mapLocation`에 핀으로 표시(라벨 = 이슈 제목). 핀은 클릭·키보드 활성화(`activate`, `role=button`, `aria-label`).
- **핀 클릭 → 패널**:
  - 그 이슈의 시나리오 **선택 목록**(라디오/버튼). 선택 시 `setMapChoice(issueId, scenarioId)`.
  - 선택된 시나리오의 **근거(rationale)·영향(impact)·결과(outcome)** 표시 + "AI 분석 실행 →" (`analysis.html?id=`, `applyEdit` 반영본).
  - 시나리오 없는 이슈(i4): "제출된 시나리오 없음".
- **선택 상태**: 이슈별 독립, `tt:mapChoice`에 저장(여러 이슈 동시 선택 가능, 모든 이슈에 선택할 필요 없음). 선택된 이슈 핀은 강조 스타일. 패널은 **마지막 클릭 이슈**의 상세를 표시.
- 초기 진입(선택 이력 있음): 저장된 선택이 핀 강조에 반영. 패널은 비어 있음(안내: "이슈 핀을 선택하세요") 또는 마지막 선택 복원 — **안내 표시**로 단순화.

## 무결성 체크 (`test/check-data.mjs`)

- **추가**: 모든 issue에 `mapLocation{x,y,label}` 존재; 모든 scenario에 `impact`·`outcome`(비어있지 않은 string).
- **제거**: `reflected → mapLocation` 검증(필드 삭제).
- **유지**: FK 유효성, `realizedAt` 날짜 순서·상한, id 유일성, 자기부모 금지, 부모 체인 순환 검증, 4개 렌즈, 시연 전제(depth≥4 체인, 금지어 코멘트, 빈 트리 이슈, 현실화 0 이슈).

## 종단 검증 (`test/e2e.mjs`)

- **재작성**: 대시보드(통합 트리 렌더·스윕 후 채택 점등·이슈 팁 존재·이슈 선택 시 시나리오 분기·제출 링크), 지도(이슈 핀 4개·핀 클릭 시 시나리오 선택 목록·선택 시 근거/영향/결과·mapChoice localStorage 저장·마지막 클릭 상세).
- **제거**: issue.html 관련 체크, 지도 reflected 관련 체크, scenario.html 지도 반영 토글 체크.
- **유지**: scenario 토론(star·모더레이션·편집), analysis 4렌즈, submit 폼/라벨, 접근성 계열, 타이머 계측 회귀.

## 화면 흐름 (관통)

대시보드(통합 트리·스윕) → 이슈 팁 선택(시나리오 분기·목록) → 시나리오 토론(`scenario.html`) 또는 제출(`submit.html`) → 지도(`map.html`, 이슈 핀→시나리오 선택→근거·영향·결과) → AI 분석(`analysis.html`). nav로 대시보드/지도 이동.

## 비목표 (Out of Scope)

실제 인증·영속 저장·실시간 현실 피드·실제 LLM·실제 GIS/좌표·트리 자동 레이아웃/줌·팬·드래그. 모두 목 유지.
