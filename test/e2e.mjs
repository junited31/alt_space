// 종단(E2E) 스모크 — 실제 headless Chromium으로 6화면 렌더·인터랙션·접근성·회귀를 검증.
// 자체 정적 서버를 띄워(ES module CORS 때문에 file:// 불가) web/ 을 서빙한다.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import assert from 'node:assert/strict';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// web/ 하위만 서빙하는 최소 정적 서버 (경로 탈출 방지).
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const p = normalize(join(WEB, rel));
    if (!p.startsWith(WEB)) { res.writeHead(403); return res.end('forbidden'); }
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;

const b = await chromium.launch();
const ctx = await b.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

const results = [];
const check = (name, cond, extra = '') => { assert.ok(cond, `${name} FAILED ${extra}`); results.push(`✓ ${name}`); };

try {
  // 1. Dashboard: 4 issue cards, i4 shows 시나리오 0개
  await page.goto(`${BASE}/index.html`);
  await page.waitForSelector('#list a.card');
  const cards = await page.$$('#list a.card');
  check('dashboard: 4 issue cards', cards.length === 4, `got ${cards.length}`);
  const bodyText = await page.textContent('body');
  check('dashboard: i4 시나리오 0개', /시나리오 0개/.test(bodyText));
  check('dashboard: nav 대시보드 active', await page.getAttribute('.topnav a.on', 'href') === 'index.html');

  // 2. Issue timeline tree i1: after animation ends, nodes render; s7/s10 hidden, s1/s2 present
  await page.goto(`${BASE}/issue.html?id=i1`);
  await page.waitForSelector('.treewrap svg .tnode');
  await page.waitForTimeout(2200); // let sweep animation finish (~12*130ms)
  const nodeTexts = await page.$$eval('.treewrap svg .tnode text', els => els.map(e => e.textContent));
  const titles = nodeTexts.join(' | ');
  check('tree: s1 규제 전면 확대 shown', /규제 전면 확대/.test(titles));
  check('tree: s2 역내 자급 가속 shown', /역내 자급 가속/.test(titles));
  check('tree: s7 보조금 축소 역풍 HIDDEN', !/보조금 축소 역풍/.test(titles), titles);
  check('tree: s10 글로벌 통제망 HIDDEN', !/글로벌 통제망/.test(titles), titles);
  const realizedFill = await page.$$eval('.treewrap svg .tnode circle', els =>
    els.filter(e => e.getAttribute('fill') === 'var(--realized)').length);
  check('tree: realized nodes filled (강조 줄기)', realizedFill >= 2, `got ${realizedFill}`);

  // 3. Empty tree i4
  await page.goto(`${BASE}/issue.html?id=i4`);
  await page.waitForSelector('.empty');
  check('tree i4: 빈 상태 안내', /아직 분기 없음/.test(await page.textContent('.empty')));
  check('tree i4: 슬라이더 없음', (await page.$$('input[type=range]')).length === 0);

  // 4. i3: 현실화 0
  await page.goto(`${BASE}/issue.html?id=i3`);
  await page.waitForSelector('.treewrap svg');
  check('tree i3: 현실화 0 안내', /아직 현실화된 분기 없음/.test(await page.textContent('body')));

  // 5. Scenario s2: star toggle, reflected on, edit
  await page.goto(`${BASE}/scenario.html?id=s2`);
  await page.waitForSelector('.star');
  const starBefore = await page.textContent('.star');
  await page.click('.star');
  const starAfter = await page.textContent('.star');
  check('scenario: star toggles ☆→★ & count+1', starBefore !== starAfter && /★/.test(starAfter), `${starBefore} -> ${starAfter}`);
  check('scenario s2: breadcrumb 분기 출처', /분기 출처/.test(await page.textContent('body')));
  check('scenario s2: 현실화 배지', /현실화 2026-05-20/.test(await page.textContent('body')));

  // 6. Scenario s3: moderation masking + reflected disabled
  await page.goto(`${BASE}/scenario.html?id=s3`);
  await page.waitForSelector('body');
  const s3body = await page.textContent('body');
  check('scenario s3: 젠장 masked to **', !/젠장/.test(s3body) && /\*\*/.test(s3body));
  check('scenario s3: reflected 버튼 비활성(좌표 없음)', /좌표 없음/.test(s3body));

  // 7. Map: hotspots {s1,s2,s4}
  await page.goto(`${BASE}/map.html`);
  await page.waitForSelector('#map .hot');
  const hotTexts = await page.$$eval('#map .hot text', els => els.map(e => e.textContent));
  check('map: 3 hotspots', hotTexts.length === 3, `got ${hotTexts.length}: ${hotTexts}`);
  check('map: sync badge NOW', /현실 동기화: 2026-07-23 \(목\)/.test(await page.textContent('#sync')));
  await page.click('#map .hot');
  await page.waitForSelector('#panel .card');
  check('map: click hotspot → 분석 링크', await page.getAttribute('#panel a.btn', 'href') !== null);

  // 8. Analysis s1: spinner → 4 lens grid
  await page.goto(`${BASE}/analysis.html?id=s1`);
  await page.waitForSelector('.lens-grid', { timeout: 3000 });
  const lensCards = await page.$$('.lens-grid .card');
  check('analysis s1: 4 lens cards', lensCards.length === 4, `got ${lensCards.length}`);
  const analysisBody = await page.textContent('body');
  check('analysis s1: 정치·경제·군사·민간', ['정치', '경제', '군사', '민간'].every(l => analysisBody.includes(l)));

  // 9. Analysis s3: no analysis data (loading '.empty' is replaced after 700ms — wait for final text)
  await page.goto(`${BASE}/analysis.html?id=s3`);
  await page.waitForFunction(() => /분석 데이터 없음/.test(document.body.textContent), null, { timeout: 3000 });
  check('analysis s3: 분석 데이터 없음', /분석 데이터 없음/.test(await page.textContent('body')));

  // === Accessibility ===
  // A1. issue.html slider label + SVG nodes keyboard
  await page.goto(`${BASE}/issue.html?id=i1`);
  await page.waitForSelector('.treewrap svg .tnode');
  await page.waitForTimeout(2200);
  check('a11y: slider aria-label', await page.getAttribute('#timeline-cursor', 'aria-label') !== null);
  check('a11y: slider has <label for>', await page.getAttribute('label[for=timeline-cursor]', 'for') === 'timeline-cursor');
  const node0 = await page.$('.treewrap svg .tnode');
  check('a11y: tree node tabindex=0', await node0.getAttribute('tabindex') === '0');
  check('a11y: tree node role=link', await node0.getAttribute('role') === 'link');
  check('a11y: tree node aria-label', (await node0.getAttribute('aria-label') || '').includes('시나리오 열기'));
  await node0.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/scenario\.html\?id=/, { timeout: 3000 });
  check('a11y: Enter on tree node navigates', /scenario\.html\?id=/.test(page.url()), page.url());

  // A2. scenario star is a button with aria-pressed toggling (clear prior star state from check #5)
  await page.goto(`${BASE}/scenario.html?id=s2`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('button.star');
  check('a11y: star is <button>', await page.$eval('button.star', b => b.tagName) === 'BUTTON');
  check('a11y: star aria-pressed=false initial', await page.getAttribute('button.star', 'aria-pressed') === 'false');
  await page.click('button.star');
  check('a11y: star aria-pressed=true after click', await page.getAttribute('button.star', 'aria-pressed') === 'true');
  check('a11y: edit btn aria-expanded=false', await page.getAttribute('button[aria-controls=edit-form]', 'aria-expanded') === 'false');
  await page.click('button[aria-controls=edit-form]');
  check('a11y: edit btn aria-expanded=true after open', await page.getAttribute('button[aria-controls=edit-form]', 'aria-expanded') === 'true');
  check('a11y: edit inputs have <label for>', await page.getAttribute('label[for=edit-title]', 'for') === 'edit-title');

  // A3. map hotspots keyboard
  await page.goto(`${BASE}/map.html`);
  await page.waitForSelector('#map .hot');
  const hot0 = await page.$('#map .hot');
  check('a11y: map hotspot tabindex=0', await hot0.getAttribute('tabindex') === '0');
  check('a11y: map hotspot role=button', await hot0.getAttribute('role') === 'button');
  await hot0.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('#panel .card', { timeout: 3000 });
  check('a11y: Enter on hotspot opens panel', (await page.$$('#panel .card')).length > 0);

  // A4. submit.html form + associated labels
  await page.goto(`${BASE}/submit.html?issue=i1`);
  await page.waitForSelector('form.card');
  check('a11y: submit uses <form>', (await page.$$('form.card')).length === 1);
  check('a11y: submit title label linked', await page.getAttribute('label[for=f-title]', 'for') === 'f-title');
  check('a11y: submit inputs have ids', await page.$('#f-title') !== null && await page.$('#f-body') !== null && await page.$('#f-parent') !== null);

  // A5. button contrast: .btn background is the darker --btn token (not the light --accent)
  const btnBg = await page.$eval('.btn', el => getComputedStyle(el).backgroundColor);
  check('a11y: .btn uses darker --btn (#2f6fd0 = rgb(47,111,208))', btnBg === 'rgb(47, 111, 208)', btnBg);

  // === Should-fix 회귀 ===
  // S1. replay 타이머: 재생 도중 여러 번 눌러도 커서가 단조 진행(겹침 없이 최종 maxD 도달)
  await page.goto(`${BASE}/issue.html?id=i1`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#timeline-cursor');
  await page.click('button.btn.ghost'); // ▶ 다시 재생
  await page.click('button.btn.ghost');
  await page.click('button.btn.ghost');
  await page.waitForTimeout(2200);
  const finalCursor = await page.$eval('.crumb[aria-live=polite]', e => e.textContent);
  check('should-fix: replay 연타 후 커서 최종 now 도달(타이머 겹침 없음)', finalCursor === '2026-07-23', finalCursor);
  await page.click('button.btn.ghost');
  await page.$eval('#timeline-cursor', (s) => { s.value = s.min; s.dispatchEvent(new Event('input')); });
  const scrubbed = await page.$eval('.crumb[aria-live=polite]', e => e.textContent);
  await page.waitForTimeout(800);
  const afterWait = await page.$eval('.crumb[aria-live=polite]', e => e.textContent);
  check('should-fix: 수동 스크럽이 애니를 멈춤(커서 자동 이동 안 함)', scrubbed === afterWait, `${scrubbed} -> ${afterWait}`);

  // S2. localStorage 네임스페이스: 저장 키가 tt: 프리픽스
  await page.goto(`${BASE}/scenario.html?id=s2`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('button.star');
  await page.click('button.star');
  const nsKeys = await page.evaluate(() => Object.keys(localStorage));
  check('should-fix: localStorage 키 네임스페이스(tt:)', nsKeys.some(k => k === 'tt:stars') && !nsKeys.includes('stars'), JSON.stringify(nsKeys));

  // S3. 편집 빈값 가드: 제목 비우고 저장 → 저장 안 되고 편집창 유지
  await page.click('button[aria-controls=edit-form]');
  page.once('dialog', d => d.accept());
  await page.fill('#edit-title', '');
  await page.click('#edit-form button.btn');
  check('should-fix: 빈 제목 저장 거부(편집창 유지)', await page.$eval('#edit-form', f => getComputedStyle(f).display) === 'block');

  // S4. 반응형: 좁은 뷰포트에서 lens-grid 1열
  await page.setViewportSize({ width: 480, height: 900 });
  await page.goto(`${BASE}/analysis.html?id=s1`);
  await page.waitForSelector('.lens-grid .card');
  const cols = await page.$eval('.lens-grid', g => getComputedStyle(g).gridTemplateColumns.split(' ').length);
  check('should-fix: 좁은 화면 lens-grid 1열', cols === 1, `columns=${cols}`);
  await page.setViewportSize({ width: 1000, height: 900 });
} finally {
  await b.close();
  server.close();
}

console.log(results.join('\n'));
console.log(`\nConsole errors: ${errors.length}`);
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
console.log(`\nALL ${results.length} E2E CHECKS PASSED`);
