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
