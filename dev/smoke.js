// 스모크 테스트: node dev/smoke.js  (playwright + google-chrome 필요)
// 1) index.html 의 Firebase CDN 스크립트를 dev/firestore-stub.js (메모리 Firestore) 로 바꿔 .tmp/ 에 복사
// 2) 헤드리스 Chrome 으로 우리집 탭 / 일정 탭 / 벽걸이 화면(?view=wall) 을 열어 스크린샷(.tmp/*.png)을 남기고
// 3) 루틴 전부 체크 → 도장 자동 +1 이 하루 한 번만 일어나는지 확인한다.
const fs=require('fs'),path=require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.join(__dirname,'..'), tmp=path.join(root,'.tmp'); fs.mkdirSync(tmp,{recursive:true});
let html=fs.readFileSync(path.join(root,'index.html'),'utf8')
  .replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g,'');
html=html.replace('<style>','<script>'+fs.readFileSync(path.join(__dirname,'firestore-stub.js'),'utf8')+'</script>\n<style>');
fs.writeFileSync(path.join(tmp,'index.html'),html);
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--allow-file-access-from-files']});
  const errs=[]; const base='file://'+path.join(tmp,'index.html');
  async function open(url,vp,name,fn){
    const ctx=await browser.newContext({viewport:vp,deviceScaleFactor:2});
    await ctx.addInitScript(()=>{localStorage.setItem('fc','TEST');window.prompt=()=>'1234';window.confirm=()=>true;});
    const page=await ctx.newPage();
    page.on('pageerror',e=>errs.push(name+': '+e.message));
    await page.goto(url); await page.waitForTimeout(700); if(fn)await fn(page);
    await page.screenshot({path:path.join(tmp,name+'.png')}); await ctx.close();
  }
  const TABLET={width:1280,height:800}, TABLET_P={width:820,height:1180}, PHONE={width:390,height:1500};
  await open(base,TABLET,'tab_tablet',p=>p.evaluate(()=>setTab('stamp')));          // 기본: 태블릿 가로
  await open(base,TABLET_P,'tab_tablet_portrait',p=>p.evaluate(()=>setTab('stamp')));
  await open(base,PHONE,'tab_phone',p=>p.evaluate(()=>setTab('stamp')));            // 확인용: 폰
  await open(base,TABLET,'events_tablet',p=>p.evaluate(()=>setTab('events')));
  await open(base,{width:390,height:844},'events_phone',p=>p.evaluate(()=>setTab('events')));
  await open(base+'?view=wall',TABLET,'wall_tablet');
  await open(base+'?view=wall',{width:390,height:1100},'wall_phone');
  await open(base,{width:390,height:844},'routine',async p=>{
    await p.evaluate(async()=>{await toggleRoutine('d4');await toggleRoutine('d5');await toggleRoutine('d6');await toggleRoutine('d6');await toggleRoutine('d6');});
    const r=await p.evaluate(()=>({stampCount:window.__store['families/TEST/meta/reward'].stampCount,rtStamps:Object.keys(window.__store).filter(k=>k.includes('/stamps/rt_')).length}));
    console.log('루틴 완료 결과(기대: stampCount 8, rtStamps 1):',JSON.stringify(r));
  });
  console.log('페이지 오류:',errs.length?errs:'없음'); await browser.close();
})();
