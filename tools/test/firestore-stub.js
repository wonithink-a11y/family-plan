(function(){
  const store=window.__seed||{}; const listeners=[];
  const today=new Date(); const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const plus=n=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d)};
  const T=iso(today);
  const seed={
    'families/TEST/items/a':{id:'a',subject:'수학',subjectColor:{name:'수학',bg:'#F0F4FF',accent:'#5B7FFF',tag:'#D6E0FF'},dueDate:plus(3),priority:2,tasks:[{id:'t1',text:'x',done:false}],earnedScore:null,maxScore:100,attachments:[],alarmEnabled:false},
    'families/TEST/items/b':{id:'b',subject:'국어',subjectColor:{name:'국어',bg:'#FFF0F3',accent:'#FF6B8A',tag:'#FFD6DF'},dueDate:plus(9),priority:2,tasks:[{id:'t2',text:'x',done:false}],earnedScore:null,maxScore:100,attachments:[],alarmEnabled:false},
    'families/TEST/items/c':{id:'c',subject:'영어',subjectColor:{name:'영어',bg:'#F0FFF4',accent:'#34A853',tag:'#C8F0D4'},dueDate:T,priority:3,tasks:[{id:'t3',text:'영어 에세이 쓰기',done:false},{id:'t4',text:'발표 연습',done:true}],earnedScore:null,maxScore:20,attachments:[],alarmEnabled:false},
    'families/TEST/events/e1':{id:'e1',title:'가족 외식',startDate:plus(1),endDate:plus(1),allDay:true,category:'가족',color:'#FF9500'},
    'families/TEST/events/e2':{id:'e2',title:'체험학습',startDate:plus(6),endDate:plus(6),allDay:true,category:'학교',color:'#34A853'},
    'families/TEST/meta/reward':{stampCount:7,couponsIssued:1,pinHash:'x'},
    'families/TEST/coupons/cp1':{id:'cp1',no:1,title:'책 구입권',issuedAt:Date.now()-86400000*3,usedAt:null},
    'families/TEST/stamps/s1':{id:'s1',date:T,reason:'아침 루틴 완료',ts:Date.now()-1000},
    'families/TEST/stamps/s2':{id:'s2',date:plus(-1),reason:'동생을 도와줬어요',ts:Date.now()-86400000},
    'families/TEST/preps/p1':{id:'p1',date:plus(1),text:'리코더, 색연필 12색',ts:Date.now()-5000,by:'x',done:false},
    'families/TEST/preps/p2':{id:'p2',date:plus(4),text:'체육복',ts:Date.now()-4000,by:'x',done:false},
    ['families/TEST/routine/'+T]:{date:T,done:{d0:true,d1:true,d2:true,d3:true},stamped:false},
  };
  Object.assign(store,JSON.parse(JSON.stringify(seed)));
  const fire=()=>listeners.slice().forEach(l=>l());
  const snapDocs=prefix=>Object.keys(store).filter(k=>k.startsWith(prefix+'/')&&!k.slice(prefix.length+1).includes('/')).map(k=>({id:k.split('/').pop(),data:()=>JSON.parse(JSON.stringify(store[k]))}));
  const mkDoc=path=>({path,collection:c=>mkCol(path+'/'+c),
    set:async(d,o)=>{store[path]=o&&o.merge?Object.assign({},store[path],d):d;fire();},
    update:async d=>{store[path]=Object.assign({},store[path],d);fire();},
    delete:async()=>{delete store[path];fire();},
    onSnapshot(cb){const f=()=>cb({exists:store[path]!==undefined,data:()=>store[path]&&JSON.parse(JSON.stringify(store[path])),metadata:{fromCache:false}});listeners.push(f);setTimeout(f,0);return()=>{const i=listeners.indexOf(f);if(i>=0)listeners.splice(i,1);};}});
  const mkCol=path=>{const q={doc:id=>mkDoc(path+'/'+id),orderBy:()=>q,limit:()=>q,
    onSnapshot(cb){const f=()=>{const docs=snapDocs(path);cb({docs,metadata:{fromCache:false},docChanges:()=>[]});};listeners.push(f);setTimeout(f,0);return()=>{const i=listeners.indexOf(f);if(i>=0)listeners.splice(i,1);};},
    get:async()=>({docs:snapDocs(path)})};return q;};
  const db={collection:c=>mkCol(c),enablePersistence:()=>Promise.resolve(),
    runTransaction:async fn=>{const w=[];const tx={get:async ref=>({exists:store[ref.path]!==undefined,data:()=>store[ref.path]}),set:(ref,d,o)=>w.push([ref,d,o])};await fn(tx);for(const [ref,d,o] of w)await ref.set(d,o);}};
  window.firebase={initializeApp(){},firestore:()=>db,auth:()=>({signInAnonymously:()=>Promise.resolve({})})};
  window.__store=store;
})();
