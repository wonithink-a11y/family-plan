// 앱 안 입력 시트(askSheet/askPin/askText) 테스트: PLAYWRIGHT_PATH=... node dev/ask-test.js  (가짜 Firestore, 외부 연결 없음)
const fs=require('fs'),path=require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.join(__dirname,'..'), tmp=path.join(root,'.tmp'); fs.mkdirSync(tmp,{recursive:true});
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g,'');
html=html.replace('<style>','<script>'+fs.readFileSync(path.join(__dirname,'firestore-stub.js'),'utf8')+'</script>\n<style>');
fs.writeFileSync(path.join(tmp,'index_ask.html'),html);
let fails=0; const errs=[];
const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m);if(!c)fails++;};
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--allow-file-access-from-files']});
  const ctx=await browser.newContext({viewport:{width:1138,height:712},deviceScaleFactor:1});
  await ctx.addInitScript(()=>{localStorage.setItem('fc','TEST');const real=window.fetch.bind(window);window.fetch=(u,o)=>String(u).includes('open-meteo')||String(u).includes('apis.data.go.kr')?Promise.resolve(new Response('{}',{status:500})):real(u,o);});  // 날씨 외부 요청은 가짜로 막음
  const page=await ctx.newPage(); page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
  await page.goto('file://'+path.join(tmp,'index_ask.html')); await page.waitForTimeout(800);
  const ev=(f,a)=>page.evaluate(f,a);
  const open=()=>ev(()=>!!document.querySelector('#ask-ov.open'));
  const wait=()=>page.waitForTimeout(260);

  console.log('\n[1] 텍스트 시트');
  await ev(()=>{window.__r=undefined;askText('칭찬 이유',{desc:'예: 동생을 도와줬어요',required:true,max:20}).then(v=>{window.__r=v;});}); await page.waitForTimeout(150);
  ok(await open(),'시트가 열림');
  ok(await ev(()=>document.activeElement.id==='ask-f0'),'입력칸에 포커스');
  await page.click('.ask-ok'); await page.waitForTimeout(50);
  ok(await ev(()=>window.__r===undefined&&document.querySelector('.ask-err').textContent.includes('입력')),'빈 값은 시트를 닫지 않고 안내만 보임');
  await page.fill('#ask-f0','  동생을 도왔어요  '); await page.keyboard.press('Enter'); await wait();
  ok(await ev(()=>window.__r)==='동생을 도왔어요','Enter로 확정, 앞뒤 공백 제거');
  ok(!await open()&&await ev(()=>!document.getElementById('ask-ov')),'닫히면 DOM에서 제거');

  console.log('\n[2] 취소(null) · Esc · 바깥 눌러 닫기 · 동시에 하나만');
  await ev(()=>{window.__r=undefined;askText('x').then(v=>{window.__r=v;});}); await page.waitForTimeout(100);
  ok(await ev(()=>askText('두번째'))===null,'이미 열려 있으면 두 번째 호출은 null');
  await page.keyboard.press('Escape'); await wait();
  ok(await ev(()=>window.__r)===null,'Esc = null');
  await ev(()=>{window.__r=undefined;askText('x').then(v=>{window.__r=v;});}); await page.waitForTimeout(100);
  await page.click('.ask-cancel'); await wait(); ok(await ev(()=>window.__r)===null,'취소 버튼 = null');
  await ev(()=>{window.__r=undefined;askText('x').then(v=>{window.__r=v;});}); await page.waitForTimeout(100);
  await page.mouse.click(5,5); await wait(); ok(await ev(()=>window.__r)===null,'바깥을 누르면 null');

  console.log('\n[3] 보조 버튼(자동 생성 · 삭제) · 검증 함수');
  await ev(()=>{window.__r=undefined;askText('가족 코드',{value:'old',extra:[{label:'자동 생성',set:()=>'ABCDEFGH12'}]}).then(v=>{window.__r=v;});}); await page.waitForTimeout(100);
  await page.click('[data-x="0"]'); ok(await ev(()=>document.getElementById('ask-f0').value)==='ABCDEFGH12','"자동 생성"이 입력칸을 채움');
  await page.click('.ask-ok'); await wait(); ok(await ev(()=>window.__r)==='ABCDEFGH12','채운 값으로 확정');
  await ev(()=>{window.__r=undefined;askText('목표',{value:'80',type:'number',validate:v=>v&&!(+v>=1&&+v<=100)?'1~100 사이 숫자를 입력해 주세요.':'',extra:[{label:'목표 삭제',resolve:''}]}).then(v=>{window.__r=v;});}); await page.waitForTimeout(100);
  ok(await ev(()=>document.getElementById('ask-f0').inputMode)==='numeric','숫자 입력은 숫자 키보드');
  await page.fill('#ask-f0','150'); await page.click('.ask-ok'); await page.waitForTimeout(50);
  ok(await ev(()=>window.__r===undefined&&document.querySelector('.ask-err').textContent.includes('1~100')),'검증 실패 시 시트 유지 + 안내');
  await page.click('[data-x="0"]'); await wait(); ok(await ev(()=>window.__r)==='','"목표 삭제"는 빈 문자열로 확정');

  console.log('\n[4] 재렌더에도 유지 (onSnapshot 대응)');
  await ev(()=>{window.__r=undefined;askText('x',{value:'abc'}).then(v=>{window.__r=v;});}); await page.waitForTimeout(100);
  await page.fill('#ask-f0','입력 중'); await ev(()=>{render();render();});
  ok(await ev(()=>document.getElementById('ask-f0')&&document.getElementById('ask-f0').value)==='입력 중','render() 후에도 입력값 유지');
  await page.keyboard.press('Escape'); await wait();

  console.log('\n[5] PIN 키패드');
  await ev(()=>{window.__r=undefined;askPin({title:'부모 PIN',noDelay:true,verify:async p=>p==='1234'?'':'PIN이 맞지 않아요.'}).then(v=>{window.__r=v;});}); await page.waitForTimeout(150);
  ok(await page.locator('.ask-pad button').count()===11,'키패드 버튼 11개(숫자 10 + 지우기)');
  ok(await ev(()=>[...document.querySelectorAll('.ask-pad button')].every(b=>b.getBoundingClientRect().height>=44)),'키 높이 44px 이상');
  for(const k of '1111')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(120);
  ok(await ev(()=>window.__r===undefined&&document.querySelector('.ask-err').textContent.includes('맞지'))&&await open(),'틀린 PIN: 시트 유지 + 안내');
  ok(await ev(()=>document.querySelectorAll('#ask-dots i.on').length)===0,'틀리면 입력이 지워짐');
  await page.click('[data-k="1"]'); await page.click('[data-k="2"]'); await page.click('[data-k="b"]');
  ok(await ev(()=>document.querySelectorAll('#ask-dots i.on').length)===1,'지우기 동작');
  await page.keyboard.press('2'); await page.keyboard.press('3'); await page.keyboard.press('4'); await page.waitForTimeout(150); await wait();
  ok(await ev(()=>window.__r)==='1234','물리 키보드 숫자로도 입력, 맞으면 PIN 반환');

  console.log('\n[6] PIN 5회 틀림 → 30초 대기');
  await ev(()=>{window.__r=undefined;askPin({title:'부모 PIN',noDelay:true,verify:async p=>'PIN이 맞지 않아요.'}).then(v=>{window.__r=v;});}); await page.waitForTimeout(150);
  for(let i=0;i<5;i++){for(const k of '9999')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(80);}
  ok(await ev(()=>[...document.querySelectorAll('.ask-pad button')].every(b=>b.disabled)),'5회 틀리면 키패드 잠김');
  ok(await ev(()=>/30초|29초/.test(document.querySelector('.ask-err').textContent)),'남은 시간 안내: '+await ev(()=>document.querySelector('.ask-err').textContent));
  await page.keyboard.press('Escape'); await wait();
  await ev(()=>{askPin({title:'부모 PIN',noDelay:true}).then(v=>{window.__r=v;});}); await page.waitForTimeout(150);
  ok(await ev(()=>[...document.querySelectorAll('.ask-pad button')].every(b=>b.disabled)),'닫았다 다시 열어도 대기 유지');
  await page.keyboard.press('Escape'); await wait();
  await ev(()=>{_pinLockUntil=0;_pinFails=0;});

  console.log('\n[7] PIN 최초 설정(한 번 더)');
  await ev(()=>{window.__r=undefined;askPin({title:'부모 PIN 설정',desc:'숫자 4자리',again:'한 번 더 입력해 주세요.',noDelay:true}).then(v=>{window.__r=v;});}); await page.waitForTimeout(150);
  for(const k of '1234')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(80);
  ok(await ev(()=>document.querySelector('.ask-d').textContent)==='한 번 더 입력해 주세요.','첫 입력 뒤 안내가 바뀜');
  for(const k of '1235')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(80);
  ok(await ev(()=>window.__r===undefined&&document.querySelector('.ask-err').textContent.includes('서로 달라요')&&document.querySelector('.ask-d').textContent==='숫자 4자리'),'다르면 안내 + 처음 단계로');
  for(const k of '4321')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(80);
  for(const k of '4321')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(80); await wait();
  ok(await ev(()=>window.__r)==='4321','두 번 같으면 PIN 반환');

  console.log('\n[8] 테스트용 답 큐(window.__askAnswer)');
  await ev(()=>{window.__askAnswer=['답1',null,'1234'];});
  ok(await ev(()=>askText('a'))==='답1'&&await ev(()=>askText('b'))===null&&await ev(()=>askPin({}))==='1234','큐에서 순서대로 답하고 null은 취소');

  console.log('\n[8b] 실제 흐름: parentAuth (설정 → 틀림 → 맞음) / changePin');
  await ev(()=>{S.reward=Object.assign({},S.reward,{pinHash:''});_pinUntil=0;window.__r=undefined;parentAuth().then(v=>{window.__r=v;});}); await page.waitForTimeout(150);
  ok(await page.locator('.ask-t').textContent()==='부모 PIN 설정','PIN이 없으면 설정 시트');
  for(const k of '1234')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(250);
  for(const k of '1234')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(500);
  ok(await ev(()=>window.__r)===true,'설정 완료 → 인증 통과');
  const hash=await ev(()=>{const e=Object.entries(window.__store).find(([k])=>k.includes('meta/reward'));return e&&e[1].pinHash;}); ok(hash&&hash.length===64,'PIN 해시가 Firestore(meta/reward)에 저장됨');
  await ev(async h=>{S.reward=Object.assign({},S.reward,{pinHash:h});_pinUntil=0;window.__r=undefined;parentAuth().then(v=>{window.__r=v;});},hash); await page.waitForTimeout(150);
  ok(await page.locator('.ask-t').textContent()==='부모 PIN','PIN이 있으면 입력 시트');
  for(const k of '0000')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(400);
  ok(await ev(()=>window.__r===undefined&&document.querySelector('.ask-err').textContent.includes('맞지')),'틀린 PIN은 시트 유지');
  for(const k of '1234')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(500);
  ok(await ev(()=>window.__r)===true,'맞는 PIN → 통과(5분 유지)');
  ok(await ev(()=>parentAuth()),'5분 안에는 다시 묻지 않음');
  await ev(()=>{_pinUntil=0;window.__r=undefined;changePin().then(()=>{window.__r='end';});}); await page.waitForTimeout(150);
  for(const k of '1234')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(500);
  ok(await page.locator('.ask-t').textContent()==='새 PIN','현재 PIN 확인 뒤 새 PIN 시트');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await ev(()=>window.__r)==='end','새 PIN 입력을 취소하면 아무것도 바꾸지 않고 끝남');

  console.log('\n[8c] 실제 흐름: 목표·구성원·도장 이유·루틴');
  await ev(()=>{window.__r=undefined;setGoal('수학').then(()=>{window.__r='end';});}); await page.waitForTimeout(150);
  ok(await page.locator('[data-x]').count()===0,'목표가 없으면 "목표 삭제" 버튼 없음');
  await page.fill('#ask-f0','150'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  ok(await ev(()=>/1~100/.test(document.querySelector('.ask-err').textContent)),'100 초과는 시트 안에서 안내');
  await page.fill('#ask-f0','95'); await page.keyboard.press('Enter'); await wait();
  ok(await ev(()=>(S.goals.find(g=>g.subject==='수학')||{}).target)===95,'목표 95% 저장');
  await ev(()=>{setGoal('수학');}); await page.waitForTimeout(150);
  ok(await ev(()=>document.getElementById('ask-f0').value)==='95'&&await page.locator('[data-x]').count()===1,'현재 목표가 채워지고 "목표 삭제" 표시');
  await page.click('[data-x="0"]'); await wait();
  ok(await ev(()=>!S.goals.some(g=>g.subject==='수학')),'목표 삭제');
  const mb=await ev(()=>S.members.length);
  await ev(()=>{window.__askAnswer=['민수'];return addMember();}); await page.waitForTimeout(100);
  ok(await ev(()=>S.members.some(m=>m.name==='민수'))&&await ev(()=>S.members.length)===mb+1,'구성원 추가(askText)');
  await ev(()=>{window.__askAnswer=[null];return addMember();});
  ok(await ev(()=>S.members.length)===mb+1,'구성원 추가 취소 시 변화 없음');
  const st0=await ev(()=>Object.keys(window.__store).filter(k=>k.includes('/stamps/')).length);
  await ev(()=>{_pinUntil=0;window.__askAnswer=['1234','동생을 도와줬어요'];return stampFlow();}); await page.waitForTimeout(300);
  ok(await ev(()=>Object.keys(window.__store).filter(k=>k.includes('/stamps/')).length)===st0+1,'PIN 통과 후 이유를 적으면 도장 +1');
  await ev(()=>{_pinUntil=0;window.__askAnswer=['1234',null];return stampFlow();}); await page.waitForTimeout(200);
  ok(await ev(()=>Object.keys(window.__store).filter(k=>k.includes('/stamps/')).length)===st0+1,'이유 입력을 취소하면 도장 안 찍힘');
  await ev(()=>{_pinUntil=0;window.__askAnswer=['0000'];return stampFlow();}); await page.waitForTimeout(200);
  ok(await ev(()=>Object.keys(window.__store).filter(k=>k.includes('/stamps/')).length)===st0+1,'틀린 PIN이면 도장 안 찍힘');
  await ev(()=>{_pinUntil=0;window.__askAnswer=['1234','양치, 세수, 가방'];return editRoutine();}); await page.waitForTimeout(300);
  ok(await ev(()=>S.routineItems.map(i=>i.text).join('|'))==='양치|세수|가방','루틴 항목 편집(쉼표 구분 유지)');
  await ev(()=>{S.form={...(S.form||{}),subject:'과학',tasks:[{id:'t1',text:'실험 보고서',done:false}]};window.__askAnswer=['과학 보고서'];return saveAsTemplate();}); await page.waitForTimeout(200);
  ok(await ev(()=>S.templates.some(t=>t.name==='과학 보고서'&&t.subject==='과학')),'템플릿 이름 입력(askText) 후 저장');
  const code0=await ev(()=>S.familyCode); await ev(()=>{window.__askAnswer=[null];return changeFamilyCode();}); await page.waitForTimeout(100);
  ok(await ev(()=>S.familyCode)===code0,'가족 코드 변경 취소 시 그대로');
  await ev(()=>{window.__askAnswer=[];});

  console.log('\n[8d] 토스트(notify)');
  await ev(()=>{document.querySelectorAll('#nt-stack,#nt-center').forEach(e=>e.remove());});  // 앞 단계(도장 축하 등)에서 남은 안내 정리
  await ev(()=>{notify('저장했어요',{kind:'ok',ms:300});notify('경고예요',{kind:'warn',ms:5000});notify('오류예요',{kind:'error',ms:5000});});
  await page.waitForTimeout(60);
  ok(await ev(()=>[...document.querySelectorAll('.nt')].map(e=>e.getAttribute('role')).join(','))==='status,alert,alert','역할: 성공=status, 경고·오류=alert');
  ok(await ev(()=>document.querySelectorAll('.nt-x').length)===2,'경고·오류에만 닫기 버튼');
  await page.waitForTimeout(700);
  ok(await ev(()=>document.querySelectorAll('.nt').length)===2,'성공 토스트는 자동으로 사라짐');
  await ev(()=>{notify('넷째',{kind:'info',ms:5000});notify('다섯째',{kind:'info',ms:5000});});
  ok(await ev(()=>document.querySelectorAll('.nt').length)===3,'최대 3개까지만 쌓임');
  await page.screenshot({path:path.join(tmp,'notify_stack.png')});
  await page.click('.nt-x'); await page.waitForTimeout(300);
  ok(await ev(()=>document.querySelectorAll('.nt').length)===2,'닫기 버튼으로 닫힘');
  await ev(()=>{document.getElementById('nt-stack').remove();});
  ok(await ev(()=>{const e=notify('<b>태그</b> \n 둘째 줄',{kind:'info',ms:100});return e.querySelector('.nt-t').innerHTML.includes('&lt;b&gt;');}),'문구는 이스케이프됨');
  await page.waitForTimeout(400);

  console.log('\n[8e] 확인·선택·안내 모달');
  await ev(()=>{window.__r=undefined;askConfirm({title:'일정을 삭제할까요?',desc:'모든 기기에서 삭제돼요',ok:'삭제',danger:true}).then(v=>{window.__r=v;});}); await page.waitForTimeout(200);
  ok(await ev(()=>document.activeElement.classList.contains('ask-cancel')),'위험 확인은 기본 포커스가 "취소"');
  ok(await ev(()=>getComputedStyle(document.querySelector('.ask-danger')).backgroundColor!==getComputedStyle(document.querySelector('.ask-cancel')).backgroundColor),'삭제 버튼은 위험색');
  await page.screenshot({path:path.join(tmp,'confirm_danger.png')});
  await page.keyboard.press('Enter'); await wait();
  ok(await ev(()=>window.__r)===false,'포커스된 취소에서 Enter = false');
  await ev(()=>{window.__r=undefined;askConfirm({title:'삭제할까요?',ok:'삭제',danger:true}).then(v=>{window.__r=v;});}); await page.waitForTimeout(200);
  await page.click('.ask-danger'); await wait(); ok(await ev(()=>window.__r)===true,'삭제 버튼 = true');
  await ev(()=>{window.__r=undefined;askConfirm({title:'사용 처리할까요?'}).then(v=>{window.__r=v;});}); await page.waitForTimeout(200);
  ok(await ev(()=>document.activeElement.dataset.c==='0'),'일반 확인은 기본 포커스가 확인');
  await page.keyboard.press('Escape'); await wait(); ok(await ev(()=>window.__r)===false,'Esc = false');
  await ev(()=>{window.__r=undefined;askChoice({title:'반복 일정이에요',desc:'11월 23일',choices:[{label:'이 날짜만 삭제',value:'one'},{label:'반복 일정 전체 삭제',value:'all',danger:true}]}).then(v=>{window.__r=v;});}); await page.waitForTimeout(200);
  ok(await page.locator('.ask-stack button').count()===3,'선택지 2개 + 취소');
  await page.screenshot({path:path.join(tmp,'choice_stack.png')});
  await page.click('[data-c="1"]'); await wait(); ok(await ev(()=>window.__r)==='all','선택한 value 반환');
  await ev(()=>{window.__r=undefined;askChoice({title:'x',choices:[{label:'a',value:'a'}]}).then(v=>{window.__r=v;});}); await page.waitForTimeout(150);
  await page.click('.ask-cancel'); await wait(); ok(await ev(()=>window.__r)===null,'선택 취소 = null');
  await ev(()=>{window.__r=[];askConfirm({title:'첫째'}).then(v=>window.__r.push('1:'+v));askConfirm({title:'둘째'}).then(v=>window.__r.push('2:'+v));}); await page.waitForTimeout(250);
  ok(await ev(()=>document.querySelector('.ask-t').textContent)==='첫째'&&await ev(()=>document.querySelectorAll('.ask-ov').length)===1,'모달 2개는 순서대로(첫째만 열림)');
  await page.click('[data-c="0"]'); await page.waitForTimeout(500);
  ok(await ev(()=>document.querySelector('.ask-t')&&document.querySelector('.ask-t').textContent)==='둘째','첫째가 닫히면 둘째가 열림');
  await page.click('.ask-cancel'); await page.waitForTimeout(300); ok(await ev(()=>window.__r.join(','))==='1:true,2:false','각자 자기 답을 받음');
  await ev(()=>{window.__r=undefined;askText('입력 중').then(v=>{});askConfirm({title:'기다림'}).then(v=>{window.__r=v;});}); await page.waitForTimeout(200);
  ok(await ev(()=>document.querySelector('.ask-t').textContent)==='입력 중','입력 시트가 열려 있으면 확인은 기다림');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  ok(await ev(()=>document.querySelector('.ask-t').textContent)==='기다림','입력 시트가 닫히면 확인이 열림');
  await page.keyboard.press('Escape'); await wait();
  await ev(()=>{window.__r=undefined;askInfo({title:'새 가족 코드',desc:'가족에게 공유해 주세요.',copy:'ABCD1234'}).then(()=>{window.__r='closed';});}); await page.waitForTimeout(200);
  ok(await page.locator('[data-x="0"]').count()===1&&await page.locator('.ask-cancel').count()===0,'안내는 복사 버튼 + 확인만(취소 없음)');
  await page.click('[data-c="0"]'); await wait(); ok(await ev(()=>window.__r)==='closed','확인하면 닫힘');
  await ev(()=>{window.__askAuto=k=>k==='confirm'?true:k==='choice'?'zzz':'1234';});
  ok(await ev(()=>askConfirm({title:'x'}))===true&&await ev(()=>askChoice({title:'x',choices:[{label:'a',value:'A'},{label:'b',value:'B'}]}))==='A','테스트 훅: 확인=true, 선택=첫 선택지');
  await ev(()=>{window.__askAuto=null;});

  console.log('\n[8f] alert·confirm 교체 (소스 검사 + 실제 흐름)');
  const src=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  ok(!/(?<![\w.$])(alert|confirm|prompt)\(/.test(src),'index.html 에 alert()/confirm()/prompt() 호출이 남아 있지 않음(주석 제외)');
  // 반복 일정 삭제: 이 날짜만 / 전체 / 취소
  await ev(()=>{S.events=[{id:'rep1',title:'반복 일정',startDate:'2026-11-23',endDate:'2026-11-23',date:'2026-11-23',allDay:true,repeat:'weekly',category:'일반'},...S.events];});
  await ev(()=>{window.__r=undefined;deleteEvt('rep1','2026-11-23').then(()=>{window.__r='end';});}); await page.waitForTimeout(200);
  ok(await page.locator('.ask-stack button').count()===3&&await ev(()=>document.querySelector('.ask-t').textContent)==='반복 일정이에요','반복 일정은 3지선다(이 날짜만·전체·취소)');
  await page.click('.ask-cancel'); await page.waitForTimeout(250);
  ok(await ev(()=>S.events.some(e=>e.id==='rep1'&&!(e.exdates||[]).length)),'취소하면 그대로');
  await ev(()=>{deleteEvt('rep1','2026-11-23');}); await page.waitForTimeout(200); await page.click('[data-c="0"]'); await page.waitForTimeout(300);
  ok(await ev(()=>(S.events.find(e=>e.id==='rep1')||{}).exdates&&S.events.find(e=>e.id==='rep1').exdates.includes('2026-11-23')),'"이 날짜만 삭제"는 해당 날짜만 제외');
  await ev(()=>{deleteEvt('rep1','2026-11-30');}); await page.waitForTimeout(200); await page.click('[data-c="1"]'); await page.waitForTimeout(300);
  ok(await ev(()=>!S.events.some(e=>e.id==='rep1')),'"전체 삭제"는 일정이 사라짐');
  // 모든 데이터 삭제: 부모 PIN 필요
  await ev(()=>{S.items=S.items.length?S.items:[{id:'zz',subject:'수학',dueDate:todayStr(),tasks:[]}];_pinUntil=0;window.__r=undefined;clearAll().then(()=>{window.__r='end';});}); await page.waitForTimeout(200);
  ok(await ev(()=>document.querySelector('.ask-t').textContent)==='부모 PIN','"전체 초기화"는 먼저 부모 PIN을 물음');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await ev(()=>window.__r)==='end'&&await ev(()=>S.items.length)>0,'PIN을 취소하면 아무것도 지우지 않음');
  await ev(()=>{_pinUntil=0;window.__r=undefined;clearAll().then(()=>{window.__r='end';});}); await page.waitForTimeout(200);
  for(const k of '1234')await page.click(`[data-k="${k}"]`); await page.waitForTimeout(500);
  ok(await ev(()=>document.querySelector('.ask-t').textContent)==='모든 데이터(수행평가+일정)를 삭제할까요?'&&await ev(()=>document.activeElement.classList.contains('ask-cancel')),'PIN 통과 후 위험 확인(기본 포커스 취소)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await ev(()=>S.items.length)>0,'확인에서 취소하면 삭제 안 됨');
  console.log('\n[8g] 폼 검증: 입력칸 아래 인라인 오류');
  const nt0=await ev(()=>document.querySelectorAll('.nt').length);
  // 수행평가 등록 폼
  await ev(()=>{openAdd();}); await page.waitForTimeout(200);
  const n0=await ev(()=>S.items.length);
  await ev(()=>{saveForm();}); await page.waitForTimeout(100);
  ok(await ev(()=>['f-subj','f-date'].every(id=>document.getElementById(id+'-err')&&document.getElementById(id).getAttribute('aria-invalid')==='true')&&!!document.querySelector('#ftl+.f-err')),'빈 폼: 과목·제출일·수행 내용 칸마다 오류가 붙음');
  ok(await ev(()=>document.activeElement.id)==='f-subj','첫 오류 칸(과목)에 포커스');
  ok(await ev(()=>document.getElementById('f-subj').getAttribute('aria-describedby')==='f-subj-err'&&document.getElementById('f-subj-err').getAttribute('role')==='alert'),'오류 문구와 입력칸이 aria 로 연결됨');
  ok(await ev(()=>document.querySelectorAll('.nt').length)===nt0&&await ev(()=>S.items.length)===n0,'토스트는 안 뜨고 저장도 안 됨');
  await page.screenshot({path:path.join(tmp,'form_errors_1138_light.png')});
  await page.fill('#f-subj','수학');
  ok(await ev(()=>!document.getElementById('f-subj-err')&&!document.getElementById('f-subj').classList.contains('f-bad')&&!!document.getElementById('f-date-err')),'고치기 시작하면 그 칸의 오류만 사라짐');
  await page.fill('#f-date',await ev(()=>todayStr())); await ev(()=>{const i=document.querySelector('#ftl input');i.value='1단계';i.dispatchEvent(new Event('input',{bubbles:true}));});
  ok(await ev(()=>!document.querySelector('.f-err')),'모두 고치면 오류가 없음');
  await ev(()=>{saveForm();}); await page.waitForTimeout(200);
  ok(await ev(()=>S.items.length)===n0+1,'통과하면 저장됨');
  // 템플릿 저장: 수행 내용 비었을 때
  await ev(()=>{openAdd();}); await page.waitForTimeout(200); await page.fill('#f-subj','과학');
  const tp0=await ev(()=>S.templates.length);
  await ev(()=>{saveAsTemplate();}); await page.waitForTimeout(150);
  ok(await ev(()=>!document.getElementById('f-date-err')&&!!document.querySelector('#ftl+.f-err'))&&await ev(()=>S.templates.length)===tp0,'템플릿 저장: 제출일은 묻지 않고 수행 내용만 오류');
  await ev(()=>closeOverlay());
  // 일정 폼
  await ev(()=>{openEvtAdd();}); await page.waitForTimeout(250);
  await ev(()=>{saveEvtForm();}); await page.waitForTimeout(100);
  ok(await ev(()=>!!document.getElementById('ef-title-err')),'일정: 제목 비면 인라인 오류');
  await page.fill('#ef-title','시험'); await ev(()=>{const a=document.getElementById('ef-start-date'),b=document.getElementById('ef-end-date');a.value='2026-12-10';b.value='2026-12-01';});
  await ev(()=>{saveEvtForm();}); await page.waitForTimeout(100);
  ok(await ev(()=>!document.getElementById('ef-title-err')&&/이후/.test((document.getElementById('ef-end-date-err')||{}).textContent||'')),'일정: 종료일이 시작일보다 빠르면 종료일 칸에 오류');
  await ev(()=>closeEvtOverlay());
  // 준비물 요청
  await ev(()=>{openPrep();}); await page.waitForTimeout(200);
  await ev(()=>{savePrep();}); await page.waitForTimeout(100);
  ok(await ev(()=>!!document.getElementById('prep-text-err')&&!document.getElementById('prep-date-err')),'준비물: 비어 있는 칸에만 오류');
  await ev(()=>closeOverlay());
  // 입력 시트의 검증(구성원 중복, 루틴, 가족 코드)
  await ev(()=>{S.members=[{name:'민수',color:'#5B7FFF'}];addMember();}); await page.waitForTimeout(200);
  await page.fill('#ask-f0','민수'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  ok(await open()&&await ev(()=>document.querySelector('.ask-err').textContent)==='이미 있는 이름이에요.'&&await ev(()=>document.getElementById('ask-f0').getAttribute('aria-invalid'))==='true','구성원 중복: 시트 안에서 안내');
  await page.fill('#ask-f0','영희'); await page.keyboard.press('Enter'); await wait();
  ok(await ev(()=>S.members.some(m=>m.name==='영희')),'고쳐서 확인하면 추가됨');
  await ev(()=>{_pinUntil=Date.now()+100000;editRoutine();}); await page.waitForTimeout(200);
  await page.fill('#ask-f0',' , , '); await page.click('.ask-ok'); await page.waitForTimeout(80);
  ok(await open()&&await ev(()=>document.querySelector('.ask-err').textContent.includes('한 개 이상')),'루틴: 빈 항목은 시트 안에서 안내');
  await page.keyboard.press('Escape'); await wait();
  await ev(()=>{window.__fhd=familyHasData;familyHasData=async()=>false;});  // 가짜 Firestore 는 빈 결과를 '데이터 있음'으로 읽으므로 새 코드로 가정
  await ev(()=>{changeFamilyCode();}); await page.waitForTimeout(200);
  await page.fill('#ask-f0','abc'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok(await open()&&await ev(()=>document.querySelector('.ask-err').textContent.includes('8자 이상')),'가족 코드: 약한 코드는 (비동기 검사 후) 시트 안에서 안내');
  const cur=await ev(()=>S.familyCode); await page.fill('#ask-f0',cur); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok(await open()&&await ev(()=>document.querySelector('.ask-err').textContent)==='현재 코드와 같아요.','가족 코드: 현재 코드와 같으면 안내');
  await page.keyboard.press('Escape'); await wait();
  await ev(()=>{familyHasData=window.__fhd;familyHasData=async()=>false;});
  // 시작 화면의 가족 코드 칸
  await ev(()=>{const i=document.createElement('input');i.id='fc-input';i.className='f-input';document.body.appendChild(i);startWithCode();}); await page.waitForTimeout(250);
  ok(await ev(()=>/입력/.test((document.getElementById('fc-input-err')||{}).textContent||'')),'시작 화면: 빈 코드는 인라인 오류');
  await ev(()=>{const i=document.getElementById('fc-input');i.value='abc';startWithCode();}); await page.waitForTimeout(300);
  ok(await ev(()=>/8자 이상/.test((document.getElementById('fc-input-err')||{}).textContent||'')),'시작 화면: 약한 코드는 인라인 오류');
  await ev(()=>{clearFieldErr('fc-input');document.getElementById('fc-input').remove();});
  ok(await ev(()=>document.querySelectorAll('.nt-warn').length)===0,'폼 검증 때문에 경고 토스트가 뜬 곳이 없음');
  await ev(()=>{document.getElementById('nt-stack')&&document.getElementById('nt-stack').remove();});

  console.log('\n[8h] asToast·flashStamp → notify 통합');
  const src2=fs.readFileSync(path.join(root,'index.html'),'utf8');
  ok(!/\basToast\b|\bflashStamp\b|\bstampMsg\b|stamp-toast|as-toast/.test(src2),'소스에 asToast·flashStamp·stampMsg·옛 토스트 CSS가 없음');
  await ev(()=>{document.querySelectorAll('#nt-stack,#nt-center').forEach(e=>e.remove());});
  // 같은 문구는 쌓지 않고 시간만 다시 센다
  await ev(()=>{notify('같은 문구',{kind:'info',ms:5000});notify('같은 문구',{kind:'info',ms:5000});notify('다른 문구',{kind:'info',ms:5000});});
  ok(await ev(()=>document.querySelectorAll('#nt-stack .nt').length)===2,'같은 문구가 연달아 와도 한 개만 뜸');
  // 도장 축하: 가운데 큰 토스트, 이모지 없음, 화면을 다시 그리지 않음
  await ev(()=>{document.getElementById('nt-stack').remove();});
  await ev(()=>{_pinUntil=0;window.__askAnswer=['1234','통합 테스트'];return stampFlow();}); await page.waitForTimeout(500);
  const big=await ev(()=>{const e=document.querySelector('#nt-center .nt-big');if(!e)return null;const r=e.getBoundingClientRect();return{t:e.textContent,cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),w:innerWidth,h:innerHeight,pe:getComputedStyle(document.getElementById('nt-center')).pointerEvents,role:e.getAttribute('role')};});
  ok(big&&/칭찬 도장 \+1|완성/.test(big.t)&&!/[\u{1F300}-\u{1FAFF}]/u.test(big.t),'도장을 찍으면 가운데에 큰 안내(이모지 없음): '+(big&&big.t.replace(/\n/g,' ')));
  ok(big&&Math.abs(big.cx-big.w/2)<4&&big.cy>big.h*0.25&&big.cy<big.h*0.6&&big.pe==='none'&&big.role==='status','가로 가운데, 클릭은 통과, role=status');
  await page.screenshot({path:path.join(tmp,'stamp_big.png')});
  await page.waitForTimeout(2800); ok(await ev(()=>!document.querySelector('#nt-center .nt-big')),'축하 안내는 2.6초 뒤 사라짐');
  // 루미 시트가 열려 있으면 알림은 위쪽
  await ev(()=>{asOpen('settings');}); await page.waitForTimeout(250);
  await ev(()=>{notify('루미 시트 위 알림',{kind:'info',ms:3000});}); await page.waitForTimeout(150);
  ok(await ev(()=>document.getElementById('nt-stack').classList.contains('top')&&document.getElementById('nt-stack').getBoundingClientRect().top<60),'루미 시트가 열려 있으면 알림은 화면 위쪽');
  await ev(()=>{asClose();}); await page.waitForTimeout(200);
  await ev(()=>{document.querySelectorAll('#nt-stack,#nt-center').forEach(e=>e.remove());});

  console.log('\n[9] 화면 확인 (가짜 서버 기준 캡처)');
  const shots=[[1138,712,'light'],[1138,712,'dark'],[1280,800,'dark'],[1280,800,'light'],[390,844,'light'],[390,844,'dark']];
  for(const [w,h,th] of shots){
    await page.setViewportSize({width:w,height:h});
    await ev(t=>{S.theme=t;applyPrefs();},th);
    await ev(()=>{askText('칭찬 이유',{desc:'예: 동생을 도와줬어요',placeholder:'적어 주세요'});}); await page.waitForTimeout(350);
    await page.screenshot({path:path.join(tmp,`ask_text_${w}_${th}.png`)});
    const m=await ev(()=>{const b=document.querySelector('.ask-box').getBoundingClientRect();return{r:b.right<=innerWidth&&b.bottom<=innerHeight&&b.left>=0,bg:getComputedStyle(document.querySelector('.ask-box')).backgroundColor};});
    ok(m.r,`텍스트 시트가 화면 안 ${w}×${h} ${th} (${m.bg})`);
    await page.keyboard.press('Escape'); await wait();
    await ev(()=>{askPin({title:'부모 PIN',desc:'도장 찍기에 필요해요'});}); await page.waitForTimeout(350);
    await page.screenshot({path:path.join(tmp,`ask_pin_${w}_${th}.png`)});
    const m2=await ev(()=>{const b=document.querySelector('.ask-box').getBoundingClientRect();return b.bottom<=innerHeight&&b.top>=0;});
    ok(m2,`PIN 시트가 화면 안 ${w}×${h} ${th}`);
    await page.keyboard.press('Escape'); await wait();
    await ev(()=>{document.getElementById('nt-stack')&&document.getElementById('nt-stack').remove();notify('저장하지 못했어요. 인터넷 연결과 Firestore 규칙을 확인해 주세요.\npermission-denied',{kind:'error',ms:6000});notify('가족 코드를 복사했어요.',{kind:'ok',ms:6000});}); await page.waitForTimeout(350);
    await page.screenshot({path:path.join(tmp,`toast_${w}_${th}.png`)});
    const m3=await ev(()=>{const st=document.getElementById('nt-stack').getBoundingClientRect(),nav=document.querySelector('.bnav,.bottom-nav,nav');const kids=[...document.querySelectorAll('.nt')].map(e=>e.getBoundingClientRect());return{inside:kids.every(b=>b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight&&b.height>=40),bottom:Math.round(Math.max(...kids.map(b=>b.bottom))),h:innerHeight};});
    ok(m3.inside&&(w>=1000||m3.bottom<=m3.h-72),`토스트가 화면 안, 폰은 하단 메뉴 위 ${w}×${h} ${th} (bottom ${m3.bottom}/${m3.h})`);
    await ev(()=>{document.getElementById('nt-stack').remove();askConfirm({title:'모든 데이터(수행평가+일정)를 삭제할까요?',desc:'모든 가족 기기에서 삭제됩니다. 복구할 수 없어요.',ok:'모두 삭제',danger:true});}); await page.waitForTimeout(350);
    await page.screenshot({path:path.join(tmp,`confirm_${w}_${th}.png`)});
    ok(await ev(()=>{const b=document.querySelector('.ask-box').getBoundingClientRect();return b.bottom<=innerHeight&&b.top>=0&&b.right<=innerWidth;}),`확인 시트가 화면 안 ${w}×${h} ${th}`);
    await page.keyboard.press('Escape'); await wait();
  }

  console.log('\n[10] 폼 오류 화면 (가짜 서버 기준 캡처)');
  for(const [w,h,th] of [[1138,712,'dark'],[390,844,'light'],[390,844,'dark']]){
    await page.setViewportSize({width:w,height:h}); await ev(t=>{S.theme=t;applyPrefs();},th); await page.waitForTimeout(400);
    await ev(()=>{openAdd();}); await page.waitForTimeout(350); await ev(()=>{saveForm();}); await page.waitForTimeout(350);
    await page.screenshot({path:path.join(tmp,`form_errors_${w}_${th}.png`)});
    const m=await ev(()=>{const all=[...document.querySelectorAll('.f-err')],e=all[0],r=e.getBoundingClientRect(),c=getComputedStyle(e).color,bg=getComputedStyle(document.querySelector('.sheet')).backgroundColor;return{vis:r.top>=0&&r.bottom<=innerHeight&&all.every(x=>x.getBoundingClientRect().height>0),c,bg,n:all.length};});
    ok(m.vis&&m.n===3,`오류 문구 3개가 그려지고 첫 오류가 화면 안에 보임 ${w}×${h} ${th} (글자 ${m.c} / 바탕 ${m.bg})`);
    await ev(()=>closeOverlay()); await page.waitForTimeout(150);
  }

  console.log(errs.length?'\n페이지 오류:\n  '+errs.join('\n  '):'\n페이지 오류: 없음');
  await browser.close();
  console.log(fails||errs.length?'\n실패 있음':'\n모든 검사 통과'); process.exit(fails||errs.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
