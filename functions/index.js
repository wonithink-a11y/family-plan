// 준비물 요청(families/{코드}/preps/{id})이 올라오면, 알림을 켠 다른 기기로 푸시를 보낸다.
// Firestore 위치와 같은 지역에 두는 것이 좋다. (콘솔 → Firestore → 데이터베이스 위치 확인)
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { buildMessage, pickTokens, deadTokens } = require('./notify');

admin.initializeApp();
setGlobalOptions({ region: process.env.FUNCTIONS_REGION || 'asia-northeast3', maxInstances: 5 });

exports.notifyPrep = onDocumentCreated('families/{familyId}/preps/{prepId}', async event => {
  const snap = event.data;
  if (!snap) return;
  const prep = snap.data() || {};
  const db = admin.firestore();
  const devSnap = await db.collection('families').doc(event.params.familyId).collection('devices').get();
  const devices = devSnap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  const tokens = pickTokens(devices, prep.by);
  if (!tokens.length) { logger.info('보낼 기기가 없어요', { family: event.params.familyId }); return; }

  const m = buildMessage(prep);
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: m.title, body: m.body },
    data: m.data,
    webpush: { fcmOptions: { link: m.data.link }, notification: { icon: m.data.link + 'icon-192.png' } },
  });
  logger.info('푸시 전송', { success: res.successCount, failure: res.failureCount });

  const dead = deadTokens(tokens, res.responses);
  if (dead.length) {
    const batch = db.batch();
    devSnap.docs.filter(d => dead.includes(d.data().token)).forEach(d => batch.set(d.ref, { notify: false, token: admin.firestore.FieldValue.delete() }, { merge: true }));
    await batch.commit();
  }
});
