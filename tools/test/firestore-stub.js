/* 테스트용 가짜 Firestore (메모리). 브라우저에서 gstatic 의 firebase 스크립트 대신 주입한다.
 * window.__seed 로 초기 데이터를 넣고, window.__store 로 저장된 문서를 검사한다.
 * 키 형식: 'families/<코드>/items/<id>' → 문서 데이터
 * 지원: collection/doc/set/get/delete/onSnapshot/limit/batch (실제 규칙(rules)은 검증하지 못함) */
(function(){
  const store=window.__seed||{};window.__store=store;
  const listeners=[];
  const notify=()=>listeners.slice().forEach(l=>l());
  const clone=o=>JSON.parse(JSON.stringify(o));
  function snapDoc(p){return{exists:p in store,id:p.split('/').pop(),data:()=>clone(store[p])};}
  function snapCol(p,lim){
    const pre=p+'/';
    let ids=Object.keys(store).filter(k=>k.startsWith(pre)&&!k.slice(pre.length).includes('/'));
    if(lim)ids=ids.slice(0,lim);
    const docs=ids.map(k=>({id:k.slice(pre.length),data:()=>clone(store[k]),ref:new DocRef(k)}));
    return{docs,empty:docs.length===0,size:docs.length};
  }
  class DocRef{
    constructor(p){this.p=p;this.id=p.split('/').pop();}
    collection(n){return new ColRef(this.p+'/'+n);}
    set(d){store[this.p]=clone(d);notify();return Promise.resolve();}
    delete(){delete store[this.p];notify();return Promise.resolve();}
    get(){return Promise.resolve(snapDoc(this.p));}
    onSnapshot(cb){const l=()=>cb(snapDoc(this.p));listeners.push(l);setTimeout(l,0);return()=>{const i=listeners.indexOf(l);if(i>=0)listeners.splice(i,1);};}
  }
  class ColRef{
    constructor(p,lim){this.p=p;this.lim=lim;}
    doc(id){return new DocRef(this.p+'/'+id);}
    limit(n){return new ColRef(this.p,n);}
    get(){return Promise.resolve(snapCol(this.p,this.lim));}
    onSnapshot(cb){const l=()=>cb(snapCol(this.p,this.lim));listeners.push(l);setTimeout(l,0);return()=>{const i=listeners.indexOf(l);if(i>=0)listeners.splice(i,1);};}
  }
  const db={
    collection:n=>new ColRef(n),
    enablePersistence:()=>Promise.resolve(),
    batch:()=>{const ops=[];return{set:(r,d)=>ops.push(()=>{store[r.p]=clone(d);}),delete:r=>ops.push(()=>{delete store[r.p];}),commit:()=>{ops.forEach(o=>o());notify();return Promise.resolve();}};}
  };
  window.firebase={initializeApp(){},firestore:()=>db};
})();
