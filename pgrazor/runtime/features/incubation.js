// Native feature instance; dependencies and metadata are supplied by quick-close.
(function(root){
 const features=root.PGRazorFeatures||(root.PGRazorFeatures={});
 features.incubation=function({s,p,api,classes,PK,BAG,VGP,Memory,uint64,ptr,invoke,itemArgs,exact,hold,target,freeHandle,readPtr,readS32,event}){
 // Auto incubation: only the permanent unlimited item, confirmed through inventory.
 const incubatorState={next:0,pending:null,blocked:false,enabled:false,status:''};
 function incubationStatus(message){if(message!==incubatorState.status){incubatorState.status=message;event(s,'incubator-status',{message});}}
 function incubationClear(){const q=incubatorState.pending;if(q)for(const h of q.handles)freeHandle(h);incubatorState.pending=null;}
 function incubationScalar(o,f,kind){const v=Memory.alloc(8);v.writeU64(0);api.field_get_value(o,f,v);return kind==='double'?v.readDouble():kind==='bool'?v.readU8()!==0:v.readU64().toString();}
 function incubationString(o){if(o.isNull())return '';const n=api.string_length(o);if(n<0||n>256)throw Error('incubator-string');return n?api.string_chars(o).readUtf16String(n):'';}
 function incubationVirtual(m,o){const v=api.object_get_virtual_method(o,m.method);if(v.isNull())throw Error('incubator-interface');return invoke(v,o);}
 function incubationEach(collection,limit,visit){const m=p.incubator.m,h=hold(collection);let eh=null;
  try{const e=incubationVirtual(m.enumerate,collection);eh=hold(e);for(let i=0;i<=limit;i++){const box=incubationVirtual(m.move,target(eh));if(box.isNull())throw Error('incubator-enumerator');if(!api.object_unbox(box).readU8())return;if(i===limit)throw Error('incubator-inventory-limit');const value=incubationVirtual(m.current,target(eh)),vh=hold(value);try{visit(target(vh));}finally{freeHandle(vh);}}}
  finally{if(eh){try{incubationVirtual(m.dispose,target(eh));}finally{freeHandle(eh);}}freeHandle(h);}
 }
 function incubatorTick(now){const t=p.incubator,r=incubatorState;if(!t)return;
  if(s.stopping){incubationClear();return;}
  if(!s.incubatorEnabled){r.enabled=false;incubationStatus('Off');return;}
  if(!r.enabled){r.enabled=true;if(!r.pending)r.blocked=false;r.next=0;}
  if(!(now<s.incubatorLease)){incubationStatus('Waiting for the map');return;}
  if(now<r.next)return;r.next=now+5000;
  const roots=[],keep=o=>{const h=hold(o);roots.push(h);return o;},f=t.f,m=t.m;
  try{
   const l=p.items.lookup,map=invoke(l.find.method,ptr(0),itemArgs([l.typeObject(api.class_get_type(l.map))]));if(map.isNull())return;keep(map);
   const container=keep(invoke(l.container.method,map));
   const resolve=(contract,concrete)=>{const o=keep(invoke(l.resolve.method,container,itemArgs([l.typeObject(api.class_get_type(classes[contract]))])));if(!exact(o,classes[concrete]))throw Error('incubator-service-type');return o;};
   const player=resolve(VGP.playerContract,VGP.player);let free=null,seen=false,matched=false;
   incubationEach(invoke(m.incubators.method,player),128,o=>{
    if(!exact(o,classes[t.inc]))throw Error('incubator-proto');
    const item=readS32(o,f.item),id=incubationString(readPtr(o,f.incId)),assigned=incubationScalar(o,f.pokemonId);
    if(r.pending&&id===r.pending.incubator){seen=true;if(assigned!=='0'){matched=true;const ours=assigned===r.pending.egg;incubationClear();r.blocked=false;incubationStatus(ours?'Egg incubating':'Incubator already in use');}}
    if(!free&&item===t.unlimited&&id&&assigned==='0'&&incubationScalar(o,f.expiry)==='0')free={o:keep(o),id};
   });
   if(matched)return;
   if(r.pending){if(now>=r.pending.deadline){r.blocked=true;incubationStatus('Assignment unconfirmed; waiting for inventory');}else incubationStatus('Confirming egg assignment');return;}
   if(r.blocked){incubationStatus('Incubation stopped; toggle off/on to retry');return;}
   if(!free){incubationStatus('Unlimited incubator in use or unavailable');return;}
   const bag=resolve(VGP.bagContract,BAG);let choice=null;
   incubationEach(invoke(m.eggs.method,bag),25000,o=>{
    if(!exact(o,classes[PK]))throw Error('incubator-egg-proto');
    if(!incubationScalar(o,f.egg,'bool')||readS32(o,f.eggType)===t.special||incubationString(readPtr(o,f.assignment)))return;
    const id=incubationScalar(o,f.id),km=incubationScalar(o,f.target,'double')-incubationScalar(o,f.start,'double');
    if(id==='0'||!Number.isFinite(km)||km<=0||km>100)return;
    if(!choice||(s.incubatorLongest?km>choice.km:km<choice.km)){if(choice)freeHandle(choice.h);choice={h:hold(o),id,km};roots.push(choice.h);}
   });
   if(!choice){incubationStatus('No eggs waiting');r.next=now+15000;return;}
   // Recheck both assignment fields immediately before the single service call.
   if(!s.incubatorEnabled||!(s.now()<s.incubatorLease)||incubationScalar(free.o,f.pokemonId)!=='0'||incubationString(readPtr(target(choice.h),f.assignment)))return;
   const service=resolve(t.contract,t.service),idArg=Memory.alloc(8);idArg.writeU64(uint64(choice.id));
   const q={egg:choice.id,incubator:free.id,deadline:now+30000,handles:[hold(target(choice.h)),hold(free.o),hold(service)]};r.pending=q;
   incubationStatus('Starting '+choice.km+' km egg');
   const promise=invoke(m.put.method,service,itemArgs([idArg,free.o]));if(!promise.isNull())q.handles.push(hold(promise));
   event(s,'incubator-request',{distance:choice.km,priority:s.incubatorLongest?'longest':'shortest'});
  }catch(e){r.blocked=true;incubationStatus(r.pending?'Assignment unconfirmed; waiting for inventory':'Incubation unavailable; toggle off/on to retry');event(s,'incubator-error',{reason:String(e).slice(0,180)});}
  finally{for(const h of roots)freeHandle(h);}
 }
 event(s,'incubator-ready',{available:!!p.incubator,reason:p.incubatorError});


 return {state:incubatorState,tick:incubatorTick};
 };
})(globalThis);
