const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/../diagnostics/quick-close.js','utf8');
const block=source.slice(source.indexOf(' let rocketMini=null;'),source.indexOf(' function rocketVNextTick(now)'));
function fixture(){
 const handles=new Set(),tr={scale:[2,3,4]},go={active:false},collider={isNull:()=>false},ch={isNull:()=>false,equals:o=>o===ch};let now=100;
 function mem(values={},at=0){return{values,at,add:n=>mem(values,at+n),writePointer:v=>values.ptr=v,writeFloat:v=>values[at]=v,writeU8:v=>values[at]=v,readFloat:()=>values[at]};}
 const s={rocketMask:2,rocketLease:1000,stopping:false,now:()=>now},state={state:{},failed:false};const names=['transform','gameObject','scale','setScale','active','setActive'];const methods=Object.fromEntries(names.map(n=>[n,{method:n}]));
 const ctx={s,rocketState:state,p:{rocket:{mini:{fields:{running:'running',collider:'collider'},methods}}},classes:{mini:'mini'},RMINI:'mini',Memory:{alloc:()=>mem()},hold:o=>{handles.add(o);return o;},freeHandle:o=>handles.delete(o),target:o=>o,alive:o=>!o.dead,exact:()=>true,present:()=>true,readPtr:()=>collider,rocketBool:()=>go.active,event:()=>{},api:{object_unbox:o=>mem({0:o.scale[0],4:o.scale[1],8:o.scale[2]})},invoke:(m,o,args)=>{if(m==='transform')return tr;if(m==='gameObject')return go;if(m==='scale')return {scale:[...tr.scale]};if(m==='setScale')tr.scale=[0,4,8].map(n=>args.values.ptr.values[n]);if(m==='setActive')go.active=!!args.values.ptr.values[0];}};
 vm.runInNewContext(block+'\nglobalThis.collect=rocketMiniCollect;globalThis.tick=rocketMiniTick;globalThis.restore=rocketMiniRestore;',ctx);
 return{s,state,handles,tr,go,collect:()=>ctx.collect(ch),tick:()=>ctx.tick(now),restore:()=>ctx.restore(),expire:()=>now=2000};
}
for(const why of ['off','expired','scope','stop','error']){const f=fixture();f.collect();assert.deepEqual(f.tr.scale,[2000,3000,4000]);assert.equal(f.go.active,true);f.collect();assert.equal(f.handles.size,3);if(why==='off')f.s.rocketMask=0;if(why==='expired')f.expire();if(why==='scope')f.state.state=null;if(why==='stop')f.s.stopping=true;if(why==='error')f.state.failed=true;f.tick();assert.deepEqual(f.tr.scale,[2,3,4]);assert.equal(f.go.active,false);assert.equal(f.handles.size,0);f.collect();assert.equal(f.handles.size,0);}
{const f=fixture();f.collect();f.restore();assert.equal(f.handles.size,0);assert.deepEqual(f.tr.scale,[2,3,4]);}
console.log('PASS minigame collector: scoped option/lease, no cumulative scaling, original state restored on end/OFF/expiry/error/stop, handles released');
