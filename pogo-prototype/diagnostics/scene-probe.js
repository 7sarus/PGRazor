// Metadata by default; observeRuntime:true adds bounded passive getter hooks.
// Never invokes game methods, replaces returns, or retains object pointers.
// Explicit opt-in: FieldPadSceneProbe.start({enabled:true,onEvent}).
(function(root) {
    'use strict';
    const LIMITS=Object.freeze({attempts:20,retryMs:1000,durationMs:20000,scanMs:3000,
        assemblies:128,classes:6,parentDepth:4,methodsPerClass:48,methods:128,
        fieldsPerClass:32,fields:128,parameters:8,nameBytes:256,
        observeMs:20000,pollMs:250,hits:20000,events:256,threads:4});
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
    let running=null;
    function name(pointer) {
        if(pointer.isNull())throw Error('Null metadata name');
        let n=0;while(n<LIMITS.nameBytes && pointer.add(n).readU8()!==0)n++;
        if(n===LIMITS.nameBytes)throw Error('Metadata name exceeds bound');
        return n?pointer.readUtf8String(n):'';
    }
    function bind(module) {
        const api={};
        for(const key of Object.keys(SPEC)) {
            const address=module.findExportByName('il2cpp_'+key);
            if(!address || address.isNull())throw Error('Missing export il2cpp_'+key);
            api[key]=new NativeFunction(address,...SPEC[key]);
        }
        return api;
    }
    function typeName(api,type) {
        if(type.isNull())throw Error('Null metadata type');
        const allocated=api.type_get_name(type);
        if(allocated.isNull())throw Error('Null allocated type name');
        try{return name(allocated);}finally{api.free(allocated);}
    }
    function inspect(api,domain) {
        let attached=null;
        try {
            if(api.thread_current().isNull()) {
                attached=api.thread_attach(domain);
                if(attached.isNull())throw Error('IL2CPP attachment returned null');
            }
            const count=Memory.alloc(8);count.writeU64(0);
            const list=api.domain_get_assemblies(domain,count),total=count.readU64();
            if(total.compare(0)===0)return {retry:'assemblies-not-ready'};
            if(list.isNull())throw Error('Null assembly list');
            const scanned=total.compare(LIMITS.assemblies)>0?LIMITS.assemblies:total.toNumber();
            const deadline=Date.now()+LIMITS.scanMs;let image=null;
            for(let i=0;i<scanned;i++) {
                if(Date.now()>=deadline)return {result:{status:'unavailable',reason:'metadata-scan-budget'},events:[]};
                const assembly=list.add(i*8).readPointer();if(assembly.isNull())continue;
                const candidate=api.assembly_get_image(assembly);if(candidate.isNull())continue;
                if(name(api.image_get_name(candidate))==='holo-game.dll'){image=candidate;break;}
            }
            if(!image)return {retry:'holo-game-not-found-within-bound'};
            const events=[],refs={classes:{},methods:{}},visited=new Set(),summary={status:'complete',classes:0,fields:0,methods:0,truncated:false,missingCandidates:[]};
            const names=['MainCameraRig','ICameraRig'],ns=Memory.allocUtf8String('Niantic.Holoholo.CameraRig');
            outer:for(const candidate of names) {
                let klass=api.class_from_name(image,ns,Memory.allocUtf8String(candidate));
                if(klass.isNull()){summary.missingCandidates.push(candidate);continue;}
                for(let depth=0;depth<LIMITS.parentDepth && !klass.isNull();depth++) {
                    if(Date.now()>=deadline || summary.classes>=LIMITS.classes){summary.truncated=true;break outer;}
                    if(visited.has(klass.toString()))break;
                    const className=typeName(api,api.class_get_type(klass));
                    // Report System.Object as a parent edge only, not a generic dump.
                    if(depth>0 && className==='System.Object')break;
                    visited.add(klass.toString());summary.classes++;
                    refs.classes[className]=klass;
                    const parent=api.class_get_parent(klass),parentName=parent.isNull()?null:typeName(api,api.class_get_type(parent));
                    const classFlags=api.class_get_flags(klass);
                    events.push({kind:'class',className,candidate,parentDepth:depth,parent:parentName,isInterface:Boolean(classFlags&0x20),flags:classFlags});
                    const fields=Memory.alloc(8);fields.writePointer(ptr(0));let fieldEnd=false;
                    for(let f=0;f<LIMITS.fieldsPerClass && summary.fields<LIMITS.fields;f++) {
                        if(Date.now()>=deadline){summary.truncated=true;break outer;}
                        const field=api.class_get_fields(klass,fields);if(field.isNull()){fieldEnd=true;break;}
                        if(!api.field_get_parent(field).equals(klass))throw Error('Unexpected field declaring class');
                        const flags=api.field_get_flags(field);
                        events.push({kind:'field',className,name:name(api.field_get_name(field)),
                            fieldType:typeName(api,api.field_get_type(field)),flags,isStatic:Boolean(flags&0x10)});
                        summary.fields++;
                    }
                    if(!fieldEnd){summary.truncated=true;events.push({kind:'limit',className,member:'fields'});}
                    const methods=Memory.alloc(8);methods.writePointer(ptr(0));let methodEnd=false;
                    for(let m=0;m<LIMITS.methodsPerClass && summary.methods<LIMITS.methods;m++) {
                        if(Date.now()>=deadline){summary.truncated=true;break outer;}
                        const method=api.class_get_methods(klass,methods);if(method.isNull()){methodEnd=true;break;}
                        if(!api.method_get_class(method).equals(klass))throw Error('Unexpected method declaring class');
                        const impl=Memory.alloc(4);impl.writeU32(0);
                        const flags=api.method_get_flags(method,impl),parameterCount=api.method_get_param_count(method),parameters=[];
                        for(let p=0;p<Math.min(parameterCount,LIMITS.parameters);p++)parameters.push(typeName(api,api.method_get_param(method,p)));
                        const methodName=name(api.method_get_name(method));
                        events.push({kind:'method',className,name:methodName,parameterCount,parameterTypes:parameters,
                            parametersTruncated:parameterCount>LIMITS.parameters,returnType:typeName(api,api.method_get_return_type(method)),
                            isStatic:Boolean(flags&0x10),flags,isConstructor:methodName==='.ctor'||methodName==='.cctor'});
                        if((className==='Niantic.Holoholo.CameraRig.MainCameraRig' && methodName==='IsShowingMap') ||
                            (className==='Niantic.Holoholo.Cameras.CameraStack' && methodName==='get_MainCamera')) {
                            if(refs.methods[methodName])refs.methods[methodName].ambiguous=true;
                            else refs.methods[methodName]={method,signature:events[events.length-1]};
                        }
                        summary.methods++;if(parameterCount>LIMITS.parameters)summary.truncated=true;
                    }
                    if(!methodEnd){summary.truncated=true;events.push({kind:'limit',className,member:'methods'});}
                    klass=parent;
                    if(depth===LIMITS.parentDepth-1 && parentName!==null && parentName!=='System.Object'){summary.truncated=true;events.push({kind:'limit',className,member:'parents'});}
                }
            }
            if(summary.missingCandidates.length===names.length){summary.status='unavailable';summary.reason='candidate-classes-missing';}
            return {result:summary,events,refs};
        }finally{if(attached!==null && !attached.isNull())api.thread_detach(attached);}
    }
    function emit(state,kind,fields) {
        const event=Object.assign({time:new Date().toISOString(),kind},fields||{});
        try{console.log('[fieldpad-scene-probe] '+JSON.stringify(event));}catch(_){}
        if(typeof state.onEvent==='function')try{state.onEvent(event);}catch(_){}
    }
    // Exact shipped ARM64 implementation, Unity 6000.3.22f1; evidence:
    // build/feature-research/SCENE-MAP-GUARD-NEXT.txt. Unknown builds fail closed.
    const DEBUG_INFO_WORDS=[0x90051008,0xf9474508,0xb4000148,0x90051009,0xf9474929,
        0xb40000e9,0xf940040a,0xeb0a011f,0x2a1f03e8,0x54000128,0xeb0a013f,
        0x540000e3,0xb40000a1,0xf9400408,0xb900083f,0xf900083f,0xf9000028,
        0x52800028,0x2a0803e0,0xd65f03c0];
    function observe(state,module,api,domain,refs) {
        function exported(key,result,args) {
            const p=module.findExportByName('il2cpp_'+key);
            if(!p || p.isNull())throw Error('Missing observation export '+key);
            return {address:p,call:new NativeFunction(p,result,args)};
        }
        function executable(p,length) {
            if(p.isNull() || p.compare(module.base)<0 || p.add(length).compare(module.base.add(module.size))>0)return false;
            const range=Process.findRangeByAddress(p);
            return !!range && range.protection.includes('r') && range.protection.includes('x') && p.add(length).compare(range.base.add(range.size))<=0;
        }
        const debug=exported('debug_get_method_info','bool',['pointer','pointer']);
        if(!executable(debug.address,80) || DEBUG_INFO_WORDS.some((word,i)=>debug.address.add(i*4).readU32()!==word))throw Error('Debug-info ABI fingerprint mismatch');
        const getClass=exported('object_get_class','pointer',['pointer']).call;
        const generic=exported('method_is_generic','bool',['pointer']).call;
        const inflated=exported('method_is_inflated','bool',['pointer']).call;
        const rigName='Niantic.Holoholo.CameraRig.MainCameraRig',rig=refs.classes[rigName];
        if(!rig)throw Error('MainCameraRig metadata missing');
        const specs=[['IsShowingMap',rigName,'System.Boolean'],['get_MainCamera','Niantic.Holoholo.Cameras.CameraStack','UnityEngine.Camera']];
        const resolved=[];let owned=null;
        try {
            if(api.thread_current().isNull()){owned=api.thread_attach(domain);if(owned.isNull())throw Error('Observation thread attach failed');}
            for(const [key,owner,returns] of specs) {
                const record=refs.methods[key],sig=record&&record.signature;
                if(!sig || record.ambiguous || sig.className!==owner || sig.isStatic || sig.parameterCount!==0 || sig.returnType!==returns || generic(record.method) || inflated(record.method))throw Error('Observation signature mismatch: '+key);
                const out=Memory.alloc(24);out.writeByteArray(new Uint8Array(24));
                if(!debug.call(record.method,out))throw Error('Debug-info unavailable: '+key);
                const address=out.readPointer();
                if(!executable(address,4) || !address.and(3).isNull())throw Error('Getter address is not aligned executable module code: '+key);
                if(resolved.some(item=>item.address.equals(address)))throw Error('Observed getters share code');
                resolved.push({key,address});
            }
        }finally{if(owned!==null && !owned.isNull())api.thread_detach(owned);}
        const queue=[],threads=new Set(),counts={IsShowingMap:0,get_MainCamera:0},rejected={receiver:0},last={};
        let hitCount=0,eventCount=0,fault=null;
        const deadline=Date.now()+LIMITS.observeMs;
        function record(key,receiver,tid,value) {
            counts[key]++;
            const row={kind:'scene-observation',getter:key,receiverClass:rigName,receiver,tid,timeMs:Date.now()};
            if(key==='IsShowingMap')row.isShowingMap=value;else row.camera=value;
            last[key]=row;
            if(eventCount<LIMITS.events){queue.push(row);eventCount++;}
        }
        for(const {key,address} of resolved) {
            const listener=Interceptor.attach(address,{
                onEnter(args) {
                    this.scene=null;
                    if(!state.active || fault || Date.now()>=deadline)return;
                    if(++hitCount>LIMITS.hits){fault='hit-limit';return;}
                    try {
                        const tid=Process.getCurrentThreadId();threads.add(tid);
                        if(threads.size>LIMITS.threads){fault='thread-limit';return;}
                        if(args[0].isNull() || !getClass(args[0]).equals(rig)){rejected.receiver++;return;}
                        // String identity only; no object survives the invocation.
                        this.scene={receiver:args[0].toString(),tid};
                    }catch(e){fault='receiver-read: '+String(e).slice(0,160);}
                },
                onLeave(value) {
                    if(!this.scene || !state.active || fault || Date.now()>=deadline)return;
                    try {
                        if(key==='IsShowingMap') {
                            const result=value.toUInt32()&0xff;
                            if(result!==0 && result!==1){fault='invalid-boolean-return';return;}
                            record(key,this.scene.receiver,this.scene.tid,result===1);
                        }else record(key,this.scene.receiver,this.scene.tid,value.toString());
                    }catch(e){fault='return-read: '+String(e).slice(0,160);}
                    this.scene=null;
                }
            });
            state.listeners.push(listener);
        }
        emit(state,'observation-ready',{durationMs:LIMITS.observeMs,methodsInvoked:false,objectsRetained:false,
            getters:resolved.map(r=>({name:r.key,rva:r.address.sub(module.base).toString()}))});
        function poll() {
            if(!state.active)return;state.timer=null;
            for(const row of queue.splice(0)){if(!state.active)return;emit(state,row.kind,row);}
            if(fault || Date.now()>=deadline) {
                const summary={counts,rejected,threads:Array.from(threads),hitCount,emitted:eventCount,last,
                    status:fault?'unavailable':counts.IsShowingMap>0?'complete':'unavailable',
                    reason:fault || (counts.IsShowingMap>0?'observation-complete':'no-map-getter-observed')};
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
            const state={active:true,onEvent:options.onEvent,timer:null,listeners:[],attempts:0,deadline:Date.now()+LIMITS.durationMs,finish:null};running=state;
            state.finish=result=>{
                if(!state.active)return;state.active=false;if(state.timer!==null)clearTimeout(state.timer);
                for(const listener of state.listeners.splice(0))try{listener.detach();}catch(_){}
                running=null;
                setTimeout(()=>{emit(state,'finished',result);resolve(result);},0);
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
                    // Event sinks run only after inspect's owned thread has detached.
                    emit(state,'ready',{stage:'metadata-only',objectsRead:false,methodsInvoked:false});
                    for(const event of found.events){if(!state.active)return;emit(state,event.kind,event);}
                    if(state.active && options.observeRuntime===true && found.result.status==='complete')observe(state,module,api,domain,found.refs);
                    else state.finish(found.result);
                }catch(error){state.finish({status:'error',message:String(error)});}
            }
            state.timer=setTimeout(attempt,0);
        });
    }
    root.FieldPadSceneProbe=Object.freeze({start,stop(){if(running)running.finish({status:'cancelled'});},limits:LIMITS});
})(globalThis);
globalThis.FieldPadSceneProbe;
