const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../diagnostics/interaction-probe.js'),'utf8');
const capture='Niantic.Holoholo.Encounter.EncounterCaptureState',prefix='Niantic.Holoholo.Pokestop.';
const names=[capture,prefix+'PokestopState',prefix+'PokestopSpinnerInteractionState',prefix+'PokestopResolveState',prefix+'PokestopInteractionState',
    'Holoholo.Rpc.CatchPokemonOutProto','Holoholo.Rpc.FortSearchOutProto','Niantic.Holoholo.Encounter.EncounterResult',
    'Niantic.Holoholo.Encounter.EncounterSummaryGuiController','Niantic.Holoholo.Encounter.EncounterSummaryState',
    'Niantic.Holoholo.Encounter.Pokeball'];
const targetPairs=[[capture,'EnterState'],[capture,'ExitState'],[capture,'SummaryDismissed'],[names[1],'NotifyReceivedItems'],[names[1],'NotifyPokestopSpin'],[names[1],'ResolveComplete'],[names[2],'EnterState'],[names[2],'ExitState'],[names[3],'EnterState'],[names[3],'ExitState'],[capture,'btdd'],[capture,'btdf'],[capture,'btdi'],[names[2],'bgff']];
targetPairs.push(...['HandleOpen','HandleOpenComplete','HandleDismiss','HandleDismissComplete'].map(n=>[names[8],n]),[names[9],'ExitState']);
targetPairs.push([names[10],'btxu']);
const earlyWords=[0xf81d0ffe,0xa90157f6,0xa9024ff4,0xf0021bb4,0xaa0003f3,0x39628688,0x37000428,0xd001efe0];
const resultMethods=new Set(['SummaryDismissed','btdd','btdf','btdi','bgff']);
const enumName=owner=>owner+'.Types.'+(owner===names[6]?'Result':'Status');
const words=[0x90051008,0xf9474508,0xb4000148,0x90051009,0xf9474929,0xb40000e9,0xf940040a,0xeb0a011f,0x2a1f03e8,0x54000128,0xeb0a013f,0x540000e3,0xb40000a1,0xf9400408,0xb900083f,0xf900083f,0xf9000028,0x52800028,0x2a0803e0,0xd65f03c0];
function fixture(options={}) {
    let now=0,wallJump=0,nextTimer=0,tid=41;const timers=new Map(),events=[],calls=[],hooks=[];
    const stats={attached:0,detached:0,names:0,freed:0,lookups:0};
    const mutable={clockFail:false,clockBackwards:false,readThrow:false};
    class U64 {constructor(n){this.n=BigInt(n);}compare(n){n=BigInt(n);return this.n<n?-1:this.n>n?1:0;}toNumber(){assert(this.n<=256n);return Number(this.n);}}
    class P {
        constructor(value,offset=0){this.value=value;this.offset=offset;}
        isNull(){return this.value===0;}
        equals(other){return this.value===other.value;}
        toString(){return typeof this.value==='number'?'0x'+this.value.toString(16):String(this.value);}
        add(n){return typeof this.value==='number'?new P(this.value+n):new P(this.value,this.offset+n);}
        sub(p){return new P(this.value-p.value);}
        and(n){return new P(this.value&n);}
        compare(p){return Math.sign(this.value-p.value);}
        readU8(){return String(this.value).charCodeAt(this.offset)||0;}
        readUtf8String(n){assert(n<256);return String(this.value).slice(this.offset,this.offset+n);}
        writePointer(){this.value.index=0;}
        readPointer(){if(this.value==='assemblies')return new P('assembly'+(this.offset/8));return this.value.pointer;}
        writeU32(n){this.value.number=n;}
        readU32(){return typeof this.value==='object'?this.value.number:options.badFingerprint?0:this.value>=0xad68170?
            options.badEarlyFingerprint?0:earlyWords[(this.value-0xad68170)/4]:words[(this.value-0x10100)/4];}
        writeS32(n){assert.equal(this.value.size,4);this.value.number=n;}
        readS32(){assert.equal(this.value.size,4);return this.value.number;}
        writeU64(n){assert.equal(this.value.size,8);this.value.number=n;}
        readU64(){return new U64(this.value.number);}
        readS64(){return {toNumber:()=>this.offset===0?this.value.seconds:this.value.nanos};}
        writeByteArray(a){assert.equal(a.length,24);assert.equal(this.value.size,24);this.value.pointer=new P(0);}
        readByteArray(){const b=new Uint8Array(20);b.set([127,69,76,70,2,1]);b[18]=options.badElf?62:183;return b.buffer;}
    }
    const nil=()=>new P(0),methods=new Map();
    for(const owner of names) {
        const list=targetPairs.filter(p=>p[0]===owner).map((p,i)=>({owner,name:p[1],index:i}));
        if(owner===names[8] && options.missingOptionalMethod)list.splice(0,1);
        if(owner===names[8] && options.ambiguousOptional)list.push({...list[0]});
        if(owner===capture)while(list.length<21)list.push({owner,name:'callback'+list.length,index:list.length});
        if(options.manyMethods)while(list.length<100)list.push({owner,name:'extra'+list.length,index:list.length});
        methods.set(owner,list);
    }
    const pointerFor=m=>m.owner===names[10]?(options.badEarlyRva?0xad68174:0xad68170):0x11000+targetPairs.findIndex(p=>p[0]===m.owner&&p[1]===m.name)*0x100;
    const api={
        domain_get:()=>options.noDomain?nil():new P('domain'),
        thread_current:()=>options.existingThread?new P('existing'):nil(),
        thread_attach:()=>{stats.attached++;return options.attachFails?nil():new P('owned');},
        thread_detach:p=>{assert.equal(p.value,'owned');stats.detached++;},
        domain_get_assemblies:(d,c)=>{c.value.number=options.assemblyCount??1;return options.nullAssemblyList?nil():new P('assemblies');},
        assembly_get_image:a=>new P('image'+a.value),image_get_name:()=>new P('holo-game.dll\0adjacent'),
        class_from_name:(image,ns,short)=>{stats.lookups++;const full=ns.value+'.'+short.value;assert(names.includes(full));return options.missingAll||options.missingClass===full||full===names[10]&&!options.early?nil():new P(full);},
        class_get_method_from_name:(k,n,arity)=>{assert.equal(k.value,names[10]);assert.equal(n.value,'btxu');assert.equal(arity,0);return options.missingEarlyMethod?nil():new P(methods.get(k.value)[0]);},
        class_get_type:p=>p,class_get_parent:()=>new P('System.Object'),class_get_flags:()=>0,
        class_get_fields:(k,iter)=>{assert.notEqual(k.value,names[10],'Never scan the large Pokeball field inventory');const i=iter.value.index++,isEnum=k.value.includes('.Types.');return i<(isEnum?(options.enumMany?70:options.enumAlias?4:3):options.manyFields?100:options.summaryFields&&k.value===names[8]?87:2)?new P({owner:k.value,index:i,isEnum}):nil();},
        field_get_name:f=>new P(f.value.isEnum?(f.value.index===0?'value__':f.value.index===1?'Success':f.value.index===2?'OutOfRange':'SuccessAlias'):
            f.value.index===0?(options.missingResultField?'Unknown':f.value.owner===names[6]?'Result':'Status'):'Parser'),
        field_get_type:f=>new P(f.value.isEnum?(f.value.index===0?'System.Int32':f.value.owner):f.value.index===0?
            options.badResultType?'System.Int32':enumName(f.value.owner):'System.Object'),
        field_get_flags:f=>f.value.isEnum?(f.value.index===0?6:options.nonLiteral?16:0x8056):f.value.index===1||options.staticResultField?16:6,
        field_get_parent:f=>new P(options.badFieldOwner||(f.value.isEnum&&options.badEnumOwner)?'Other':f.value.owner),
        class_get_methods:(k,iter)=>{assert.notEqual(k.value,names[10],'Never scan the large Pokeball method inventory');const i=iter.value.index++;const m=methods.get(k.value)[i];return m?new P(m):nil();},
        method_get_name:m=>new P(m.value.name),method_get_class:m=>new P(options.badMethodOwner?'Other':m.value.owner),
        method_get_flags:(m,out)=>{assert.equal(out.value.size,4);return options.staticMethod||(options.staticOptional&&m.value.owner===names[8])||(options.staticEarly&&m.value.owner===names[10])?16:6;},
        method_get_param_count:m=>options.manyParameters?100:resultMethods.has(m.value.name)?1:0,
        method_get_param:m=>new P(options.badParameter?'System.Object':m.value.name==='bgff'?names[6]:names[5]),
        method_get_return_type:m=>new P(options.wrongReturn||(options.wrongOptionalReturn&&m.value.owner===names[8])?'System.Boolean':
            m.value.owner===names[10]?(options.badEarlyReturn?'System.Object':names[5]):'System.Void'),
        type_get_name:type=>{stats.names++;return new P(options.longName?'x'.repeat(300):type.value);},free:()=>{stats.freed++;},
        method_is_generic:()=>options.generic?1:0,method_is_inflated:()=>options.inflated?1:0,
        debug_get_method_info:(m,out)=>{assert.equal(out.value.size,24);out.value.pointer=new P(options.outsideCode?0x30000:options.unaligned?0x11001:options.sharedCode?0x11000:pointerFor(m.value));return options.noDebugInfo?0:1;},
        class_from_type:t=>new P(options.parameterClassMismatch&&names.includes(t.value)?'Other':t.value),
        class_is_enum:()=>options.notEnum?0:1,
        class_enum_basetype:()=>new P(options.wrongEnumUnderlying?'System.Int64':'System.Int32'),
        class_value_size:(k,out)=>{assert.equal(out.value.size,4);out.value.number=4;return options.wrongEnumSize?8:4;},
        field_static_get_value:(f,out)=>{assert(f.value.isEnum);assert(f.value.index>0);assert.equal(out.value.size,4);out.value.number=f.value.index===2?7:42;},
        object_get_class:o=>{assert(!o.isNull());return new P(o.value.protoClass);},
        field_get_value:(o,f,out)=>{assert.equal(out.value.size,4);assert.equal(f.value.owner,o.value.protoClass);assert.equal(f.value.index,0);if(mutable.readThrow)throw Error('Simulated native read error');out.value.number=o.value.numeric;}
    };
    const module={base:new P(0x10000),size:options.early?0xb000000:0x10000,findExportByName(name){
        if(name===options.missingExport)return null;
        const key=name.replace(/^il2cpp_/,'');assert(key in api,'Unexpected native API '+key);
        return new P(key==='debug_get_method_info'?0x10100:key);
    }};
    const libc={findExportByName:n=>{assert.equal(n,'clock_gettime');return options.noClock?null:new P('clock_gettime');}};
    const context={
        Process:{arch:options.arch||'arm64',pointerSize:8,getCurrentThreadId:()=>tid,
            findModuleByName:n=>{calls.push('find:'+n);return n==='libc.so'?libc:options.noModule?null:module;},
            findRangeByAddress:()=>({base:new P(0x10000),size:options.early?0xb000000:0x10000,protection:options.noExecute?'r--':'r-x'})},
        Memory:{alloc:n=>new P({size:n}),allocUtf8String:s=>new P(s)},ptr:n=>new P(n),Uint8Array,
        NativeFunction:function(address,result,args,opts){
            const key=address.value===0x10100?'debug_get_method_info':address.value;
            if(key==='object_get_class'||key==='field_get_value')assert.equal(opts.scheduling,'exclusive');
            if(key==='clock_gettime') {
                assert.equal(result,'int');assert.deepEqual(Array.from(args),['int','pointer']);assert.equal(opts.scheduling,'exclusive');
                return (clock,out)=>{calls.push(key);assert.equal(clock,7);assert.equal(out.value.size,16);const ms=mutable.clockBackwards?0:now+100000;
                    out.value.seconds=Math.floor(ms/1000);out.value.nanos=options.badNanos?1000000000:(ms%1000)*1000000;return mutable.clockFail?1:0;};
            }
            return (...values)=>{calls.push(key);return api[key](...values);};
        },
        Interceptor:{attach(address,callbacks){if(options.attachFailure&&hooks.length===3||options.optionalAttachFailure&&address.value===0x11e00)throw Error('Attach failed');const hook={address,callbacks,detached:false,detach(){this.detached=true;}};hooks.push(hook);return hook;}},
        Date:class extends Date{static now(){return now+wallJump;}},
        setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
        console:{log:s=>events.push(JSON.parse(s.slice(s.indexOf('{'))))}
    };
    const probe=vm.runInNewContext(source,context);
    function tick(){const [id,t]=timers.entries().next().value;timers.delete(id);now+=t.ms;t.fn();}
    function drain(){let i=0;while(timers.size){tick();assert(++i<500);}}
    function enter(index=0,receiver=0x123400,thread=41,response=0){tid=thread;const hook=hooks[index];assert(hook&&!hook.detached);const call={};hook.callbacks.onEnter.call(call,[new P(receiver),new P(response)]);return (returned=0)=>hook.callbacks.onLeave.call(call,new P(returned));}
    function invoke(index,receiver,thread,response,returned=0){enter(index,receiver,thread,response)(returned);}
    return {probe,events,calls,stats,timers,hooks,mutable,tick,drain,enter,invoke,jumpWall:n=>wallJump+=n,advance:n=>now+=n};
}
async function main(){
    const idle=fixture();assert.equal(idle.calls.length,0);assert.equal((await idle.probe.start()).status,'disabled');assert.equal((await idle.probe.start({enabled:1})).status,'disabled');assert.equal((await idle.probe.stop()).status,'idle');
    for(const options of [{arch:'x64'},{badElf:true}]){const f=fixture(options),p=f.probe.start({enabled:true});f.drain();assert.equal((await p).status,'skipped');assert.equal(f.stats.attached,0);}
    const good=fixture(),sink=[];const gp=good.probe.start({enabled:true,onEvent:e=>{assert.equal(good.stats.attached,good.stats.detached);sink.push(e);}});good.drain();const gr=await gp;
    assert.equal(gr.status,'complete');assert.equal(gr.classes,10);assert.deepEqual(Array.from(gr.missingCandidates),[names[10]]);assert.equal(good.hooks.length,0);assert.equal(good.stats.names,good.stats.freed);
    assert.equal(good.events.filter(e=>e.kind==='method'&&e.className===capture).length,21);
    const summaryMethod=good.events.find(e=>e.kind==='method'&&e.name==='SummaryDismissed');assert.deepEqual(summaryMethod.parameterTypes,[names[5]]);assert.equal(summaryMethod.returnType,'System.Void');
    assert(good.events.some(e=>e.kind==='field'&&e.fieldType===enumName(names[5])));assert.equal(good.events.length,sink.length);
    assert(!good.calls.some(c=>/runtime_invoke|object_get|field_get_value|gchandle|debug_get|clock_get/.test(c)));
    for(const options of [{badFieldOwner:true},{badMethodOwner:true},{longName:true},{nullAssemblyList:true},{missingExport:'il2cpp_type_get_name'},{attachFails:true}]) {
        const f=fixture(options),p=f.probe.start({enabled:true});f.drain();assert.equal((await p).status,'error');assert.equal(f.stats.names,f.stats.freed);if(!options.attachFails)assert.equal(f.stats.attached,f.stats.detached);
    }
    const existing=fixture({existingThread:true}),ex=existing.probe.start({enabled:true});existing.drain();await ex;assert.equal(existing.stats.detached,0);
    for(const options of [{noModule:true},{noDomain:true},{assemblyCount:0},{missingAll:true,assemblyCount:'18446744073709551615'}]) {
        const f=fixture(options),p=f.probe.start({enabled:true});assert.equal((await f.probe.start({enabled:true})).status,'already-running');f.drain();assert.equal((await p).status,'unavailable');assert(f.stats.lookups<=20*2048);assert.equal(f.stats.attached,f.stats.detached);
    }
    const limited=fixture({manyMethods:true,manyFields:true,manyParameters:true}),lp=limited.probe.start({enabled:true});limited.drain();const lr=await lp;assert(lr.truncated);assert(lr.methods<=400);assert(lr.fields<=320);assert(limited.events.filter(e=>e.kind==='method').every(e=>e.parameterTypes.length<=8));
    const missing=fixture({missingClass:names[5]}),mp=missing.probe.start({enabled:true});missing.drain();assert.deepEqual(Array.from((await mp).missingCandidates),[names[5],names[10]]);
    const f=fixture(),p=f.probe.start({enabled:true,observeRuntime:true});f.tick();assert.equal(f.hooks.length,19);assert(f.events.some(e=>e.kind==='metadata-summary'));assert(f.events.some(e=>e.kind==='observation-ready'));
    const outer=f.enter(0,0xaaa,41),inner=f.enter(2,0xbbb,42);f.advance(10);inner();f.jumpWall(-999999);f.advance(15);outer();
    assert(!f.events.some(e=>e.kind==='interaction-event'),'Hot callbacks must only enqueue');f.tick();
    const rows=f.events.filter(e=>e.kind==='interaction-event');assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.phase),['enter','enter','leave','leave']);
    assert.equal(rows[0].callId,rows[3].callId);assert.equal(rows[1].callId,rows[2].callId);assert.equal(rows[0].receiver,'0xaaa');assert.equal(rows[1].tid,42);assert.equal(rows[3].elapsedMs,25);assert.equal(rows[0].boottimeMs,100000);
    f.drain();assert.equal((await p).status,'complete');assert(f.hooks.every(h=>h.detached));assert(!f.calls.some(c=>/runtime_invoke|object_get|field_get_value|gchandle/.test(c)));
    for(const options of [{badFingerprint:true},{outsideCode:true},{unaligned:true},{sharedCode:true},{noDebugInfo:true},{staticMethod:true},{wrongReturn:true},{badParameter:true},{generic:true},{inflated:true},{noExecute:true},{noClock:true},{badNanos:true},{attachFailure:true},{missingClass:names[1]}]) {
        const f=fixture(options),p=f.probe.start({enabled:true,observeRuntime:true});f.drain();const r=await p;assert.equal(r.reason,'observer-setup-failed',JSON.stringify(options));assert(f.events.some(e=>e.kind==='metadata-summary'),'Metadata remains usable');assert(f.hooks.every(h=>h.detached));assert.equal(f.stats.attached,f.stats.detached);assert.equal(f.stats.names,f.stats.freed);
    }
    const silent=fixture(),sp=silent.probe.start({enabled:true,observeRuntime:true});silent.drain();assert.equal((await sp).reason,'no-natural-calls');
    const stopped=fixture(),stp=stopped.probe.start({enabled:true,observeRuntime:true});stopped.tick();const late=stopped.enter();assert.equal((await stopped.probe.stop()).status,'cancelled');late();stopped.drain();assert.equal((await stp).status,'cancelled');assert(stopped.hooks.every(h=>h.detached));assert(!stopped.events.some(e=>e.kind==='interaction-event'));
    const events=fixture(),evp=events.probe.start({enabled:true,observeRuntime:true});events.tick();for(let i=0;i<257;i++)events.invoke();events.drain();const evr=await evp;assert.equal(evr.reason,'event-limit');assert.equal(evr.events,512);assert.equal(events.events.filter(e=>e.kind==='interaction-event').length,512);
    const thread=fixture(),tp=thread.probe.start({enabled:true,observeRuntime:true});thread.tick();for(let i=0;i<5;i++)thread.invoke(0,0xaaa,i);thread.drain();assert.equal((await tp).reason,'thread-limit');
    const clock=fixture(),clp=clock.probe.start({enabled:true,observeRuntime:true});clock.tick();clock.mutable.clockBackwards=true;clock.invoke();clock.drain();assert.match((await clp).reason,/CLOCK_BOOTTIME invalid/);assert(clock.hooks.every(h=>h.detached));
    const clockFail=fixture(),cfp=clockFail.probe.start({enabled:true,observeRuntime:true});clockFail.tick();clockFail.mutable.clockFail=true;clockFail.drain();assert.match((await cfp).reason,/clock-error/);
    for(const stage of ['metadata-ready','metadata-summary','observation-ready']) {
        const f=fixture(),p=f.probe.start({enabled:true,observeRuntime:true,onEvent:e=>{if(e.kind===stage)f.probe.stop();}});f.drain();assert.equal((await p).status,'cancelled');assert(f.hooks.every(h=>h.detached));assert.equal(f.stats.attached,f.stats.detached);
    }
    const metadataRead=fixture(),mr=metadataRead.probe.start({enabled:true,readResults:true});metadataRead.drain();await mr;assert(!metadataRead.calls.some(c=>/field_static_get_value|object_get_class|field_get_value/.test(c)),'Metadata-only start does not read result values');
    const disabled=fixture(),dp=disabled.probe.start({enabled:true,observeRuntime:true,readResults:false});disabled.tick();disabled.invoke(2,0xaaa,41,{protoClass:names[5],numeric:42});disabled.drain();await dp;
    assert(!disabled.calls.some(c=>/field_static_get_value|object_get_class|field_get_value/.test(c)));assert(disabled.events.filter(e=>e.kind==='result-read-availability').every(e=>e.reason==='not-requested'));
    const results=fixture({enumAlias:true}),res=results.probe.start({enabled:true,observeRuntime:true,readResults:true});results.tick();
    const available=results.events.filter(e=>e.kind==='result-read-availability');assert.equal(available.length,2);assert(available.every(e=>e.available&&e.underlyingType==='System.Int32'));
    const outerResult=results.enter(2,0xaaa,41,{protoClass:names[5],numeric:42});results.invoke(13,0xbbb,41,{protoClass:names[6],numeric:7});outerResult();results.invoke(10,0xaaa,41,{protoClass:names[5],numeric:999});
    assert(!results.events.some(e=>e.kind==='interaction-event'));results.tick();const resultRows=results.events.filter(e=>e.kind==='interaction-event');
    assert(resultRows.filter(e=>e.phase==='leave').every(e=>!('result' in e)),'Result reads appear only on entry');
    const values=resultRows.filter(e=>e.result).map(e=>e.result);assert.equal(values.length,3);assert.equal(values[0].value,42);assert.deepEqual(values[0].names,['Success','SuccessAlias']);assert(values[0].mapped);
    assert.equal(values[1].field,'Result');assert.equal(values[1].value,7);assert.deepEqual(values[1].names,['OutOfRange']);assert.equal(values[2].value,999);assert.equal(values[2].mapped,false);assert.deepEqual(values[2].names,[]);
    results.drain();assert.equal((await res).status,'complete');assert.equal(results.stats.attached,results.stats.detached);assert.equal(results.stats.names,results.stats.freed);assert(!results.calls.some(c=>/runtime_invoke|set_value|gchandle/.test(c)));
    const cleanup=fixture(),cp=cleanup.probe.start({enabled:true,observeRuntime:true,readResults:true});cleanup.tick();
    cleanup.invoke(10,0xaaa,41,{protoClass:names[5],numeric:42});
    const checked=cleanup.calls.filter(c=>c==='object_get_class'||c==='field_get_value').length;
    cleanup.invoke(12,0xaaa,41,{protoClass:'UnrelatedCleanupObject'});
    cleanup.invoke(11,0xaaa,41,{protoClass:'UnverifiedCallbackArgument'});
    assert.equal(cleanup.calls.filter(c=>c==='object_get_class'||c==='field_get_value').length,checked,'Timing-only helpers must never inspect argument registers');
    cleanup.invoke(2,0xaaa,41,{protoClass:names[5],numeric:42});cleanup.drain();await cp;
    assert.equal(cleanup.events.filter(e=>e.result&&e.result.available).length,2,'Cleanup must not disable proven catch readers');
    assert(cleanup.events.filter(e=>e.kind==='interaction-event'&&['btdf','btdi'].includes(e.method)).every(e=>!e.result));
    for(const options of [{missingResultField:true},{badResultType:true},{staticResultField:true},{notEnum:true},{wrongEnumUnderlying:true},{wrongEnumSize:true},{nonLiteral:true},{badEnumOwner:true},{enumMany:true},{parameterClassMismatch:true},{missingExport:'il2cpp_class_is_enum'}]) {
        const f=fixture(options),p=f.probe.start({enabled:true,observeRuntime:true,readResults:true});f.tick();assert.equal(f.hooks.length,19,'Optional reader failure preserves all timing hooks');
        assert(f.events.some(e=>e.kind==='result-read-availability'&&!e.available),JSON.stringify(options));f.invoke(2,0xaaa,41,{protoClass:names[5],numeric:42});f.drain();assert.equal((await p).status,'complete',JSON.stringify(options));assert(!f.calls.includes('field_get_value'));assert.equal(f.stats.attached,f.stats.detached);assert.equal(f.stats.names,f.stats.freed);
    }
    const nullArg=fixture(),np=nullArg.probe.start({enabled:true,observeRuntime:true,readResults:true});nullArg.tick();const readsBefore=nullArg.calls.filter(c=>c==='object_get_class'||c==='field_get_value').length;nullArg.invoke(2,0xaaa,41,0);nullArg.tick();assert.equal(nullArg.calls.filter(c=>c==='object_get_class'||c==='field_get_value').length,readsBefore);assert(nullArg.events.some(e=>e.result&&e.result.reason==='null-response'));nullArg.probe.stop();nullArg.drain();await np;
    const wrong=fixture(),wp=wrong.probe.start({enabled:true,observeRuntime:true,readResults:true});wrong.tick();wrong.invoke(2,0xaaa,41,{protoClass:'Other',numeric:42});assert(!wrong.events.some(e=>e.reason==='response-class-mismatch'));wrong.tick();assert(wrong.events.some(e=>e.kind==='result-read-availability'&&e.reason==='response-class-mismatch'));assert(!wrong.calls.includes('field_get_value'));wrong.invoke(2,0xaaa,41,{protoClass:names[5],numeric:42});wrong.drain();assert.equal((await wp).status,'complete');assert(!wrong.calls.includes('field_get_value'));
    const readError=fixture(),rep=readError.probe.start({enabled:true,observeRuntime:true,readResults:true});readError.tick();readError.mutable.readThrow=true;readError.invoke(10,0xaaa,41,{protoClass:names[5],numeric:42});readError.tick();assert(readError.events.some(e=>e.kind==='result-read-availability'&&String(e.reason||'').startsWith('result-read-failed:')));readError.invoke(11,0xaaa,41,{protoClass:names[5],numeric:42});readError.drain();assert.equal((await rep).status,'complete');assert.equal(readError.calls.filter(c=>c==='field_get_value').length,1);
    const resultStop=fixture(),rst=resultStop.probe.start({enabled:true,observeRuntime:true,readResults:true,onEvent:e=>{if(e.kind==='result-read-availability')resultStop.probe.stop();}});resultStop.drain();assert.equal((await rst).status,'cancelled');assert.equal(resultStop.hooks.length,0);assert.equal(resultStop.stats.attached,resultStop.stats.detached);
    const summary=fixture({summaryFields:true}),sump=summary.probe.start({enabled:true,observeRuntime:true,readResults:true});summary.tick();
    assert(!summary.events.find(e=>e.kind==='metadata-summary').truncated,'87-field summary GUI inventory fits the per-class bound');
    const resultReadCount=summary.calls.filter(c=>c==='object_get_class'||c==='field_get_value').length;
    for(let i=14;i<19;i++)summary.invoke(i,0xabcdef,41,{protoClass:'NotAResponse'});
    assert.equal(summary.calls.filter(c=>c==='object_get_class'||c==='field_get_value').length,resultReadCount,'Summary timing hooks read no arguments');
    summary.drain();assert.equal((await sump).status,'complete');
    assert.equal(summary.events.filter(e=>e.kind==='interaction-event').length,10);
    assert.equal(summary.events.filter(e=>e.kind==='observer-target-availability'&&e.available).length,19);
    assert(summary.hooks.every(h=>h.detached));
    for(const [options,remaining,reason] of [
        [{missingClass:names[8]},15,/missing/],[{missingClass:names[9]},18,/missing/],
        [{missingOptionalMethod:true},18,/missing/],[{ambiguousOptional:true},18,/ambiguous/],
        [{staticOptional:true},15,/signature mismatch/],[{wrongOptionalReturn:true},15,/signature mismatch/],
        [{optionalAttachFailure:true},18,/attach failed/]
    ]) {
        const s=fixture(options),sp=s.probe.start({enabled:true,observeRuntime:true,readResults:true});s.tick();
        assert.equal(s.hooks.length,remaining,JSON.stringify(options));
        assert(s.events.some(e=>e.kind==='observer-target-availability'&&e.optional&&!e.available&&reason.test(e.reason)));
        assert.equal(s.events.find(e=>e.kind==='observation-ready').targetCount,remaining);
        s.invoke(10,0xaaa,41,{protoClass:names[5],numeric:42});s.drain();assert.equal((await sp).status,'complete');
        assert(s.events.some(e=>e.result&&e.result.available),'Required typed catch reader survives optional target failure');
        assert(s.hooks.every(h=>h.detached));assert.equal(s.stats.attached,s.stats.detached);
    }
    const availabilityStop=fixture(),asp=availabilityStop.probe.start({enabled:true,observeRuntime:true,onEvent:e=>{if(e.kind==='observer-target-availability')availabilityStop.probe.stop();}});
    availabilityStop.drain();assert.equal((await asp).status,'cancelled');assert(availabilityStop.hooks.every(h=>h.detached));
    const early=fixture({early:true}),ep=early.probe.start({enabled:true,observeRuntime:true,readResults:true});early.tick();
    assert.equal(early.hooks.length,20);
    const earlyReady=early.events.find(e=>e.kind==='observation-ready');
    assert.equal(earlyReady.targetCount,20);assert.equal(earlyReady.argumentResultReaderCount,3);assert.equal(earlyReady.returnResultReaderCount,1);
    assert(!('targets' in earlyReady),'The window marker must not repeat all method signatures');
    const earlyAvailable=early.events.find(e=>e.kind==='observer-target-availability'&&e.method==='btxu');
    assert(earlyAvailable.returnResultRead);assert.equal(earlyAvailable.returnType,names[5]);assert.deepEqual(earlyAvailable.parameterTypes,[]);
    const readsBeforePending=early.calls.filter(c=>c==='object_get_class'||c==='field_get_value').length;
    for(let i=0;i<300;i++)early.invoke(19);
    assert.equal(early.calls.filter(c=>c==='object_get_class'||c==='field_get_value').length,readsBeforePending);
    early.tick();assert(!early.events.some(e=>e.kind==='interaction-event'),'Pending null polls emit no event pairs');
    const returned=early.enter(19,0x777);early.advance(7);returned({protoClass:names[5],numeric:42});
    early.invoke(19,0x777,41,0,{protoClass:names[5],numeric:4});
    early.tick();const earlyRows=early.events.filter(e=>e.kind==='interaction-event');assert.equal(earlyRows.length,4);
    assert(earlyRows.filter(e=>e.phase==='enter').every(e=>!e.result&&!e.returnResult));
    assert.deepEqual(earlyRows.filter(e=>e.returnResult).map(e=>e.returnResult.value),[42,4],'A fallback or unknown status remains its original scalar');
    assert.equal(earlyRows[1].boottimeMs-earlyRows[0].boottimeMs,7);
    early.drain();const earlyResult=await ep;assert.equal(earlyResult.status,'complete');
    assert.equal(earlyResult.counts[names[10]+'::btxu'].pendingPolls,300);assert.equal(earlyResult.counts[names[10]+'::btxu'].enter,2);
    assert(early.hooks.every(h=>h.detached));assert(!early.calls.some(c=>/runtime_invoke|set_value|gchandle/.test(c)));
    for(const event of early.events)assert(Buffer.byteLength(JSON.stringify(event),'utf8')<3000,
        'Each full20-target log record must fit the transport budget: '+event.kind);
    for(const options of [{badEarlyFingerprint:true},{badEarlyRva:true},{badEarlyReturn:true},{staticEarly:true},{missingEarlyMethod:true},{missingExport:'il2cpp_class_get_method_from_name'}]) {
        const f=fixture({early:true,...options}),p=f.probe.start({enabled:true,observeRuntime:true,readResults:true});f.tick();assert.equal(f.hooks.length,19,JSON.stringify(options));
        assert(f.events.some(e=>e.kind==='observer-target-availability'&&e.method==='btxu'&&!e.available));
        f.invoke(10,0xaaa,41,{protoClass:names[5],numeric:42});f.drain();assert.equal((await p).status,'complete');assert(f.events.some(e=>e.result&&e.result.available));
    }
    const returnMismatch=fixture({early:true}),rmp=returnMismatch.probe.start({enabled:true,observeRuntime:true,readResults:true});returnMismatch.tick();
    returnMismatch.invoke(19,0xaaa,41,0,{protoClass:'Other',numeric:42});
    returnMismatch.invoke(10,0xaaa,41,{protoClass:names[5],numeric:42});returnMismatch.drain();await rmp;
    assert(returnMismatch.events.some(e=>e.returnResult&&e.returnResult.reason==='response-class-mismatch'));
    assert(returnMismatch.events.some(e=>e.result&&e.result.available),'A bad optional return cannot disable the established result readers');
    const polling=fixture({early:true}),pp=polling.probe.start({enabled:true,observeRuntime:true});polling.tick();for(let i=0;i<4097;i++)polling.invoke(19);polling.drain();
    assert.equal((await pp).reason,'hit-limit');assert(polling.hooks.every(h=>h.detached));
    const returnsDisabled=fixture({early:true}),rdp=returnsDisabled.probe.start({enabled:true,observeRuntime:true});returnsDisabled.tick();returnsDisabled.invoke(19,0xaaa,41,0,{protoClass:'Other'});returnsDisabled.drain();await rdp;
    assert.equal(returnsDisabled.events.filter(e=>e.kind==='interaction-event').length,2);assert(!returnsDisabled.calls.includes('field_get_value'));
    const reserved=fixture({early:true}),rsp=reserved.probe.start({enabled:true,observeRuntime:true});reserved.tick();
    for(let i=0;i<255;i++)reserved.invoke(0);
    const pendingReturn=reserved.enter(19);reserved.invoke(0);pendingReturn({protoClass:names[5],numeric:42});reserved.drain();
    const reservedResult=await rsp;assert.equal(reservedResult.reason,'event-limit');assert.equal(reservedResult.events,512);
    assert.equal(reserved.events.filter(e=>e.kind==='interaction-event').length,512,'Delayed return pairs reserve both events before nested callbacks');
    const stoppedReturn=fixture({early:true}),srp=stoppedReturn.probe.start({enabled:true,observeRuntime:true,readResults:true});stoppedReturn.tick();
    const lateReturn=stoppedReturn.enter(19);stoppedReturn.probe.stop();lateReturn({protoClass:names[5],numeric:42});stoppedReturn.drain();
    assert.equal((await srp).status,'cancelled');assert(!stoppedReturn.calls.includes('object_get_class'));assert(stoppedReturn.hooks.every(h=>h.detached));
    console.log('PASS:14 required +6 optional hooks, fingerprinted early return boundary, null-poll suppression, isolated typed results, monotonic caps and cleanup');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
