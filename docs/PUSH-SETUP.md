# 푸시 알림 설정 (준비물 요청 → 부모 폰으로 알림)

앱 쪽 코드(기기 등록)와 서버 코드(`functions/`)는 이미 들어 있어요. **서버 배포는 허남원님이 직접 해야 합니다** (Firebase 요금제 전환·로그인이 필요해서 여기서는 못 했어요).

## 한 번만 하는 준비
1. **요금제**: Firebase 콘솔 → 프로젝트 `family-plan-11d44` → 요금제를 **Blaze(종량제)** 로 변경.
   Cloud Functions 배포에 필요해요. 가족 한 집 사용량은 무료 구간 안이라 보통 0원이지만, 카드 등록과 예산 알림 설정을 권해요.
2. **웹 푸시 키(VAPID)**: 콘솔 → 프로젝트 설정 → **클라우드 메시징** → 웹 구성 → "웹 푸시 인증서" → **키 쌍 생성** → 나오는 긴 문자열 복사.
3. **Firestore 규칙**: 기존에 `meta·routine·stamps·coupons·preps` 를 열어 둔 것처럼 `devices` 컬렉션(`families/{코드}/devices/{기기}`)도 읽기·쓰기를 허용해 주세요.
4. **Firestore 위치 확인**: 콘솔 → Firestore → 설정/데이터베이스 위치. `functions/index.js` 의 기본 지역은 `asia-northeast3`(서울)이에요. 다르면 배포 때 `FUNCTIONS_REGION=us-central1` 처럼 지정하세요.

## 배포 (PC에서)
```bash
npm i -g firebase-tools
firebase login
cd family-plan/functions && npm install && cd ..
node functions/test.js          # 서버 로직 검사 (통과 확인)
firebase deploy --only functions
```

## 기기 등록 (알림 받을 폰마다)
1. 앱 → 말하기 시트 → ⚙ → **고급** 열기.
2. 웹 푸시 키(VAPID) 붙여 넣기 → 기기 이름(예: 엄마 폰) → **🔔 이 기기에서 준비물 요청 알림 받기**.
3. 브라우저가 알림 권한을 물으면 허용.
- 아이폰은 사파리에서 **홈 화면에 추가한 앱**으로 열어야 푸시가 동작해요 (iOS 16.4 이상).
- 아이 태블릿에서 준비물을 요청하면, 알림을 켠 **다른** 기기로 가요 (요청한 기기는 제외).

## 확인
- 콘솔 → Functions → `notifyPrep` 로그에서 "푸시 전송 success=1" 확인.
- 도착하지 않으면: ① 규칙에서 `devices` 쓰기가 막혔는지 ② VAPID 키가 같은 프로젝트 것인지 ③ 폰에서 사이트 알림이 차단됐는지 순서로 보세요.

## 구조
```
아이가 준비물 요청 ─▶ families/{코드}/preps/{id} 생성
                         └▶ Cloud Function notifyPrep ─▶ devices 중 notify=true(요청 기기 제외) 토큰 조회 ─▶ FCM 전송
                                                                    └▶ 앱 서비스워커(sw.js)가 알림 표시 / 앱이 열려 있으면 화면 위 토스트
```
