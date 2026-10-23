// Native feature instance; validated metadata and shared helpers are injected.
(function(root){
 const features=root.PGRazorFeatures||(root.PGRazorFeatures={});
 features.rocket=function({freeHandle,hold,invoke,target,exact,classes,BOOL,api,event,s,p,ROCKET,alive,readS32,fields,STATE_OPEN,readPtr,RDIR,typeName,RCHARGE,present,Memory,RMINI,RVGEST,Interceptor,unity,RVUI,RVCHARGE,RUI,RSHIELD}){
 const rocketState={state:null,ui:null,vui:null,charges:[],shield:null,shieldUsed:false,next:0,failed:false,gate:null,lastFast:0};

 function rocketDrop(key){freeHandle(rocketState[key]);rocketState[key]=null;}

 function rocketClear(){rocketMiniRestore();for(const h of rocketState.charges)freeHandle(h);rocketState.charges=[];for(const k of ['state','ui','vui','shield'])rocketDrop(k);rocketState.shieldUsed=false;rocketState.failed=false;rocketState.next=0;rocketState.gate=null;rocketState.lastFast=0;}

 function rocketBool(m,o,args){const h=hold(invoke(m.method,o,args));try{const b=target(h);if(!exact(b,classes[BOOL]))throw Error('rocket-bool');return api.object_unbox(b).readU8()===1;}finally{freeHandle(h);}}

 function rocketGate(reason){if(rocketState.gate!==reason){rocketState.gate=reason;event(s,'rocket-attack-gate',{reason});}}

 function rocketTick(now){

  if(!p.rocket)return;if(s.stopping){rocketClear();return;}

  const r=rocketState,t=p.rocket,m=t.methods,f=t.fields;

  if(r.failed||!r.state||!(s.rocketMask>0)||!(now<s.rocketLease)||now<r.next)return;

  try{

   if(!exact(target(r.state),classes[ROCKET])){rocketClear();return;}

   if(r.shield){const gui=target(r.shield);if(!alive(gui)||readS32(gui,fields.currentState)===3){rocketDrop('shield');}

    else if((s.rocketMask&4)&&!r.shieldUsed&&readS32(gui,fields.currentState)===STATE_OPEN&&readS32(gui,f.shields)>0){

     const button=readPtr(gui,f.button);if(!button.isNull()&&alive(button)&&rocketBool(m.interactable,button)){r.shieldUsed=true;r.next=now+250;invoke(m.shield.method,gui);event(s,'rocket-action',{action:'shield'});return;}

    }

   }

   if(r.vui&&t.vnext){rocketVNextTick(now);return;}

   if(!r.ui){rocketGate('waiting-for-battle-ui');return;}const gui=target(r.ui);if(!alive(gui)){rocketDrop('ui');return;}

   // CombatUI uses its own ShowUI/HideUI lifecycle. GuiController open state is not an attack-availability contract.

   const dh=hold(invoke(m.director.method,gui));try{const dir=target(dh);if(!exact(dir,classes[RDIR])){rocketGate('director:'+typeName(api,api.class_get_type(api.object_get_class(dir))));return;}if(!rocketBool(m.active,dir)){rocketGate('battle-not-active');return;}rocketGate('active');

    if(s.rocketMask&2){for(const field of [f.first,f.second]){const charge=readPtr(gui,field);if(!exact(charge,classes[RCHARGE])||!alive(charge))continue;

     if(present(charge,f.charged,1)&&present(charge,f.input,1)&&rocketBool(m.visible,charge)){r.next=now+500;invoke(m.charge.method,charge);event(s,'rocket-action',{action:'charged'});return;}

    }}

    if(s.rocketMask&1){r.next=now+150;const result=invoke(m.fast.method,dir);if(now-r.lastFast>5000){r.lastFast=now;event(s,'rocket-action',{action:'quick',accepted:!result.isNull()});}}

   }finally{freeHandle(dh);}

  }catch(e){r.failed=true;event(s,'rocket-error',{reason:String(e)});}

 }

 // Collect actual spawned targets using the normal particle-trigger path; never write score or shorten the timer.

 const rocketMiniModule=PGRazorFeatures.rocketMinigame({Memory,invoke,p,target,alive,event,s,freeHandle,rocketState,exact,classes,RMINI,present,readPtr,hold,api,rocketBool});
 const {rocketMiniRestore,rocketMiniAllowed,rocketMiniTick,rocketMiniCollect}=rocketMiniModule;

 function rocketVNextTick(now){const r=rocketState,t=p.rocket.vnext,m=t.methods,f=t.fields,gui=target(r.vui);

  if(!alive(gui)){rocketDrop('vui');return;}

  if(rocketBool(m.blocked,gui)){rocketGate('vnext-input-blocked');return;}

  if(s.rocketMask&2){for(const h of r.charges){const c=target(h);if(!alive(c)||!rocketBool(m.charged,c)||!rocketBool(m.visible,c))continue;

   const button=readPtr(c,f.button);if(button.isNull()||!alive(button)||!rocketBool(p.rocket.methods.interactable,button))continue;

   r.next=now+600;invoke(m.charge.method,c);event(s,'rocket-action',{action:'charged',path:'vnext'});return;

  }}

  const gesture=readPtr(gui,f.gesture);if(!exact(gesture,classes[RVGEST])||!alive(gesture)||!present(gesture,f.enabled,1)){rocketGate('vnext-fast-input-disabled');return;}

  rocketGate('vnext-active');if(s.rocketMask&1){const tap=readPtr(gesture,f.tap);if(tap.isNull())return;const args=Memory.alloc(8);args.writePointer(tap);r.next=now+150;invoke(m.fast.method,gesture,args);if(now-r.lastFast>5000){r.lastFast=now;event(s,'rocket-action',{action:'quick',path:'vnext'});}}

 }

 if(p.rocket){const m=p.rocket.methods;

  function observe(method,enter,leave){s.listeners.push(Interceptor.attach(method.address,{onEnter(args){if(!unity(this.threadId)||s.stopping)return;try{this.rocketCall=enter.call(this,args);}catch(e){rocketState.failed=true;event(s,'rocket-error',{reason:String(e)});}},onLeave(){if(this.rocketCall&&leave)try{leave.call(this);}catch(e){rocketState.failed=true;event(s,'rocket-error',{reason:String(e)});}}}));}

  if(p.rocket.mini){const mm=p.rocket.mini.methods;

   observe(mm.update,function(a){if(!rocketMiniAllowed()){rocketMiniRestore();return;}if(!exact(a[0],classes[RMINI]))return;this.miniChallenge=hold(a[0]);return true;},function(){try{rocketMiniCollect(target(this.miniChallenge));}finally{freeHandle(this.miniChallenge);}});

   for(const method of [mm.exit,mm.hide,mm.destroy])observe(method,function(a){if(rocketMiniModule.rocketMini&&target(rocketMiniModule.rocketMini.challenge).equals(a[0]))rocketMiniRestore();});

  }

  if(p.rocket.vnext){const vm=p.rocket.vnext.methods;

   observe(vm.update,function(a){if(!rocketState.state||!exact(a[0],classes[RVUI]))return;if(!rocketState.vui||!target(rocketState.vui).equals(a[0])){rocketDrop('vui');rocketState.vui=hold(a[0]);event(s,'rocket-ui',{source:'vnext-update'});}});

   observe(vm.close,function(a){if(rocketState.vui&&target(rocketState.vui).equals(a[0])){rocketDrop('vui');for(const h of rocketState.charges)freeHandle(h);rocketState.charges=[];}});

   observe(vm.observe,function(a){if(!rocketState.state||!exact(a[0],classes[RVCHARGE]))return;const list=rocketState.charges;for(let i=list.length-1;i>=0;i--)if(!alive(target(list[i]))){freeHandle(list[i]);list.splice(i,1);}if(!list.some(h=>target(h).equals(a[0]))&&list.length<4)list.push(hold(a[0]));});

  }

  observe(m.enter,function(a){rocketClear();if(exact(a[0],classes[ROCKET])){rocketState.state=hold(a[0]);return true;}},function(){event(s,'rocket-scope',{active:true});});

  observe(m.exit,function(a){if(rocketState.state&&target(rocketState.state).equals(a[0])){rocketClear();event(s,'rocket-scope',{active:false});}});

  observe(m.ui,function(a){if(rocketState.state&&exact(a[0],classes[RUI])){rocketDrop('ui');this.rocketUi=hold(a[0]);return true;}},function(){rocketDrop('ui');rocketState.ui=this.rocketUi;});

  observe(m.update,function(a){if(!rocketState.state||!exact(a[0],classes[RUI]))return;if(!rocketState.ui||!target(rocketState.ui).equals(a[0])){rocketDrop('ui');rocketState.ui=hold(a[0]);event(s,'rocket-ui',{source:'live-update'});}});

  observe(m.close,function(a){if(rocketState.ui&&target(rocketState.ui).equals(a[0]))rocketDrop('ui');});

  observe(m.prompt,function(a){if(!rocketState.state||!exact(a[0],classes[RSHIELD]))return;rocketDrop('shield');rocketState.shieldUsed=false;if(a[1].toInt32()!==0)rocketState.shield=hold(a[0]);});

  observe(m.shield,function(a){if(rocketState.shield&&target(rocketState.shield).equals(a[0]))rocketState.shieldUsed=true;});

  observe(m.shieldClose,function(a){if(rocketState.shield&&target(rocketState.shield).equals(a[0]))rocketDrop('shield');});

 }



 return {rocketState,rocketBool,rocketTick,rocketMiniTick};
 };
})(globalThis);
