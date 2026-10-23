// Native feature instance; dependencies and metadata are supplied by quick-close.
(function(root){
 const features=root.PGRazorFeatures||(root.PGRazorFeatures={});
 features.spawn=function({s,p,event,NativeFunction,NativeCallback,Interceptor}){
 // SPAWN replacement: preserve the original double ABI and all game settings when disabled.

 if(p.spawn){try{

  const address=p.spawn.address;

  const original=new NativeFunction(address,'double',['pointer','pointer'],{scheduling:'exclusive',exceptions:'propagate'});

  const replacement=new NativeCallback(function(self,info){

   const radius=original(self,info);

   try{const now=s.now();if(s.active&&s.ready&&!s.stopping&&s.spawnEnabled&&now<s.spawnLease&&Number.isFinite(radius)&&radius>0){

    const effective=Math.max(radius,80);

    if(!s.spawnSampleAt||now-s.spawnSampleAt>=2000){s.spawnSampleAt=now;event(s,'spawn-range',{original:radius,effective});}

    return effective;

   }}catch(_){}

   return radius;

  },'double',['pointer','pointer']);

  Interceptor.replace(address,replacement);

  s.listeners.push({detach(){Interceptor.revert(address);}});

  s.spawnReplacement={original,replacement};



 }catch(e){p.spawn=null;p.spawnError=String(e);}}

 event(s,'spawn-ready',{available:!!p.spawn,reason:p.spawnError});


 return {};
 };
})(globalThis);
