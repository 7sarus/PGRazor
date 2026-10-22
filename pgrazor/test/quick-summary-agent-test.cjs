const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../embedded-agent.js'),'utf8');
const parameters={quickSummary:true,quickSummaryPath:'asset'};
function fixture(faults={}) {
    const timers=new Map(),events=[],methods={},lifecycle={},permissions=[],order=[],logs=[];
    let id=0,beat,options,configured=false,ready=false,enabled=false,foreground=true,finish,rejectStart,resolveStop,stopCount=0;
    let connected=true,throwRevoke=false;
    const control={connect(){},renewLease(){},event(...e){
            if(faults.event&&e[0]==='quick-summary')throw Error('event bridge failed');events.push(e);
        },active:()=>false,embedded(){},
        setBerryReady(){},
        configureQuickSummary(v){configured=v;enabled=false;ready=false;},
        quickSummaryAllowed:()=>ready&&enabled&&foreground&&connected};
    const originals={
        setQuickSummaryEnabled(v){enabled=v&&ready;return 'enabled';},
        setQuickSummaryReady(v){if(faults.status)throw Error('status bridge failed');ready=v;if(!v)enabled=false;return 'ready';},
        suspendForBackground(){foreground=false;return 'background';},
        disconnect(){connected=false;ready=false;enabled=false;return 'disconnected';}
    };
    for(const [name,original] of Object.entries(originals)) {
        let implementation=null;
        const method={call(receiver,...args){order.push('original:'+name);return original.apply(receiver,args);}};
        Object.defineProperty(method,'implementation',{get:()=>implementation,set(value){
            if(value&&faults.install===name)throw Error('installation failed');implementation=value;
        }});
        lifecycle[name]=method;
        const wrapper=function(...args){return implementation?implementation.apply(this,args):method.call(this,...args);};
        wrapper.overload=(...args)=>{
            const expected=name==='setQuickSummaryEnabled'?['boolean']:name==='setQuickSummaryReady'?['boolean','java.lang.String']:[];
            assert.deepEqual(args,expected);return method;
        };
        control[name]=wrapper;
    }
    for(const n of ['getLatitude','getLongitude','getSpeed','getBearing'])methods[n]={implementation:null,call:()=>1};
    const location=Object.fromEntries(Object.keys(methods).map(n=>[n,{overload:()=>methods[n]}]));
    const java={perform:f=>f(),performNow:f=>f(),scheduleOnMainThread:f=>f(),use:n=>n==='dev.pgrazor.Control'?control:location};
    const waitPermissions=[];let waitOptions,waitStops=0,waitFinish;
    const waitApi={start(o){waitOptions=o;return new Promise(r=>waitFinish=r);},setAllowed(v){waitPermissions.push(v);if(faults.waitGrant&&v)throw Error("wait grant failed");},stop(){waitStops++;if(waitFinish)waitFinish();return Promise.resolve();}};
    const api={start(o){
        options=o;if(faults.startThrows)throw Error('start partially initialized');
        return new Promise((r,j)=>{finish=r;rejectStart=j;});
    },setAllowed(v){
        permissions.push(v);order.push('permission:'+v);
        if(v&&faults.grant)throw Error('grant failed');if(!v&&throwRevoke)throw Error('revocation failed');
    },stop(){
        stopCount++;order.push('stop');if(finish)finish({status:'stopped'});
        if(faults.stopThrows)throw Error('cleanup failed');
        if(faults.rejectStop)return Promise.reject(Error('cleanup failed'));
        return faults.deferStop?new Promise(r=>resolveStop=r):Promise.resolve();
    }};
    const context={rpc:{exports:{}},console:{log(line){logs.push(String(line));}},File:{readAllText:()=>''},Script:{evaluate(n){
        logs.push('evaluate:'+n);
        if(faults.withWait&&n==='/pgrazor-quick-summary.js')return waitApi;
        if(n.includes('quick-summary')||n.includes('quick-close')){if(faults.asset)throw Error('bad asset');return api;}return java;
    }},setImmediate:f=>f(),setInterval:f=>{beat=f;return 99;},clearInterval(){},
        setTimeout(f,ms){timers.set(++id,{f,ms});return id;},clearTimeout:i=>timers.delete(i)};
    vm.runInNewContext(source,context);
    return {waitPermissions,waitStops:()=>waitStops,waitOptions:()=>waitOptions,context,control,events,methods,lifecycle,permissions,timers,order,logs,faults,init(p=parameters){context.rpc.exports.init('early',p);},
        fire(){const [k,t]=[...timers][0];assert.equal(t.ms,1500);timers.delete(k);t.f();},
        beat:()=>beat(),configured:()=>configured,ready:()=>ready,enable(){return control.setQuickSummaryEnabled(true);},
        background(){return control.suspendForBackground();},options:()=>options,stopped:()=>stopCount>0,stopCount:()=>stopCount,
        finish:()=>finish({status:'unavailable'}),rejectStart:()=>rejectStart(Error('start failed')),resolveStop:()=>resolveStop(),
        failRevocation(){throwRevoke=true;}};
}
function activeFixture(faults){const x=fixture(faults);x.init();x.fire();x.options().onEvent({kind:'metadata-ready'});x.enable();x.beat();assert.equal(x.permissions.at(-1),true);return x;}
const tick=()=>new Promise(setImmediate);
const unhandled=[];process.on('unhandledRejection',error=>unhandled.push(error));
(async()=>{
    const close=fixture();close.init({...parameters,quickClose:true});close.fire();
    assert(close.logs.includes('evaluate:/pgrazor-quick-close.js'),'Close selects its own script identity');
    close.options().onEvent({kind:'metadata-ready'});assert(close.ready());close.beat();
    assert.equal(close.permissions.at(-1),false,'Auto-dismiss is OFF after metadata validation');
    close.enable();close.beat();assert.equal(close.permissions.at(-1),true);
    assert(close.events.some(e=>e[0]==='quick-close'),'Close telemetry has a separate log kind');
    close.background();assert.equal(close.permissions.at(-1),false);
    await close.context.rpc.exports.dispose();assert.equal(close.stopCount(),1);
    for(const waitGrant of [false,true]) {
        const w=fixture({withWait:true,waitGrant});w.init({...parameters,quickClose:true,quickCatchWaitPath:'wait-asset'});w.fire();
        w.options().onEvent({kind:'metadata-ready'});
        w.waitOptions().onEvent({kind:'metadata-ready'});
        w.beat();assert.equal(w.waitPermissions.at(-1),false,'Wait metadata cannot enable Quick Catch');
        w.control.autoTransferAllowed=()=>true;w.beat();assert.equal(w.waitPermissions.at(-1),false,'Auto-transfer alone cannot shorten waits');
        w.enable();w.beat();assert.equal(w.waitPermissions.at(-1),true);
        assert(w.ready(),'Optional wait failure must preserve summary/details');
        w.background();if(!waitGrant)assert.equal(w.waitPermissions.at(-1),false,'Background immediately revokes wait');
        await w.context.rpc.exports.dispose();assert.equal(w.waitStops(),1,'Wait stops exactly once');
        assert(w.events.some(e=>e[0]==='quick-catch-wait'));
    }
    const plain=fixture();plain.init({});assert(!plain.configured());assert.equal(plain.timers.size,0);
    assert(Object.values(plain.lifecycle).every(m=>m.implementation===null));await plain.context.rpc.exports.dispose();
    const x=fixture();x.init();assert(x.configured());assert(!x.ready());assert(!x.options());
    assert(Object.values(x.lifecycle).every(m=>typeof m.implementation==='function'));
    x.fire();x.beat();assert.equal(x.permissions.at(-1),false);
    x.options().onEvent({kind:'metadata-ready'});assert(x.ready());x.beat();assert.equal(x.permissions.at(-1),false,'Metadata does not auto-enable');
    x.enable();assert.equal(x.permissions.at(-1),false,'Turning ON does not grant outside the heartbeat');
    x.beat();assert.equal(x.permissions.at(-1),true);x.background();assert.equal(x.permissions.at(-1),false,'Background revokes before heartbeat');
    x.finish();await new Promise(setImmediate);assert(!x.ready());assert.equal(typeof x.methods.getLatitude.implementation,'function');
    await x.context.rpc.exports.dispose();assert(x.stopped());assert(Object.values(x.lifecycle).every(m=>m.implementation===null));
    assert(Object.values(x.methods).every(m=>m.implementation===null));
    const count=x.events.length;x.options().onEvent({kind:'metadata-ready'});assert.equal(x.events.length,count);assert(!x.ready());
    for(const [name,args,result] of [
        ['setQuickSummaryEnabled',[false],'enabled'],['setQuickSummaryReady',[false,'Unavailable'],'ready'],
        ['suspendForBackground',[],'background'],['disconnect',[],'disconnected']
    ]) {
        const f=activeFixture();f.order.length=0;
        assert.equal(f.control[name](...args),result,'Original return value is preserved');
        assert.deepEqual(f.order,['permission:false','original:'+name],'Revocation precedes the original without a heartbeat');
        f.beat();assert.equal(f.permissions.at(-1),false);await f.context.rpc.exports.dispose();
    }
    const early=fixture();early.init();await early.context.rpc.exports.dispose();assert.equal(early.timers.size,0);
    assert(Object.values(early.lifecycle).every(m=>m.implementation===null));
    const failed=fixture({asset:true});failed.init();failed.fire();assert(!failed.ready());
    assert.equal(typeof failed.methods.getLatitude.implementation,'function');await failed.context.rpc.exports.dispose();
    const partial=fixture({install:'suspendForBackground'});partial.init();assert.equal(partial.timers.size,0);
    assert(Object.values(partial.lifecycle).every(m=>m.implementation===null),'Partial optional hooks are restored');
    assert.equal(typeof partial.methods.getLatitude.implementation,'function','Location hooks survive optional install failure');
    partial.beat();await partial.context.rpc.exports.dispose();
    const revoke=activeFixture();revoke.failRevocation();revoke.order.length=0;
    assert.equal(revoke.background(),'background','Revocation failure must not block original lifecycle');
    assert.deepEqual(revoke.order,['permission:false','stop','original:suspendForBackground']);assert(revoke.stopped());
    const permissionCount=revoke.permissions.length;revoke.beat();assert.equal(revoke.permissions.length,permissionCount,'A failed feature never receives a new grant');
    await revoke.context.rpc.exports.dispose();assert.equal(revoke.stopCount(),1,'Revocation failure and disposal share one cleanup');
    for(const settle of ['finish','rejectStart']) {
        const s=fixture();s.init();s.fire();s.options().onEvent({kind:'metadata-ready'});s[settle]();await tick();
        assert.equal(s.stopCount(),1,settle+': a settled module requests cleanup once');assert(!s.ready());
        s.options().onEvent({kind:'metadata-ready'});assert(!s.ready(),settle+': late metadata cannot re-ready a settled module');
        s.enable();s.beat();assert(!s.permissions.includes(true),settle+': a settled module never receives a grant');
        await s.context.rpc.exports.dispose();assert.equal(s.stopCount(),1);
    }
    const thrown=fixture({startThrows:true});thrown.init();thrown.fire();
    assert.equal(thrown.stopCount(),1,'A start throw after partial initialization requests cleanup');assert(!thrown.ready());
    thrown.options().onEvent({kind:'metadata-ready'});assert(!thrown.ready());thrown.enable();thrown.beat();
    assert(!thrown.permissions.includes(true));assert.equal(typeof thrown.methods.getLatitude.implementation,'function');
    await thrown.context.rpc.exports.dispose();assert.equal(thrown.stopCount(),1,'Disposal reuses the partial-start cleanup');
    for(const revokeFails of [false,true]) {
        const d=activeFixture({deferStop:true});
        if(revokeFails){d.failRevocation();assert.equal(d.background(),'background');assert.equal(d.stopCount(),1);}
        let settled=false;const disposing=d.context.rpc.exports.dispose().then(()=>{settled=true;});
        await tick();assert(!settled,'Disposal awaits the pending summary cleanup');assert.equal(d.stopCount(),1);
        assert(Object.values(d.lifecycle).every(m=>m.implementation===null),'Hooks restore while cleanup is pending');
        d.resolveStop();await disposing;assert(settled);assert.equal(d.stopCount(),1);
    }
    for(const [faults,trigger] of [[{rejectStop:true},f=>{f.faults.grant=true;f.beat();}],[{stopThrows:true},f=>{f.failRevocation();f.background();}]]) {
        const r=activeFixture(faults);trigger(r);await tick();
        assert.equal(r.stopCount(),1);assert(!r.ready());
        assert(r.logs.some(l=>l.includes('quick-summary-cleanup-error: Error: cleanup failed')),'Background cleanup rejection is observed');
        await assert.rejects(r.context.rpc.exports.dispose(),/cleanup failed/,'Disposal reports the original cleanup rejection');
        assert.equal(r.stopCount(),1);
    }
    for(const fault of ['event','status']) {
        const j=fixture({[fault]:true});j.init();j.fire();
        assert.doesNotThrow(()=>j.options().onEvent({kind:'metadata-ready'}),fault+' bridge failure stays inside the adapter');
        assert(j.logs.some(l=>l.includes('quick-summary-event-error')));
        if(fault==='status')assert(j.logs.some(l=>l.includes('quick-summary-status-error')),'Readiness failure is logged');
        assert.equal(j.stopCount(),1,fault+': readiness failure does not block cleanup');assert(!j.ready());
        j.faults[fault]=false;j.options().onEvent({kind:'metadata-ready'});assert(!j.ready(),'Failed optional feature stays disabled');
        j.enable();j.beat();assert(!j.permissions.includes(true));
        j.order.length=0;assert.equal(j.background(),'background');
        assert.deepEqual(j.order,['original:suspendForBackground'],'Original lifecycle proceeds without the failed feature');
        assert.equal(typeof j.methods.getLatitude.implementation,'function','Location hooks survive optional failure');
        await j.context.rpc.exports.dispose();assert.equal(j.stopCount(),1);
    }
    const statusDispose=activeFixture({deferStop:true});statusDispose.faults.status=true;
    let statusPromise,statusSettled=false;
    assert.doesNotThrow(()=>{statusPromise=statusDispose.context.rpc.exports.dispose().then(()=>{statusSettled=true;});},'Status bridge failure cannot bypass cleanup wait');
    await tick();assert(!statusSettled);assert.equal(statusDispose.stopCount(),1);
    assert(statusDispose.order.includes('original:disconnect'),'Disconnect proceeds despite optional status failure');
    statusDispose.resolveStop();await statusPromise;assert(statusSettled);
    await tick();assert.deepEqual(unhandled,[],'No cleanup rejection is left unhandled');
    console.log('PASS: delayed summary, metadata opt-in, immediate OFF/readiness/background/disconnect revocation, optional hook rollback and disposal, terminal latch, single awaited cleanup, contained bridge failures');
})().catch(e=>{console.error(e);process.exitCode=1;});
