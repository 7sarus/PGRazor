// Native feature instance; validated metadata and shared helpers are injected.
(function(root){
 const features=root.PGRazorFeatures||(root.PGRazorFeatures={});
 features.rocketMinigame=function({Memory,invoke,p,target,alive,event,s,freeHandle,rocketState,exact,classes,RMINI,present,readPtr,hold,api,rocketBool}){
 let rocketMini=null;

 function miniSet(m,o,values){const data=Memory.alloc(Math.max(4,values.length*4));if(values.length===1)data.writeU8(values[0]?1:0);else values.forEach((v,i)=>data.add(i*4).writeFloat(v));const args=Memory.alloc(8);args.writePointer(data);invoke(m.method,o,args);}

 function rocketMiniRestore(){const r=rocketMini;if(!r)return;rocketMini=null;try{const m=p.rocket.mini.methods,transform=target(r.transform),go=target(r.go);if(alive(transform))miniSet(m.setScale,transform,r.scale);if(alive(go))miniSet(m.setActive,go,[r.active]);}catch(e){event(s,'rocket-minigame-error',{reason:String(e)});}finally{for(const h of [r.challenge,r.transform,r.go])freeHandle(h);}}

 function rocketMiniAllowed(){return !!(p.rocket&&p.rocket.mini&&rocketState.state&&!rocketState.failed&&!s.stopping&&(s.rocketMask&2)&&s.now()<s.rocketLease);}

 function rocketMiniTick(now){if(rocketMini&&(!rocketMiniAllowed()||!alive(target(rocketMini.challenge))))rocketMiniRestore();}

 function rocketMiniCollect(challenge){if(!rocketMiniAllowed())return;const t=p.rocket.mini,m=t.methods;

  if(!exact(challenge,classes[RMINI])||!alive(challenge)||!present(challenge,t.fields.running,1))return;

  if(rocketMini&&!target(rocketMini.challenge).equals(challenge))rocketMiniRestore();

  if(!rocketMini){const collider=readPtr(challenge,t.fields.collider);if(collider.isNull()||!alive(collider))return;

   const hs=[];try{const ch=hold(challenge);hs.push(ch);const th=hold(invoke(m.transform.method,collider));hs.push(th);const gh=hold(invoke(m.gameObject.method,collider));hs.push(gh);const sh=hold(invoke(m.scale.method,target(th)));hs.push(sh);

    const value=api.object_unbox(target(sh)),scale=[0,4,8].map(o=>value.add(o).readFloat());if(!scale.every(v=>Number.isFinite(v)&&Math.abs(v)<10000))throw Error('minigame-scale');const active=rocketBool(m.active,target(gh));

    rocketMini={challenge:ch,transform:th,go:gh,scale,active};freeHandle(sh);event(s,'rocket-minigame',{active:true,mode:'particle-collector'});

   }catch(e){for(const h of hs)freeHandle(h);throw e;}

  }

  miniSet(m.setScale,target(rocketMini.transform),rocketMini.scale.map(v=>Math.max(Math.abs(v),1)*1000));miniSet(m.setActive,target(rocketMini.go),[true]);

 }


 return {get rocketMini(){return rocketMini;},rocketMiniRestore,rocketMiniAllowed,rocketMiniTick,rocketMiniCollect};
 };
})(globalThis);
