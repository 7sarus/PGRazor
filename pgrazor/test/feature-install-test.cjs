const assert=require('node:assert/strict'),vm=require('node:vm');
const bundle=require('./script-bundle.cjs')('quick-close.js');
// Expose only the private install entry point in this test copy. Execute the full composed script:
// no feature bodies are sliced out and no factory is replaced with a fake implementation.
const marker='const api=Object.freeze({start,';
assert.equal(bundle.split(marker).length,2,'unique installer export seam');
const pointer={isNull:()=>false,toString:()=> 'address',writePointer(){}};
const hooks=[],dependencies=[];
const context={Memory:{alloc:()=>pointer},ptr:()=>pointer,uint64:n=>n,
 Process:{},NativeFunction:function(){},NativeCallback:function(callback){return callback;},
 CModule:function(){return {on_enter(){},on_leave(){}};},
 Interceptor:{attach(address,callbacks){hooks.push(callbacks);return {detach(){}};}}};
vm.createContext(context);
const api=vm.runInContext(bundle.replace(marker,'const api=Object.freeze({install,start,'),context);
for(const [name,factory] of Object.entries(context.PGRazorFeatures)){
 const signature=Function.prototype.toString.call(factory).match(/^function\s*\(\{([^}]+)\}\)/);
 assert.ok(signature,name+' exposes a flat destructured dependency contract');
 const expected=signature[1].split(',').map(key=>key.trim()).sort();
 context.PGRazorFeatures[name]=args=>{
  assert.deepEqual(Object.keys(args).sort(),expected,name+' dependency contract must be complete');
  for(const [key,value] of Object.entries(args))assert.notEqual(value,undefined,name+'.'+key+' dependency missing');
  dependencies.push([name,args]);return factory(args);
 };
}
const methods=Object.fromEntries(['initialize','setScores','handleOpenComplete','dismiss','exitState','execute'].map(name=>[name,{address:pointer,method:pointer}]));
const state={active:true,listeners:[],queue:[],records:[],ownedHandles:new Set(),now:()=>1000};
api.install(state,{api:{},classes:{},fields:{},methods,module:{findExportByName:()=>pointer}});
assert.equal(state.ready,true,'combined installer reaches readiness with optional contracts absent');
assert.ok(state.queue.some(e=>e.kind==='metadata-ready'));
assert.equal(dependencies.length,12,'all real factories, including Rocket minigame, initialized');
for(const [name,args] of dependencies)if(args.getItemState)assert.ok(args.getItemState(),name+' sees initialized shared inventory state');
assert.ok(hooks.length>0,'core hooks installed');
console.log('PASS: full composed feature installation, explicit dependencies, shared inventory initialization and readiness');
