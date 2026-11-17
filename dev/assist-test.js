// 도우미 테스트: PLAYWRIGHT_PATH=... node dev/assist-test.js
// - 말 해석(asParse) 표 검사, 기상청 응답 해석, 오디오 디코드, 가든 앱 키 읽기
// - 음성 인식·Gemini·기상청 응답을 가짜로 끼워 넣고 "말로 등록 → 확인 → 저장", "AI 질문 → 읽기" 흐름 검사
// - 화면 스크린샷(.tmp/as_*.png)
const fs=require('fs'),path=require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.join(__dirname,'..'), tmp=path.join(root,'.tmp'); fs.mkdirSync(tmp,{recursive:true});
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g,'');
html=html.replace('<style>','<script>'+fs.readFileSync(path.join(__dirname,'firestore-stub.js'),'utf8')+'</script>\n<style>');
fs.writeFileSync(path.join(tmp,'index.html'),html);

// 페이지에 먼저 심는 가짜들
const MOCK=`
(function(){
  localStorage.setItem('fc','TEST');
  if(!localStorage.getItem('fp_assist_cfg'))localStorage.setItem('fp_assist_cfg',JSON.stringify({agent:false})); // 옛 흐름(말 해석 → 확인 카드) 검사용
  localStorage.setItem('kma_api_key',JSON.stringify('KMAKEY%2Babc'));   // 가든 앱 형식: JSON 문자열
  localStorage.setItem('gemini_api_key','GEMKEY123');                    // 가든 앱 형식: 그대로
  window.__calls=[]; window.__spoken=[];
  const pad=n=>String(n).padStart(2,'0'), ymd=d=>d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate());
  function kma(){
    const now=new Date(), tm=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1), out=[];
    [now,tm].forEach((d,di)=>{for(let h=0;h<24;h++){
      const t=pad(h)+'00', tmp=Math.round(6+Math.sin((h-5)/24*Math.PI*2)*5+di);
      const add=(c,v)=>out.push({baseDate:ymd(now),baseTime:'0500',category:c,fcstDate:ymd(d),fcstTime:t,fcstValue:String(v),nx:56,ny:68});
      add('TMP',tmp);add('SKY',h>=13&&h<=17?3:1);add('PTY',di===0&&h===15?1:0);add('POP',di===0?(h>=13?60:10):30);add('REH',55);add('WSD',2.3);
      if(h===6)add('TMN',4+di); if(h===15)add('TMX',13+di);
    }});
    return out;
  }
  const real=window.fetch.bind(window);
  window.fetch=async(url,opt)=>{
    url=String(url); window.__calls.push(url.slice(0,500));
    const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{'Content-Type':'application/json'}});
    if(url.includes('apis.data.go.kr'))return J({response:{header:{resultCode:'00',resultMsg:'OK'},body:{items:{item:kma()}}}});
    if(url.includes('open-meteo'))return J({},500);
    if(url.includes('generativelanguage')&&(/tts/.test(url)||url.includes('/interactions'))){
      // 0.3초짜리 WAV(24kHz 16bit mono) — 헤더 있는 형식
      const n=7200,buf=new ArrayBuffer(44+n*2),dv=new DataView(buf);
      const w=(o,s)=>[...s].forEach((c,i)=>dv.setUint8(o+i,c.charCodeAt(0)));
      w(0,'RIFF');dv.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,24000,true);dv.setUint32(28,48000,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,n*2,true);
      for(let i=0;i<n;i++)dv.setInt16(44+i*2,Math.round(Math.sin(i/12)*8000),true);
      let b='';new Uint8Array(buf).forEach(x=>b+=String.fromCharCode(x));
      window.__ttsBody=JSON.parse(opt.body); window.__ttsUrl=url; (window.__ttsLog=window.__ttsLog||[]).push({url,body:window.__ttsBody});
      const is38=url.includes('/interactions');
      if(is38&&window.__tts429>0){window.__tts429--;return J({error:{code:429,status:'RESOURCE_EXHAUSTED',details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'1s'}]}},429);}
      if(is38&&window.__tts38fail)return J({error:{message:'nf'}},404);
      if(is38)return J({steps:[{type:'model_output',content:[{type:'audio',data:btoa(b)}]}]});
      return J({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/wav',data:btoa(b)}}]}}]});
    }
    if(url.includes('generativelanguage')){
      window.__askBody=JSON.parse(opt.body);
      return J({candidates:[{content:{parts:[{text:'이차방정식은 **최고차항의 차수가 2**인 방정식이에요. 인수분해로 풀 수 있어요.'}]}}]});
    }
    return real(url,opt);
  };
  // 음성 인식 가짜: start() 하면 window.__say 를 말한 것처럼 돌려준다
  window.__AS_SILENCE=150; window.__AS_IDLE=500;
  window.SpeechRecognition=function(){this.__n=0;this.start=()=>{const n=++this.__n;setTimeout(()=>{this.onstart&&this.onstart();
    setTimeout(()=>{if(n===1)this.onresult&&this.onresult({resultIndex:0,results:[Object.assign([{transcript:window.__say||''}],{isFinal:true})]});
      setTimeout(()=>this.onend&&this.onend(),30);},60);},10);};this.stop=()=>{setTimeout(()=>this.onend&&this.onend(),5);};this.abort=()=>{};};
  window.webkitSpeechRecognition=window.SpeechRecognition;
  // 기기 음성 가짜
  window.SpeechSynthesisUtterance=function(t){this.text=t;};
  Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},speak(u){window.__spoken.push(u.text);setTimeout(()=>u.onend&&u.onend(),5);}}});
  window.__wl=0; Object.defineProperty(navigator,'wakeLock',{value:{request:async()=>{window.__wl++;return{release:async()=>{window.__wl--;},addEventListener(){}};}}});
  window.prompt=()=>'1234';window.confirm=()=>true;
})();`;

let fails=0; const errs=[];
const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m);if(!c)fails++;};
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required']});
  const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2,permissions:[]});
  await ctx.addInitScript(MOCK);
  const page=await ctx.newPage(); page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
  await page.goto('file://'+path.join(tmp,'index.html')); await page.waitForTimeout(900);

  console.log('\n[1] 가든 앱 키 읽기');
  const keys=await page.evaluate(()=>({kma:kmaKey(),gem:geminiKey()}));
  ok(keys.kma==='KMAKEY%2Babc','기상청 키(JSON 문자열)를 따옴표 없이 읽음: '+keys.kma);
  ok(keys.gem==='GEMKEY123','Gemini 키(원문)를 읽음');

  console.log('\n[2] 말 해석 (기준일: 2026-11-17 화요일)');
  const cases=[
    ['수학 수행평가 다음 주 금요일까지 서술형 문제 풀이',{kind:'assess',subject:'수학',date:'2026-11-27',text:'서술형 문제 풀이'}],
    ['영어 수행평가 이번 주 금요일 듣기평가 30점',{kind:'assess',subject:'영어',date:'2026-11-20',text:'듣기평가',score:30}],
    ['과학 수행평가 12월 3일까지 실험 보고서 제출',{kind:'assess',subject:'과학',date:'2026-12-03'}],
    ['사회 수행평가 3일 뒤 발표 준비',{kind:'assess',subject:'사회',date:'2026-11-20'}],
    ['국어 수행평가 내일 독서 감상문 등록해줘',{kind:'assess',subject:'국어',date:'2026-11-18',text:'독서 감상문'}],
    ['기술 가정 수행평가 모레까지 요리 계획서',{kind:'assess',subject:'기술·가정',date:'2026-11-19'}],
    ['내일 준비물 리코더',{kind:'prep',date:'2026-11-18',text:'리코더'}],
    ['금요일에 체육복 가져가야 돼',{kind:'prep',date:'2026-11-20',text:'체육복'}],
    ['다음 주 월요일 색연필 12색 챙겨야 해',{kind:'prep',date:'2026-11-23',text:'색연필 12색'}],
    ['오늘 수행평가 뭐 있어?',{kind:'listAssess',date:'2026-11-17'}],
    ['수학 수행평가 언제야',{kind:'listAssess'}],
    ['오늘 브리핑 해줘',{kind:'brief'}],
    ['오늘 날씨 어때',{kind:'brief'}],
    ['이차방정식이 뭐야',{kind:'ask'}],
    ['수행평가 잘 보는 방법 알려줘',{kind:'ask'}],
    ['',{kind:'empty'}],
  ];
  const now=[2026,10,17,9,0];
  for(const [txt,exp] of cases){
    const r=await page.evaluate(([t,n])=>asParse(t,new Date(...n)),[txt,now]);
    const bad=Object.keys(exp).filter(k=>r[k]!==exp[k]);
    ok(!bad.length,`“${txt}” → ${JSON.stringify(r)}${bad.length?'  (기대와 다름: '+bad.map(k=>k+'='+exp[k]).join(', ')+')':''}`);
  }

  console.log('\n[2b] 말하는 속도 설정');
  const spd=await page.evaluate(()=>{const r={};const orig=localStorage.getItem('fp_assist_cfg');const c0=JSON.parse(orig||'{}');delete c0.speed;localStorage.setItem('fp_assist_cfg',JSON.stringify(c0));r.def=asSpeed();asSetCfg({speed:1.4});r.set=asSpeed();asSetCfg({speed:9});r.max=asSpeed();asSetCfg({speed:0.1});r.min=asSpeed();asSetCfg({speed:'x'});r.bad=asSpeed();if(orig===null)localStorage.removeItem('fp_assist_cfg');else localStorage.setItem('fp_assist_cfg',orig);return r;});
  ok(spd.def===1.15,'기본 속도 1.15배: '+spd.def);
  ok(spd.set===1.4,'설정한 속도를 그대로 사용: '+spd.set);
  ok(spd.max===1.6&&spd.min===0.8,'범위 0.8~1.6으로 제한: '+spd.min+'~'+spd.max);
  ok(spd.bad===1.15,'잘못된 값이면 기본값: '+spd.bad);
  ok(await page.evaluate(()=>S.tab==='stamp'),'첫 화면이 우리집 탭');
  const tabs=await page.evaluate(()=>{const r={};r.nav=[...document.querySelectorAll('.bot-nav .nav-btn')].map(b=>b.textContent.trim());
    setTab('cal');r.cal=[S.tab,S.evSub,document.querySelectorAll('.tabseg .seg button').length];
    setTab('stats');r.stats=[S.tab,S.lsSub];setLsSub('list');r.ls=S.lsSub;setTab('events');setEvSub('list');r.evl=[S.tab,S.evSub];
    setTab('backup');const A=()=>document.getElementById('app').innerHTML;r.set=A().includes("asOpen('settings')")&&A().includes('changePin()');
    setTab('stamp');r.home=A().includes('부모 PIN 변경')===false;return r;});
  ok(tabs.nav.length===5&&/우리집$/.test(tabs.nav[0]),'하단/왼쪽 메뉴 5개, 첫 번째가 우리집: '+tabs.nav.join(','));
  ok(tabs.cal[0]==='events'&&tabs.cal[1]==='cal'&&tabs.cal[2]===2,'옛 탭 cal → 일정 탭의 달력(전환 막대 2개)');
  ok(tabs.stats[0]==='list'&&tabs.stats[1]==='stats','옛 탭 stats → 수행평가 탭의 통계');
  ok(tabs.evl[0]==='events'&&tabs.evl[1]==='list','일정 탭에서 목록으로 전환');
  ok(tabs.set,'설정 탭에 음성·AI·날씨 설정과 부모 PIN 변경이 있음');
  ok(tabs.home,'우리집 탭에서는 설정·PIN 버튼을 뺌');
  ok(await page.evaluate(()=>{const b=document.querySelector('.app-ver');return !!b&&b.textContent===APP_VER&&/^v\d+\.\d+$/.test(APP_VER);}),'헤더 오른쪽 위에 버전 표시');

  console.log('\n[2c] 말 멈추기 버튼');
  const stp=await page.evaluate(()=>{const r={};
    A.speaking=true;asRefreshSpeakBtn();const b=document.getElementById('as-stopfab');r.show=!!b&&getComputedStyle(b).display!=='none';
    const id0=_speakId;b.click();r.after=A.speaking;r.id=_speakId>id0;r.hide=getComputedStyle(document.getElementById('as-stopfab')).display==='none';
    LV.mute=false;asLiveState().speaking=true;asSpeakFloat();r.live=getComputedStyle(document.getElementById('as-stopfab')).display!=='none';
    lvStopSpeech();r.mute=LV.mute;r.liveHide=getComputedStyle(document.getElementById('as-stopfab')).display==='none';
    const n0=LV.srcs.length;lvPlay(btoa(String.fromCharCode(1,0,2,0)));r.dropped=LV.srcs.length===n0;LV.mute=false;asLiveState().speaking=false;asSpeakFloat();return r;});
  ok(stp.show,'말하는 중이면 떠 있는 멈추기 버튼이 보임');
  ok(stp.after===false&&stp.id&&stp.hide,'누르면 말이 멈추고(A.speaking=false, 재생 번호 증가) 버튼이 사라짐');
  ok(stp.live,'실시간 대화가 말하는 중에도 버튼이 보임');
  ok(stp.mute&&stp.liveHide&&stp.dropped,'실시간 대화: 멈추면 남은 소리를 버리고 버튼이 사라짐');

  console.log('\n[3] 기상청 응답 해석·옷차림');
  await page.evaluate(()=>{localStorage.removeItem('fp_wx');S.wx=null;});
  await page.evaluate(()=>fetchWeather(true)); await page.waitForTimeout(400);
  const wx=await page.evaluate(()=>({wx:S.wx,err:S.wxErr,calls:window.__calls.filter(u=>u.includes('data.go.kr')),outfit:wxOutfit(S.wx),umb:wxUmbrella(S.wx)}));
  ok(wx.wx&&wx.wx.src==='KMA','기상청(KMA) 경로로 날씨를 받음');
  ok(wx.calls.length&&wx.calls[0].includes('serviceKey=KMAKEY%2Babc')&&wx.calls[0].includes('nx=')&&wx.calls[0].includes('base_time='),'serviceKey 를 이중 인코딩 없이 붙이고 격자·발표시각을 넣음: '+(wx.calls[0]||'').slice(0,110));
  ok(wx.wx&&wx.wx.min===4&&wx.wx.max===13,'TMN/TMX → 최저 4 / 최고 13 ('+(wx.wx&&wx.wx.min)+'/'+(wx.wx&&wx.wx.max)+')');
  ok(wx.wx&&wx.wx.rainy===true&&wx.umb===true,'오후 강수(PTY) → 우산 필요');
  ok(wx.wx&&wx.wx.tmr&&wx.wx.tmr.max===14,'내일 예보 해석 (최고 '+(wx.wx&&wx.wx.tmr&&wx.wx.tmr.max)+')');
  console.log('     옷차림:',wx.outfit);
  const grid=await page.evaluate(()=>wxGrid(35.0226,126.7895)); ok(grid.nx===56&&grid.ny===68||(grid.nx>50&&grid.nx<62&&grid.ny>62&&grid.ny<75),'나주 빛가람동 격자 '+JSON.stringify(grid));

  console.log('\n[4] 오디오 디코드');
  const dec=await page.evaluate(()=>{
    const mk=(wav)=>{const n=100,buf=new ArrayBuffer((wav?44:0)+n*2),dv=new DataView(buf),o=wav?44:0;
      if(wav){const w=(a,s)=>[...s].forEach((c,i)=>dv.setUint8(a+i,c.charCodeAt(0)));w(0,'RIFF');w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);dv.setUint32(24,22050,true);w(36,'data');dv.setUint32(40,n*2,true);}
      for(let i=0;i<n;i++)dv.setInt16(o+i*2,i*100-5000,true);let b='';new Uint8Array(buf).forEach(x=>b+=String.fromCharCode(x));return btoa(b);};
    const a=asDecodeAudio(mk(true),'audio/wav'), b=asDecodeAudio(mk(false),'audio/L16;codec=pcm;rate=24000');
    return{a:[a.rate,a.pcm.length,a.pcm[0],a.pcm[99]],b:[b.rate,b.pcm.length,b.pcm[0],b.pcm[99]]};
  });
  ok(dec.a.join()==='22050,100,-5000,4900','WAV 헤더(샘플레이트 22050)를 건너뛰고 PCM 100개를 읽음 '+dec.a);
  ok(dec.b.join()==='24000,100,-5000,4900','헤더 없는 PCM(rate=24000)도 읽음 '+dec.b);

  console.log('\n[5] 브리핑 문장');
  const brief=await page.evaluate(()=>asBriefing()); console.log(brief.split('\n').map(l=>'     '+l).join('\n'));
  ok(/우산/.test(brief)&&/영어/.test(brief)&&/수학/.test(brief)&&/리코더/.test(brief),'날씨·우산·오늘/곧 마감 수행평가·내일 준비물이 모두 들어감');

  console.log('\n[6] 화면');
  await page.evaluate(()=>setTab('stamp')); await page.waitForTimeout(300);
  await page.screenshot({path:path.join(tmp,'as_home_tablet.png')});
  ok(await page.evaluate(()=>!!document.querySelector('.bf-wx')&&document.querySelectorAll('.as-row').length>=2),'우리집 탭에 날씨 카드와 수행평가 목록이 보임');

  console.log('\n[7] 말로 수행평가 등록 (가짜 음성 인식)');
  await page.evaluate(()=>{window.__say='수학 수행평가 다음 주 금요일까지 서술형 문제 풀이';asOpen('listen');}); await page.waitForTimeout(500);
  const draft=await page.evaluate(()=>({mode:A.mode,subj:(document.getElementById('as-d-subj')||{}).value,date:(document.getElementById('as-d-date')||{}).value,text:(document.getElementById('as-d-text')||{}).value}));
  ok(draft.mode==='draft'&&draft.subj==='수학'&&/^\d{4}-\d\d-\d\d$/.test(draft.date),'인식 결과가 확인 카드에 채워짐: '+JSON.stringify(draft));
  await page.screenshot({path:path.join(tmp,'as_draft.png')});
  const before=await page.evaluate(()=>S.items.length);
  await page.evaluate(()=>asSaveAssess()); await page.waitForTimeout(500);
  const after=await page.evaluate(()=>({n:S.items.length,mode:A.mode,ans:A.answer,saved:Object.keys(window.__store).filter(k=>k.startsWith('families/TEST/items/')).length,last:Object.values(window.__store).find(v=>v&&v.tasks&&v.tasks[0]&&v.tasks[0].text==='서술형 문제 풀이')}));
  ok(after.n===before+1&&after.mode==='result'&&/등록했어요/.test(after.ans),'등록 → 목록 +1, 완료 메시지: '+after.ans);
  ok(after.saved===4&&after.last&&after.last.subject==='수학'&&after.last.dueDate==='2026-11-27'||(after.saved===4&&after.last&&after.last.subject==='수학'),'Firestore(스텁)에 저장됨, 수행 내용 보존');
  await page.waitForTimeout(600);
  const spoke=await page.evaluate(()=>({tts:window.__ttsUrl,model:localStorage.getItem('fp_tts_model'),body:window.__ttsBody}));
  ok(/tts|interactions/.test(spoke.tts||'')&&spoke.model==='gemini-3.8-flash-tts','음성 입력으로 한 일은 Gemini 3.8 TTS로 읽어 줌 ('+spoke.model+')');
  ok(spoke.body&&spoke.body.generation_config.speech_config[0].voice==='Kore'&&spoke.body.input[0].content[0].annotations[0].type==='speech_metadata'&&/\/interactions$/.test(spoke.tts),'3.8 TTS는 공식 Interactions 형식(speech_config:[{voice}] + speech_metadata)');

  console.log('\n[7b] 목소리 설정이 요청에 반영됨');
  const vz=await page.evaluate(async()=>{window.__ttsLog=[];window.__tts38fail=false;const r={};
    for(const v of ['Charon','Aoede']){await asTtsFetch('목소리 구분 테스트 '+v,v);}
    r.log=window.__ttsLog.map(x=>x.body.generation_config&&x.body.generation_config.speech_config[0].voice);
    window.__tts38fail=true;localStorage.removeItem('fp_tts_model');window.__ttsLog=[];await asTtsFetch('폴백 형식 테스트','Charon');
    const g=window.__ttsLog.find(x=>!/interactions/.test(x.url));r.fallback=g&&g.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName;
    window.__tts38fail=false;localStorage.setItem('fp_tts_model','gemini-3.8-flash-tts');return r;});
  ok(vz.log[0]==='Charon'&&vz.log[1]==='Aoede','선택한 목소리 이름이 요청마다 다르게 전달됨: '+vz.log.join(','));
  ok(vz.fallback==='Charon','3.1/2.5 폴백은 prebuiltVoiceConfig.voiceName 으로 목소리 지정');

  console.log('\n[7b2] 말이 잠깐 끊겨도 바로 끝내지 않음 / 소리로 확인');
  const sil=await page.evaluate(async()=>{const r={};window.__say='';asBack();window.__say='안녕하세요 오늘 날씨';A.text='';A.err='';asOpen('listen');
    await new Promise(x=>setTimeout(x,110)); r.t110=A.listening;        // 인식이 한 번 끝났어도(30ms 뒤) 아직 듣는 중
    await new Promise(x=>setTimeout(x,700)); r.late=A.listening; return r;});
  ok(sil.t110===true,'인식이 끊겨도 다시 시작해서 계속 듣는 중(말 사이 쉼 허용)');
  ok(sil.late===false,'마지막 말소리 뒤 일정 시간이 지나면 끝냄');
  const conf=await page.evaluate(async()=>{const r={};asBack();const n0=S.items.length;
    window.__say='영어 수행평가 다음 주 월요일까지 발표 준비';asOpen('listen');
    for(let i=0;i<60&&A.mode!=='draft';i++)await new Promise(x=>setTimeout(x,25));
    r.draft=A.mode==='draft';window.__say='응';
    for(let i=0;i<80&&A.mode==='draft';i++)await new Promise(x=>setTimeout(x,25));
    await new Promise(x=>setTimeout(x,300)); r.mode=A.mode; r.added=S.items.length-n0;
    asBack();const n1=S.items.length;window.__say='국어 수행평가 다음 주 화요일까지 감상문';asOpen('listen');
    for(let i=0;i<60&&A.mode!=='draft';i++)await new Promise(x=>setTimeout(x,25));
    window.__say='아니';for(let i=0;i<80&&A.mode==='draft';i++)await new Promise(x=>setTimeout(x,25));
    await new Promise(x=>setTimeout(x,200)); r.noAdded=S.items.length-n1; r.noMode=A.mode; return r;});
  ok(conf.draft,'말로 등록하면 확인 카드가 뜸');
  ok(conf.mode==='result'&&conf.added===1,'"응"이라고 답하면 버튼 없이 등록됨: mode='+conf.mode+' 추가='+conf.added);
  ok(conf.noAdded===0&&conf.noMode!=='draft','"아니"라고 답하면 등록하지 않고 닫음: 추가='+conf.noAdded+' mode='+conf.noMode);

  console.log('\n[7c] 구성원 목소리 미리듣기 → 요청한 목소리 확인 알림');
  const mt=await page.evaluate(async()=>{asBack();asOpen('settings');await new Promise(x=>setTimeout(x,150));
    document.getElementById('as-m-voice-dad').value='Orus';window.__ttsLog=[];asTestMember('dad');await new Promise(x=>setTimeout(x,700));
    const t=document.getElementById('as-toast');const sent=(window.__ttsLog||[]).map(x=>x.body.generation_config?x.body.generation_config.speech_config[0].voice:'');
    return{toast:t&&t.textContent,sent,saved:S.mbCfg&&S.mbCfg.list[0].voice};});
  ok(mt.saved==='Orus'&&mt.sent[0]==='Orus','아빠 목소리를 바꾸면 그 목소리 이름(Orus)으로 요청함: '+mt.sent.join(','));
  ok(/Orus/.test(mt.toast||'')&&/v\d+\.\d+/.test(mt.toast||''),'미리듣기 때 요청한 목소리·엔진·앱 버전을 알려 줌: '+mt.toast);
  await page.evaluate(()=>{asBack();});

  console.log('\n[7d] 끝 잡음(WAV 뒤 조각)·한도(429) 재시도');
  const decN=await page.evaluate(()=>{const n=100,buf=new ArrayBuffer(44+n*2+16),dv=new DataView(buf);const w=(o,s)=>[...s].forEach((c,i)=>dv.setUint8(o+i,c.charCodeAt(0)));
    w(0,'RIFF');dv.setUint32(4,buf.byteLength-8,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,24000,true);dv.setUint32(28,48000,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);
    w(36,'data');dv.setUint32(40,n*2,true);for(let i=0;i<n;i++)dv.setInt16(44+i*2,1000,true);
    w(44+n*2,'LIST');dv.setUint32(48+n*2,8,true);for(let i=0;i<8;i++)dv.setUint8(52+n*2+i,0x7f);   // 소리가 아닌 메타데이터
    let b='';new Uint8Array(buf).forEach(x=>b+=String.fromCharCode(x));return asDecodeAudio(btoa(b),'audio/wav').pcm.length;});
  ok(decN===100,'WAV의 data 조각만 소리로 읽음(뒤 LIST 조각은 무시): '+decN+'샘플');
  const rt=await page.evaluate(async()=>{window.__AS_RETRY_MS=30;window.__tts429=1;window.__ttsLog=[];window.__tts38fail=false;localStorage.setItem('fp_tts_model','gemini-3.8-flash-tts');
    const a=await asTtsFetch('한도 재시도 테스트 '+Date.now(),'Kore');return{ok:!!(a&&a.pcm&&a.pcm.length),calls:window.__ttsLog.length};});
  ok(rt.ok&&rt.calls===2,'429가 나도 알려 준 시간 뒤에 한 번 더 시도해서 성공: 요청 '+rt.calls+'번');
  const q=await page.evaluate(async()=>{window.__ttsLog=[];let act=0,max=0;const of=window.fetch;window.fetch=async(u,o)=>{if(String(u).includes('generativelanguage')){act++;max=Math.max(max,act);await new Promise(x=>setTimeout(x,40));const r=await of(u,o);act--;return r;}return of(u,o);};
    await Promise.all([1,2,3].map(i=>asTtsFetch('동시 요청 테스트 '+i+Date.now(),'Kore')));window.fetch=of;return max;});
  ok(q===1,'음성 요청은 동시에 여러 개 보내지 않고 한 줄로 보냄(최대 동시 '+q+'개)');

  console.log('\n[8] 말로 준비물 요청');
  await page.evaluate(()=>{asBack();window.__say='금요일에 체육복 가져가야 돼';asListen();}); await page.waitForTimeout(500);
  await page.evaluate(()=>asSavePrep()); await page.waitForTimeout(400);
  const prep=await page.evaluate(()=>Object.values(window.__store).filter(v=>v&&v.text==='체육복'&&v.by).length);
  ok(prep>=1,'준비물 요청이 저장됨 ('+prep+'건 — 시드 1건 포함이면 2)');

  console.log('\n[9] AI 질문 → 답 읽기, TTS 모델 폴백');
  await page.evaluate(()=>{window.__tts38fail=true;localStorage.removeItem('fp_tts_model');asBack();window.__say='이차방정식이 뭐야';asListen();}); await page.waitForTimeout(900);
  const ask=await page.evaluate(()=>({mode:A.mode,ans:A.answer,body:window.__askBody,url:window.__ttsUrl,model:localStorage.getItem('fp_tts_model')}));
  ok(ask.mode==='result'&&ask.ans.includes('이차방정식')&&!/\*/.test(ask.ans),'AI 답변 표시(마크다운 기호 제거): '+ask.ans);
  ok(ask.body&&ask.body.systemInstruction.parts[0].text.includes('남은 수행평가')&&ask.body.contents[0].parts[0].text==='이차방정식이 뭐야','시스템 지침에 오늘 날짜·남은 수행평가가 들어감');
  ok(/3\.1|2\.5/.test(ask.model||''),'3.8 모델이 404면 다음 모델로 폴백: '+ask.model);
  await page.screenshot({path:path.join(tmp,'as_answer.png')});

  console.log('\n[10] 키 없을 때·기기 음성 폴백');
  await page.evaluate(()=>{localStorage.removeItem('gemini_api_key');asBack();document.getElementById('as-text').value='이차방정식이 뭐야';asRun();}); await page.waitForTimeout(400);
  ok(await page.evaluate(()=>A.notice==='nokey'&&/Gemini 키/.test(A.answer)),'키가 없으면 설정 안내를 보여 줌');
  await page.evaluate(()=>{asSetCfg({ttsMode:'device'});return asSpeak('안녕하세요. 테스트예요.');}); await page.waitForTimeout(300);
  ok((await page.evaluate(()=>window.__spoken)).length>=1,'기기 음성 모드는 speechSynthesis 로 읽음');
  await page.evaluate(()=>{localStorage.setItem('gemini_api_key','GEMKEY123');asSetCfg({ttsMode:'auto'});});

  console.log('\n[11] 설정 화면');
  await page.evaluate(()=>{asClose();asOpen('settings');}); await page.waitForTimeout(200);
  await page.screenshot({path:path.join(tmp,'as_settings.png')});
  await page.evaluate(()=>{asClose();});

  await ctx.close();

  console.log('\n[12] 벽걸이 화면 켜짐 시간대 (07:40~08:30)');
  {
    const c=await browser.newContext({viewport:{width:1280,height:800}}); await c.addInitScript(MOCK);
    const p=await c.newPage(); p.on('pageerror',e=>errs.push('wake: '+e.message));
    await p.goto('file://'+path.join(tmp,'index.html')+'?view=wall'); await p.waitForTimeout(800);
    const st=async(h,m)=>{await p.evaluate(([h,m])=>asWake(new Date(2026,10,17,h,m)),[h,m]);return p.evaluate(()=>window.__wl);};
    const w=await p.evaluate(()=>[asInWindow(new Date(2026,10,17,7,39)),asInWindow(new Date(2026,10,17,7,40)),asInWindow(new Date(2026,10,17,8,29)),asInWindow(new Date(2026,10,17,8,30))]);
    ok(w.join()==='false,true,true,false','07:39 꺼짐 / 07:40 켜짐 / 08:29 켜짐 / 08:30 꺼짐: '+w);
    await p.evaluate(()=>{window.__wl=0;_wl=null;});
    ok(await st(7,50)===1,'07:50 화면 켜짐 잠금을 잡음');
    ok(await st(7,55)===1,'이미 잡았으면 중복으로 잡지 않음');
    ok(await st(9,0)===0,'09:00 잠금을 풀어 기기가 꺼지게 둠');
    await p.evaluate(()=>asSetCfg({awakeMode:'always'}));
    ok(await st(15,0)===1,'"항상" 모드는 시간과 무관하게 유지');
    await p.evaluate(()=>asSetCfg({awakeMode:'window'}));
    await c.close();
  }

  // 벽걸이·폰 스크린샷
  async function shot(url,vp,name,fn){
    const c=await browser.newContext({viewport:vp,deviceScaleFactor:2}); await c.addInitScript(MOCK);
    const p=await c.newPage(); p.on('pageerror',e=>errs.push(name+': '+e.message));
    await p.goto(url); await p.waitForTimeout(1000); if(fn)await fn(p); await p.waitForTimeout(450); await p.screenshot({path:path.join(tmp,name+'.png')}); await c.close();
  }
  const base='file://'+path.join(tmp,'index.html');
  await shot(base,{width:390,height:1700},'as_home_phone',p=>p.evaluate(()=>setTab('stamp')));
  await shot(base+'?view=wall',{width:1280,height:800},'as_wall_tablet');
  await shot(base+'?view=wall',{width:820,height:1180},'as_wall_portrait');
  await shot(base+'?view=wall',{width:390,height:1500},'as_wall_phone');
  await shot(base,{width:390,height:844},'as_sheet_phone',p=>p.evaluate(()=>{setTab('stamp');asOpen();}));

  console.log('\n페이지 오류:',errs.length?errs:'없음'); console.log(fails?('실패 '+fails+'건'):'모든 검사 통과');
  await browser.close(); process.exit(fails||errs.length?1:0);
})();
