const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=require('./script-bundle.cjs')('embedded-agent.js');
function fixture(loadFails=false) {
    const tasks=[],timers=new Map(),events=[],status=[],starts=[],methods={};
    let ready=true,busy=false,configured=false,request=false,stopRequest=false,beat,id=0,cameraOptions,finishCamera,finishTrace,stopCount=0,holdStop=false,releaseStop;
    const control={connect(){},renewLease(){},event(...row){events.push(row);},configureCameraSteering(){},cameraSteeringRequested:()=>true,updateCameraHeadingAt(){},invalidateCameraHeading(){},
        configureInteractionDiagnostics(v){configured=v;},interactionDiagnosticsReady:()=>ready,setInteractionDiagnosticRunning(v){busy=v;},interactionDiagnostic(s){status.push(s);},
        takeInteractionTraceRequest(){const v=request;request=false;return v;},takeInteractionStopRequest(){const v=stopRequest || (busy&&!ready);stopRequest=false;return v;},
        active:()=>false,disconnect(){},embedded(){}};
    for(const n of ['getLatitude','getLongitude','getSpeed','getBearing'])methods[n]={implementation:null,call(){return 1;}};
    const location=Object.fromEntries(Object.keys(methods).map(n=>[n,{overload:()=>methods[n]}]));
    const java={perform:f=>f(),performNow:f=>f(),scheduleOnMainThread:f=>f(),use:n=>n==='dev.pgrazor.Control'?control:location};
    const camera={start(o){cameraOptions=o;return new Promise(r=>{finishCamera=r;});},stop(){return new Promise(r=>{finishCamera=r;});}};
    const interaction={start(o){starts.push(o);if(!o.observeRuntime)return Promise.resolve({status:'complete'});o.onEvent({kind:'observation-ready'});return new Promise(r=>{finishTrace=r;});},stop(){stopCount++;if(holdStop)return new Promise(r=>{releaseStop=()=>{finishTrace({status:'cancelled'});r();};});if(finishTrace)finishTrace({status:'cancelled'});return Promise.resolve();}};
    const context={rpc:{exports:{}},console:{log(){}},File:{readAllText:()=>''},Script:{evaluate(name){if(name.includes('interaction')){if(loadFails)throw Error('probe unavailable');return interaction;}return name.includes('camera-probe')?camera:java;}},
        setImmediate:f=>tasks.push(f),setInterval:f=>{beat=f;return 99;},clearInterval(){},setTimeout(f,ms){timers.set(++id,{f,ms});return id;},clearTimeout:i=>timers.delete(i)};
    vm.runInNewContext(source,context);
    return {context,starts,status,events,methods,timers,init(params){context.rpc.exports.init('early',params);this.flush();},flush(){while(tasks.length)tasks.shift()();},fire(ms){const [key,t]=[...timers].find(([,v])=>v.ms===ms);timers.delete(key);t.f();},
        request(){request=true;beat();this.flush();},background(){ready=false;beat();},stop(){stopRequest=true;beat();},cameraOptions:()=>cameraOptions,configured:()=>configured,busy:()=>busy,stopCount:()=>stopCount,holdStop(){holdStop=true;},releaseStop(){releaseStop();},finishCamera(){finishCamera();}};
}
(async()=>{
    const plain=fixture();plain.init({});assert.equal(plain.timers.size,0);assert(!plain.configured());await plain.context.rpc.exports.dispose();
    const both=fixture();both.init({cameraSteering:true,cameraProbePath:'camera',interactionProbe:true,interactionProbePath:'interaction'});
    assert(both.configured());assert.equal(both.starts.length,0,'No capture during loader initialization');
    both.fire(1500);assert(both.cameraOptions().continuous);
    both.fire(25000);assert.equal(both.starts.length,1);assert.equal(both.starts[0].observeRuntime,false,'Automatic start must be metadata only');
    assert.equal(both.starts[0].readResults,false,'Automatic metadata never reads result objects');
    await new Promise(setImmediate);assert(!both.busy());
    both.request();assert.equal(both.starts.length,2);assert.equal(both.starts[1].observeRuntime,true);assert(both.busy());assert(both.cameraOptions().shouldSample());
    assert.equal(both.starts[1].readResults,true,'Explicit capture can read validated result enums');
    both.request();assert.equal(both.starts.length,2,'No overlapping trace');
    both.starts[1].onEvent({kind:'interaction-event',method:'NotifyReceivedItems'});
    assert(both.events.some(e=>e[0]==='interaction-probe'&&e[1].includes('NotifyReceivedItems')));
    both.background();await new Promise(setImmediate);assert(!both.busy());assert.equal(both.stopCount(),1);
    assert.equal(typeof both.methods.getLatitude.implementation,'function','Background diagnostic stop keeps location hook installed');
    let done=false;const disposal=both.context.rpc.exports.dispose().then(()=>{done=true;});await new Promise(setImmediate);assert(!done);both.finishCamera();await disposal;
    const early=fixture();early.init({interactionProbe:true,interactionProbePath:'interaction'});early.request();assert.equal(early.timers.size,0);assert(early.starts[0].observeRuntime,'Manual request cancels delayed metadata task');
    early.stop();await new Promise(setImmediate);assert(!early.busy());await early.context.rpc.exports.dispose();
    const failed=fixture(true);failed.init({interactionProbe:true,interactionProbePath:'interaction'});failed.fire(25000);assert(!failed.busy());assert(failed.status.some(s=>s.includes('error')));assert.equal(typeof failed.methods.getLatitude.implementation,'function');await failed.context.rpc.exports.dispose();
    const pending=fixture();pending.init({interactionProbe:true,interactionProbePath:'interaction'});pending.request();pending.holdStop();
    let stopped=false;const p=pending.context.rpc.exports.dispose().then(()=>{stopped=true;});await new Promise(setImmediate);assert(!stopped,'Dispose awaits observer cleanup');
    const previous=pending.events.length;pending.starts[0].onEvent({kind:'interaction-event'});assert.equal(pending.events.length,previous,'No post-disposal events');pending.releaseStop();await p;
    for(const m of Object.values(pending.methods))assert.equal(m.implementation,null);
    console.log('PASS: metadata-only default, explicit bounded capture, camera coexistence, overlap/background stop, failure isolation and disposal cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
