'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('pgrazor/diagnostics/quick-close.js','utf8');
const code=src.slice(src.indexOf(' const vgpState='),src.indexOf(" event(s,'vgp-ready'"));
function setup(){const events=[],freed=[],s={vgpMask:1,vgpLease:5000,stopping:false,listeners:[]};
 const c={Interceptor:{attach:()=>({})},s,p:{vgp:{m:{capture:{method:'capture'},itemCount:{},manualUI:{address:'manual-ui'}},f:{}}},classes:{},VGP:{},RESP:'response',SPINRESULT:'spin',itemState:{service:'inventory'},event:(s,k,v)=>events.push([k,v]),freeHandle:h=>freed.push(h),hold:o=>o,target:o=>o,alive:()=>true,readPtr:()=>({}),itemInt:()=>1,itemArgs:a=>a,itemNumber:n=>n,ptr:()=>null,Memory:{alloc:()=>({writeByteArray(){},writeS32(){},add(){return {writeFloat(){}}}})},invoke:()=>({}),exact:()=>false};
 c.p.items={fields:{bag:{}}};vm.createContext(c);vm.runInContext(code+'\nthis.state=vgpState;',c);s.vgpManualReady=true;c.vgpPromise=()=>null;return {c,s,events,freed};}
{
 const {c}=setup();c.state.pending={target:'target',promise:'promise',deadline:100,phase:'catch'};c.vgpTick(101);assert.equal(c.state.pending,null);assert.equal(c.state.blocked,true);c.s.vgpMask=0;c.vgpTick(102);assert.equal(c.state.blocked,false);
}
{
 const {c}=setup();c.state.pending={target:'target',promise:'promise',deadline:100,phase:'catch'};c.vgpPromise=()=>({error:true});c.vgpTick(20);assert.equal(c.state.pending,null);assert.equal(c.state.next,3020);
}
{
 const {c,s}=setup();let calls=0;c.invoke=()=>{calls++;return {};};c.vgpPromise=()=>({value:{isNull:()=>false}});c.state.pending={target:'target',promise:'promise',deadline:100,phase:'encounter'};s.vgpLease=0;c.vgpTick(20);assert.equal(calls,0);assert.equal(c.state.pending,null);
}
{
 const {c}=setup();let calls=0;c.invoke=()=>{calls++;return {};};c.vgpPromise=()=>({value:{isNull:()=>false}});c.state.pending={target:'target',promise:'promise',deadline:100,phase:'encounter'};c.vgpTick(20);assert.equal(calls,1);assert.equal(c.state.pending.phase,'catch');c.vgpPromise=()=>null;c.vgpTick(21);assert.equal(calls,1);
}
{
 const {c}=setup();let calls=0;c.invoke=()=>{calls++;};c.itemInt=()=>0;c.vgpPromise=()=>({value:{isNull:()=>false}});c.state.pending={target:'target',promise:'promise',deadline:100,phase:'encounter'};c.vgpTick(20);assert.equal(calls,0);assert.equal(c.state.pending,null);
}
console.log('VGP: timeout, rejection, map lease, one throw, and empty-ball guards passed');

{
 const policy=vm.runInNewContext(src).transferDecision;
 const normal={attack:10,defense:10,stamina:10,rare:false,shiny:false,event:false,background:false,favorite:false,egg:false};
 assert.equal(policy(normal,15),null);
 for(const flag of ['rare','shiny','event','background','favorite','egg'])assert.ok(policy({...normal,[flag]:true},15),flag+' protected');
 assert.ok(policy({...normal,attack:14,defense:14,stamina:14},0));
 assert.ok(policy({...normal,shiny:undefined},0));
}
for(const match of [true,false]){
 const {c,s}=setup();s.transferEnabled=true;s.epoch=1;s.allowedUntil=5000;
 const pokemon={isNull:()=>false};c.PK='pokemon';c.classes.pokemon='pokemon';c.fields={caughtId:'id'};c.api={field_get_value(){}};
 c.p.transfer={methods:{get:{method:'get'}}};c.p.details={fields:{id:'id'}};
 c.invoke=()=>pokemon;c.exact=()=>true;c.capturedKey=()=>match?'new-catch':'other-catch';c.releaseRecord=()=>{};
 let requested=false;c.transferCatch=r=>{requested=true;r.transferRequested=true;r.transferDeadline=4000;};
 c.state.transfer={vgp:true,epoch:1,response:{},vgpBag:{},capturedKey:'new-catch',deadline:4000};
 c.vgpTransferTick(20);assert.equal(requested,match,'only the captured ID is eligible');
}
console.log('VGP: existing transfer protections and caught-ID isolation passed');

{
 const policy=vm.runInNewContext(src).transferDecision;
 const p={attack:10,defense:10,stamina:10,rare:false,shiny:false,event:false,background:false,favorite:false,egg:false,xxs:false,xxl:false};
 assert.equal(policy({...p,xxs:true},63),'protected-xxs');assert.equal(policy({...p,xxl:true},63),'protected-xxl');
 assert.equal(policy({...p,xxs:true},47),null);assert.equal(policy({...p,xxl:true},31),null);
 assert.equal(policy({...p,xxs:undefined},63),'unknown-size');assert.equal(policy(p,63),null);
}
console.log('XXS/XXL keep rules and independent opt-out passed');

// Exercise real result handlers, not a copied retry policy. Use deliberately nonstandard enum values.
for(const [status,delay] of [[11,3600000],[12,5000],[13,3600000],[14,5000],[15,30000],[16,5000],[99,30000]]){
 const {c}=setup();c.p.vgp.catchStates={CatchSuccess:11,CatchEscape:12,CatchFlee:13,CatchMissed:14,CatchError:15,CatchItemReplacement:16};c.p.success=11;
 c.exact=()=>true;c.readS32=()=>status;c.vgpQueueTransfer=()=>{};
 c.vgpPromise=()=>({value:{isNull:()=>false}});c.state.seen.set('p123',3600000);
 c.state.pending={key:'p123',target:'target',promise:'promise',bag:'bag',deadline:10000,phase:'catch'};
 c.vgpTick(100);assert.equal(c.state.pending,null);assert.equal(c.state.seen.get('p123'),100+delay);
}
{
 const {c}=setup();c.state.seen.set('p123',3600000);c.state.pending={key:'p123',target:'target',promise:'promise',deadline:10000,phase:'encounter'};
 c.vgpPromise=()=>({error:true});c.vgpTick(100);assert.equal(c.state.seen.get('p123'),30100);
}
{
 const {c,s}=setup();c.state.seen.set('p123',3600000);c.state.pending={key:'p123',target:'target',promise:'promise',deadline:10000,phase:'encounter'};
 c.vgpPromise=()=>({value:{isNull:()=>false}});s.vgpLease=0;c.vgpTick(100);assert.equal(c.state.seen.get('p123'),5100);
}
console.log('VGP retry: escape/miss/replacement retry, success/flee terminal, error backoff, cancellation recovery');

// A manual encounter's model must never receive the pending VGP throw.
{
 const {c}=setup();let calls=0;c.state.manualTarget={equals:o=>o==='target'};
 c.invoke=()=>{calls++;return {};};c.vgpPromise=()=>({value:{isNull:()=>false}});
 c.state.pending={target:'target',promise:'promise',deadline:100,phase:'encounter'};
 c.vgpTick(20);assert.equal(calls,0);assert.equal(c.state.pending,null);
}
// Permission no longer depends on map camera visibility, but all other gates remain.
{
 const control=fs.readFileSync('pgrazor/src/dev/pgrazor/Control.java','utf8');
 const body=control.match(/public static boolean vgpAllowed\(\)\{([^}]+)\}/)[1];
 const c={locationKnown:()=>true,guardVgpCooldown:()=>{},vgpEnabled:true,vgpReady:true,itemAccessAllowed:()=>true,buddyMapSample:0};
 const allowed=()=>vm.runInNewContext('(function(){'+body+'})()',c);
 assert.equal(allowed(),true,'off-map foreground can run');
 c.itemAccessAllowed=()=>false;assert.equal(allowed(),false,'background/not ready cannot run');
 c.itemAccessAllowed=()=>true;c.locationKnown=()=>false;assert.equal(allowed(),false,'unknown location cannot run');
 c.locationKnown=()=>true;c.guardVgpCooldown=()=>{c.vgpEnabled=false};assert.equal(allowed(),false,'cooldown can revoke permission');
}
console.log('PASS: VGP off-map permission retains safety gates; manual target never receives VGP throw');

{
 const {c,s,freed}=setup();c.state.manualTarget='manual';c.state.manualAt=10;s.vgpMapVisible=true;s.vgpMask=0;
 c.vgpTick(1000);assert.equal(c.state.manualTarget,'manual','ignore stale map sample during entry');
 c.vgpTick(2011);assert.equal(c.state.manualTarget,null);assert.ok(freed.includes('manual'));
 c.state.manualTarget='second';s.stopping=true;c.vgpTick(2020);assert.equal(c.state.manualTarget,null);assert.ok(freed.includes('second'));
}
console.log('PASS: manual target roots released on confirmed map return and stop');

{
 const {c,s}=setup();let attached=0;c.Interceptor.attach=()=>{attached++;return {}};
 s.vgpManualReady=false;s.vgpMask=0;c.vgpTick(10);assert.equal(attached,0,'leave original bytes intact for IV validation');
 s.vgpManualReady=true;c.vgpTick(20);assert.equal(attached,1,'attach after Quick Ball metadata ready');
 c.vgpTick(30);assert.equal(attached,1,'install once');
}
console.log('PASS: VGP nameplate hook waits for IV metadata validation');
