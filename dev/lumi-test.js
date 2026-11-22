// 루미(대화·도구·실시간·호출어·푸시) 테스트: PLAYWRIGHT_PATH=... node dev/lumi-test.js
// 가짜: Gemini(함수 호출 시나리오) · 음성 인식 · WebSocket(Live) · 마이크 · 알림/FCM
const fs=require('fs'),path=require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.join(__dirname,'..'), tmp=path.join(root,'.tmp'); fs.mkdirSync(tmp,{recursive:true});
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g,'');
html=html.replace('<style>','<script>'+fs.readFileSync(path.join(__dirname,'firestore-stub.js'),'utf8')+'</script>\n<style>');
fs.writeFileSync(path.join(tmp,'index_lumi.html'),html);

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
  // 시나리오형 가짜 Gemini
  window.__gemHandler=body=>{
    const c=body.contents, t=lastText(c), last=c[c.length-1], r=((last.parts||[]).filter(p=>p.functionResponse)[0]||{}).functionResponse;
    if(r){const res=r.response.result;
      if(r.name==='list_assessments')return txt(res.assessments&&res.assessments.length?'오늘 마감인 수행평가는 '+res.assessments.map(a=>a.subject).join(', ')+'예요.':'오늘 마감인 수행평가는 없어요.');
      if(r.name==='resolve_date')return fcR('add_assessment',{subject:'수학',date:res.date,content:'서술형 풀이'});
      if(r.name==='add_assessment'||r.name==='add_prep'){ if(/몰래/.test(t))return fcR('confirm_pending_action',{}); return txt(res.summary+'. 등록할까요?'); }
      if(r.name==='confirm_pending_action')return txt(res.status==='done'?res.message:'아직 확인을 못 받았어요. 등록할까요?');
      if(r.name==='get_today_info')return txt('오늘은 '+res.dayOfWeek+'이고 지금 '+res.weather.now.temp+'도예요.');
      return txt('알겠어요.');
    }
    if(/몰래/.test(t))return fcR('add_prep',{date:(window.__tm||''),text:'몰래 준비물'});
    if(/수행평가 뭐/.test(t))return fcR('list_assessments',{date:window.__td});
    if(/다음 주 금요일.*등록/.test(t))return fcR('resolve_date',{text:'다음 주 금요일'});
    if(/브리핑/.test(t))return fcR('get_today_info',{});
    return txt('이차방정식은 최고차항의 차수가 2인 방정식이에요.');
  };
  const real=window.fetch.bind(window);
  window.fetch=async(url,opt)=>{
    url=String(url); window.__calls.push(url.slice(0,300));
    if(url.includes('apis.data.go.kr'))return J({response:{header:{resultCode:'00',resultMsg:'OK'},body:{items:{item:kma()}}}});
    if(url.includes('open-meteo'))return J({},500);
    if(url.includes('generativelanguage')&&(/tts/.test(url)||url.includes('/interactions'))){
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
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required']});
  const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2});
  await ctx.addInitScript(MOCK);
  const page=await ctx.newPage(); page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
  await page.goto('file://'+path.join(tmp,'index_lumi.html')); await page.waitForTimeout(900);
  const ev=(f,a)=>page.evaluate(f,a);
  await ev(()=>{window.__td=todayStr();window.__tm=asYmd(asAddDays(new Date(),1));});

  console.log('\n[1] 이름 (기본 루미, 설정에서 변경)');
  ok(await ev(()=>asName())==='루미','기본 이름은 루미');
  await ev(()=>asOpen('listen')); await page.waitForTimeout(200); await ev(()=>asConvStop());
  const t1=await ev(()=>document.querySelector('.as-ttl').textContent); ok(t1==='루미','시트 제목이 이름을 따름: '+t1);
  ok((await ev(()=>asWakeNames())).includes('로미'),'기본 이름이면 비슷한 발음도 호출어로 인정');
  await ev(()=>{asSetCfg({asName:'다온'});});
  ok(await ev(()=>asName())==='다온','설정에서 이름을 바꾸면 반영(다온)');
  ok((await ev(()=>asWakeNames())).join()==='다온','바꾼 이름은 그 이름만 호출어');
  await ev(()=>{asSetCfg({asName:'루미'});asClose();});

  console.log('\n[2] 도구 직접 호출 (읽기·검증·확인 대기)');
  const info=await ev(()=>asTool('get_today_info',{}));
  ok(info.today&&info.dayOfWeek&&info.weather&&info.weather.available&&info.weather.now.temp!==undefined,'오늘 요약에 날짜·날씨 포함 '+JSON.stringify(info.weather).slice(0,80));
  ok(info.assessmentsDueToday.some(a=>a.subject==='영어'),'오늘 마감 수행평가(영어) 포함');
  ok((await ev(()=>asTool('resolve_date',{text:'다음 주 금요일'}))).date==='2026-11-27','resolve_date: 다음 주 금요일 → 2026-11-27');
  ok((await ev(()=>asTool('add_assessment',{subject:'수학',date:'11월 27일'}))).error,'날짜 형식이 틀리면 거절');
  ok((await ev(()=>asTool('add_assessment',{subject:'수학',date:'2020-01-01'}))).error,'지난 날짜는 거절');
  const n0=await ev(()=>S.items.length);
  const pend=await ev(()=>asTool('add_assessment',{subject:'수학',date:'2026-11-27',content:'서술형',score:20}));
  ok(pend.status==='needs_user_confirmation'&&await ev(()=>S.items.length)===n0,'쓰기 도구는 저장하지 않고 확인 대기만: '+pend.summary);
  const c0=await ev(()=>asTool('confirm_pending_action',{}));
  ok(c0.status==='not_done'&&await ev(()=>S.items.length)===n0,'같은 턴에 모델이 확인 도구를 불러도 실행되지 않음');
  await ev(()=>asTool('cancel_pending_action',{}));
  ok((await ev(()=>A.pending))===null,'취소 도구로 대기 해제');
  ok((await ev(()=>asTool('reschedule_assessment',{subject:'수학',new_date:'2026-12-01'}))).status==='needs_user_confirmation','수행평가 날짜 변경도 확인 대기');
  ok((await ev(()=>asTool('mark_assessment_done',{subject:'없는과목'}))).error,'없는 과목은 오류로 알려 줌');
  await ev(()=>asTool('cancel_pending_action',{}));
  ok((await ev(()=>asTool('list_preps',{}))).preps.length===2,'준비물 목록 조회(시드 2건)');

  console.log('\n[3] 대화(글자) + 함수 호출 루프');
  await ev(()=>{asOpen();});
  const send=async t=>{await page.fill('#lm-in',t);await page.press('#lm-in','Enter');await page.waitForFunction(()=>!A.busy&&A.stat==='',null,{timeout:8000});await page.waitForTimeout(80);};
  await send('오늘 수행평가 뭐 있어?');
  let bub=await ev(()=>[...document.querySelectorAll('.lm-b')].map(b=>b.textContent.trim()));
  ok(bub.some(b=>b.includes('영어')&&b.includes('수행평가')),'도구로 조회한 답을 말함: '+bub[bub.length-1]);
  const g0=await ev(()=>window.__gemLog[0]);
  ok(g0.systemInstruction.parts[0].text.includes('"루미"'),'시스템 지침에 이름(루미)이 들어감');
  ok(g0.tools[0].functionDeclarations.length===13&&!g0.tools[0].functionDeclarations.some(f=>/^(confirm|cancel)_pending/.test(f.name)),'확인 대기 없음 → 조회+쓰기 13개만 선언(confirm/cancel 숨김)');
  ok(await ev(()=>window.__gemLog[1].tools[0].functionDeclarations.length)===13,'조회 후 반복에도 13개');
  ok(await ev(()=>window.__gemLog.length)===2,'모델 2회 호출(도구 요청 → 결과로 답)');

  console.log('\n[4] 등록: 말 → 확인 카드 → "응"');
  const nBefore=await ev(()=>S.items.length), gBefore=await ev(()=>window.__gemLog.length);
  await send('수학 수행평가 다음 주 금요일까지 서술형 풀이 등록해 줘');
  ok(await ev(()=>!!document.querySelector('.lm-pend')),'확인 카드가 화면에 뜸: '+await ev(()=>(document.querySelector('.lm-pend-s')||{}).textContent));
  ok(await ev(()=>S.items.length)===nBefore,'아직 저장되지 않음');
  await page.screenshot({path:path.join(tmp,'lumi_chat_pending.png')});
  const gMid=await ev(()=>window.__gemLog.length);
  await send('응');
  ok(await ev(()=>window.__gemLog.length)===gMid,'"응"은 모델을 거치지 않고 바로 확정(오작동 방지)');
  ok(await ev(()=>S.items.length)===nBefore+1,'등록됨');
  ok(await ev(()=>Object.values(window.__store).some(d=>d&&d.subject==='수학'&&d.dueDate==='2026-11-27'&&(d.tasks||[])[0]&&d.tasks[0].text==='서술형 풀이')),'Firestore(스텁)에 수학·11/27·서술형 풀이 저장');
  bub=await ev(()=>[...document.querySelectorAll('.lm-b.a')].map(b=>b.textContent.trim()));
  ok(/등록했어요/.test(bub[bub.length-1]),'결과를 알려 줌: '+bub[bub.length-1]);
  ok(await ev(()=>!document.querySelector('.lm-pend')),'확인 카드가 사라짐');

  console.log('\n[5] 모델이 몰래 확정하려는 경우');
  const pc=await ev(()=>Object.keys(window.__store).filter(k=>k.includes('/preps/')).length);
  await send('몰래 준비물 등록');
  ok(await ev(()=>Object.keys(window.__store).filter(k=>k.includes('/preps/')).length)===pc,'사용자 동의 없이 모델이 확인 도구를 불러도 저장 안 됨');
  ok(await ev(()=>!!A.pending),'확인 대기는 그대로 남음');
  await send('아니요');
  ok(await ev(()=>A.pending)===null,'"아니요" → 취소');
  await ev(()=>asTool('add_prep',{date:window.__tm,text:'리코더 케이스'}));
  await ev(()=>asRenderSoft());
  await page.click('.lm-pend .as-pri'); await page.waitForTimeout(150);
  ok(await ev(()=>Object.values(window.__store).some(d=>d&&d.text==='리코더 케이스')),'확인 버튼으로도 실행됨(준비물 요청 저장)');

  console.log('\n[6] 연속 대화(마이크 → 답 읽기 → 다시 듣기)');
  const ttsBefore=await ev(()=>window.__calls.filter(u=>/tts|\/interactions/.test(u)).length);
  await ev(()=>{window.__sayQ=['오늘 수행평가 뭐 있어?','',''];asClose();asOpen('listen');});
  await page.waitForFunction(()=>!A.conv,null,{timeout:15000});
  bub=await ev(()=>({u:A.msgs.filter(m=>m.r==='u').map(m=>m.t),sys:A.msgs.filter(m=>m.r==='s').length,tts:window.__calls.filter(u=>/tts|\/interactions/.test(u)).length}));
  ok(bub.u.includes('오늘 수행평가 뭐 있어?'),'말한 내용이 대화에 들어감');
  ok(bub.tts>ttsBefore,'답을 소리로 읽음(TTS 호출)');
  ok(bub.sys===1,'말이 두 번 연속 없으면 대화를 멈추고 안내');
  await ev(()=>{window.__sayQ=['그만'];A.msgs=[];asConvStart();});
  await page.waitForFunction(()=>!A.conv,null,{timeout:8000});
  ok(await ev(()=>A.msgs.some(m=>m.r==='a'&&/다음에/.test(m.t))),'"그만" 하면 인사하고 끝냄');
  await page.screenshot({path:path.join(tmp,'lumi_chat.png')});
  await ev(()=>asClose());

  console.log('\n[7] 실시간(Live) 대화');
  await ev(()=>{window.__wsReject=['gemini-3.8-live|flat'];asOpen();});
  await ev(()=>asLiveStart()); await page.waitForFunction(()=>A.live&&A.live.status==='live',null,{timeout:8000});
  const setups=await ev(()=>window.__wsLog.filter(m=>m.setup).map(m=>m.setup));
  ok(setups.length===2&&setups[0].responseModalities&&setups[1].generationConfig,'첫 조합(flat)이 거절되면 다음 조합(nested)으로 재시도');
  ok(setups[1].tools[0].functionDeclarations.length===15&&setups[1].inputAudioTranscription&&setups[1].outputAudioTranscription,'도구·받아쓰기 설정 포함');
  ok(await ev(()=>/BidiGenerateContent\?key=GEMKEY123$/.test(window.__wsUrl)),'엔드포인트와 키 전달 방식');
  ok(setups[1].generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName==='Kore','목소리 설정이 전달됨');
  ok(await ev(()=>JSON.parse(localStorage.getItem('fp_live_ok')).s)==='nested','성공한 조합을 기억');
  await page.waitForTimeout(1500);
  const au=await ev(()=>window.__wsLog.filter(m=>m.realtimeInput&&m.realtimeInput.audio));
  ok(au.length>=1&&au[0].realtimeInput.audio.mimeType==='audio/pcm;rate=16000'&&au[0].realtimeInput.audio.data.length>100,'마이크 소리가 16kHz PCM으로 계속 전송됨 ('+au.length+'덩어리)');
  await ev(()=>{const n=12000,a=new Int16Array(n);for(let i=0;i<n;i++)a[i]=Math.sin(i/10)*6000;window.__ws.__recv({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:lvI16ToB64(a)}}]}}},true);});
  await page.waitForTimeout(150);
  ok(await ev(()=>LV.srcs.length>0&&A.live.speaking),'답 소리를 받아 재생 큐에 넣음');
  await page.screenshot({path:path.join(tmp,'lumi_live.png')});
  await ev(()=>window.__ws.__recv({serverContent:{interrupted:true}},true)); await page.waitForTimeout(80);
  ok(await ev(()=>LV.srcs.length===0&&!A.live.speaking),'끼어들면(interrupted) 재생을 바로 멈춤');
  await ev(()=>{window.__ws.__recv({serverContent:{inputTranscription:{text:'수학 수행평가 '}}});window.__ws.__recv({serverContent:{inputTranscription:{text:'등록해 줘'}}});window.__ws.__recv({serverContent:{outputTranscription:{text:'등록할까요?'}}});window.__ws.__recv({serverContent:{turnComplete:true}});});
  await page.waitForTimeout(100);
  const lines=await ev(()=>A.live.lines);
  ok(lines.length===2&&lines[0].r==='u'&&lines[0].t==='수학 수행평가 등록해 줘'&&lines[1].r==='a','받아쓰기가 말풍선으로 정리됨');
  // 도구 호출: 쓰기 → 대기, 같은 턴 확정 거절, 다음 턴 동의 후 확정
  const pc2=await ev(()=>Object.keys(window.__store).filter(k=>k.includes('/preps/')).length);
  await ev(()=>window.__ws.__recv({toolCall:{functionCalls:[{id:'c1',name:'add_prep',args:{date:window.__tm,text:'실내화'}}]}},true)); await page.waitForTimeout(150);
  let tr=await ev(()=>window.__wsLog.filter(m=>m.toolResponse).pop().toolResponse.functionResponses[0]);
  ok(tr.id==='c1'&&tr.name==='add_prep'&&tr.response.result.status==='needs_user_confirmation','toolCall → toolResponse(id·name·response.result)로 답함');
  await ev(()=>window.__ws.__recv({toolCall:{functionCalls:[{id:'c2',name:'confirm_pending_action',args:{}}]}},true)); await page.waitForTimeout(150);
  tr=await ev(()=>window.__wsLog.filter(m=>m.toolResponse).pop().toolResponse.functionResponses[0]);
  ok(tr.response.result.status==='not_done'&&await ev(()=>Object.keys(window.__store).filter(k=>k.includes('/preps/')).length)===pc2,'같은 턴/동의 없는 확정은 거절됨');
  await ev(()=>{window.__ws.__recv({serverContent:{outputTranscription:{text:'실내화 요청할까요?'}}});window.__ws.__recv({serverContent:{turnComplete:true}});window.__ws.__recv({serverContent:{inputTranscription:{text:'응'}}});});
  await page.waitForTimeout(80);
  await ev(()=>window.__ws.__recv({toolCall:{functionCalls:[{id:'c3',name:'confirm_pending_action',args:{}}]}},true)); await page.waitForTimeout(200);
  tr=await ev(()=>window.__wsLog.filter(m=>m.toolResponse).pop().toolResponse.functionResponses[0]);
  ok(tr.response.result.status==='done'&&await ev(()=>Object.values(window.__store).some(d=>d&&d.text==='실내화')),'사용자가 "응" 한 다음 턴에는 확정되어 저장됨');
  await ev(()=>asLiveStop()); await page.waitForTimeout(100);
  ok(await ev(()=>window.__wsClosed)>=1&&await ev(()=>window.__tracksStopped)>=1,'종료하면 연결을 닫고 마이크를 끔');
  ok(await ev(()=>A.mode)==='chat','글자 대화로 돌아옴');
  await ev(()=>asClose());

  console.log('\n[8] 호출어 (실험)');
  ok((await ev(()=>asWakeFind('저기 루미야 내일 준비물 알려줘'))).rest==='내일 준비물 알려줘','이름 뒤의 말만 떼어 냄');
  ok((await ev(()=>asWakeFind('로미 안녕'))).rest==='안녕','비슷한 발음(로미)도 인식');
  ok(await ev(()=>asWakeFind('오늘 날씨 어때'))===null,'이름이 없으면 무시');
  await ev(()=>{asSetCfg({wakeWord:true});asWakeToggleSaved();}); await page.waitForTimeout(300);
  ok(await ev(()=>window.__recs.some(r=>r.continuous&&r.__active)),'켜 두면 계속 듣기(continuous) 시작');
  await ev(()=>{const r=window.__recs.filter(x=>x.continuous&&x.__active).pop();r.onresult({results:[[{transcript:'루미야 내일 준비물 알려줘'}]]});});
  await page.waitForFunction(()=>A.open&&A.msgs.some(m=>m.r==='u'&&m.t==='내일 준비물 알려줘'),null,{timeout:8000});
  ok(true,'호출어 + 뒤따르는 말이 바로 대화로 전달됨');
  await ev(()=>{asConvStop();asClose();asSetCfg({wakeWord:false});asWakeToggleSaved();});
  ok(await ev(()=>!window.__recs.some(r=>r.continuous&&r.__active)),'끄면 듣기를 멈춤');

  console.log('\n[9] 푸시 등록 (가짜 FCM)');
  await ev(()=>{asLoadScript=()=>Promise.resolve();window.firebase.messaging=()=>({getToken:async o=>{window.__vapid=o.vapidKey;return 'TOKEN123';},onMessage:f=>{window.__fg=f;},deleteToken:async()=>true});});
  await ev(()=>{asOpen('settings');});
  ok(await ev(()=>/푸시|VAPID/.test(document.querySelector('.as-adv').textContent)),'설정 고급 영역에 푸시 항목');
  await ev(()=>{document.getElementById('as-s-vapid').value='VAPID_KEY_X';document.getElementById('as-s-dev').value='엄마 폰';});
  await ev(()=>{asCollectSettings();return asPushToggle(true);}); await page.waitForTimeout(200);
  const dev=await ev(()=>Object.entries(window.__store).find(([k])=>k.includes('/devices/')));
  ok(dev&&dev[1].token==='TOKEN123'&&dev[1].notify===true&&dev[1].label==='엄마 폰','기기 토큰이 families/코드/devices 에 저장됨');
  ok(await ev(()=>window.__vapid)==='VAPID_KEY_X','VAPID 키로 토큰 요청');
  await ev(()=>window.__fg({notification:{title:'🎒 준비물 요청이 왔어요',body:'11월 18일 · 리코더'}}));
  ok(await ev(()=>document.getElementById('as-toast').textContent.includes('리코더')),'앱이 열려 있을 때는 토스트로 보여 줌');
  await ev(()=>asPushToggle(false)); await page.waitForTimeout(150);
  ok(await ev(()=>Object.entries(window.__store).find(([k])=>k.includes('/devices/'))[1].notify)===false,'끄면 notify=false');
  await page.screenshot({path:path.join(tmp,'lumi_settings.png')});
  await ev(()=>asClose());

  console.log('\n[10] 대화 모드 해제·키 없음 → 예전 흐름');
  await ev(()=>{asSetCfg({agent:false});asOpen('listen');});
  ok(await ev(()=>A.mode)==='main'||await ev(()=>A.mode)==='draft','대화 모드를 끄면 예전 방식(말 해석)으로 열림');
  await ev(()=>{asClose();asSetCfg({agent:true});});

  console.log('\n[11] 도구 노출 분리: 조회 전용 모드');
  await ev(()=>{asSetCfg({lumiMode:'readonly'});});
  const names=await ev(()=>asToolDecls(true)[0].functionDeclarations.map(f=>f.name));
  ok(names.length===8&&!names.some(n=>/^(add_|reschedule|mark_|confirm|cancel)/.test(n)),'readonly: 조회 8개만, 쓰기·확인 도구 없음(Live 포함)');
  ok(await ev(()=>asSys(false).includes('조회만 할 수 있어')&&!asSys(false).includes('confirm_pending_action')),'readonly: 시스템 지침이 조회 전용으로 바뀜');
  const r1=await ev(()=>asTool('add_event',{title:'테스트',date:todayStr()}));
  ok(r1.error&&!await ev(()=>A.pending),'readonly: 모델이 add_event 를 불러도 거부, 확인 대기도 안 생김');
  const r2=await ev(()=>asTool('confirm_pending_action',{}));
  ok(r2.error,'readonly: confirm_pending_action 도 거부');
  await ev(()=>{asSetCfg({lumiMode:'full'});});
  ok(await ev(()=>asToolDecls(false)[0].functionDeclarations.length)===13,'full 복귀: 확인 대기 없으면 13개');
  await ev(()=>{asTool('add_prep',{date:asYmd(asAddDays(new Date(),1)),text:'리코더'});});
  ok(await ev(()=>asToolDecls(false)[0].functionDeclarations.length)===15,'full: 확인 대기가 생기면 15개(confirm/cancel 노출)');
  await ev(()=>{A.pending=null;});

  console.log(errs.length?'\n페이지 오류:\n  '+errs.join('\n  '):'\n페이지 오류: 없음');
  await browser.close();
  console.log(fails||errs.length?'\n실패 있음':'\n모든 검사 통과'); process.exit(fails||errs.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
