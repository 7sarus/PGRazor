// Inspect the validated native promise fields without retaining ownership.
(function(root){
 const features=root.PGRazorFeatures||(root.PGRazorFeatures={});
 features.nativePromise=function({api,p,Memory,present,readPtr}){
 function vgpField(o,name){let k=api.object_get_class(o);for(let i=0;i<16&&!k.isNull();i++,k=p.vgp.parent(k)){const f=api.class_get_field_from_name(k,Memory.allocUtf8String(name));if(!f.isNull()){const off=Number(api.field_get_offset(f));if(off<16||off>512)throw Error('vgp-field:'+name);return f;}}return null;}
 function vgpPromise(o){const complete=vgpField(o,'completeCalled'),error=vgpField(o,'errorCalled'),value=vgpField(o,'completedValue'),status=vgpField(o,'statusErrorCalled');if(!complete||!error||!value)throw Error('vgp-promise-shape');if(present(o,error,1)||(status&&present(o,status,1)))return {error:true};return present(o,complete,1)?{value:readPtr(o,value)}:null;}

 return {read:vgpPromise,field:vgpField};
 };
})(globalThis);
