// Native feature instance; dependencies and metadata are supplied by quick-close.
(function(root){
 const features=root.PGRazorFeatures||(root.PGRazorFeatures={});
 features.berries=function({s,p,api,classes,fields,BERRY,IBAG,STATE_OPEN,hold,target,freeHandle,alive,exact,readPtr,readS32,rocketBool,itemInt,itemArgs,itemNumber,invoke,event,unity,ptr,Memory,Process,NativeFunction,NativeCallback,Interceptor,getItemState}){
 const berryState={scope:null,pending:null,failed:false,pulse:0};

 function berryOverlay(active,busy=false){event(s,'encounter-berry',{active,busy});}

 function berryReleasePending(){const q=berryState.pending;if(!q)return;berryState.pending=null;freeHandle(q.ball);freeHandle(q.callback);}

 function berryClear(){berryReleasePending();freeHandle(berryState.scope);Object.assign(berryState,{scope:null,pending:null,failed:false,pulse:0});berryOverlay(false);}

 function berryResume(){const q=berryState.pending;if(!q)return;berryState.pending=null;

  try{const ball=target(q.ball);if(alive(ball)&&berryState.scope){s.berrySubmitOriginal(ball,q.first,q.second,q.info);}}

  finally{freeHandle(q.ball);freeHandle(q.callback);berryOverlay(!!berryState.scope);}

 }

 function berryTick(now){const t=p.berries,r=berryState;if(!t)return;if(s.berryImpactReady&&s.installBerryImpact&&!s.stopping){const install=s.installBerryImpact;s.installBerryImpact=null;install();event(s,'berry-impact-ready');}

  if(s.stopping){berryResume();berryClear();return;}if(!r.scope)return;

  const scope=target(r.scope);if(!alive(scope)){berryClear();return;}

  if(now>=r.pulse){r.pulse=now+500;const ui=readPtr(scope,t.fields.ui);berryOverlay(!ui.isNull()&&alive(ui)&&readS32(ui,fields.currentState)===STATE_OPEN,!!r.pending);}

  const q=r.pending;if(!q)return;

  if(q.done){getItemState().next=0;berryResume();return;}

  if(now>q.deadline){r.failed=true;event(s,'berry-error',{reason:'Berry response timed out; submitting catch without retry'});berryResume();return;}

  if(q.started)return;

  if(!(now<s.berryLease)){berryResume();return;}

  try{q.stage='ball checks';const ball=target(q.ball);if(!alive(ball)||rocketBool(t.methods.bread,ball)){berryResume();return;}

   q.stage='encounter checks';if(!rocketBool(t.methods.can,scope)||rocketBool(t.methods.photo,scope)){berryResume();return;}

   q.stage='ball type';const typeRoot=hold(invoke(t.methods.ballType.method,ball));let ballType;try{ballType=api.object_unbox(target(typeRoot)).readS32();}finally{freeHandle(typeRoot);}if(ballType===4){berryResume();return;}

   q.stage='inventory';const bag=readPtr(scope,t.fields.bag);if(!exact(bag,classes[IBAG])){berryResume();return;}
   q.id=0;for(const id of q.priorities){if(itemInt(p.items.methods.quantity,bag,itemArgs([itemNumber(id)]))>0){q.id=id;break;}}
   if(!q.id){berryResume();return;}

   q.stage='create callback';const callback=api.object_new(t.callback);q.callback=hold(callback);api.field_set_value_object(callback,t.fields.callbackScope,scope);api.field_set_value(callback,t.fields.callbackBerry,itemNumber(q.id));if(!readPtr(callback,t.fields.callbackScope).equals(scope)||readS32(callback,t.fields.callbackBerry)!==q.id)throw Error('berry-callback-field-readback');

   q.stage='request';q.started=true;invoke(t.methods.direct.method,callback,itemArgs([itemNumber(1)]));event(s,'berry-feed-requested',{id:q.id,source:'impact'});

  }catch(e){r.failed=true;event(s,'berry-error',{reason:String(e),stage:q.stage});berryResume();}

 }

 event(s,'berry-ready',{available:!!p.berries,reason:p.berriesError});

 if(p.berries){const t=p.berries;

  s.listeners.push(Interceptor.attach(t.methods.enter.address,{onEnter(a){if(!unity(this.threadId)||s.stopping)return;berryClear();if(exact(a[0],classes[BERRY])){berryState.scope=hold(a[0]);berryOverlay(true);}}}));

  s.listeners.push(Interceptor.attach(t.methods.exit.address,{onEnter(a){if(unity(this.threadId)&&berryState.scope&&target(berryState.scope).equals(a[0])){berryClear();event(s,'cooldown-encounter',{source:''});}}}));

  s.installBerryImpact=()=>{

  // PokeballThrow is a 12-byte non-HFA value: x1 carries its first8 bytes,

  // x2 carries the remaining4. Keep the exact packed words, including throw modifiers.

  const submit=new NativeFunction(t.methods.submit.address,'void',['pointer','pointer','pointer','pointer'],{scheduling:'exclusive',exceptions:'propagate'}),peek=new NativeFunction(t.methods.peek.address,'pointer',['pointer','pointer'],{scheduling:'exclusive',exceptions:'propagate'});

  s.berrySubmitOriginal=submit;

  const replacement=new NativeCallback(function(ball,first,second,info){const r=berryState;
   if(unity(Process.getCurrentThreadId())&&!s.stopping&&!r.pending)event(s,'cooldown-action',{action:((second.toUInt32()>>>16)&255)!==0?'Ball drop':'Ball throw'});

   if(!unity(Process.getCurrentThreadId())||s.stopping||!r.scope||r.failed||!s.berryId||!(s.now()<s.berryLease))return submit(ball,first,second,info);

   if(r.pending){if(target(r.pending.ball).equals(ball))return;return submit(ball,first,second,info);}

   try{if(!exact(ball,classes['Niantic.Holoholo.Encounter.Pokeball'])||((second.toUInt32()>>>16)&255)!==0||first.toUInt32()===4)return submit(ball,first,second,info);

    r.pending={ball:hold(ball),callback:null,first,second,info,id:s.berryId,priorities:(s.berryIds||[s.berryId]).slice(),started:false,done:false,deadline:s.now()+8000};berryOverlay(true,true);event(s,'berry-impact-queued',{id:s.berryId});

   }catch(e){event(s,'berry-error',{reason:String(e),stage:'impact'});return submit(ball,first,second,info);}

  },'void',['pointer','pointer','pointer','pointer']);

  // The normal result getter returns null while its catch promise is pending.

  // Preserve that behavior while berry use delays creation of the new promise;

  // otherwise a prior throw's completed promise could be observed again.

  const peekReplacement=new NativeCallback(function(ball,info){const q=berryState.pending;if(q&&target(q.ball).equals(ball))return ptr(0);return peek(ball,info);},'pointer',['pointer','pointer']);

  Interceptor.replace(t.methods.submit.address,replacement);s.listeners.push({detach(){Interceptor.revert(t.methods.submit.address);}});

  Interceptor.replace(t.methods.peek.address,peekReplacement);s.listeners.push({detach(){Interceptor.revert(t.methods.peek.address);}});s.berryThrowCallbacks={replacement,peekReplacement};

  };

  for(const name of ['result','error'])s.listeners.push(Interceptor.attach(t.methods[name].address,{onEnter(a){if(name==='result'&&unity(this.threadId)&&!a[1].isNull()&&a[1].add(0x10).readS32()===0)event(s,'cooldown-action',{action:'Berry feeding'});const q=berryState.pending;this.q=q&&q.callback&&target(q.callback).equals(a[0])?q:null;},onLeave(){if(this.q&&berryState.pending===this.q)this.q.done=true;}}));

 }


 return {state:berryState,tick:berryTick};
 };
})(globalThis);
