const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../diagnostics/scene-probe.js'),'utf8');
function fixture(options={}) {
    let now=0,timerId=0,currentTid=77;const timers=new Map(),events=[],calls=[],hooks=[];
    const words=[0x90051008,0xf9474508,0xb4000148,0x90051009,0xf9474929,0xb40000e9,0xf940040a,0xeb0a011f,0x2a1f03e8,0x54000128,0xeb0a013f,0x540000e3,0xb40000a1,0xf9400408,0xb900083f,0xf900083f,0xf9000028,0x52800028,0x2a0803e0,0xd65f03c0];
    const exportedAddresses={debug_get_method_info:0x10100,object_get_class:0x10200,method_is_generic:0x10300,method_is_inflated:0x10400};
    const stats={attached:0,detached:0,allocatedNames:0,freedNames:0,fields:0,methods:0};
    class U64{constructor(n){this.n=BigInt(n);}compare(n){n=BigInt(n);return this.n<n?-1:this.n>n?1:0;}toNumber(){assert(this.n<=128n);return Number(this.n);}}
    class P {
        constructor(value){this.value=value;}
        isNull(){return this.value===0;}
        equals(p){return this.value===p.value;}
        toString(){return String(this.value);}
        readUtf8String(n){assert(n<256);return String(this.value).slice(0,n);}
        add(n){if(typeof this.value==='number')return new P(this.value+n);if(this.value==='assemblies')return {readPointer:()=>new P('assembly')};return {readU8:()=>String(this.value).charCodeAt(n)||0};}
        sub(p){return new P(this.value-p.value);}
        compare(p){return Math.sign(this.value-p.value);}
        and(n){return new P(this.value&n);}
        readU32(){return options.badFingerprint?0:words[(this.value-0x10100)/4];}
        toUInt32(){return this.value>>>0;}
        writeByteArray(a){assert.equal(a.length,24);this.pointer=new P(0);}
        readPointer(){return this.pointer;}
        writePointer(){this.index=0;}
        writeU32(n){this.number=n;}
        writeU64(n){assert.equal(this.size,8);this.number=n;}
        readU64(){return new U64(this.number);}
        readByteArray(){const b=new Uint8Array(20);b.set([127,69,76,70,2,1]);b[18]=options.badElf?62:183;return b.buffer;}
    }
    const nil=()=>new P(0),klassName=k=>k.value==='System.Object'?'System.Object':k.value==='CameraStack'?'Niantic.Holoholo.Cameras.CameraStack':'Niantic.Holoholo.CameraRig.'+k.value;
    const api={domain_get:()=>options.noDomain?nil():new P('domain'),
        thread_current:()=>options.existing?new P('existing'):nil(),
        thread_attach:()=>{stats.attached++;return options.attachFails?nil():new P('owned');},
        thread_detach:p=>{assert.equal(p.value,'owned');stats.detached++;},
        domain_get_assemblies:(d,c)=>{c.number=options.count??1;return options.nullList?nil():new P('assemblies');},
        assembly_get_image:()=>new P('image'),image_get_name:()=>new P(options.noImage?'Other.dll':'holo-game.dll\0adjacent'),
        class_from_name:(i,ns,name)=>{assert.equal(ns.value,'Niantic.Holoholo.CameraRig');return options.missing?nil():new P(name.value);},
        class_get_type:k=>new P(klassName(k)),
        class_get_parent:k=>options.runtime&&k.value==='MainCameraRig'?new P('CameraStack'):options.parentCycle?new P('MainCameraRig'):options.longParents?new P(k.value+'Parent'):k.value==='ICameraRig'?nil():new P('System.Object'),
        class_get_flags:k=>k.value==='ICameraRig'?0x20:0,
        class_get_fields:(k,iter)=>{const i=iter.index++;stats.fields++;return i<(options.manyFields?1000:2)?new P({owner:k.value,index:i}):nil();},
        field_get_parent:f=>new P(options.badOwner?'Other':f.value.owner),
        field_get_name:f=>new P(f.value.index===0?'mainCamera':'Instance'),
        field_get_type:f=>new P(f.value.index===0?'UnityEngine.Camera':'Niantic.Holoholo.CameraRig.MainCameraRig'),
        field_get_flags:f=>f.value.index===0?0:16,
        class_get_methods:(k,iter)=>{const i=iter.index++;stats.methods++;return i<(options.manyMethods?1000:2)?new P({owner:k.value,index:i}):nil();},
        method_get_class:m=>new P(m.value.owner),method_get_name:m=>new P(m.value.index===0?'.ctor':m.value.owner==='CameraStack'?'get_MainCamera':'IsShowingMap'),
        method_get_flags:(m,out)=>{assert.equal(out.size,4);return options.staticGetter?16:0;},
        method_get_param_count:m=>options.manyParameters?10000:m.value.index===0?1:0,
        method_get_param:()=>new P('UnityEngine.Camera'),
        method_get_return_type:m=>new P(m.value.index===0?'System.Void':m.value.owner==='CameraStack'?'UnityEngine.Camera':'System.Boolean'),
        type_get_name:type=>{stats.allocatedNames++;return new P(options.longName?'z'.repeat(300):type.value);},
        free:()=>{stats.freedNames++;},
        debug_get_method_info:(m,out)=>{assert.equal(out.size,24);out.pointer=new P(options.nonExecutable?0x50000:options.sharedCode||m.value.owner==='MainCameraRig'?0x11000:0x12000);return options.debugFalse?0:1;},
        object_get_class:p=>{assert(['rig1','rig2','other'].includes(p.value));return new P(p.value==='other'?'Other':'MainCameraRig');},
        method_is_generic:()=>options.generic?1:0,method_is_inflated:()=>0
    };
    const module={base:new P(options.runtime?0x10000:'elf'),size:0x10000,findExportByName(name){
        if(name===options.missingExport)return null;const key=name.replace(/^il2cpp_/,'');assert(key in api,'Unexpected API '+key);return new P(exportedAddresses[key]||key);
    }};
    const context={Process:{arch:options.arch||'arm64',pointerSize:8,getCurrentThreadId:()=>currentTid,
        findRangeByAddress:()=>({base:new P(0x10000),size:0x10000,protection:options.noExecute?'r--':'r-x'}),findModuleByName(){calls.push('module');return options.noModule?null:module;}},
        Memory:{alloc(size){const p=new P('allocation');p.size=size;return p;},allocUtf8String:v=>new P(v)},ptr:v=>new P(v),
        NativeFunction:function(address){const key=Object.keys(exportedAddresses).find(k=>exportedAddresses[k]===address.value)||address.value;return (...args)=>{calls.push(key);return api[key](...args);};},
        Interceptor:{attach(address,callbacks){if(options.attachSecondFails&&hooks.length===1)throw Error('Second attach failed');const h={address,callbacks,detached:false,detach(){this.detached=true;}};hooks.push(h);return h;}},
        Date:class extends Date{static now(){return now;}},Uint8Array,
        setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
        console:{log(line){events.push(JSON.parse(line.slice(line.indexOf('{'))));}}
    };
    const probe=vm.runInNewContext(source,context);
    function tick(){const [id,t]=timers.entries().next().value;timers.delete(id);now+=t.ms;t.fn();}
    function drain(){let count=0;while(timers.size){tick();assert(++count<100);}}
    function enter(key,receiver='rig1',tid=77){currentTid=tid;const h=hooks.find(h=>h.address.value===(key==='IsShowingMap'?0x11000:0x12000));assert(h&&!h.detached);const call={};h.callbacks.onEnter.call(call,[new P(receiver)]);return value=>h.callbacks.onLeave.call(call,new P(value));}
    function invoke(key,value,receiver,tid){enter(key,receiver,tid)(value);}
    return {probe,stats,events,calls,timers,tick,drain,hooks,invoke,enter};
}
async function main(){
    const idle=fixture();assert.equal(idle.calls.length,0);assert.equal((await idle.probe.start()).status,'disabled');assert.equal((await idle.probe.start({enabled:1})).status,'disabled');
    for(const opts of [{arch:'x64'},{badElf:true}]){const f=fixture(opts),p=f.probe.start({enabled:true});f.drain();assert.equal((await p).status,'skipped');assert.equal(f.stats.attached,0);}
    const good=fixture(),sink=[];const promise=good.probe.start({enabled:true,onEvent:event=>{assert.equal(good.stats.attached,good.stats.detached,'Sink receives events only after owned-thread cleanup');sink.push(event);}});
    assert.equal(good.calls.length,0);good.drain();const result=await promise;
    assert.equal(result.status,'complete');assert.equal(result.classes,2);assert.equal(result.fields,4);assert.equal(result.methods,4);assert.equal(result.truncated,false);
    assert.equal(good.stats.attached,1);assert.equal(good.stats.detached,1);assert.equal(good.stats.allocatedNames,good.stats.freedNames);
    assert.equal(sink.length,good.events.length);
    const map=good.events.find(e=>e.kind==='method'&&e.name==='IsShowingMap');assert.equal(map.returnType,'System.Boolean');assert.equal(map.isStatic,false);assert.equal(map.parameterCount,0);
    const ctor=good.events.find(e=>e.isConstructor);assert.deepEqual(ctor.parameterTypes,['UnityEngine.Camera']);
    assert(good.events.some(e=>e.kind==='field'&&e.name==='Instance'&&e.isStatic));
    assert(good.events.some(e=>e.kind==='class'&&e.parent==='System.Object'));assert(good.events.some(e=>e.kind==='class'&&e.isInterface));
    assert(!good.calls.some(c=>/runtime_invoke|field_get_value|field_static|object_get|gchandle/.test(c)),'No object reads or managed invocation');
    for(const opts of [{badOwner:true},{nullList:true},{attachFails:true},{longName:true},{missingExport:'il2cpp_method_get_param'}]) {
        const f=fixture(opts),p=f.probe.start({enabled:true});f.drain();assert.equal((await p).status,'error');assert.equal(f.stats.allocatedNames,f.stats.freedNames);
        if(!opts.attachFails)assert.equal(f.stats.attached,f.stats.detached);
    }
    const existing=fixture({existing:true}),ep=existing.probe.start({enabled:true});existing.drain();await ep;assert.equal(existing.stats.detached,0);
    for(const opts of [{noModule:true},{noDomain:true},{count:0},{noImage:true,count:'18446744073709551615'}]) {
        const f=fixture(opts),p=f.probe.start({enabled:true});assert.equal((await f.probe.start({enabled:true})).status,'already-running');f.drain();assert.equal((await p).status,'unavailable');assert.equal(f.stats.attached,f.stats.detached);
    }
    const missing=fixture({missing:true}),mp=missing.probe.start({enabled:true});missing.drain();assert.equal((await mp).reason,'candidate-classes-missing');
    const limits=fixture({manyFields:true,manyMethods:true,longParents:true,manyParameters:true}),lp=limits.probe.start({enabled:true});limits.drain();const limited=await lp;
    assert(limited.truncated);assert(limited.classes<=6);assert(limited.fields<=128);assert(limited.methods<=128);assert(limits.events.filter(e=>e.kind==='method').every(e=>e.parameterTypes.length<=8));
    const cycle=fixture({parentCycle:true}),cy=cycle.probe.start({enabled:true});cycle.drain();assert.equal((await cy).classes,2);
    const cancel=fixture({noModule:true}),cp=cancel.probe.start({enabled:true});cancel.probe.stop();cancel.drain();assert.equal((await cp).status,'cancelled');assert.equal(cancel.timers.size,0);
    const callbackCancel=fixture(),cc=callbackCancel.probe.start({enabled:true,onEvent:e=>{if(e.kind==='ready')callbackCancel.probe.stop();}});callbackCancel.drain();assert.equal((await cc).status,'cancelled');assert.equal(callbackCancel.stats.attached,callbackCancel.stats.detached);
    const runtime=fixture({runtime:true}),rp=runtime.probe.start({enabled:true,observeRuntime:true});runtime.tick();
    assert.equal(runtime.hooks.length,2);assert(runtime.events.some(e=>e.kind==='observation-ready'));assert.equal(runtime.stats.attached,runtime.stats.detached);
    const outer=runtime.enter('IsShowingMap','rig1',77),inner=runtime.enter('IsShowingMap','rig2',78);inner(0);outer(1);
    runtime.invoke('get_MainCamera',0x123400,'rig1',77);runtime.invoke('IsShowingMap',1,'other');
    assert(!runtime.events.some(e=>e.kind==='scene-observation'),'Hot callbacks must not emit events');runtime.tick();
    const observed=runtime.events.filter(e=>e.kind==='scene-observation');assert.equal(observed.length,3);
    assert.equal(observed[0].receiver,'rig2');assert.equal(observed[0].isShowingMap,false);assert.equal(observed[0].tid,78);
    assert.equal(observed[1].receiver,'rig1');assert.equal(observed[1].isShowingMap,true);assert.equal(observed[2].camera,String(0x123400));
    runtime.drain();const rr=await rp;assert.equal(rr.status,'complete');assert.equal(rr.counts.IsShowingMap,2);assert.equal(rr.rejected.receiver,1);assert(runtime.hooks.every(h=>h.detached));
    assert(!runtime.calls.some(c=>/runtime_invoke|field_get_value|gchandle|profiler/.test(c)),'Passive observation must not invoke game methods or retain managed objects');
    for(const opts of [{badFingerprint:true},{nonExecutable:true},{sharedCode:true},{debugFalse:true},{staticGetter:true},{generic:true},{noExecute:true},{attachSecondFails:true}]) {
        const f=fixture({runtime:true,...opts}),p=f.probe.start({enabled:true,observeRuntime:true});f.drain();assert.equal((await p).status,'error',JSON.stringify(opts));assert(f.hooks.every(h=>h.detached));assert.equal(f.stats.attached,f.stats.detached);
    }
    const silent=fixture({runtime:true}),sp=silent.probe.start({enabled:true,observeRuntime:true});silent.drain();assert.equal((await sp).reason,'no-map-getter-observed');assert(silent.hooks.every(h=>h.detached));
    const stopped=fixture({runtime:true}),stp=stopped.probe.start({enabled:true,observeRuntime:true});stopped.tick();const late=stopped.enter('IsShowingMap');stopped.probe.stop();late(1);stopped.drain();assert.equal((await stp).status,'cancelled');assert(!stopped.events.some(e=>e.kind==='scene-observation'));assert(stopped.hooks.every(h=>h.detached));
    const badBool=fixture({runtime:true}),bbp=badBool.probe.start({enabled:true,observeRuntime:true});badBool.tick();badBool.invoke('IsShowingMap',3);badBool.drain();assert.equal((await bbp).reason,'invalid-boolean-return');
    const threads=fixture({runtime:true}),tp=threads.probe.start({enabled:true,observeRuntime:true});threads.tick();for(let i=0;i<5;i++)threads.invoke('IsShowingMap',1,'rig1',i+1);threads.drain();assert.equal((await tp).reason,'thread-limit');
    const cap=fixture({runtime:true}),capP=cap.probe.start({enabled:true,observeRuntime:true});cap.tick();for(let i=0;i<300;i++)cap.invoke('IsShowingMap',i%2);cap.drain();const capped=await capP;assert.equal(capped.counts.IsShowingMap,300);assert.equal(cap.events.filter(e=>e.kind==='scene-observation').length,256);assert.equal(capped.last.IsShowingMap.isShowingMap,true);
    const hit=fixture({runtime:true}),hp=hit.probe.start({enabled:true,observeRuntime:true});hit.tick();for(let i=0;i<20001;i++)hit.invoke('IsShowingMap',1);hit.drain();assert.equal((await hp).reason,'hit-limit');
    const readyStop=fixture({runtime:true}),rs=readyStop.probe.start({enabled:true,observeRuntime:true,onEvent:e=>{if(e.kind==='observation-ready')readyStop.probe.stop();}});readyStop.drain();assert.equal((await rs).status,'cancelled');assert(readyStop.hooks.every(h=>h.detached));
    console.log('PASS: scene metadata and passive exact getters; ABI/signature/executable guards, nested call identities, no hot emissions, bounded events/hits/threads, cleanup and cancellation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
