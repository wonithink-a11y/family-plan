/* 스모크 테스트: 모든 탭이 오류 없이 그려지고, 핵심 흐름(수행평가 추가/검색/요약/성적/ICS)이 동작하는지 확인
 * 실행:  (저장소 루트에서)  python3 -m http.server 8123 &   →   node tools/test/smoke.js
 * 필요:  playwright (npm i -D playwright)  */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const stub = fs.readFileSync(path.join(__dirname, 'firestore-stub.js'), 'utf8');
const URL = process.env.APP_URL || 'http://localhost:8123/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 850 }, acceptDownloads: true });
  await ctx.route('**/*gstatic.com/**', r => r.fulfill({ contentType: 'application/javascript', body: r.request().url().includes('firestore') ? stub : '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    const f = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    window.__seed = {
      'families/smoke1234/items/i1': { id: 'i1', subject: '수학', dueDate: f(2), tasks: [{ id: 'a', text: '보고서', done: false }], maxScore: 20, earnedScore: null, alarmDaysBefore: 3, alarmEnabled: true, memo: '', priority: 2, person: '민수', attachments: [], createdAt: 1 },
      'families/smoke1234/items/i2': { id: 'i2', subject: '국어', dueDate: f(-5), tasks: [{ id: 'b', text: '감상문', done: true }], maxScore: 20, earnedScore: 18, alarmDaysBefore: 3, alarmEnabled: false, memo: '', priority: 2, person: '', attachments: [], createdAt: 1 },
      'families/smoke1234/events/e1': { id: 'e1', title: '학원', startDate: f(1), endDate: f(1), date: f(1), allDay: false, startTime: '17:00', endTime: '18:00', category: '학교', person: '', color: '#5B7FFF', memo: '', repeat: 'weekly', repeatUntil: '', exdates: [] },
      'families/smoke1234/config/members': { list: [{ name: '민수', color: '#5B7FFF' }] },
    };
    localStorage.setItem('fc', 'smoke1234');
  });
  await page.goto(URL);
  await page.waitForTimeout(600);

  const checks = [];
  const ok = (name, cond) => { checks.push([name, !!cond]); };

  for (const t of ['cal', 'list', 'events', 'stats', 'guide', 'backup']) {
    await page.evaluate(t => setTab(t), t);
    await page.waitForTimeout(150);
    ok(`탭 렌더: ${t}`, await page.locator('.screen').count() === 1);
  }
  await page.evaluate(() => setTab('list'));
  ok('이번 주 요약 카드', await page.locator('.wk-card').count() === 1);
  ok('수행평가 카드 2개', await page.locator('.card').count() === 2);

  await page.evaluate(() => { setTab('stats'); setStatsView('score'); });
  ok('성적 분석 화면', (await page.locator('.screen').innerText()).includes('누적 점수율'));

  // 검색
  await page.evaluate(() => { setTab('list'); openSearch(); });
  await page.fill('#srch-in', '수학');
  ok('검색 결과', await page.locator('.srch-row').count() >= 1);
  await page.evaluate(() => closeSearch());

  // 수행평가 추가 → Firestore 저장
  await page.evaluate(() => openAdd());
  await page.waitForTimeout(400);
  await page.fill('#f-subj', '영어');
  await page.locator('#ftl input').first().fill('발표 준비');
  await page.fill('#f-date', await page.evaluate(() => addDays(todayStr(), 7)));
  await page.evaluate(() => saveForm());
  await page.waitForTimeout(300);
  ok('수행평가 저장(Firestore)', await page.evaluate(() => Object.keys(__store).filter(k => k.startsWith('families/smoke1234/items/')).length === 3));

  // ICS
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportAllEvtICS())]);
  ok('일정 ICS(RRULE 포함)', fs.readFileSync(await dl.path(), 'utf8').includes('RRULE:FREQ=WEEKLY'));

  ok('콘솔/페이지 오류 없음', errors.length === 0);
  let fail = 0;
  for (const [n, v] of checks) { console.log((v ? 'PASS ' : 'FAIL ') + n); if (!v) fail++; }
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
