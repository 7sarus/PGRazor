// Explicit diagnostic only. Loading defines the API without native calls.
// start({enabled:true,observeRuntime:false|true,onEvent}) returns a Promise.
// readResults:true optionally reads a validated Int32 result enum on callback
// entry. Never invokes game methods, retains objects, or changes game behavior.
(function(root) {
    'use strict';
    const LIMITS=Object.freeze({attempts:20,retryMs:1000,prepareMs:20000,scanMs:4000,
        assemblies:256,lookups:2048,methodsPerClass:80,methods:400,fieldsPerClass:96,
        fields:320,parameters:8,nameBytes:256,observeMs:60000,pollMs:250,
        events:512,hits:4096,threads:4,enumFields:64,enumLiterals:32});
    const CAPTURE='Niantic.Holoholo.Encounter.EncounterCaptureState';
    const STOP='Niantic.Holoholo.Pokestop.';
    const SUMMARY_GUI='Niantic.Holoholo.Encounter.EncounterSummaryGuiController';
    const SUMMARY_STATE='Niantic.Holoholo.Encounter.EncounterSummaryState';
    const POKEBALL='Niantic.Holoholo.Encounter.Pokeball';
    const CATCH_RESULT='Holoholo.Rpc.CatchPokemonOutProto',SPIN_RESULT='Holoholo.Rpc.FortSearchOutProto';
    const CLASSES=[CAPTURE,STOP+'PokestopState',STOP+'PokestopSpinnerInteractionState',
        STOP+'PokestopResolveState',STOP+'PokestopInteractionState',
        'Holoholo.Rpc.CatchPokemonOutProto','Holoholo.Rpc.FortSearchOutProto',
        'Niantic.Holoholo.Encounter.EncounterResult',SUMMARY_GUI,SUMMARY_STATE,POKEBALL];
    const TARGETS=[
        [CAPTURE,'EnterState',[]],[CAPTURE,'ExitState',[]],[CAPTURE,'SummaryDismissed',[CATCH_RESULT]],
        [STOP+'PokestopState','NotifyReceivedItems',[]],
        [STOP+'PokestopState','NotifyPokestopSpin',[]],
        [STOP+'PokestopState','ResolveComplete',[]],
        [STOP+'PokestopSpinnerInteractionState','EnterState',[]],
        [STOP+'PokestopSpinnerInteractionState','ExitState',[]],
        [STOP+'PokestopResolveState','EnterState',[]],
        [STOP+'PokestopResolveState','ExitState',[]],
        [CAPTURE,'btdd',[CATCH_RESULT]],[CAPTURE,'btdf',[CATCH_RESULT]],[CAPTURE,'btdi',[CATCH_RESULT]],
        [STOP+'PokestopSpinnerInteractionState','bgff',[SPIN_RESULT]]
    ];
    // Presentation lifecycle telemetry is optional across game versions. These
    // callbacks never read argument registers or invoke dismissal/cleanup.
    const OPTIONAL_TARGETS=[
        [SUMMARY_GUI,'HandleOpen',[]],[SUMMARY_GUI,'HandleOpenComplete',[]],
        [SUMMARY_GUI,'HandleDismiss',[]],[SUMMARY_GUI,'HandleDismissComplete',[]],
        [SUMMARY_STATE,'ExitState',[]],
        [POKEBALL,'btxu',[],{returnType:CATCH_RESULT,readReturn:true,rva:0xad58170,
            words:[0xf81d0ffe,0xa90157f6,0xa9024ff4,0xf0021bb4,0xaa0003f3,0x39628688,0x37000428,0xd001efe0]}]
    ];
    const ALL_TARGETS=TARGETS.concat(OPTIONAL_TARGETS);
    // Metadata signatures do not guarantee that optimized internal calls pass
    // unused arguments. Read scalars only at callbacks validated in live traces.
    // btdi supplied a different object during ExitState in the Meowth trace;
    // btdf has no validated result argument yet. Both remain timing-only.
    const RESULT_TARGETS=new Set([CAPTURE+'::SummaryDismissed',CAPTURE+'::btdd',
        STOP+'PokestopSpinnerInteractionState::bgff']);
    const SPEC={domain_get:['pointer',[]],domain_get_assemblies:['pointer',['pointer','pointer']],
        assembly_get_image:['pointer',['pointer']],image_get_name:['pointer',['pointer']],
        class_from_name:['pointer',['pointer','pointer','pointer']],class_get_type:['pointer',['pointer']],
        class_get_parent:['pointer',['pointer']],class_get_flags:['uint32',['pointer']],
        class_get_fields:['pointer',['pointer','pointer']],field_get_name:['pointer',['pointer']],
        field_get_type:['pointer',['pointer']],field_get_flags:['int',['pointer']],field_get_parent:['pointer',['pointer']],
        class_get_methods:['pointer',['pointer','pointer']],method_get_name:['pointer',['pointer']],
        method_get_class:['pointer',['pointer']],method_get_flags:['uint32',['pointer','pointer']],
        method_get_param_count:['uint32',['pointer']],method_get_param:['pointer',['pointer','uint32']],
        method_get_return_type:['pointer',['pointer']],type_get_name:['pointer',['pointer']],free:['void',['pointer']],
        thread_current:['pointer',[]],thread_attach:['pointer',['pointer']],thread_detach:['void',['pointer']]};
    // Exact exported implementation in shipped Unity6000.3.22f1 ARM64.
    // Caller-owned Il2CppMethodDebugInfo is24 bytes: pointer@0,int32@8,pointer@16.
    const DEBUG_WORDS=[0x90051008,0xf9474508,0xb4000148,0x90051009,0xf9474929,
        0xb40000e9,0xf940040a,0xeb0a011f,0x2a1f03e8,0x54000128,0xeb0a013f,
        0x540000e3,0xb40000a1,0xf9400408,0xb900083f,0xf900083f,0xf9000028,
        0x52800028,0x2a0803e0,0xd65f03c0];
    let running=null;
    function name(p) {
        if(p.isNull())throw Error('Null metadata name');
        let n=0;while(n<LIMITS.nameBytes && p.add(n).readU8()!==0)n++;
        if(n===LIMITS.nameBytes)throw Error('Metadata name exceeds bound');
        return n?p.readUtf8String(n):'';
    }
    function exported(module,key,result,args,options) {
        const p=module.findExportByName('il2cpp_'+key);
        if(!p || p.isNull())throw Error('Missing export il2cpp_'+key);
        return {address:p,call:new NativeFunction(p,result,args,options||{})};
    }
    function bind(module) {
        const api={};for(const key of Object.keys(SPEC))api[key]=exported(module,key,...SPEC[key]).call;
        // Only the optional early-result boundary needs this lookup; do not
        // scan Pokeball's large field/method inventory or consume global caps.
        try {api.optionalMethod=exported(module,'class_get_method_from_name','pointer',['pointer','pointer','int']).call;}
        catch (_) {api.optionalMethod=null;}
        return api;
    }
    function typeName(api,type) {
        if(type.isNull())throw Error('Null metadata type');
        const p=api.type_get_name(type);if(p.isNull())throw Error('Null allocated type name');
        try{return name(p);}finally{api.free(p);}
    }
    function withThread(api,domain,fn) {
        let owned=null;
        try {
            if(api.thread_current().isNull()){owned=api.thread_attach(domain);if(owned.isNull())throw Error('IL2CPP attachment returned null');}
            return fn();
        }finally{if(owned!==null && !owned.isNull())api.thread_detach(owned);}
    }
    function inspect(api,domain) {
        return withThread(api,domain,()=>{
            const count=Memory.alloc(8);count.writeU64(0);
            const assemblies=api.domain_get_assemblies(domain,count),total=count.readU64();
            if(total.compare(0)===0)return {retry:'assemblies-not-ready'};
            if(assemblies.isNull())throw Error('Null assembly list');
            const n=total.compare(LIMITS.assemblies)>0?LIMITS.assemblies:total.toNumber();
            const deadline=Date.now()+LIMITS.scanMs,found=new Set(),events=[],refs=new Map();
            refs.classes=new Map();refs.fields=new Map();
            const summary={status:'complete',classes:0,methods:0,fields:0,lookups:0,truncated:total.compare(n)>0,missingCandidates:[]};
            const candidates=CLASSES.map(full=>{const i=full.lastIndexOf('.');return {full,ns:Memory.allocUtf8String(full.slice(0,i)),short:Memory.allocUtf8String(full.slice(i+1))};});
            outer:for(let i=0;i<n;i++) {
                if(Date.now()>=deadline){summary.truncated=true;break;}
                const assembly=assemblies.add(i*8).readPointer();if(assembly.isNull())continue;
                const image=api.assembly_get_image(assembly);if(image.isNull())continue;
                const assemblyName=name(api.image_get_name(image));
                for(const candidate of candidates) {
                    if(found.has(candidate.full))continue;
                    if(Date.now()>=deadline || summary.lookups>=LIMITS.lookups){summary.truncated=true;break outer;}
                    summary.lookups++;
                    const klass=api.class_from_name(image,candidate.ns,candidate.short);if(klass.isNull())continue;
                    const className=typeName(api,api.class_get_type(klass));
                    if(className!==candidate.full)throw Error('Candidate class name mismatch');
                    found.add(className);summary.classes++;
                    refs.classes.set(className,klass);
                    const parent=api.class_get_parent(klass),flags=api.class_get_flags(klass);
                    events.push({kind:'class',className,assembly:assemblyName,flags,
                        parent:parent.isNull()?null:typeName(api,api.class_get_type(parent))});
                    if(className===POKEBALL) {
                        try {
                            if(!api.optionalMethod)throw Error('Optional exact-method lookup unavailable');
                            const method=api.optionalMethod(klass,Memory.allocUtf8String('btxu'),0);
                            if(method.isNull())throw Error('Optional method missing');
                            if(!api.method_get_class(method).equals(klass))throw Error('Optional method owner mismatch');
                            const impl=Memory.alloc(4);impl.writeU32(0);
                            const methodFlags=api.method_get_flags(method,impl),parameterCount=api.method_get_param_count(method);
                            const row={kind:'method',className,name:name(api.method_get_name(method)),parameterCount,parameterTypes:[],
                                parametersTruncated:parameterCount!==0,returnType:typeName(api,api.method_get_return_type(method)),
                                flags:methodFlags,isStatic:Boolean(methodFlags&16)};
                            if(row.name!=='btxu')throw Error('Optional method name mismatch');
                            events.push(row);summary.methods++;
                            refs.set(className+'::btxu',{method,row});
                        }catch(error) {refs.set(className+'::btxu',{unavailable:String(error).slice(0,180)});}
                        continue;
                    }
                    const fields=Memory.alloc(8);fields.writePointer(ptr(0));let fieldEnd=false;
                    for(let j=0;j<LIMITS.fieldsPerClass && summary.fields<LIMITS.fields;j++) {
                        if(Date.now()>=deadline){summary.truncated=true;break outer;}
                        const field=api.class_get_fields(klass,fields);if(field.isNull()){fieldEnd=true;break;}
                        if(!api.field_get_parent(field).equals(klass))throw Error('Unexpected field declaring class');
                        const fieldFlags=api.field_get_flags(field);
                        events.push({kind:'field',className,name:name(api.field_get_name(field)),fieldType:typeName(api,api.field_get_type(field)),flags:fieldFlags,isStatic:Boolean(fieldFlags&16)});
                        const row=events[events.length-1],key=className+'::'+row.name;
                        if(refs.fields.has(key))refs.fields.get(key).ambiguous=true;
                        else refs.fields.set(key,{field,row});
                        summary.fields++;
                    }
                    if(!fieldEnd){summary.truncated=true;events.push({kind:'limit',className,member:'fields'});}
                    const methods=Memory.alloc(8);methods.writePointer(ptr(0));let methodEnd=false;
                    for(let j=0;j<LIMITS.methodsPerClass && summary.methods<LIMITS.methods;j++) {
                        if(Date.now()>=deadline){summary.truncated=true;break outer;}
                        const method=api.class_get_methods(klass,methods);if(method.isNull()){methodEnd=true;break;}
                        if(!api.method_get_class(method).equals(klass))throw Error('Unexpected method declaring class');
                        const impl=Memory.alloc(4);impl.writeU32(0);
                        const methodFlags=api.method_get_flags(method,impl),parameterCount=api.method_get_param_count(method),parameterTypes=[];
                        for(let k=0;k<Math.min(parameterCount,LIMITS.parameters);k++)parameterTypes.push(typeName(api,api.method_get_param(method,k)));
                        const row={kind:'method',className,name:name(api.method_get_name(method)),parameterCount,parameterTypes,
                            parametersTruncated:parameterCount>LIMITS.parameters,returnType:typeName(api,api.method_get_return_type(method)),
                            flags:methodFlags,isStatic:Boolean(methodFlags&16)};
                        events.push(row);summary.methods++;
                        const key=className+'::'+row.name;
                        if(ALL_TARGETS.some(t=>t[0]===className && t[1]===row.name)) {
                            if(refs.has(key))refs.get(key).ambiguous=true;
                            else refs.set(key,{method,row});
                        }
                        if(row.parametersTruncated)summary.truncated=true;
                    }
                    if(!methodEnd){summary.truncated=true;events.push({kind:'limit',className,member:'methods'});}
                }
                if(found.size===CLASSES.length)break;
            }
            summary.missingCandidates=CLASSES.filter(c=>!found.has(c));
            if(found.size===0)return {retry:'candidate-classes-not-ready'};
            return {summary,events,refs};
        });
    }
    function emit(state,kind,fields) {
        const event=Object.assign({time:new Date().toISOString(),kind},fields||{});
        try{console.log('[fieldpad-interaction-probe] '+JSON.stringify(event));}catch(_){}
        if(typeof state.onEvent==='function')try{state.onEvent(event);}catch(_){}
    }
    function createClock() {
        const libc=Process.findModuleByName('libc.so'),address=libc&&libc.findExportByName('clock_gettime');
        if(!address || address.isNull())throw Error('CLOCK_BOOTTIME unavailable');
        const read=new NativeFunction(address,'int',['int','pointer'],{scheduling:'exclusive'});
        const result=Memory.alloc(16);let previous=-1;
        return ()=>{
            // Native ARM64 struct timespec: two signed64-bit longs.
            if(read(7,result)!==0)throw Error('CLOCK_BOOTTIME read failed');
            const seconds=result.readS64().toNumber(),nanos=result.add(8).readS64().toNumber();
            const ms=seconds*1000+nanos/1000000;
            if(!Number.isSafeInteger(seconds) || seconds<0 || nanos<0 || nanos>=1000000000 || !Number.isFinite(ms) || ms<previous)throw Error('CLOCK_BOOTTIME invalid');
            previous=ms;return ms;
        };
    }
    function prepareResultReaders(module,api,domain,refs,enabled) {
        const readers=new Map(),availability=[],changes=[];
        const specs=[[CATCH_RESULT,'Status'],[SPIN_RESULT,'Result']];
        if(!enabled) {
            for(const [responseType,field] of specs)availability.push({responseType,field,available:false,reason:'not-requested'});
            return {readers,availability,changes};
        }
        for(const [responseType,fieldName] of specs) {
            const descriptor={responseType,field:fieldName,available:false};
            try {
                const reader=withThread(api,domain,()=>{
                    const fromType=exported(module,'class_from_type','pointer',['pointer']).call;
                    const isEnum=exported(module,'class_is_enum','bool',['pointer']).call;
                    const baseType=exported(module,'class_enum_basetype','pointer',['pointer']).call;
                    const valueSize=exported(module,'class_value_size','int',['pointer','pointer']).call;
                    const staticRead=exported(module,'field_static_get_value','void',['pointer','pointer']).call;
                    // Keep the JS lock while accessing a shared4-byte scratch slot.
                    // No managed allocations or game method calls occur here.
                    const getClass=exported(module,'object_get_class','pointer',['pointer'],{scheduling:'exclusive'}).call;
                    const readField=exported(module,'field_get_value','void',['pointer','pointer','pointer'],{scheduling:'exclusive'}).call;
                    const owner=refs.classes.get(responseType),record=refs.fields.get(responseType+'::'+fieldName);
                    const enumType=responseType+'.Types.'+fieldName;
                    if(!owner || !record || record.ambiguous || record.row.isStatic || (record.row.flags&0x40) || record.row.fieldType!==enumType || !api.field_get_parent(record.field).equals(owner))throw Error('Response field metadata mismatch');
                    const enumClass=fromType(api.field_get_type(record.field));
                    if(enumClass.isNull() || !isEnum(enumClass) || typeName(api,api.class_get_type(enumClass))!==enumType || typeName(api,baseType(enumClass))!=='System.Int32')throw Error('Result enum must have Int32 underlying type');
                    const align=Memory.alloc(4);align.writeU32(0);
                    if(valueSize(enumClass,align)!==4 || align.readU32()!==4)throw Error('Result enum size/alignment mismatch');
                    const iterator=Memory.alloc(8);iterator.writePointer(ptr(0));
                    const value=Memory.alloc(4),literals=[],meanings=new Map(),literalNames=new Set();
                    let ended=false,backing=false;
                    for(let i=0;i<LIMITS.enumFields;i++) {
                        const field=api.class_get_fields(enumClass,iterator);if(field.isNull()){ended=true;break;}
                        if(!api.field_get_parent(field).equals(enumClass))throw Error('Enum field owner mismatch');
                        const fieldName=name(api.field_get_name(field)),flags=api.field_get_flags(field),fieldType=typeName(api,api.field_get_type(field));
                        if(fieldName==='value__') {
                            if(backing || (flags&0x50) || fieldType!=='System.Int32')throw Error('Enum backing field mismatch');
                            backing=true;continue;
                        }
                        // Literal+static+has-default only: never read arbitrary statics.
                        if((flags&0x8050)!==0x8050 || fieldType!==enumType || literals.length>=LIMITS.enumLiterals || literalNames.has(fieldName))throw Error('Enum literal metadata mismatch');
                        value.writeS32(0);staticRead(field,value);const numeric=value.readS32();
                        literals.push({name:fieldName,value:numeric});literalNames.add(fieldName);
                        if(!meanings.has(numeric))meanings.set(numeric,[]);meanings.get(numeric).push(fieldName);
                    }
                    if(!ended || !backing || literals.length===0)throw Error('Enum literal inventory incomplete');
                    const result={responseType,field:fieldName,enumType,owner,fromType,literals,disabled:false};
                    result.disable=reason=>{
                        if(result.disabled)return;result.disabled=true;
                        changes.push({responseType,field:fieldName,enumType,available:false,reason});
                    };
                    result.read=(object,faultScope=result)=>{
                        if(faultScope.disabled)return {available:false,reason:'reader-disabled'};
                        if(object.isNull())return {available:false,reason:'null-response'};
                        try {
                            if(!getClass(object).equals(owner)){faultScope.disable('response-class-mismatch');return {available:false,reason:'response-class-mismatch'};}
                            value.writeS32(0);readField(object,record.field,value);
                            const numeric=value.readS32(),labels=meanings.get(numeric)||[];
                            return {available:true,responseType,field:fieldName,enumType,value:numeric,names:labels.slice(),mapped:labels.length>0};
                        }catch(e){const reason='result-read-failed: '+String(e).slice(0,160);faultScope.disable(reason);return {available:false,reason};}
                    };
                    return result;
                });
                readers.set(responseType,reader);
                Object.assign(descriptor,{available:true,enumType:reader.enumType,underlyingType:'System.Int32',literals:reader.literals});
            }catch(e){descriptor.reason=String(e).slice(0,240);}
            availability.push(descriptor);
        }
        return {readers,availability,changes};
    }
    function observe(state,module,api,domain,refs,readResults) {
        const debug=exported(module,'debug_get_method_info','bool',['pointer','pointer']);
        function executable(p,bytes) {
            if(p.isNull() || p.compare(module.base)<0 || p.add(bytes).compare(module.base.add(module.size))>0)return false;
            const range=Process.findRangeByAddress(p);
            return !!range && range.protection.includes('r') && range.protection.includes('x') && p.add(bytes).compare(range.base.add(range.size))<=0;
        }
        if(!executable(debug.address,80) || DEBUG_WORDS.some((word,i)=>debug.address.add(i*4).readU32()!==word))throw Error('Debug-info ABI fingerprint mismatch');
        const generic=exported(module,'method_is_generic','bool',['pointer']).call;
        const inflated=exported(module,'method_is_inflated','bool',['pointer']).call;
        const availability=[];
        const targets=withThread(api,domain,()=>{
            const result=[];
            for(const target of ALL_TARGETS) {
                const [className,method,parameters,extra={}]=target,optional=OPTIONAL_TARGETS.includes(target);
                const key=className+'::'+method,record=refs.get(key),row=record&&record.row;
                try {
                if(!row)throw Error(record&&record.unavailable || 'Observer method missing: '+key);
                if(record.ambiguous)throw Error('Observer method ambiguous: '+key);
                if(!row || record.ambiguous || row.className!==className || row.isStatic || row.parameterCount!==parameters.length || row.returnType!==(extra.returnType||'System.Void') || row.parametersTruncated || row.parameterTypes.length!==parameters.length || row.parameterTypes.some((t,i)=>t!==parameters[i]) || generic(record.method) || inflated(record.method))throw Error('Observer signature mismatch: '+key);
                const out=Memory.alloc(24);out.writeByteArray(new Uint8Array(24));
                if(!debug.call(record.method,out))throw Error('Debug-info unavailable: '+key);
                const address=out.readPointer();
                if(!executable(address,4) || !address.and(3).isNull())throw Error('Observer address is not aligned executable module code: '+key);
                if(extra.readReturn && (!address.equals(module.base.add(extra.rva)) || !executable(address,extra.words.length*4) ||
                    extra.words.some((word,i)=>address.add(i*4).readU32()!==word)))throw Error('Observer method fingerprint mismatch: '+key);
                if(result.some(t=>t.address.equals(address)))throw Error('Observer methods share code');
                result.push({className,method,address,signature:row,metadata:record.method,optional,readReturn:extra.readReturn===true});
                }catch(error) {
                    if(!optional)throw error;
                    availability.push({className,method,optional:true,available:false,reason:String(error).slice(0,240)});
                }
            }
            return result;
        });
        for(const event of availability){if(!state.active)return;emit(state,'observer-target-availability',event);}
        if(!state.active)return;
        const results=prepareResultReaders(module,api,domain,refs,readResults);
        if(results.readers.size) {
            try{withThread(api,domain,()=>{
                for(const target of targets) {
                    if(!target.readReturn && !RESULT_TARGETS.has(target.className+'::'+target.method))continue;
                    const reader=results.readers.get(target.readReturn?target.signature.returnType:target.signature.parameterTypes[0]);
                    if(!reader)continue;
                    try {
                        const type=target.readReturn?api.method_get_return_type(target.metadata):api.method_get_param(target.metadata,0);
                        if(!reader.fromType(type).equals(reader.owner))throw Error('Result class identity mismatch');
                        if(target.readReturn) {
                            // An unsupported early return must not disable the
                            // three established argument-based result readers.
                            const isolated={disabled:false,disable(reason){
                                if(this.disabled)return;this.disabled=true;
                                results.changes.push({className:target.className,method:target.method,responseType:reader.responseType,
                                    field:reader.field,returnResultRead:true,available:false,reason});
                            }};
                            isolated.read=object=>reader.read(object,isolated);target.reader=isolated;
                        } else target.reader=reader;
                    }catch(e){
                        if(target.readReturn)target.readerUnavailable='return-class-mismatch';
                        else reader.disable('parameter-class-mismatch');
                    }
                }
            });}catch(e){for(const reader of results.readers.values())reader.disable('parameter-validation-unavailable');}
        }
        for(const change of results.changes.splice(0)) {
            const descriptor=results.availability.find(a=>a.responseType===change.responseType);
            if(descriptor)Object.assign(descriptor,change);
        }
        for(const event of results.availability){if(!state.active)return;emit(state,'result-read-availability',event);}
        if(!state.active)return;
        const clock=createClock(),started=clock(),queue=[],threads=new Set(),counts={};
        let hitCount=0,eventCount=0,callId=0,inFlight=0,reservedEvents=0,reason=null;
        function timestamp(){return clock();}
        function enqueue(base,phase,time,result) {
            const row=Object.assign({},base,{kind:'interaction-event',phase,boottimeMs:time,elapsedMs:time-started});
            if(phase==='enter' && result!==undefined)row.result=result;
            queue.push(row);eventCount++;
        }
        for(const target of targets) {
            if(!state.active)return;
            counts[target.className+'::'+target.method]={enter:0,leave:0};
            const count=counts[target.className+'::'+target.method];
            if(target.readReturn)count.pendingPolls=0;
            try {
            state.listeners.push(Interceptor.attach(target.address,{
                onEnter(args) {
                    this.interaction=null;
                    if(!state.active || reason)return;
                    try {
                        if(++hitCount>LIMITS.hits){reason='hit-limit';return;}
                        const time=timestamp();if(time-started>=LIMITS.observeMs){reason='observation-complete';return;}
                        // Reserve room for the matching leave, including nested calls.
                        if(eventCount+reservedEvents+2>LIMITS.events){reason='event-limit';return;}
                        const tid=Process.getCurrentThreadId();
                        if(!threads.has(tid) && threads.size>=LIMITS.threads){reason='thread-limit';return;}
                        threads.add(tid);
                        const base={className:target.className,method:target.method,receiver:args[0].toString(),tid,callId:++callId};
                        this.interaction=base;this.interactionStarted=time;inFlight++;
                        reservedEvents+=target.readReturn?2:1;
                        if(target.readReturn)return;
                        count.enter++;
                        const scalar=target.reader?target.reader.read(args[1]):undefined;
                        enqueue(base,'enter',time,scalar);
                    }catch(e){reason='callback-error: '+String(e).slice(0,160);}
                },
                onLeave(retval) {
                    const base=this.interaction;this.interaction=null;
                    if(!base)return;inFlight--;reservedEvents-=target.readReturn?2:1;
                    if(!state.active)return;
                    try {
                        if(target.readReturn) {
                            if(retval.isNull()){count.pendingPolls++;return;}
                            const time=timestamp(),scalar=target.reader?target.reader.read(retval):undefined;
                            count.enter++;count.leave++;
                            enqueue(base,'enter',this.interactionStarted);
                            const returned=Object.assign({},base);
                            if(scalar!==undefined)returned.returnResult=scalar;
                            enqueue(returned,'leave',time);
                        } else {count.leave++;enqueue(base,'leave',timestamp());}
                    }
                    catch(e){reason='callback-error: '+String(e).slice(0,160);}
                }
            }));
            target.installed=true;
            emit(state,'observer-target-availability',{className:target.className,method:target.method,
                optional:target.optional,available:true,rva:target.address.sub(module.base).toString(),
                parameterTypes:target.signature.parameterTypes,returnType:target.signature.returnType,
                resultRead:!target.readReturn&&!!target.reader&&!target.reader.disabled,
                returnResultRead:target.readReturn&&!!target.reader&&!target.reader.disabled,
                resultReadUnavailable:target.readerUnavailable||undefined});
            }catch(error) {
                if(!target.optional)throw error;
                delete counts[target.className+'::'+target.method];
                emit(state,'observer-target-availability',{className:target.className,method:target.method,optional:true,
                    available:false,reason:'Observer attach failed: '+String(error).slice(0,180)});
            }
        }
        if(!state.active)return;
        const installed=targets.filter(t=>t.installed);
        // Keep the window marker below Android's per-record log limit. Detailed
        // signatures belong to the individual availability records above.
        emit(state,'observation-ready',{durationMs:LIMITS.observeMs,clock:'CLOCK_BOOTTIME',methodsInvoked:false,
            objectGraphsRead:false,resultReadsEnabled:Array.from(results.readers.values()).some(r=>!r.disabled),
            targetCount:installed.length,argumentResultReaderCount:installed.filter(t=>!t.readReturn&&t.reader&&!t.reader.disabled).length,
            returnResultReaderCount:installed.filter(t=>t.readReturn&&t.reader&&!t.reader.disabled).length});
        function poll() {
            if(!state.active)return;state.timer=null;
            for(const event of results.changes.splice(0)){if(!state.active)return;emit(state,'result-read-availability',event);}
            for(const row of queue.splice(0)){if(!state.active)return;emit(state,row.kind,row);}
            try{if(!reason && timestamp()-started>=LIMITS.observeMs)reason='observation-complete';}
            catch(e){reason='clock-error: '+String(e).slice(0,160);}
            if(reason) {
                const summary={status:reason==='observation-complete'&&eventCount>0?'complete':'unavailable',
                    reason:reason==='observation-complete'&&eventCount===0?'no-natural-calls':reason,
                    counts,hitCount,events:eventCount,threads:Array.from(threads),inFlight};
                emit(state,'observation-summary',summary);state.finish(summary);return;
            }
            state.timer=setTimeout(poll,LIMITS.pollMs);
        }
        if(state.active)state.timer=setTimeout(poll,LIMITS.pollMs);
    }
    function start(options) {
        if(!options || options.enabled!==true)return Promise.resolve({status:'disabled'});
        if(running)return Promise.resolve({status:'already-running'});
        return new Promise(resolve=>{
            const state={active:true,onEvent:options.onEvent,timer:null,listeners:[],attempts:0,
                deadline:Date.now()+LIMITS.prepareMs,finish:null};running=state;
            state.finish=result=>{
                if(!state.active)return;state.active=false;
                if(state.timer!==null)clearTimeout(state.timer);
                for(const listener of state.listeners.splice(0))try{listener.detach();}catch(_){}
                running=null;setTimeout(()=>{emit(state,'finished',result);resolve(result);},0);
            };
            function attempt() {
                if(!state.active)return;state.timer=null;state.attempts++;
                try {
                    if(Process.arch!=='arm64' || Process.pointerSize!==8){state.finish({status:'skipped',reason:'native-arm64-required'});return;}
                    const module=Process.findModuleByName('libil2cpp.so');let found,api,domain;
                    if(!module)found={retry:'library-not-loaded'};
                    else {
                        const elf=new Uint8Array(module.base.readByteArray(20));
                        if(elf[0]!==127 || elf[1]!==69 || elf[2]!==76 || elf[3]!==70 || elf[4]!==2 || elf[5]!==1 || elf[18]!==183 || elf[19]!==0){state.finish({status:'skipped',reason:'library-architecture-mismatch'});return;}
                        api=bind(module);domain=api.domain_get();found=domain.isNull()?{retry:'domain-not-ready'}:inspect(api,domain);
                    }
                    if(found.retry) {
                        if(state.attempts>=LIMITS.attempts || Date.now()+LIMITS.retryMs>state.deadline)state.finish({status:'unavailable',reason:found.retry});
                        else state.timer=setTimeout(attempt,LIMITS.retryMs);
                        return;
                    }
                    emit(state,'metadata-ready',{classes:found.summary.classes,methodsInvoked:false,objectsRead:false});
                    for(const row of found.events){if(!state.active)return;emit(state,row.kind,row);}
                    if(!state.active)return;emit(state,'metadata-summary',found.summary);
                    if(!state.active)return;
                    if(options.observeRuntime===true) {
                        try{observe(state,module,api,domain,found.refs,options.readResults===true);}
                        catch(e){state.finish({status:'unavailable',reason:'observer-setup-failed',message:String(e).slice(0,300),metadata:found.summary});}
                    }else state.finish(found.summary);
                }catch(e){state.finish({status:'error',message:String(e).slice(0,300)});}
            }
            state.timer=setTimeout(attempt,0);
        });
    }
    function stop(){if(!running)return Promise.resolve({status:'idle'});running.finish({status:'cancelled'});return Promise.resolve({status:'cancelled'});}
    root.FieldPadInteractionProbe=Object.freeze({start,stop,limits:LIMITS});
})(globalThis);
globalThis.FieldPadInteractionProbe;
