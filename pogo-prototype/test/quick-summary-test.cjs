const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../diagnostics/quick-summary.js'),'utf8');
const CAP='Niantic.Holoholo.Encounter.EncounterCaptureState',RESP='Holoholo.Rpc.CatchPokemonOutProto',WAIT='Niantic.Zeppelin.Scheduler.Wait',EN=RESP+'.Types.Status',COR='coroutine';
// Independent fixture bytes from the supported APK, including semantic yield block.
const HEAD='ffc302d1e82300fdfd7b05a9fc6f06a9fa6707a9f85f08a9f65709a9f44f0aa9';
const YIELD='a9c244b9e80313aa081000bd008d01f86901003409fd4cd3088152d3ca1f02f04a013f912b008052480d088b6021c99a08194191018113911d5b6596e800805279000014';
const DEBUG=[0x90051008,0xf9474508,0xb4000148,0x90051009,0xf9474929,0xb40000e9,0xf940040a,0xeb0a011f,0x2a1f03e8,0x54000128,0xeb0a013f,0x540000e3,0xb40000a1,0xf9400408,0xb900083f,0xf900083f,0xf9000028,0x52800028,0x2a0803e0,0xd65f03c0];
function fixture(options={}) {
    let ms=100000,tid=17,nextTimer=0,inCallback=false;const timers=new Map(),events=[],calls=[],hooks=[];
    const stats={attach:0,detach:0,names:0,free:0,writes:0},mutable={readError:false,clockError:false};
    class P {
        constructor(v,o=0){this.v=v;this.o=o;}
        isNull(){return this.v===0;}equals(p){return this.v===p.v&&this.o===p.o;}
        add(n){return typeof this.v==='number'?new P(this.v+n):new P(this.v,this.o+n);}
        and(n){return new P(this.v&n);}compare(p){return Math.sign(this.v-p.v);}toInt32(){return this.v|0;}
        readU8(){return typeof this.v==='string'?(this.v.charCodeAt(this.o)||0):this.v.scalar||0;}
        readUtf8String(n){return this.v.slice(this.o,this.o+n);}
        writePointer(p){this.v.pointer=p;this.v.index=0;}
        readPointer(){return this.v==='assemblies'?new P('assembly'):this.v.pointer;}
        writeU64(n){this.v.scalar=n;}
        readU64(){const n=this.v.scalar;return {compare:v=>Math.sign(n-v),toNumber:()=>n};}
        readU32(){return typeof this.v==='number'?(options.badDebug?0:DEBUG[(this.v-BASE-0x1000)/4]):this.v.scalar;}
        writeS32(n){this.v.scalar=n;}readS32(){return this.v.scalar;}
        writeFloat(n){this.v.scalar=Math.fround(n);}readFloat(){return this.v.scalar;}
        readS64(){return {toNumber:()=>this.o===0?Math.floor(ms/1000):(ms%1000)*1e6};}
        writeByteArray(a){this.v.pointer=new P(0);assert.equal(a.length,24);}
        readByteArray(n){
            if(this.v===BASE){const a=new Uint8Array(20);a.set([127,69,76,70,2,1]);a[18]=183;return a.buffer;}
            const bytes=code.get(this.v-BASE);assert(bytes,'unexpected code read '+(this.v-BASE).toString(16));
            const result=Uint8Array.from(Buffer.from(bytes,'hex'));assert.equal(n,result.length);
            if(options.badCode)result[0]^=1;return result.buffer;
        }
    }
    const BASE=0x10000000,nil=()=>new P(0),code=new Map([[0xacf24fc,HEAD],[0xacf4c84,YIELD],[0xacf4ea8,'681200b920008052'],
        [0xe120fec,'001040bdc0035fd6'],[0xe120fd8,'c0035fd6'],[0xe1210a0,'1f1000b9c0035fd6'],
        [0xe1181b4,'00013fd60029201e68424139603200bd']]);
    const fields=new Map();
    for(const [owner,name,type,offset] of [[COR,'drny','System.Int32',16],[COR,'drnz','Niantic.Zeppelin.Scheduler.ISchedule',24],
        [COR,'<>4__this',CAP,32],[COR,'captureResults',RESP,40],[COR,'drog','System.Boolean',96],
        [WAIT,'<SleepFor>k__BackingField','System.Single',16],[RESP,'Status',EN,16],[EN,'CatchSuccess',EN,0]]) {
        fields.set(owner+'::'+name,{owner,name,type,offset,flags:owner===EN?0x8056:1});
    }
    const addresses={MoveNext:0xacf24fc,get_SleepFor:0xe120fec,'.ctor':0xe120fd8,Clear:0xe1210a0};
    const api={domain_get:()=>options.noDomain?nil():new P('domain'),
        domain_get_assemblies:(d,c)=>{c.v.scalar=options.assemblyCount||1;return new P('assemblies');},
        assembly_get_image:()=>new P('image'),class_from_name:(i,n,s)=>[CAP,RESP,WAIT].includes(n.v+'.'+s.v)&&!options.missingClass?new P(n.v+'.'+s.v):nil(),
        class_get_type:k=>k,class_get_name:k=>new P(k.v===COR?'ebk':k.v),
        class_get_nested_types:(k,it)=>{assert.equal(k.v,CAP);const index=it.v.index++;return index<(options.tooManyNested?65:1)?new P(COR):nil();},
        class_get_declaring_type:()=>new P(options.badOwner?'Other':CAP),
        class_get_field_from_name:(k,n)=>{const f=fields.get(k.v+'::'+n.v);return !f||n.v===options.missingField?nil():new P(f);},
        field_get_parent:f=>new P(options.badFieldOwner?'Other':f.v.owner),
        field_get_type:f=>new P(f.v.name===options.badFieldType?'System.Object':f.v.type),
        field_get_flags:f=>options.staticField&&f.v.owner===COR?16:f.v.flags,
        field_get_offset:f=>f.v.name==='Status'&&options.statusOffset!==undefined?options.statusOffset:options.badOffset?f.v.offset+4:f.v.offset,
        class_get_method_from_name:(k,n,count)=>{assert.equal(count,0);return new P({owner:k.v,name:n.v});},
        method_get_class:m=>new P(m.v.owner),method_get_flags:()=>options.staticMethod?16:6,
        method_get_param_count:()=>options.badArity?1:0,method_is_generic:()=>options.generic?1:0,method_is_inflated:()=>0,
        method_get_return_type:m=>new P(options.badReturn?'System.Int32':m.v.name==='MoveNext'?'System.Boolean':m.v.name==='get_SleepFor'?'System.Single':'System.Void'),
        class_from_type:t=>t,class_is_enum:()=>options.notEnum?0:1,class_enum_basetype:()=>new P(options.enum64?'System.Int64':'System.Int32'),
        class_value_size:(k,out)=>{out.v.scalar=4;return 4;},
        field_static_get_value:(f,out)=>{assert.equal(f.v.name,'CatchSuccess');out.v.scalar=42;},
        type_get_name:t=>{stats.names++;return t;},free:()=>stats.free++,
        thread_current:()=>inCallback?new P('current'):options.existingThread?new P('current'):nil(),
        thread_attach:()=>{stats.attach++;return new P('owned');},thread_detach:t=>{assert.equal(t.v,'owned');stats.detach++;},
        debug_get_method_info:(m,out)=>{out.v.pointer=new P(BASE+addresses[m.v.name]+(options.wrongAddress?4:0));return 1;},
        object_get_class:o=>new P(o.v.klass),
        field_get_value:(o,f,out)=>{
            if(mutable.readError)throw Error('native read failed');assert.equal(o.v.klass,f.v.owner);
            const val=o.v.fields[f.v.name];if(val instanceof P)out.v.pointer=val;else out.v.scalar=val;
        },
        field_set_value:(o,f,input)=>{assert(inCallback);assert.equal(o.v.klass,WAIT);assert.equal(f.v.name,'<SleepFor>k__BackingField');
            assert.equal(input.v.size,4);stats.writes++;o.v.fields[f.v.name]=input.v.scalar;}
    };
    const mod={base:new P(BASE),size:0x10000000,findExportByName:n=>{
        const key=n.replace('il2cpp_','');assert(key in api,key);return key===options.missingExport?null:new P(key==='debug_get_method_info'?BASE+0x1000:key);
    }};
    const ctx={Process:{arch:options.arch||'arm64',pointerSize:8,getCurrentThreadId:()=>tid,
        findModuleByName:n=>{calls.push('module:'+n);return n==='libc.so'?{findExportByName:()=>new P('clock_gettime')}:options.noModule?null:mod;},
        findRangeByAddress:()=>({base:new P(BASE),size:0x10000000,protection:options.noExecute?'r--':'r-x'})},
        Memory:{alloc:n=>new P({size:n}),allocUtf8String:s=>new P(s)},ptr:n=>new P(n),Uint8Array,
        NativeFunction:function(p,result,args,opts){assert.equal(opts.scheduling,'exclusive');const key=p.v===BASE+0x1000?'debug_get_method_info':p.v;
            if(key==='clock_gettime')return(c,o)=>{assert.equal(c,7);assert.equal(o.v.size,16);return mutable.clockError?1:0;};
            return(...values)=>{calls.push(key);return api[key](...values);};},
        Interceptor:{attach(p,callbacks){assert.equal(p.v,BASE+0xacf24fc);const h={callbacks,detached:false,detach(){this.detached=true;}};hooks.push(h);return h;}},
        setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
        console:{log:s=>{assert(!inCallback,'No output inside native callbacks');events.push(JSON.parse(s.slice(s.indexOf('{'))));}}
    };
    const probe=vm.runInNewContext(source,ctx);
    function tick(){const [id,t]=timers.entries().next().value;timers.delete(id);ms+=t.delay;t.fn();}
    function object(klass,fields){return new P({klass,fields});}
    function sample(settings={}) {
        const wait=object(settings.waitClass||WAIT,{'<SleepFor>k__BackingField':settings.seconds??2});
        const response=object(RESP,{Status:settings.status??42});
        const receiver=object(settings.receiverClass||COR,{drny:settings.state??7,drnz:settings.nullWait?nil():wait,
            '<>4__this':object(CAP,{}),captureResults:settings.nullResponse?nil():response,drog:settings.branch??0});
        return {receiver,wait};
    }
    function enter(s=sample()) {assert(!hooks[0].detached);const invocation={};inCallback=true;
        try{hooks[0].callbacks.onEnter.call(invocation,[s.receiver]);}finally{inCallback=false;}
        return(ret=1)=>{inCallback=true;try{hooks[0].callbacks.onLeave.call(invocation,new P(ret));}finally{inCallback=false;}return s;};
    }
    function invoke(settings,ret=1){return enter(sample(settings))(ret);}
    function drainEnd(){let count=0;while(timers.size){tick();assert(++count<30);}}
    return {probe,stats,calls,events,hooks,timers,mutable,tick,invoke,enter,sample,drainEnd,advance:n=>ms+=n,setTid:n=>tid=n};
}
async function main() {
    const idle=fixture();assert.equal(idle.calls.length,0);assert.equal((await idle.probe.start()).status,'disabled');assert.equal(idle.probe.setAllowed(true),false);
    for(const options of [{arch:'x64'},{noModule:true},{noDomain:true},{missingClass:true},{tooManyNested:true},{badOwner:true},
        {badFieldOwner:true},{badFieldType:'drny'},{badFieldType:'Status'},{badOffset:true},{staticField:true},{missingField:'drog'},
        {missingField:'Status'},{statusOffset:0},{statusOffset:Infinity},
        {staticMethod:true},{badArity:true},{generic:true},{badReturn:true},{notEnum:true},{enum64:true},
        {wrongAddress:true},{badDebug:true},{badCode:true},{noExecute:true},{assemblyCount:300},{missingExport:'field_set_value'}]) {
        const f=fixture(options),p=f.probe.start({enabled:true});f.drainEnd();const result=await p;
        assert(['unavailable','skipped'].includes(result.status),JSON.stringify(options));assert.equal(f.hooks.length,0);
        assert.equal(f.stats.attach,f.stats.detach);assert.equal(f.stats.names,f.stats.free);assert.equal(f.stats.writes,0);
    }
    const f=fixture(),seen=[],p=f.probe.start({enabled:true,onEvent:e=>seen.push(e)});f.tick();assert.equal(f.events.length,0);
    f.tick();assert(f.events.some(e=>e.kind==='metadata-ready'));assert.equal(f.probe.setAllowed(true),false);
    const statusMetadata=f.events.find(e=>e.kind==='metadata-ready').fields.find(f=>f.field==='Status');
    assert.equal(statusMetadata.actualOffset,16);assert.equal(statusMetadata.expectedOffset,null);assert.equal(statusMetadata.actualType,EN);
    f.invoke({state:6});f.invoke({status:7});f.invoke({},0);assert.equal(f.stats.writes,0);assert(!f.events.some(e=>e.kind==='baseline-ready'));
    f.invoke({seconds:2});assert.equal(f.stats.writes,0);assert(!f.events.some(e=>e.kind==='baseline-ready'));f.tick();
    assert.equal(f.events.filter(e=>e.kind==='baseline-ready').length,1);assert.equal(f.probe.setAllowed(true),true);
    const changed=f.invoke({seconds:1.5});assert.equal(f.stats.writes,1);assert(Math.abs(changed.wait.v.fields['<SleepFor>k__BackingField']-0.1)<1e-6);
    f.tick();assert.equal(f.events.filter(e=>e.kind==='wait-shortened').length,1);assert.equal(seen.length,f.events.length);
    f.invoke({seconds:0.05});assert.equal(f.stats.writes,1,'Never lengthen an existing shorter wait');
    f.advance(2600);f.invoke({seconds:2});assert.equal(f.stats.writes,1,'Lease expires without host heartbeat');
    f.probe.setAllowed(true);f.probe.setAllowed(false);f.invoke({seconds:2});assert.equal(f.stats.writes,1,'Explicit revocation');
    f.probe.setAllowed(true);const outer=f.enter();f.invoke({seconds:2});outer();assert.equal(f.stats.writes,2,'Nested calls do not cause extra writes');
    const inflight=f.enter();f.probe.stop();assert(f.hooks[0].detached);inflight();f.drainEnd();assert.equal((await p).status,'cancelled');assert.equal(f.stats.writes,2);
    assert.equal(f.stats.attach,f.stats.detach);assert.equal(f.stats.names,f.stats.free);assert.equal(f.events.filter(e=>e.kind==='baseline-ready').length,1);
    for(const settings of [{waitClass:'Other'},{nullWait:true},{nullResponse:true},{seconds:NaN},{seconds:Infinity},{seconds:-1},{seconds:31},{branch:5},{receiverClass:'Other'}]) {
        const f=fixture(),p=f.probe.start({enabled:true});f.tick();f.tick();f.invoke({});f.tick();f.probe.setAllowed(true);f.invoke(settings);
        assert.equal(f.stats.writes,0);assert.equal(f.probe.setAllowed(true),false);f.drainEnd();assert.equal((await p).status,'unavailable');assert(f.hooks[0].detached);
    }
    for(const fault of ['readError','clockError']) {
        const f=fixture(),p=f.probe.start({enabled:true});f.tick();f.tick();f.invoke({});f.tick();f.probe.setAllowed(true);f.mutable[fault]=true;f.invoke({});f.drainEnd();
        assert.equal((await p).status,'unavailable');assert.equal(f.stats.writes,0);assert(f.hooks[0].detached);
    }
    const thread=fixture(),tp=thread.probe.start({enabled:true});thread.tick();thread.tick();thread.invoke({});thread.setTid(99);thread.invoke({});thread.drainEnd();assert.equal((await tp).status,'unavailable');
    const queue=fixture(),qp=queue.probe.start({enabled:true});queue.tick();queue.tick();for(let i=0;i<130;i++)queue.invoke({});queue.drainEnd();assert.equal((await qp).status,'unavailable');assert.equal(queue.stats.writes,0);
    // Metadata-driven scalar reads must not assume the response object's layout.
    const moved=fixture({statusOffset:32}),mp=moved.probe.start({enabled:true});moved.tick();moved.tick();moved.invoke({});moved.tick();
    moved.probe.setAllowed(true);moved.invoke({});assert.equal(moved.stats.writes,1);moved.probe.stop();moved.drainEnd();await mp;
    const detail=fixture({badFieldType:'Status'}),dp=detail.probe.start({enabled:true});detail.drainEnd();const failure=await dp;
    assert.equal(failure.reason,'Error: field-mismatch:Status');assert.equal(failure.details.actualType,'System.Object');
    assert.equal(failure.details.actualOffset,16);assert.equal(failure.details.actualFlags,1);assert.equal(failure.details.ownerMatches,true);
    console.log('PASS: exact metadata/code guards, unchanged natural baseline, opt-in lease expiry, scalar-only shortening, reentry, queue/error/cancellation cleanup');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
