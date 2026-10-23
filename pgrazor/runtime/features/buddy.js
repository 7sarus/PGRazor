// Native feature instance; dependencies and metadata are supplied by quick-close.
(function(root){
 const features=root.PGRazorFeatures||(root.PGRazorFeatures={});
 features.buddy=function({s,p,api,classes,BUDDY_TYPES,IBAG,ptr,invoke,itemArgs,itemNumber,itemInt,rocketBool,capturedKey,hold,target,freeHandle,alive,exact,readPtr,readS32,event,unity,Interceptor,getItemState}){
 // Buddy feeding uses the normal service and never enters the play/food UI.

 const buddyState={service:null,pending:null,id:'',config:0,next:0,blocked:false,feeds:0,progress:null,status:''};

 function buddyStatus(message){if(buddyState.status!==message){buddyState.status=message;event(s,'buddy-status',{message});}}

 function buddyFloat(m,o){const h=hold(invoke(m.method,ptr(0),itemArgs([o])));try{return api.object_unbox(target(h)).readFloat();}finally{freeHandle(h);}}

 function buddyClearPending(){const r=buddyState.pending;if(!r)return;freeHandle(r.rpc);freeHandle(r.promise);buddyState.pending=null;}

 function buddyTick(now){const t=p.buddy,r=buddyState;if(!t)return;

  if(s.stopping){buddyClearPending();freeHandle(r.service);r.service=null;return;}

  if(r.pending){const q=r.pending;if(q.result!==null){const ok=q.result===t.success;buddyClearPending();r.next=now+5000;getItemState().next=0;if(!ok){r.blocked=true;buddyStatus('Buddy feed failed (result '+q.result+'); toggle Off to retry');}else{r.feeds++;r.progress={before:q.fullness,deadline:now+15000};buddyStatus('Berry fed; checking buddy hunger');}return;}

   if(now>q.deadline&&!r.blocked){r.blocked=true;buddyStatus('Buddy feed timed out; no automatic retry');}return;}

  if(r.config!==s.buddyBerry){r.config=s.buddyBerry;r.blocked=false;r.feeds=0;r.progress=null;r.next=0;}

  if(!s.buddyBerry){buddyStatus('Off');return;}if(!(now<s.buddyLease)){buddyStatus('Waiting for the map');return;}if(now<r.next)return;r.next=now+5000;

  const roots=[];const root=o=>{roots.push(hold(o));return o;};

  try{const l=p.items.lookup,m=t.methods,f=t.fields;

   if(!r.service||!alive(target(r.service))){freeHandle(r.service);r.service=null;const map=invoke(l.find.method,ptr(0),itemArgs([l.typeObject(api.class_get_type(l.map))]));if(map.isNull())return;root(map);const container=root(invoke(l.container.method,map));const service=invoke(l.resolve.method,container,itemArgs([l.typeObject(api.class_get_type(t.contract))]));if(!exact(service,classes[BUDDY_TYPES[7769]]))throw Error('buddy-stats-service');r.service=hold(service);event(s,'buddy-service-ready');}

   const service=target(r.service),pokemon=readPtr(service,f.pokemon),rpc=readPtr(service,f.rpc);if(!exact(pokemon,classes[BUDDY_TYPES[8109]])||!exact(rpc,classes[BUDDY_TYPES[7768]]))throw Error('buddy-service-type');

   if(!rocketBool(m.has,pokemon)){buddyStatus('Choose a buddy first');return;}

   const proto=root(invoke(m.pokemon.method,pokemon));if(!exact(proto,classes['Holoholo.Rpc.BuddyPokemonProto']))return;const key=capturedKey(proto,f.buddyId);if(!key||key==='0,0,0,0,0,0,0,0')return;

   if(key!==r.id){r.id=key;r.feeds=0;r.progress=null;r.blocked=false;}

   const stats=root(invoke(m.stats.method,service));if(!exact(stats,classes['Holoholo.Rpc.BuddyObservedData'])){buddyStatus('Waiting for buddy hunger data');return;}

   const remaining=buddyFloat(m.remaining,stats),fullness=buddyFloat(m.fullness,stats);if(!Number.isFinite(remaining)||!Number.isFinite(fullness))throw Error('buddy-hunger-invalid');

   if(remaining>0){r.feeds=0;r.progress=null;r.blocked=false;buddyStatus('Buddy fed - '+Math.ceil(remaining/60)+' min remaining');return;}

   // A paused request must still observe a later fed state and re-arm for the next hunger cycle.
   if(r.blocked)return;
   if(r.progress){if(fullness>r.progress.before+0.001)r.progress=null;else if(now<r.progress.deadline)return;else{r.blocked=true;buddyStatus('Hunger did not update; toggle Off to retry');return;}}

   if(rocketBool(m.cooldown,ptr(0),itemArgs([stats]))||fullness>=0.999){buddyStatus('Waiting for buddy feeding cooldown');return;}

   if(r.feeds>=6){r.blocked=true;buddyStatus('Feeding paused after six berries; check your buddy');return;}

   const bag=readPtr(rpc,f.bag);if(!exact(bag,classes[IBAG]))throw Error('buddy-item-bag');const count=itemInt(p.items.methods.quantity,bag,itemArgs([itemNumber(s.buddyBerry)]));if(count<1){buddyStatus('Selected berry is out of stock');return;}

   const q={rpc:hold(rpc),promise:null,result:null,fullness,deadline:now+30000};r.pending=q;

   buddyStatus('Feeding buddy');let promise;buddyState.invoking=true;try{promise=invoke(m.feed.method,rpc,itemArgs([itemNumber(s.buddyBerry),itemNumber(1)]));}finally{buddyState.invoking=false;}if(!promise.isNull())q.promise=hold(promise);event(s,'buddy-feed-request',{berry:s.buddyBerry,count:1});

  }catch(e){r.blocked=true;buddyStatus('Buddy feeding paused: '+String(e));event(s,'buddy-error',{reason:String(e)});}finally{for(const h of roots)freeHandle(h);}

 }

 event(s,'buddy-ready',{available:!!p.buddy,reason:p.buddyError});

 if(p.buddy){const t=p.buddy;s.listeners.push(Interceptor.attach(t.methods.result.address,{onEnter(a){this.q=null;try{const q=buddyState.pending;if(!unity(this.threadId)||!q||q.ambiguous||!exact(a[0],t.callback)||!readPtr(a[0],t.fields.callbackRpc).equals(target(q.rpc))||!exact(a[1],classes['Holoholo.Rpc.BuddyFeedingOutProto']))return;this.q=q;this.result=readS32(a[1],t.fields.result);}catch(_){}},onLeave(){if(this.q&&buddyState.pending===this.q)this.q.result=this.result;}}));

  s.listeners.push(Interceptor.attach(t.methods.feed.address,{onEnter(){if(unity(this.threadId)&&!buddyState.invoking){if(buddyState.pending){buddyState.pending.ambiguous=true;buddyState.blocked=true;}buddyState.next=s.now()+30000;buddyState.feeds=0;buddyState.progress=null;}}}));

 }


 return {state:buddyState,tick:buddyTick};
 };
})(globalThis);
