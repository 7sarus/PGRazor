const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const feature=require('./feature-fixture.cjs');
function fixture(longest=false){
 let now=1000;const nil={isNull:()=>true},obj=(kind,fields={})=>({kind,fields,isNull:()=>false}),handles=new Set(),calls=[],events=[];
 const inc=obj('inc',{item:901,incId:'unlimited',pokemonId:'0',expiry:'0'}),limited=obj('inc',{item:902,incId:'limited',pokemonId:'0',expiry:'0'});
 const eggs=[2,10,5].map((km,i)=>obj('pokemon',{egg:true,id:String(i+1),target:km,start:0,assignment:'',eggType:0}));
 const ptr=()=>nil,mem=()=>({value:0,writeU64(v){if(typeof v!=="number"&&!(v&&v.uint64))throw TypeError("UInt64 object expected");this.value=v&&v.uint64?v.value:v;},readU64(){return {toString:()=>String(this.value)};},readU8(){return this.value?1:0;},readDouble(){return Number(this.value);}});
 const s={now:()=>now,incubatorEnabled:true,incubatorLongest:longest,incubatorLease:1e9,stopping:false};
 const methods=Object.fromEntries(['put','incubators','eggs','enumerate','move','current','dispose'].map(x=>[x,{method:x}]));
 const fields=Object.fromEntries(['egg','id','target','start','assignment','eggType','item','incId','pokemonId','expiry'].map(x=>[x,x]));
 const p={incubator:{service:'service',contract:'contract',inc:'inc',f:fields,m:methods,unlimited:901,special:2},items:{lookup:{find:{method:'find'},container:{method:'container'},resolve:{method:'resolve'},typeObject:x=>x,map:'map'}}};
 const classes={service:'service',contract:'contract',inc:'inc',player:'player',playerContract:'player',bagContract:'bag',bag:'bag',pokemon:'pokemon'};
 function invoke(m,o,args){
  if(m==='find')return obj('map');if(m==='container')return obj('container');if(m==='resolve')return obj(args[0]==='contract'?'service':args[0]);
  if(m==='incubators')return obj('list',{rows:[limited,inc]});if(m==='eggs')return obj('list',{rows:eggs});
  if(m==='enumerate')return obj('enum',{rows:o.fields.rows,index:-1});
  if(m==='move')return {isNull:()=>false,readU8:()=>++o.fields.index<o.fields.rows.length};
  if(m==='current')return o.fields.rows[o.fields.index];if(m==='dispose')return nil;
  if(m==='put'){calls.push({egg:String(args[0].value),incubator:args[1].fields.incId});return obj('promise');}
  throw Error(m);
 }
 const c={p,s,classes,PK:'pokemon',BAG:'bag',VGP:{player:'player',playerContract:'playerContract',bagContract:'bagContract'},Memory:{alloc:mem},uint64:v=>({uint64:true,value:String(v)}),ptr,invoke,itemArgs:x=>x,exact:(o,k)=>o.kind===k,hold:o=>{handles.add(o);return o;},target:h=>h,freeHandle:h=>handles.delete(h),readPtr:(o,f)=>({isNull:()=>!o.fields[f],text:o.fields[f]}),readS32:(o,f)=>o.fields[f],event:(s,k,d)=>events.push([k,d]),api:{field_get_value:(o,f,v)=>v.value=o.fields[f],object_get_virtual_method:(o,m)=>({isNull:()=>false,toString:()=>m}),class_get_type:x=>x,string_length:o=>o.text.length,string_chars:o=>({readUtf16String:()=>o.text}),object_unbox:x=>x}};
 c.api.object_get_virtual_method=(o,m)=>Object.assign(new String(m),{isNull:()=>false});c.invoke=(m,o,a)=>invoke(String(m),o,a);
 const module=feature('incubation',c);c.tick=module.tick;c.state=module.state;
 return {c,s,inc,limited,eggs,calls,handles,tick(ms=5000){now+=ms;c.tick(now);}};
}
{const f=fixture();f.tick();assert.equal(f.calls[0].egg,'1');assert.equal(f.calls[0].incubator,'unlimited');f.tick();assert.equal(f.calls.length,1);f.inc.fields.pokemonId='1';f.tick();assert.equal(f.c.state.pending,null);f.tick();assert.equal(f.calls.length,1);f.eggs.shift();f.inc.fields.pokemonId='0';f.tick();assert.equal(f.calls[1].egg,'3');}
{const f=fixture(true);f.tick();assert.equal(f.calls[0].egg,'2');f.tick(40000);f.tick();assert.equal(f.calls.length,1);assert.equal(f.c.state.blocked,true);}
{const f=fixture();f.inc.fields.item=902;f.tick();assert.equal(f.calls.length,0);}
{const f=fixture();f.eggs[0].fields.assignment='manual';f.eggs[2].fields.eggType=2;f.tick();assert.equal(f.calls[0].egg,'2');}
{const f=fixture();f.s.incubatorLease=0;f.tick();assert.equal(f.calls.length,0);f.s.incubatorLease=1e9;f.s.incubatorEnabled=false;f.tick();assert.equal(f.calls.length,0);}
{const f=fixture();f.eggs[0].fields.id='18446744073709551614';f.tick();assert.equal(f.calls[0].egg,'18446744073709551614');}
console.log('PASS incubation: shortest/longest, unlimited-only, no duplicate pending requests, timeout blocks retry, hatch re-arms, assigned/special eggs skipped, lease and off gates');
