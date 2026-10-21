const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../diagnostics/camera-probe.js'),'utf8');
function fixture(options={}) {
    let now=0,nextTimer=0;const timers=new Map(),events=[],calls=[],listeners=[];
    const stats={attach:0,detach:0,freed:0,allocatedTypes:0,lookups:0,handlesCreated:0,handlesFreed:0,invocations:[],threadCurrentCalls:0};
    let currentTid=42,nextHandle=0;const handles=new Map();let reenter=null;
    const moduleBase=0x10000000,moduleSize=0x10000000,code=new Map(),exportNames=new Map();
    const debugAddress=moduleBase+0x4eeaa00,mapAddress=moduleBase+0xa7b44a4,getterAddress=moduleBase+0xae09554;
    const handleExports={gchandle_new:moduleBase+0x4eed760,gchandle_get_target:moduleBase+0x4eed83c,gchandle_free:moduleBase+0x4eeda3c};
    const createBody=moduleBase+0x4ef2ca8,getBody=options.outsideBranch?moduleBase+moduleSize+0x1000:options.negativeBranch?moduleBase+0x4000000:moduleBase+0x4ef3088,freeBody=moduleBase+0x4ef3240;
    const put=(address,words)=>words.forEach((word,i)=>code.set(address+i*4,word));
    const branch=(address,target)=>((0x14000000|(((target-address)/4)&0x03ffffff))>>>0);
    put(handleExports.gchandle_new,[0xaa0003e8,0x52800049,0x7200003f,0x1a890520,0xaa0803e1,branch(handleExports.gchandle_new+20,createBody)]);
    put(createBody+0x384,[0x9a953120]);put(createBody,[0xd10183ff]);
    put(handleExports.gchandle_get_target,[options.badBranch?0xd65f03c0:branch(handleExports.gchandle_get_target,getBody)]);
    put(getBody,[0xf81b0ffe]);put(getBody+20,[options.badHandleCode?0:0x9273c817,0x394082e8]);
    put(handleExports.gchandle_free,[branch(handleExports.gchandle_free,freeBody)]);put(freeBody,[0xf81b0ffe]);put(freeBody+24,[0x9273c816,0x394082c8]);
    for(const [name,address] of Object.entries(handleExports))exportNames.set(address,name);
    exportNames.set(debugAddress,'debug_get_method_info');
    put(debugAddress,[0x90051008,0xf9474508,0xb4000148,0x90051009,0xf9474929,0xb40000e9,0xf940040a,0xeb0a011f,0x2a1f03e8,0x54000128,0xeb0a013f,0x540000e3,0xb40000a1,0xf9400408,0xb900083f,0xf900083f,0xf9000028,0x52800028,0x2a0803e0,0xd65f03c0]);
    if(options.badDebugCode)code.set(debugAddress,0);
    put(getterAddress,[options.badGetterCode?0:0xf9400c00,0xd65f03c0]);
    class U64 {constructor(n){this.n=BigInt(n);}compare(n){n=BigInt(n);return this.n<n?-1:this.n>n?1:0;}toNumber(){assert(this.n<=128n);return Number(this.n);}}
    class P {
        constructor(value){this.value=value;}
        isNull(){return this.value===null || this.value===0;}
        equals(p){return p.value===this.value;}
        and(n){return new P(this.value&n);}
        compare(p){return this.value<p.value?-1:this.value>p.value?1:0;}
        toString(){return String(this.value);}
        add(offset){
            if(typeof this.value==='number')return new P(this.value+offset);
            if(this.value==='assemblies')return {readPointer:()=>new P('assembly'+offset/8)};
            return {readU8:()=>{assert(offset<256);return String(this.value).charCodeAt(offset)||0;}};
        }
        readUtf8String(n){assert(n<256);return String(this.value).slice(0,n);}
        writeU32(n){this.number=n;}
        readU32(){if(options.unreadableCode)throw Error('Cannot read code');return typeof this.value==='number'?code.get(this.value):this.number;}
        writePointer(p){this.pointer=p;}
        readPointer(){return this.pointer;}
        readFloat(){return this.number;}
        readU8(){return this.value==='unboxedBoolean'?(options.invalidMapBoolean?2:options.mapVisible===false?0:1):this.number;}
        writeByteArray(){this.pointer=new P(0);}
        readS32(){
            if(this.value==='unboxedLayer')return options.layerIndex??13;
            if(this.value==='unboxedMask')return (options.cullingMask??(options.mapVisible===false?0x80000000:0x80002000))|0;
            return this.value==='unboxedInt32'?1234:this.number;
        }
        writeU64(n){assert.equal(this.size,8);this.number=n;}
        readU64(){return new U64(this.number);}
        readByteArray(){const b=new Uint8Array(20);b.set([127,69,76,70,2,1]);b[18]=options.wrongElf?62:183;return b.buffer;}
    }
    const nil=()=>new P(0);
    const methods={Camera:['get_main','UnityEngine.Camera',16],Component:['get_transform','UnityEngine.Transform',0],
        Transform:['get_forward','UnityEngine.Vector3',0],UnitySynchronizationContext:['ExecuteTasks','System.Void',16],Object:['GetInstanceID','System.Int32',0],
        MainCameraRig:['IsShowingMap','System.Boolean',0],CameraStack:['get_MainCamera','UnityEngine.Camera',0]};
    const extraMethods={'Camera.get_cullingMask':['get_cullingMask','System.Int32',0],'LayerMask.NameToLayer':['NameToLayer','System.Int32',16]};
    const klassOf=m=>m.value.split('.')[0];
    const details=m=>extraMethods[m.value]||methods[klassOf(m)];
    const api={
        domain_get:()=>options.noDomain?nil():new P('domain'),
        thread_current:()=>{stats.threadCurrentCalls++;return stats.threadCurrentCalls>1&&options.sampling?(options.noSampleThread?nil():new P('unity')):options.existingThread?new P('existing'):nil();},
        thread_attach:()=>{stats.attach++;return options.attachFails?nil():new P('owned');},
        thread_detach:p=>{assert.equal(p.value,'owned');stats.detach++;},
        domain_get_assemblies:(d,count)=>{count.number=options.count??2;return options.nullAssemblies?nil():new P('assemblies');},
        assembly_get_image:assembly=>new P(assembly.value==='assembly1'?'gameImage':'image'),
        image_get_name:image=>new P(options.noImage?'Other.dll':image.value==='gameImage'?'holo-game.dll':'UnityEngine.CoreModule.dll\0AdjacentName'),
        class_from_name:(img,ns,name)=>{stats.lookups++;assert(['System','UnityEngine','Niantic.Holoholo.CameraRig','Niantic.Holoholo.Cameras'].includes(ns.value));return options.missingClass===name.value?nil():new P(name.value);},
        class_get_method_from_name:(klass,name,count)=>{assert.equal(count,name.value==='NameToLayer'?1:0);const key=klass.value+'.'+name.value;assert.equal(name.value,(extraMethods[key]||methods[klass.value])[0]);return options.missingMethod===name.value?nil():new P(key);},
        method_get_class:m=>new P(options.wrongClass?'Other':klassOf(m)),
        method_get_name:m=>new P(options.wrongName?'other':details(m)[0]),
        method_get_param_count:m=>options.wrongCount?2:m.value==='LayerMask.NameToLayer'?1:0,
        method_get_flags:(m,impl)=>{assert.equal(impl.size,4);return options.wrongFlags || (options.mapStatic && klassOf(m)==='CameraStack')?(details(m)[2]^16):details(m)[2];},
        method_get_return_type:m=>new P(options.wrongType?'System.Int32':details(m)[1]),
        method_get_param:(m,index)=>{assert.equal(m.value,'LayerMask.NameToLayer');assert.equal(index,0);return new P(options.badLayerParam?'System.Int32':'System.String');},
        type_get_name:t=>{stats.allocatedTypes++;return new P(options.longType?'x'.repeat(300):t.value);},
        free:p=>{stats.freed++;},
        class_get_field_from_name:(klass,name)=>new P('Vector3.'+name.value),
        field_get_type:()=>new P(options.wrongField?'System.Int32':'System.Single'),
        field_get_parent:()=>new P('Vector3'),field_get_flags:()=>0,
        get_corlib:()=>new P('corlib'),class_is_valuetype:klass=>klass.value!=='String',class_value_size:klass=>klass.value==='Boolean'?(options.badBooleanSize?4:1):options.badIntegerSize?8:4,
        class_is_assignable_from:(expected,actual)=>expected.equals(actual) || (expected.value==='CameraStack' && actual.value==='MainCameraRig'),
        object_get_class:object=>new P(options.badObjectClass?'Wrong':({objCamera:'Camera',objCamera2:'Camera',objTransform:'Transform',objVector:'Vector3',objIdentity:'Int32',objRig:'MainCameraRig',objOtherRig:'OtherRig',objBoolean:options.badBooleanClass?'Wrong':'Boolean',objString:options.badStringClass?'Wrong':'String',objLayer:options.badLayerClass?'Wrong':'Int32',objMask:options.badMaskClass?'Wrong':'Int32'})[object.value]),
        object_unbox:object=>new P(({objBoolean:'unboxedBoolean',objLayer:'unboxedLayer',objMask:'unboxedMask'})[object.value]||'unboxedInt32'),
        string_new:text=>{assert.equal(text.value,'WorldMap');return options.nullString?nil():new P('objString');},
        method_is_generic:()=>!!options.mapGeneric,method_is_inflated:()=>!!options.mapInflated,
        debug_get_method_info:(method,out)=>{out.writePointer(new P((method.value==='MainCameraRig.IsShowingMap'?mapAddress:getterAddress)+(options.badMapAddress?4:0)));return !options.noDebugInfo;},
        gchandle_new:(object,pinned)=>{assert.equal(pinned,0,'Use an unpinned temporary handle');if(options.handleNativeError)throw new TypeError(options.longError?'x'.repeat(1000):'synthetic native handle failure');if(options.failHandle && stats.handlesCreated===1)return nil();stats.handlesCreated++;const id=0x123456780000+(++nextHandle)*8;handles.set(id,object);return new P(id);},
        gchandle_get_target:handle=>{assert(handle instanceof P,'Handle is opaque pointer, never uint32');assert(handle.value>0xffffffff);assert(handles.has(handle.value),'Target handle must be live');return handles.get(handle.value);},
        gchandle_free:handle=>{assert(handle instanceof P);assert(handles.has(handle.value),'Exactly once free');handles.delete(handle.value);stats.handlesFreed++;if(options.cleanupFailure)throw Error('Synthetic cleanup error');},
        field_get_value:(object,field,slot)=>{assert.equal(object.value,'objVector');if(options.throwField)throw Error('Native field read failed');slot.number=options.nonfinite?NaN:options.vertical?({x:0,y:1,z:0})[field.value.split('.')[1]]:({x:1,y:0,z:0})[field.value.split('.')[1]];},
        runtime_invoke:(method,object,args,exception)=>{
            assert(exception.readPointer().isNull(),'Clear exception slot before every call');
            if(method.value==='LayerMask.NameToLayer') {
                assert.equal(args.size,8);assert.equal(args.readPointer().value,'objString','Reference-type managed argument is the String object');
                assert([...handles.values()].some(value=>value.value==='objString'),'Managed String stays rooted through invocation');
                stats.layerArguments=args;
            } else assert(args.isNull());
            stats.invocations.push(method.value);
            if(options.throwGetter===method.value){exception.writePointer(new P('exception'));return nil();}
            if(options.nullCamera && method.value==='Camera.get_main')return nil();
            if(options.nullTransform && method.value==='Component.get_transform')return nil();
            if(reenter)reenter();
            if(method.value==='Camera.get_main' || method.value==='LayerMask.NameToLayer')assert(object.isNull());
            else assert(['objCamera','objTransform','objRig'].includes(object.value));
            return new P({'Camera.get_main':'objCamera','Component.get_transform':'objTransform','Transform.get_forward':'objVector','Object.GetInstanceID':'objIdentity','MainCameraRig.IsShowingMap':'objBoolean','LayerMask.NameToLayer':'objLayer','Camera.get_cullingMask':'objMask'}[method.value]);
        }
    };
    const module={base:new P(moduleBase),size:moduleSize,findExportByName(name){
        if(name===options.missingExport)return null;
        const key=name.replace(/^il2cpp_/,'');
        if(key==='debug_get_method_info')return new P(debugAddress);
        if(key in handleExports)return new P(handleExports[key]);
        if(key.startsWith('runtime_invoke'))return options.noInvoke?null:new P(options.aliasInvoke?'runtime_invoke':key);
        assert(key in api,'Unexpected export '+key);return new P(key);
    }};
    const context={Process:{arch:options.arch||'arm64',pointerSize:options.pointerSize||8,getCurrentThreadId:()=>options.wrongThread?777:currentTid,
        findRangeByAddress(){return options.noCodeRange?null:{base:new P(moduleBase),size:options.shortCodeRange?0x1000:moduleSize,protection:options.nonExecutable?'rw-':'r-x'};},
        findModuleByName(name){
            calls.push('module');
            if(name==='libc.so')return options.noClockModule?null:{findExportByName(symbol){assert.equal(symbol,'clock_gettime');return options.noClockExport?null:new P('clock_gettime');}};
            return options.noModule?null:module;
        }},
        Memory:{alloc(size){const p=new P('allocation');p.size=size;return p;},allocUtf8String:v=>new P(v)},
        ptr:v=>new P(v),
        NativeFunction:function(address,result,argumentTypes){
            if(address.value==='monotonic_ms')return ()=>{
                if(options.clockThrows)throw Error('Synthetic clock read failure');
                return options.clockValue!==undefined ? options.clockValue : now+(options.bootOffset??100000);
            };
            const key=exportNames.get(address.value)||address.value;
            assert(options.sampling || !key.startsWith('runtime_invoke'),'Passive mode never binds managed invocation');
            return (...args)=>{
                // Model the native FFI boundary generically: C bool and integer
                // arguments require integer numbers, not JavaScript booleans.
                argumentTypes.forEach((type,i)=>{
                    if(['bool','int','uint','int32','uint32','uint8','int8'].includes(type) && !Number.isInteger(args[i]))throw new TypeError('expected an integer');
                    if(type==='pointer')assert(args[i] instanceof P,'FFI pointer argument requires a NativePointer');
                });
                calls.push(key);const value=api[key](...args);
                if(result==='pointer')assert(value instanceof P,'Native pointer return preserves full width');
                if(result==='uint32')assert.equal(typeof value,'number','32-bit return would truncate a native pointer');
                return value;
            };
        },
        NativeCallback:function(callback){return callback;},
        CModule:function(code,symbols){
            if(options.filterCompileFails)throw Error('Synthetic CModule compile failure');
            assert.equal(symbols.fieldpad_clock_gettime.value,'clock_gettime','Bind the public libc clock export explicitly');
            assert(code.includes('fieldpad_clock_gettime(7,&time)'),'Continuous timestamp includes device suspend');
            assert(!code.includes('g_get_monotonic_time'),'Do not assume a curated GLib clock builtin');
            return {monotonic_ms:new P('monotonic_ms'),
                on_enter:function(args){this.accepted=args[0].equals(symbols.execute_method.readPointer())?symbols.enter_match(this.threadId):0;},
                on_leave:function(){if(this.accepted)symbols.leave_match(this.threadId);}};
        },
        Interceptor:{attach(address,callbacks){if(options.failSecondHook && listeners.length)throw Error('Synthetic hook failure');const record={address:address.value,callbacks,detached:0,detach(){this.detached++;}};listeners.push(record);return record;}},
        Date:class extends Date{static now(){return now;}},Uint8Array,
        setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},
        console:{log(line){events.push(JSON.parse(line.slice(line.indexOf('{'))));}}
    };
    const probe=vm.runInNewContext(source,context);
    function tick(){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];assert(next,'Expected timer');timers.delete(next[0]);now=Math.max(now,next[1].at);next[1].fn();}
    function drain(){let n=0;while(timers.size){tick();assert(++n<200);}}
    function enter(index=0,tid=42,match=true){const invocation={threadId:tid};currentTid=tid;listeners[index].callbacks.onEnter.call(invocation,[new P(match?'UnitySynchronizationContext.ExecuteTasks':'Unrelated.Method')]);return ()=>{currentTid=tid;listeners[index].callbacks.onLeave.call(invocation);};}
    function getter(tid=42,receiver='objRig',camera='objCamera') {
        const listener=listeners.find(record=>record.address===getterAddress);assert(listener,'Natural getter hook installed');
        const invocation={threadId:tid};currentTid=tid;listener.callbacks.onEnter.call(invocation,[new P(receiver)]);
        return ()=>{currentTid=tid;listener.callbacks.onLeave.call(invocation,new P(camera));};
    }
    return {probe,stats,calls,listeners,events,timers,tick,drain,enter,getter,handles,
        nativeFunction:context.NativeFunction,pointer:value=>new P(value),advance(ms){now+=ms;},setReentry(fn){reenter=fn;}};
}
async function main(){
    const idle=fixture();assert.equal(idle.calls.length,0);assert.equal(idle.timers.size,0);
    const nativeBool=new idle.nativeFunction(idle.pointer('gchandle_new'),'uint32',['pointer','bool']);
    assert.throws(()=>nativeBool(idle.pointer('objCamera'),false),/expected an integer/,'FFI mock rejects JavaScript booleans before native implementation');
    assert.equal(idle.stats.handlesCreated,0);
    assert.equal((await idle.probe.start()).status,'disabled');assert.equal((await idle.probe.start({enabled:1})).status,'disabled');
    for(const opts of [{arch:'x64'},{pointerSize:4},{wrongElf:true}]){
        const f=fixture(opts),p=f.probe.start({enabled:true});f.drain();assert.equal((await p).status,'skipped');assert.equal(f.stats.attach,0);assert.equal(f.listeners.length,0);
    }
    const good=fixture(),received=[];const pending=good.probe.start({enabled:true,onEvent:e=>received.push(e)});
    assert.equal(good.calls.length,0,'Native work must wait for initial timer');good.tick();
    assert.equal(good.stats.attach,1);assert.equal(good.stats.detach,1);assert.equal(good.stats.freed,7);
    assert.equal(good.events.filter(e=>e.kind==='signature').length,4);assert.equal(good.listeners.length,2);
    assert.equal((await good.probe.start({enabled:true})).status,'already-running');
    const beforeEvents=good.events.length;
    for(let i=0;i<4;i++){const outer=good.enter(0);const nested=good.enter(1);nested();outer();}
    good.enter(0,999,false)();assert.equal(good.events.length,beforeEvents,'Hot callbacks must not emit events');
    good.drain();const result=await pending;assert.equal(result.status,'complete');assert.equal(result.matches,4);assert.equal(result.rawMatches,8);assert.equal(result.mainThreadCandidateTid,42);
    assert(good.listeners.every(l=>l.detached===1));assert.equal(received.length,good.events.length);
    assert(!good.calls.includes('runtime_invoke'));assert.equal(good.stats.allocatedTypes,good.stats.freed);
    for(const opts of [{wrongClass:true},{wrongName:true},{wrongCount:true},{wrongFlags:true},{wrongType:true},{missingMethod:'get_main'},{missingClass:'Camera'}]){
        const f=fixture(opts),p=f.probe.start({enabled:true});f.drain();assert.equal((await p).status,'unavailable');assert.equal(f.listeners.length,0);assert.equal(f.stats.attach,f.stats.detach);assert.equal(f.stats.allocatedTypes,f.stats.freed);
    }
    for(const opts of [{longType:true},{nullAssemblies:true},{attachFails:true},{missingExport:'il2cpp_method_get_flags'},{failSecondHook:true}]){
        const f=fixture(opts),p=f.probe.start({enabled:true});f.drain();assert.equal((await p).status,'error');assert(f.listeners.every(l=>l.detached===1));assert.equal(f.stats.allocatedTypes,f.stats.freed);
    }
    const existing=fixture({existingThread:true}),ep=existing.probe.start({enabled:true});existing.drain();assert.equal((await ep).reason,'execute-tasks-not-observed');assert.equal(existing.stats.detach,0);
    for(const opts of [{noModule:true},{noDomain:true},{count:0},{noImage:true,count:'18446744073709551615'}]){
        const f=fixture(opts),p=f.probe.start({enabled:true});f.drain();assert.equal((await p).status,'unavailable');assert.equal(f.stats.attach,f.stats.detach);assert.equal(f.listeners.length,0);
    }
    const noInvoke=fixture({noInvoke:true}),np=noInvoke.probe.start({enabled:true});noInvoke.drain();assert.equal((await np).reason,'invocation-exports-missing');
    const alias=fixture({aliasInvoke:true}),ap=alias.probe.start({enabled:true});alias.tick();assert.equal(alias.listeners.length,1);alias.probe.stop();alias.drain();assert.equal((await ap).status,'cancelled');
    for(const stage of ['before','observing']){
        const f=fixture(),p=f.probe.start({enabled:true});if(stage==='observing')f.tick();f.probe.stop();f.drain();assert.equal((await p).status,'cancelled');assert(f.listeners.every(l=>l.detached===1));assert.equal(f.timers.size,0);
    }
    const multi=fixture(),mp=multi.probe.start({enabled:true});multi.tick();multi.enter(0,1)();multi.enter(0,2)();multi.drain();assert.equal((await mp).reason,'multiple-matching-threads');
    const few=fixture(),fp=few.probe.start({enabled:true});few.tick();few.enter()();few.drain();assert.equal((await fp).reason,'insufficient-matching-calls');
    const active=fixture(),act=active.probe.start({enabled:true});active.tick();for(let i=0;i<3;i++)active.enter()();const leave=active.enter();active.drain();assert.equal((await act).reason,'invocation-still-active');leave();
    const capped=fixture(),cp=capped.probe.start({enabled:true});capped.tick();for(let i=0;i<9;i++)capped.enter(0,i)();capped.drain();assert.equal((await cp).reason,'observation-budget');
    const fields=fixture({wrongField:true}),vp=fields.probe.start({enabled:true});fields.tick();assert.equal(fields.events.find(e=>e.kind==='ready').vectorFields,'signature-mismatch');fields.probe.stop();fields.drain();await vp;
    const sink=fixture(),sp=sink.probe.start({enabled:true,onEvent(){throw Error('Sink failure');}});sink.drain();assert.equal((await sp).reason,'execute-tasks-not-observed');
    const notOpted=fixture(),nop=notOpted.probe.start({enabled:true,sampleCamera:1});notOpted.drain();await nop;assert(!notOpted.calls.includes('get_corlib'));
    // Sampling is a separate explicit opt-in. No getters before three completed
    // outer invocations; nested wrappers cannot manufacture readiness.
    const sampled=fixture({sampling:true}),sampledPromise=sampled.probe.start({enabled:true,sampleCamera:true});sampled.tick();
    for(let i=0;i<2;i++){const out=sampled.enter(),inside=sampled.enter(1);inside();out();}
    assert.equal(sampled.stats.invocations.length,0);
    const eventCount=sampled.events.length;sampled.enter()();assert.equal(sampled.stats.invocations.length,4);
    assert.equal(sampled.events.length,eventCount,'Getter callback only queues numeric records');
    assert.equal(sampled.handles.size,0);assert.equal(sampled.stats.handlesFreed,4);
    sampled.enter()();sampled.advance(499);sampled.enter()();assert.equal(sampled.stats.invocations.length,4);
    sampled.advance(1);sampled.enter()();assert.equal(sampled.stats.invocations.length,8);
    for(let i=0;i<30;i++){sampled.advance(500);sampled.enter()();}
    assert.equal(sampled.stats.invocations.length,80,'Maximum20 samples');sampled.drain();
    const sampledResult=await sampledPromise;assert.equal(sampledResult.status,'complete');assert.equal(sampledResult.samples,20);
    const samples=sampled.events.filter(e=>e.kind==='camera-sample');assert.equal(samples.length,20);
    assert.equal(samples[0].cameraId,1234);assert.equal(samples[0].yawDegrees,90);assert.equal(samples[0].sampleIndex,1);
    assert(samples.every((s,i)=>i===0 || s.timeMs-samples[i-1].timeMs>=500));assert(samples.at(-1).timeMs-samples[0].timeMs<10000);
    assert.equal(sampled.stats.handlesCreated,sampled.stats.handlesFreed);
    for(const [opts,reason] of [[{noSampleThread:true},'unity-thread-not-attached'],[{wrongThread:true},'sampling-thread-changed'],
        [{nullCamera:true},'camera-getter-returned-null'],[{badObjectClass:true},'runtime-class-mismatch'],
        [{throwGetter:'Component.get_transform'},'managed-getter-exception'],[{throwGetter:'Object.GetInstanceID'},'managed-getter-exception'],
        [{nonfinite:true},'nonfinite-forward-vector'],[{vertical:true},'vertical-forward-vector'],[{failHandle:true},'gc-handle-allocation-failed'],[{throwField:true},'native-sampler-error']]) {
        const f=fixture({sampling:true,...opts}),p=f.probe.start({enabled:true,sampleCamera:true});f.tick();
        for(let i=0;i<3;i++)f.enter()();const count=f.stats.invocations.length;f.advance(1000);f.enter()();assert.equal(f.stats.invocations.length,count,'Stop after first failure');
        f.drain();assert.equal((await p).reason,reason);assert.equal(f.stats.handlesCreated,f.stats.handlesFreed);assert.equal(f.handles.size,0);assert(f.listeners.every(l=>l.detached===1));
    }
    for(const opts of [{wrongField:true},{badIntegerSize:true},{missingMethod:'GetInstanceID'},{missingExport:'il2cpp_gchandle_new'}]){
        const f=fixture({sampling:true,...opts}),p=f.probe.start({enabled:true,sampleCamera:true});f.drain();assert.equal((await p).status,'unavailable');assert.equal(f.listeners.length,0);assert.equal(f.stats.invocations.length,0);
    }
    for(const opts of [{badHandleCode:true},{badBranch:true},{outsideBranch:true},{nonExecutable:true},{unreadableCode:true},{noCodeRange:true},{shortCodeRange:true}]) {
        const f=fixture({sampling:true,...opts}),p=f.probe.start({enabled:true,sampleCamera:true});f.drain();
        assert.equal((await p).reason,'gc-handle-abi-unverified');assert.equal(f.listeners.length,0);assert.equal(f.stats.invocations.length,0);assert.equal(f.stats.handlesCreated,0);
    }
    const backwards=fixture({sampling:true,negativeBranch:true}),bp=backwards.probe.start({enabled:true,sampleCamera:true});backwards.tick();for(let i=0;i<3;i++)backwards.enter()();backwards.drain();assert.equal((await bp).samples,1,'Sign-extend backward AArch64 branch correctly');
    const passiveUnknown=fixture({badHandleCode:true}),pu=passiveUnknown.probe.start({enabled:true});passiveUnknown.drain();assert.equal((await pu).reason,'execute-tasks-not-observed','Passive stage does not assume a GC handle ABI');
    const window=fixture({sampling:true}),wp=window.probe.start({enabled:true,sampleCamera:true});window.tick();for(let i=0;i<3;i++)window.enter()();window.advance(10000);window.enter()();window.drain();assert.equal((await wp).samples,1);
    const ambiguous=fixture({sampling:true}),amb=ambiguous.probe.start({enabled:true,sampleCamera:true});ambiguous.tick();ambiguous.enter(0,1)();ambiguous.enter(0,2)();ambiguous.enter(0,1)();ambiguous.drain();assert.equal((await amb).reason,'multiple-matching-threads');assert.equal(ambiguous.stats.invocations.length,0);
    const recursive=fixture({sampling:true}),rp=recursive.probe.start({enabled:true,sampleCamera:true});recursive.tick();recursive.setReentry(()=>recursive.enter()());for(let i=0;i<3;i++)recursive.enter()();assert.equal(recursive.stats.invocations.length,4);recursive.drain();assert.equal((await rp).samples,1);assert.equal(recursive.stats.handlesCreated,recursive.stats.handlesFreed);
    const cancelled=fixture({sampling:true}),cap=cancelled.probe.start({enabled:true,sampleCamera:true});cancelled.tick();cancelled.setReentry(()=>{
        if(cancelled.stats.invocations.length===2){assert.equal(cancelled.handles.size,1);cancelled.probe.stop();assert(cancelled.listeners.every(l=>l.detached===0),'Defer teardown until active sample releases handles');}
    });for(let i=0;i<3;i++)cancelled.enter()();assert.equal(cancelled.handles.size,0);cancelled.drain();assert.equal((await cap).status,'cancelled');assert.equal(cancelled.stats.handlesCreated,cancelled.stats.handlesFreed);
    for(const longError of [false,true]) {
        const f=fixture({sampling:true,handleNativeError:true,longError}),p=f.probe.start({enabled:true,sampleCamera:true});f.tick();
        const before=f.events.length;for(let i=0;i<3;i++)f.enter()();assert.equal(f.events.length,before,'Error detail delivery must wait for poll');
        f.drain();const result=await p;
        assert.equal(result.reason,'native-sampler-error');assert.equal(result.sampleFailure.stage,'Camera:gchandle-new');
        assert.equal(result.sampleFailure.errorName,'TypeError');assert.equal(result.sampleFailure.message,longError?'x'.repeat(256):'synthetic native handle failure');
        assert.equal(result.sampleFailure.tid,42);assert.equal(result.sampleFailure.sampleAttempt,1);
        assert.equal(f.events.filter(e=>e.kind==='sampler-error').length,1);assert.equal(f.handles.size,0);
        assert.equal(f.stats.invocations.length,1,'Diagnostic-only patch must preserve failure point');
    }
    let requested=false;const continuous=fixture({sampling:true}),updates=[];
    const live=continuous.probe.start({enabled:true,sampleCamera:true,continuous:true,shouldSample:()=>requested,onEvent:e=>updates.push(e)});
    continuous.tick();
    for(let i=0;i<100;i++)continuous.enter(0,999,false)();
    for(let i=0;i<3;i++)continuous.enter()();
    assert.equal(continuous.stats.invocations.length,0,'Inactive mode reads no camera');
    requested=true;continuous.tick();
    for(let i=0;i<150;i++){continuous.advance(100);continuous.enter()();continuous.getter()();continuous.tick();}
    assert.equal(continuous.stats.invocations.length,751,'Continuous sampling outlives diagnostic 20-sample/10s limits');
    assert.equal(continuous.stats.invocations.filter(name=>name==='LayerMask.NameToLayer').length,1,'Resolve WorldMap layer once on validated Unity thread');
    assert(continuous.stats.layerArguments.readPointer().isNull(),'Clear managed argument pointer after call');
    assert.equal(updates.filter(e=>e.kind==='camera-sample').length,150);
    assert(updates.filter(e=>e.kind==='camera-sample').every(e=>e.ageMillis>=0 && e.ageMillis<=100));
    assert(updates.filter(e=>e.kind==='camera-sample').every(e=>e.timeMs>=100000),'Native timestamp uses boot epoch rather than diagnostic wall time');
    requested=false;continuous.tick();const count=continuous.stats.invocations.length;
    for(let i=0;i<5;i++){continuous.advance(100);continuous.getter()();continuous.tick();}
    assert.equal(continuous.stats.invocations.length,count,'Suspension stops native getters');
    continuous.probe.stop();continuous.drain();assert.equal((await live).status,'cancelled');
    assert.equal(continuous.handles.size,0);assert(continuous.listeners.every(l=>l.detached===1));
    assert.equal((await continuous.probe.start({enabled:true,sampleCamera:true,continuous:true})).reason,'continuous-restart-required');
    const brokenFilter=fixture({sampling:true,filterCompileFails:true}),bf=brokenFilter.probe.start({enabled:true,sampleCamera:true,continuous:true});brokenFilter.drain();assert.equal((await bf).status,'error');assert.equal(brokenFilter.stats.invocations.length,0);
    for(const opts of [{noClockModule:true},{noClockExport:true}]) {
        const f=fixture({sampling:true,...opts}),p=f.probe.start({enabled:true,sampleCamera:true,continuous:true});
        f.drain();assert.equal((await p).status,'error');assert.equal(f.listeners.length,0);
    }
    for(const value of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
        const f=fixture({sampling:true,clockValue:value}),p=f.probe.start({enabled:true,sampleCamera:true,continuous:true,shouldSample:()=>true});
        f.tick();f.tick();for(let i=0;i<3;i++)f.enter()();f.getter()();f.drain();
        assert.equal((await p).reason,'invalid-boot-clock');assert.equal(f.stats.invocations.length,0,'Bad clock blocks getters and publication');
    }
    const delayed=fixture({sampling:true}),delivered=[];
    const delayedPromise=delayed.probe.start({enabled:true,sampleCamera:true,continuous:true,shouldSample:()=>true,onEvent(event){
        if(event.kind==='camera-sample') {delayed.advance(900);delivered.push(event);}
    }});
    delayed.tick();delayed.tick();for(let i=0;i<3;i++)delayed.enter()();delayed.getter()();delayed.tick();
    assert.equal(delivered.length,1);assert.equal(delivered[0].timeMs,100100,'Delayed bridge delivery retains original sample timestamp');
    assert(delivered[0].ageMillis<=100,'Age computed before bridge delay is insufficient by itself');
    delayed.probe.stop();delayed.drain();await delayedPromise;

    const transientOptions={sampling:true,nullCamera:true};const transient=fixture(transientOptions),availability=[];
    const transientPromise=transient.probe.start({enabled:true,sampleCamera:true,continuous:true,shouldSample:()=>true,onEvent:e=>availability.push(e)});
    transient.tick();transient.tick();for(let i=0;i<3;i++)transient.enter()();transient.getter()();transient.tick();
    assert.equal(availability.filter(e=>e.kind==='camera-unavailable').length,1);
    assert.equal(transient.handles.size,0);assert(transient.listeners.every(l=>l.detached===0),'Missing camera does not destroy reader');
    for(let i=0;i<20;i++){transient.advance(100);transient.getter()();transient.tick();}
    assert.equal(availability.filter(e=>e.kind==='camera-unavailable').length,1,'Repeated unavailable state does not flood output');
    transientOptions.nullCamera=false;transient.advance(100);transient.getter()();transient.tick();
    assert.equal(availability.filter(e=>e.kind==='camera-sample').length,1,'Camera recovery resumes samples');
    const previousCount=availability.length;
    transientOptions.nullCamera=true;transient.advance(100);transient.getter()();
    transientOptions.nullCamera=false;transient.advance(100);transient.getter()();transient.tick();
    assert.deepEqual(availability.slice(previousCount).map(e=>e.kind),['camera-unavailable','camera-sample'],'Brief unavailable state survives latest-sample replacement');
    transient.probe.stop();transient.drain();assert.equal((await transientPromise).status,'cancelled');
    assert.equal(transient.stats.handlesCreated,transient.stats.handlesFreed);

    const regressingOptions={sampling:true};const regressing=fixture(regressingOptions);
    const regressingPromise=regressing.probe.start({enabled:true,sampleCamera:true,continuous:true,shouldSample:()=>true});
    regressing.tick();regressing.tick();for(let i=0;i<3;i++)regressing.enter()();regressing.getter()();
    regressingOptions.clockValue=1;regressing.drain();assert.equal((await regressingPromise).reason,'invalid-boot-clock');
    const throwing=fixture({sampling:true,clockThrows:true}),throwingPromise=throwing.probe.start({enabled:true,sampleCamera:true,continuous:true,shouldSample:()=>true});
    throwing.tick();throwing.tick();for(let i=0;i<3;i++)throwing.enter()();throwing.getter()();throwing.drain();assert.equal((await throwingPromise).reason,'boot-clock-read-failed');
    for(const [options,reason] of [
        [{badDebugCode:true},'map-debug-info-abi-unverified'],[{badGetterCode:true},'map-camera-getter-code-unverified'],
        [{badMapAddress:true},'map-gate-code-mismatch:get_MainCamera'],[{noDebugInfo:true},'map-gate-code-unavailable:get_MainCamera'],
        [{mapStatic:true},'map-gate-signature-mismatch:get_MainCamera'],[{mapGeneric:true},'map-gate-signature-mismatch:get_MainCamera'],
        [{mapInflated:true},'map-gate-signature-mismatch:get_MainCamera'],[{badLayerParam:true},'map-gate-signature-mismatch:NameToLayer']]) {
        const f=fixture({sampling:true,...options}),p=f.probe.start({enabled:true,sampleCamera:true,continuous:true});
        f.drain();assert.equal((await p).reason,reason);assert.equal(f.listeners.length,0);assert.equal(f.stats.invocations.length,0);
    }
    function readyContinuous(f,events=[]) {
        const completion=f.probe.start({enabled:true,sampleCamera:true,continuous:true,shouldSample:()=>true,onEvent:e=>events.push(e)});
        f.tick();f.tick();
        for(let i=0;i<2;i++){f.enter()();f.getter()();}
        assert.equal(f.stats.invocations.length,0,'Getter cannot sample until unique Unity thread has three matches');
        f.enter()();assert.equal(f.stats.invocations.length,0,'ExecuteTasks observes only; never samples continuous camera');
        return completion;
    }
    const mapOptions={sampling:true,mapVisible:false},map=fixture(mapOptions),mapEvents=[];
    const mapPromise=readyContinuous(map,mapEvents);
    map.getter()();map.tick();
    assert.deepEqual(map.stats.invocations,['Camera.get_main','LayerMask.NameToLayer','Camera.get_cullingMask'],'Hidden map stops before transform getters');
    assert.equal(mapEvents.find(e=>e.kind==='camera-unavailable').reason,'map-hidden');
    assert.equal(mapEvents.find(e=>e.kind==='camera-unavailable').cameraCullingMask,0x80000000,'Skybox-only mask stays hidden despite sign bit');
    assert.equal(map.handles.size,0);
    mapOptions.mapVisible=true;map.advance(100);map.getter()();map.tick();
    const visible=mapEvents.find(e=>e.kind==='camera-sample');assert.equal(visible.mapVisible,true);assert.equal(visible.mapGate,'world-map-layer-visible');
    assert.equal(visible.cameraCullingMask,0x80002000,'Skybox plus WorldMap passes nonzero bit test');assert.equal(visible.worldMapLayer,13);
    mapOptions.mapVisible=false;map.advance(100);map.getter()();map.tick();
    assert.equal(mapEvents.at(-1).reason,'map-hidden','Removing map layer invalidates heading');
    mapOptions.mapVisible=true;map.advance(100);map.getter()();map.tick();assert.equal(mapEvents.at(-1).kind,'camera-sample','Restoring map layer resumes sampling');
    map.probe.stop();map.drain();await mapPromise;assert.equal(map.stats.handlesCreated,map.stats.handlesFreed);

    for(const [receiver,camera,reason,invokeCount] of [['objOtherRig','objCamera','non-map-rig',0],['objRig','objCamera2','camera-mismatch',1],['objRig',0,'camera-getter-returned-null',0]]) {
        const f=fixture({sampling:true}),events=[],p=readyContinuous(f,events);
        f.getter(42,receiver,camera)();f.tick();
        assert.equal(events.find(e=>e.kind==='camera-unavailable').reason,reason);
        assert.equal(f.stats.invocations.length,invokeCount);assert.equal(f.handles.size,0);
        assert(f.listeners.every(l=>l.detached===0),'Expected scene transitions remain recoverable');
        f.advance(100);f.getter()();f.tick();assert(events.some(e=>e.kind==='camera-sample'));
        f.probe.stop();f.drain();await p;assert.equal(f.stats.handlesCreated,f.stats.handlesFreed);
    }
    const transformOptions={sampling:true,nullTransform:true},lostTransform=fixture(transformOptions),transformEvents=[];
    const transformPromise=readyContinuous(lostTransform,transformEvents);
    lostTransform.getter()();lostTransform.tick();
    assert.equal(transformEvents.find(e=>e.kind==='camera-unavailable').reason,'camera-transform-unavailable');
    transformOptions.nullTransform=false;lostTransform.advance(100);lostTransform.getter()();lostTransform.tick();
    assert(transformEvents.some(e=>e.kind==='camera-sample'));assert.equal(lostTransform.handles.size,0);
    lostTransform.probe.stop();lostTransform.drain();await transformPromise;
    const trigger=fixture({sampling:true}),triggerEvents=[],triggerPromise=readyContinuous(trigger,triggerEvents);
    trigger.getter(999)();assert.equal(trigger.stats.invocations.length,0,'Other native thread cannot invoke the map gate');
    const executeLeave=trigger.enter();trigger.getter()();executeLeave();
    assert.equal(trigger.stats.invocations.length,0,'Getter inside ExecuteTasks is skipped');
    const outerGetter=trigger.getter(),innerGetter=trigger.getter();innerGetter();
    assert.equal(trigger.stats.invocations.length,0,'Nested natural getter cannot manufacture an independent sample');
    trigger.setReentry(()=>trigger.getter()());outerGetter();
    assert.equal(trigger.stats.invocations.length,6,'Managed getters recursively using CameraStack do not re-enter sampler');
    assert.equal(trigger.handles.size,0);trigger.tick();assert.equal(triggerEvents.filter(e=>e.kind==='camera-sample').length,1);
    for(let i=0;i<100;i++)trigger.getter()();
    assert(trigger.stats.invocations.length<=11,'Natural call frequency stays throttled at 10 Hz');
    trigger.probe.stop();trigger.drain();await triggerPromise;

    for(const [options,reason] of [[{layerIndex:-1},'world-map-layer-mismatch'],[{layerIndex:12},'world-map-layer-mismatch'],
        [{badStringClass:true},'runtime-class-mismatch'],[{badLayerClass:true},'runtime-class-mismatch'],[{badMaskClass:true},'runtime-class-mismatch'],
        [{throwGetter:'LayerMask.NameToLayer'},'managed-getter-exception'],[{throwGetter:'Camera.get_cullingMask'},'managed-getter-exception'],[{cleanupFailure:true},'gc-handle-cleanup-failed']]) {
        const f=fixture({sampling:true,...options}),events=[],p=readyContinuous(f,events);
        f.getter()();f.drain();assert.equal((await p).reason,reason);
        assert(!events.some(e=>e.kind==='camera-sample'),'Malformed values and cleanup faults publish no heading');
        if(f.stats.layerArguments)assert(f.stats.layerArguments.readPointer().isNull(),'Clear managed argument even after exceptions');
        assert.equal(f.handles.size,0);assert.equal(f.stats.handlesCreated,f.stats.handlesFreed);
    }
    console.log('PASS: camera ABI, bounded diagnostics, continuous map-layer gate, natural getter trigger, scene recovery, thread/recursion guards, boot-time freshness, cleanup and errors');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
