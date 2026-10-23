// Pure preference/lease policy shared by the bridge and its tests.
(function(root){
function setBerryOptions(s,value,allowed,leaseMs){if(!s||!s.ready||s.stopping)return false;
 const raw=typeof value==='number'?(value===0?'':String(value)):value;
 let ids=[];
 if(typeof raw==='string'&&raw.length<=11&&raw!==''){
  const parts=raw.split(',');if(parts.length<=3&&parts.every(x=>/^(701|703|705|706|707)$/.test(x))&&new Set(parts).size===parts.length)ids=parts.map(Number);
 }
 s.berryIds=ids;s.berryId=ids[0]||0;s.berryLease=allowed===true&&ids.length?s.now()+leaseMs:0;return s.berryId>0;}

root.PGRazorBerryPolicy={set:setBerryOptions};
})(globalThis);
