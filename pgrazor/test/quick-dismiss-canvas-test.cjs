const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('pgrazor/diagnostics/quick-close.js','utf8');
const body=source.slice(source.indexOf(' function hideDismissedCatch('),source.indexOf(' function findByGui('));
function trial(change={},after=3,gone=false,error=null){
 const calls=[],events=[],s={dismissEnabled:true,stopping:false,epoch:1,allowedUntil:100,now:()=>10,...change};
 const ctx={s,p:{catchCanvas:{method:'canvas'}},STATE_OPEN:2,alive:()=>true,Memory:{alloc:()=>({writeU8(n){this.value=n},writePointer(p){this.p=p}})},invoke:(m,o,a)=>calls.push([m,a.p.value]),event:(_,k)=>events.push(k)};
 vm.runInNewContext(body+';globalThis.run=hideDismissedCatch',ctx);ctx.run({}, {epoch:1,kind:'details'},after,gone,error);return {calls,events};
}
assert.equal(trial().calls.length,1);assert.equal(trial().calls[0][1],0);
for(const state of [null,2])assert.equal(trial({},state).calls.length,0);
assert.equal(trial({},3,true).calls.length,0);assert.equal(trial({},3,false,'failed').calls.length,0);
for(const change of [{dismissEnabled:false},{stopping:true},{epoch:2},{allowedUntil:0},{allowedUntil:5}])assert.equal(trial(change).calls.length,0);
assert(!source.includes("traps:'all'"));assert(!source.includes('arrayNew('));
console.log('PASS: post-dismiss hiding requires successful state advance, manual Quick Catch lease, and live ownership; failed dismissal stays visible');
const opening=source.slice(source.indexOf(' function catchCanvasAllowed('),source.indexOf(' if(p.catchCanvas)s.listeners'));
function early({valid=true,off=false,invoked=false,state=2}={}){
 const calls=[],r={kind:'details',epoch:1,initDone:true,invoked,gui:{}},s={dismissEnabled:!off,stopping:false,epoch:1,allowedUntil:100,now:()=>10};
 const c={s,p:{catchCanvas:{method:'canvas'}},STATE_OPEN:2,fields:{currentState:1},target:x=>x,alive:()=>true,detailsValid:()=>valid,readS32:()=>state,event:()=>{},Memory:{alloc:()=>({writeU8(n){this.n=n},writePointer(p){this.p=p}})},invoke:(m,o,a)=>calls.push(a.p.n)};
 vm.runInNewContext(opening+';globalThis.f={hideOpeningDetails,restoreCatchCanvas,catchCanvasAllowed}',c);
 c.f.hideOpeningDetails(r);return {c,r,calls};
}
{const x=early();assert.deepEqual(x.calls,[0]);x.r.invoked=true;x.c.f.restoreCatchCanvas(x.r);assert.deepEqual(x.calls,[0,1]);assert(!x.r.canvasHidden);}
for(const cfg of [{valid:false},{off:true},{invoked:true}])assert.equal(early(cfg).calls.length,0);
{const x=early({state:3});x.c.f.restoreCatchCanvas(x.r);assert.deepEqual(x.calls,[0]);}
console.log('PASS: confirmed opening details hidden; unrelated, OFF and already-invoked excluded; failed open dismissal revealed; closing GUI not flashed');
const discovery=source.slice(source.indexOf(' function discoverCatchDetails('),source.indexOf(' function recoverDetails('));
function discover({returned=true,invoking=false,matched=true}={}){
 let hidden=0,freed=0,recovered=0;
 const gui={isNull:()=>false},r={canvasHidden:false},pending={layer:{},returned,epoch:1,deadline:100},s={pendingDetails:pending,invoking,dismissEnabled:true,stopping:false,epoch:1,allowedUntil:100,now:()=>10};
 const ctx={s,p:{catchDiscovery:{top:{method:1}}},target:x=>x,invoke:()=>gui,hold:x=>x,freeHandle:()=>freed++,exact:()=>true,classes:{details:1},DGUI:'details',findByGui:()=>null,recoverDetails:()=>{recovered++;return matched?r:null},hideOpeningDetails:r=>{hidden++;r.canvasHidden=true},readS32:()=>1,fields:{currentState:1},event:()=>{}};
 vm.runInNewContext(discovery+';discoverCatchDetails()',ctx);return {hidden,freed,recovered};
}
assert.equal(discover().hidden,1);assert.equal(discover().freed,1);
assert.equal(discover({returned:false}).recovered,0);assert.equal(discover({invoking:true}).recovered,0);
assert.equal(discover({matched:false}).hidden,0);
console.log('PASS: immediate registry discovery after successful summary return, identity-gated hiding, temporary GC root released');
function sceneDiscovery(match=true){
 let scans=0,hidden=0,freed=0;
 const gui={isNull:()=>false},array={add:()=>({readPointer:()=>gui})},pending={returned:true,epoch:1,deadline:1000},s={pendingDetails:pending,invoking:false,dismissEnabled:true,stopping:false,epoch:1,allowedUntil:1000,now:()=>10};
 const ctx={s,p:{catchScene:{find:1,typeObject:()=>({}),length:()=>1}},ptr:()=>0,api:{class_get_type:()=>1},Memory:{alloc:()=>({writePointer(){}})},target:x=>x,invoke:()=>{scans++;return array},hold:x=>x,freeHandle:()=>freed++,exact:()=>true,classes:{details:1},DGUI:'details',findByGui:()=>null,recoverDetails:()=>match?{canvasHidden:false}:null,hideOpeningDetails:r=>{hidden++;r.canvasHidden=true},readS32:()=>1,fields:{currentState:1},event:()=>{}};
 vm.runInNewContext(discovery+';globalThis.scan=discoverCatchDetails',ctx);ctx.scan();ctx.scan();return {scans,hidden,freed};
}
assert.equal(sceneDiscovery().hidden,1);assert.equal(sceneDiscovery(false).hidden,0);assert.equal(sceneDiscovery(false).scans,1);assert.equal(sceneDiscovery(false).freed,3);
console.log('PASS: scene fallback works without layer service, validates caught identity, releases roots, and throttles repeat scans');
const canvasHook=source.slice(source.indexOf(' if(p.catchCanvas)s.listeners'),source.indexOf(' // Only hide after normal dismissal'));
assert(!canvasHook.includes('recoverDetails('));assert(!canvasHook.includes('detailsValid('));assert(!canvasHook.includes('invoke('));assert(canvasHook.includes('!r.canvasHidden'));
console.log('PASS: canvas hook only suppresses an owned hidden record; no managed recovery or identity invokes from callback');
const directBody=source.slice(source.indexOf(' function directCatchValid('),source.indexOf(' function hideOpeningDetails('));
function directCase({valid=true,normal=true,off=false,callbackThrows=false,transferThrows=false}={}){
 const calls=[],roots=new Set(),pending={response:'response',capturedKey:'7'},s={epoch:1,thread:5,pendingDetails:pending,dismissEnabled:!off,stopping:false,allowedUntil:100,now:()=>10,ownedHandles:roots};
 const ctx={s,p:{details:{fields:{delegateTarget:1}},directPresentation:{callback:{method:'callback'}}},target:x=>x,readPtr:()=> 'state',hold:x=>x,event:()=>{},freeHandle:x=>roots.delete(x),releaseRecord:r=>calls.push('release'),releasePendingDetails:()=>{s.pendingDetails=null;calls.push('pending-release')},transferCatch:()=>{calls.push('transfer');if(transferThrows)throw Error('transfer')},invoke:()=>{calls.push('callback');if(callbackThrows)throw Error('callback')},ptr:()=>0};
 vm.runInNewContext(directBody+';globalThis.run=completeDirectPresentation;directCatchValid=()=>valid;replayDirectPresentation=()=>calls.push("fallback")',Object.assign(ctx,{valid,calls}));
 const result=ctx.run({handles:['svc','pk','cb'],flags:[1,1,-1,0,1,0]},normal);return {calls,result,s};
}
assert.deepEqual(directCase().calls,['transfer','callback','pending-release','release']);
for(const cfg of [{valid:false},{normal:false},{off:true}]){const x=directCase(cfg);assert.deepEqual(x.calls,['fallback','release']);assert.equal(x.result,false);}
assert.deepEqual(directCase({callbackThrows:true}).calls,['transfer','callback','fallback','release']);
assert.deepEqual(directCase({transferThrows:true}).calls,['transfer','fallback','release']);
console.log('PASS: direct return uses transfer before supplied callback; invalid/OFF/failed summary or callback falls back to ordinary details; owned record released');
