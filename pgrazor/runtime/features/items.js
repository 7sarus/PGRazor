// Native feature instance; validated metadata and shared helpers are injected.
(function(root){
 const features=root.PGRazorFeatures||(root.PGRazorFeatures={});
 features.items=function({s,p,freeHandle,api,invoke,ptr,itemArgs,hold,exact,classes,ISERVICE,Memory,event,target,readPtr,IBAG,itemNumber,itemInt,readS32,Interceptor,unity,text,typeName,IRESPONSE}){
 const itemState={service:null,next:0,pending:null,blocked:new Set(),config:null,rows:new Map(),invoking:false,filters:null,stage:''};

 function itemPermitted(){return !s.stopping&&s.now()<s.itemLease;}

 function itemTick(now){const t=p.items;if(!t)return;

  if(s.stopping){if(itemState.service)freeHandle(itemState.service);itemState.service=null;if(itemState.filters)for(const h of itemState.filters)if(h)freeHandle(h);itemState.filters=null;return;}

  if(!itemPermitted()||now<itemState.next)return;itemState.next=now+3000;

  if((!itemState.service||!itemState.filters)&&t.lookup){const l=t.lookup,roots=[];try{const mapType=l.typeObject(api.class_get_type(l.map)),map=invoke(l.find.method,ptr(0),itemArgs([mapType]));if(map.isNull())return;roots.push(hold(map));const container=invoke(l.container.method,map);if(container.isNull())return;roots.push(hold(container));const type=l.typeObject(api.class_get_type(l.contract)),service=invoke(l.resolve.method,container,itemArgs([type]));if(exact(service,classes[ISERVICE])){if(itemState.service)freeHandle(itemState.service);itemState.service=hold(service);

    if(!itemState.filters){const guiType=l.typeObject(api.class_get_type(l.guiContract)),gui=invoke(l.resolve.method,container,itemArgs([guiType]));if(!exact(gui,l.gui))throw Error('item-gui-target');roots.push(hold(gui));l.initClass(l.singleton);const slot=Memory.alloc(8);slot.writePointer(ptr(0));api.field_static_get_value(l.instance,slot);const singleton=slot.readPointer();if(!exact(singleton,l.singleton))throw Error('item-filter-target');roots.push(hold(singleton));const fnType=l.typeObject(l.funcType);roots.push(hold(fnType));const delegates=[];

     for(const [m,k,o]of [[l.usable.method,l.gui,gui],[l.show.method,l.singleton,singleton]]){const reflection=l.reflect(m,k);roots.push(hold(reflection));const fn=invoke(l.createDelegate.method,ptr(0),itemArgs([fnType,o,reflection]));const h=hold(fn);roots.push(h);delegates.push(h);}

     itemState.filters=[delegates[0],delegates[1],null];for(const h of delegates)roots.splice(roots.indexOf(h),1);

    }event(s,'item-bag-ready',{source:'map-container'});}}catch(e){event(s,'item-lookup-error',{reason:String(e)});itemState.next=now+15000;}finally{for(const h of roots)freeHandle(h);}}

  if(!itemState.service||!itemState.filters)return;

  const config=s.itemConfig+':'+s.itemEnabled;if(itemState.config!==config){itemState.config=config;itemState.blocked.clear();}

  const pending=itemState.pending;

  if(pending){if(now>pending.deadline){itemState.blocked.add(pending.id);itemState.pending=null;event(s,'item-transfer-error',{id:pending.id,reason:'Timed out; item paused until settings change'});}else return;}

  const owned=[];const root=o=>{const h=hold(o);owned.push(h);return target(h);};

  try{const service=target(itemState.service),bag=readPtr(service,t.fields.bag);if(!exact(bag,classes[IBAG]))return;

   const filters=itemState.filters?itemState.filters.map(h=>h?target(h):ptr(0)):[ptr(0),ptr(0),ptr(0)];itemState.stage='list';const args=itemArgs([filters[0],itemNumber(0),filters[1],filters[2],ptr(0)]),list=root((()=>{itemState.invoking=true;try{return invoke(t.methods.list.method,service,args);}finally{itemState.invoking=false;}})()),count=itemInt(t.methods.count,list);if(count<0||count>2048)throw Error('item-list-count');let candidate=null;

   for(const row of itemState.rows.values())row.count=0;

   for(let i=0;i<count;i++){itemState.stage='row '+i+'/'+count;const data=root(invoke(t.methods.get.method,list,itemArgs([itemNumber(i)])));if(!exact(data,t.dk))throw Error('item-data-type');const id=readS32(data,t.fields.id),quantity=readS32(data,t.fields.count);const b=Memory.alloc(1);api.field_get_value(data,t.fields.recyclable,b);if(b.readU8()!==1||id<=0||quantity<0||quantity>100000)continue;

    itemState.rows.set(id,{id,name:t.names[id]||('Item '+id),count:quantity});const cap=s.itemRules[id];if(!candidate&&s.itemEnabled&&Number.isInteger(cap)&&quantity>cap&&!itemState.blocked.has(id))candidate={id,cap,data};

   }

   event(s,'item-catalog',{rows:Array.from(itemState.rows.values()).map(r=>r.id+'|'+r.name+'|'+r.count).join('\n')});

   if(!candidate||!s.itemEnabled){itemState.vgpCleanupUntil=0;return;}if(!itemPermitted())return;

   const {id,cap,data}=candidate,current=itemInt(t.methods.quantity,bag,itemArgs([itemNumber(id)]));if(current<=cap||current>100000)return;

   const expiry=root(invoke(t.methods.expiring.method,service));

   itemState.pending={id,amount:current-cap,epoch:s.itemEpoch,bag:bag.toString(),deadline:now+15000};itemState.invoking=true;

   try{invoke(t.methods.recycle.method,bag,itemArgs([data,itemNumber(current-cap),expiry]));event(s,'item-transfer-requested',{id,amount:current-cap,keep:cap});}finally{itemState.invoking=false;}

  }catch(e){if(itemState.pending){itemState.blocked.add(itemState.pending.id);itemState.pending=null;}event(s,'item-transfer-error',{reason:String(e),stage:itemState.stage});itemState.next=now+15000;}finally{for(const h of owned)freeHandle(h);}

 }

 if(p.items){const t=p.items;

  function capture(o,tid){if(s.stopping||api.thread_current().isNull()||!exact(o,classes[ISERVICE]))return;if(itemState.service&&target(itemState.service).equals(o))return;if(itemState.service)freeHandle(itemState.service);itemState.service=hold(o);itemState.next=0;event(s,'item-bag-ready');}

  s.listeners.push(Interceptor.attach(t.methods.init.address,{onEnter(args){this.o=args[0];},onLeave(){try{capture(this.o,this.threadId);}catch(_){}}}));

  s.listeners.push(Interceptor.attach(t.methods.list.address,{onEnter(args){try{capture(args[0],this.threadId);if(!itemState.invoking&&unity(this.threadId)){if(itemState.filters)for(const h of itemState.filters)if(h)freeHandle(h);itemState.filters=[1,3,4].map(i=>args[i].isNull()?null:hold(args[i]));event(s,'item-list-arguments',{nulls:[1,3,4,5].map(i=>args[i].isNull()),predicates:[1,3].map(i=>{if(args[i].isNull())return null;const m=readPtr(args[i],t.fields.delegateMethod),o=readPtr(args[i],t.fields.delegateTarget);return {method:text(api.method_get_name(m)),owner:typeName(api,api.class_get_type(api.method_get_class(m))),target:o.isNull()?null:typeName(api,api.class_get_type(api.object_get_class(o)))};})});}}catch(_){}}}));

  s.listeners.push(Interceptor.attach(t.methods.recycle.address,{onEnter(){if(!itemState.invoking&&unity(this.threadId)){if(itemState.pending)itemState.blocked.add(itemState.pending.id);itemState.pending=null;itemState.next=s.now()+15000;}}}));

  function matched(o){const q=itemState.pending;if(!q||!exact(o,t.cb))return null;const bag=readPtr(o,t.fields.callbackBag);if(bag.toString()!==q.bag)return null;const prediction=readPtr(o,t.fields.prediction);if(prediction.isNull())return null;const proto=invoke(t.fields.proto.method,prediction);if(proto.isNull()||readS32(proto,t.fields.protoId)!==q.id)return null;return q;}

  for(const kind of ['result','error'])s.listeners.push(Interceptor.attach(t.methods[kind].address,{onEnter(args){try{if(!unity(this.threadId))return;this.q=matched(args[0]);if(this.q)this.ok=kind==='result'&&exact(args[1],classes[IRESPONSE])&&readS32(args[1],t.fields.status)===t.success;}catch(_){}},onLeave(){if(!this.q||this.q!==itemState.pending)return;itemState.pending=null;itemState.next=s.now()+1000;if(!this.ok)itemState.blocked.add(this.q.id);event(s,this.ok?'item-transfer-confirmed':'item-transfer-error',{id:this.q.id,amount:this.q.amount,reason:this.ok?'':'Game rejected recycling; item paused until settings change'});}}));

 }


 return {itemState,itemTick};
 };
})(globalThis);
