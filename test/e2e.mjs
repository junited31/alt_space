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
