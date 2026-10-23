const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('pgrazor/diagnostics/quick-ball.js','utf8');
const body=source.slice(source.indexOf(' function ivEnabled('),source.indexOf(' function release(a)'));
function fixture(){
 const handles=new Set(),state={ivRecords:{catch:null},ivOwnedRecords:[],ivCatch:true,ivOwned:false,ivFault:false,ivOwnedFault:false,ivUntil:1000,ivNext:0,now:()=>10,stopping:false};
 const ctx={prepareOutline:()=>{},renderOutline:()=>{},s:state,api:{gchandle_free:h=>handles.delete(h)},target:h=>h.object,hold:o=>{const h={object:o};handles.add(h);return h},alive:h=>!h.object.dead,ivText:o=>o.text,ivWrite:(o,t)=>{o.text=t},ivSet:(m,o,n)=>{o[m.method]=n},bool:(m,o)=>!!o[m],boxed:(m,o)=>o[m],event:()=>{},p:{iv:{rich:{method:'rich'},fit:{method:'fit'},setFont:{method:'fontSize'},font:{method:'fontSize'},overflow:{method:'overflow'},alignment:{method:'alignment'},overflowValue:1,alignmentValue:4},ivText:{getRich:{method:'rich'},getFit:{method:'fit'},getOverflow:{method:'overflow'},getAlignment:{method:'alignment'}}}};
 vm.runInNewContext(body+';globalThis.f={captureIv,dropIv,ivTick}',ctx);return{ctx,s:state,h:handles,f:ctx.f};
}
const label=()=>({text:'984',fontSize:42,rich:0,fit:1,overflow:0,alignment:0});
const x=fixture(),a=label(),original={...a};
x.f.captureIv('catch',a,'984 · Lv 14 · IV 71.1%');assert.match(a.text,/Lv 14/);assert.equal(a.fontSize,24);
x.s.ivCatch=false;x.f.ivTick();assert.deepEqual(a,original);
x.s.ivCatch=true;x.s.ivNext=0;x.f.ivTick();assert.match(a.text,/IV 71/);
x.f.dropIv('catch');assert.deepEqual(a,original);assert.equal(x.h.size,0);
const b=label();x.f.captureIv('owned',b,'984 · Lv 14 · IV 71.1%');assert.equal(b.text,'984');x.s.ivOwned=true;x.s.ivNext=0;x.f.ivTick();assert.match(b.text,/Lv 14/);
b.text='1001';x.s.ivOwned=false;x.s.ivNext=0;x.f.ivTick();assert.equal(b.text,'1001');assert.equal(b.fontSize,42);
x.f.dropIv('owned');assert.equal(x.h.size,0);
const c=label();x.f.captureIv('catch',c,'984 · Lv 14 · IV 71.1%');x.s.stopping=true;x.s.now=()=>{throw Error('Clock unavailable during cleanup');};x.f.ivTick();assert.deepEqual(c,label());assert.equal(x.h.size,0);
const d=fixture(),dead=label();d.f.captureIv('catch',dead,'984 · Lv 14 · IV 71.1%');dead.dead=true;d.f.ivTick();assert.equal(d.h.size,0);
console.log('PASS: independent IV toggles, original text/style restoration, external CP preservation, stop and destroyed-label GC cleanup');

// Inventory preloads neighboring pages; one page must never restore another.
const multi=fixture();multi.s.ivOwned=true;const pages=[label(),label(),label()];
for(let i=0;i<3;i++)multi.f.captureIv('owned',pages[i],'984 \u00b7 Lv '+(i+1)+' \u00b7 IV 80%');
for(let i=0;i<3;i++)assert.match(pages[i].text,new RegExp('Lv '+(i+1)));
multi.f.dropIv('owned',pages[1]);assert.equal(pages[1].text,'984');assert.match(pages[0].text,/Lv 1/);assert.match(pages[2].text,/Lv 3/);
multi.s.ivOwned=false;multi.f.ivTick();for(const page of pages)assert.deepEqual(page,label());
multi.s.stopping=true;multi.f.ivTick();assert.equal(multi.h.size,0);
console.log('PASS: neighboring inventory pages retain independent labels and all restore on OFF/stop');
