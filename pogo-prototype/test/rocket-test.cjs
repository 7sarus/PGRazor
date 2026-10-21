const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/../diagnostics/quick-close.js','utf8');
const block=source.slice(source.indexOf(' const rocketState='),source.indexOf(' const itemState='));
function fixture(vnext=false){
 let now=1000;const hooks=new Map(),handles=new Set(),calls=[];
 const nil={isNull:()=>true};const obj=(k,f={})=>({k,f,isNull:()=>false,equals(o){return this===o;}});
 const dir=obj('dir',{active:1}),charge=obj('charge',{charged:1,input:1,visible:1}),button=obj('button',{interactable:1}),ui=obj('ui',{state:2,first:charge}),state=obj('rocket'),shield=obj('shield',{state:2,shields:2,button});
 const methods=Object.fromEntries(['enter','exit','ui','update','close','director','active','fast','charge','visible','prompt','shield','shieldClose','interactable'].map(n=>[n,{method:n,address:n}]));
 const s={rocketMask:7,rocketLease:10000,listeners:[],stopping:false};
 const ctx={s,p:{rocket:{methods,fields:{first:'first',second:'second',charged:'charged',input:'input',shields:'shields',button:'button'}}},ROCKET:'rocket',RUI:'ui',RDIR:'dir',RCHARGE:'charge',RSHIELD:'shield',BOOL:'bool',classes:{rocket:'rocket',ui:'ui',dir:'dir',charge:'charge',shield:'shield',bool:'bool'},fields:{currentState:'state'},STATE_OPEN:2,
 hold:o=>{handles.add(o);return o;},target:o=>o,freeHandle:o=>handles.delete(o),exact:(o,k)=>o.k===k,alive:o=>!o.dead,unity:()=>true,event:()=>{},readS32:(o,f)=>o.f[f],readPtr:(o,f)=>o.f[f]||nil,present:(o,f)=>!!o.f[f],api:{object_unbox:o=>({readU8:()=>o.f.value})},invoke:(m,o)=>{if(m==='director')return dir;if(['active','visible','interactable'].includes(m))return obj('bool',{value:o.f[m]});calls.push(m);return nil;},Interceptor:{attach:(a,h)=>{hooks.set(a,h);return{};}}};
 const vg=obj('vgesture',{enabled:1,tap:obj('tap')}),vc=obj('vcharge',{charged:1,visible:1,button}),vu=obj('vui',{gesture:vg,blocked:0});
 if(vnext){Object.assign(ctx,{RVUI:'vui',RVGEST:'vgesture',RVCHARGE:'vcharge',Memory:{alloc:()=>({writePointer(){}})}});Object.assign(ctx.classes,{vui:'vui',vgesture:'vgesture',vcharge:'vcharge'});ctx.p.rocket.vnext={fields:{gesture:'gesture',enabled:'enabled',tap:'tap',button:'button'},methods:Object.fromEntries(['update','close','blocked','fast','observe','charge','charged','visible'].map(n=>[n,{method:'v'+n,address:'v'+n}]))};const invoke=ctx.invoke;ctx.invoke=(m,o,a)=>{if(['vblocked','vcharged','vvisible'].includes(m))return obj('bool',{value:o.f[m.slice(1)]});if(m==='vfast'||m==='vcharge'){calls.push(m);return nil;}return invoke(m,o,a);};}
 vm.runInNewContext(block+'\nglobalThis.tick=rocketTick;',ctx);
 function hook(n,args){const h=hooks.get(n),c={threadId:1};h.onEnter.call(c,args);h.onLeave.call(c);}
 return{s,calls,handles,dir,charge,ui,shield,hook,vg,vc,vu,tick(){ctx.tick(now);now+=600;},enter(){hook('enter',[state]);hook('ui',[ui]);},exit(){hook('exit',[state]);},prompt(){hook('prompt',[shield,{toInt32:()=>1}]);}};
}
{const f=fixture();f.tick();assert.deepEqual(f.calls,[]);f.enter();f.s.rocketMask=1;f.tick();assert.deepEqual(f.calls,['fast']);f.exit();f.tick();assert.equal(f.calls.length,1);assert.equal(f.handles.size,0);}
for(const mode of ['off','lease','inactive']){const f=fixture();f.enter();if(mode==='off')f.s.rocketMask=0;if(mode==='lease')f.s.rocketLease=0;if(mode==='inactive')f.dir.f.active=0;if(mode==='closed')f.ui.f.state=3;f.tick();assert.equal(f.calls.length,0,mode);f.exit();}
{const f=fixture();f.enter();f.s.rocketMask=2;f.charge.f.charged=0;f.tick();assert.equal(f.calls.length,0);f.charge.f.charged=1;f.charge.f.input=0;f.tick();assert.equal(f.calls.length,0);f.charge.f.input=1;f.tick();assert.deepEqual(f.calls,['charge']);f.exit();}
{const f=fixture();f.enter();f.s.rocketMask=4;f.prompt();f.tick();f.tick();assert.deepEqual(f.calls,['shield']);f.prompt();f.shield.f.shields=0;f.tick();assert.equal(f.calls.length,1);f.exit();assert.equal(f.handles.size,0);}
{const f=fixture();f.enter();f.s.stopping=true;f.tick();assert.equal(f.handles.size,0);assert.equal(f.calls.length,0);}
console.log('PASS Rocket: scope, toggles, lease, active phase, charge availability, shield once/count, exit/stop cleanup');

{const f=fixture();f.enter();f.hook('close',[f.ui]);f.tick();assert.equal(f.calls.length,0);f.hook('update',[f.ui]);f.ui.f.state=0;f.s.rocketMask=1;f.tick();assert.deepEqual(f.calls,['fast']);f.exit();}

{const f=fixture(true);f.hook('vupdate',[f.vu]);f.tick();assert.equal(f.calls.length,0);f.enter();f.hook('vupdate',[f.vu]);f.hook('vobserve',[f.vc]);f.s.rocketMask=1;f.tick();assert.deepEqual(f.calls,['vfast']);f.vg.f.enabled=0;f.tick();assert.equal(f.calls.length,1);f.s.rocketMask=2;f.vc.f.charged=0;f.tick();assert.equal(f.calls.length,1);f.vc.f.charged=1;f.vu.f.blocked=1;f.tick();assert.equal(f.calls.length,1);f.vu.f.blocked=0;f.tick();assert.deepEqual(f.calls,['vfast','vcharge']);f.exit();assert.equal(f.handles.size,0);}
console.log('PASS VNext attacks: Rocket-only, separate options, disabled input, missing energy, blocked UI, native handlers, cleanup');
