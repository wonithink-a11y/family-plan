// 보상 상점(구입권 종류 고르기) 테스트: PLAYWRIGHT_PATH=... node dev/shop-test.js  (가짜 Firestore, 외부 연결 없음)
const fs=require('fs'),path=require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.join(__dirname,'..'), tmp=path.join(root,'.tmp'); fs.mkdirSync(tmp,{recursive:true});
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g,'');
html=html.replace('<style>','<script>'+fs.readFileSync(path.join(__dirname,'firestore-stub.js'),'utf8')+'</script>\n<style>');
fs.writeFileSync(path.join(tmp,'index_shop.html'),html);
let fails=0; const errs=[];
const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m);if(!c)fails++;};
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--allow-file-access-from-files']});
  const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
  await ctx.addInitScript(()=>{localStorage.setItem('fc','TEST');const real=window.fetch.bind(window);window.fetch=(u,o)=>String(u).includes('open-meteo')||String(u).includes('apis.data.go.kr')?Promise.resolve(new Response('{}',{status:500})):real(u,o);});
  const page=await ctx.newPage(); page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
  await page.goto('file://'+path.join(tmp,'index_shop.html')); await page.waitForTimeout(900);
  const ev=(f,a)=>page.evaluate(f,a);
  const wait=ms=>page.waitForTimeout(ms);
  const cp=id=>ev(i=>window.__store['families/TEST/coupons/'+i]||null,id);
  const toasts=()=>ev(()=>[...document.querySelectorAll('.nt-t')].map(e=>e.textContent).join(' | '));
  const clear=()=>ev(()=>{document.querySelectorAll('#nt-stack,#nt-center').forEach(e=>e.remove());});

  console.log('\n[1] 종류 목록 기본값');
  ok(await ev(()=>shopKinds().map(k=>k.text).join('|'))==='책 구입권|영화 관람권|외식 쿠폰','저장된 목록이 없으면 기본 3종(책·영화·외식)');
  ok(await ev(()=>COUPON_TITLE)==='구입권','공통 이름은 "구입권"(책 전용 문구 아님)');

  console.log('\n[2] 도장 10개 → 구입권이 "종류 고르기" 상태로 나옴');
  await ev(async()=>{await rewardRef().set({stampCount:9,couponsIssued:1,pinHash:await sha256Hex('1234')},{merge:true});}); await wait(300);   // 시드의 PIN 해시를 '1234' 것으로 맞춤
  await clear();
  await ev(()=>{_pinUntil=0;window.__askAnswer=['1234','통합 테스트'];return stampFlow();}); await wait(600);
  const c2=await cp('cp2');
  ok(c2&&c2.title==='구입권'&&c2.pick===true&&c2.usedAt===null,'새 구입권: 이름 "구입권", pick:true '+JSON.stringify(c2&&{t:c2.title,p:c2.pick}));
  ok(/종류를 골라 보세요/.test(await ev(()=>(document.querySelector('#nt-center')||{textContent:''}).textContent)),'축하 안내에 "종류를 골라 보세요"');
  ok(await ev(()=>S.reward.stampCount)===10&&await ev(()=>S.reward.couponsIssued)===2,'도장 10개·구입권 2장(발급 규칙은 그대로)');
  ok(await ev(()=>couponPending())===1,'고를 구입권이 1장');
  ok(/구입권 \d+장 · 고르기/.test(await ev(()=>document.body.innerText)),'우리집에 "구입권 N장 · 고르기" 표시');

  console.log('\n[3] 구입권 화면: 새 것은 고르기, 예전 것은 그대로 사용하기');
  await ev(()=>{S.theme='dark';applyPrefs();openCoupons();}); await wait(400);
  const tk=await ev(()=>[...document.querySelectorAll('.ticket')].map(t=>({t:t.querySelector('.ticket-t').textContent,b:(t.querySelector('.use-btn')||{}).textContent})));
  ok(tk.some(x=>x.t==='종류를 골라 주세요'&&x.b==='종류 고르기'),'새 구입권: "종류를 골라 주세요" + [종류 고르기]');
  ok(tk.some(x=>x.t==='책 구입권'&&x.b==='사용하기'),'예전 구입권(pick 없음)은 이름 그대로 [사용하기]');
  await page.screenshot({path:path.join(tmp,'shop_coupons.png')});

  console.log('\n[4] 종류 고르기');
  await ev(()=>{window.__r=undefined;pickCoupon('cp2').then(()=>{window.__r='end';});}); await wait(300);
  const ch=await ev(()=>[...document.querySelectorAll('.ask-box button')].map(b=>b.textContent.trim()));
  ok(ch.join('|')==='책 구입권|영화 관람권|외식 쿠폰|나중에','선택지: 3종 + 나중에 '+ch.join('/'));
  ok(/바꿀 수 없어요/.test(await ev(()=>document.querySelector('.ask-d').textContent)),'"한 번 고르면 바꿀 수 없어요" 안내');
  await page.screenshot({path:path.join(tmp,'shop_pick.png')});
  await clear(); await page.click('[data-c="1"]'); await wait(600);
  const c2b=await cp('cp2');
  ok(c2b.title==='영화 관람권'&&c2b.pick===false&&c2b.kindId==='k1','영화 관람권으로 저장(pick:false, kindId)');
  ok(/영화 관람권으로 정했어요/.test(await toasts()),'안내: 영화 관람권으로 정했어요');
  ok(await ev(()=>{const t=[...document.querySelectorAll('.ticket')].find(x=>/영화 관람권/.test(x.textContent));return !!t&&/사용하기/.test(t.textContent);}),'구입권 화면이 새 이름 + [사용하기]로 바뀜');
  ok(await ev(()=>couponPending())===0&&!/ · 고르기/.test(await ev(()=>document.body.innerText)),'"고르기" 표시가 사라짐');

  console.log('\n[5] "나중에"는 그대로, 사용은 종류를 고른 뒤에만');
  await ev(async()=>{await couponsCol().doc('cp3').set({id:'cp3',no:3,title:'구입권',pick:true,issuedAt:Date.now(),usedAt:null});}); await wait(300);
  await ev(()=>{window.__r=undefined;pickCoupon('cp3').then(()=>{window.__r='end';});}); await wait(300);
  await page.click('.ask-cancel'); await wait(350);
  ok((await cp('cp3')).pick===true,'"나중에"를 누르면 구입권은 그대로 고르기 대기');
  await clear(); await ev(()=>{useCoupon('cp3');}); await wait(300);
  ok(/먼저 구입권 종류를 골라 주세요/.test(await toasts())&&await ev(()=>!document.querySelector('.ask-ov')),'고르기 전에 [사용]하면 막고 안내(PIN도 안 물음)');
  ok((await cp('cp3')).usedAt===null,'사용 처리 안 됨');

  console.log('\n[6] 다른 기기가 먼저 정했으면 덮어쓰지 않음');
  await ev(()=>{window.__r=undefined;pickCoupon('cp3').then(()=>{window.__r='end';});}); await wait(300);
  await ev(async()=>{await couponsCol().doc('cp3').update({title:'외식 쿠폰',pick:false,kindId:'k2'});}); await wait(200);
  await clear(); await page.click('[data-c="0"]'); await wait(500);
  ok((await cp('cp3')).title==='외식 쿠폰'&&/이미 종류가 정해진/.test(await toasts()),'먼저 정해진 "외식 쿠폰"이 유지되고 안내');

  console.log('\n[7] 정한 구입권 사용(부모 PIN + 확인)');
  await ev(()=>{_pinUntil=0;window.__askAuto=k=>k==='confirm'?true:'1234';}); await ev(()=>{useCoupon('cp2');}); await wait(500);
  ok((await cp('cp2')).usedAt>0,'영화 관람권 사용 처리됨'); await ev(()=>{window.__askAuto=null;});

  console.log('\n[8] 종류가 하나뿐이면 바로 정해짐');
  await ev(async()=>{await shopRef().set({items:[{id:'a',text:'책 구입권'}]});await rewardRef().set({stampCount:19,couponsIssued:3},{merge:true});}); await wait(400);
  ok(await ev(()=>shopKinds().length)===1,'목록이 1종이면 shopKinds 1개');
  await ev(()=>{_pinUntil=0;window.__askAnswer=['1234','한 종류'];return stampFlow();}); await wait(600);
  const c4=await cp('cp4');
  ok(c4&&c4.title==='책 구입권'&&c4.pick===false,'고르기 없이 "책 구입권"으로 발급 '+JSON.stringify(c4&&{t:c4.title,p:c4.pick}));
  ok(!/종류를 골라 보세요/.test(await ev(()=>(document.querySelector('#nt-center')||{textContent:''}).textContent)),'이 경우 "종류를 골라 보세요" 안내는 없음');

  console.log('\n[9] 부모가 종류 목록을 편집(PIN)');
  await clear(); await ev(()=>{_pinUntil=0;window.__askAnswer=['1234',[{id:'a',text:'만화책'},{id:'b',text:'영화 관람권'},{id:'c',text:'치킨 쿠폰'}]];return editShop();}); await wait(600);
  const sh=await ev(()=>window.__store['families/TEST/meta/shop']);
  ok(sh&&sh.items.map(i=>i.text).join('|')==='만화책|영화 관람권|치킨 쿠폰','meta/shop 에 저장됨(기존 문서 meta 아래, 새 컬렉션 없음)');
  ok(/구입권 종류를 저장했어요/.test(await toasts())&&await ev(()=>shopKinds().length)===3,'저장 안내 + 화면에 반영');
  ok((await cp('cp2')).title==='영화 관람권','이미 받은 구입권은 바뀌지 않음');
  await clear(); await ev(()=>{_pinUntil=Date.now()+1e5;window.__askAnswer=[ShopSame()];function ShopSame(){return shopKinds().map(k=>({id:k.id,text:k.text}));}return editShop();}); await wait(300);
  ok(!/저장했어요/.test(await toasts()),'바꾼 게 없으면 저장하지 않음');
  await ev(()=>{_pinUntil=0;window.__askAnswer=['0000'];return editShop();}); await wait(300);
  ok(await ev(()=>window.__store['families/TEST/meta/shop'].items.length)===3,'PIN이 틀리면(취소) 목록이 바뀌지 않음');
  ok(await ev(()=>{setTab('backup');return true;})&&(await wait(250),/구입권 종류 편집/.test(await ev(()=>document.body.innerText))),'설정 탭에 "구입권 종류 편집" 버튼');
  await ev(()=>{S.reward=Object.assign({},S.reward);setTab('stamp');});

  console.log('\n[10] 화면 확인 (가짜 서버 기준 캡처)');
  for(const [w,h,th] of [[1138,712,'dark'],[1138,712,'light'],[390,844,'dark'],[390,844,'light']]){
    await page.setViewportSize({width:w,height:h}); await ev(t=>{S.theme=t;applyPrefs();if(S.overlay)closeOverlay();},th); await wait(500);
    await ev(async()=>{await couponsCol().doc('cp9').set({id:'cp9',no:9,title:'구입권',pick:true,issuedAt:Date.now(),usedAt:null});}); await wait(250);
    await ev(()=>openCoupons()); await wait(450);
    await page.screenshot({path:path.join(tmp,`shop_coupons_${w}_${th}.png`)});
    ok(await ev(()=>{const b=document.querySelector('.overlay .sheet');if(!b)return false;const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(b.textContent);}),`구입권 화면이 화면 안, 이모지 없음 ${w}×${h} ${th}`);
    await ev(()=>{pickCoupon('cp9');}); await wait(350);
    ok(await ev(()=>{const b=document.querySelector('.ask-box');if(!b)return false;const r=b.getBoundingClientRect();return r.bottom<=innerHeight&&r.top>=0;}),`종류 고르기 시트가 화면 안 ${w}×${h} ${th}`);
    await page.screenshot({path:path.join(tmp,`shop_pick_${w}_${th}.png`)});
    await page.click('.ask-cancel'); await wait(300);
    await ev(async()=>{await couponsCol().doc('cp9').delete();}); await wait(250);
  }

  console.log(errs.length?'\n페이지 오류:\n  '+errs.join('\n  '):'\n페이지 오류: 없음');
  await browser.close();
  console.log(fails||errs.length?'\n실패 있음':'\n모든 검사 통과'); process.exit(fails||errs.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
