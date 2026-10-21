const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('pogo-prototype/diagnostics/quick-close.js','utf8');
const block=src.slice(src.indexOf(' // SPAWN replacement:'),src.indexOf(" event(s,'berry-ready'"));
let radius=50,calls=0,callback,reverted=false;const events=[];
const s={active:true,ready:true,stopping:false,spawnEnabled:true,spawnLease:2500,now:()=>100,listeners:[]};
const p={spawn:{address:123},spawnError:null};
vm.runInNewContext(block,{p,s,Number,Math,event:(s,k,v)=>events.push({k,...v}),NativeFunction:function(a,r,t){assert.equal(r,'double');assert.equal(t.length,2);return (...args)=>{assert.deepEqual(args,[1,2]);calls++;return radius;}},NativeCallback:function(f,r,t){assert.equal(r,'double');assert.equal(t.length,2);return f;},Interceptor:{replace(a,f){assert.equal(a,123);callback=f;},revert(a){assert.equal(a,123);reverted=true;}}});
assert.equal(callback(1,2),80);radius=100;assert.equal(callback(1,2),100);
for(const [key,value]of [['spawnEnabled',false],['active',false],['ready',false],['stopping',true],['spawnLease',0]]){radius=50;const old=s[key];s[key]=value;assert.equal(callback(1,2),50);s[key]=old;}
for(const value of [0,-1,NaN,Infinity]){radius=value;assert.ok(Object.is(callback(1,2),value));}
assert.equal(calls,11);assert.deepEqual(events.filter(e=>e.k==='spawn-range'),[{k:'spawn-range',original:50,effective:80}]);s.listeners[0].detach();assert.ok(reverted);console.log('PASS spawn double ABI, original chaining, range, leases and revert');
