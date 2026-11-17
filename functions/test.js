// node functions/test.js — 서버 로직(메시지·대상 선택) 단독 검사
const assert = require('assert');
const { buildMessage, pickTokens, deadTokens, fmtDate } = require('./notify');
assert.strictEqual(fmtDate('2026-11-18'), '11월 18일 수요일');
const m = buildMessage({ date: '2026-11-18', text: '리코더', by: 'x' });
assert.ok(m.body.includes('11월 18일 수요일') && m.body.includes('리코더') && m.data.type === 'prep');
const devs = [
  { id: 'a', token: 'T1', notify: true }, { id: 'b', token: 'T2', notify: false }, { id: 'c', token: 'T1', notify: true },
  { id: 'd', notify: true }, { id: 'req', token: 'T9', notify: true }, { id: 'e', token: 'T3', notify: true },
];
assert.deepStrictEqual(pickTokens(devs, 'req'), ['T1', 'T3']);
assert.deepStrictEqual(deadTokens(['T1', 'T3'], [{ success: true }, { success: false, error: { code: 'messaging/registration-token-not-registered' } }]), ['T3']);
assert.deepStrictEqual(deadTokens(['T1'], [{ success: false, error: { code: 'messaging/internal-error' } }]), []);
console.log('functions/notify 검사 통과');
