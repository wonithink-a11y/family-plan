// 푸시 메시지 만들기·대상 고르기 (Firebase 의존성 없이 단독 테스트 가능)
const PROJECT_BASE = 'https://wonithink-a11y.github.io/family-plan/';

function fmtDate(ds) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds || '');
  if (!m) return ds || '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일 ' + '일월화수목금토'[d.getUTCDay()] + '요일';
}

// prep: {id,date,text,by}
function buildMessage(prep) {
  const text = String(prep.text || '').slice(0, 60);
  return {
    title: '🎒 준비물 요청이 왔어요',
    body: fmtDate(prep.date) + ' · ' + text,
    data: { type: 'prep', text, date: String(prep.date || ''), link: PROJECT_BASE },
  };
}

// devices: [{id,token,notify}] → 요청한 기기(by)는 빼고, 알림을 켠 기기의 토큰만 중복 없이
function pickTokens(devices, byId) {
  const seen = new Set();
  return devices
    .filter(d => d && d.token && d.notify === true && d.id !== byId)
    .map(d => d.token)
    .filter(t => (seen.has(t) ? false : (seen.add(t), true)));
}

// sendEachForMulticast 결과에서 더는 쓸 수 없는 토큰만 골라낸다
function deadTokens(tokens, responses) {
  const dead = [];
  responses.forEach((r, i) => {
    const code = r && r.error && r.error.code;
    if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')) dead.push(tokens[i]);
  });
  return dead;
}

module.exports = { buildMessage, pickTokens, deadTokens, fmtDate };
