const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const feature=require('./feature-fixture.cjs');
function fixture(){
 let now=1000,quantity=150,requests=[],events=[],handles=new Set(),hooks=new Map(),serial=0;
 class P{constructor(v=0,at=0){this.v=v;this.at=at;}isNull(){return this.v===0;}equals(p){return this.v===p.v;}toString(){return 'ptr'+(this.v.id||0);}add(n){return new P(this.v,this.at+n);}writePointer(p){this.v.slots??={};this.v.slots[this.at]=p;}readPointer(){return this.v.slots?.[this.at]||new P();}writeS32(n){this.v.n=n;}readS32(){return this.v.n;}readU8(){return this.v.n;}}
 const obj=(klass,fields={})=>new P({id:++serial,klass,fields}),nil=()=>new P(),num=n=>new P({n}),bag=obj('bag'),service=obj('service',{bag}),data=obj('data',{id:1,count:150,recyclable:1}),list=obj('list'),expiry=obj('set');
 const methods=Object.fromEntries(['list','init','count','get','expiring','quantity','recycle','result','error'].map(x=>[x,{method:x,address:x}]));
 const s={stopping:false,now:()=>now,itemLease:100000,itemEnabled:true,itemRules:{1:100},itemConfig:'1:100',itemEpoch:1,listeners:[]};
 const t={dk:'data',cb:'callback',names:{1:'Poke Ball'},success:1,fields:{bag:'bag',id:'id',count:'count',recyclable:'recyclable',callbackBag:'bag',prediction:'prediction',proto:{method:'proto'},protoId:'id',status:'status'},methods};
 const ctx={s,p:{items:t},classes:{bag:'bag',service:'service',int:'int',response:'response'},IBAG:'bag',ISERVICE:'service',INT:'int',IRESPONSE:'response',ptr:nil,Memory:{alloc:()=>new P({})},Interceptor:{attach:(address,callbacks)=>{hooks.set(address,callbacks);return{};}},api:{thread_current:()=>service,field_get_value:(o,f,out)=>out.v.n=o.v.fields[f],object_unbox:b=>num(b.v.fields.n)},unity:()=>true,exact:(o,k)=>!o.isNull()&&o.v.klass===k,hold:o=>{handles.add(o);return o;},freeHandle:o=>handles.delete(o),target:o=>o,readPtr:(o,f)=>o.v.fields[f]||nil(),readS32:(o,f)=>o.v.fields[f],event:(_s,k,v={})=>events.push({kind:k,...v}),invoke:(m,o,args)=>{
  if(m==='list')return list;if(m==='count')return obj('int',{n:1});if(m==='get'){data.v.fields.count=quantity;return data;}if(m==='quantity')return obj('int',{n:quantity});if(m==='expiring')return expiry;if(m==='proto')return o.v.fields.proto;
  if(m==='recycle'){requests.push(args.add(8).readPointer().readS32());return obj('promise');}throw Error(m);
 }};
 Object.assign(ctx,feature('itemValues',ctx));ctx.tick=feature('items',ctx).itemTick;
 const init=hooks.get('init'),call={threadId:1};init.onEnter.call(call,[service]);init.onLeave.call(call);hooks.get("list").onEnter.call(call,[service,nil(),nil(),nil(),nil(),nil()]);
 return{s,requests,events,handles,tick(){ctx.tick(now);},advance(n=3100){now+=n;},setCount:n=>quantity=n,result(id=1,ok=true){const h=hooks.get('result'),c={threadId:1};h.onEnter.call(c,[obj('callback',{bag,prediction:obj('prediction',{proto:obj('proto',{id})})}),obj('response',{status:ok?1:2})]);h.onLeave.call(c);},stop(){s.stopping=true;ctx.tick(now);}};
}
for(const [cap,count,expected]of [[100,150,50],[100,100,0],[100,99,0],[0,12,12]]){const f=fixture();f.s.itemRules={1:cap};f.setCount(count);f.tick();assert.deepEqual(f.requests,expected?[expected]:[]);f.stop();assert.equal(f.handles.size,0);}
for(const mode of ['off','unchecked','background']){const f=fixture();if(mode==='off')f.s.itemEnabled=false;if(mode==='unchecked')f.s.itemRules={};if(mode==='background')f.s.itemLease=0;f.tick();assert.equal(f.requests.length,0);f.stop();}
{const f=fixture();f.tick();f.advance();f.tick();assert.deepEqual(f.requests,[50]);f.result(999);f.advance();f.tick();assert.equal(f.requests.length,1);f.result();f.setCount(100);f.advance();f.tick();assert.equal(f.requests.length,1);f.setCount(107);f.advance();f.tick();assert.deepEqual(f.requests,[50,7]);f.stop();}
for(const mode of ['error','timeout']){const f=fixture();f.tick();if(mode==='error')f.result(1,false);else f.advance(16000);f.advance();f.tick();f.advance();f.tick();assert.equal(f.requests.length,1,mode+' no blind retry');f.stop();}
console.log('PASS item limits: existing and new quantities, keep cap, zero cap, unchecked/OFF/background, one pending request, wrong result, failure/timeout pause, handles released');
