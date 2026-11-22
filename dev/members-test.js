// 가족 구성원(3칸·목소리·담당 지정) 테스트: PLAYWRIGHT_PATH=... node dev/members-test.js
const fs=require('fs'),path=require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.join(__dirname,'..'), tmp=path.join(root,'.tmp'); fs.mkdirSync(tmp,{recursive:true});
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g,'');
html=html.replace('<style>','<script>'+fs.readFileSync(path.join(__dirname,'firestore-stub.js'),'utf8')+'</script>\n<style>');
fs.writeFileSync(path.join(tmp,'index_mb.html'),html);
const MOCK=`
(function(){
  localStorage.setItem('fc','TEST');
  localStorage.setItem('kma_api_key',JSON.stringify('KMAKEY%2Babc'));
  localStorage.setItem('gemini_api_key','GEMKEY123');
  window.__calls=[]; window.__gemLog=[]; window.__spoken=[];
  const pad=n=>String(n).padStart(2,'0'), ymd=d=>d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate());
  function kma(){const now=new Date(),out=[];for(let h=0;h<24;h++){const t=pad(h)+'00';const add=(c,v)=>out.push({baseDate:ymd(now),baseTime:'0500',category:c,fcstDate:ymd(now),fcstTime:t,fcstValue:String(v)});add('TMP',9);add('SKY',1);add('PTY',0);add('POP',10);if(h===6)add('TMN',4);if(h===15)add('TMX',13);}return out;}
  const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{'Content-Type':'application/json'}});
  const lastText=c=>{for(let i=c.length-1;i>=0;i--){const p=c[i].parts||[];if(c[i].role==='user'&&p.some(x=>x.text!==undefined))return p.map(x=>x.text||'').join('');}return '';};
  const fcR=(name,args)=>({candidates:[{content:{role:'model',parts:[{functionCall:{name,args}}]}}]});
  const txt=t=>({candidates:[{content:{role:'model',parts:[{text:t}]}}]});
  window.__ttsVoices=[];
  window.__gemHandler=body=>{
    const c=body.contents, t=lastText(c), last=c[c.length-1], r=((last.parts||[]).filter(p=>p.functionResponse)[0]||{}).functionResponse;
    if(r){const res=r.response.result;
      if(r.name==='get_member_schedule')return txt((res.member||'')+' 일정은 '+(res.events||[]).map(e=>e.title).join(', ')+'예요.');
      if(r.name==='add_event')return txt(res.summary+'. 등록할까요?');
      return txt('알겠어요.');}
    if(/아빠 일정/.test(t))return fcR('get_member_schedule',{member:'아빠'});
    if(/회의 등록/.test(t))return fcR('add_event',{title:'회의',date:window.__tm,time:'15:00',member:'아빠'});
    return txt('네.');
  };
  const real=window.fetch.bind(window);
  window.fetch=async(url,opt)=>{
    url=String(url); window.__calls.push(url.slice(0,300));
    if(url.includes('apis.data.go.kr'))return J({response:{header:{resultCode:'00',resultMsg:'OK'},body:{items:{item:kma()}}}});
    if(url.includes('open-meteo'))return J({},500);
    if(url.includes('generativelanguage')&&(/tts/.test(url)||url.includes('/interactions'))){
      {const b=JSON.parse(opt.body),sc=(b.generationConfig||{}).speechConfig||{},vc=sc.voiceConfig||{};window.__ttsVoices.push(((b.generation_config||{}).speech_config||[{}])[0].voice||vc.voice||(vc.prebuiltVoiceConfig||{}).voiceName);}
      const n=7200,buf=new ArrayBuffer(44+n*2),dv=new DataView(buf);const w=(o,s)=>[...s].forEach((c,i)=>dv.setUint8(o+i,c.charCodeAt(0)));
      w(0,'RIFF');dv.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,24000,true);dv.setUint32(28,48000,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,n*2,true);
      for(let i=0;i<n;i++)dv.setInt16(44+i*2,Math.round(Math.sin(i/12)*8000),true);
      let b='';new Uint8Array(buf).forEach(x=>b+=String.fromCharCode(x));
      if(url.includes('/interactions'))return J({steps:[{type:'model_output',content:[{type:'audio',data:btoa(b)}]}]});
      return J({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/wav',data:btoa(b)}}]}}]});
    }
    if(url.includes('generativelanguage')){const body=JSON.parse(opt.body);window.__gemLog.push(body);return J(window.__gemHandler(body));}
    return real(url,opt);
  };
  // 음성 인식: 한 번짜리는 __sayQ 에서 꺼내 말하고, continuous(호출어)는 테스트가 직접 결과를 밀어 넣는다
  window.__recs=[]; window.__sayQ=[];
  window.__AS_SILENCE=150;window.__AS_IDLE=500;
  window.SpeechRecognition=function(){window.__recs.push(this);
    this.start=()=>{ if(this.continuous){this.__active=true;return;}
      setTimeout(()=>{this.onstart&&this.onstart();const say=((this.__n=(this.__n||0)+1)===1&&window.__sayQ.length)?window.__sayQ.shift():'';
        setTimeout(()=>{if(say)this.onresult&&this.onresult({resultIndex:0,results:[Object.assign([{transcript:say}],{isFinal:true})]});setTimeout(()=>this.onend&&this.onend(),30);},60);},10);};
    this.stop=()=>{setTimeout(()=>this.onend&&this.onend(),5);};this.abort=()=>{this.__active=false;};};
  window.webkitSpeechRecognition=window.SpeechRecognition;
  window.SpeechSynthesisUtterance=function(t){this.text=t;};
  Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},speak(u){window.__spoken.push(u.text);setTimeout(()=>u.onend&&u.onend(),5);}}});
  Object.defineProperty(navigator,'wakeLock',{value:{request:async()=>({release:async()=>{},addEventListener(){}})}});
  // Live API 가짜 WebSocket
  window.__wsLog=[]; window.__wsReject=[]; window.__wsClosed=0; window.__tracksStopped=0;
  window.WebSocket=function(url){const ws=this;this.url=url;this.readyState=0;window.__ws=ws;window.__wsUrl=url;
    this.send=d=>{const m=JSON.parse(d);window.__wsLog.push(m);
      if(m.setup){const key=m.setup.model.replace('models/','')+'|'+(m.setup.responseModalities?'flat':'nested');
        setTimeout(()=>{if(window.__wsReject.includes(key)){ws.readyState=3;ws.onclose&&ws.onclose({code:1007,reason:'Unknown name: '+key});}else ws.__recv({setupComplete:{}},true);},15);}};
    this.__recv=(o,blob)=>{ws.onmessage&&ws.onmessage({data:blob?new Blob([JSON.stringify(o)]):JSON.stringify(o)});};
    this.close=()=>{ws.readyState=3;window.__wsClosed++;};
    setTimeout(()=>{ws.readyState=1;ws.onopen&&ws.onopen();},5);};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
    const ac=new AudioContext(),o=ac.createOscillator(),d=ac.createMediaStreamDestination();o.connect(d);o.start();
    const st=d.stream;st.getTracks().forEach(t=>{const s=t.stop.bind(t);t.stop=()=>{window.__tracksStopped++;s();};});return st;}}});
  // 알림·서비스워커
  Object.defineProperty(window,'Notification',{configurable:true,writable:true,value:{permission:'default',requestPermission:async()=>'granted'}});
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve({}),register:()=>Promise.resolve({})}});
  window.prompt=()=>'1234';window.__askAuto=()=>'1234';window.confirm=()=>true;
})();`;
let fails=0; const errs=[];
const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m);if(!c)fails++;};
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required']});
  const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2});
  await ctx.addInitScript(MOCK);
  const page=await ctx.newPage(); page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
  const ev=(f,a)=>page.evaluate(f,a);
  const SEED=()=>{const td=todayStr(),tm=asYmd(asAddDays(new Date(),1));window.__td=td;window.__tm=tm;
    S.events=[{id:'x1',title:'회의',startDate:td,endDate:td,date:td,allDay:false,startTime:'09:30',person:'아빠',color:'#6EA8FF'},
      {id:'x2',title:'치과',startDate:td,endDate:td,date:td,allDay:true,person:'엄마 ',color:'#FF8FB1'},
      {id:'x3',title:'학원 시험',startDate:tm,endDate:tm,date:tm,allDay:true,person:'딸',color:'#B9A2FF'},
      {id:'x4',title:'가족 외식',startDate:tm,endDate:tm,date:tm,allDay:true,person:'',color:'#FF9500'},
      {id:'x5',title:'출장',startDate:asYmd(asAddDays(new Date(),3)),endDate:asYmd(asAddDays(new Date(),4)),date:asYmd(asAddDays(new Date(),3)),allDay:true,person:'아빠',color:'#6EA8FF'}];};
  await page.goto('file://'+path.join(tmp,'index_mb.html')); await page.waitForTimeout(900);
  await ev(SEED); await ev(()=>render());

  console.log('\n[1] 담당 가족 인식');
  ok(await ev(()=>['아빠','아버지','엄마 ','엄마','딸','자녀','','할머니'].map(mbOfPerson).join())==='dad,dad,mom,mom,kid,kid,,'  ,'아빠/엄마/딸·비슷한 말을 구성원으로, 모르는 말·빈칸은 온 가족');
  ok(await ev(()=>mbEvents('dad',14).map(x=>x.title).join())==='회의,출장','아빠 일정: 회의(오늘 09:30), 출장(3일 뒤)');
  ok(await ev(()=>mbEvents('all',14).map(x=>x.title).join())==='가족 외식','담당이 없는 일정은 온 가족');
  ok(await ev(()=>mbEvents('kid',14).map(x=>x.title).join())==='학원 시험','딸 일정');

  console.log('\n[2] 브리핑 구간과 목소리');
  const segs=await ev(()=>asBriefSegs().map(s=>[s.who,s.text]));
  const who=segs.map(s=>s[0]).join(',');
  ok(/^lumi(,lumi)*,kid(,kid)*(,lumi)?,dad,mom$/.test(who),'구간 순서: 루미(날짜·날씨) → 딸(수행평가·준비물) → 아빠 → 엄마 (마지막 응원 구간 없음): '+who);
  ok(segs.some(s=>s[0]==='dad'&&s[1]==='아빠 오늘 일정은 오전 9시 30분 회의예요.'),'아빠 구간: '+(segs.find(s=>s[0]==='dad')||[])[1]);
  ok(segs.some(s=>s[0]==='mom'&&s[1].includes('치과')),'엄마 구간: '+(segs.find(s=>s[0]==='mom')||[])[1]);
  ok(!segs.some(s=>s[1].includes('학원 시험')),'내일 일정은 오늘 브리핑에 안 넣음');
  await ev(()=>{window.__ttsVoices.length=0;asClose();asBrief();});
  await page.waitForFunction(()=>!A.speaking&&window.__ttsVoices.length>=4,null,{timeout:15000});
  const v=await ev(()=>window.__ttsVoices.slice());
  ok(v[0]==='Kore'&&v.includes('Leda')&&v.indexOf('Charon')>v.indexOf('Leda')&&v.indexOf('Aoede')>v.indexOf('Charon')&&v[v.length-1]==='Aoede','목소리가 구간마다 바뀜 (루미 Kore → 딸 Leda → 아빠 Charon → 엄마 Aoede로 끝남): '+v.join('>'));
  await page.screenshot({path:path.join(tmp,'mb_brief.png')});
  await ev(()=>{asClose();asSetCfg({multiVoice:false});window.__ttsVoices.length=0;asBrief();});
  await page.waitForFunction(()=>!A.speaking&&window.__ttsVoices.length>=1,null,{timeout:15000});
  ok(await ev(()=>new Set(window.__ttsVoices).size)===1,'구성원별 목소리를 끄면 한 가지 목소리로 읽음');
  await ev(()=>{asClose();asSetCfg({multiVoice:true});});
  await page.waitForTimeout(300);

  console.log('\n[3] 설정: 이름·목소리 저장(모든 기기 동기화)');
  await ev(()=>asOpen('settings'));
  ok(await ev(()=>document.querySelectorAll('.as-mb').length)===3,'설정에 구성원 3줄');
  await ev(()=>{document.getElementById('as-m-name-dad').value='아버지';document.getElementById('as-m-voice-dad').value='Puck';document.getElementById('as-m-name-kid').value='서연';});
  await ev(()=>asSaveSettings()); await page.waitForTimeout(200);
  const saved=await ev(()=>window.__store['families/TEST/meta/members']);
  ok(saved&&saved.list.find(m=>m.id==='dad').name==='아버지'&&saved.list.find(m=>m.id==='dad').voice==='Puck','Firestore meta/members 에 저장');
  ok(await ev(()=>mbOfPerson('서연'))==='kid'&&await ev(()=>mbOfPerson('아버지'))==='dad','바꾼 이름이 담당 인식에 반영');
  await ev(()=>{asClose();});
  await ev(()=>{S.events=S.events.map(e=>e.id==='x1'?{...e,person:'아버지'}:e);window.__ttsVoices.length=0;});
  await ev(()=>asSetCfg({}));
  console.log('\n[4] 일정 폼: 담당 가족 고르기');
  await ev(()=>{openEvtAdd();});
  ok(await ev(()=>document.querySelectorAll('#ef-persons > div').length)===4,'칩 4개(아버지·엄마·서연·온 가족)');
  await ev(()=>{document.getElementById('ef-title').value='학부모 상담';setEvtPerson('엄마');});
  ok(await ev(()=>document.getElementById('ef-person').value)==='엄마','칩을 누르면 담당이 입력됨');
  await ev(()=>saveEvtForm());
  ok(await ev(()=>{const e=S.events.find(x=>x.title==='학부모 상담');return !!e&&e.person==='엄마';}),'저장된 일정에 담당 가족이 들어감');
  await ev(()=>{asSaveSettings;});

  console.log('\n[5] 벽걸이 가족별 3칸');
  await page.goto('file://'+path.join(tmp,'index_mb.html')+'?view=wall'); await page.waitForTimeout(900);
  await ev(SEED); await ev(()=>{S.events=S.events.map(e=>e.id==='x1'?{...e,person:'아버지'}:e);render();}); await page.waitForTimeout(200);
  ok(await ev(()=>document.querySelectorAll('.w-lane').length)===3,'3칸(아빠·엄마·딸)');
  const txt=await ev(()=>[...document.querySelectorAll('.w-lane')].map(l=>l.textContent));
  ok(txt[0].includes('아버지')&&txt[0].includes('회의')&&txt[0].includes('출장'),'아빠 칸: 회의·출장');
  ok(txt[1].includes('엄마')&&txt[1].includes('치과'),'엄마 칸: 치과');
  ok(txt[2].includes('서연')&&txt[2].includes('아침 루틴')&&txt[2].includes('수행평가')&&txt[2].includes('챙길 준비물')&&txt[2].includes('학원 시험'),'딸 칸: 루틴·수행평가·준비물·일정');
  ok(await ev(()=>document.querySelector('.w-shared').textContent.includes('가족 외식')),'온 가족 일정은 위 띠에 따로 표시');
  const fit=await ev(()=>({page:document.documentElement.scrollHeight<=innerHeight+2,lanes:[...document.querySelectorAll('.w-lane')].map(l=>l.scrollHeight<=l.clientHeight+2)}));
  ok(fit.page&&fit.lanes.every(Boolean),'1280x800 한 화면에 잘림 없이 들어감 '+JSON.stringify(fit));
  const wst=await ev(()=>{const c=document.querySelector('.w-card'),d=document.querySelector('.w-date'),sp=[...document.querySelectorAll('.w-stamp')].map(e=>e.getBoundingClientRect().width);
    return{card:!!c&&getComputedStyle(c).borderRadius==='24px',date:!!d&&getComputedStyle(d).borderRadius==='24px',stamps:sp.length,even:sp.length>0&&Math.max(...sp)-Math.min(...sp)<3,sp:sp.map(x=>Math.round(x))};});
  ok(wst.card&&wst.date,'벽걸이 카드·날짜가 A안 토큰(24px 유리)');
  ok(wst.stamps>=10&&wst.even,'벽걸이 도장 동그라미 '+wst.stamps+'개가 같은 크기로 나옴 '+wst.sp.join(','));
  await page.screenshot({path:path.join(tmp,'mb_wall_lanes.png')});
  await ev(()=>{window.__ttsVoices.length=0;});
  await page.click('.w-lane:nth-child(1) .w-lane-h button'); await page.waitForFunction(()=>window.__ttsVoices.length>=1,null,{timeout:8000});
  ok(await ev(()=>window.__ttsVoices[0])==='Puck','아빠 칸 🔊 → 아빠 목소리로 읽음');
  ok(await ev(()=>[...document.querySelectorAll('.nt-t')].map(e=>e.textContent).join(' ').includes('회의')),'읽는 내용도 화면에 표시');
  await ev(()=>{asStopSpeak();});
  await ev(()=>asToggleLayout()); ok(await ev(()=>!!document.querySelector('.w-grid')&&!document.querySelector('.w-lanes')),'전환 버튼으로 카드 보기로 되돌림');
  await ev(()=>asToggleLayout());
  await page.setViewportSize({width:820,height:1180}); await page.waitForTimeout(200);
  await page.screenshot({path:path.join(tmp,'mb_wall_portrait.png')});
  await page.setViewportSize({width:1280,height:800});

  console.log('\n[5b] 우리집 탭 "전체" 보기: 가족별 3칸 (가로 태블릿)');
  await page.goto('file://'+path.join(tmp,'index_mb.html')); await page.waitForTimeout(900);
  await ev(SEED); await ev(()=>{S.events=S.events.map(e=>e.id==='x1'?{...e,person:'아버지'}:e);setTab('stamp');render();}); await page.waitForTimeout(300);
  ok(await ev(()=>homeView())==='kid'&&await ev(()=>!!document.querySelector('.home-cols')&&!document.querySelector('.home-fam')),'기본은 딸 기준(예전 기능별 한 화면)');
  ok(await ev(()=>[...document.querySelectorAll('.hh-who button')].map(b=>b.textContent).join('|'))==='서연|아버지|엄마|전체'&&await ev(()=>document.querySelector('.hh-who .sel').textContent)==='서연','머리에 보기 선택(딸·아빠·엄마·전체), 지금은 딸');
  await page.click('.hh-who button:last-child'); await page.waitForTimeout(300);
  ok(await ev(()=>document.querySelectorAll('.hf-lane').length)===3&&await ev(()=>!document.querySelector('.home-cols')),'가족별 3칸(아빠·엄마·딸), 기능별 칸은 안 나옴');
  const hl=await ev(()=>[...document.querySelectorAll('.hf-lane')].map(l=>l.textContent));
  ok(hl[0].includes('아버지')&&hl[0].includes('회의')&&hl[0].includes('출장'),'아빠 칸: 회의·출장');
  ok(hl[1].includes('엄마')&&hl[1].includes('치과'),'엄마 칸: 치과');
  ok(['서연','오늘 아침 루틴','수행평가','준비물 요청','칭찬 도장','도장 찍기'].every(k=>hl[2].includes(k)),'딸 칸: 루틴·수행평가·준비물·칭찬 도장(도장 찍기)');
  ok(await ev(()=>{const t=document.querySelector('.hf-top');return !!t&&t.textContent.includes('가족 외식')&&!!t.querySelector('.orb')&&/브리핑 듣기/.test(t.textContent);}),'위 띠: 날씨·브리핑, 온 가족 일정, 루미 구슬');
  const hfit=await ev(()=>({page:document.documentElement.scrollHeight<=innerHeight+2,over:[...document.querySelectorAll('.hf-col')].map(c=>c.scrollHeight-c.clientHeight)}));
  ok(hfit.page&&hfit.over.every(o=>o<=2),'1280x800 한 화면에 잘림 없이 들어감 '+JSON.stringify(hfit));
  await page.screenshot({path:path.join(tmp,'mb_home_lanes.png')});
  await page.setViewportSize({width:1138,height:712}); await page.waitForTimeout(300);
  const hfit2=await ev(()=>({page:document.documentElement.scrollHeight<=innerHeight+2,over:[...document.querySelectorAll('.hf-col')].map(c=>c.scrollHeight-c.clientHeight)}));
  ok(hfit2.page&&hfit2.over.every(o=>o<=2),'1138x712(갤럭시 탭 S8+ 가로)에도 잘림 없이 들어감 '+JSON.stringify(hfit2));
  await page.setViewportSize({width:1138,height:640}); await page.waitForTimeout(300);
  const hfit3=await ev(()=>({strip:!!document.querySelector('.hf-top')&&getComputedStyle(document.querySelector('.hf-top')).display!=='none',over:[...document.querySelectorAll('.hf-col')].map(c=>c.scrollHeight-c.clientHeight)}));
  ok(!hfit3.strip&&hfit3.over.every(o=>o<=2),'높이 640(주소창 있음)에서는 위 띠를 접어 딸 칸이 잘리지 않음 '+JSON.stringify(hfit3));
  await page.setViewportSize({width:1280,height:800}); await page.waitForTimeout(300);
  // 칸 안에서 조작
  const d0=await ev(()=>Object.keys(S.routineDay.done||{}).length);
  await page.click('.hf-kid .rt-row:not(.on)'); await page.waitForTimeout(400);
  ok(await ev(()=>Object.keys(S.routineDay.done||{}).length)===d0+1,'딸 칸에서 루틴 항목을 누르면 체크됨');
  await ev(()=>{window.__ttsVoices.length=0;});
  await page.click('.hf-lane:nth-of-type(2) .hf-lh .hf-ib:first-child'); await page.waitForFunction(()=>window.__ttsVoices.length>=1,null,{timeout:8000});
  ok(await ev(()=>window.__ttsVoices[0])==='Puck','아빠 칸 스피커 버튼 → 아빠 목소리로 읽음'); await ev(()=>{asStopSpeak();});
  await page.click('.hf-lane:nth-of-type(2) .hf-lh .hf-ib:last-child'); await page.waitForTimeout(300);
  ok(await ev(()=>S.evtOverlay==='form'&&S.evtForm.person==='아버지'&&(document.getElementById('ef-person')||{}).value==='아버지'),'아빠 칸의 ＋ 버튼 → 일정 등록 폼에 담당 가족(아버지)이 채워짐');
  await ev(()=>closeEvtOverlay()); await page.waitForTimeout(300);
  ok(await ev(()=>{const b=document.querySelector('.hf-kid .hf-cp');return !!b&&/구입권 \d+장/.test(b.textContent)&&b.getBoundingClientRect().height>=36;}),'딸 칸 머리에 책 구입권 개수(누르면 구입권 보기)');
  ok(await ev(()=>[...document.querySelectorAll('.hf-lane button')].every(b=>b.getBoundingClientRect().height>=36)),'칸 안 버튼 높이 36px 이상(머리 버튼·도장 버튼은 44px)');
  ok(await ev(()=>[...document.querySelectorAll('.hf-ib:not(.sm)')].every(b=>b.getBoundingClientRect().width>=44&&b.getAttribute('aria-label'))),'칸 머리 버튼은 44px 이상 + aria-label');
  // 아빠·엄마 보기: 선택했을 때만 그 사람 일정이 넓게 나옴
  await ev(SEED); await ev(()=>{S.events=S.events.map(e=>e.id==='x1'?{...e,person:'아버지'}:e);render();}); await page.waitForTimeout(250);   // 앞 단계가 길어지면 스텁 구독이 일정을 덮어쓰므로 다시 심는다
  await page.click('.hh-who button:nth-child(2)'); await page.waitForTimeout(300);
  const dv=await ev(()=>({lanes:document.querySelectorAll('.hf-lane').length,txt:document.querySelector('.hf-lane').textContent,sel:document.querySelector('.hh-who .sel').textContent,stored:JSON.parse(localStorage.getItem('fp_assist_cfg')).homeView}));
  ok(dv.lanes===1&&dv.txt.includes('아버지')&&dv.txt.includes('회의')&&dv.txt.includes('출장')&&!dv.txt.includes('아침 루틴'),'아빠를 고르면 아빠 일정만 넓게(루틴·수행평가는 안 나옴)');
  ok(dv.sel==='아버지'&&dv.stored==='dad','선택이 표시되고 이 기기에 저장됨(homeView=dad)');
  await page.screenshot({path:path.join(tmp,'mb_home_dad.png')});
  await page.click('.hh-who button:nth-child(3)'); await page.waitForTimeout(300);
  ok(await ev(()=>document.querySelector('.hf-lane').textContent.includes('치과')&&!document.querySelector('.hf-lane').textContent.includes('회의')),'엄마를 고르면 엄마 일정(치과)만');
  await page.click('.hh-who button:first-child'); await page.waitForTimeout(300);
  ok(await ev(()=>!!document.querySelector('.home-cols')&&!document.querySelector('.hf-lane')&&JSON.parse(localStorage.getItem('fp_assist_cfg')).homeView==='kid'),'딸을 고르면 딸 기준 한 화면으로 돌아옴');
  ok(await ev(()=>!/아빠·엄마 일정/.test('')&&!document.body.innerText.includes('회의')),'딸 기준에서는 아빠·엄마 일정이 화면에 안 나옴(선택했을 때만)');
  await ev(()=>setHomeView('all')); await page.waitForTimeout(250);
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(400);
  ok(await ev(()=>!!document.querySelector('.home-cols')&&!document.querySelector('.home-fam')&&!document.querySelector('.hh-who')),'폰(390px)은 딸 기준 1열 배치(보기 선택 없음)');
  await page.setViewportSize({width:820,height:1180}); await page.waitForTimeout(400);
  ok(await ev(()=>!!document.querySelector('.home-cols')&&!document.querySelector('.home-fam')&&!document.querySelector('.hh-who')),'세로 태블릿도 딸 기준 배치');
  await page.setViewportSize({width:1280,height:800}); await page.waitForTimeout(400);
  ok(await ev(()=>!!document.querySelector('.home-fam')&&!!document.querySelector('.hh-who')),'다시 가로로 돌리면 고른 보기(전체)로 자동 전환, 선택 칩도 다시 나옴');

  console.log('\n[5c] 기능별 배치: 도장은 루틴 아래, 루미 카드는 아래 끝까지 / 머리 오른쪽 아이콘은 화면 모드');
  await ev(()=>{setHomeView('kid');setTab('stamp');}); await page.waitForTimeout(300);
  const gm=await ev(()=>{const R=s=>{const e=document.querySelector(s);return e&&e.getBoundingClientRect();};const cols=[...document.querySelectorAll('.home-cols>*')];
    const rt=cols.find(c=>/오늘 아침 루틴/.test(c.textContent)&&!c.classList.contains('st-card')), st=document.querySelector('.st-card'), lm=document.querySelector('.lm-card'), wx=document.querySelector('.bf');
    const a=rt.getBoundingClientRect(), b=st.getBoundingClientRect(), c=lm.getBoundingClientRect(), d=wx.getBoundingClientRect();
    return{stBelowRt:b.top>=a.bottom-1&&Math.abs(b.left-a.left)<3,lmBottomEqSt:Math.abs(c.bottom-b.bottom)<3,lmUnderWx:c.top>=d.bottom-1&&Math.abs(c.left-d.left)<3,lmTallerThanWx:c.height>d.height,page:document.documentElement.scrollHeight<=innerHeight+2,lmH:Math.round(c.height),wxH:Math.round(d.height)};});
  ok(gm.stBelowRt,'칭찬 도장 카드가 오늘 아침 루틴 바로 아래(같은 세로줄)에 있음');
  ok(gm.lmBottomEqSt&&gm.lmUnderWx&&gm.lmTallerThanWx,'루미에게 말해 보세요 카드가 날씨 아래에서 맨 아래 줄 끝까지 길게 이어짐 '+JSON.stringify(gm));
  ok(gm.page,'기능별 배치도 한 화면에 들어감');
  await page.screenshot({path:path.join(tmp,'mb_home_function.png')});
  await ev(()=>{window.__briefN=0;const o=asBrief;window.asBrief=function(){window.__briefN++;return o.apply(this,arguments);};S.theme='auto';applyPrefs();render();});
  const seq=[]; for(let i=0;i<3;i++){ await page.locator('.hh-right .hh-ic').first().click(); await page.waitForTimeout(150); seq.push(await ev(()=>S.theme+'|'+document.querySelector('.hh-right .hh-ic').getAttribute('aria-label'))); }
  ok(seq[0].startsWith('light|')&&seq[1].startsWith('dark|')&&seq[2].startsWith('auto|'),'머리 오른쪽 아이콘을 누를 때마다 자동 → 라이트 → 다크 → 자동: '+seq.join(' / '));
  ok(/화면 모드: 자동/.test(seq[2])&&/화면 모드: 라이트/.test(seq[0])&&/화면 모드: 다크/.test(seq[1]),'버튼 이름에 현재 모드가 나옴(aria-label)');
  ok(await ev(()=>window.__briefN)===0,'그 아이콘은 더 이상 브리핑을 읽지 않음(마이크와 다른 기능)');
  ok(await ev(()=>/브리핑 듣기/.test(document.querySelector('.bf').textContent)),'브리핑은 날씨 카드의 "브리핑 듣기"로 계속 가능');
  await ev(()=>{S.theme='auto';applyPrefs();setHomeView('all');});

  console.log('\n[6] 루미 대화: 한 사람 일정 → 그 사람 목소리, 일정 등록');
  await ev(SEED); await ev(()=>{S.events=S.events.map(e=>e.id==='x1'?{...e,person:'아버지'}:e);});   // 앞 단계가 오래 걸리면 스텁 구독이 일정을 덮어쓰므로 다시 심는다
  await ev(()=>{asSetCfg({wallLayout:'lanes'});asClose();asOpen();});
  const send=async t=>{await page.fill('#lm-in',t);await page.press('#lm-in','Enter');await page.waitForFunction(()=>!A.busy&&A.stat==='',null,{timeout:8000});await page.waitForTimeout(80);};
  await send('아빠 일정 알려줘');
  ok(await ev(()=>A.msgs[A.msgs.length-1].t.includes('회의')),'get_member_schedule 로 아빠 일정을 답함: '+await ev(()=>A.msgs[A.msgs.length-1].t));
  ok(await ev(()=>A.replyVoice)==='dad','이번 답은 아빠 목소리로 읽도록 표시됨');
  await ev(()=>{window.__ttsVoices.length=0;window.__sayQ=['아빠 일정 알려줘','',''];asClose();asOpen('listen');});
  await page.waitForFunction(()=>!A.conv,null,{timeout:15000});
  ok(await ev(()=>window.__ttsVoices.includes('Puck')),'음성 대화에서 아빠 일정은 아빠 목소리(Puck)로 읽음: '+await ev(()=>window.__ttsVoices.join()));
  await ev(()=>{asClose();asOpen();});
  await ev(()=>{window.__n0=S.events.length;});
  await send('아빠 내일 3시 회의 등록해줘');
  ok(await ev(()=>!!A.pending&&A.pending.kind==='add_event'&&S.events.length===window.__n0),'일정 등록은 확인 대기: '+await ev(()=>A.pending&&A.pending.summary));
  await send('응');
  ok(await ev(()=>{const e=S.events.find(x=>x.title==='회의'&&x.startTime==='15:00')||{};return e.title==='회의'&&e.person==='아버지'&&e.allDay===false&&e.startTime==='15:00';}),'확인 후 등록(담당 아버지, 15:00)');
  ok(await ev(()=>Object.values(window.__store).some(d=>d&&d.title==='회의'&&d.startTime==='15:00')),'Firestore(스텁)에도 저장');
  ok(await ev(()=>window.__gemLog[0].tools[0].functionDeclarations.some(f=>f.name==='get_member_schedule')&&window.__gemLog[0].systemInstruction.parts[0].text.includes('아버지, 엄마, 서연')),'도구·지침에 구성원 이름이 들어감');
  await page.screenshot({path:path.join(tmp,'mb_chat.png')});

  console.log(errs.length?'\n페이지 오류:\n  '+errs.join('\n  '):'\n페이지 오류: 없음');
  await browser.close();
  console.log(fails||errs.length?'\n실패 있음':'\n모든 검사 통과'); process.exit(fails||errs.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
