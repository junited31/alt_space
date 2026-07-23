# 대시보드 통합 트리 + 지도 v2 설계 스펙 (개정 2)

**작성일:** 2026-07-23
**대상:** 싱크탱크 목업 (정적 HTML/CSS/바닐라 JS)
**선행:** `2026-07-23-thinktank-mockup-design.md`(v1) 위에 대시보드·지도 재설계
**개정 2:** Codex 스펙 리뷰(must 5 / should 10 / nits 3) 반영 — 트리 기하 확정, 라우팅·상태 모델·데이터 제약·파급·접근성 명세.

## 목표

- **대시보드(첫 화면)**: 지난 접속 시점 → 현재 시점까지 **채택(현실화)되며 뻗어나가는 단일 통합 트리**를 보여준다. 첫 접속이면 현재 시점 전체 트리를 정적으로 보여준다. 트리 오른쪽 끝(현재)에 현 시점 이슈들이 가지 팁으로 달리고, 이슈를 선택하면 그 이슈의 시나리오 트리를 보고 제출할 수 있다.
- **지도**: 평면 세계 지도에 현 시점 이슈들을 핀으로 배치하고, 이슈마다 시나리오를 선택(모든 이슈에 선택하지 않아도 됨)해 **근거·영향·결과**를 보여준다.

## Global Constraints (v1에서 계승)

- 순수 HTML/CSS/바닐라 JS, 빌드·프레임워크·그래프 라이브러리 없음. SVG 직접 렌더.
- `python3 -m http.server`로 서빙(ES module CORS로 `file://` 불가).
- `web/data.js`는 classic `<script src>` → `export` 금지, `window.DB`만. ES export는 `web/app.js`만.
- `DB.now = '2026-07-23'` 고정. 모든 `realizedAt`은 `createdAt` 이상(같은 날 허용)·`DB.now` 이하 — check-data가 `>=`/`<=`로 검증하므로 경계 포함.
- 상태 지속은 localStorage 오버라이드(키 네임스페이스 `tt:`).
- 무결성 체크 `test/check-data.mjs`(node assert), 종단 검증 `test/e2e.mjs`(Playwright), CI/Pages 자동.

## 범위

**변경**
- `web/index.html` — 이슈 카드 리스트 → **개요 트리(스파인+이슈 팁, 스윕) + 이슈 선택 시 서브트리·시나리오 목록·제출**로 전면 재작성. URL `?issue=<id>` 지원(진입 시 자동 선택).
- `web/map.html` — 시나리오 `reflected` 핫스팟 → **이슈 핀 + 이슈별 시나리오 선택 + 근거·영향·결과**로 재작성.
- `web/data.js` — 필드 확장/정리(§ 데이터 모델) + 구체 값(§ 데이터 부록은 구현 계획에서 확정).
- `web/app.js` — 헬퍼 추가/정리.
- `web/scenario.html` — "지도 반영" 토글 제거(나머지 유지).
- `web/submit.html` — 제출 후 리다이렉트를 `index.html?issue=<id>`로 변경(구 `issue.html` 경로 제거).
- `web/styles.css` — 신규 상태 스타일 추가(선택된 이슈 팁, 스파인 점, 확장 서브트리, 선택된 지도 핀, 지도 시나리오 선택 목록).
- `test/check-data.mjs`, `test/e2e.mjs` — 신동작 검증으로 갱신.

**삭제**
- `web/issue.html` — 대시보드에 흡수(대체).

**유지**
- `web/analysis.html`(AI 4관점 분석), `web/scenario.html`(토론)의 나머지 기능.

**화면 수:** v1 "6화면 + 셸" → v2 **"5화면 + 셸"**(대시보드·시나리오 토론·제출·지도·AI 분석; issue.html 제거).

## 데이터 모델 (`web/data.js`)

### issues — `mapLocation` 추가
각 이슈에 평면 세계지도 좌표 추가. 지도 viewBox `0 0 600 320` 기준.
```
{ id, title, summary, sources[], traffic, heat, mapLocation:{ x, y, label } }
```
- 4개 이슈 전부에 좌표 부여. `x`는 유한수 `0..600`, `y`는 유한수 `0..320` 범위. `label` = 지역명 문자열(패널에 지역 맥락으로 표기; 핀의 가시 라벨은 이슈 제목).
- 핀 겹침 방지는 목 데이터 저작 시 좌표를 충분히 이격해 회피(런타임 충돌 처리 없음 — `ponytail:` 수동 이격, 자동 리레이아웃 없음).

### scenarios — `impact`·`outcome` 추가, `reflected`·`mapLocation` 제거
```
{ id, issueId, parentScenarioId|null, title, body, rationale,
  discussionSummary, stars, createdAt, realizedAt|null, treeLane,
  impact, outcome }          // + impact(영향)·outcome(결과) 신규
```
- 근거 = 기존 `rationale` 재사용. **영향 = `impact`**, **결과 = `outcome`** — 모든 시나리오에 비어있지 않은 문자열(각 1문장 내외, v1 목 톤). 구체 값은 구현 계획의 data.js에 저작(v1 관례: 스펙은 제약, 플랜이 데이터/코드).
- `reflected`·`mapLocation`은 **제거**(새 지도가 이슈→시나리오 선택으로 대체). `stars`(지지, 정수)·`realizedAt`(채택/트리 강조)는 유지. 지지 카운트 헬퍼는 `starCount`.
- **부모 동일 이슈 불변식**: `parentScenarioId`가 있으면 그 부모 시나리오의 `issueId`는 자식과 같아야 한다(이슈 스코프 서브트리 렌더 전제).

### 상태(localStorage, `tt:` 네임스페이스)
- 기존: `tt:stars`, `tt:edits`, `tt:lastVisit`.
- **신규: `tt:mapChoice`** = `{ [issueId]: scenarioId }` — 지도에서 이슈별 선택한 시나리오.
- **제거: `tt:reflected`**.

## `web/app.js` 헬퍼

**추가**
- `getMapChoice(issueId)` — `tt:mapChoice[issueId]` 반환. 저장된 값이 **그 이슈의 현재 시나리오 목록에 없으면**(stale/미지/교차 이슈) `null` 취급(무시).
- `setMapChoice(issueId, scenarioId)` — 저장. 같은 이슈에 다시 호출 시 교체.

**제거**
- `setReflected` / `isReflected`.

**유지**
- `DB, NOW, qs, byId, scenariosOfIssue, childrenOf, dnum, el, mountNav, activate, toggleStar, isStarred, starCount, setEdit, applyEdit, lastVisit, markVisit, setVisit, moderate`.

## 대시보드 (`web/index.html`)

두 개의 독립 렌더 영역으로 구성한다: **(A) 개요 트리**(항상 표시, 스윕 애니) 와 **(B) 선택 서브트리 + 패널**(이슈 선택 시 표시). 좌표계를 분리해 v1 기하를 (B)에서 그대로 재사용한다.

### (A) 개요 트리 — 스파인 + 이슈 팁
- **스파인(단일 수평선)**: 화면 세로 중앙의 한 줄. **모든 이슈에 걸친 현실화 시나리오**(`realizedAt` 존재)를 시간순으로 그 선 위 점으로 배치·연결 = "채택되며 뻗어나가는" 흐름. 연결은 **인과(parentScenarioId)가 아니라 시간순(전 세계 채택 결정의 연대기 개요)**. x = `realizedAt`을 [전체 min `realizedAt`, `DB.now`] → [좌여백, 우여백]px 선형 매핑. 정렬·배치 tie-break: `realizedAt` 동일 시 `createdAt`, 그다음 `id` 오름차순.
- **이슈 팁(오른쪽 끝, now)**: 현 시점 이슈 1개 = 팁 노드 1개. 스파인 오른쪽 끝(now)에서 각 이슈 팁으로 팬아웃(가지), 팁들은 세로로 나란히 배치(각기 다른 y). 가시 라벨 = 이슈 제목.
- 이슈 팁은 `role="button"`, `aria-expanded`(선택 시 true), `tabindex=0`, `aria-label`(이슈 제목 + "시나리오 열기"), Enter/Space 활성화(`activate`).

### 애니메이션(스윕) — (A)에만 적용
- **재방문**(`lastVisit()`이 유효한 날짜이고 `< DB.now`): 커서를 `lastVisit → now`로 이산 스윕(약 12스텝, setInterval **단일 타이머** 관리 — v1 개선 계승). 커서 `≥ realizedAt`인 스파인 점이 순차 점등, CSS transition 담당. 끝나면 `markVisit()`.
- **첫 방문**(`lastVisit()`이 null 또는 파싱 불가 또는 `>= now`): 스윕 없이 현재 시점 전체 스파인을 정적 표시 후 `markVisit()`.
- **"▶ 다시 재생"**: `setVisit(REPLAY_START)` 후 스윕 재생. `REPLAY_START` = **전체 시나리오 min `realizedAt` 날짜**(전체 채택 이력을 처음부터 스윕; v1의 하드코딩 `2026-04-01`이 초기 이벤트를 잘라먹던 문제 해소). 수동 슬라이더 조작 시 스윕 정지(타이머 계측 회귀 계승). 슬라이더 범위 = [`REPLAY_START`, `now`].
- 스윕은 (A)의 스파인 점등에만 관여한다. (B) 서브트리는 커서와 무관하게 **항상 `NOW` 상태**로 렌더한다.

### (B) 이슈 선택 → 서브트리 + 패널
- 이슈 팁 선택 시(그리고 진입 URL이 `?issue=<id>`면 로드시 자동 선택):
  - 그 이슈 팁 `aria-expanded=true`, 강조. **선택 서브트리 영역(트리 하단 별도 SVG 서브캔버스)**에 그 이슈의 시나리오 트리를 **v1 issue.html 기하 그대로** 렌더: x = `createdAt`을 [이슈 min `createdAt`, `NOW`] → px 선형 매핑, y = `treeLane`. 상태는 **`NOW` 고정**(스윕 커서 무관). 채택(`realizedAt ≤ NOW`)=진한 줄기, 후보=흐림. 가지치기 규칙 v1 계승(현실화 기준 depth≤2, 부모별 비현실 형제 `starCount` 상위 2개, 고아 제거). 이 서브캔버스는 개요 스파인과 좌표계를 공유하지 않는다(충돌 없음).
  - **패널**(서브캔버스 하단): 그 이슈의 시나리오 목록. 각 항목 → `scenario.html?id=`(토론). 상단에 "**+ 시나리오 제출**" → `submit.html?issue=`.
  - **빈 이슈**(시나리오 0, 예: i4): "아직 분기 없음 — 첫 시나리오를 제출해 보세요" + 제출 버튼.
  - **현실화 0 이슈**(모든 `realizedAt` null, 예: i3): 서브트리에 전 후보를 흐림으로 표시 + "아직 현실화된 분기 없음 — 전부 후보로 표시됩니다" 안내(v1 계승).
- 시나리오 서브트리 노드도 `tabindex=0`, `role="link"`, `aria-label`, Enter/Space 활성화(v1 계승).

## 지도 (`web/map.html`)

- 기존 평면 세계지도 SVG 배경 유지. 동기화 배지 `현실 동기화: {NOW} (목)` 유지.
- **이슈 핀**: 모든 이슈를 `issue.mapLocation`에 핀으로 표시(가시 라벨 = 이슈 제목). 핀은 `activate`, `role="button"`, `aria-label`(이슈 제목 + "상세 보기"), 키보드 활성화. `getMapChoice(issue.id)`가 유효하면 핀 강조.
- **핀 클릭 → 패널**:
  - 헤더: 이슈 제목 + `mapLocation.label`(지역).
  - 그 이슈의 시나리오 **선택 목록**: 접근성을 위해 `<fieldset><legend>` 안의 **네이티브 `<input type="radio" name="scenario-<issueId>">`** 그룹. 선택 시 `setMapChoice(issue.id, scenarioId)`. 진입 시 `getMapChoice`가 유효하면 해당 라디오 체크.
  - 선택된 시나리오의 **근거(rationale)·영향(impact)·결과(outcome)** 표시 + "AI 분석 실행 →"(`analysis.html?id=`, `applyEdit` 반영본). 분석 데이터가 없는 시나리오도 링크는 항상 제공(→ `analysis.html`의 기존 "분석 데이터 없음" 상태가 처리).
  - **시나리오 없는 이슈**(i4): "제출된 시나리오 없음"(선택 목록·상세 없음).
- **선택 상태**: 이슈별 독립, `tt:mapChoice`에 저장(여러 이슈 동시 선택 가능, 모든 이슈에 선택할 필요 없음; 별도 "선택 해제"는 요구하지 않음 — 미선택은 그냥 저장 없음). 저장된 값이 그 이슈 시나리오에 없으면 무시(§ app.js `getMapChoice`).
- **초기 진입**: 저장된 선택은 핀 강조에만 반영. 상세 패널은 비운 채 안내("이슈 핀을 선택하세요") — 자동 복원 없음(단순화·결정론).

## 무결성 체크 (`test/check-data.mjs`)

- **추가**: 모든 issue에 `mapLocation{x,y,label}` 존재 — `x,y`는 유한수이고 각각 `0..600`, `0..320` 범위, `label`은 비어있지 않은 문자열. 모든 scenario에 `impact`·`outcome`(비어있지 않은 string). `parentScenarioId`가 있으면 부모의 `issueId` == 자식 `issueId`(부모 동일 이슈 불변식).
- **제거**: `reflected → mapLocation` 검증, 그리고 터미널 단언 `reflected 시나리오 존재`(필드 삭제로 무의미).
- **유지**: FK 유효성, `realizedAt` 날짜 순서(`>=`/`<=`)·상한, id 유일성, 자기부모 금지, 부모 체인 순환 검증, 4개 렌즈, 시연 전제(depth≥4 체인, 금지어 코멘트, 빈 트리 이슈 i4, 현실화 0 이슈 i3).

## 종단 검증 (`test/e2e.mjs`)

v2 신동작으로 재작성. 최소 커버:
- **대시보드**: 개요 스파인 렌더·이슈 팁 4개 존재; **첫 방문 정적 렌더**(스윕 없이 현재 상태) 와 **재방문 스윕 후 채택 점등**(계측 회귀 계승: 재생 겹침 없음·수동 스크럽 정지); 이슈 팁 선택 시 서브트리 분기 + 시나리오 목록 + 제출 링크(`submit.html?issue=`); **i3 선택 시 "현실화 0" 안내**; **i4 선택 시 빈 상태**; `?issue=` 진입 자동 선택.
- **지도**: 이슈 핀 4개; 핀 클릭 시 라디오 선택 목록; 선택 시 근거·영향·결과 표시 + 분석 링크; **분석 없는 시나리오 선택 시에도 링크 존재**; **선택이 `tt:mapChoice`에 저장·리로드 후 핀 강조 유지**; **여러 이슈 독립 선택**; **stale 저장값 무시**; **i4 핀 클릭 시 "제출된 시나리오 없음"**.
- **제거**: issue.html 관련 체크, 지도 reflected·scenario.html 지도 반영 토글 체크.
- **유지**: scenario 토론(star·모더레이션·편집), analysis 4렌즈, submit 폼/라벨, 접근성 계열(슬라이더 라벨·SVG 노드/핀 키보드·radio·aria-expanded).

## 화면 흐름 (관통)

대시보드(개요 트리·스윕) → 이슈 팁 선택(서브트리·시나리오 목록) → 시나리오 토론(`scenario.html`) 또는 제출(`submit.html` → `index.html?issue=`로 복귀) → 지도(`map.html`, 이슈 핀→시나리오 선택→근거·영향·결과) → AI 분석(`analysis.html`). nav로 대시보드/지도 이동.

## 비목표 (Out of Scope)

실제 인증·영속 저장·실시간 현실 피드·실제 LLM·실제 GIS/좌표·트리 자동 레이아웃/줌·팬·드래그·핀 충돌 자동 회피. 모두 목 유지.
