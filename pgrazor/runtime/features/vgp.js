// VGP requests, pending outcomes and target ownership.
(function(root){
 const features=root.PGRazorFeatures||(root.PGRazorFeatures={});
 features.vgp=function({p,s,Interceptor,unity,exact,classes,VGP_NAMEPLATE,freeHandle,VGP,hold,event,target,invoke,api,Memory,SPINRESULT,itemArgs,alive,ptr,itemInt,present,fields,capturedKey,releaseRecord,finishTransfer,PK,readPtr,transferCatch,readS32,vgpPromise,getItemState,itemNumber,RESP,BAG,IBAG,vgpField}){
 const vgpState={manualTarget:null,manualAt:0,transfer:null,markerAt:0,pending:null,next:0,seen:new Map(),status:'',scanAt:0,turn:0,blocked:false,rpcMethod:null,reflection:null};
 // The nameplate receives the manual encounter's actual map model. Keep one
 // rooted exclusion until the map returns (also covers catch animations
 // and details after the interaction state has exited).
 // IV metadata must validate the original instruction bytes before we attach.
 if(p.vgp)s.installVgpManual=()=>s.listeners.push(Interceptor.attach(p.vgp.m.manualUI.address,{onEnter(a){
  if(!unity(this.threadId)||s.stopping||!exact(a[0],classes[VGP_NAMEPLATE]))return;
  try{freeHandle(vgpState.manualTarget);vgpState.manualTarget=null;vgpState.manualAt=s.now();
   if(exact(a[1],classes[VGP.wild]))vgpState.manualTarget=hold(a[1]);
  }catch(e){event(s,'vgp-error',{reason:'manual-target:'+String(e)});s.vgpLease=0;}
 }}));
 function vgpManualTarget(o){return !!vgpState.manualTarget&&target(vgpState.manualTarget).equals(o);}
 function vgpStatus(message){if(message!==vgpState.status){vgpState.status=message;event(s,'vgp-status',{message});}}
 // Keep terminal targets suppressed; retry known non-terminal results without moving.
 function vgpRetry(q,now,delay){if(q&&q.key&&q.phase!=='spin')vgpState.seen.set(q.key,now+delay);}
 function vgpCatchDelay(status){const c=p.vgp.catchStates;
  if(status===c.CatchSuccess||status===c.CatchFlee)return 3600000;
  if(status===c.CatchEscape||status===c.CatchMissed||status===c.CatchItemReplacement)return 5000;
  return 30000;
 }
 function vgpDrop(){const q=vgpState.pending;if(q){freeHandle(q.promise);freeHandle(q.target);freeHandle(q.bag);vgpState.pending=null;event(s,'vgp-marker',{visible:false});}}
 function vgpVirtual(m,o,args){return invoke(api.object_get_virtual_method(o,m.method),o,args);}
 function vgpBool(m,o){const h=hold(vgpVirtual(m,o));try{return api.object_unbox(target(h)).readU8()!==0;}finally{freeHandle(h);}}
 function vgpDistance(lat,lon){const d=Math.PI/180,a=s.vgpLat*d,b=lat*d,x=(lat-s.vgpLat)*d,y=(lon-s.vgpLon)*d,z=Math.sin(x/2)**2+Math.cos(a)*Math.cos(b)*Math.sin(y/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,z)));}
 function vgpSpinMethod(root){const t=p.vgp,r=vgpState;if(r.rpcMethod)return r.rpcMethod;
  const generic=api.class_get_method_from_name(classes[VGP.rpc],Memory.allocUtf8String('SendRpc'),5);if(generic.isNull()||!api.method_is_generic(generic)||api.method_get_param_count(generic)!==5)throw Error('vgp-rpc-definition');
  const reflection=root(p.items.lookup.reflect(generic,classes[VGP.rpc])),types=root(t.array(classes[VGP.type],2));
  for(const [i,k]of [classes[VGP.request],classes[SPINRESULT]].entries()){const value=root(p.items.lookup.typeObject(api.class_get_type(k)));t.barrier(types,types.add(32+i*8),value);}
  const make=api.class_get_method_from_name(api.object_get_class(reflection),Memory.allocUtf8String('MakeGenericMethod'),1);if(make.isNull())throw Error('vgp-generic-method');
  const closed=root(invoke(make,reflection,itemArgs([types]))),m=t.unreflect(closed);if(m.isNull()||!api.method_is_inflated(m)||api.method_get_param_count(m)!==5)throw Error('vgp-closed-rpc');
  r.reflection=hold(closed);r.rpcMethod=m;return m;
 }

 function vgpMark(now){const r=vgpState,t=p.vgp.marker,q=r.pending;if(!t||!q||now-r.markerAt<100)return;r.markerAt=now;const roots=[],root=o=>{roots.push(hold(o));return o;};
  try{const o=target(q.target);if(now>=s.vgpLease||!alive(o)){event(s,'vgp-marker',{visible:false});return;}
   const camera=root(invoke(t.camera.method,ptr(0)));if(!alive(camera))return;const transform=root(invoke(t.transform.method,o)),position=root(invoke(t.position.method,transform)),vector=Memory.alloc(12);vector.writeByteArray(api.object_unbox(position).readByteArray(12));
   const screen=root(invoke(t.project.method,camera,itemArgs([vector]))),v=api.object_unbox(screen),w=itemInt(t.width,ptr(0)),h=itemInt(t.height,ptr(0)),x=v.readFloat()/w,y=1-v.add(4).readFloat()/h,z=v.add(8).readFloat();
   event(s,'vgp-marker',{visible:z>0&&x>=0&&x<=1&&y>=0&&y<=1,x,y,action:q.phase==='spin'?'spin':'catch'});
  }catch(e){event(s,'vgp-marker',{visible:false});}finally{for(const h of roots)freeHandle(h);}
 }
 function vgpQueueTransfer(response,bag,now){if(!s.transferEnabled||!p.transfer||!p.details||!present(response,fields.caughtId,8))return;
  vgpState.transfer={vgp:true,epoch:s.epoch,response:hold(response),vgpBag:hold(bag),capturedKey:capturedKey(response),deadline:now+10000};vgpStatus('Checking auto-transfer');
 }
 function vgpTransferTick(now){const r=vgpState.transfer;if(!r)return false;
  const done=()=>{releaseRecord(r);vgpState.transfer=null;};
  if(s.stopping||!s.transferEnabled||r.epoch!==s.epoch||now>=s.allowedUntil||now>=s.vgpLease){done();return false;}
  if(r.transferRequested){if(r.transferComplete||r.transferFailed){vgpStatus(r.transferComplete?'Transferred':'Transfer error');done();return false;}if(now>=r.transferDeadline){finishTransfer(r.capturedKey,false,'response-timeout');done();return false;}return true;}
  if(now>=r.deadline){vgpStatus('Caught; transfer inventory update timed out');done();return false;}
  const id=Memory.alloc(8);api.field_get_value(target(r.response),fields.caughtId,id);const pokemon=invoke(p.transfer.methods.get.method,target(r.vgpBag),itemArgs([id]));if(pokemon.isNull())return true;
  if(!exact(pokemon,classes[PK])||capturedKey(pokemon,p.details.fields.id)!==r.capturedKey){done();return false;}
  r.pokemon=hold(pokemon);r.vgpGm=hold(readPtr(target(r.vgpBag),p.vgp.f.bagGm));transferCatch(r,s.thread);
  if(r.transferRequested){vgpStatus('Transferring caught Pokemon');return true;}
  vgpStatus(r.transferFailed?'Caught; transfer check failed':'Kept: '+(r.transferReason||'protected'));done();return false;
 }

 let nextMapPoi=0;
 function mapPoiTick(now){
  if(!s.mapPoiLease||now>=s.mapPoiLease||s.stopping||now<nextMapPoi)return;
  nextMapPoi=now+3000;
  if(!p.mapPoi){event(s,'map-pois',{points:[],error:p.mapPoiError||'Unavailable'});return;}
  const roots=[],root=o=>{if(!o.isNull())roots.push(hold(o));return o;};
  try{
   const t=p.vgp,q=p.mapPoi,points=[],seen=new Set(),l=p.items.lookup,wall=Date.now();
   const number=(o,f)=>{const b=Memory.alloc(8);api.field_get_value(o,f,b);return b.readDouble();};
   const millis=(o,f)=>{const b=Memory.alloc(8);api.field_get_value(o,f,b);return b.readU64().toNumber();};
   for(const [kind,klass] of [['stop',classes[VGP.stop]],['gym',q.gym]]){
    const array=root(invoke(t.m.findAll.method,ptr(0),itemArgs([l.typeObject(api.class_get_type(klass))])));
    if(array.isNull())continue;const count=array.add(24).readU64().toNumber();if(count>2048)throw Error('map-count');
    for(let i=0;i<count&&points.length<512;i++){
     const obj=array.add(32+i*8).readPointer();if(!exact(obj,klass)||!alive(obj))continue;
     const fort=root(vgpVirtual(t.m.fort,obj));if(!exact(fort,classes[VGP.fort]))continue;
     const id=readPtr(fort,t.f.fortId);if(id.isNull())continue;const length=id.add(16).readS32();if(length<1||length>256)continue;const key=id.add(20).readUtf16String(length);if(seen.has(key))continue;seen.add(key);
     const lat=number(fort,t.f.fortLat),lon=number(fort,t.f.fortLon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
     let raidEnd=0,egg=false,raidStart=0,team=null,teamId=null,slots=null,tier=null,level=null,boss=null;
     if(kind==='gym'){
      // Each optional read is isolated: a malformed field on one gym must not drop the whole snapshot.
      if(q.teamMethod&&q.teamNames){try{const bx=root(invoke(q.teamMethod.method,obj));if(!bx.isNull()){const tv=api.object_unbox(bx).readS32();teamId=tv;if(typeof q.teamNames[tv]==='string')team=q.teamNames[tv];}}catch(_){}}
      if(q.gymDisplay&&q.slots&&q.gymDisplayClass){try{const gd=root(readPtr(fort,q.gymDisplay));if(exact(gd,q.gymDisplayClass)){const sv=readS32(gd,q.slots);if(Number.isInteger(sv)&&sv>=0&&sv<=6)slots=sv;}}catch(_){}}
      const raid=root(readPtr(fort,q.info));
      if(exact(raid,q.raid)){
       const hidden=Memory.alloc(1);api.field_get_value(raid,q.hidden,hidden);
       const start=millis(raid,q.spawn),end=millis(raid,q.end),battle=millis(raid,q.battle);
       if(!hidden.readU8()&&start<=wall&&end>wall){
        raidEnd=end;egg=battle>wall;raidStart=battle;
        if(q.level){try{const lv=readS32(raid,q.level);level=lv;if(q.raidTiers&&typeof q.raidTiers[lv]==='string')tier=q.raidTiers[lv];}catch(_){}}
        if(!egg&&q.boss&&q.bossId&&q.bossClass){try{const pkm=root(readPtr(raid,q.boss));if(exact(pkm,q.bossClass)){const sp=readS32(pkm,q.bossId);if(Number.isInteger(sp)&&sp>0&&sp<100000)boss=sp;}}catch(_){}}
       }
      }
     }
     const point={id:key,lat,lon,kind,raidEnd,egg};
     if(raidStart)point.raidStart=raidStart;
     if(team!=null)point.team=team;
     if(teamId!=null)point.teamId=teamId;
     if(slots!=null)point.slots=slots;
     if(tier!=null)point.tier=tier;
     if(level!=null)point.level=level;
     if(boss!=null)point.boss=boss;
     points.push(point);
    }
   }
   event(s,'map-pois',{points});
  }catch(e){event(s,'map-pois',{points:[],error:String(e).slice(0,120)});}
  finally{for(const h of roots)freeHandle(h);}
 }
 function vgpTick(now){const t=p.vgp,r=vgpState;if(!t)return;
  if(s.stopping){freeHandle(r.manualTarget);r.manualTarget=null;vgpDrop();if(r.transfer){releaseRecord(r.transfer);r.transfer=null;}freeHandle(r.reflection);r.reflection=null;r.rpcMethod=null;return;}
  if(s.installVgpManual){if(!s.vgpManualReady){vgpStatus('Initializing encounter support');return;}const install=s.installVgpManual;install();s.installVgpManual=null;}
  if(r.manualTarget&&s.vgpMapVisible&&now-r.manualAt>2000){freeHandle(r.manualTarget);r.manualTarget=null;}
  const allowed=()=>s.vgpMask&&now<s.vgpLease;
  const roots=[],root=o=>{roots.push(hold(o));return o;};
  try{
   vgpMark(now);if(vgpTransferTick(now))return;
   if(r.pending){const q=r.pending,state=vgpPromise(target(q.promise));if(!state){if(now>q.deadline){vgpDrop();r.blocked=true;vgpStatus('Response timed out; toggle VGP to resume');}return;}
    if(state.error||state.value.isNull()){vgpRetry(q,now,30000);vgpDrop();r.next=now+3000;vgpStatus('Request rejected');return;}
    root(state.value);
    if(q.phase==='encounter'){
     if(!allowed()||!(s.vgpMask&1)||!alive(target(q.target))||vgpManualTarget(target(q.target))){vgpRetry(q,now,5000);vgpDrop();return;}
     const bag=root(readPtr(target(getItemState().service),p.items.fields.bag));if(itemInt(t.m.itemCount,bag,itemArgs([itemNumber(1)]))<1){vgpRetry(q,now,5000);vgpDrop();vgpStatus('Out of red Poke Balls');return;}
     const ball=Memory.alloc(12);ball.writeByteArray(new Uint8Array(12));ball.writeS32(1);ball.add(4).writeFloat(1); // ordinary straight throw, no grade bonus
     const promise=invoke(t.m.capture.method,target(q.target),itemArgs([ball,ptr(0)]));freeHandle(q.promise);q.promise=hold(promise);q.phase='catch';q.deadline=now+20000;event(s,'vgp-request',{action:'catch'});event(s,'cooldown-action',{action:'VGP ball throw'});return;
    }
    const catchStatus=q.phase==='catch'&&exact(state.value,classes[RESP])?readS32(state.value,t.f.catchStatus):null;
    if(q.phase==='catch')vgpRetry(q,now,vgpCatchDelay(catchStatus));
    const success=q.phase==='catch'?catchStatus===p.success:exact(state.value,classes[SPINRESULT])&&readS32(state.value,t.f.result)===t.spinSuccess;
    if(q.phase==='spin'&&success&&alive(target(q.target))){const until=Memory.alloc(8);api.field_get_value(state.value,t.f.until,until);vgpVirtual(t.m.cooldown,target(q.target),itemArgs([until]));}
    const action=q.phase;if(success&&action==='catch')vgpQueueTransfer(state.value,target(q.bag),now);vgpDrop();r.next=now+2500;getItemState().next=0;if(s.itemEnabled)getItemState().vgpCleanupUntil=now+20000;vgpStatus(success?(action==='catch'?'Pokemon caught':'PokeStop spun'):(action==='catch'?'Pokemon not caught':'Spin unsuccessful'));event(s,'vgp-result',{action,success,status:catchStatus,retryMs:action==='catch'&&!success?vgpCatchDelay(catchStatus):null});return;
   }
   if(!s.vgpMask){r.blocked=false;vgpStatus('Off');return;}if(!allowed()){vgpStatus('Waiting for game readiness');return;}if(r.blocked||now<r.next)return;if(s.itemEnabled&&now<getItemState().vgpCleanupUntil){vgpStatus('Cleaning inventory');return;}r.next=now+2500;
   if(!getItemState().service){vgpStatus('Waiting for inventory');return;}
   const l=p.items.lookup,map=root(invoke(l.find.method,ptr(0),itemArgs([l.typeObject(api.class_get_type(l.map))]))),container=root(invoke(l.container.method,map));
   const resolve=key=>root(invoke(l.resolve.method,container,itemArgs([l.typeObject(api.class_get_type(classes[VGP[key]]))])));
   const player=resolve('playerContract'),pokemonBag=resolve('bagContract'),bag=root(readPtr(target(getItemState().service),p.items.fields.bag));
   if(!exact(player,classes[VGP.player])||!exact(pokemonBag,classes[BAG])||!exact(bag,classes[IBAG]))throw Error('vgp-service-type');
   const balls=itemInt(t.m.itemCount,bag,itemArgs([itemNumber(1)])),stored=itemInt(t.m.pokemonCount,pokemonBag),capacity=itemInt(t.m.maxPokemon,player);
   const catchBlock=!(s.vgpMask&1)?'Pokemon catching disabled':balls<1?'Out of red Poke Balls':stored>=capacity?'Pokemon storage full':'';
   const canCatch=!catchBlock,scan={balls,stored,capacity,catchBlock,total:0,hidden:0,outOfRange:0,recent:0,invalid:0};
   const canSpin=(s.vgpMask&2)&&itemInt(t.m.totalItems,bag)<itemInt(t.m.maxItems,player);
   if(!canCatch&&!canSpin){vgpStatus(catchBlock||'Item bag full');return;}
   for(const [key,expiry]of r.seen)if(expiry<=now)r.seen.delete(key);if(r.seen.size>=2048){vgpStatus('Waiting for recent targets to expire');return;}
   const order=(r.turn++%2)?['spin','catch']:['catch','spin'];
   for(const action of order){if(action==='catch'?!canCatch:!canSpin)continue;const klass=classes[VGP[action==='catch'?'wild':'stop']],array=root(invoke(t.m.findAll.method,ptr(0),itemArgs([l.typeObject(api.class_get_type(klass))]))),count=array.add(24).readU64().toNumber();if(count>2048)throw Error('vgp-map-count');
    for(let i=0;i<count;i++){const o=array.add(32+i*8).readPointer();if(action==='catch')scan.total++;if(!exact(o,klass)||!alive(o)){if(action==='catch')scan.invalid++;continue;}let key,fort=null;
     if(action==='catch'){if(vgpManualTarget(o)){scan.manual=(scan.manual||0)+1;continue;}if(!vgpBool(t.m.visible,o)){scan.hidden++;continue;}const loc=root(invoke(t.m.location.method,o)),v=api.object_unbox(loc);const distance=vgpDistance(v.readDouble(),v.add(8).readDouble());if(!Number.isFinite(distance)||distance>40){scan.outOfRange++;continue;}const id=root(invoke(t.m.id.method,o));key='p'+api.object_unbox(id).readU64().toString();}
     else{if(!vgpBool(t.m.active,o)||!vgpBool(t.m.range,o)||vgpBool(t.m.closed,o)||vgpBool(t.m.cooling,o))continue;fort=root(vgpVirtual(t.m.fort,o));if(!exact(fort,classes[VGP.fort]))continue;const id=readPtr(fort,t.f.fortId);if(id.isNull())continue;key='s'+id.add(20).readUtf16String(Math.min(256,id.add(16).readS32()));}
     if(r.seen.has(key)){if(action==='catch')scan.recent++;continue;}r.seen.set(key,now+(action==='catch'?30000:300000));r.pending={key,target:hold(o),bag:hold(pokemonBag),promise:null,phase:action==='catch'?'encounter':'spin',deadline:now+20000};
     let promise;
     if(action==='catch')promise=invoke(t.m.encounter.method,o);
     else{const request=root(api.object_new(classes[VGP.request]));invoke(t.m.ctor.method,request);api.field_set_value_object(request,t.f.id,readPtr(fort,t.f.fortId));
      for(const [field,value]of [[t.f.lat,s.vgpLat],[t.f.lon,s.vgpLon]]){const b=Memory.alloc(8);b.writeDouble(value);api.field_set_value(request,field,b);}
      for(const [dst,src]of [[t.f.targetLat,t.f.fortLat],[t.f.targetLon,t.f.fortLon]]){const b=Memory.alloc(8);api.field_get_value(fort,src,b);api.field_set_value(request,dst,b);}
      const rpcField=vgpField(bag,'cynr'),rpc=root(readPtr(bag,rpcField));if(!exact(rpc,classes[VGP.rpc]))throw Error('vgp-rpc-type');promise=invoke(vgpSpinMethod(root),rpc,itemArgs([itemNumber(t.rpcId),request,itemNumber(0),itemNumber(10000),itemNumber(0)]));event(s,'vgp-request',{action:'spin'});
     }
     r.pending.promise=hold(promise);vgpStatus(action==='catch'?'Catching nearby Pokemon':'Spinning nearby PokeStop');return;
    }
   }if(now-r.scanAt>=10000){r.scanAt=now;event(s,'vgp-scan',scan);}
   vgpStatus(catchBlock||(scan.recent?'Waiting for Pokemon retry / new targets':scan.outOfRange?'Nearby Pokemon outside 40m catch range':'Watching nearby Pokemon and PokeStops'));
  }catch(e){vgpDrop();if(r.transfer){releaseRecord(r.transfer);r.transfer=null;}r.blocked=true;vgpStatus('Paused: '+String(e));event(s,'vgp-error',{reason:String(e)});}finally{for(const h of roots)freeHandle(h);}
 }
 event(s,'map-poi-ready',{available:!!p.mapPoi,reason:p.mapPoiError,detailsError:p.mapPoi&&p.mapPoi.extraError});
 event(s,'vgp-ready',{available:!!p.vgp,reason:p.vgpError,marker:!!(p.vgp&&p.vgp.marker),markerError:p.vgp&&p.vgp.markerError});


 return {mapPoiTick,vgpTick,vgpState,vgpTransferTick};
 };
})(globalThis);
