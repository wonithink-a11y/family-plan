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
  }

  console.log(errs.length?'\n페이지 오류:\n  '+errs.join('\n  '):'\n페이지 오류: 없음');
  await browser.close();
  console.log(fails||errs.length?'\n실패 있음':'\n모든 검사 통과'); process.exit(fails||errs.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
