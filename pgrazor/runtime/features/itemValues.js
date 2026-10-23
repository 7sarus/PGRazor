// Shared native argument and boxed-integer helpers.
(function(root){
 const features=root.PGRazorFeatures||(root.PGRazorFeatures={});
 features.itemValues=function({hold,invoke,target,exact,classes,INT,api,freeHandle,Memory}){
 function itemInt(m,o,args){const h=hold(invoke(m.method,o,args));try{const b=target(h);if(!exact(b,classes[INT]))throw Error('item-count-type');return api.object_unbox(b).readS32();}finally{freeHandle(h);}}

 function itemArgs(values){const args=Memory.alloc(values.length*8);args.keepAlive=values;values.forEach((v,i)=>args.add(i*8).writePointer(v));return args;}

 function itemNumber(n){const out=Memory.alloc(4);out.writeS32(n);return out;}


 return {itemInt,itemArgs,itemNumber};
 };
})(globalThis);
