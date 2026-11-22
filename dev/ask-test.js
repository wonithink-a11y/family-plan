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
  await ev(()=>{_pinUntil=0;window.__askAnswer=['1234',[{id:'d0',text:'양치'},{id:'n1',text:'세수'},{id:'n2',text:'가방'}]];return editRoutine();}); await page.waitForTimeout(300);
  ok(await ev(()=>S.routineItems.map(i=>i.text).join('|'))==='양치|세수|가방','루틴 항목 편집(목록 시트 결과 저장)');
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
  ok(await ev(()=>document.querySelector('.ask-t').textContent)==='아침 루틴 편집'&&await page.locator('.ask-rowin').count()===3,'루틴 편집은 항목별 목록 시트(행 3개)');
  for(let i=0;i<3;i++)await page.fill(`.ask-rowin[data-r="${i}"]`,' '); await page.click('.ask-ok'); await page.waitForTimeout(80);
  ok(await open()&&await ev(()=>document.querySelector('.ask-err').textContent.includes('한 개 이상')),'루틴: 전부 비우면 시트 안에서 안내');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await wait();
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

  console.log('\n[8i] askList: 항목별 목록 편집');
  const L3=()=>[{id:'a',text:'양치'},{id:'b',text:'세수'},{id:'c',text:'가방'}];
  const openList=()=>ev(l=>{window.__r=undefined;askList({title:'아침 루틴 편집',desc:'항목을 고치고 순서를 바꿔요.',items:l,max:10,maxLen:20,noun:'항목',placeholder:'예: 양치하기',extra:[{label:'기본 항목으로',set:()=>[{id:'d0',text:'기본1'},{id:'d1',text:'기본2'}]}]}).then(v=>{window.__r=v;});},L3());
  const rowTxt=()=>ev(()=>[...document.querySelectorAll('.ask-rowin')].map(e=>e.value).join('|'));
  await openList(); await page.waitForTimeout(250);
  ok(await rowTxt()==='양치|세수|가방'&&await ev(()=>document.getElementById('ask-cnt').textContent)==='3/10','행이 항목으로 채워지고 개수 3/10 표시');
  ok(await ev(()=>document.activeElement.classList.contains('ask-rowin')),'열면 첫 입력칸에 포커스');
  ok(await ev(()=>document.querySelector('[data-l="up"][data-i="0"]').disabled&&document.querySelector('[data-l="down"][data-i="2"]').disabled),'맨 위는 위로, 맨 아래는 아래로 이동 불가');
  ok(await ev(()=>[...document.querySelectorAll('.ask-row button')].every(b=>b.getAttribute('aria-label')&&b.getBoundingClientRect().width>=44&&b.getBoundingClientRect().height>=44)),'행 버튼은 모두 aria-label + 44px 이상');
  ok(await ev(()=>document.querySelector('[data-l="down"][data-i="0"]').getAttribute('aria-label'))==='1번 항목 아래로 이동','버튼 이름: 1번 항목 아래로 이동');
  await page.screenshot({path:path.join(tmp,'list_1138_light.png')});
  // 이름 고치기 → id 유지
  await page.fill('.ask-rowin[data-r="1"]','세수하기');
  // 이동
  await page.click('[data-l="down"][data-i="0"]');
  ok(await rowTxt()==='세수하기|양치|가방','아래로 이동하면 순서가 바뀜(고친 글자 유지)');
  ok(await ev(()=>document.activeElement.dataset.l==='down'&&document.activeElement.dataset.i==='1'),'이동 뒤에도 같은 방향 버튼에 포커스');
  ok(await ev(()=>document.getElementById('ask-live').textContent)==='1번 항목을 2번으로 옮겼어요.','이동을 읽어 주는 안내(aria-live)');
  await page.click('[data-l="up"][data-i="2"]'); ok(await rowTxt()==='세수하기|가방|양치','위로 이동');
  // 추가·삭제
  await page.click('[data-l="add"]');
  ok(await ev(()=>document.activeElement.dataset.r)==='3'&&await ev(()=>document.getElementById('ask-cnt').textContent)==='4/10','추가하면 새 행에 포커스, 4/10');
  await page.keyboard.type('책 챙기기');
  await page.click('[data-l="del"][data-i="1"]'); ok(await rowTxt()==='세수하기|양치|책 챙기기','삭제');
  // Enter: 다음 칸으로, 마지막 칸에서는 새 행
  await page.focus('.ask-rowin[data-r="0"]'); await page.keyboard.press('Enter');
  ok(await ev(()=>document.activeElement.dataset.r)==='1','Enter = 다음 칸으로 이동(저장하지 않음)');
  await page.focus('.ask-rowin[data-r="2"]'); await page.keyboard.press('Enter');
  ok(await ev(()=>document.querySelectorAll('.ask-rowin').length)===4&&await ev(()=>window.__r)===undefined,'마지막 칸에서 Enter = 새 행 추가');
  // 빈 줄은 저장할 때 버려짐(새 행이 비어 있음) + 결과 id 유지
  await page.click('.ask-ok'); await wait();
  const got=await ev(()=>window.__r);
  ok(JSON.stringify(got)===JSON.stringify([{id:'b',text:'세수하기'},{id:'a',text:'양치'},{id:got[2]&&got[2].id,text:'책 챙기기'}])&&got[2].id&&got[2].id!=='c','저장: 빈 줄은 버리고, 기존 항목은 id 유지·새 항목은 새 id');
  // 10개 한도
  await openList(); await page.waitForTimeout(250);
  for(let i=0;i<7;i++)await page.click('[data-l="add"]');
  ok(await ev(()=>document.getElementById('ask-cnt').textContent)==='10/10'&&await ev(()=>document.querySelector('[data-l="add"]').disabled),'10개가 되면 추가 버튼이 꺼짐');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(await open()&&/바꾼 내용/.test(await ev(()=>document.querySelector('.ask-err').textContent)),'바꾼 내용이 있으면 첫 Esc 는 안내만');
  await page.keyboard.press('Escape'); await wait(); ok(await ev(()=>window.__r)===null,'두 번째 Esc 에 닫힘(null)');
  // 안 바꿨으면 바로 닫힘
  await openList(); await page.waitForTimeout(250); await page.keyboard.press('Escape'); await wait(); ok(await ev(()=>window.__r)===null,'바꾸지 않았으면 한 번에 닫힘');
  // 고치면 경고 해제 후 다시 한 번 더 눌러야 함
  await openList(); await page.waitForTimeout(250); await page.fill('.ask-rowin[data-r="0"]','x'); await page.keyboard.press('Escape'); await page.fill('.ask-rowin[data-r="0"]','xy');
  ok(await ev(()=>document.querySelector('.ask-err').textContent)==='','다시 고치면 닫기 안내가 지워짐');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100); ok(await open(),'(다시 처음부터) 한 번 더 눌러야 닫힘'); await page.keyboard.press('Escape'); await wait();
  // 전부 비우면 저장 불가
  await openList(); await page.waitForTimeout(250);
  for(let i=0;i<3;i++)await page.fill(`.ask-rowin[data-r="${i}"]`,'  ');
  await page.click('.ask-ok'); await page.waitForTimeout(80);
  ok(await open()&&/한 개 이상/.test(await ev(()=>document.querySelector('.ask-err').textContent)),'전부 비우면 저장 안 되고 안내');
  // 기본 항목으로
  await page.click('[data-x="0"]'); ok(await rowTxt()==='기본1|기본2','"기본 항목으로"가 목록을 바꿈');
  await page.keyboard.press('Control+Enter'); await wait();
  ok(JSON.stringify(await ev(()=>window.__r))===JSON.stringify([{id:'d0',text:'기본1'},{id:'d1',text:'기본2'}]),'Ctrl+Enter 로 저장, 기본 항목 id 유지');
  // 20자 제한
  await openList(); await page.waitForTimeout(250);
  ok(await ev(()=>document.querySelector('.ask-rowin').maxLength)===20,'글자 수 제한 20자');
  await page.keyboard.press('Escape'); await wait();
  // 테스트 훅
  await ev(()=>{window.__askAnswer=[[{id:'q',text:'가'}],null];});
  ok(JSON.stringify(await ev(l=>askList({items:l}),L3()))==='[{"id":"q","text":"가"}]'&&await ev(l=>askList({items:l}),L3())===null,'테스트 훅: 큐의 배열은 그대로, null 은 취소');

  console.log('\n[8j] 루틴 항목 편집: id 유지 · 충돌 확인 · 도장 판정');
  const rtSet=(items,done,stamped)=>ev(async([i,d,st])=>{await routineRef().set({items:i});await routineDayRef(todayStr()).set({date:todayStr(),done:d,stamped:!!st});},[items,done||{},stamped]);
  const stampN=()=>ev(()=>Object.keys(window.__store).filter(k=>k.includes('/stamps/rt_')).length);
  const rtState=()=>ev(()=>({t:S.routineItems.map(i=>i.id+':'+i.text).join('|'),done:Object.keys(S.routineDay.done||{}).filter(k=>S.routineDay.done[k]).join(',')}));
  // 이름을 고쳐도 id 가 같아서 오늘 체크가 남는다
  await rtSet([{id:'a',text:'양치'},{id:'b',text:'세수'},{id:'c',text:'가방'}],{a:true}); await page.waitForTimeout(300);
  await ev(()=>{_pinUntil=Date.now()+100000;window.__askAnswer=[[{id:'a',text:'양치하기'},{id:'b',text:'세수'},{id:'c',text:'가방'}]];return editRoutine();}); await page.waitForTimeout(400);
  let st=await rtState(); ok(st.t==='a:양치하기|b:세수|c:가방'&&st.done==='a','이름을 고쳐도 id 가 같아 오늘 체크(양치)가 남음');
  ok(await ev(()=>[...document.querySelectorAll('.nt-t')].some(e=>e.textContent.includes('저장했어요'))),'저장하면 안내 토스트');
  const s0=await stampN();
  // 순서만 바꿔도 체크 유지, 도장 없음(아직 다 안 끝남)
  await ev(()=>{window.__askAnswer=[[{id:'c',text:'가방'},{id:'a',text:'양치하기'},{id:'b',text:'세수'}]];return editRoutine();}); await page.waitForTimeout(400);
  st=await rtState(); ok(st.t==='c:가방|a:양치하기|b:세수'&&st.done==='a'&&await stampN()===s0,'순서를 바꿔도 체크 유지, 끝나지 않았으면 도장 없음');
  // 바뀐 게 없으면 쓰지 않음(저장 토스트도 없음)
  await ev(()=>{document.querySelectorAll('#nt-stack,#nt-center').forEach(e=>e.remove());window.__askAnswer=[S.routineItems.map(i=>({id:i.id,text:i.text}))];return editRoutine();}); await page.waitForTimeout(300);
  ok(await ev(()=>![...document.querySelectorAll('.nt-t')].some(e=>e.textContent.includes('저장했어요'))),'바뀐 게 없으면 저장하지 않음');
  // 남은 항목을 지워서 전부 체크된 상태가 되면 도장 한 번
  await rtSet([{id:'a',text:'양치'},{id:'b',text:'세수'},{id:'c',text:'가방'}],{a:true,b:true}); await page.waitForTimeout(300);
  const sc0=await ev(()=>S.reward.stampCount||0);
  await ev(()=>{window.__askAnswer=[[{id:'a',text:'양치'},{id:'b',text:'세수'}]];return editRoutine();}); await page.waitForTimeout(500);
  ok(await stampN()===s0+1&&await ev(()=>Object.keys(window.__store).some(k=>k.includes('/stamps/rt_')))&&await ev(()=>S.reward.stampCount)===sc0+1,'안 한 항목을 지워 모두 체크된 상태가 되면 도장 +1(하루 한 번 id rt_날짜)');
  ok(await ev(()=>!!document.querySelector('#nt-center .nt-big')),'도장 축하 안내가 뜸');
  ok(await ev(()=>(window.__store['families/TEST/routine/'+todayStr()]||{}).stamped)===true,'그날 stamped=true 로 기록');
  // 이미 도장을 받은 날은 다시 주지 않음
  await ev(()=>{window.__askAnswer=[[{id:'a',text:'양치!'},{id:'b',text:'세수'}]];return editRoutine();}); await page.waitForTimeout(400);
  ok(await stampN()===s0+1,'이미 도장을 받은 날은 편집해도 중복 지급 없음');
  // 다른 기기가 먼저 바꾼 경우
  await rtSet([{id:'a',text:'양치'},{id:'b',text:'세수'}],{}); await page.waitForTimeout(300);
  await ev(()=>{_pinUntil=Date.now()+100000;editRoutine();}); await page.waitForTimeout(250);
  await ev(async()=>{await routineRef().set({items:[{id:'a',text:'양치'},{id:'z',text:'다른 기기 항목'}]});}); await page.waitForTimeout(300);
  await page.fill('.ask-rowin[data-r="0"]','내가 고침'); await page.click('.ask-ok'); await page.waitForTimeout(350);
  ok(await ev(()=>document.querySelector('.ask-t')&&document.querySelector('.ask-t').textContent)==='다른 기기에서 먼저 바꿨어요','열어 둔 사이 다른 기기가 바꾸면 덮어쓸지 물음');
  await page.click('.ask-cancel'); await page.waitForTimeout(300);
  ok(await ev(()=>S.routineItems.map(i=>i.text).join('|'))==='양치|다른 기기 항목','"취소"하면 다른 기기의 내용이 그대로');
  await ev(()=>{_pinUntil=Date.now()+100000;editRoutine();}); await page.waitForTimeout(250);
  await ev(async()=>{await routineRef().set({items:[{id:'a',text:'양치'},{id:'y',text:'또 다른 항목'}]});}); await page.waitForTimeout(300);
  await page.fill('.ask-rowin[data-r="0"]','덮어쓸 내용'); await page.click('.ask-ok'); await page.waitForTimeout(350);
  await page.click('[data-c="0"]'); await page.waitForTimeout(400);
  ok(await ev(()=>S.routineItems.map(i=>i.text).join('|'))==='덮어쓸 내용|다른 기기 항목','"덮어쓰기"를 고르면 내가 열 때의 목록(+고친 부분)으로 저장, 그 사이 다른 기기가 쓴 내용은 덮임');
  const fn=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/async function editRoutine\(\)\{[\s\S]*?\n\}\n/)[0];
  ok(!/split\(','\)/.test(fn),'editRoutine 에 쉼표 분리 방식이 남아 있지 않음');
  await ev(()=>{document.querySelectorAll('#nt-stack,#nt-center').forEach(e=>e.remove());});

  console.log('\n[8k] 시트·구성원 아이콘: 이모지 대신 SVG');
  const EMO="[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B50}\\u{2705}]";
  const emojiIn=sel=>ev(([q,e])=>{const el=document.querySelector(q);if(!el)return'(없음)';const m=el.textContent.match(new RegExp(e,'gu'));return m?m.join(''):'';},[sel,EMO]);
  await ev(()=>{document.querySelectorAll('#nt-stack,#nt-center').forEach(e=>e.remove());});
  const iid=await ev(()=>{const it=S.items.find(i=>i.tasks&&i.tasks.length)||S.items[0];return it&&it.id;});
  const closeAll=async()=>{await ev(()=>{if(S.overlay)closeOverlay();if(S.evtOverlay)closeEvtOverlay();});await page.waitForTimeout(450);};  // closeOverlay 는 280ms 뒤에 상태를 비운다
  const checkSheet=async(name,open1)=>{
    await closeAll(); await ev(open1,iid); await page.waitForTimeout(350);
    const has=await ev(()=>!!document.querySelector('.overlay .sheet'));
    const e=has?await emojiIn('.overlay .sheet'):'(없음)';
    ok(has&&e==='','시트 "'+name+'"에 이모지·글리프 아이콘 없음'+(!has?' — 시트를 못 열었음':e?': '+e:''));
  };
  await checkSheet('수행평가 등록',()=>openAdd());
  await checkSheet('수행평가 수정',id=>openEdit(id));
  await checkSheet('수행평가 상세',id=>openDetail(id));
  await checkSheet('준비물 요청',()=>openPrep());
  await checkSheet('텍스트 메모',id=>openTxtAttach(id));
  await checkSheet('일정 등록(분류 칩 포함)',()=>openEvtAdd());
  ok(await ev(()=>document.querySelectorAll('#ef-cats svg').length)===8,'일정 분류 칩 8개가 모두 SVG 아이콘');
  // 일정 상세(반복·메모 포함)
  await ev(()=>{S.events=[{id:'ev9',title:'테스트 일정',startDate:todayStr(),endDate:todayStr(),date:todayStr(),allDay:true,repeat:'weekly',memo:'메모 내용',category:'일반'},...S.events];openEvtDetail('ev9',todayStr());}); await page.waitForTimeout(300);
  ok(await emojiIn('.overlay .sheet')==='','시트 "일정 상세"(반복·메모 포함)에 이모지 없음: '+await emojiIn('.overlay .sheet'));
  ok(await ev(()=>document.querySelectorAll('.overlay .sheet .det-date svg,.overlay .sheet .act-btn svg').length)>=3,'일정 상세의 날짜·버튼에 SVG 아이콘');
  await ev(()=>closeEvtOverlay());
  // 구성원 아이콘
  await ev(()=>{asOpen('settings');}); await page.waitForTimeout(250);
  ok(await ev(()=>document.querySelectorAll('.as-mb-ic svg').length)===3&&await emojiIn('.as-mb-ic')==='','설정의 구성원 아이콘 3개가 SVG, 아이콘 칸에 이모지 없음');
  await ev(()=>asClose());
  ok(await ev(()=>MB_DEF.every(m=>m.icon===undefined)),'MB_DEF 에 이모지 icon 필드가 없음');
  ok(!/\bm\.icon\b/.test(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'')),'소스에 m.icon 참조가 없음');
  ok(await ev(()=>/중요도/.test(priStars(3))&&(priStars(3).match(/<svg/g)||[]).length===3),'중요도 별은 SVG n개 + aria-label');

  console.log('\n[8l] 남은 이모지 교체: 화면 전체에 이모지·깨진 SVG 글자 없음');
  const scan=()=>ev(()=>{const c=document.body.cloneNode(true);c.querySelectorAll('.nav-ico,script,style').forEach(e=>e.remove());const tx=c.innerText||c.textContent;
    const m=tx.match(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu);return{emo:m?[...new Set(m)].join(''):'',raw:/<svg|&lt;svg|<path/.test(tx)};});
  await page.setViewportSize({width:1280,height:800}); await ev(()=>{S.theme='dark';applyPrefs();document.querySelectorAll('#nt-stack,#nt-center').forEach(e=>e.remove());if(S.overlay)closeOverlay();if(S.evtOverlay)closeEvtOverlay();}); await page.waitForTimeout(500);
  const views=[
    ['우리집',()=>setTab('stamp')],['일정 달력',()=>{setTab('events');setEvSub('cal');}],['일정 목록',()=>{setTab('events');setEvSub('list');}],
    ['수행평가 목록',()=>{setTab('list');setLsSub('list');}],['수행평가 통계',()=>{setTab('list');setLsSub('stats');setStatsView('progress');}],['수행평가 성적',()=>{setTab('list');setLsSub('stats');setStatsView('score');}],
    ['가이드',()=>setTab('guide')],['설정',()=>setTab('backup')]
  ];
  for(const [name,fn] of views){
    await ev(fn); await page.waitForTimeout(350);
    const r=await scan(); ok(r.emo===''&&!r.raw,'화면 "'+name+'"에 이모지 없음'+(r.emo?': '+r.emo:'')+(r.raw?' (SVG 글자가 그대로 보임)':''));
    await page.screenshot({path:path.join(tmp,'view_'+name.replace(/ /g,'_')+'.png')});
  }
  await ev(()=>{setTab('guide');});
  await ev(()=>{asOpen();}); await page.waitForTimeout(300); let r=await scan(); ok(r.emo===''&&!r.raw,'루미 대화 시트에 이모지 없음'+(r.emo?': '+r.emo:'')); await ev(()=>asClose());
  await ev(()=>{asOpen('settings');}); await page.waitForTimeout(300); r=await scan(); ok(r.emo===''&&!r.raw,'루미 설정 시트에 이모지 없음'+(r.emo?': '+r.emo:'')); await ev(()=>asClose());
  await ev(()=>{asOpen('listen');}); await page.waitForTimeout(250); r=await scan(); ok(r.emo===''&&!r.raw,'루미 듣기 시트에 이모지 없음'+(r.emo?': '+r.emo:'')); await ev(()=>{asConvStop&&asConvStop();asClose();});
  // 벽걸이(주소로 열기)
  const wp=await ctx.newPage(); await wp.goto('file://'+path.join(tmp,'index_ask.html')+'?view=wall'); await wp.waitForTimeout(1200);
  const wr=await wp.evaluate(()=>{const tx=document.body.innerText;const m=tx.match(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu);return{emo:m?[...new Set(m)].join(''):'',raw:/<svg|&lt;svg/.test(tx),n:document.querySelectorAll('.w-lane-h svg,.w-tools svg').length};});
  ok(wr.emo===''&&!wr.raw&&wr.n>=3,'벽걸이 화면에 이모지 없음(머리·도구 버튼 SVG '+wr.n+'개)'+(wr.emo?': '+wr.emo:''));
  await wp.screenshot({path:path.join(tmp,'view_wall.png')}); await wp.close();
  ok(!/\bsub\.ico\b/.test(fs.readFileSync(path.join(root,'index.html'),'utf8')),'과목 가이드가 sub.ico 이모지를 화면에 쓰지 않음');

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
    await ev(()=>{askList({title:'아침 루틴 편집',desc:'항목을 고치고 순서를 바꿔요.',items:['양치하기','세수하기','교복 입기','아침 먹기','가방 챙기기','약 먹기'].map((t,i)=>({id:'r'+i,text:t})),max:10,maxLen:20,noun:'항목',extra:[{label:'기본 항목으로',set:()=>[]}]});}); await page.waitForTimeout(350);
    await page.screenshot({path:path.join(tmp,`list_${w}_${th}.png`)});
    ok(await ev(()=>{const b=document.querySelector('.ask-box').getBoundingClientRect();return b.bottom<=innerHeight&&b.top>=0&&b.right<=innerWidth&&b.left>=0;})&&await ev(()=>[...document.querySelectorAll('.ask-act button')].every(x=>{const r=x.getBoundingClientRect();return r.bottom<=innerHeight&&r.height>=44;})),`목록 시트와 저장·취소 버튼이 화면 안 ${w}×${h} ${th}`);
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

  console.log('\n[11] 시트 화면 (가짜 서버 기준 캡처)');
  for(const [w,h,th] of [[1138,712,'dark'],[1138,712,'light'],[1280,800,'dark'],[390,844,'dark'],[390,844,'light']]){
    await page.setViewportSize({width:w,height:h}); await ev(t=>{S.theme=t;applyPrefs();},th); await page.waitForTimeout(400);
    for(const [name,fn] of [['detail',id=>openDetail(id)],['form',()=>openAdd()],['evtdetail',()=>openEvtDetail('ev9',todayStr())],['evtform',()=>openEvtAdd()]]){
      await ev(()=>{if(S.overlay)closeOverlay();if(S.evtOverlay)closeEvtOverlay();}); await page.waitForTimeout(450);
      await ev(([f,id])=>{(0,eval(f))(id);},[fn.toString(),iid]); await page.waitForTimeout(350);
      await page.screenshot({path:path.join(tmp,`sheet_${name}_${w}_${th}.png`)});
      ok(await ev(()=>{const b=document.querySelector('.overlay .sheet');if(!b)return false;const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0;}),`시트 ${name} 가 화면 안 ${w}×${h} ${th}`);
    }
    await ev(()=>{if(S.overlay)closeOverlay();if(S.evtOverlay)closeEvtOverlay();}); await page.waitForTimeout(450);
  }

  console.log(errs.length?'\n페이지 오류:\n  '+errs.join('\n  '):'\n페이지 오류: 없음');
  await browser.close();
  console.log(fails||errs.length?'\n실패 있음':'\n모든 검사 통과'); process.exit(fails||errs.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
