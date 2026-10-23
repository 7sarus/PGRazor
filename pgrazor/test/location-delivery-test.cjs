const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('pgrazor/embedded-agent.js','utf8');
const code=source.slice(source.indexOf('let locationDelivery ='),source.indexOf('function rollback()'));
let active=true,permission=0,now=1000,disposed=false,locked=false;
const queue=[],delivered=[];
const handler={removeCallbacks:r=>{for(let i=queue.length-1;i>=0;i--)if(queue[i]===r)queue.splice(i,1)},post:r=>queue.push(r),postDelayed:r=>queue.push(r)};
function method(fn=()=>{}){const m={call:(self,...args)=>fn(self,...args)};return {overload:()=>m,m};}
const Manager={notifyLocationUpdate:method((self,p,fix,status)=>{if(fix)assert.ok(locked);delivered.push({self,p,fix,status});})};
const Service={invokeOnStart:method(),invokeOnStop:method(),invokeOnPause:method(),invokeOnResume:method(),getServiceHandler:()=>handler};
Manager.class={isInstance:o=>!!o.nativeClassPointer};
const running={name:()=> 'RUNNING'},failed={name:()=> 'FAILED'},denied={name:()=> 'PERMISSION_DENIED'};
function manager(){const m={callbackLock:{value:{}},nativeClassPointer:{value:1},getContext:()=>({checkSelfPermission:()=>permission}),$dispose:()=>m.released=true,$isSameObject:o=>o===m};return m;}
const classes={
 'com.nianticlabs.nia.location.NianticLocationManager':Manager,
 'com.nianticlabs.nia.contextservice.ContextService':Service,
 'com.nianticlabs.nia.contextservice.ServiceStatus':{RUNNING:{value:running}},
 'android.location.Location':{$new:p=>{const f={provider:p,$dispose:()=>{}};for(const k of ['Latitude','Longitude','Speed','Bearing','Altitude','Accuracy','Time','ElapsedRealtimeNanos'])f['set'+k]=v=>f[k]=v;return f;}},
 'java.lang.System':{currentTimeMillis:()=>now},'android.os.SystemClock':{elapsedRealtimeNanos:()=>now*1000000},'java.lang.Runnable':{}
};
const ctx={disposed:false,control:{active:()=>active,latitude:()=>12,longitude:()=>34,speed:()=>2,bearing:()=>90,event:()=>{}},bootLog:()=>{},Java:{use:n=>{assert.ok(classes[n],n);return classes[n]},retain:o=>o,cast:o=>o,synchronized:(l,f)=>{locked=true;try{f()}finally{locked=false}},registerClass:spec=>({$new:()=>({run:spec.methods.run})})}};
vm.createContext(ctx);vm.runInContext(code+'\nthis.install=installLocationDelivery;this.stop=()=>locationDelivery.stop();',ctx);ctx.install();
const invoke=(n,m,...args)=>(n==='notifyLocationUpdate'?Manager[n]:Service['invoke'+n.slice(0,1).toUpperCase()+n.slice(1)]).m.implementation.call(m,...args);
function tick(){assert.ok(queue.length);queue.shift().run();}
const a=manager();invoke('onStart',a);tick();assert.equal(delivered.length,1);assert.equal(delivered[0].fix.Latitude,12);assert.equal(delivered[0].fix.Time,1000);
now=2000;tick();assert.equal(delivered[1].fix.Time,2000);assert.equal(delivered[1].fix.ElapsedRealtimeNanos,2000000000);
invoke('notifyLocationUpdate',a,'gps',null,failed);assert.equal(delivered.length,2);
invoke('notifyLocationUpdate',a,'gps',null,denied);assert.equal(delivered.length,3);
active=false;tick();assert.equal(delivered.length,3);invoke('notifyLocationUpdate',a,'gps',null,failed);assert.equal(delivered.length,4);
active=true;permission=-1;tick();assert.equal(delivered.length,4);permission=0;
invoke('onPause',a);assert.equal(queue.length,0);invoke('onResume',a);tick();assert.equal(delivered.length,5);
a.nativeClassPointer.value=0;tick();assert.equal(delivered.length,5);
const b=manager();invoke('onStart',b);assert.ok(a.released);assert.equal(queue.length,1);tick();assert.equal(delivered.at(-1).self,b);
invoke('onStop',a);assert.equal(queue.length,1);invoke('onStop',b);assert.equal(queue.length,0);assert.ok(b.released);
invoke('onStart',manager());ctx.stop();assert.equal(queue.length,0);for(const v of [...Object.values(Manager),...Object.values(Service)])if(v.m)assert.equal(v.m.implementation,null);
console.log('PASS location delivery: GPS-independent start, fresh fixes, OFF/permission gates, pause/resume, zero pointer, manager replacement, stop and rollback');
