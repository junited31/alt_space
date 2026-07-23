# 세션 핸드오프 — 싱크탱크 목업 구현

## 지금 할 일
`docs/superpowers/plans/2026-07-23-thinktank-mockup.md` 계획을 **subagent-driven-development** 스킬로 Task 1부터 실행. 아직 코드 구현 0.

## 프로젝트 상태
- 경로: `/srv/workspace/alt_space`, 브랜치: `feat/mockup` (여기서 계속 작업)
- 설계 스펙: `docs/superpowers/specs/2026-07-23-thinktank-mockup-design.md` (개정 2, 승인됨)
- 구현 계획: `docs/superpowers/plans/2026-07-23-thinktank-mockup.md` (개정 2, fable-reviewer 리뷰 반영 완료) — 7 태스크, 각 완전한 코드 포함
- 커밋 히스토리: 스펙/계획/에이전트 정의까지 완료. `web/`·`test/` 실제 코드는 아직 없음
- 레저: `.superpowers/sdd/progress.md` (없으면 새로 생성)

## 커스텀 에이전트 (등록됨, 재시작 후 갱신된 본문 반영)
- `sonnet-worker` (sonnet5/high) — **태스크별 구현자**
- `opus-reviewer` (opus4.8/high) — **태스크별 리뷰** (spec + 품질)
- `fable-reviewer` (fable5/high) — **최종 전체 브랜치 리뷰**

## 실행 방식 (subagent-driven-development 스킬 따를 것)
태스크마다: `sonnet-worker` 구현 → `opus-reviewer` 리뷰(spec+품질) → Critical/Important는 fix 서브에이전트 → 재리뷰 → 레저에 완료 기록. 전 태스크 끝나면 `fable-reviewer`로 최종 전체 브랜치 리뷰 → finishing-a-development-branch.
- 스킬 스크립트: `.../superpowers/6.1.1/skills/subagent-driven-development/scripts/` 의 `task-brief PLAN N`(브리프 파일 추출), `review-package BASE HEAD`(리뷰 패키지). 서브에이전트엔 계획 전체 대신 **브리프 파일 경로**만 전달.
- BASE는 각 구현자 디스패치 직전 HEAD로 기록 (HEAD~1 쓰지 말 것 — 멀티커밋 태스크 잘림).
- 태스크 사이 사람에게 확인 멈추지 말 것. BLOCKED/모호성만 예외.

## 핵심 제약 (계획 Global Constraints에서)
- 순수 HTML/CSS/바닐라 JS, 빌드·프레임워크·그래프 라이브러리 **금지**. `python3 -m http.server`로 검증 (file:// 금지 — ES module CORS).
- `web/data.js`는 클래식 스크립트 → `export` 금지, `window.DB`만. ES export는 `web/app.js`.
- `DB.now='2026-07-23'` 고정, realizedAt 전부 이전.
- **3상태 독립**: `star`(지지·트리 가지치기) / `realizedAt`(트리 강조 줄기) / `reflected`(지도 핫스팟). 지도 = reflected 기준.
- 타임라인 트리: treeX는 createdAt 날짜에서 계산, treeLane(y)만 하드코딩.
- 상태 지속은 localStorage 오버라이드.
- 유일 자동 테스트: `test/check-data.mjs` (node assert). 화면은 클릭 체크리스트.

## 화면 6 + 셸 / 태스크 매핑
1. 대시보드(index.html)=Task2 · 2. 이슈 타임라인 트리(issue.html)=Task3(핵심) · 3. 시나리오 토론(scenario.html)=Task5 · 4. 제출 폼(submit.html)=Task4 · 5. 지도(map.html)=Task6 · 6. AI 분석(analysis.html)=Task7. Task1=스캐폴드(data.js/app.js/styles.css/check-data.mjs).

## 첫 행동
1. subagent-driven-development 스킬 invoke.
2. 계획 1회 통독 + Global Constraints 메모, 7 태스크 todo 생성.
3. Pre-flight: 계획 내 모순 스캔 (없으면 조용히 진행).
4. `task-brief`로 Task1 브리프 추출 → `sonnet-worker` 디스패치 (브리프 경로 + 보고 파일 경로 전달).
