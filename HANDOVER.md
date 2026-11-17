# 패밀리 플랜 — 인수인계 문서

> 가족이 함께 쓰는 수행평가·일정 관리 PWA. 서버 없이 **정적 파일 + Firebase Firestore**로 동작한다.
> 이 문서는 "지금 코드가 무엇이고, 어떻게 돌아가고, 무엇이 아직 확인되지 않았는지"를 한 곳에 모은 것이다.
> 작성 기준: 브랜치 `claude/serene-thompson-mu5lk4` (최신 커밋 기준)

---

## 0. 먼저 읽을 것 (배포 전 필수 체크리스트)

| # | 할 일 | 안 하면 |
|---|---|---|
| 1 | **Firebase 콘솔에서 `firestore.rules` 전체를 다시 게시** (Firestore Database → 규칙 → 붙여넣기 → 게시) | 구성원·템플릿·목표점수·이미지 저장이 `permission-denied`로 실패(앱에 경고창이 뜸) |
| 2 | Firestore 데이터베이스가 만들어져 있는지 확인 (위치 `asia-northeast3` 권장, 생성 후 변경 불가) | 앱이 "Firestore를 활성화해주세요" 오류 표시 |
| 3 | 요금제가 **Spark(무료)** 인지 확인 | Blaze 로 올려 두었다면 초과분 과금 가능 |
| 4 | 코드를 배포한 뒤 앱을 **한 번 열어** 서비스워커 캐시(`family-plan-v3`)를 갱신 | 이전 화면이 남아 있을 수 있음 (HTML은 network-first라 보통 바로 갱신됨) |
| 5 | 짧은 가족코드(예: `abc`)를 쓰는 가족은 설정 → **가족 코드 변경**으로 안전한 코드로 이전 (데이터 자동 복사) | 코드를 아는 사람은 누구나 접근 가능 |

**검증 범위(중요)**: 지금까지의 테스트는 전부 *가짜(메모리) Firestore + 헤드리스 Chromium(390px)* 에서 했다.
**실제 Firebase 연결, 보안 규칙 평가, 실제 안드로이드/iOS 기기(설치형 PWA, 알림, 파일 다운로드)는 아직 확인하지 못했다.**
배포 후 실제 기기에서 §9의 수동 점검 목록을 한 번 돌려 볼 것.

---

## 1. 한눈에 보기

- **형태**: 단일 `index.html`(약 3,000줄, HTML+CSS+JS 인라인) + `sw.js` + `manifest.json`. 빌드 도구·프레임워크 없음.
- **데이터**: Firestore. 로그인은 없고 **가족코드(문자열)** 가 곧 "방 번호"이자 유일한 접근 수단이다.
- **호스팅 가정**: `manifest.json`의 `start_url`/`scope`가 `/family-plan/` 이므로 **GitHub Pages 프로젝트 페이지(`https://<계정>.github.io/family-plan/`)** 를 전제로 만들어져 있다. 실제 Pages 설정 여부는 이 세션에서 확인하지 못했다.
- **외부 의존**: Firebase JS SDK 10.12.2 compat (`https://www.gstatic.com/firebasejs/10.12.2/…`, CDN). 그 외 외부 라이브러리 없음.
- **주 사용 환경**: 모바일(안드로이드 위주 추정) 홈 화면 설치 PWA. 레이아웃은 390px 폭 기준.

### 저장소 구성

```
index.html            앱 전체 (CSS → HTML → <script> 순)
sw.js                 서비스워커 (캐시, 알림 클릭 처리)
manifest.json         PWA 매니페스트
firestore.rules       Firestore 보안 규칙 (콘솔에 직접 게시해야 적용됨)
icon-192.png / icon-512.png
HANDOVER.md           이 문서
tools/test/
  firestore-stub.js   테스트용 가짜 Firestore
  smoke.js            스모크 테스트 (Playwright)
```

---

## 2. 앱 구조 (index.html)

### 2-1. 렌더링 방식
- 전역 상태 객체 `S` 하나 + `render()` 가 `#app.innerHTML` 을 통째로 다시 그린다. `setState(patch)` = `Object.assign(S,patch); render()`.
- 화면(탭)별 빌더: `buildCalView / buildListView / buildEventsView / buildStatsView(+buildScoreView) / buildGuideView / buildBackupView(=설정)`. 하단 탭 이동은 `setTab(t)`.
- 바텀시트(상세·폼)는 `render()` 안에서 `S.overlay`('detail'|'form'|'txt-attach'|'img-view')로, **일정 시트와 검색 화면은 별도 DOM**(`#evt-ov`, `#srch-ov`)으로 `document.body`에 붙인다 (재렌더 시 입력값이 날아가지 않게 하려는 의도).
- 이벤트 핸들러는 **인라인 `onclick="fn('id')"`**. 전역 함수로 선언돼 있어야 한다.
- 문자열 보간 시 사용자 입력은 반드시 `esc()` 를 거친다. **인라인 핸들러 안의 인자에 사용자 문자열을 직접 넣지 말 것** (`data-*` 속성 + `this.dataset.x` 패턴 사용: 구성원 칩, 템플릿, 검색 등 참고).
- 실시간 갱신(스냅샷) 중에 열려 있는 수행평가 폼의 입력값을 보존하려고 스냅샷 콜백은 `render()` 대신 `renderKeep()` 을 쓴다.

### 2-2. 주요 상태 `S`
`familyCode, items, events, members, templates, goals, tab, overlay, activeId, form, evtForm, filter, sortBy, hideDone, personFilter, calYear/calMonth/calDate, statsView('progress'|'score'), scoreSem, scoreSubj, theme('auto'|'light'|'dark'), fs('sm'|'md'|'lg'|'xl'), notif, notifOn, syncStatus('connecting'|'synced'|'offline'|'error')` 등.

### 2-3. 동기화 흐름
```
startSync(code)
 ├─ items      onSnapshot → S.items  (fromFSDoc 로 로컬 legacy 이미지 병합)
 ├─ events     onSnapshot → S.events
 ├─ config/members    → S.members
 ├─ config/templates  → S.templates
 └─ config/goals      → S.goals
```
- 쓰기는 낙관적 갱신(`S.items=…; render(); saveItemFS(...)`) 후 Firestore에 저장한다.
- `enablePersistence({synchronizeTabs:true})` 로 오프라인 캐시 사용 (SDK에서 deprecated 경고가 나올 수 있으나 동작함).
- 코드 전환(`startSync`)은 이전 데이터 잔상을 지우고 모든 구독을 다시 건다.

---

## 3. 데이터 모델

### 3-1. Firestore 경로

| 경로 | 내용 | 비고 |
|---|---|---|
| `families/{code}/items/{id}` | 수행평가 | 문서 ID == `data.id` (규칙이 강제) |
| `families/{code}/events/{id}` | 가족 일정 | 문서 ID == `data.id` |
| `families/{code}/config/members` | `{list:[{name,color}]}` | 최대 12명 |
| `families/{code}/config/templates` | `{list:[{id,name,subject,color,tasks[],maxScore,priority,alarmEnabled,alarmDaysBefore,memo,person}]}` | 최대 30개 |
| `families/{code}/config/goals` | `{list:[{subject,target}]}` | 과목별 목표 점수율(%) |
| `families/{code}/images/{id}` | `{id,itemId,data,createdAt}` 이미지 원본(JPEG dataURL) | 문서 700KB 미만 |
| `_device_codes/{deviceId}` | `{familyCode,savedAt}` | 안드로이드 삼성 브라우저 등에서 localStorage 가 지워졌을 때 코드 자동 복구용 |

**items 문서 주요 필드**: `id, subject, dueDate('YYYY-MM-DD'), tasks[{id,text,done}], maxScore, earnedScore|null, alarmEnabled, alarmDaysBefore, memo, priority(1~3), person, attachments[], createdAt`
- `attachments` 항목: 텍스트 `{id,type:'txt',name,data}` / 이미지(동기화) `{id,type:'img',cloud:true,name,thumb}` (`thumb`=160px 썸네일 dataURL, 원본은 `images/{id}`).

**events 문서 주요 필드**: `id, title, startDate, endDate, date(=startDate, 구버전 호환), allDay, startTime, endTime, category, person, color, memo, repeat('' | weekly | biweekly | monthly | yearly), repeatUntil, exdates[]`
- 반복 일정은 **규칙만 저장**하고 화면에 필요한 기간만 `occurrences(ev,from,to)` 로 펼친다. 특정 날짜만 지우면 `exdates` 에 그 회차 시작일이 추가된다.

### 3-2. localStorage 키 (기기별)

| 키 | 용도 |
|---|---|
| `fc` | 가족코드 |
| `_did` | 기기 ID (24자 난수) — `_device_codes` 문서 ID |
| `img_<itemId>` | **legacy** 이미지(이전 버전, 이 기기에만 저장). 설정 → "이미지 공유"로 클라우드로 이전 |
| `ap4_trend` | 완료율 추이(최근 30일) |
| `fired3` | 이미 울린 알림 키(`id|마감일`) |
| `notifOff` | 이 기기 알림 끔(`'1'`) |
| `fabpos` | + 버튼 위치(길게 눌러 이동) |
| `theme`, `fs` | 다크모드/글자 크기 |
| `weekOpen`, `statsView` | 이번 주 카드 펼침, 통계 탭 서브뷰 |

---

## 4. 보안 모델과 한계 (꼭 이해할 것)

- **인증이 없다.** 가족코드를 아는 사람은 해당 가족의 모든 데이터를 읽고·쓰고·지울 수 있다. 코드는 사실상 "공유 비밀번호"다.
- 완화책(구현됨): 새 코드는 6~20자, 반복문자·흔한 약한 코드·8자 미만 숫자 거부(`checkCode`), 안전한 난수 코드 생성(`genCode`), 기존 짧은 코드 사용자에게 경고 배너와 **데이터 복사 포함 코드 변경**(`changeFamilyCode`).
- `firestore.rules` 가 막는 것: 가족 루트 문서 접근, 컬렉션 열거(`_device_codes` 목록 조회 불가), 문서 크기, `id` 일치, `config` 문서 이름/형식. **막지 못하는 것**: 코드를 추측해서 들어오는 접근(인증이 없으므로 원천 불가), 대량 삭제.
- 규칙의 코드 최소 길이는 **2자 그대로**다(기존 짧은 코드 가족이 깨지지 않게). 모든 가족이 새 코드로 옮긴 뒤 `code.size() >= 6` 으로 올리는 것을 권장.
- Firebase 웹 `apiKey` 가 소스에 있는 것은 정상(공개 전제)이다. 보호는 **규칙**이 한다.
- 근본 해결책(미구현): Firebase 익명/이메일 인증 + 규칙에서 `request.auth` 검사. 이 경우 가족 단위 멤버십 모델 설계가 필요하다.

---

## 5. 기능 목록과 코드 위치

| 영역 | 내용 | 주요 함수/위치 |
|---|---|---|
| 수행평가 | 단계별 체크, 진행률, D-day, 중요도, 점수 입력, 알림, 메모 | `buildCard`, `buildDetailSheet`, `buildFormSheet`, `saveForm`, `toggleTask` |
| 담당자(구성원) | 구성원 등록·색상, 항목별 담당자, 필터, 구성원별 통계 | `startMembersSync`, `visItems/visEvents`, `personFilterBar`, `personChips` |
| 템플릿 | 폼 내용을 템플릿으로 저장/불러오기(가족 동기화) | `saveAsTemplate`, `applyTemplate`, `startTemplatesSync` |
| 일정 | 종일/시간, 기간, 분류, 색상, 담당자, **반복(매주/2주/매월/매년)**, 회차만 삭제 | `buildEventsView`, `saveEvtForm`, `occurrences`, `nextOccurrence`, `deleteEvt` |
| 달력 | 월 보기, 스와이프, 공휴일(2025~2031 하드코딩), 수행평가·일정 칩 | `buildCalView`, `KR_HOL` |
| 이번 주 할 일 | 오늘부터 7일 요약, 지연 항목 | `weekSummary`, `buildWeekCard` |
| 검색 | 수행평가(과목·단계·메모·담당·텍스트첨부·날짜) + 일정 | `openSearch`, `runSearch` |
| 통계 | 진행(과목·구성원별 진행률, 완료율 추이) / **성적**(학기·과목 누적 점수율, 목표, 추이 그래프) | `buildStatsView`, `buildScoreView`, `scoreData`, `scoreChart` |
| 알림 | 앱이 열려 있을 때만 동작. 서비스워커 `showNotification` 우선, 기기별/항목별 on·off, 테스트 | `checkAlarms`, `showNotif`, `toggleNotif`, `toggleItemAlarm` |
| 캘린더 내보내기 | 수행평가/일정 → `.ics` (VALARM, RRULE/EXDATE 포함). OS 캘린더가 백그라운드 알림을 담당 | `icsEvent`, `icsEventEvt`, `downloadICS` |
| 이미지 첨부 | 압축(원본≤1000px, 썸네일160px) 후 가족 동기화, 수행평가당 최대 6장, 상세에서 원본 지연 로딩 | `makeCloudImage`, `uploadImage`, `viewCloudImg`, `migrateLocalImages` |
| 가족코드 | 검증/생성/복사/변경(+데이터 이전) | `checkCode`, `genCode`, `changeFamilyCode`, `copyFamilyData` |
| 화면 설정 | 다크모드(자동/라이트/다크), 글자 크기 4단계 | `applyPrefs`, CSS `--fs`, `[data-theme=dark]` |
| 백업 | JSON 내보내기/불러오기, 텍스트 공유 | `exportJSON`, import 핸들러 |
| 가이드 | 과목별 수행평가 가이드(정적 데이터) | `GUIDE_SUBJECTS`, `buildGuideView` |

### 구현 시 지켜야 하는 관례
1. **글자 크기**: CSS/인라인의 모든 `font-size` 는 `calc(Npx*var(--fs))` 형태다. 새로 쓸 때도 같은 형태로.
2. **다크모드**: 색은 가능하면 `var(--card)/var(--text)/var(--muted)/var(--border)/var(--bg)` 사용. 인라인에 하드코딩된 밝은 색은 `[data-theme=dark] [style*="…"]{… !important}` 보정 규칙(파일 하단 CSS)으로 덮고 있다. 새 색을 하드코딩하면 이 목록에 추가 필요.
3. **보안 규칙과 맞추기**: items/events/images 쓰기 시 `data.id === 문서ID` 여야 한다. 문서 크기 한도(items·events 500KB, images 700KB, config 200KB).
4. **배치 쓰기**는 반드시 `batchWrite(ops,size)` 사용(Firestore 500건/10MiB 제한). 이미지 복사는 `size=15`.
5. **새 `config/*` 문서**를 추가하면 `firestore.rules` 의 `id in [...]` 목록, 코드 이전(`copyFamilyData`/`deleteFamilyData`)도 함께 수정.
6. 서비스워커나 정적 자원을 바꾸면 `sw.js` 의 `CACHE_NAME` 버전을 올린다.

---

## 6. 배포·운영

### 6-1. Firebase
1. 콘솔 → 프로젝트(`firebaseConfig.projectId`는 `index.html` 상단 참조) → Firestore Database 생성.
2. 규칙 탭에 `firestore.rules` 전체 붙여넣기 → 게시. (규칙을 바꿀 때마다 다시 게시)
3. (권장) 로컬에서 Firebase 에뮬레이터로 규칙 단위 테스트를 만들 것 — **현재 규칙은 한 번도 에뮬레이터/실서버로 평가해 보지 않았다.**

### 6-2. 정적 호스팅(GitHub Pages 가정)
- 저장소 Settings → Pages → 브랜치/폴더 지정. `manifest.json` 이 `/family-plan/` 경로를 가정하므로 저장소 이름이 다르면 `manifest.json`(`start_url`,`scope`)과 `sw.js` 경로 확인.
- 서비스워커 범위는 `registration.scope` 기준이라 하위 경로 변경에 비교적 안전하다.

### 6-3. 비용
- Spark(무료) 한도: 저장 1GiB, 읽기 5만/일, 쓰기 2만/일, 삭제 2만/일. 가족 1~2팀 규모에서는 한참 아래다.
- 이미지는 문서 크기가 크다(원본 대략 100~200KB). **저장 한도(1GiB)에 가장 먼저 영향**을 주는 기능이다. 수행평가당 6장 제한은 그래서 둔 것. 목록 화면은 썸네일만 읽고 원본은 탭할 때만 읽는다.

### 6-4. 버전 올리기
`sw.js` 의 `CACHE_NAME`(현재 `family-plan-v3`) 증가 → 푸시 → 사용자가 앱을 열면 갱신.

---

## 7. 테스트

```bash
# 저장소 루트에서
python3 -m http.server 8123 &
npm i -D playwright            # 최초 1회 (브라우저 필요 시 npx playwright install chromium)
node tools/test/smoke.js       # 모든 탭 렌더 + 핵심 흐름(추가/검색/요약/성적/ICS) 확인, 실패 시 exit 1
```
- `tools/test/firestore-stub.js` 는 gstatic 의 Firebase 스크립트를 대체한다. `window.__seed` 로 초기 데이터를, `window.__store` 로 저장 결과를 확인한다.
- 개발 중 쓴 개별 시나리오(반복 일정 계산, 템플릿, 검색, 성적, 이미지 업로드/삭제/이전, 코드 변경 복사)는 모두 이 방식으로 확인했다. 스모크 테스트에는 대표 흐름만 남겼다.
- **스텁이 검증하지 못하는 것**: 보안 규칙, 실제 네트워크/오프라인 동작, 문서 크기·요청 크기 제한, SDK 동작 차이.

---

## 8. 알려진 제한 / 위험 / 미구현

**제한**
- 알림은 **앱이 열려 있을 때만** 울린다(`setInterval` 60초 + 데이터 로드·화면 복귀 시 확인). 백그라운드 알림은 `.ics` 로 OS 캘린더에 맡기는 구조. 서버 푸시(FCM + 스케줄러)는 비용·구성 문제로 **보류**(GitHub Actions 크론 + 텔레그램/ntfy 방식이 무료 대안으로 검토됨).
- iOS: 웹 알림은 홈 화면에 추가한 앱(iOS 16.4+)에서만 가능.
- 반복 일정은 "이 날짜만 삭제 / 전체 삭제 / 전체 수정"만 지원. **특정 회차만 수정**은 없음. 매월 31일 반복은 짧은 달에 말일로 보정(캘린더 `.ics` 로 내보내면 일부 캘린더는 해당 달을 건너뛸 수 있음).
- `.ics` 는 한 번 가져가면 이후 앱에서 바꾼 내용이 캘린더에 자동 반영되지 않는다(같은 UID라 다시 가져오면 대개 갱신됨).
- 성적: 1학기=3~7월, 2학기=8~2월로 **고정 가정**. 목표 역산은 앱에 등록된 수행평가만 기준(등록 안 한 평가는 반영 불가). 성취수준(A~E) 컷은 90/80/70/60 고정이며 참고용.
- 공휴일은 2025~2031 **하드코딩**(`KR_HOL`) — 2031년 이후는 갱신 필요. 임시공휴일은 수동 추가.
- 과목 가이드(`GUIDE_SUBJECTS`)는 특정 학교·학년 기준의 정적 텍스트다.
- 이미지: 수행평가당 6장, 클라이언트 압축본만 저장(원본 보관 안 함). 다른 가족 기기에서 이미지를 지우면 원본 문서도 삭제된다. 수행평가를 지울 때 연결 이미지도 함께 삭제(`deleteItemFS`). 다만 **다른 기기가 오프라인 상태에서 삭제**하면 고아 이미지가 남을 수 있다(정리 도구 없음).
- 구성이 큰 단일 파일(`index.html` ~3,000줄). 기능이 더 늘면 JS를 모듈/파일로 분리하는 편이 좋다(현재는 빌드 없이 배포하려는 단순함을 택함).
- 다크모드는 인라인 색 보정 방식이라 새 화면에서 어색한 색이 나올 수 있다.
- 구독이 상시 5개(items/events/members/templates/goals). 규모가 커지면 읽기 한도에 영향.

**아직 하지 않은 것(후보)**
1. 인증 도입(익명/이메일) 및 규칙 강화 — §4
2. 서버 푸시 알림(C안) — 사용자가 "알림이 늦으면 보류"로 결정
3. 규칙 에뮬레이터 테스트, 실제 기기 E2E
4. 고아 이미지 정리, 이미지 저장 용량 표시
5. 반복 일정 회차별 예외 수정, 수행평가 자체의 반복 생성
6. 코드 분리(파일/모듈화)

---

## 9. 수동 점검 목록 (배포 후 실제 기기에서)

- [ ] 규칙 게시 후 수행평가·일정·구성원·템플릿·목표·이미지 각각 한 번씩 저장해 `permission-denied` 가 없는지
- [ ] 두 기기에서 같은 가족코드로 접속해 한쪽 변경이 다른 쪽에 바로 반영되는지 (체크 토글, 일정 추가, 이미지 첨부)
- [ ] 이미지 첨부(카메라/갤러리) → 상세 썸네일 → 탭해서 원본 로드 → 다른 기기에서도 보이는지
- [ ] 홈 화면에 설치 후 오프라인(비행기 모드)에서 마지막 데이터가 보이는지
- [ ] 알림: 권한 허용 → 설정의 "알림 테스트" → 마감 임박 항목 알림, 알림 탭 시 앱 열림
- [ ] `.ics` 다운로드 → 기본 캘린더로 가져오기(안드로이드/iOS), 알림 시각 확인
- [ ] 기존에 이 기기에만 저장돼 있던 이미지가 있으면 설정 → "이미지 공유하기"
- [ ] 가족 코드 변경(데이터 복사 포함)을 테스트 가족으로 먼저 해 볼 것 — 이전 코드 삭제 옵션은 신중히
- [ ] 다크모드/글자 크기 "아주 크게"에서 폼·시트가 잘리지 않는지

---

## 10. 변경 이력 요약 (최신순)

| 커밋 | 내용 |
|---|---|
| `b8fd9ba` | 이미지 첨부 동기화(썸네일+원본 분리, legacy 이전), 인수인계 문서, 테스트 도구 |
| `69701a0` | 성적 분석(학기·과목 누적, 목표, 추이) |
| `ebc1a9a` | 이번 주 할 일 요약, 전체 검색 |
| `3d3a702` | 반복 일정, 수행평가 템플릿, 동기화 중 폼 입력 보존 |
| `88a13b9` | 가족코드 강화, 담당자, 일정 .ics, 다크모드/글자 크기 |
| `20e4bd2` | 알림 켜기/끄기, 서비스워커 알림, 수행평가 .ics |
| `ec68031` | 알람 재발송 키, 배치 청크, 전체삭제 보강 |
| `a5e7e1e` | 보안 규칙 초안, PWA 경로·서비스워커, 중복 핸들러 제거 |
| `edd7b23` 이전 | 초기 업로드(원작성자) |

---

## 11. 자주 하는 작업 — 빠른 안내

- **새 필드를 수행평가에 추가**: `openAdd`/`openEdit`(폼 초기값) → `buildFormSheet`(입력 UI) → `saveForm`(저장 객체) → 표시 위치(`buildCard`/`buildDetailSheet`) → 필요하면 검색(`runSearch`)·ICS(`icsEvent`)·템플릿(`saveAsTemplate`/`applyTemplate`).
- **새 탭/화면**: `render()` 의 분기와 하단 `nav` 버튼, `setTab`.
- **규칙 바꾸기**: `firestore.rules` 수정 → 콘솔에 다시 게시 → 변경 내용을 이 문서 §3·§4에 반영.
- **공휴일 추가**: `KR_HOL` 배열에 `['YYYY-MM-DD','이름','#색']`.
- **이미지 한도 조정**: `MAX_IMG`(장수), `makeCloudImage`(해상도·품질), 규칙의 `images` 문서 크기.
